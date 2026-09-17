import { describe, it, expect } from "vitest";
import { encode } from "@auth/core/jwt";
import {
  extractSessionToken,
  authenticateHandshake,
  createAuthMiddleware,
} from "@/server/auth-middleware";
import type { SocketData } from "@/server/types";

interface MockSocket {
  handshake: { headers: Record<string, string> };
  data: Partial<SocketData>;
}

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

describe("extractSessionToken", () => {
  it("returns null when no cookie header is provided", () => {
    expect(extractSessionToken(undefined)).toBeNull();
    expect(extractSessionToken("")).toBeNull();
  });

  it("extracts token and salt for standard authjs.session-token", () => {
    const header = "other=value; authjs.session-token=my-token-123; foo=bar";
    const result = extractSessionToken(header);
    expect(result).toEqual({
      token: "my-token-123",
      salt: "authjs.session-token",
    });
  });

  it("extracts token and salt for secure authjs cookie", () => {
    const header = "__Secure-authjs.session-token=secure-token-456";
    const result = extractSessionToken(header);
    expect(result).toEqual({
      token: "secure-token-456",
      salt: "__Secure-authjs.session-token",
    });
  });

  it("extracts token and salt for next-auth fallback cookie", () => {
    const header = "next-auth.session-token=legacy-token-789";
    const result = extractSessionToken(header);
    expect(result).toEqual({
      token: "legacy-token-789",
      salt: "next-auth.session-token",
    });
  });
});

describe("authenticateHandshake", () => {
  it("rejects when no cookie header is present", async () => {
    await expect(authenticateHandshake(undefined, TEST_SECRET)).rejects.toThrow(
      "Authentication error: Unauthorized"
    );
  });

  it("rejects when token is invalid or signed with different secret", async () => {
    const fakeToken = "invalid.jwt.token";
    const cookieHeader = `authjs.session-token=${fakeToken}`;

    await expect(
      authenticateHandshake(cookieHeader, TEST_SECRET)
    ).rejects.toThrow("Authentication error: Unauthorized");
  });

  it("successfully decodes a valid JWT session token and returns user profile", async () => {
    const token = await encode({
      token: {
        id: "player-999",
        name: "Trivia Master",
        email: "master@quizbattle.local",
        picture: "https://example.com/avatar.jpg",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    const cookieHeader = `authjs.session-token=${token}`;
    const user = await authenticateHandshake(cookieHeader, TEST_SECRET);

    expect(user).toEqual({
      id: "player-999",
      name: "Trivia Master",
      email: "master@quizbattle.local",
      image: "https://example.com/avatar.jpg",
    });
  });
});

describe("createAuthMiddleware", () => {
  const authMiddleware = createAuthMiddleware(TEST_SECRET);

  it("rejects socket without valid credentials during handshake", async () => {
    const mockSocket: MockSocket = {
      handshake: {
        headers: {},
      },
      data: {},
    };

    let errorPassed: Error | undefined;
    await authMiddleware(
      mockSocket as unknown as Parameters<typeof authMiddleware>[0],
      (err) => {
        errorPassed = err;
      }
    );

    expect(errorPassed).toBeDefined();
    expect(errorPassed?.message).toContain("Authentication error: Unauthorized");
    expect(mockSocket.data.user).toBeUndefined();
  });

  it("attaches authenticated user to socket.data.user when handshake is valid", async () => {
    const token = await encode({
      token: {
        id: "player-123",
        name: "Quiz Champion",
        email: "champ@quizbattle.local",
        image: "https://example.com/pic.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    const mockSocket: MockSocket = {
      handshake: {
        headers: {
          cookie: `authjs.session-token=${token}`,
        },
      },
      data: {},
    };

    let errorPassed: Error | undefined;
    await authMiddleware(
      mockSocket as unknown as Parameters<typeof authMiddleware>[0],
      (err) => {
        errorPassed = err;
      }
    );

    expect(errorPassed).toBeUndefined();
    expect(mockSocket.data.user).toEqual({
      id: "player-123",
      name: "Quiz Champion",
      email: "champ@quizbattle.local",
      image: "https://example.com/pic.png",
    });
  });

  it("authenticates socket when token is passed explicitly via handshake.auth.token", async () => {
    const token = await encode({
      token: {
        id: "player-cross-domain",
        name: "Remote Player",
        email: "remote@quizbattle.local",
        picture: "https://example.com/remote.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    const mockSocket = {
      handshake: {
        headers: {},
        auth: { token },
      },
      data: {},
    };

    let errorPassed: Error | undefined;
    await authMiddleware(
      mockSocket as unknown as Parameters<typeof authMiddleware>[0],
      (err) => {
        errorPassed = err;
      }
    );

    expect(errorPassed).toBeUndefined();
    expect((mockSocket.data as Partial<SocketData>).user).toEqual({
      id: "player-cross-domain",
      name: "Remote Player",
      email: "remote@quizbattle.local",
      image: "https://example.com/remote.png",
    });
  });
});
