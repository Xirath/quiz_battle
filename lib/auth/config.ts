import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import {
  calculatePlayerStats,
  type PlayerStatsCounters,
  type PlayerStatsSummary,
} from "@/lib/stats";
import {
  getOrCreateUser,
  getUserProfileWithStats,
} from "@/lib/auth/user-service";

export interface ResolveAuthProvidersParams {
  nodeEnv?: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export function resolveAuthProviders(params: ResolveAuthProvidersParams) {
  const providers = [];

  if (params.googleClientId && params.googleClientSecret) {
    providers.push(
      Google({
        clientId: params.googleClientId,
        clientSecret: params.googleClientSecret,
      })
    );
  } else if (params.nodeEnv !== "production") {
    providers.push(
      Credentials({
        id: "dev-mock-login",
        name: "Development Mock Login",
        credentials: {
          email: {
            label: "Email",
            type: "email",
            placeholder: "dev@quizbattle.local",
          },
          name: { label: "Name", type: "text", placeholder: "Dev Champion" },
        },
        async authorize(credentials) {
          const email =
            (credentials?.email as string) || "dev@quizbattle.local";
          const name = (credentials?.name as string) || "Dev Player";
          const user = await getOrCreateUser({
            email,
            name,
            image: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
              name
            )}`,
          });
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
          };
        },
      })
    );
  }

  return providers;
}

export function formatUserSession(
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } & PlayerStatsCounters
): {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    stats: PlayerStatsSummary;
  };
} {
  return {
    user: {
      id: user.id,
      name: user.name ?? "Player",
      email: user.email ?? "",
      image: user.image ?? null,
      stats: calculatePlayerStats({
        wins: user.wins,
        losses: user.losses,
        totalMatches: user.totalMatches,
        totalCorrectAnswers: user.totalCorrectAnswers,
      }),
    },
  };
}

export const authConfig: NextAuthConfig = {
  session: {
    strategy: "jwt",
  },
  providers: resolveAuthProviders({
    nodeEnv: process.env.NODE_ENV,
    googleClientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID,
    googleClientSecret:
      process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  }),
  callbacks: {
    async signIn({ user }) {
      if (user.email) {
        await getOrCreateUser({
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id && typeof token.id === "string") {
        session.user.id = token.id;
        const profile = await getUserProfileWithStats(token.id);
        if (profile) {
          session.user.name = profile.name;
          session.user.image = profile.image;
          session.user.stats = profile.stats;
        }
      }
      return session;
    },
  },
};
