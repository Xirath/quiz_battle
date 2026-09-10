import Image from "next/image";
import type { AuthenticatedUser, RoomState, MatchEndPayload } from "@/server/types";
import { NeonStar } from "./neon-star";

export interface MatchResultModalProps {
  room: RoomState;
  currentUser: AuthenticatedUser;
  matchEnd: MatchEndPayload;
  rematchRequestedBy?: string[];
  onPlayAgain?: () => void;
  onLeaveRoom?: () => void;
}

interface PlayerResultCardProps {
  player: AuthenticatedUser | null;
  isCurrentUser: boolean;
  score: number;
  role: "Host" | "Challenger";
  isWinner: boolean;
}

function PlayerResultCard({
  player,
  isCurrentUser,
  score,
  role,
  isWinner,
}: PlayerResultCardProps) {
  const isHost = role === "Host";
  const borderColor = isHost ? "border-primary" : "border-accent";
  const textColor = isHost ? "text-primary" : "text-accent";
  const starVariant = isHost ? "primary" : "accent";

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl p-4 text-center space-y-3 transition-all ${
        isWinner
          ? `border-2 ${isHost ? "border-primary/60 bg-primary/10 ring-primary/20" : "border-accent/60 bg-accent/10 ring-accent/20"} shadow-md ring-2`
          : "border border-border/60 bg-card/60"
      }`}
    >
      <div className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 ${borderColor} bg-muted`}>
        {player?.image ? (
          <Image
            src={player.image}
            alt={player.name ?? role}
            width={64}
            height={64}
            className="h-full w-full rounded-full object-cover"
            unoptimized
          />
        ) : (
          <span className="text-xl font-bold text-foreground">
            {(player?.name ?? role.charAt(0)).charAt(0).toUpperCase()}
          </span>
        )}
        {isWinner && (
          <span className="absolute -top-2 -right-2 text-xl drop-shadow">👑</span>
        )}
      </div>

      <div>
        <p className="truncate text-sm font-bold text-foreground">
          {player?.name ?? role}
        </p>
        <p className="text-[11px] font-semibold text-muted-foreground">
          {isCurrentUser ? "You" : "Opponent"}
        </p>
      </div>

      <div className="flex items-center gap-1">
        {[...Array(6)].map((_, i) => (
          <NeonStar
            key={`${role.toLowerCase()}-final-star-${i}`}
            filled={i < score}
            variant={starVariant}
            size="lg"
          />
        ))}
      </div>

      <div className={`font-mono text-2xl font-black ${textColor}`}>
        {score}{" "}
        <span className="text-xs font-semibold text-muted-foreground font-sans">
          Score
        </span>
      </div>
    </div>
  );
}

export function MatchResultModal({
  room,
  currentUser,
  matchEnd,
  rematchRequestedBy = [],
  onPlayAgain,
  onLeaveRoom,
}: MatchResultModalProps) {
  const isWinner = matchEnd.winnerId === currentUser.id;
  const isHost = room.host.id === currentUser.id;
  const opponent = isHost ? room.challenger : room.host;
  const iRequestedRematch = rematchRequestedBy.includes(currentUser.id);
  const opponentRequestedRematch = opponent ? rematchRequestedBy.includes(opponent.id) : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border-2 border-border bg-card p-6 shadow-2xl sm:p-8 space-y-6">
        {/* Glow Header Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-widest bg-muted border border-border">
            <span>⚔️</span>
            <span>Match Conclusion</span>
            {matchEnd.isSuddenDeath && (
              <span className="text-destructive font-black">• Sudden Death</span>
            )}
            {matchEnd.isForfeit && (
              <span className="text-warning font-black">• Forfeit Victory</span>
            )}
          </div>

          <div className="py-2">
            <h1
              className={`text-5xl font-black tracking-tight drop-shadow-md sm:text-6xl ${
                isWinner
                  ? "text-primary drop-shadow-[0_0_24px_var(--primary)] animate-bounce"
                  : "text-muted-foreground"
              }`}
            >
              {isWinner
                ? matchEnd.isForfeit
                  ? "🏆 FORFEIT WIN!"
                  : "🏆 VICTORY!"
                : matchEnd.isForfeit
                ? "FORFEIT"
                : "DEFEAT"}
            </h1>
            <p className="text-sm font-bold text-muted-foreground pt-1">
              {isWinner
                ? matchEnd.isForfeit
                  ? "Opponent forfeited / disconnected — you won by forfeit!"
                  : "You emerged triumphant in the battle arena!"
                : matchEnd.isForfeit
                ? "Match concluded by forfeit."
                : `${matchEnd.winnerName ?? "Opponent"} took the victory!`}
            </p>
          </div>
        </div>

        {/* Final Scoreboard Card */}
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-muted/30 p-5 shadow-inner">
          <PlayerResultCard
            player={room.host}
            isCurrentUser={isHost}
            score={matchEnd.hostScore}
            role="Host"
            isWinner={matchEnd.winnerId === room.host.id}
          />
          <PlayerResultCard
            player={room.challenger}
            isCurrentUser={!isHost}
            score={matchEnd.challengerScore}
            role="Challenger"
            isWinner={matchEnd.winnerId === room.challenger?.id}
          />
        </div>

        {/* Rematch Status Notice (only for normal match conclusions) */}
        {!matchEnd.isForfeit && opponentRequestedRematch && !iRequestedRematch && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/15 p-3 text-center text-sm font-bold text-accent animate-pulse">
            <span>⚡</span>
            <span>{opponent?.name ?? "Opponent"} wants a rematch! Click Play Again to start!</span>
          </div>
        )}

        {!matchEnd.isForfeit && iRequestedRematch && !opponentRequestedRematch && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/50 bg-primary/10 p-3 text-center text-sm font-bold text-primary">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Rematch requested! Waiting for {opponent?.name ?? "opponent"} to accept...</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          {!matchEnd.isForfeit && (
            <button
              type="button"
              onClick={onPlayAgain}
              disabled={iRequestedRematch}
              className="flex-1 cursor-pointer rounded-xl bg-primary py-3.5 px-6 text-center text-sm font-extrabold text-primary-foreground shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <span>🔄</span>
              <span>{iRequestedRematch ? "Waiting for Opponent..." : "Play Again (Rematch)"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLeaveRoom}
            className={`cursor-pointer rounded-xl border border-border py-3.5 px-6 text-center text-sm font-bold transition-colors active:scale-[0.98] ${
              matchEnd.isForfeit
                ? "flex-1 bg-primary text-primary-foreground shadow-lg hover:opacity-90 font-extrabold"
                : "bg-secondary text-secondary-foreground hover:bg-secondary-hover"
            }`}
          >
            {matchEnd.isForfeit ? "Return to Home" : "Leave Match"}
          </button>
        </div>
      </div>
    </div>
  );
}
