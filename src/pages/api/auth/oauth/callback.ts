import { NextApiRequest, NextApiResponse } from "next";
import { ENV } from "@/config/environment";
import { parse } from "cookie";
import axios from "axios";
import { serializeCookie } from "@/lib/cookie";
import { appConfig } from "@/config/app.config";

/**
 * OAuth Callback Endpoint
 * Handles the callback from OAuth provider and exchanges code for tokens
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const immichBaseUrl = ENV.EXTERNAL_IMMICH_URL || ENV.IMMICH_URL;

  if (!ENV.OAUTH_ENABLED || !immichBaseUrl) {
    return res.status(400).json({ error: "OAuth is not configured" });
  }

  try {
    const { code, state, error, error_description } = req.query;

    const getSingle = (value?: string | string[]) =>
      Array.isArray(value) ? value[0] : value;

    // Check for OAuth provider errors
    if (error) {
      const errorText = getSingle(error_description) || getSingle(error) || "OAuth error";
      console.error("OAuth provider error:", errorText);
      return res.redirect(`/?error=${encodeURIComponent(errorText)}`);
    }

    // Validate required parameters
    const codeValue = getSingle(code);
    const stateValue = getSingle(state);

    if (!codeValue || !stateValue) {
      return res.redirect("/?error=Missing code or state parameter");
    }

    // Get stored state and verifier from cookies
    const cookies = parse(req.headers.cookie || "");
    const storedState = cookies.oauth_state;
    const codeVerifier = cookies.oauth_verifier;

    if (!storedState || !codeVerifier) {
      return res.redirect("/?error=OAuth session expired");
    }

    // Verify state to prevent CSRF attacks
    if (stateValue !== storedState) {
      return res.redirect("/?error=Invalid state parameter");
    }

    // Build the callback URL for Immich with ALL query parameters
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
    const host = req.headers.host || "localhost";
    const baseUrl = ENV.POWER_TOOLS_ENDPOINT_URL || `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback`;

    const queryParams = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => queryParams.append(key, entry));
        return;
      }
      queryParams.append(key, value);
    });
    const callbackUrl = `${redirectUri}?${queryParams.toString()}`;

    // Finish OAuth with Immich
    const immichResponse = await axios.post(
      `${immichBaseUrl}/api/oauth/callback`,
      {
        url: callbackUrl,
        state: stateValue,
        codeVerifier: codeVerifier,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const accessToken = immichResponse.data.accessToken;

    if (!accessToken) {
      throw new Error("No access token received from Immich");
    }

    // Clear OAuth temporary cookies and set session cookie
    res.setHeader("Set-Cookie", [
      // Clear OAuth temporary cookies
      serializeCookie("oauth_state", "", {
        httpOnly: true,
        secure: ENV.SECURE_COOKIE,
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      }),
      serializeCookie("oauth_verifier", "", {
        httpOnly: true,
        secure: ENV.SECURE_COOKIE,
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      }),
      // Set session cookie with Immich access token
      serializeCookie(appConfig.sessionCookieName, accessToken, {
        httpOnly: true,
        secure: ENV.SECURE_COOKIE,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: "/",
      }),
    ]);

    // Redirect to home page
    return res.redirect("/");
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    const errorMessage = error.response?.data?.message || error.message || "Authentication failed";
    return res.redirect(`/?error=${encodeURIComponent(errorMessage)}`);
  }
}
