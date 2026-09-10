import type { AuthenticatedUser, RoomState, MatchQuestion, MatchState, RoundResultPayload } from "./types";

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export class RoomManager {
  private rooms = new Map<string, RoomState>();
  private matches = new Map<string, MatchState>();

  private generateCode(): string {
    let code: string;
    let attempts = 0;
    do {
      code = "";
      for (let i = 0; i < CODE_LENGTH; i++) {
        const randomIndex = Math.floor(Math.random() * CODE_CHARS.length);
        code += CODE_CHARS[randomIndex];
      }
      attempts++;
      if (attempts > 10000) {
        throw new Error("Unable to generate unique room code");
      }
    } while (this.rooms.has(code));

    return code;
  }

  public createRoom(host: AuthenticatedUser): RoomState {
    const code = this.generateCode();
    const room: RoomState = {
      code,
      host,
      challenger: null,
      status: "waiting",
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    return { ...room };
  }

  public getRoom(code: string): RoomState | null {
    if (!code) return null;
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    return room ? { ...room } : null;
  }

  public joinRoom(code: string, challenger: AuthenticatedUser): RoomState {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.host.id === challenger.id) {
      // Host entering or reconnecting to their room
      return { ...room };
    }

    if (room.challenger && room.challenger.id === challenger.id) {
      // Reconnection as existing challenger
      return { ...room };
    }

    if (room.challenger !== null) {
      throw new Error("Room is full (maximum 2 players)");
    }

    room.challenger = challenger;
    room.status = "ready";

    return { ...room };
  }

  public leaveRoom(code: string, playerId: string): RoomState | null {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);

    if (!room) return null;

    if (room.challenger?.id === playerId) {
      room.challenger = null;
      room.status = "waiting";
      this.matches.delete(normalizedCode);
      return { ...room };
    }

    if (room.host.id === playerId) {
      if (room.challenger) {
        // Promote challenger to host
        room.host = room.challenger;
        room.challenger = null;
        room.status = "waiting";
        this.matches.delete(normalizedCode);
        return { ...room };
      } else {
        // No players left, delete room
        this.rooms.delete(normalizedCode);
        this.matches.delete(normalizedCode);
        return null;
      }
    }

    return { ...room };
  }

  public getRoomByPlayerId(playerId: string): RoomState | null {
    for (const room of this.rooms.values()) {
      if (room.host.id === playerId || room.challenger?.id === playerId) {
        return { ...room };
      }
    }
    return null;
  }

  public deleteRoom(code: string): void {
    const normalizedCode = code.toUpperCase().trim();
    this.rooms.delete(normalizedCode);
    this.matches.delete(normalizedCode);
  }

  public startMatch(code: string, questions: MatchQuestion[]): MatchState {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error("Room not found");
    }

    room.status = "in_match";

    const match: MatchState = {
      roomCode: normalizedCode,
      questions: [...questions],
      currentRoundNumber: 1,
      hostScore: 0,
      challengerScore: 0,
      status: "countdown",
      countdownSeconds: 3,
    };

    this.matches.set(normalizedCode, match);
    return { ...match };
  }

  private initRoundState(match: MatchState, roundNumber: number): void {
    match.currentRoundNumber = roundNumber;
    match.status = "in_round";
    match.hostAnswer = null;
    match.challengerAnswer = null;
    match.roundStartTime = Date.now();
  }

  public startRound(code: string, roundNumber: number): MatchState {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (!match) {
      throw new Error("Match not found");
    }

    this.initRoundState(match, roundNumber);
    return { ...match };
  }

  public submitAnswer(
    code: string,
    playerId: string,
    roundNumber: number,
    answer: string
  ): { isFirst: boolean; bothAnswered: boolean; isCorrect: boolean } {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    const match = this.matches.get(normalizedCode);

    if (!room || !match) {
      throw new Error("Match not found");
    }

    if (match.status !== "in_round") {
      throw new Error("Match is not in an active round");
    }

    if (match.currentRoundNumber !== roundNumber) {
      throw new Error("Invalid round number");
    }

    const isHost = room.host.id === playerId;
    const isChallenger = room.challenger?.id === playerId;

    if (!isHost && !isChallenger) {
      throw new Error("Player is not in this match");
    }

    const currentAnswer = isHost ? match.hostAnswer : match.challengerAnswer;
    if (currentAnswer !== null && currentAnswer !== undefined) {
      throw new Error("Player has already submitted an answer for this round");
    }

    const isFirst = isHost ? !match.challengerAnswer : !match.hostAnswer;

    if (isHost) {
      match.hostAnswer = answer;
    } else {
      match.challengerAnswer = answer;
    }

    const currentQuestion = match.questions[match.currentRoundNumber - 1];
    const isCorrect = Boolean(currentQuestion && currentQuestion.correctAnswer === answer);
    const bothAnswered = Boolean(
      match.hostAnswer !== null &&
      match.hostAnswer !== undefined &&
      match.challengerAnswer !== null &&
      match.challengerAnswer !== undefined
    );

    return { isFirst, bothAnswered, isCorrect };
  }

  public evaluateRound(code: string): RoundResultPayload | null {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (!match) return null;

    const currentQuestion = match.questions[match.currentRoundNumber - 1];
    if (!currentQuestion) return null;

    const hostCorrect = Boolean(
      match.hostAnswer && match.hostAnswer === currentQuestion.correctAnswer
    );
    const challengerCorrect = Boolean(
      match.challengerAnswer && match.challengerAnswer === currentQuestion.correctAnswer
    );

    if (hostCorrect) {
      match.hostScore += 1;
    }
    if (challengerCorrect) {
      match.challengerScore += 1;
    }

    match.status = "ROUND_RESULT";

    return {
      roundNumber: match.currentRoundNumber,
      correctAnswer: currentQuestion.correctAnswer,
      hostAnswer: match.hostAnswer ?? null,
      challengerAnswer: match.challengerAnswer ?? null,
      hostCorrect,
      challengerCorrect,
      hostScore: match.hostScore,
      challengerScore: match.challengerScore,
    };
  }

  public nextRound(
    code: string
  ): { roundNumber: number; question: MatchQuestion } | null {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (!match) return null;

    const nextRoundNumber = match.currentRoundNumber + 1;
    const nextQuestion = match.questions[nextRoundNumber - 1];
    if (!nextQuestion) return null;

    this.initRoundState(match, nextRoundNumber);

    return {
      roundNumber: nextRoundNumber,
      question: { ...nextQuestion },
    };
  }

  public getMatch(code: string): MatchState | null {
    if (!code) return null;
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    return match ? { ...match } : null;
  }

  public getCurrentRoundQuestion(code: string): MatchQuestion | null {
    const match = this.getMatch(code);
    if (!match || match.questions.length === 0) return null;
    const index = match.currentRoundNumber - 1;
    return match.questions[index] ? { ...match.questions[index] } : null;
  }
}

export const defaultRoomManager = new RoomManager();
