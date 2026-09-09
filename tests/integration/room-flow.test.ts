import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ClientSocket, type Socket as ClientSocketType } from "socket.io-client";
import { encode } from "@auth/core/jwt";
import { createGameServer } from "@/server/game-server";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
} from "@/server/types";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe("Room Flow Socket Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;
  let hostToken: string;
  let challengerToken: string;
  let thirdToken: string;

  beforeAll(async () => {
    hostToken = await encode({
      token: {
        id: "player-host-1",
        name: "Host Hero",
        email: "host@quizbattle.local",
        image: "https://example.com/host.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    challengerToken = await encode({
      token: {
        id: "player-challenger-2",
        name: "Challenger Champ",
        email: "challenger@quizbattle.local",
        image: "https://example.com/challenger.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    thirdToken = await encode({
      token: {
        id: "player-third-3",
        name: "Third Wheel",
        email: "third@quizbattle.local",
        image: "https://example.com/third.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

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

  const createSocket = (token: string): TypedClientSocket => {
    return ClientSocket(`http://localhost:${port}`, {
      extraHeaders: {
        cookie: `authjs.session-token=${token}`,
      },
      transports: ["websocket"],
      reconnection: false,
    });
  };

  const waitForConnect = (socket: TypedClientSocket): Promise<void> => {
    if (socket.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket connection timeout")), 3000);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  it("completes full 2-player room creation and join flow", async () => {
    const hostSocket = createSocket(hostToken);
    const challengerSocket = createSocket(challengerToken);

    try {
      await Promise.all([
        waitForConnect(hostSocket),
        waitForConnect(challengerSocket),
      ]);

      // 1. Host creates room
      let roomCode = "";
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:create", (res) => {
          if (res.success && res.code) {
            roomCode = res.code;
            expect(res.code).toHaveLength(6);
            resolve();
          } else {
            reject(new Error(res.error || "Failed to create room"));
          }
        });
      });

      // Host enters the room lobby
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // 2. Set up expectations for host receiving challenger join
      const hostReceivedJoin = new Promise<RoomState>((resolve) => {
        hostSocket.once("room:player_joined", (data) => {
          expect(data.player.name).toBe("Challenger Champ");
          expect(data.room.status).toBe("ready");
          resolve(data.room);
        });
      });

      // 3. Challenger joins room
      const challengerJoined = new Promise<RoomState>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success && res.room) {
            expect(res.room.status).toBe("ready");
            expect(res.room.host.name).toBe("Host Hero");
            expect(res.room.challenger?.name).toBe("Challenger Champ");
            resolve(res.room);
          } else {
            reject(new Error(res.error || "Failed to join room"));
          }
        });
      });

      const [hostRoomState, challengerRoomState] = await Promise.all([
        hostReceivedJoin,
        challengerJoined,
      ]);

      expect(hostRoomState.code).toBe(roomCode);
      expect(challengerRoomState.code).toBe(roomCode);
      expect(hostRoomState.challenger?.id).toBe("player-challenger-2");
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("rejects a third player trying to join a full room", async () => {
    const hostSocket = createSocket(hostToken);
    const challengerSocket = createSocket(challengerToken);
    const thirdSocket = createSocket(thirdToken);

    try {
      await Promise.all([
        waitForConnect(hostSocket),
        waitForConnect(challengerSocket),
        waitForConnect(thirdSocket),
      ]);

      // 1. Host creates room
      let roomCode = "";
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:create", (res) => {
          if (res.success && res.code) {
            roomCode = res.code;
            resolve();
          } else {
            reject(new Error(res.error || "Failed to create room"));
          }
        });
      });

      // 2. Challenger joins room
      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // 3. Third player tries to join
      await new Promise<void>((resolve, reject) => {
        thirdSocket.emit("room:join", { code: roomCode }, (res) => {
          if (!res.success) {
            expect(res.error).toBe("Room is full (maximum 2 players)");
            resolve();
          } else {
            reject(new Error("Third player should not have been allowed in full room"));
          }
        });
      });
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
      thirdSocket.disconnect();
    }
  });
});
