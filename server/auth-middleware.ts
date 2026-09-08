import { parseCookie } from "cookie";
import { decode } from "@auth/core/jwt";
import type { Socket } from "socket.io";
import type { AuthenticatedUser } from "./types";

const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

export function parseCookieHeader(header?: string): Record<string, string | undefined> {
  if (!header) return {};
  try {
    if (typeof parseCookie === "function") {
      return parseCookie(header);
    }
  } catch {
    // fallback to manual parsing below
  }

  const result: Record<string, string> = {};
  const pairs = header.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.substring(0, idx).trim();
    const val = pair.substring(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function extractSessionToken(
  cookieHeader?: string
): { token: string; salt: string } | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = parseCookieHeader(cookieHeader);

  for (const cookieName of SESSION_COOKIE_NAMES) {
    const token = cookies[cookieName];
    if (token) {
      return { token, salt: cookieName };
    }
  }

  return null;
}

export async function authenticateHandshake(
  cookieHeader?: string,
  secret?: string
): Promise<AuthenticatedUser> {
  const resolvedSecret =
    secret || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (!resolvedSecret) {
    throw new Error(
      "Authentication error: Unauthorized (AUTH_SECRET is not configured)"
    );
  }

  const extracted = extractSessionToken(cookieHeader);
  if (!extracted) {
    throw new Error("Authentication error: Unauthorized");
  }

  try {
    const decoded = await decode({
      token: extracted.token,
      secret: resolvedSecret,
      salt: extracted.salt,
    });

    if (!decoded) {
      throw new Error("Authentication error: Unauthorized");
    }

    const id = (decoded.id as string) || (decoded.sub as string);
    if (!id) {
      throw new Error("Authentication error: Unauthorized");
    }

    return {
      id,
      name: (decoded.name as string) || null,
      email: (decoded.email as string) || null,
      image:
        (decoded.image as string) || (decoded.picture as string) || null,
    };
  } catch {
    throw new Error("Authentication error: Unauthorized");
  }
}

export function createAuthMiddleware(secret?: string) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const user = await authenticateHandshake(cookieHeader, secret);
      socket.data.user = user;
      next();
    } catch (error) {
      next(
        error instanceof Error
          ? error
          : new Error("Authentication error: Unauthorized")
      );
    }
  };
}
