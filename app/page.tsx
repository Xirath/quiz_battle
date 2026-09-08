import { LandingHeader } from "@/components/landing-header";
import { auth } from "@/auth";
import { SignInButton } from "@/components/auth-buttons";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      <LandingHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-accent shadow-xs">
            <span>⚔️</span> Real-Time 1v1 Trivia Battle
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground">
            Outsmart Your Opponent in{" "}
            <span className="text-primary">Quiz Battle</span>
          </h1>

          <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground">
            Race to 6 correct answers in live trivia duels. Real-time countdowns,
            synced questions, and competitive lifetime records.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
            {user ? (
              <div className="flex flex-col items-center gap-2">
                <span className="rounded-lg border border-border bg-card px-6 py-3 font-semibold text-foreground shadow-sm">
                  Welcome back, <span className="text-primary">{user.name}</span>! Ready for battle.
                </span>
              </div>
            ) : (
              <SignInButton
                provider="google"
                className="px-6 py-3 text-base shadow-md"
              >
                Sign in to Battle
              </SignInButton>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
