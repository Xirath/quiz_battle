import { describe, it, expect } from "vitest";
import { resolveAuthProviders, formatUserSession } from "@/lib/auth/config";

describe("resolveAuthProviders", () => {
  it("uses mock credentials provider in dev when Google credentials are not provided", () => {
    const providers = resolveAuthProviders({
      nodeEnv: "development",
      googleClientId: undefined,
      googleClientSecret: undefined,
    });

    expect(providers.length).toBeGreaterThan(0);
    const mockProvider = providers.find((p) => p.type === "credentials");
    expect(mockProvider).toBeDefined();
    expect(mockProvider?.type).toBe("credentials");
  });

  it("configures Google provider when credentials are provided", () => {
    const providers = resolveAuthProviders({
      nodeEnv: "development",
      googleClientId: "mock-client-id",
      googleClientSecret: "mock-client-secret",
    });

    const googleProvider = providers.find((p) => p.id === "google");
    expect(googleProvider).toBeDefined();
  });
});

describe("formatUserSession", () => {
  it("enriches session with player stats counters and win rate", () => {
    const user = {
      id: "player-123",
      name: "Quiz Champion",
      email: "champion@quizbattle.local",
      image: "https://example.com/avatar.png",
      wins: 10,
      losses: 5,
      totalMatches: 15,
      totalCorrectAnswers: 72,
    };

    const formatted = formatUserSession(user);

    expect(formatted.user.id).toBe("player-123");
    expect(formatted.user.name).toBe("Quiz Champion");
    expect(formatted.user.stats).toEqual({
      wins: 10,
      losses: 5,
      totalMatches: 15,
      totalCorrectAnswers: 72,
      winRate: 67, // 10/15 = 66.666% -> 67%
    });
  });
});
