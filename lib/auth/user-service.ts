import { prisma } from "@/lib/prisma";
import { calculatePlayerStats, type PlayerStatsSummary } from "@/lib/stats";

export interface UserProfileWithStats {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  stats: PlayerStatsSummary;
}

export async function getOrCreateUser(params: {
  id?: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<UserProfileWithStats> {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  });

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      image: existing.image,
      stats: calculatePlayerStats({
        wins: existing.wins,
        losses: existing.losses,
        totalMatches: existing.totalMatches,
        totalCorrectAnswers: existing.totalCorrectAnswers,
      }),
    };
  }

  const created = await prisma.user.create({
    data: {
      ...(params.id ? { id: params.id } : {}),
      email: params.email,
      name: params.name ?? "Player",
      image: params.image,
      wins: 0,
      losses: 0,
      totalMatches: 0,
      totalCorrectAnswers: 0,
    },
  });

  return {
    id: created.id,
    name: created.name,
    email: created.email,
    image: created.image,
    stats: calculatePlayerStats({
      wins: 0,
      losses: 0,
      totalMatches: 0,
      totalCorrectAnswers: 0,
    }),
  };
}

export async function getUserProfileWithStats(
  identifier?: string | null
): Promise<UserProfileWithStats | null> {
  if (!identifier) return null;

  let user = await prisma.user.findUnique({
    where: { id: identifier },
  });

  if (!user && identifier.includes("@")) {
    user = await prisma.user.findUnique({
      where: { email: identifier },
    });
  }

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    stats: calculatePlayerStats({
      wins: user.wins,
      losses: user.losses,
      totalMatches: user.totalMatches,
      totalCorrectAnswers: user.totalCorrectAnswers,
    }),
  };
}
