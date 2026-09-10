"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RoomState,
  AuthenticatedUser,
  ClientQuestion,
} from "@/server/types";
import { BattleArena } from "./battle-arena";

export function BattleLobby({
  roomId,
  currentUser,
}: {
  roomId: string;
  currentUser: AuthenticatedUser;
}) {
  const router = useRouter();
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [countdown, setCountdown] = useState<{ count: number; text: string } | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<ClientQuestion | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    const serverUrl =
      process.env.NEXT_PUBLIC_GAME_SERVER_URL || "http://localhost:3001";

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      serverUrl,
      {
        withCredentials: true,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 5,
      }
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnecting(false);
      socket.emit("room:join", { code: roomId }, (res) => {
        if (res.success && res.room) {
          setRoom(res.room);
          setError(null);
        } else {
          setError(res.error || "Failed to join room");
        }
      });
    });

    socket.on("room:state", (updatedRoom) => {
      setRoom(updatedRoom);
      setError(null);
    });

    socket.on("room:player_joined", (data) => {
      setRoom(data.room);
    });

    socket.on("room:player_left", (data) => {
      setRoom(data.room);
      setCountdown(null);
      setActiveQuestion(null);
    });

    socket.on("room:error", (data) => {
      setError(data.message);
    });

    socket.on("match:countdown", (data) => {
      setCountdown(data);
    });

    socket.on("round:start", (data) => {
      setCountdown(null);
      setActiveQuestion(data.question);
      setRoundNumber(data.roundNumber);
      setSelectedOption(null);
    });

    socket.on("connect_error", (err) => {
      setIsConnecting(false);
      if (err.message.includes("Unauthorized")) {
        setError("Unauthorized: Please sign in to join this battle");
      } else {
        setError("Could not connect to game server");
      }
    });

    return () => {
      socket.emit("room:leave", { code: roomId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const handleCopyLink = async () => {
    try {
      const inviteUrl = `${window.location.origin}/battle/${roomId}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleLeave = () => {
    if (socketRef.current) {
      socketRef.current.emit("room:leave", { code: roomId });
    }
    router.push("/");
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-destructive/40 bg-card p-8 text-center shadow-lg space-y-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-2xl text-destructive">
          ⚠️
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Cannot Join Room</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <Link
          href="/"
          className="inline-flex w-full items-center justify-center rounded-lg bg-secondary py-2.5 px-4 text-sm font-semibold text-secondary-foreground transition-colors hover:bg-secondary-hover"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  if (isConnecting || !room) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-12 text-center shadow-sm space-y-4">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm font-medium text-muted-foreground">
          Entering battle room...
        </p>
      </div>
    );
  }

  // Active Battle Arena view once Round 1 has started
  if (activeQuestion) {
    return (
      <BattleArena
        room={room}
        currentUser={currentUser}
        question={activeQuestion}
        roundNumber={roundNumber}
        selectedOption={selectedOption}
        onSelectOption={(option) => setSelectedOption(option)}
        onLeaveRoom={handleLeave}
      />
    );
  }

  const isHost = room.host.id === currentUser.id;
  const isChallenger = room.challenger?.id === currentUser.id;
  const isReady = room.status === "ready" || room.status === "in_match" || countdown !== null;

  return (
    <div className="relative mx-auto max-w-3xl space-y-8 px-4 py-8">
      {/* Synchronized 3-Second Countdown Overlay */}
      {countdown !== null && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-md transition-all animate-in fade-in duration-200">
          <div className="space-y-6 text-center">
            <span className="rounded-full bg-primary/20 px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-primary">
              Match Starting
            </span>

            <div className="my-4">
              <span
                key={countdown.text}
                className="inline-block animate-bounce text-8xl font-black tracking-tight text-primary drop-shadow-lg sm:text-9xl"
              >
                {countdown.text}
              </span>
            </div>

            <p className="text-sm font-semibold text-muted-foreground">
              Prepare for Round 1!
            </p>
          </div>
        </div>
      )}

      {/* Top Banner: Room Code & Copy Link */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm sm:flex-row">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Battle Room Code
          </span>
          <div className="flex items-center gap-3 pt-1">
            <span className="font-mono text-3xl font-black tracking-widest text-primary">
              {room.code}
            </span>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
              {room.challenger ? "2/2 Players" : "1/2 Players"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyLink}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-secondary-foreground transition-all hover:bg-secondary-hover active:scale-95"
        >
          {copied ? (
            <>
              <span className="text-success font-bold">✓</span>
              <span>Link Copied!</span>
            </>
          ) : (
            <>
              <span>📋</span>
              <span>Copy Invite Link</span>
            </>
          )}
        </button>
      </div>

      {/* Status Notice */}
      <div
        className={`flex items-center justify-center gap-2.5 rounded-xl border p-4 text-center text-sm font-semibold ${
          isReady
            ? "border-success/30 bg-success/10 text-success"
            : "border-accent/30 bg-accent/10 text-accent animate-pulse"
        }`}
      >
        <span>{isReady ? "⚔️" : "⏳"}</span>
        <span>
          {isReady
            ? "Both players connected! Match starting..."
            : "Waiting for an opponent to join with your room code..."}
        </span>
      </div>

      {/* 2-Player Matchup Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Host Card */}
        <div className="relative rounded-2xl border-2 border-primary/50 bg-card p-6 shadow-sm text-center space-y-4">
          <div className="absolute top-3 right-3 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-primary-foreground">
            Host
          </div>

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary bg-muted">
            {room.host.image ? (
              <Image
                src={room.host.image}
                alt={room.host.name ?? "Host"}
                width={80}
                height={80}
                className="h-full w-full rounded-full object-cover"
                unoptimized
              />
            ) : (
              <span className="text-2xl font-bold text-foreground">
                {(room.host.name ?? "H").charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <h4 className="text-lg font-bold text-foreground">
              {room.host.name ?? "Host Player"}
            </h4>
            <p className="text-xs text-muted-foreground">
              {isHost ? "You" : "Opponent"}
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span>Ready</span>
          </div>
        </div>

        {/* Challenger Card */}
        <div
          className={`relative rounded-2xl border-2 p-6 shadow-sm text-center space-y-4 ${
            room.challenger
              ? "border-accent/50 bg-card"
              : "border-dashed border-border bg-card/40"
          }`}
        >
          <div className="absolute top-3 right-3 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-foreground">
            Challenger
          </div>

          {room.challenger ? (
            <>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-muted">
                {room.challenger.image ? (
                  <Image
                    src={room.challenger.image}
                    alt={room.challenger.name ?? "Challenger"}
                    width={80}
                    height={80}
                    className="h-full w-full rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    {(room.challenger.name ?? "C").charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-lg font-bold text-foreground">
                  {room.challenger.name ?? "Challenger"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isChallenger ? "You" : "Opponent"}
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span>Joined</span>
              </div>
            </>
          ) : (
            <div className="py-6 space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-border bg-muted/30 text-2xl text-muted-foreground">
                👤
              </div>
              <div>
                <h4 className="text-base font-semibold text-muted-foreground">
                  Waiting for Opponent...
                </h4>
                <p className="text-xs text-muted-foreground/80">
                  Share your 6-character code or invite link
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex justify-between items-center pt-4">
        <button
          type="button"
          onClick={handleLeave}
          className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Leave Battle Room
        </button>

        <span className="text-xs text-muted-foreground">
          Quiz Battle • Race to 6 Correct Answers
        </span>
      </div>
    </div>
  );
}
