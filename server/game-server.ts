import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as SocketIOServer } from "socket.io";
import { createAuthMiddleware } from "./auth-middleware";
import { RoomManager, defaultRoomManager } from "./room-manager";
import { OpenTdbClient, defaultOpenTdbClient } from "./open-tdb-client";
import { recordMatchResult, type RecordMatchParams } from "@/lib/match-service";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  MatchEndPayload,
} from "./types";

export interface GameServerOptions {
  port?: number;
  corsOrigin?: string | string[];
  secret?: string;
  roomManager?: RoomManager;
  openTdbClient?: OpenTdbClient;
  countdownIntervalMs?: number;
  roundDurationMs?: number;
  earlyRevealDebounceMs?: number;
  roundRevealDurationMs?: number;
  disconnectGracePeriodMs?: number;
  onMatchEnd?: (params: RecordMatchParams) => Promise<unknown> | void;
}

export function createGameServer(options: GameServerOptions = {}) {
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
  const corsOrigin =
    options.corsOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
  const roomManager = options.roomManager ?? (options.port === 0 ? new RoomManager() : defaultRoomManager);
  const openTdbClient = options.openTdbClient ?? defaultOpenTdbClient;
  const countdownIntervalMs = options.countdownIntervalMs ?? 1000;
  const roundDurationMs = options.roundDurationMs ?? 15000;
  const earlyRevealDebounceMs = options.earlyRevealDebounceMs ?? 500;
  const roundRevealDurationMs = options.roundRevealDurationMs ?? 4000;
  const disconnectGracePeriodMs = options.disconnectGracePeriodMs ?? 30000;

  const activeTimers = new Map<string, NodeJS.Timeout[]>();
  const disconnectTimers = new Map<string, NodeJS.Timeout>();

  const clearRoomTimers = (code: string) => {
    const timers = activeTimers.get(code);
    if (timers) {
      timers.forEach((t) => clearTimeout(t));
      activeTimers.delete(code);
    }
  };

  const clearDisconnectTimer = (code: string, playerId: string) => {
    const key = `${code.toUpperCase().trim()}:${playerId}`;
    const timer = disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
    }
  };

  const httpServer: HttpServer = createServer((req, res) => {
    // Health check endpoint
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "quiz-battle-game-server" }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  // Attach handshake authentication middleware
  io.use(createAuthMiddleware(options.secret));

  const persistMatchEnd = async (params: RecordMatchParams) => {
    try {
      if (options.onMatchEnd) {
        await options.onMatchEnd(params);
      } else {
        await recordMatchResult(params);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "test") {
        console.error(`[GameServer] Failed to persist match result for room ${params.roomCode}:`, err);
      }
    }
  };

  const advanceToNextRound = async (roomCode: string) => {
    let next = roomManager.nextRound(roomCode);
    if (!next) {
      // Prolonged sudden death: fetch more questions
      try {
        const extraQuestions = await openTdbClient.fetchQuestions(10);
        roomManager.addQuestions(roomCode, extraQuestions);
        next = roomManager.nextRound(roomCode);
      } catch (e) {
        if (process.env.NODE_ENV !== "test") {
          console.error(`[GameServer] Failed to fetch extra questions for sudden death:`, e);
        }
      }
    }
    if (next) {
      startRound(roomCode, next.roundNumber);
    }
  };

  const triggerRoundResult = async (roomCode: string) => {
    clearRoomTimers(roomCode);
    const result = roomManager.evaluateRound(roomCode);
    if (!result) return;

    io.to(`room:${roomCode}`).emit("round:result", result);

    if (result.matchEnded) {
      const room = roomManager.getRoom(roomCode);
      if (room) {
        clearDisconnectTimer(roomCode, room.host.id);
        if (room.challenger) {
          clearDisconnectTimer(roomCode, room.challenger.id);
        }
      }

      const winnerName =
        result.winnerId === room?.host.id
          ? (room?.host.name ?? "Host")
          : result.winnerId === room?.challenger?.id
          ? (room?.challenger?.name ?? "Challenger")
          : null;

      const endPayload: MatchEndPayload = {
        roomCode,
        winnerId: result.winnerId ?? null,
        winnerName,
        hostScore: result.hostScore,
        challengerScore: result.challengerScore,
        roundsPlayed: result.roundNumber,
        isSuddenDeath: result.isSuddenDeath,
        isForfeit: false,
        host: room ? { ...room.host } : undefined,
        challenger: room?.challenger ? { ...room.challenger } : null,
      };

      io.to(`room:${roomCode}`).emit("match:end", endPayload);

      if (room && room.challenger) {
        await persistMatchEnd({
          roomCode,
          hostId: room.host.id,
          challengerId: room.challenger.id,
          winnerId: result.winnerId ?? null,
          hostScore: result.hostScore,
          challengerScore: result.challengerScore,
          roundsPlayed: result.roundNumber,
          isSuddenDeath: result.isSuddenDeath,
          isForfeit: false,
        });
      }
      return;
    }

    const revealTimer = setTimeout(async () => {
      const match = roomManager.getMatch(roomCode);
      if (match?.disconnectedPlayerId) {
        // Player is disconnected: do not reveal next question/round.
        // Wait for player reconnection or disconnect timer expiration.
        activeTimers.delete(roomCode);
        return;
      }
      await advanceToNextRound(roomCode);
    }, roundRevealDurationMs);

    activeTimers.set(roomCode, [revealTimer]);
  };

  const startRound = (roomCode: string, roundNumber: number) => {
    clearRoomTimers(roomCode);
    const match = roomManager.startRound(roomCode, roundNumber);
    const question = roomManager.getCurrentRoundQuestion(roomCode);
    if (!question) return;

    const clientPayload = openTdbClient.toClientQuestion(question, roundNumber);
    io.to(`room:${roomCode}`).emit("round:start", {
      roundNumber,
      question: clientPayload,
      hostScore: match.hostScore,
      challengerScore: match.challengerScore,
      startTime: match.roundStartTime,
      isSuddenDeath: match.isSuddenDeath,
    });

    const expirationTimer = setTimeout(() => {
      triggerRoundResult(roomCode);
    }, roundDurationMs);

    activeTimers.set(roomCode, [expirationTimer]);
  };

  const startMatchSequence = (roomCode: string, isRematch = false) => {
    clearRoomTimers(roomCode);
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.challenger) {
      return;
    }
    if (!isRematch && room.status !== "ready") {
      return;
    }

    const timers: NodeJS.Timeout[] = [];
    activeTimers.set(roomCode, timers);

    // Concurrently initiate question pre-fetching so network latency does not block immediate countdown
    const questionsPromise = openTdbClient.fetchQuestions(20);

    // Synchronized 3-second countdown: 3 (0s) -> 2 (1s) -> 1 (2s) -> GO! (3s)
    const countdownTicks = [
      { count: 3, text: "3", delay: 0 },
      { count: 2, text: "2", delay: countdownIntervalMs },
      { count: 1, text: "1", delay: countdownIntervalMs * 2 },
      { count: 0, text: "GO!", delay: countdownIntervalMs * 3 },
    ];

    countdownTicks.forEach(({ count, text, delay }) => {
      const timer = setTimeout(() => {
        io.to(`room:${roomCode}`).emit("match:countdown", { count, text });
      }, delay);
      timers.push(timer);
    });

    // Deliver Round 1 upon countdown finish (at exactly 3s / countdownIntervalMs * 3)
    const roundStartTimer = setTimeout(async () => {
      try {
        const currentRoom = roomManager.getRoom(roomCode);
        if (!currentRoom || !currentRoom.challenger) {
          return;
        }

        const questions = await questionsPromise;
        if (isRematch) {
          roomManager.resetForRematch(roomCode, questions);
        } else {
          roomManager.startMatch(roomCode, questions);
        }

        const updatedRoom = roomManager.getRoom(roomCode);
        if (updatedRoom) {
          io.to(`room:${roomCode}`).emit("room:state", updatedRoom);
        }

        startRound(roomCode, 1);
      } catch (err) {
        if (process.env.NODE_ENV !== "test") {
          console.error(`[GameServer] Failed to start match for room ${roomCode}:`, err);
        }
        io.to(`room:${roomCode}`).emit("room:error", {
          message: "Failed to load trivia questions for match",
        });
      }
    }, countdownIntervalMs * 3);

    timers.push(roundStartTimer);
  };

  io.on("connection", (socket) => {
    const user = socket.data.user;

    // Send immediate auth confirmation
    socket.emit("auth:success", user);

    socket.on("ping", () => {
      socket.emit("server:status", {
        online: true,
        timestamp: Date.now(),
      });
    });

    // Room handlers
    socket.on("room:create", (callback) => {
      try {
        const room = roomManager.createRoom(user);

        if (typeof callback === "function") {
          callback({ success: true, code: room.code });
        }
        socket.emit("room:state", room);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create room";
        if (typeof callback === "function") {
          callback({ success: false, error: message });
        }
        socket.emit("room:error", { message });
      }
    });

    socket.on("room:join", async (data, callback) => {
      try {
        if (!data?.code) {
          throw new Error("Room code is required");
        }

        const room = roomManager.joinRoom(data.code, user);
        socket.data.roomCode = room.code;
        socket.join(`room:${room.code}`);

        // Clear any pending disconnect grace period timer for this player
        clearDisconnectTimer(room.code, user.id);
        roomManager.handlePlayerReconnect(room.code, user.id);

        if (typeof callback === "function") {
          callback({ success: true, room });
        }

        // Notify both players of the updated room state and reconnection
        io.to(`room:${room.code}`).emit("room:state", room);
        io.to(`room:${room.code}`).emit("player:reconnected", { playerId: user.id });
        io.to(`room:${room.code}`).emit("room:player_joined", {
          player: user,
          room,
        });

        // Check if match is already in progress and restore state to the reconnected socket
        const match = roomManager.getMatch(room.code);
        if (match && match.status !== "match_ended" && match.status !== "FORFEIT") {
          const roomTimers = activeTimers.get(room.code);
          const hasActiveTimers = Boolean(roomTimers && roomTimers.length > 0);

          if (match.status === "ROUND_RESULT" && !hasActiveTimers) {
            // Reveal intermission completed while disconnected; advance to next round upon reconnect
            await advanceToNextRound(room.code);
          } else {
            const restorePayload = roomManager.getMatchRestorePayload(room.code, user.id);
            if (restorePayload) {
              socket.emit("match:restore", restorePayload);
            }
          }
        } else if (room.status === "ready" && room.challenger !== null) {
          // Automatically trigger synchronized countdown once 2 players are present
          startMatchSequence(room.code);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to join room";
        if (typeof callback === "function") {
          callback({ success: false, error: message });
        }
        socket.emit("room:error", { message });
      }
    });

    socket.on("player:submit_answer", (data, callback) => {
      try {
        const roomCode = data?.roomCode || socket.data.roomCode;
        if (!roomCode) {
          throw new Error("Room code is required");
        }
        if (!data?.roundNumber || !data?.answer) {
          throw new Error("Round number and answer are required");
        }

        const result = roomManager.submitAnswer(
          roomCode,
          user.id,
          data.roundNumber,
          data.answer
        );

        if (typeof callback === "function") {
          callback({ success: true });
        }

        // Broadcast player:answered to all sockets in room without leaking answer
        io.to(`room:${roomCode}`).emit("player:answered", {
          playerId: user.id,
        });

        // If both players answered before timer expires, trigger early reveal after debounce
        if (result.bothAnswered) {
          clearRoomTimers(roomCode);
          const debounceTimer = setTimeout(() => {
            triggerRoundResult(roomCode);
          }, earlyRevealDebounceMs);
          activeTimers.set(roomCode, [debounceTimer]);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to submit answer";
        if (typeof callback === "function") {
          callback({ success: false, error: message });
        }
        socket.emit("room:error", { message });
      }
    });

    socket.on("match:play_again", (data, callback) => {
      try {
        const roomCode = data?.roomCode || socket.data.roomCode;
        if (!roomCode) {
          throw new Error("Room code is required");
        }

        const { requestedBy, bothReady } = roomManager.requestRematch(roomCode, user.id);

        if (typeof callback === "function") {
          callback({ success: true });
        }

        io.to(`room:${roomCode}`).emit("match:rematch_status", { requestedBy });

        if (bothReady) {
          startMatchSequence(roomCode, true);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to request rematch";
        if (typeof callback === "function") {
          callback({ success: false, error: message });
        }
        socket.emit("room:error", { message });
      }
    });

    socket.on("room:leave", async (data) => {
      const code = data?.code || socket.data.roomCode;
      if (code) {
        clearDisconnectTimer(code, user.id);
        socket.leave(`room:${code}`);
        socket.data.roomCode = undefined;

        const match = roomManager.getMatch(code);
        const isMatchActive = Boolean(
          match && match.status !== "match_ended" && match.status !== "FORFEIT"
        );

        if (isMatchActive) {
          clearRoomTimers(code);
          const forfeitEnd = roomManager.forfeitMatch(code, user.id);
          if (forfeitEnd) {
            io.to(`room:${code}`).emit("match:end", forfeitEnd);

            if (forfeitEnd.host && forfeitEnd.challenger && forfeitEnd.winnerId) {
              await persistMatchEnd({
                roomCode: code,
                hostId: forfeitEnd.host.id,
                challengerId: forfeitEnd.challenger.id,
                winnerId: forfeitEnd.winnerId,
                hostScore: forfeitEnd.hostScore,
                challengerScore: forfeitEnd.challengerScore,
                roundsPlayed: forfeitEnd.roundsPlayed,
                isSuddenDeath: forfeitEnd.isSuddenDeath,
                isForfeit: true,
              });
            }

            const updatedRoom = roomManager.leaveRoom(code, user.id);
            if (updatedRoom) {
              io.to(`room:${code}`).emit("room:state", updatedRoom);
              io.to(`room:${code}`).emit("room:player_left", {
                playerId: user.id,
                room: updatedRoom,
              });
            }
          }
        } else {
          clearRoomTimers(code);
          const updatedRoom = roomManager.leaveRoom(code, user.id);
          if (updatedRoom) {
            io.to(`room:${code}`).emit("room:state", updatedRoom);
            io.to(`room:${code}`).emit("room:player_left", {
              playerId: user.id,
              room: updatedRoom,
            });
          }
        }
      }
    });

    socket.on("disconnect", (reason) => {
      if (socket.data.roomCode) {
        const code = socket.data.roomCode;
        const disconnectResult = roomManager.handlePlayerDisconnect(code, user.id);

        if (disconnectResult?.isMatchActive) {
          const countdownSeconds = Math.ceil(disconnectGracePeriodMs / 1000);
          const disconnectTimestamp = Date.now();

          // Broadcast player:disconnected notification banner event to remaining player
          io.to(`room:${code}`).emit("player:disconnected", {
            playerId: user.id,
            playerName: user.name,
            countdownSeconds,
            disconnectTimestamp,
          });

          const timerKey = `${code.toUpperCase().trim()}:${user.id}`;
          clearDisconnectTimer(code, user.id);

          const timer = setTimeout(async () => {
            disconnectTimers.delete(timerKey);
            const forfeitEnd = roomManager.forfeitMatch(code, user.id);
            if (forfeitEnd) {
              clearRoomTimers(code);
              io.to(`room:${code}`).emit("match:end", forfeitEnd);

              if (forfeitEnd.host && forfeitEnd.challenger && forfeitEnd.winnerId) {
                await persistMatchEnd({
                  roomCode: code,
                  hostId: forfeitEnd.host.id,
                  challengerId: forfeitEnd.challenger.id,
                  winnerId: forfeitEnd.winnerId,
                  hostScore: forfeitEnd.hostScore,
                  challengerScore: forfeitEnd.challengerScore,
                  roundsPlayed: forfeitEnd.roundsPlayed,
                  isSuddenDeath: forfeitEnd.isSuddenDeath,
                  isForfeit: true,
                });
              }
            }
          }, disconnectGracePeriodMs);

          disconnectTimers.set(timerKey, timer);
        } else {
          clearRoomTimers(code);
          clearDisconnectTimer(code, user.id);
          const updatedRoom = roomManager.leaveRoom(code, user.id);

          if (updatedRoom) {
            io.to(`room:${code}`).emit("room:state", updatedRoom);
            io.to(`room:${code}`).emit("room:player_left", {
              playerId: user.id,
              room: updatedRoom,
            });
          }
        }
      }

      if (process.env.NODE_ENV !== "test") {
        console.log(
          `[GameServer] Player disconnected: ${user.name} (${user.id}), reason: ${reason}`
        );
      }
    });
  });

  return {
    server: httpServer,
    io,
    port,
    roomManager,
    openTdbClient,
    listen: (): Promise<{ port: number; address: string }> => {
      return new Promise((resolve, reject) => {
        httpServer.listen(port, () => {
          const addr = httpServer.address() as AddressInfo;
          resolve({
            port: addr.port,
            address: addr.address,
          });
        });

        httpServer.once("error", reject);
      });
    },
    close: (): Promise<void> => {
      return new Promise((resolve) => {
        // Clear all remaining timers
        for (const timers of activeTimers.values()) {
          timers.forEach((t) => clearTimeout(t));
        }
        activeTimers.clear();

        for (const timer of disconnectTimers.values()) {
          clearTimeout(timer);
        }
        disconnectTimers.clear();

        io.close(() => {
          httpServer.close(() => {
            resolve();
          });
        });
      });
    },
  };
}
