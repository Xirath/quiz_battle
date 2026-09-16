"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";

export function DevMockSignInModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("Player 1");
  const [email, setEmail] = useState("player1@quizbattle.local");
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleQuickSelect = (presetName: string, presetEmail: string) => {
    setName(presetName);
    setEmail(presetEmail);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn("dev-mock-login", {
        name: name.trim() || "Dev Player",
        email: email.trim() || "dev@quizbattle.local",
        callbackUrl: window.location.href,
      });
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛠️</span>
            <h3 className="text-lg font-bold text-foreground">Dev Mock Sign In</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-muted-foreground text-left">
          Select a preset account or enter a custom name and email to test multiplayer battles across different browser windows.
        </p>

        {/* Quick Presets */}
        <div className="space-y-1.5 text-left">
          <label className="text-xs font-semibold text-foreground">Quick Presets</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickSelect("Player 1", "player1@quizbattle.local")}
              className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                email === "player1@quizbattle.local"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              Player 1
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect("Player 2", "player2@quizbattle.local")}
              className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                email === "player2@quizbattle.local"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              Player 2
            </button>
            <button
              type="button"
              onClick={() => handleQuickSelect("Dev Champion", "dev@quizbattle.local")}
              className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                email === "dev@quizbattle.local"
                  ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              Dev Champion
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 text-left">
            <label htmlFor="mock-name" className="text-xs font-semibold text-foreground">
              Display Name
            </label>
            <input
              id="mock-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Player 1, Alice, Bob"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-1 text-left">
            <label htmlFor="mock-email" className="text-xs font-semibold text-foreground">
              Email Address
            </label>
            <input
              id="mock-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. player1@quizbattle.local"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs font-semibold text-secondary-foreground hover:bg-secondary-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {isLoading ? "Signing in..." : `Sign In as ${name || "User"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DevMockSignInButton({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
      >
        {children ?? "Dev Mock Sign In"}
      </button>

      <DevMockSignInModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

export function SignInButton({
  provider = "google",
  children,
  className = "",
}: {
  provider?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  if (provider === "dev-mock-login") {
    return (
      <DevMockSignInButton className={className}>
        {children}
      </DevMockSignInButton>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn(provider)}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer bg-primary text-primary-foreground hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}
    >
      {children ?? "Continue with Google"}
    </button>
  );
}

export function SignOutButton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => signOut()}
      className={`inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover focus:outline-none focus:ring-2 focus:ring-ring ${className}`}
    >
      Sign out
    </button>
  );
}
