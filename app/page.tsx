import { LandingHeader } from "@/components/landing-header";
import { auth } from "@/auth";
import { SignInButton } from "@/components/auth-buttons";
import { RoomActions } from "@/components/room-actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      <LandingHeader />

      <main className="flex flex-1 flex-col items-center justify-start px-4 py-12 text-center sm:px-6 sm:py-35">
        <div className="mx-auto flex max-w-2xl flex-col items-center space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-accent shadow-xs">
            <span>⚔️</span> Real-Time 1v1 Trivia Battle
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground">
            Outsmart Your Opponent in{" "}
            <span className="text-primary">Quiz Battle</span>
          </h1>

          <p className="mx-auto max-w-xl text-base sm:text-lg text-muted-foreground">
            Challenge your friends and show off your trivia skills in
            fast-paced, real-time battles.
          </p>

          <div className="flex w-full justify-center pt-2">
            {user ? (
              <RoomActions />
            ) : (
              <SignInButton
                provider="google"
                className="px-8 py-3.5 text-base shadow-md"
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
