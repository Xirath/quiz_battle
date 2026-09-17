import { io, type Socket, type ManagerOptions, type SocketOptions } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/server/types";

export async function fetchSocketToken(): Promise<string | undefined> {
  try {
    const res = await fetch("/api/auth/socket-token");
    if (res.ok) {
      const data = await res.json();
      return data.token;
    }
  } catch (err) {
    console.warn("[SocketClient] Failed to fetch socket auth token:", err);
  }
  return undefined;
}

export type BattleSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export async function createGameSocket(
  customOptions: Partial<ManagerOptions & SocketOptions> = {}
): Promise<BattleSocket> {
  const serverUrl =
    process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";

  const token = await fetchSocketToken();

  return io(serverUrl, {
    withCredentials: true,
    auth: token ? { token } : undefined,
    query: token ? { token } : undefined,
    transports: ["websocket", "polling"],
    ...customOptions,
  });
}
