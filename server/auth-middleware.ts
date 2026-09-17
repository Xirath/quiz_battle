import { parseCookie } from "cookie";
import { decode } from "@auth/core/jwt";
import type { Socket } from "socket.io";
import { prisma } from "@/lib/prisma";
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
  secret?: string,
  explicitToken?: string
): Promise<AuthenticatedUser> {
  const resolvedSecret =
    secret || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (!resolvedSecret) {
    throw new Error(
      "Authentication error: Unauthorized (AUTH_SECRET is not configured)"
    );
  }

  let tokenToDecode: string | null = null;
  let primarySalt: string = "authjs.session-token";

  if (explicitToken && typeof explicitToken === "string" && explicitToken.trim()) {
    tokenToDecode = explicitToken.trim();
  } else if (cookieHeader) {
    const extracted = extractSessionToken(cookieHeader);
    if (extracted) {
      tokenToDecode = extracted.token;
      primarySalt = extracted.salt;
    }
  }

  if (!tokenToDecode) {
    throw new Error("Authentication error: Unauthorized");
  }

  try {
    let decoded = null;
    try {
      decoded = await decode({
        token: tokenToDecode,
        secret: resolvedSecret,
        salt: primarySalt,
      });
    } catch {
      // Fallback: try other salts if primary salt fails
      for (const altSalt of SESSION_COOKIE_NAMES) {
        if (altSalt === primarySalt) continue;
        try {
          decoded = await decode({
            token: tokenToDecode,
            secret: resolvedSecret,
            salt: altSalt,
          });
          if (decoded) break;
        } catch {
          // ignore and try next salt
        }
      }
    }

    if (!decoded) {
      throw new Error("Authentication error: Unauthorized");
    }

    let id = (decoded.id as string) || (decoded.sub as string);
    const email = (decoded.email as string) || null;
    let name = (decoded.name as string) || null;
    let image = (decoded.image as string) || (decoded.picture as string) || null;

    if (!id && !email) {
      throw new Error("Authentication error: Unauthorized");
    }

    if (email) {
      try {
        const dbUser = await prisma.user.findUnique({ where: { email } });
        if (dbUser) {
          id = dbUser.id;
          name = dbUser.name ?? name;
          image = dbUser.image ?? image;
        }
      } catch {
        // Fallback to token ID
      }
    }

    return {
      id,
      name,
      email,
      image,
    };
  } catch {
    throw new Error("Authentication error: Unauthorized");
  }
}

export function createAuthMiddleware(secret?: string) {
  return async (socket: Socket, next: (err?: Error) => void) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const explicitToken =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.query?.token as string | undefined);

      const user = await authenticateHandshake(cookieHeader, secret, explicitToken);
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
