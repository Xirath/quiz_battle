"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type {
  AuthenticatedUser,
  RoomState,
  CategoryBanState,
  CategoryItem,
} from "@/server/types";

export interface CategoryBanArenaProps {
  room: RoomState;
  currentUser: AuthenticatedUser;
  banState: CategoryBanState;
  selectedCategory?: CategoryItem | null;
  opponentDisconnected?: boolean;
  disconnectCountdown?: number;
  onBanCategory: (categoryId: number) => void;
}

const CATEGORY_ICONS: Record<number, string> = {
  9: "🧠", // General Knowledge
  10: "📚", // Books
  11: "🎬", // Film
  12: "🎵", // Music
  13: "🎭", // Musicals & Theatres
  14: "📺", // Television
  15: "🎮", // Video Games
  16: "🎲", // Board Games
  17: "🌿", // Science & Nature
  18: "💻", // Computers
  19: "📐", // Mathematics
  20: "⚡", // Mythology
  21: "⚽", // Sports
  22: "🌍", // Geography
  23: "🏛️", // History
  24: "⚖️", // Politics
  25: "🎨", // Art
  26: "🌟", // Celebrities
  27: "🦁", // Animals
  28: "🚗", // Vehicles
  29: "💥", // Comics
  30: "🔬", // Gadgets
  31: "✨", // Japanese Anime & Manga
  32: "🍿", // Cartoon & Animations
};

function getCategoryIcon(id: number): string {
  return CATEGORY_ICONS[id] ?? "🧠";
}

