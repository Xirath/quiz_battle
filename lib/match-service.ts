import { prisma } from "@/lib/prisma";

export interface RecordMatchParams {
  roomCode: string;
  hostId: string;
  challengerId: string;
  winnerId: string | null;
  hostScore: number;
  challengerScore: number;
  roundsPlayed: number;
  isSuddenDeath?: boolean;
  isForfeit?: boolean;
}

async function updatePlayerMatchStats(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  score: number,
  isWinner: boolean,
  isLoser: boolean
) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return;

  await tx.user.update({
    where: { id: userId },
    data: {
      totalMatches: { increment: 1 },
      totalCorrectAnswers: { increment: score },
      wins: isWinner ? { increment: 1 } : undefined,
      losses: isLoser ? { increment: 1 } : undefined,
    },
  });
}

export async function recordMatchResult(params: RecordMatchParams) {
  const {
    roomCode,
    hostId,
    challengerId,
    winnerId,
    hostScore,
    challengerScore,
    roundsPlayed,
    isSuddenDeath = false,
    isForfeit = false,
  } = params;

  return await prisma.$transaction(async (tx) => {
    // Ensure both host and challenger records exist to prevent FK constraint failures
    await tx.user.upsert({
      where: { id: hostId },
      update: {},
      create: {
        id: hostId,
        name: "Host Player",
        wins: 0,
        losses: 0,
        totalMatches: 0,
        totalCorrectAnswers: 0,
      },
    });

    if (challengerId !== hostId) {
      await tx.user.upsert({
        where: { id: challengerId },
        update: {},
        create: {
          id: challengerId,
          name: "Challenger Player",
          wins: 0,
          losses: 0,
          totalMatches: 0,
          totalCorrectAnswers: 0,
        },
      });
    }

    const match = await tx.match.create({
      data: {
        roomCode,
        hostId,
        challengerId,
        winnerId,
        hostScore,
        challengerScore,
        roundsPlayed,
        isSuddenDeath,
        isForfeit,
      },
    });

    const isHostWinner = Boolean(winnerId && winnerId === hostId);
    const isHostLoser = Boolean(winnerId && winnerId !== hostId);
    await updatePlayerMatchStats(tx, hostId, hostScore, isHostWinner, isHostLoser);

    if (challengerId !== hostId) {
      const isChallengerWinner = Boolean(winnerId && winnerId === challengerId);
      const isChallengerLoser = Boolean(winnerId && winnerId !== challengerId);
      await updatePlayerMatchStats(
        tx,
        challengerId,
        challengerScore,
        isChallengerWinner,
        isChallengerLoser
      );
    }

    return match;
  });
}
