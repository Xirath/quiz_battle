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

    const isHostWinner = winnerId === hostId;
    const isHostLoser = winnerId !== null && winnerId !== hostId;
    await updatePlayerMatchStats(tx, hostId, hostScore, isHostWinner, isHostLoser);

    const isChallengerWinner = winnerId === challengerId;
    const isChallengerLoser = winnerId !== null && winnerId !== challengerId;
    await updatePlayerMatchStats(
      tx,
      challengerId,
      challengerScore,
      isChallengerWinner,
      isChallengerLoser
    );

    return match;
  });
}
