export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export type RoomStatus = "waiting" | "ready" | "in_match" | "finished";

export interface RoomState {
  code: string;
  host: AuthenticatedUser;
  challenger: AuthenticatedUser | null;
  status: RoomStatus;
  createdAt: number;
}

export interface MatchQuestion {
  id: string;
  category: string;
  question: string;
  correctAnswer: string;
  options: string[];
}

export interface ClientQuestion {
  roundNumber: number;
  category: string;
  question: string;
  options: string[];
}

export interface CategoryItem {
  id: number;
  name: string;
}

export interface CategoryBanState {
  categories: CategoryItem[];
  bannedCategoryIds: number[];
  currentBanningPlayerId: string;
  turnNumber: number;
  turnDurationMs: number;
  turnDeadline: number;
  banHistory: Array<{
    categoryId: number;
    bannedByPlayerId: string;
    bannedByPlayerName?: string;
  }>;
  selectedCategory?: CategoryItem | null;
  pausedRemainingMs?: number;
}

export interface MatchState {
  roomCode: string;
  questions: MatchQuestion[];
  currentRoundNumber: number;
  hostScore: number;
  challengerScore: number;
  status: "ban_phase" | "countdown" | "in_round" | "round_ended" | "ROUND_RESULT" | "match_ended" | "FORFEIT";
  countdownSeconds?: number;
  hostAnswer?: string | null;
  challengerAnswer?: string | null;
  roundStartTime?: number;
  isSuddenDeath: boolean;
  winnerId?: string | null;
  isForfeit?: boolean;
  rematchRequests?: Set<string>;
  disconnectedPlayerId?: string | null;
  disconnectTimestamp?: number | null;
  banState?: CategoryBanState | null;
  selectedCategory?: CategoryItem | null;
}

export interface RoundResultPayload {
  roundNumber: number;
  correctAnswer: string;
  hostAnswer: string | null;
  challengerAnswer: string | null;
  hostCorrect: boolean;
  challengerCorrect: boolean;
  hostScore: number;
  challengerScore: number;
  isSuddenDeath: boolean;
  matchEnded: boolean;
  winnerId?: string | null;
}

export interface MatchEndPayload {
  roomCode: string;
  winnerId: string | null;
  winnerName: string | null;
  hostScore: number;
  challengerScore: number;
  roundsPlayed: number;
  isSuddenDeath: boolean;
  isForfeit?: boolean;
  host?: AuthenticatedUser;
  challenger?: AuthenticatedUser | null;
  selectedCategory?: CategoryItem | null;
}

export interface MatchRestorePayload {
  roundNumber: number;
  question: ClientQuestion | null;
  hostScore: number;
  challengerScore: number;
  startTime?: number;
  isSuddenDeath: boolean;
  selectedOption: string | null;
  opponentLockedIn: boolean;
  roundResult: RoundResultPayload | null;
  opponentDisconnected?: boolean;
  disconnectCountdown?: number;
  banState?: CategoryBanState | null;
  selectedCategory?: CategoryItem | null;
}

export interface SocketData {
  user: AuthenticatedUser;
  roomCode?: string;
}

export interface ServerToClientEvents {
  "auth:success": (user: AuthenticatedUser) => void;
  "server:status": (status: { online: boolean; timestamp: number }) => void;
  "room:state": (room: RoomState) => void;
  "room:player_joined": (data: { player: AuthenticatedUser; room: RoomState }) => void;
  "room:player_left": (data: { playerId: string; room: RoomState }) => void;
  "room:error": (data: { message: string }) => void;
  "match:ban_phase_start": (data: CategoryBanState) => void;
  "match:category_banned": (data: CategoryBanState) => void;
  "match:category_decided": (data: { category: CategoryItem }) => void;
  "match:countdown": (data: { count: number; text: string }) => void;
  "round:start": (data: {
    roundNumber: number;
    question: ClientQuestion;
    hostScore?: number;
    challengerScore?: number;
    startTime?: number;
    isSuddenDeath?: boolean;
    selectedCategory?: CategoryItem | null;
    roundDurationMs?: number;
  }) => void;
  "player:answered": (data: { playerId: string }) => void;
  "round:result": (data: RoundResultPayload) => void;
  "match:end": (data: MatchEndPayload) => void;
  "match:rematch_status": (data: { requestedBy: string[] }) => void;
  "player:disconnected": (data: {
    playerId: string;
    playerName?: string | null;
    countdownSeconds: number;
    disconnectTimestamp: number;
  }) => void;
  "player:reconnected": (data: { playerId: string }) => void;
  "match:restore": (data: MatchRestorePayload) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
  "room:create": (
    callback: (res: { success: boolean; code?: string; error?: string }) => void
  ) => void;
  "room:join": (
    data: { code: string },
    callback: (res: { success: boolean; room?: RoomState; error?: string }) => void
  ) => void;
  "room:leave": (data: { code: string }) => void;
  "player:ban_category": (
    data: { roomCode: string; categoryId: number },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
  "player:submit_answer": (
    data: { roomCode: string; roundNumber: number; answer: string },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
  "match:play_again": (
    data: { roomCode: string },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
}
