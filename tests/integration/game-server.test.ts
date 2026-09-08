import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ClientSocket, type Socket as ClientSocketType } from "socket.io-client";
import { encode } from "@auth/core/jwt";
import { createGameServer } from "@/server/game-server";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

describe("createGameServer Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;
  let validToken: string;

  beforeAll(async () => {
    // Generate valid session token
    validToken = await encode({
      token: {
        id: "player-integration-1",
        name: "Integration Player",
        email: "integration@quizbattle.local",
        image: "https://example.com/avatar.jpg",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    // Create and start game server on dynamic port (0 assigns available ephemeral port)
    serverInstance = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
    });

    const address = await serverInstance.listen();
    port = address.port;
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  it("connects successfully with a valid session cookie and attaches player info", async () => {
    const socket: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `authjs.session-token=${validToken}`,
      },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Connection timeout"));
      }, 3000);

      socket.on("connect", () => {
        clearTimeout(timer);
        expect(socket.connected).toBe(true);
        socket.disconnect();
        resolve();
      });

      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  });

  it("rejects connection when no cookie is sent during handshake", async () => {
    const socket: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Expected connect_error but timed out"));
      }, 3000);

      socket.on("connect", () => {
        clearTimeout(timer);
        socket.disconnect();
        reject(new Error("Socket should have been rejected but connected"));
      });

      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        expect(err.message).toContain("Authentication error: Unauthorized");
        socket.disconnect();
        resolve();
      });
    });
  });

  it("rejects connection when token is invalid or tampered", async () => {
    const socket: ClientSocketType = ClientSocket(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: "authjs.session-token=malformed.tampered.token",
      },
      transports: ["websocket"],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Expected connect_error but timed out"));
      }, 3000);

      socket.on("connect", () => {
        clearTimeout(timer);
        socket.disconnect();
        reject(new Error("Socket should have been rejected but connected"));
      });

      socket.on("connect_error", (err) => {
        clearTimeout(timer);
        expect(err.message).toContain("Authentication error: Unauthorized");
        socket.disconnect();
        resolve();
      });
    });
  });
});
