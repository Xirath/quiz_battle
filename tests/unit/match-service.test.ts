import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordMatchResult } from "@/lib/match-service";

describe("match-service persistence and stats mutation", () => {
  const hostEmail = "host-player@quizbattle.local";
  const challengerEmail = "challenger-player@quizbattle.local";
  let hostId: string;
  let challengerId: string;

  beforeEach(async () => {
    await prisma.match.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { in: [hostEmail, challengerEmail] },
      },
    });

    const host = await prisma.user.create({
      data: {
        email: hostEmail,
        name: "Host Player",
        wins: 2,
        losses: 1,
        totalMatches: 3,
        totalCorrectAnswers: 12,
      },
    });
    hostId = host.id;

    const challenger = await prisma.user.create({
      data: {
        email: challengerEmail,
        name: "Challenger Player",
        wins: 1,
        losses: 2,
        totalMatches: 3,
        totalCorrectAnswers: 10,
      },
    });
    challengerId = challenger.id;
  });

  it("persists a normal match and updates both players' lifetime statistics", async () => {
    const match = await recordMatchResult({
      roomCode: "TEST66",
      hostId,
      challengerId,
      winnerId: hostId,
      hostScore: 6,
      challengerScore: 4,
      roundsPlayed: 7,
      isSuddenDeath: false,
    });

    expect(match.id).toBeDefined();
    expect(match.roomCode).toBe("TEST66");
    expect(match.hostId).toBe(hostId);
    expect(match.challengerId).toBe(challengerId);
    expect(match.winnerId).toBe(hostId);
    expect(match.hostScore).toBe(6);
    expect(match.challengerScore).toBe(4);
    expect(match.roundsPlayed).toBe(7);
    expect(match.isSuddenDeath).toBe(false);

    // Verify updated host stats
    const updatedHost = await prisma.user.findUnique({ where: { id: hostId } });
    expect(updatedHost?.wins).toBe(3); // 2 + 1
    expect(updatedHost?.losses).toBe(1); // 1 + 0
    expect(updatedHost?.totalMatches).toBe(4); // 3 + 1
    expect(updatedHost?.totalCorrectAnswers).toBe(18); // 12 + 6

    // Verify updated challenger stats
    const updatedChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
    expect(updatedChallenger?.wins).toBe(1); // 1 + 0
    expect(updatedChallenger?.losses).toBe(3); // 2 + 1
    expect(updatedChallenger?.totalMatches).toBe(4); // 3 + 1
    expect(updatedChallenger?.totalCorrectAnswers).toBe(14); // 10 + 4
  });

  it("persists a sudden death overtime match correctly", async () => {
    const match = await recordMatchResult({
      roomCode: "SUDDEN",
      hostId,
      challengerId,
      winnerId: challengerId,
      hostScore: 7,
      challengerScore: 8,
      roundsPlayed: 11,
      isSuddenDeath: true,
    });

    expect(match.winnerId).toBe(challengerId);
    expect(match.isSuddenDeath).toBe(true);

    const updatedHost = await prisma.user.findUnique({ where: { id: hostId } });
    expect(updatedHost?.wins).toBe(2);
    expect(updatedHost?.losses).toBe(2); // 1 + 1
    expect(updatedHost?.totalMatches).toBe(4);

    const updatedChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
    expect(updatedChallenger?.wins).toBe(2); // 1 + 1
    expect(updatedChallenger?.losses).toBe(2);
    expect(updatedChallenger?.totalMatches).toBe(4);
  });

  it("persists a forfeit victory and updates statistics accordingly", async () => {
    const match = await recordMatchResult({
      roomCode: "FORFEIT1",
      hostId,
      challengerId,
      winnerId: hostId,
      hostScore: 3,
      challengerScore: 2,
      roundsPlayed: 4,
      isForfeit: true,
    });

    expect(match.winnerId).toBe(hostId);
    expect(match.isForfeit).toBe(true);

    const updatedHost = await prisma.user.findUnique({ where: { id: hostId } });
    expect(updatedHost?.wins).toBe(3); // 2 + 1
    expect(updatedHost?.losses).toBe(1); // 1 + 0
    expect(updatedHost?.totalMatches).toBe(4); // 3 + 1
    expect(updatedHost?.totalCorrectAnswers).toBe(15); // 12 + 3

    const updatedChallenger = await prisma.user.findUnique({ where: { id: challengerId } });
    expect(updatedChallenger?.wins).toBe(1); // 1 + 0
    expect(updatedChallenger?.losses).toBe(3); // 2 + 1
    expect(updatedChallenger?.totalMatches).toBe(4); // 3 + 1
    expect(updatedChallenger?.totalCorrectAnswers).toBe(12); // 10 + 2
  });
});
