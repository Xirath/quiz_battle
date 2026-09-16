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
  MatchRestorePayload,
} from "@/server/types";

const TEST_SECRET = "quiz-battle-test-secret-at-least-32-chars-long";

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe("Disconnection Grace Period & Forfeit Handling Integration", () => {
  let serverInstance: ReturnType<typeof createGameServer>;
  let port: number;

  beforeAll(async () => {
    serverInstance = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
      countdownIntervalMs: 20, // Rapid match start countdown
      roundDurationMs: 2000,
      earlyRevealDebounceMs: 30,
      roundRevealDurationMs: 50,
      disconnectGracePeriodMs: 150, // 150ms grace period for fast testing
      banTurnDurationMs: 20,
      categoryRevealDurationMs: 20,
    });

    const address = await serverInstance.listen();
    port = address.port;
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  const createAuthToken = async (id: string, name: string, email: string) => {
    return await encode({
      token: { id, name, email },
      secret: TEST_SECRET,
      salt: "authjs.session-token",
    });
  };

  const dcTestUserIds = [
    "host-dc-restore-1",
    "challenger-dc-restore-2",
    "player-host-dc-forfeit-1",
    "player-challenger-dc-forfeit-2",
    "player-host-leave-forfeit-1",
    "player-challenger-leave-forfeit-2",
    "player-host-dc-pause-1",
    "player-challenger-dc-pause-2",
    "player-host-ban-dc-1",
    "player-challenger-ban-dc-2",
  ];

  beforeEach(async () => {
    await prisma.match.deleteMany({
      where: {
        OR: [
          { hostId: { in: dcTestUserIds } },
          { challengerId: { in: dcTestUserIds } },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: dcTestUserIds } },
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

  it("triggers grace period notification when mid-match disconnect occurs and restores state on reconnect", async () => {
    const hostId = "host-dc-restore-1";
    const challengerId = "challenger-dc-restore-2";
    const hostToken = await createAuthToken(hostId, "Host Hero", "hostrestore@quizbattle.local");
    const challengerToken = await createAuthToken(challengerId, "Challenger Champ", "challengerrestore@quizbattle.local");

    const hostSocket = createSocket(hostToken);
    let challengerSocket = createSocket(challengerToken);

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

      // Challenger disconnects mid-match
      const hostReceivedDcPromise = new Promise<{
        playerId: string;
        countdownSeconds: number;
        disconnectTimestamp: number;
      }>((resolve) => {
        hostSocket.once("player:disconnected", resolve);
      });

      challengerSocket.disconnect();

      const dcData = await hostReceivedDcPromise;
      expect(dcData.playerId).toBe(challengerId);
      expect(dcData.countdownSeconds).toBeGreaterThan(0);

      // Verify match state is still active in room manager during grace period
      const match = serverInstance.roomManager.getMatch(roomCode);
      expect(match).not.toBeNull();
      expect(match?.disconnectedPlayerId).toBe(challengerId);

      // Challenger reconnects within grace period
      challengerSocket = createSocket(challengerToken);
      await waitForConnect(challengerSocket);

      const hostReceivedReconnectPromise = new Promise<{ playerId: string }>((resolve) => {
        hostSocket.once("player:reconnected", resolve);
      });

      const challengerRestoredPromise = new Promise<MatchRestorePayload>((resolve) => {
        challengerSocket.once("match:restore", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      const reconnectEvent = await hostReceivedReconnectPromise;
      expect(reconnectEvent.playerId).toBe(challengerId);

      const restorePayload = await challengerRestoredPromise;
      expect(restorePayload.roundNumber).toBe(1);
      expect(restorePayload.question).not.toBeNull();
      expect(restorePayload.hostScore).toBe(0);
      expect(restorePayload.challengerScore).toBe(0);

      // Verify disconnected player status cleared
      const restoredMatch = serverInstance.roomManager.getMatch(roomCode);
      expect(restoredMatch?.disconnectedPlayerId).toBeNull();

      hostSocket.emit("room:leave", { code: roomCode });
      challengerSocket.emit("room:leave", { code: roomCode });
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("awards victory by forfeit to remaining player when reconnection timer expires and persists result to database", async () => {
    const hostId = "player-host-dc-forfeit-1";
    const challengerId = "player-challenger-dc-forfeit-2";

    await prisma.user.create({
      data: {
        id: hostId,
        name: "Host Hero",
        email: "hostdcforfeit@quizbattle.local",
        wins: 1,
        losses: 0,
        totalMatches: 1,
        totalCorrectAnswers: 5,
      },
    });

    await prisma.user.create({
      data: {
        id: challengerId,
        name: "Challenger Champ",
        email: "challengerdcforfeit@quizbattle.local",
        wins: 0,
        losses: 1,
        totalMatches: 1,
        totalCorrectAnswers: 3,
      },
    });

    const hostToken = await createAuthToken(hostId, "Host Hero", "hostdcforfeit@quizbattle.local");
    const challengerToken = await createAuthToken(challengerId, "Challenger Champ", "challengerdcforfeit@quizbattle.local");

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

      // Fast-forward score to 3-2
      serverInstance.roomManager.setMatchScoresForTesting(roomCode, 3, 2);

      const hostMatchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        hostSocket.once("match:end", resolve);
      });

      // Challenger disconnects and never reconnects
      challengerSocket.disconnect();

      // Wait for grace period timeout (150ms in test config)
      const matchEnd = await hostMatchEndPromise;
      expect(matchEnd.winnerId).toBe(hostId);
      expect(matchEnd.winnerName).toBe("Host Hero");
      expect(matchEnd.isForfeit).toBe(true);
      expect(matchEnd.hostScore).toBe(3);
      expect(matchEnd.challengerScore).toBe(2);

      // Verify match in room manager
      const room = serverInstance.roomManager.getRoom(roomCode);
      expect(room?.status).toBe("finished");

      // Verify DB persistence
      await new Promise((r) => setTimeout(r, 60));
      const dbMatch = await prisma.match.findFirst({
        where: { roomCode },
      });
      expect(dbMatch).not.toBeNull();
      expect(dbMatch?.winnerId).toBe(hostId);
      expect(dbMatch?.isForfeit).toBe(true);
      expect(dbMatch?.hostScore).toBe(3);
      expect(dbMatch?.challengerScore).toBe(2);

      const dbHost = await prisma.user.findUnique({ where: { id: hostId } });
      expect(dbHost?.wins).toBe(2); // 1 + 1
      expect(dbHost?.totalMatches).toBe(2); // 1 + 1
      expect(dbHost?.totalCorrectAnswers).toBe(8); // 5 + 3

      const dbChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
      expect(dbChallenger?.losses).toBe(2); // 1 + 1
      expect(dbChallenger?.totalMatches).toBe(2); // 1 + 1
      expect(dbChallenger?.totalCorrectAnswers).toBe(5); // 3 + 2
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("awards victory by forfeit immediately when a player explicitly leaves mid-match and informs remaining player", async () => {
    const hostId = "player-host-leave-forfeit-1";
    const challengerId = "player-challenger-leave-forfeit-2";

    await prisma.user.create({
      data: {
        id: hostId,
        name: "Host Victor",
        email: "hostleaveforfeit@quizbattle.local",
        wins: 0,
        losses: 0,
        totalMatches: 0,
        totalCorrectAnswers: 0,
      },
    });

    await prisma.user.create({
      data: {
        id: challengerId,
        name: "Challenger Quitter",
        email: "challengerleaveforfeit@quizbattle.local",
        wins: 0,
        losses: 0,
        totalMatches: 0,
        totalCorrectAnswers: 0,
      },
    });

    const hostToken = await createAuthToken(hostId, "Host Victor", "hostleaveforfeit@quizbattle.local");
    const challengerToken = await createAuthToken(challengerId, "Challenger Quitter", "challengerleaveforfeit@quizbattle.local");

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

      const hostMatchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        hostSocket.once("match:end", resolve);
      });

      // Challenger explicitly forfeits/leaves the active match
      challengerSocket.emit("room:leave", { code: roomCode });

      // Host receives match:end immediately with forfeit details
      const matchEnd = await hostMatchEndPromise;
      expect(matchEnd.winnerId).toBe(hostId);
      expect(matchEnd.winnerName).toBe("Host Victor");
      expect(matchEnd.isForfeit).toBe(true);
      expect(matchEnd.host?.name).toBe("Host Victor");
      expect(matchEnd.challenger?.name).toBe("Challenger Quitter");

      // Verify DB persistence
      await new Promise((r) => setTimeout(r, 60));
      const dbMatch = await prisma.match.findFirst({
        where: { roomCode },
      });
      expect(dbMatch).not.toBeNull();
      expect(dbMatch?.winnerId).toBe(hostId);
      expect(dbMatch?.isForfeit).toBe(true);

      const dbHost = await prisma.user.findUnique({ where: { id: hostId } });
      expect(dbHost?.wins).toBe(1);

      const dbChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
      expect(dbChallenger?.losses).toBe(1);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });

  it("does not advance to the next round while a player is disconnected, waiting for reconnection", async () => {
    const pauseServer = createGameServer({
      port: 0,
      secret: TEST_SECRET,
      corsOrigin: "http://localhost:3000",
      countdownIntervalMs: 10,
      roundDurationMs: 100,
      earlyRevealDebounceMs: 20,
      roundRevealDurationMs: 40,
      disconnectGracePeriodMs: 2000,
      banTurnDurationMs: 20,
      categoryRevealDurationMs: 20,
    });
    const addr = await pauseServer.listen();
    const testPort = addr.port;

    const createCustomSocket = (token: string): TypedClientSocket => {
      return ClientSocket(`http://localhost:${testPort}`, {
        extraHeaders: {
          cookie: `authjs.session-token=${token}`,
        },
        transports: ["websocket"],
        reconnection: false,
      });
    };

    const hostId = "player-host-dc-pause-1";
    const challengerId = "player-challenger-dc-pause-2";

    const hostToken = await createAuthToken(hostId, "Host Victor", "hostpause@quizbattle.local");
    const challengerToken = await createAuthToken(challengerId, "Challenger Wait", "challengerpause@quizbattle.local");

    const hostSocket = createCustomSocket(hostToken);
    let challengerSocket = createCustomSocket(challengerToken);

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

      // Challenger disconnects mid-round 1
      challengerSocket.disconnect();

      // Host answers round 1
      hostSocket.emit("player:submit_answer", {
        roomCode,
        roundNumber: 1,
        answer: "Any Answer",
      });

      let receivedRound2WhileDisconnected = false;
      const onRoundStart = (data: { roundNumber: number }) => {
        if (data.roundNumber === 2) {
          receivedRound2WhileDisconnected = true;
        }
      };
      hostSocket.on("round:start", onRoundStart);

      // Wait for round 1 duration (100ms) + roundRevealDurationMs (40ms) + 100ms buffer
      await new Promise((r) => setTimeout(r, 250));

      // Assert that round 2 was NOT started while player was disconnected
      expect(receivedRound2WhileDisconnected).toBe(false);

      // Verify match state is still paused waiting for reconnect
      const match = pauseServer.roomManager.getMatch(roomCode);
      expect(match?.disconnectedPlayerId).toBe(challengerId);

      // Now challenger reconnects
      challengerSocket = createCustomSocket(challengerToken);
      await waitForConnect(challengerSocket);

      const hostRound2Promise = new Promise<{ roundNumber: number }>((resolve) => {
        hostSocket.once("round:start", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Once reconnected, next round (Round 2) should start!
      const round2Data = await hostRound2Promise;
      expect(round2Data.roundNumber).toBe(2);

      hostSocket.off("round:start", onRoundStart);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
      await pauseServer.close();
    }
  });

  it("awards victory by forfeit to remaining player when disconnect occurs during category ban phase and grace period expires", async () => {
    const hostId = "player-host-ban-dc-1";
    const challengerId = "player-challenger-ban-dc-2";

    await prisma.user.createMany({
      data: [
        { id: hostId, name: "Host BanDC", email: "hostbandc@quizbattle.local" },
        { id: challengerId, name: "Challenger BanDC", email: "challengerbandc@quizbattle.local" },
      ],
    });

    const hostToken = await createAuthToken(hostId, "Host BanDC", "hostbandc@quizbattle.local");
    const challengerToken = await createAuthToken(challengerId, "Challenger BanDC", "challengerbandc@quizbattle.local");

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

      const hostBanStartPromise = new Promise<{ currentBanningPlayerId: string }>((resolve) => {
        hostSocket.once("match:ban_phase_start", resolve);
      });

      await new Promise<void>((resolve, reject) => {
        challengerSocket.emit("room:join", { code: roomCode }, (res) => {
          if (res.success) resolve();
          else reject(new Error(res.error));
        });
      });

      // Wait for ban phase to start
      await hostBanStartPromise;

      // Track match:end on host
      const hostMatchEndPromise = new Promise<MatchEndPayload>((resolve) => {
        hostSocket.once("match:end", resolve);
      });

      // Challenger drops connection while ban phase is active
      challengerSocket.disconnect();

      // Host should receive match:end forfeit payload once disconnect grace period (150ms) expires
      const endPayload = await hostMatchEndPromise;

      expect(endPayload.isForfeit).toBe(true);
      expect(endPayload.winnerId).toBe(hostId);
      expect(endPayload.winnerName).toBe("Host BanDC");

      // Verify DB persistence
      await new Promise((r) => setTimeout(r, 60));
      const persistedMatch = await prisma.match.findFirst({
        where: { roomCode },
      });
      expect(persistedMatch).not.toBeNull();
      expect(persistedMatch?.isForfeit).toBe(true);
      expect(persistedMatch?.winnerId).toBe(hostId);
    } finally {
      hostSocket.disconnect();
      challengerSocket.disconnect();
    }
  });
});
