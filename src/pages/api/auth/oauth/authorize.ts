import { NextApiRequest, NextApiResponse } from "next";
import { ENV } from "@/config/environment";
import crypto from "crypto";
import axios from "axios";
import { serializeCookie } from "@/lib/cookie";

/**
 * OAuth Authorization Endpoint
 * Redirects user to OAuth provider's authorization page with PKCE
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const immichBaseUrl = ENV.EXTERNAL_IMMICH_URL || ENV.IMMICH_URL;

  // Check if OAuth is enabled
  if (!ENV.OAUTH_ENABLED || !immichBaseUrl) {
    return res.status(400).json({ error: "OAuth is not configured" });
  }

  try {
    // Generate PKCE code verifier and challenge
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString("base64url");
    
    // Store state and code verifier in cookies
    res.setHeader("Set-Cookie", [
      serializeCookie("oauth_state", state, {
        httpOnly: true,
        secure: ENV.SECURE_COOKIE,
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
      }),
      serializeCookie("oauth_verifier", codeVerifier, {
        httpOnly: true,
        secure: ENV.SECURE_COOKIE,
        sameSite: "lax",
        maxAge: 600, // 10 minutes
        path: "/",
      }),
    ]);

    // Build the authorization URL
    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
    const host = req.headers.host || "localhost";
    const baseUrl = ENV.POWER_TOOLS_ENDPOINT_URL || `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/auth/oauth/callback`;
    
    // Ask Immich to start OAuth and return the provider URL
    const immichAuthorize = await axios.post(
      `${immichBaseUrl}/api/oauth/authorize`,
      {
        redirectUri,
        state,
        codeChallenge,
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const { url } = immichAuthorize.data || {};
    if (!url) {
      throw new Error("No authorization URL returned from Immich");
    }

    // Redirect to OAuth provider
    res.redirect(302, url);
  } catch (error: any) {
    console.error("OAuth authorization error:", error);
    const errorMessage = error.response?.data?.message || error.message || "Failed to initiate OAuth flow";
    res.redirect(`/?error=${encodeURIComponent(errorMessage)}`);
  }
}
