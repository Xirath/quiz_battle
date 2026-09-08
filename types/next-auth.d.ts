import type { PlayerStatsSummary } from "@/lib/stats";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      stats?: PlayerStatsSummary;
    } & DefaultSession["user"];
  }

  interface User {
    stats?: PlayerStatsSummary;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    stats?: PlayerStatsSummary;
  }
}
