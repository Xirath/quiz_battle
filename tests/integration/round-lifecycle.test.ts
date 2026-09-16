import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ClientSocket, type Socket as ClientSocketType } from "socket.io-client";
import { encode } from "@auth/core/jwt";
import { createGameServer } from "@/server/game-server";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ClientQuestion,
  RoundResultPayload,
} from "@/server/types";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe("Round Lifecycle & Early Reveal Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;
  let hostToken: string;
  let challengerToken: string;

  beforeAll(async () => {
    hostToken = await encode({
      token: {
        id: "player-host-round-1",
        name: "Host Round Player",
        email: "hostround@quizbattle.local",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    challengerToken = await encode({
      token: {
        id: "player-challenger-round-2",
        name: "Challenger Round Player",
        email: "challengerround@quizbattle.local",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    serverInstance = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
      countdownIntervalMs: 20, // Rapid match start countdown for test
      roundDurationMs: 200,   // Fast 200ms round timer for test
      earlyRevealDebounceMs: 40, // 40ms early reveal debounce
      roundRevealDurationMs: 60, // 60ms reveal intermission
      banTurnDurationMs: 20,
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

  it("handles answer submissions, emits player:answered without leaking choice, triggers early reveal, and broadcasts round:result", async () => {
    const hostSocket = createSocket(hostToken);
    const challengerSocket = createSocket(challengerToken);

    try {
      await Promise.all([waitForConnect(hostSocket), waitForConnect(challengerSocket)]);

      let roomCode = "";
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:create", (res) => {
          if (res.success && res.code) {
            roomCode = res.code;
            resolve();
          } else reject(new Error(res.error));
        });
      });

      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      const hostRound1Promise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });
      const challengerRound1Promise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        challengerSocket.once("round:start", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      const [hostRound1, challengerRound1] = await Promise.all([
        hostRound1Promise,
        challengerRound1Promise,
      ]);

      expect(hostRound1.roundNumber).toBe(1);
      expect(challengerRound1.roundNumber).toBe(1);

      // Track player:answered events
      const hostAnsweredEvents: Array<{ playerId: string }> = [];
      const challengerAnsweredEvents: Array<{ playerId: string }> = [];

      hostSocket.on("player:answered", (data) => {
        hostAnsweredEvents.push(data);
      });
      challengerSocket.on("player:answered", (data) => {
        challengerAnsweredEvents.push(data);
      });

      // Find the correct answer from the server's match state
      const match = serverInstance.roomManager.getMatch(roomCode);
      expect(match).not.toBeNull();
      const currentQuestion = match!.questions[0];
      const correctAnswer = currentQuestion.correctAnswer;
      const wrongAnswer = currentQuestion.options.find((o) => o !== correctAnswer) ?? "";

      const hostResultPromise = new Promise<RoundResultPayload>((resolve) => {
        hostSocket.once("round:result", resolve);
      });
      const challengerResultPromise = new Promise<RoundResultPayload>((resolve) => {
        challengerSocket.once("round:result", resolve);
      });

      // Host submits correct answer
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit(
          "player:submit_answer",
          { roomCode, roundNumber: 1, answer: correctAnswer },
          (res) => {
            if (res?.success) resolve();
            else reject(new Error(res?.error || "Submission failed"));
          }
        );
      });

      // Opponent sees player:answered
      await new Promise((r) => setTimeout(r, 15));
      expect(challengerAnsweredEvents).toHaveLength(1);
      expect(challengerAnsweredEvents[0].playerId).toBe("player-host-round-1");
      // Verify choice is NOT leaked
      expect("answer" in challengerAnsweredEvents[0]).toBe(false);

      // Challenger submits wrong answer
      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit(
          "player:submit_answer",
          { roomCode, roundNumber: 1, answer: wrongAnswer },
          (res) => {
            if (res?.success) resolve();
            else reject(new Error(res?.error || "Submission failed"));
          }
        );
      });

      const bothSubmittedTime = Date.now();

      // Both players receive round:result after early reveal debounce (40ms in test configuration)
      const [hostResult, challengerResult] = await Promise.all([
        hostResultPromise,
        challengerResultPromise,
      ]);

      const resultReceivedTime = Date.now();
      const debounceElapsed = resultReceivedTime - bothSubmittedTime;
      // Debounce was configured to 40ms in test, assert it occurred after debounce delay
      expect(debounceElapsed).toBeGreaterThanOrEqual(30);

      expect(hostResult.roundNumber).toBe(1);
      expect(hostResult.correctAnswer).toBe(correctAnswer);
      expect(hostResult.hostAnswer).toBe(correctAnswer);
      expect(hostResult.challengerAnswer).toBe(wrongAnswer);
      expect(hostResult.hostCorrect).toBe(true);
      expect(hostResult.challengerCorrect).toBe(false);
      expect(hostResult.hostScore).toBe(1);
      expect(hostResult.challengerScore).toBe(0);

      expect(challengerResult).toEqual(hostResult);

      // Verify progression to Round 2 after round reveal duration
      const round2Promise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      const round2 = await round2Promise;
      expect(round2.roundNumber).toBe(2);
      expect(round2.question.question).toBe(match?.questions[1].question);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("handles round timer expiration when players do not answer in time", async () => {
    const hostSocket = createSocket(hostToken);
    const challengerSocket = createSocket(challengerToken);

    try {
      await Promise.all([waitForConnect(hostSocket), waitForConnect(challengerSocket)]);

      let roomCode = "";
      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:create", (res) => {
          if (res.success && res.code) {
            roomCode = res.code;
            resolve();
          } else reject(new Error(res.error));
        });
      });

      await new Promise<void>((resolve, reject) => {
        hostSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      const hostRound1Promise = new Promise<{ roundNumber: number; question: ClientQuestion }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      await hostRound1Promise;

      // Do NOT submit any answers -> wait for 200ms timer to expire
      const resultPromise = new Promise<RoundResultPayload>((resolve) => {
        hostSocket.once("round:result", resolve);
      });

      const result = await resultPromise;
      expect(result.roundNumber).toBe(1);
      expect(result.hostAnswer).toBeNull();
      expect(result.challengerAnswer).toBeNull();
      expect(result.hostCorrect).toBe(false);
      expect(result.challengerCorrect).toBe(false);
      expect(result.hostScore).toBe(0);
      expect(result.challengerScore).toBe(0);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });
});
