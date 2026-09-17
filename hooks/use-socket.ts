"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { fetchSocketToken } from "@/lib/socket-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  AuthenticatedUser,
} from "@/server/types";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "unauthorized"
  | "error";

export function useSocket(options: { autoConnect?: boolean } = { autoConnect: true }) {
  const autoConnect = options.autoConnect ?? true;
  const [status, setStatus] = useState<ConnectionStatus>(autoConnect ? "connecting" : "idle");
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    let socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
    let isCancelled = false;

    async function initSocket() {
      const serverUrl =
        process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";

      const token = await fetchSocketToken();
      if (isCancelled) return;

      socketInstance = io(serverUrl, {
        withCredentials: true,
        auth: token ? { token } : undefined,
        query: token ? { token } : undefined,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      socketInstance.on("connect", () => {
        setStatus("connected");
        setError(null);
      });

      socketInstance.on("auth:success", (authUser) => {
        setUser(authUser);
      });

      socketInstance.on("connect_error", (err) => {
        if (err.message.includes("Unauthorized") || err.message.includes("Authentication error")) {
          setStatus("unauthorized");
          setError("Unauthorized (Please sign in to connect)");
        } else {
          setStatus("error");
          setError(err.message || "Failed to connect to game server");
        }
      });

      socketInstance.on("disconnect", (reason) => {
        setStatus("disconnected");
        if (reason === "io server disconnect") {
          socketInstance?.connect();
        }
      });
    }

    initSocket();

    return () => {
      isCancelled = true;
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [autoConnect]);

  return {
    status,
    isConnected: status === "connected",
    user,
    error,
  };
}
