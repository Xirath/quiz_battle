import type {
  AuthenticatedUser,
  RoomState,
  MatchQuestion,
  MatchState,
  RoundResultPayload,
  MatchEndPayload,
  MatchRestorePayload,
} from "./types";

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

  private createInitialMatchState(
    roomCode: string,
    questions: MatchQuestion[]
  ): MatchState {
    return {
      roomCode,
      questions: [...questions],
      currentRoundNumber: 1,
      hostScore: 0,
      challengerScore: 0,
      status: "countdown",
      countdownSeconds: 3,
      isSuddenDeath: false,
      winnerId: null,
      rematchRequests: new Set<string>(),
    };
  }

  public startMatch(code: string, questions: MatchQuestion[]): MatchState {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error("Room not found");
    }

    room.status = "in_match";

    const match = this.createInitialMatchState(normalizedCode, questions);
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
    const room = this.rooms.get(normalizedCode);
    const match = this.matches.get(normalizedCode);
    if (!room || !match) return null;

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

    let matchEnded = false;

    if (!match.isSuddenDeath) {
      // Normal Race to 6
      if (match.hostScore >= 6 && match.challengerScore >= 6) {
        // Both reached 6 on the same round -> Trigger Sudden Death Overtime!
        match.isSuddenDeath = true;
        match.status = "ROUND_RESULT";
      } else if (match.hostScore >= 6 && match.hostScore > match.challengerScore) {
        match.status = "match_ended";
        match.winnerId = room.host.id;
        matchEnded = true;
      } else if (match.challengerScore >= 6 && match.challengerScore > match.hostScore) {
        match.status = "match_ended";
        match.winnerId = room.challenger?.id ?? null;
        matchEnded = true;
      } else {
        match.status = "ROUND_RESULT";
      }
    } else {
      // In Sudden Death Overtime: 1-question rounds until scores diverge
      if (match.hostScore !== match.challengerScore) {
        match.status = "match_ended";
        match.winnerId = match.hostScore > match.challengerScore ? room.host.id : (room.challenger?.id ?? null);
        matchEnded = true;
      } else {
        // Scores still tied (e.g. 7-7 or 6-6) -> Continue Sudden Death
        match.status = "ROUND_RESULT";
      }
    }

    return {
      roundNumber: match.currentRoundNumber,
      correctAnswer: currentQuestion.correctAnswer,
      hostAnswer: match.hostAnswer ?? null,
      challengerAnswer: match.challengerAnswer ?? null,
      hostCorrect,
      challengerCorrect,
      hostScore: match.hostScore,
      challengerScore: match.challengerScore,
      isSuddenDeath: match.isSuddenDeath,
      matchEnded,
      winnerId: match.winnerId ?? null,
    };
  }

  public nextRound(
    code: string
  ): { roundNumber: number; question: MatchQuestion } | null {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (!match || match.status === "match_ended") return null;

    const nextRoundNumber = match.currentRoundNumber + 1;
    const nextQuestion = match.questions[nextRoundNumber - 1];
    if (!nextQuestion) return null;

    this.initRoundState(match, nextRoundNumber);

    return {
      roundNumber: nextRoundNumber,
      question: { ...nextQuestion },
    };
  }

  public addQuestions(code: string, newQuestions: MatchQuestion[]): void {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (match) {
      match.questions.push(...newQuestions);
    }
  }

  public requestRematch(
    code: string,
    playerId: string
  ): { requestedBy: string[]; bothReady: boolean } {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    const match = this.matches.get(normalizedCode);
    if (!room || !match) {
      throw new Error("Match not found");
    }

    if (!match.rematchRequests) {
      match.rematchRequests = new Set<string>();
    }

    match.rematchRequests.add(playerId);

    const requestedBy = Array.from(match.rematchRequests);
    const hostReady = match.rematchRequests.has(room.host.id);
    const challengerReady = room.challenger ? match.rematchRequests.has(room.challenger.id) : false;
    const bothReady = hostReady && challengerReady;

    return { requestedBy, bothReady };
  }

  public resetForRematch(code: string, questions: MatchQuestion[]): MatchState {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error("Room not found");
    }

    room.status = "in_match";

    const match = this.createInitialMatchState(normalizedCode, questions);
    this.matches.set(normalizedCode, match);
    return { ...match };
  }

  public setMatchScoresForTesting(
    code: string,
    hostScore: number,
    challengerScore: number,
    isSuddenDeath = false
  ): void {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (match) {
      match.hostScore = hostScore;
      match.challengerScore = challengerScore;
      match.isSuddenDeath = isSuddenDeath;
    }
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

  public handlePlayerDisconnect(
    code: string,
    playerId: string
  ): { isMatchActive: boolean; match?: MatchState; remainingPlayer?: AuthenticatedUser } | null {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    if (!room) return null;

    const match = this.matches.get(normalizedCode);
    const isMatchActive = Boolean(
      match &&
      match.status !== "match_ended" &&
      match.status !== "FORFEIT" &&
      room.status === "in_match"
    );

    if (isMatchActive && match) {
      match.disconnectedPlayerId = playerId;
      match.disconnectTimestamp = Date.now();
      const remainingPlayer = room.host.id === playerId ? (room.challenger ?? undefined) : room.host;
      return { isMatchActive: true, match: { ...match }, remainingPlayer };
    }

    return { isMatchActive: false };
  }

  public handlePlayerReconnect(code: string, playerId: string): MatchState | null {
    const normalizedCode = code.toUpperCase().trim();
    const match = this.matches.get(normalizedCode);
    if (!match) return null;

    if (match.disconnectedPlayerId === playerId) {
      match.disconnectedPlayerId = null;
      match.disconnectTimestamp = null;
    }

    return { ...match };
  }

  public forfeitMatch(code: string, forfeitedPlayerId: string): MatchEndPayload | null {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    const match = this.matches.get(normalizedCode);
    if (!room || !match) return null;

    if (match.status === "match_ended" || match.status === "FORFEIT") {
      return null;
    }

    const winner = room.host.id === forfeitedPlayerId ? room.challenger : room.host;
    if (!winner) return null;

    match.status = "FORFEIT";
    match.isForfeit = true;
    match.winnerId = winner.id;
    room.status = "finished";

    return {
      roomCode: match.roomCode,
      winnerId: winner.id,
      winnerName: winner.name ?? "Player",
      hostScore: match.hostScore,
      challengerScore: match.challengerScore,
      roundsPlayed: match.currentRoundNumber,
      isSuddenDeath: match.isSuddenDeath,
      isForfeit: true,
    };
  }

  public getMatchRestorePayload(code: string, playerId: string): MatchRestorePayload | null {
    const normalizedCode = code.toUpperCase().trim();
    const room = this.rooms.get(normalizedCode);
    const match = this.matches.get(normalizedCode);
    if (!room || !match) return null;

    const isHost = room.host.id === playerId;
    const isChallenger = room.challenger?.id === playerId;
    if (!isHost && !isChallenger) return null;

    const selectedOption = isHost ? (match.hostAnswer ?? null) : (match.challengerAnswer ?? null);
    const opponentAnswer = isHost ? match.challengerAnswer : match.hostAnswer;
    const opponentLockedIn = Boolean(opponentAnswer !== null && opponentAnswer !== undefined);

    const questionObj = match.questions[match.currentRoundNumber - 1];
    const question = questionObj
      ? {
          roundNumber: match.currentRoundNumber,
          category: questionObj.category,
          question: questionObj.question,
          options: questionObj.options,
        }
      : null;

    let roundResult: RoundResultPayload | null = null;
    if (match.status === "ROUND_RESULT") {
      const hostCorrect = Boolean(
        match.hostAnswer && questionObj && match.hostAnswer === questionObj.correctAnswer
      );
      const challengerCorrect = Boolean(
        match.challengerAnswer && questionObj && match.challengerAnswer === questionObj.correctAnswer
      );
      roundResult = {
        roundNumber: match.currentRoundNumber,
        correctAnswer: questionObj ? questionObj.correctAnswer : "",
        hostAnswer: match.hostAnswer ?? null,
        challengerAnswer: match.challengerAnswer ?? null,
        hostCorrect,
        challengerCorrect,
        hostScore: match.hostScore,
        challengerScore: match.challengerScore,
        isSuddenDeath: match.isSuddenDeath,
        matchEnded: false,
        winnerId: match.winnerId ?? null,
      };
    }

    const opponentId = isHost ? room.challenger?.id : room.host.id;
    const opponentDisconnected = Boolean(
      opponentId && match.disconnectedPlayerId === opponentId
    );

    return {
      roundNumber: match.currentRoundNumber,
      question,
      hostScore: match.hostScore,
      challengerScore: match.challengerScore,
      startTime: match.roundStartTime,
      isSuddenDeath: match.isSuddenDeath,
      selectedOption,
      opponentLockedIn,
      roundResult,
      opponentDisconnected,
    };
  }
}

export const defaultRoomManager = new RoomManager();
