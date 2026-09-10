import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { io as ClientSocket, type Socket as ClientSocketType } from "socket.io-client";
import { encode } from "@auth/core/jwt";
import { createGameServer } from "@/server/game-server";
import { prisma } from "@/lib/prisma";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ClientQuestion,
  MatchEndPayload,
} from "@/server/types";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe("Match Conclusion, Sudden Death & Rematch Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;
  let hostToken: string;
  let challengerToken: string;
  const hostId = "player-host-conclusion-1";
  const challengerId = "player-challenger-conclusion-2";

  beforeAll(async () => {
    hostToken = await encode({
      token: {
        id: hostId,
        name: "Host Champion",
        email: "hostconclusion@quizbattle.local",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    challengerToken = await encode({
      token: {
        id: challengerId,
        name: "Challenger Challenger",
        email: "challengerconclusion@quizbattle.local",
      },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });

    serverInstance = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
      countdownIntervalMs: 20, // Rapid match start countdown
      roundDurationMs: 200,   // Fast round timer
      earlyRevealDebounceMs: 30, // 30ms early reveal debounce
      roundRevealDurationMs: 50, // 50ms reveal intermission
    });

    const address = await serverInstance.listen();
    port = address.port;
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  beforeEach(async () => {
    await prisma.match.deleteMany();
    await prisma.user.deleteMany({
      where: { id: { in: [hostId, challengerId] } },
    });

    await prisma.user.create({
      data: {
        id: hostId,
        name: "Host Champion",
        email: "hostconclusion@quizbattle.local",
        wins: 1,
        losses: 0,
        totalMatches: 1,
        totalCorrectAnswers: 6,
      },
    });

    await prisma.user.create({
      data: {
        id: challengerId,
        name: "Challenger Challenger",
        email: "challengerconclusion@quizbattle.local",
        wins: 0,
        losses: 1,
        totalMatches: 1,
        totalCorrectAnswers: 4,
      },
    });
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

  it("concludes match when a player reaches 6 Score, persists result to DB, and executes rematch", async () => {
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

      // Fast-forward score to 5-4 using setMatchScoresForTesting
      serverInstance.roomManager.setMatchScoresForTesting(roomCode, 5, 4);

      const hostMatchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        hostSocket.once("match:end", resolve);
      });
      const challengerMatchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        challengerSocket.once("match:end", resolve);
      });

      // Fetch correct answer for round 1
      const match = serverInstance.roomManager.getMatch(roomCode);
      const correctAnswer = match!.questions[0].correctAnswer;
      const wrongAnswer = match!.questions[0].options.find((o) => o !== correctAnswer) ?? "";

      // Host submits correct answer -> reaches 6 Score
      hostSocket.emit("player:submit_answer", { roomCode, roundNumber: 1, answer: correctAnswer });
      // Challenger submits wrong answer -> stays at 4 Score
      challengerSocket.emit("player:submit_answer", { roomCode, roundNumber: 1, answer: wrongAnswer });

      const [hostEnd, challengerEnd] = await Promise.all([
        hostMatchEndPromise,
        challengerMatchEndPromise,
      ]);

      expect(hostEnd.winnerId).toBe(hostId);
      expect(hostEnd.winnerName).toBe("Host Champion");
      expect(hostEnd.hostScore).toBe(6);
      expect(hostEnd.challengerScore).toBe(4);
      expect(hostEnd.isSuddenDeath).toBe(false);
      expect(challengerEnd).toEqual(hostEnd);

      // Verify DB persistence
      await new Promise((r) => setTimeout(r, 60)); // allow async persistence to complete
      const dbMatch = await prisma.match.findFirst({
        where: { roomCode },
      });
      expect(dbMatch).not.toBeNull();
      expect(dbMatch?.winnerId).toBe(hostId);
      expect(dbMatch?.hostScore).toBe(6);
      expect(dbMatch?.challengerScore).toBe(4);

      const dbHost = await prisma.user.findUnique({ where: { id: hostId } });
      expect(dbHost?.wins).toBe(2); // 1 + 1
      expect(dbHost?.totalMatches).toBe(2); // 1 + 1

      const dbChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
      expect(dbChallenger?.losses).toBe(2); // 1 + 1
      expect(dbChallenger?.totalMatches).toBe(2); // 1 + 1

      // Rematch flow: Both players click "Play Again"
      const hostRematchRound1Promise = new Promise<{ roundNumber: number; hostScore?: number; challengerScore?: number }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      const rematchStatusPromise = new Promise<{ requestedBy: string[] }>((resolve) => {
        challengerSocket.once("match:rematch_status", resolve);
      });

      hostSocket.emit("match:play_again", { roomCode });
      const rematchStatus = await rematchStatusPromise;
      expect(rematchStatus.requestedBy).toContain(hostId);

      challengerSocket.emit("match:play_again", { roomCode });

      // After both request rematch, countdown restarts and Round 1 begins with 0-0 scores
      const rematchRound1 = await hostRematchRound1Promise;
      expect(rematchRound1.roundNumber).toBe(1);
      expect(rematchRound1.hostScore).toBe(0);
      expect(rematchRound1.challengerScore).toBe(0);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("handles Sudden Death Overtime at 6-6 tie until score diverges", async () => {
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

      const hostRound1Promise = new Promise<{ roundNumber: number }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      await hostRound1Promise;

      // Simulate 5-5 tie before round 1 ends
      serverInstance.roomManager.setMatchScoresForTesting(roomCode, 5, 5);

      const match = serverInstance.roomManager.getMatch(roomCode);
      const q1Correct = match!.questions[0].correctAnswer;

      const suddenDeathRoundPromise = new Promise<{ roundNumber: number; isSuddenDeath?: boolean }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      // Both answer correctly -> 6-6 tie -> enters Sudden Death
      hostSocket.emit("player:submit_answer", { roomCode, roundNumber: 1, answer: q1Correct });
      challengerSocket.emit("player:submit_answer", { roomCode, roundNumber: 1, answer: q1Correct });

      const suddenDeathRound = await suddenDeathRoundPromise;
      expect(suddenDeathRound.roundNumber).toBe(2);
      expect(suddenDeathRound.isSuddenDeath).toBe(true);

      // In Sudden Death: Host answers incorrectly, Challenger answers correctly -> scores diverge (6-7)
      const q2Correct = match!.questions[1].correctAnswer;
      const q2Wrong = match!.questions[1].options.find((o) => o !== q2Correct) ?? "";

      const matchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        hostSocket.once("match:end", resolve);
      });

      hostSocket.emit("player:submit_answer", { roomCode, roundNumber: 2, answer: q2Wrong });
      challengerSocket.emit("player:submit_answer", { roomCode, roundNumber: 2, answer: q2Correct });

      const matchEnd = await matchEndPromise;
      expect(matchEnd.winnerId).toBe(challengerId);
      expect(matchEnd.winnerName).toBe("Challenger Challenger");
      expect(matchEnd.hostScore).toBe(6);
      expect(matchEnd.challengerScore).toBe(7);
      expect(matchEnd.isSuddenDeath).toBe(true);
      expect(matchEnd.roundsPlayed).toBe(2);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });
});