export function CategoryBanArena({
  room,
  currentUser,
  banState,
  selectedCategory,
  opponentDisconnected = false,
  disconnectCountdown = 30,
  onBanCategory,
}: CategoryBanArenaProps) {
  const [banningId, setBanningId] = useState<number | null>(null);

  const isMyTurn = banState.currentBanningPlayerId === currentUser.id;
  const isDecided = Boolean(selectedCategory || banState.selectedCategory);
  const finalCategory = selectedCategory || banState.selectedCategory;
  const isBanPending =
    banningId !== null &&
    !banState.bannedCategoryIds.includes(banningId) &&
    isMyTurn;

  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [dcSeconds, setDcSeconds] = useState(disconnectCountdown);
  const [prevDcProp, setPrevDcProp] = useState(disconnectCountdown);

  if (disconnectCountdown !== prevDcProp) {
    setPrevDcProp(disconnectCountdown);
    setDcSeconds(disconnectCountdown);
  }

  const currentBanningPlayer =
    room.host.id === banState.currentBanningPlayerId
      ? room.host
      : room.challenger;

  // Live disconnection grace period countdown (30s -> 0s)
  useEffect(() => {
    if (!opponentDisconnected) return;
    const interval = setInterval(() => {
      setDcSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [opponentDisconnected]);

  // Turn timer countdown calculation
  useEffect(() => {
    if (isDecided || opponentDisconnected) return;

    const calculateTimeLeft = () => {
      const remaining = Math.max(
        0,
        Math.ceil((banState.turnDeadline - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
    };

    const initialTimer = setTimeout(calculateTimeLeft, 0);
    const interval = setInterval(calculateTimeLeft, 100);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [banState.turnDeadline, isDecided, opponentDisconnected]);

  const handleSelect = (categoryId: number) => {
    if (!isMyTurn || isDecided || isBanPending || opponentDisconnected) return;
    if (banState.bannedCategoryIds.includes(categoryId)) return;

    setBanningId(categoryId);
    onBanCategory(categoryId);
  };

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-6 p-4">
      {/* Opponent Disconnection Warning Banner */}
      {opponentDisconnected && (
        <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <p className="text-xs sm:text-sm font-semibold">
              Opponent disconnected! Pausing veto turn while waiting for reconnection...
            </p>
          </div>
          <span className="font-mono text-xs sm:text-sm font-black">
            {dcSeconds}s
          </span>
        </div>
      )}

      {/* Header Banner */}
      <div className="w-full rounded-2xl border border-border/80 bg-card/90 p-6 text-center shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          {/* Host status */}
          <div className="flex items-center gap-3">
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                banState.currentBanningPlayerId === room.host.id && !isDecided
                  ? "border-primary ring-2 ring-primary/40 animate-pulse"
                  : "border-border"
              } bg-muted`}
            >
              {room.host.image ? (
                <Image
                  src={room.host.image}
                  alt={room.host.name ?? "Host"}
                  width={40}
                  height={40}
                  className="h-full w-full rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-xs font-bold">
                  {(room.host.name ?? "H").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-foreground truncate max-w-[120px] sm:max-w-[180px]">
                {room.host.name ?? "Host"}
                {room.host.id === currentUser.id && " (You)"}
              </p>
              <span className="text-[11px] text-muted-foreground">Host</span>
            </div>
          </div>

          {/* Center phase status & timer */}
          <div className="flex flex-col items-center">
            {isDecided ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/20 px-4 py-1.5 text-xs font-extrabold text-primary border border-primary/30 animate-bounce">
                🎉 CATEGORY DECIDED
              </div>
            ) : isMyTurn ? (
              <div className="flex flex-col items-center gap-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3.5 py-1 text-xs font-extrabold text-destructive border border-destructive/30 animate-pulse">
                  🚫 YOUR TURN TO VETO
                </span>
                <span className="font-mono text-lg font-black text-foreground">
                  {timeLeft}s
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground border border-border">
                  ⏳ {currentBanningPlayer?.name ?? "Opponent"} is vetoing...
                </span>
                <span className="font-mono text-sm font-bold text-muted-foreground">
                  {timeLeft}s
                </span>
              </div>
            )}
          </div>

          {/* Challenger status */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-foreground truncate max-w-[120px] sm:max-w-[180px]">
                {room.challenger?.name ?? "Challenger"}
                {room.challenger?.id === currentUser.id && " (You)"}
              </p>
              <span className="text-[11px] text-muted-foreground">Challenger</span>
            </div>
            <div
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                banState.currentBanningPlayerId === room.challenger?.id && !isDecided
                  ? "border-accent ring-2 ring-accent/40 animate-pulse"
                  : "border-border"
              } bg-muted`}
            >
              {room.challenger?.image ? (
                <Image
                  src={room.challenger.image}
                  alt={room.challenger.name ?? "Challenger"}
                  width={40}
                  height={40}
                  className="h-full w-full rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="text-xs font-bold">
                  {(room.challenger?.name ?? "C").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Phase instruction */}
        <p className="mt-4 text-xs sm:text-sm text-muted-foreground">
          {isDecided
            ? `The match will feature trivia questions exclusively from "${finalCategory?.name}"!`
            : "Players take turns striking out categories they do not want. The last remaining category will be played!"}
        </p>
      </div>

      {/* Category Cards Grid */}
      <div className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {banState.categories.map((category) => {
          const isBanned = banState.bannedCategoryIds.includes(category.id);
          const isWinner = isDecided && finalCategory?.id === category.id;
          const banEntry = banState.banHistory.find(
            (b) => b.categoryId === category.id
          );

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => handleSelect(category.id)}
              disabled={!isMyTurn || isBanned || isDecided || isBanPending || opponentDisconnected}
              className={`group relative flex flex-col items-center justify-center rounded-2xl border p-5 text-center transition-all duration-300 ${
                isWinner
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/20 scale-105 ring-2 ring-primary/50"
                  : isBanned
                  ? "border-destructive/30 bg-destructive/5 opacity-50 cursor-not-allowed scale-95 line-through"
                  : isMyTurn
                  ? "border-border bg-card hover:border-destructive hover:bg-destructive/10 hover:shadow-lg hover:shadow-destructive/20 cursor-pointer active:scale-95"
                  : "border-border bg-card/60 cursor-default opacity-80"
              }`}
            >
              {/* Category Icon */}
              <span
                className={`text-4xl transition-transform duration-300 ${
                  isWinner
                    ? "scale-125 animate-pulse"
                    : isBanned
                    ? "grayscale"
                    : isMyTurn
                    ? "group-hover:scale-110"
                    : ""
                }`}
              >
                {getCategoryIcon(category.id)}
              </span>

              {/* Category Name */}
              <h3
                className={`mt-3 text-sm font-bold ${
                  isWinner
                    ? "text-primary font-black"
                    : isBanned
                    ? "text-muted-foreground line-through"
                    : "text-foreground group-hover:text-destructive transition-colors"
                }`}
              >
                {category.name}
              </h3>

              {/* Status Badge */}
              {isWinner ? (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-extrabold text-primary border border-primary/40">
                  🏆 FINAL PICK
                </span>
              ) : isBanned ? (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2.5 py-0.5 text-[10px] font-bold text-destructive border border-destructive/30">
                  🚫 Vetoed by {banEntry?.bannedByPlayerName?.split(" ")[0] ?? "Player"}
                </span>
              ) : isMyTurn ? (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary group-hover:bg-destructive group-hover:text-destructive-foreground transition-all">
                  Click to Veto
                </span>
              ) : (
                <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Available
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
