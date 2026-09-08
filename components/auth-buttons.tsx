"use client";

import { signIn, signOut } from "next-auth/react";

export function SignInButton({
  provider = "google",
  children,
  className = "",
}: {
  provider?: string;
  children?: React.ReactNode;
  className?: string;
}) {
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
