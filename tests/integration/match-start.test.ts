import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ClientSocket, type Socket as ClientSocketType } from "socket.io-client";
import { encode } from "@auth/core/jwt";
import { createGameServer } from "@/server/game-server";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ClientQuestion,
} from "@/server/types";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe("Match Start & Countdown Synchronization Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;
  let hostToken: string;
  let challengerToken: string;

  beforeAll(async () => {
    hostToken = await encode({
      token: {
        id: "player-host-match-1",
        name: "Host Match Player",
        email: "hostmatch@quizbattle.local",
        image: "https://example.com/host.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    challengerToken = await encode({
      token: {
        id: "player-challenger-match-2",
        name: "Challenger Match Player",
        email: "challengermatch@quizbattle.local",
        image: "https://example.com/challenger.png",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    serverInstance = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
      countdownIntervalMs: 20, // Accelerated countdown interval for fast integration tests
      banTurnDurationMs: 100,
      categoryRevealDurationMs: 20,
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

  it("automatically starts ban phase with 5 categories, processes veto turns, decides final category, and delivers Round 1 question", async () => {
    const hostSocket = createSocket(hostToken);
    const challengerSocket = createSocket(challengerToken);

    try {
      await Promise.all([
        waitForConnect(hostSocket),
        waitForConnect(challengerSocket),
      ]);

      // 1. Host creates room and joins
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

      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Track ban phase start
      const hostBanStartPromise = new Promise<{
        categories: Array<{ id: number; name: string }>;
        currentBanningPlayerId: string;
      }>((resolve) => {
        hostSocket.once("match:ban_phase_start", (data) => {
          resolve(data);
        });
      });

      // Track countdown events received on both clients
      const hostCountdowns: Array<{ count: number; text: string }> = [];
      const challengerCountdowns: Array<{ count: number; text: string }> = [];

      hostSocket.on("match:countdown", (data) => {
        hostCountdowns.push(data);
      });

      challengerSocket.on("match:countdown", (data) => {
        challengerCountdowns.push(data);
      });

      // Track round:start on both clients
      const hostRoundStartPromise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        hostSocket.once("round:start", (data) => {
          resolve(data);
        });
      });

      const challengerRoundStartPromise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        challengerSocket.once("round:start", (data) => {
          resolve(data);
        });
      });

      // 2. Challenger joins room
      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Wait for ban phase to start
      const banStartData = await hostBanStartPromise;
      expect(banStartData.categories).toHaveLength(5);
      expect(banStartData.currentBanningPlayerId).toBe("player-host-match-1");

      const cats = banStartData.categories;

      // Turn 1: Host vetoes category 0
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("player:ban_category", { roomCode, categoryId: cats[0].id }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Turn 2: Challenger vetoes category 1
      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("player:ban_category", { roomCode, categoryId: cats[1].id }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Turn 3: Host vetoes category 2
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("player:ban_category", { roomCode, categoryId: cats[2].id }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Turn 4: Challenger vetoes category 3 (Category 4 should be final winner!)
      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("player:ban_category", { roomCode, categoryId: cats[3].id }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Wait for round:start to arrive at both clients
      const [hostRoundData, challengerRoundData] = await Promise.all([
        hostRoundStartPromise,
        challengerRoundStartPromise,
      ]);

      // Verify countdown sequence: 3, 2, 1, GO!
      expect(hostCountdowns.length).toBeGreaterThanOrEqual(4);
      expect(challengerCountdowns.length).toBeGreaterThanOrEqual(4);

      expect(hostCountdowns.map((c) => c.text)).toEqual(
        expect.arrayContaining(["3", "2", "1", "GO!"])
      );
      expect(challengerCountdowns.map((c) => c.text)).toEqual(
        expect.arrayContaining(["3", "2", "1", "GO!"])
      );

      // Verify Round 1 payload
      expect(hostRoundData.roundNumber).toBe(1);
      expect(challengerRoundData.roundNumber).toBe(1);

      // Both players receive the exact same question prompt and shuffled options
      expect(hostRoundData.question).toEqual(challengerRoundData.question);
      expect(hostRoundData.question.question).toBeDefined();
      expect(hostRoundData.question.category).toBeDefined();
      expect(hostRoundData.question.options).toHaveLength(4);

      // Crucial security acceptance criteria: No correct answer leaked to client
      expect("correctAnswer" in hostRoundData.question).toBe(false);
      expect("correct_answer" in hostRoundData.question).toBe(false);
      expect((hostRoundData.question as unknown as Record<string, unknown>).correctAnswer).toBeUndefined();

      // Verify server keeps correct answer in memory and records selected category
      const match = serverInstance.roomManager.getMatch(roomCode);
      expect(match).not.toBeNull();
      expect(match?.selectedCategory).toEqual(cats[4]);
      expect(match?.questions).toHaveLength(20);
      expect(match?.questions[0].correctAnswer).toBeDefined();
      expect(match?.questions[0].options).toContain(match?.questions[0].correctAnswer);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });
});
