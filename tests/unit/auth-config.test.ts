import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveAuthProviders,
  formatUserSession,
  isDevMockAuthEnabled,
} from "@/lib/auth/config";

describe("isDevMockAuthEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns override value when provided", () => {
    expect(isDevMockAuthEnabled(true)).toBe(true);
    expect(isDevMockAuthEnabled(false)).toBe(false);
  });

  it("respects ENABLE_DEV_MOCK_AUTH env variable", () => {
    process.env.ENABLE_DEV_MOCK_AUTH = "true";
    expect(isDevMockAuthEnabled()).toBe(true);

    process.env.ENABLE_DEV_MOCK_AUTH = "false";
    expect(isDevMockAuthEnabled()).toBe(false);
  });

  it("defaults to true in development and false in production", () => {
    delete process.env.ENABLE_DEV_MOCK_AUTH;
    process.env.NODE_ENV = "development";
    expect(isDevMockAuthEnabled()).toBe(true);

    process.env.NODE_ENV = "production";
    expect(isDevMockAuthEnabled()).toBe(false);
  });
});

describe("resolveAuthProviders", () => {
  it("uses mock credentials provider in dev when Google credentials are not provided", () => {
    const providers = resolveAuthProviders({
      nodeEnv: "development",
      googleClientId: undefined,
      googleClientSecret: undefined,
      enableDevMock: true,
    });

    expect(providers.length).toBe(1);
    const mockProvider = providers.find((p) => p.type === "credentials");
    expect(mockProvider).toBeDefined();
    expect(mockProvider?.type).toBe("credentials");
  });

  it("configures both Google and mock provider when both are enabled", () => {
    const providers = resolveAuthProviders({
      nodeEnv: "development",
      googleClientId: "mock-client-id",
      googleClientSecret: "mock-client-secret",
      enableDevMock: true,
    });

    expect(providers.length).toBe(2);
    const googleProvider = providers.find((p) => p.id === "google");
    const mockProvider = providers.find((p) => p.type === "credentials");
    expect(googleProvider).toBeDefined();
    expect(mockProvider).toBeDefined();
  });

  it("omits mock provider when enableDevMock is false", () => {
    const providers = resolveAuthProviders({
      nodeEnv: "development",
      googleClientId: "mock-client-id",
      googleClientSecret: "mock-client-secret",
      enableDevMock: false,
    });

    expect(providers.length).toBe(1);
    expect(providers.find((p) => p.id === "google")).toBeDefined();
    expect(providers.find((p) => p.type === "credentials")).toBeUndefined();
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
