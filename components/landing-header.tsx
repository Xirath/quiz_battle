import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { ConnectionStatusBadge } from "@/components/connection-status";

export async function LandingHeader() {
  const session = await auth();
  const user = session?.user;
  const stats = user?.stats;

  return (
    <header className="w-full border-b border-border bg-card text-card-foreground">
      <div className="flex w-full items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
        >
          <svg
            className="h-8 w-8 lg:h-13 lg:w-13 pb-0.5 text-primary shrink-0"
            viewBox="0 0 512 512"
            fill="currentColor"
            aria-hidden="true"
          >
            <defs>
              <g id="header-sword">
                <path
                  d="M 256 16 L 288 52 L 288 388 L 224 388 L 224 52 Z"
                  fill="currentColor"
                />
                <path
                  d="M 224 388 L 165 348 L 182 414 L 242 414 L 242 422 L 270 422 L 270 414 L 330 414 L 347 348 L 288 388 Z"
                  fill="currentColor"
                />
                <rect
                  x="244"
                  y="422"
                  width="24"
                  height="68"
                  rx="3"
                  fill="currentColor"
                />
                <circle cx="256" cy="496" r="22" fill="currentColor" />
              </g>
            </defs>
            <circle
              cx="256"
              cy="256"
              r="236"
              fill="none"
              stroke="currentColor"
              strokeWidth="16"
            />
            <use href="#header-sword" transform="rotate(-45 256 256)" />
            <use href="#header-sword" transform="rotate(45 256 256)" />
          </svg>
          <div>
            <span className="font-extrabold tracking-tight text-foreground text-lg sm:text-xl lg:text-3xl">
              Quiz Battle
            </span>
            <span className="ml-2 hidden text-xs font-medium text-accent sm:inline-block lg:text-xl">
              1v1 Trivia
            </span>
          </div>
        </Link>

        {/* Auth / Profile Area */}
        <div className="flex items-center gap-3">
          <ConnectionStatusBadge />
          {user ? (
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {/* Stats Counters */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs font-medium">
                <span className="text-muted-foreground">
                  Matches:{" "}
                  <strong className="text-foreground">
                    {stats?.totalMatches ?? 0}
                  </strong>
                </span>
                <span className="text-border">|</span>
                <span className="text-success font-semibold">
                  W: {stats?.wins ?? 0}
                </span>
                <span className="text-border">|</span>
                <span className="text-destructive font-semibold">
                  L: {stats?.losses ?? 0}
                </span>
                <span className="text-border">|</span>
                <span className="text-accent font-bold">
                  {stats?.winRate ?? 0}% Win Rate
                </span>
              </div>

              {/* Profile Chip */}
              <div className="flex items-center gap-2.5">
                {user.image ? (
                  <Image
                    src={user.image}
                    alt={user.name ?? "Player Avatar"}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full border border-border object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground font-bold text-xs">
                    {(user.name ?? "P").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="hidden text-sm font-semibold text-foreground md:inline-block max-w-[120px] truncate">
                  {user.name ?? "Player"}
                </span>
              </div>

              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SignInButton provider="google">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </SignInButton>
              {process.env.NODE_ENV !== "production" && (
                <SignInButton
                  provider="dev-mock-login"
                  className="border border-border bg-secondary text-secondary-foreground hover:bg-secondary-hover text-xs py-2 px-3 font-normal"
                >
                  Dev Mock Sign In
                </SignInButton>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
