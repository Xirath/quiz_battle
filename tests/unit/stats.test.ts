import { describe, it, expect } from "vitest";
import { calculatePlayerStats } from "@/lib/stats";

describe("calculatePlayerStats", () => {
  it("returns 0% win rate when a player has played 0 matches", () => {
    const stats = calculatePlayerStats({
      wins: 0,
      losses: 0,
      totalMatches: 0,
      totalCorrectAnswers: 0,
    });

    expect(stats.winRate).toBe(0);
    expect(stats.totalMatches).toBe(0);
    expect(stats.wins).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.totalCorrectAnswers).toBe(0);
  });

  it("calculates exact win rate percentage for normal match record", () => {
    const stats = calculatePlayerStats({
      wins: 3,
      losses: 2,
      totalMatches: 5,
      totalCorrectAnswers: 24,
    });

    expect(stats.winRate).toBe(60);
    expect(stats.wins).toBe(3);
    expect(stats.losses).toBe(2);
    expect(stats.totalMatches).toBe(5);
    expect(stats.totalCorrectAnswers).toBe(24);
  });

  it("rounds win rate percentage to the nearest integer", () => {
    const stats = calculatePlayerStats({
      wins: 1,
      losses: 2,
      totalMatches: 3,
      totalCorrectAnswers: 8,
    });

    // 1 / 3 = 33.333... -> 33
    expect(stats.winRate).toBe(33);
  });

  it("handles 100% win rate correctly", () => {
    const stats = calculatePlayerStats({
      wins: 7,
      losses: 0,
      totalMatches: 7,
      totalCorrectAnswers: 42,
    });

    expect(stats.winRate).toBe(100);
  });
});
