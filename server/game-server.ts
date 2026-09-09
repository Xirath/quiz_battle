import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as SocketIOServer } from "socket.io";
import { createAuthMiddleware } from "./auth-middleware";
import { RoomManager, defaultRoomManager } from "./room-manager";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types";

export interface GameServerOptions {
  port?: number;
  corsOrigin?: string | string[];
  secret?: string;
  roomManager?: RoomManager;
}

export function createGameServer(options: GameServerOptions = {}) {
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
  const corsOrigin =
    options.corsOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
  const roomManager = options.roomManager ?? (options.port === 0 ? new RoomManager() : defaultRoomManager);

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

    socket.on("room:join", (data, callback) => {
      try {
        if (!data?.code) {
          throw new Error("Room code is required");
        }

        const room = roomManager.joinRoom(data.code, user);
        socket.data.roomCode = room.code;
        socket.join(`room:${room.code}`);

        if (typeof callback === "function") {
          callback({ success: true, room });
        }

        // Notify both players of the updated room state
        io.to(`room:${room.code}`).emit("room:state", room);
        io.to(`room:${room.code}`).emit("room:player_joined", {
          player: user,
          room,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to join room";
        if (typeof callback === "function") {
          callback({ success: false, error: message });
        }
        socket.emit("room:error", { message });
      }
    });

    socket.on("room:leave", (data) => {
      const code = data?.code || socket.data.roomCode;
      if (code) {
        socket.leave(`room:${code}`);
        const updatedRoom = roomManager.leaveRoom(code, user.id);
        socket.data.roomCode = undefined;

        if (updatedRoom) {
          io.to(`room:${code}`).emit("room:state", updatedRoom);
          io.to(`room:${code}`).emit("room:player_left", {
            playerId: user.id,
            room: updatedRoom,
          });
        }
      }
    });

    socket.on("disconnect", (reason) => {
      if (socket.data.roomCode) {
        const code = socket.data.roomCode;
        const updatedRoom = roomManager.leaveRoom(code, user.id);

        if (updatedRoom) {
          io.to(`room:${code}`).emit("room:state", updatedRoom);
          io.to(`room:${code}`).emit("room:player_left", {
            playerId: user.id,
            room: updatedRoom,
          });
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
        io.close(() => {
          httpServer.close(() => {
            resolve();
          });
        });
      });
    },
  };
}
