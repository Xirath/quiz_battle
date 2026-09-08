import { describe, it, expect, beforeEach } from "vitest";
import { getOrCreateUser, getUserProfileWithStats } from "@/lib/auth/user-service";
import { prisma } from "@/lib/prisma";

describe("user-service persistence and stats integration", () => {
  const testEmail = "test-player@quizbattle.local";

  beforeEach(async () => {
    // Clean up test player if exists
    await prisma.user.deleteMany({
      where: { email: testEmail },
    });
  });

  it("creates a new user with initialized 0 stats", async () => {
    const user = await getOrCreateUser({
      email: testEmail,
      name: "Test Warrior",
    });

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Test Warrior");
    expect(user.email).toBe(testEmail);
    expect(user.stats).toEqual({
      wins: 0,
      losses: 0,
      totalMatches: 0,
      totalCorrectAnswers: 0,
      winRate: 0,
    });
  });

  it("retrieves existing user and preserves updated lifetime stats", async () => {
    const created = await getOrCreateUser({
      email: testEmail,
      name: "Test Veteran",
    });

    // Simulate stats increment
    await prisma.user.update({
      where: { id: created.id },
      data: {
        wins: 4,
        losses: 1,
        totalMatches: 5,
        totalCorrectAnswers: 20,
      },
    });

    const profile = await getUserProfileWithStats(created.id);
    expect(profile).not.toBeNull();
    expect(profile?.stats).toEqual({
      wins: 4,
      losses: 1,
      totalMatches: 5,
      totalCorrectAnswers: 20,
      winRate: 80, // 4 / 5 = 80%
    });
  });
});
