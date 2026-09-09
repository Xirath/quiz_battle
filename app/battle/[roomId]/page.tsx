import { auth } from "@/auth";
import { LandingHeader } from "@/components/landing-header";
import { BattleLobby } from "@/components/battle-lobby";
import { SignInButton } from "@/components/auth-buttons";

export default async function BattlePage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const session = await auth();
  const user = session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground font-sans">
      <LandingHeader />

      <main className="flex flex-1 flex-col items-center justify-center p-4">
        {user ? (
          <BattleLobby
            roomId={roomId.toUpperCase()}
            currentUser={{
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            }}
          />
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl text-primary">
              🔒
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">
                Authentication Required
              </h2>
              <p className="text-sm text-muted-foreground">
                You must be signed in to join battle room{" "}
                <strong className="font-mono text-primary">{roomId.toUpperCase()}</strong>.
              </p>
            </div>
            <SignInButton provider="google" className="w-full py-3 shadow-sm">
              Sign in with Google
            </SignInButton>
          </div>
        )}
      </main>
    </div>
  );
}
