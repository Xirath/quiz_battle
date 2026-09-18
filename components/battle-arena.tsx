"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type {
  AuthenticatedUser,
  RoomState,
  ClientQuestion,
  RoundResultPayload,
} from "@/server/types";

import { NeonStar } from "./neon-star";

export interface BattleArenaProps {
  room: RoomState;
  currentUser: AuthenticatedUser;
  question: ClientQuestion;
  roundNumber: number;
  hostScore?: number;
  challengerScore?: number;
  startTime?: number;
  selectedOption?: string | null;
  opponentLockedIn?: boolean;
  roundResult?: RoundResultPayload | null;
  isSuddenDeath?: boolean;
  opponentDisconnected?: boolean;
  disconnectCountdown?: number;
  roundDurationMs?: number;
  onSelectOption?: (option: string) => void;
  onLeaveRoom?: () => void;
}

const OPTION_LABELS = ["A", "B", "C", "D"];
const SHORTCUT_KEYS = ["1", "2", "3", "4"];
const DEFAULT_ROUND_SECONDS = 15;

function PlayerScoreCard({
  player,
  isCurrentUser,
  score,
  role,
  align = "left",
  isLockedIn = false,
  isDisconnected = false,
}: {
  player: AuthenticatedUser | null;
  isCurrentUser: boolean;
  score: number;
  role: "Host" | "Challenger";
  align?: "left" | "right";
  isLockedIn?: boolean;
  isDisconnected?: boolean;
}) {
  const isRight = align === "right";

  return (
    <div
      className={`flex items-center gap-3 ${isRight ? "justify-end text-right" : "text-left"}`}
    >
      {!isRight && (
        <div
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 ${
            role === "Host" ? "border-primary" : "border-accent"
          } bg-muted`}
        >
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
        <div
          className={`flex items-center gap-1.5 ${isRight ? "justify-end" : ""}`}
        >
          <p className="truncate text-sm font-bold text-foreground">
            {player?.name ?? role}
          </p>
          {isCurrentUser && (
            <span
              className={`rounded ${
                role === "Host"
                  ? "bg-primary/15 text-primary"
                  : "bg-accent/20 text-accent-foreground"
              } px-1.5 py-0.5 text-[10px] font-semibold`}
            >
              You
            </span>
          )}
        </div>

        {/* Locked-in status badge */}
        {isLockedIn && !isDisconnected && (
          <div
            className={`flex items-center gap-1 pt-0.5 ${isRight ? "justify-end" : ""}`}
          >
            <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-extrabold text-accent animate-pulse">
              ⚡ Locked in
            </span>
          </div>
        )}

        {/* Disconnected status badge */}
        {isDisconnected && (
          <div
            className={`flex items-center gap-1 pt-0.5 ${isRight ? "justify-end" : ""}`}
          >
            <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-black text-warning animate-pulse">
              ⚠️ Disconnected
            </span>
          </div>
        )}

        {/* Score indicator glowing neon stars (Race to 6) */}
        <div
          className={`flex items-center gap-1 pt-1 ${isRight ? "justify-end" : ""}`}
        >
          {isRight && (
            <span className="mr-1 text-xs font-black text-accent">
              {score}/6
            </span>
          )}
          {[...Array(6)].map((_, i) => (
            <NeonStar
              key={`${role}-star-${i}`}
              filled={i < score}
              variant={role === "Host" ? "primary" : "accent"}
            />
          ))}
          {score > 6 && (
            <span
              className={`text-[11px] font-black ${role === "Host" ? "text-primary" : "text-accent"}`}
            >
              +{score - 6}
            </span>
          )}
          {!isRight && (
            <span className="ml-1 text-xs font-black text-primary">
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
  startTime,
  selectedOption = null,
  opponentLockedIn = false,
  roundResult = null,
  isSuddenDeath = false,
  opponentDisconnected = false,
  disconnectCountdown = 30,
  roundDurationMs,
  onSelectOption,
  onLeaveRoom,
}: BattleArenaProps) {
  const isHost = room.host.id === currentUser.id;
  const isChallenger = room.challenger?.id === currentUser.id;

  const totalRoundSeconds =
    roundDurationMs !== undefined
      ? Math.max(1, Math.round(roundDurationMs / 1000))
      : DEFAULT_ROUND_SECONDS;

  // Active synchronized round countdown timer
  const [timeLeft, setTimeLeft] = useState(totalRoundSeconds);

  // Live disconnection grace period countdown (30s -> 0s)
  const [dcSeconds, setDcSeconds] = useState(disconnectCountdown);
  const [prevDcProp, setPrevDcProp] = useState(disconnectCountdown);

  if (disconnectCountdown !== prevDcProp) {
    setPrevDcProp(disconnectCountdown);
    setDcSeconds(disconnectCountdown);
  }

  useEffect(() => {
    if (!opponentDisconnected) return;
    const interval = setInterval(() => {
      setDcSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [opponentDisconnected]);

  useEffect(() => {
    if (roundResult) return;

    const roundStart = startTime ?? Date.now();
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - roundStart) / 1000;
      const remaining = Math.max(0, totalRoundSeconds - elapsedSeconds);
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [question, roundNumber, roundResult, startTime, totalRoundSeconds]);

  // Keyboard shortcut listener: '1'-'4' and 'A'-'D'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      ) {
        return;
      }

      // Can only submit if not already locked in and roundResult not showing
      if (selectedOption !== null || roundResult !== null) {
        return;
      }

      const key = e.key.toUpperCase();
      let selectedIndex = -1;

      if (key === "1" || key === "A") selectedIndex = 0;
      else if (key === "2" || key === "B") selectedIndex = 1;
      else if (key === "3" || key === "C") selectedIndex = 2;
      else if (key === "4" || key === "D") selectedIndex = 3;

      if (selectedIndex >= 0 && selectedIndex < question.options.length) {
        const option = question.options[selectedIndex];
        onSelectOption?.(option);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [question.options, selectedOption, roundResult, onSelectOption]);

  // Timer Bar Color Logic: Info / Cyan (100%-50%) -> Amber (50%-25%) -> Red (<25%)
  const timerPercentage = Math.min(
    100,
    Math.max(0, (timeLeft / totalRoundSeconds) * 100),
  );
  let timerBarColor = "bg-info shadow-xs";
  let timerTextColor = "text-info";

  if (timeLeft <= totalRoundSeconds * 0.25) {
    timerBarColor = "bg-destructive shadow-xs animate-pulse";
    timerTextColor = "text-destructive font-black animate-pulse";
  } else if (timeLeft <= totalRoundSeconds * 0.5) {
    timerBarColor = "bg-accent shadow-xs";
    timerTextColor = "text-accent";
  }

  // Round Result Evaluation Info
  const myAnswer = roundResult
    ? isHost
      ? roundResult.hostAnswer
      : roundResult.challengerAnswer
    : null;
  const myCorrect = roundResult
    ? isHost
      ? roundResult.hostCorrect
      : roundResult.challengerCorrect
    : null;
  const opponentCorrect = roundResult
    ? isHost
      ? roundResult.challengerCorrect
      : roundResult.hostCorrect
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Sudden Death Overtime Notice Banner */}
      {isSuddenDeath && (
        <div className="flex items-center justify-center gap-2.5 rounded-2xl border-2 border-destructive/80 bg-destructive/15 px-4 py-3 text-center shadow-lg animate-pulse">
          <span className="text-xl">⚡</span>
          <span className="text-sm font-black tracking-wider uppercase text-destructive">
            SUDDEN DEATH OVERTIME • 1-Question Rounds Until Scores Diverge!
          </span>
          <span className="text-xl">⚡</span>
        </div>
      )}

      {/* Opponent Disconnected Grace Period Countdown Banner */}
      {opponentDisconnected && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border-2 border-warning/60 bg-warning/15 px-5 py-3.5 text-center shadow-lg animate-pulse animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="text-xl">⚠️</span>
          <span className="text-sm font-black tracking-wide text-warning">
            Opponent disconnected — waiting for reconnection ({dcSeconds}s)
          </span>
        </div>
      )}

      {/* Match Scoreboard Header */}
      <div className="grid grid-cols-3 items-center rounded-2xl border border-border bg-card p-4 shadow-sm">
        {/* Host Info */}
        <PlayerScoreCard
          player={room.host}
          isCurrentUser={isHost}
          score={hostScore}
          role="Host"
          align="left"
          isLockedIn={isHost ? selectedOption !== null : opponentLockedIn}
          isDisconnected={!isHost && opponentDisconnected}
        />

        {/* Round Center Indicator */}
        <div className="text-center">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-black tracking-wider uppercase ${
              isSuddenDeath
                ? "bg-destructive/20 text-destructive animate-pulse"
                : "bg-primary/10 text-primary"
            }`}
          >
            {isSuddenDeath
              ? `Sudden Death R${roundNumber}`
              : `Round ${roundNumber}`}
          </span>
          <p className="pt-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {isSuddenDeath ? "Tiebreaker Round" : "Race to 6 Correct"}
          </p>
        </div>

        {/* Challenger Info */}
        <PlayerScoreCard
          player={room.challenger}
          isCurrentUser={isChallenger}
          score={challengerScore}
          role="Challenger"
          align="right"
          isLockedIn={isChallenger ? selectedOption !== null : opponentLockedIn}
          isDisconnected={!isChallenger && opponentDisconnected}
        />
      </div>

      {/* Opponent Locked-in Banner */}
      {opponentLockedIn && !roundResult && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 text-center text-sm font-bold text-accent shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="text-base">⚡</span>
          <span>Opponent locked in!</span>
        </div>
      )}

      {/* 4-Second Round Reveal Intermission Banner */}
      {roundResult && (
        <div
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center shadow-md animate-in zoom-in-95 duration-300 ${
            myCorrect
              ? "border-success/50 bg-success/15 text-success"
              : myAnswer
                ? "border-destructive/50 bg-destructive/15 text-destructive"
                : "border-accent/50 bg-accent/15 text-accent"
          }`}
        >
          <div className="flex items-center gap-2 text-lg font-black">
            <span>{myCorrect ? "🎉" : myAnswer ? "❌" : "⏰"}</span>
            <span>
              {myCorrect
                ? "Correct Answer!"
                : myAnswer
                  ? "Incorrect Answer!"
                  : "Time Expired! (No Answer Submitted)"}
            </span>
          </div>
          <p className="text-xs font-semibold opacity-90">
            {opponentCorrect
              ? "Opponent answered correctly"
              : "Opponent answered incorrectly"}{" "}
            •{" "}
            {opponentDisconnected
              ? "Waiting for opponent to reconnect..."
              : "Next round starting shortly..."}
          </p>
        </div>
      )}

      {/* 15-Second Animated Synchronized Timer Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <span>⏱️</span>
            <span>{roundResult ? "Round Intermission" : "Round Timer"}</span>
          </span>
          <span className={`font-mono text-sm ${timerTextColor}`}>
            {roundResult ? "Reveal (4s)" : `${Math.ceil(timeLeft)}s`}
          </span>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-muted border border-border/80">
          <div
            className={`h-full rounded-full transition-all duration-100 ease-linear ${timerBarColor}`}
            style={{ width: roundResult ? "0%" : `${timerPercentage}%` }}
          />
        </div>
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
          const letterLabel = OPTION_LABELS[index] ?? String(index + 1);
          const shortcutKey = SHORTCUT_KEYS[index] ?? String(index + 1);
          const isSelected = selectedOption === option;

          // Reveal Intermission Color States
          let buttonStyle =
            "border-border bg-card hover:border-primary/50 hover:bg-muted/60 text-foreground";
          let badgeStyle =
            "bg-secondary text-secondary-foreground group-hover:bg-primary/20 group-hover:text-primary";
          let statusBadge = null;

          if (roundResult) {
            const isCorrectAnswer = option === roundResult.correctAnswer;
            const isMyChoice = option === myAnswer;

            if (isCorrectAnswer) {
              // Neon Green highlight for correct answer
              buttonStyle =
                "border-success bg-success/20 text-success ring-2 ring-success/60 shadow-xs font-bold";
              badgeStyle = "bg-success text-success-foreground";
              statusBadge = (
                <span className="ml-auto rounded bg-success px-2 py-0.5 text-[11px] font-black text-success-foreground">
                  ✓ Correct
                </span>
              );
            } else if (isMyChoice && !isCorrectAnswer) {
              // Crimson Red highlight for user's incorrect choice
              buttonStyle =
                "border-destructive bg-destructive/20 text-destructive ring-2 ring-destructive/60 line-through opacity-90";
              badgeStyle = "bg-destructive text-destructive-foreground";
              statusBadge = (
                <span className="ml-auto rounded bg-destructive px-2 py-0.5 text-[11px] font-black text-destructive-foreground no-underline">
                  ✗ Your Answer
                </span>
              );
            } else {
              // Other options dimmed during reveal
              buttonStyle =
                "border-border/50 bg-card/40 text-muted-foreground opacity-40";
              badgeStyle = "bg-muted text-muted-foreground";
            }
          } else if (isSelected) {
            buttonStyle =
              "border-primary bg-primary/15 text-foreground ring-2 ring-primary/50 shadow-sm";
            badgeStyle = "bg-primary text-primary-foreground";
            statusBadge = (
              <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-[11px] font-extrabold text-primary">
                🔒 Locked in
              </span>
            );
          }

          return (
            <button
              key={`${question.roundNumber}-opt-${index}`}
              type="button"
              disabled={selectedOption !== null || roundResult !== null}
              onClick={() => onSelectOption?.(option)}
              className={`group flex w-full cursor-pointer items-center gap-4 rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] disabled:cursor-default ${buttonStyle}`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-black transition-colors ${badgeStyle}`}
              >
                {letterLabel}
              </div>

              <span className="text-base font-semibold leading-snug">
                {option}
              </span>

              {statusBadge}

              {/* Keyboard Shortcut Hint */}
              {!roundResult && selectedOption === null && (
                <span className="ml-auto hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground group-hover:border-primary/40 group-hover:text-foreground sm:inline-block">
                  [{shortcutKey}]
                </span>
              )}
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
          <span>Shortcuts: [1-4] or [A-D]</span>
          <span>•</span>
          <span>Room: {room.code}</span>
        </div>
      </div>
    </div>
  );
}
