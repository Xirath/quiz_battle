import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server as SocketIOServer } from "socket.io";
import { createAuthMiddleware } from "./auth-middleware";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types";

export interface GameServerOptions {
  port?: number;
  corsOrigin?: string | string[];
  secret?: string;
}

export function createGameServer(options: GameServerOptions = {}) {
  const port = options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
  const corsOrigin =
    options.corsOrigin ?? process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

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

    socket.on("disconnect", (reason) => {
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
