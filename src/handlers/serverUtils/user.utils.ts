import { appConfig } from "@/config/app.config"
import { connectDB, db } from "@/config/db"
import { ENV } from "@/config/environment"
import { APIError } from "@/lib/api"
import { getCookie } from "@/lib/cookie"
import { NextApiRequest } from "next"


const describeFetchError = (error: any, url: string): string => {
  let current = error;
  while (current?.cause) current = current.cause;
  const code = current?.code as string | undefined;
  switch (code) {
    case 'ENOTFOUND':
      return `Cannot resolve host for ${url}. Check IMMICH_URL — from inside this container, an IP on the host network may not be reachable; prefer the Immich container name (e.g. http://immich_server:2283).`;
    case 'ECONNREFUSED':
      return `Connection refused at ${url}. Check that the Immich server is running and that IMMICH_URL points to its internal port (default 2283).`;
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Cannot reach Immich API at ${url} (${code}). Likely the power-tools container is not on the same network as the Immich server.`;
    default:
      return `Failed to connect to Immich API at ${url}: ${current?.message || error?.message || 'Unknown error'}${code ? ` (${code})` : ''}`;
  }
};

export const getCurrentUserFromAPIKey = () => {
  if (!ENV.IMMICH_URL || !ENV.IMMICH_API_KEY) return null;

  return fetch(ENV.IMMICH_URL + "/api/users/me", {
    headers: {
      'x-api-key': ENV.IMMICH_API_KEY,
      Accept: "application/json",
    },
  }).then((res) => {
    if (res.ok) {
      return res.json().then((user) => {
        return {
          ...user,
          isUsingAPIKey: true,
        }
      })
    }
    throw new APIError({
      message: "Invalid API key. Please check your API key variable `IMMICH_API_KEY` in the .env file",
      status: 403,
    });
  })
  .catch((error) => {
    if (error instanceof APIError) {
      throw error;
    }
    console.error('[immich-api] connect failed:', { url: ENV.IMMICH_URL, message: error?.message, cause: error?.cause });
    throw new APIError({
      message: describeFetchError(error, ENV.IMMICH_URL),
      status: 500,
    });
  })
}

export const getCurrentUserFromAccessToken = (token: string) => {
  return fetch(ENV.IMMICH_URL + "/api/users/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  }).then((res) => {
    if (res.ok) {
      return res.json()
    }
    return null
  }).catch((error) => {
    console.error('[immich-api] connect failed:', { url: ENV.IMMICH_URL, message: error?.message, cause: error?.cause });
    throw new APIError({
      message: describeFetchError(error, ENV.IMMICH_URL),
      status: 500,
    });
  })
}

export const getCurrentUser = async (req: NextApiRequest) => {
  await connectDB(db);
  const session = getCookie(req, appConfig.sessionCookieName)
  
  if (session) {
    const user = await getCurrentUserFromAccessToken(session)
    if (!user) return null
    return {
      ...user,
      accessToken: session,
    }
  }

  return getCurrentUserFromAPIKey()
}

export const loginUser = async (email: string, password: string) => {
  const res = await fetch(ENV.IMMICH_URL + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  if (res.ok) {
    return res.json()
  }

  return null
}

export const logoutUser = async (Authorization: string) => {
  const res = await fetch(ENV.IMMICH_URL + "/api/auth/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization" : "Bearer " + Authorization
    },
    
  })

  if (res.ok) {
    return res.json()
  }

  return null
}