export interface PlayerStatsCounters {
  wins: number;
  losses: number;
  totalMatches: number;
  totalCorrectAnswers: number;
}

export interface PlayerStatsSummary extends PlayerStatsCounters {
  winRate: number;
}

export function calculatePlayerStats(
  counters: PlayerStatsCounters
): PlayerStatsSummary {
  const { wins, losses, totalMatches, totalCorrectAnswers } = counters;

  const winRate =
    totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

  return {
    wins,
    losses,
    totalMatches,
    totalCorrectAnswers,
    winRate,
  };
}
