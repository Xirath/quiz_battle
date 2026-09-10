"use client";

import Image from "next/image";
import type { AuthenticatedUser, RoomState, ClientQuestion } from "@/server/types";

export interface BattleArenaProps {
  room: RoomState;
  currentUser: AuthenticatedUser;
  question: ClientQuestion;
  roundNumber: number;
  hostScore?: number;
  challengerScore?: number;
  selectedOption?: string | null;
  onSelectOption?: (option: string) => void;
  onLeaveRoom?: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

function PlayerScoreCard({
  player,
  isCurrentUser,
  score,
  role,
  align = "left",
}: {
  player: AuthenticatedUser | null;
  isCurrentUser: boolean;
  score: number;
  role: "Host" | "Challenger";
  align?: "left" | "right";
}) {
  const isRight = align === "right";

  return (
    <div className={`flex items-center gap-3 ${isRight ? "justify-end text-right" : "text-left"}`}>
      {!isRight && (
        <div className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${role === "Host" ? "border-primary" : "border-accent"} bg-muted`}>
          {player?.image ? (
            <Image
              src={player.image}
              alt={player.name ?? role}
              width={48}
              height={48}
              className="h-full w-full rounded-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-sm font-bold text-foreground">
              {(player?.name ?? role.charAt(0)).charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 ${isRight ? "justify-end" : ""}`}>
          <p className="truncate text-sm font-bold text-foreground">
            {player?.name ?? role}
          </p>
          {isCurrentUser && (
            <span className={`rounded ${role === "Host" ? "bg-primary/15 text-primary" : "bg-accent/20 text-accent-foreground"} px-1.5 py-0.5 text-[10px] font-semibold`}>
              You
            </span>
          )}
        </div>
        {/* Score indicator dots (Race to 6) */}
        <div className={`flex items-center gap-1 pt-1 ${isRight ? "justify-end" : ""}`}>
          {isRight && (
            <span className="mr-1 text-xs font-bold text-accent">
              {score}/6
            </span>
          )}
          {[...Array(6)].map((_, i) => (
            <span
              key={`${role}-score-${i}`}
              className={`h-2.5 w-2.5 rounded-full transition-all ${
                i < score
                  ? `${role === "Host" ? "bg-primary ring-primary/30" : "bg-accent ring-accent/30"} shadow-xs ring-2`
                  : "bg-muted border border-border"
              }`}
            />
          ))}
          {!isRight && (
            <span className="ml-1 text-xs font-bold text-primary">
              {score}/6
            </span>
          )}
        </div>
      </div>

      {isRight && (
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-muted">
          {player?.image ? (
            <Image
              src={player.image}
              alt={player.name ?? role}
              width={48}
              height={48}
              className="h-full w-full rounded-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-sm font-bold text-foreground">
              {(player?.name ?? role.charAt(0)).charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function BattleArena({
  room,
  currentUser,
  question,
  roundNumber,
  hostScore = 0,
  challengerScore = 0,
  selectedOption = null,
  onSelectOption,
  onLeaveRoom,
}: BattleArenaProps) {
  const isHost = room.host.id === currentUser.id;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Match Scoreboard Header */}
      <div className="grid grid-cols-3 items-center rounded-2xl border border-border bg-card p-4 shadow-sm">
        {/* Host Info */}
        <PlayerScoreCard
          player={room.host}
          isCurrentUser={isHost}
          score={hostScore}
          role="Host"
          align="left"
        />

        {/* Round Center Indicator */}
        <div className="text-center">
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-black tracking-wider uppercase text-primary">
            Round {roundNumber}
          </span>
          <p className="pt-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Race to 6 Correct
          </p>
        </div>

        {/* Challenger Info */}
        <PlayerScoreCard
          player={room.challenger}
          isCurrentUser={!isHost}
          score={challengerScore}
          role="Challenger"
          align="right"
        />
      </div>

      {/* Question Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
            <span>🏷️</span>
            <span>{question.category}</span>
          </div>

          <h2 className="text-xl font-extrabold leading-relaxed text-foreground sm:text-2xl">
            {question.question}
          </h2>
        </div>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {question.options.map((option, index) => {
          const label = OPTION_LABELS[index] ?? String(index + 1);
          const isSelected = selectedOption === option;

          return (
            <button
              key={`${question.roundNumber}-opt-${index}`}
              type="button"
              disabled={selectedOption !== null}
              onClick={() => onSelectOption?.(option)}
              className={`group flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] disabled:cursor-default ${
                isSelected
                  ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/40 shadow-sm"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/60 text-foreground"
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black transition-colors ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground group-hover:bg-primary/20 group-hover:text-primary"
                }`}
              >
                {label}
              </div>
              <span className="text-base font-semibold leading-snug">
                {option}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Navigation & Status */}
      <div className="flex items-center justify-between pt-2">
        {onLeaveRoom && (
          <button
            type="button"
            onClick={onLeaveRoom}
            className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Forfeit / Leave Match
          </button>
        )}
        <span className="text-xs text-muted-foreground font-mono">
          Room: {room.code}
        </span>
      </div>
    </div>
  );
}
