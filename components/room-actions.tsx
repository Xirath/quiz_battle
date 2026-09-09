"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/server/types";

export function RoomActions() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = () => {
    setIsCreating(true);
    setError(null);

    const serverUrl =
      process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      serverUrl,
      {
        withCredentials: true,
        transports: ["websocket", "polling"],
        reconnection: false,
      }
    );

    socket.on("connect", () => {
      socket.emit("room:create", (res) => {
        socket.disconnect();
        setIsCreating(false);

        if (res.success && res.code) {
          router.push(`/battle/${res.code}`);
        } else {
          setError(res.error || "Failed to create room");
        }
      });
    });

    socket.on("connect_error", (err) => {
      socket.disconnect();
      setIsCreating(false);
      setError(
        err.message.includes("Unauthorized")
          ? "Please sign in to create a room"
          : "Could not connect to game server"
      );
    });
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setError("Please enter a valid 6-character room code");
      return;
    }

    router.push(`/battle/${cleanCode}`);
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Host Button */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3 text-left">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            Host a Battle
          </h3>
          <span className="text-xs font-bold text-accent px-2 py-0.5 rounded-full bg-accent/10">
            1v1
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Create an instant room and invite a friend with a shareable 6-character code.
        </p>
        <button
          type="button"
          onClick={handleCreateRoom}
          disabled={isCreating}
          className="w-full cursor-pointer rounded-lg bg-primary py-3 px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
        >
          {isCreating ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Creating Room...
            </>
          ) : (
            <>⚡ Create New Battle Room</>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="w-full border-t border-border" />
        <span className="absolute bg-background px-3 text-xs font-medium uppercase text-muted-foreground">
          or join existing
        </span>
      </div>

      {/* Join Room Form */}
      <form
        onSubmit={handleJoinRoom}
        className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4 text-left"
      >
        <h3 className="text-base font-semibold text-foreground">
          Join a Battle
        </h3>
        <p className="text-xs text-muted-foreground">
          Enter a 6-character room code from your opponent.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="e.g. 7K2M9X"
            maxLength={6}
            className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-center text-base font-mono font-bold tracking-widest text-foreground uppercase placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={roomCode.trim().length !== 6}
            className="cursor-pointer rounded-lg bg-secondary px-5 py-2 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Join
          </button>
        </div>
      </form>
    </div>
  );
}
