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

export interface MatchState {
  roomCode: string;
  questions: MatchQuestion[];
  currentRoundNumber: number;
  hostScore: number;
  challengerScore: number;
  status: "countdown" | "in_round" | "round_ended" | "ROUND_RESULT" | "match_ended";
  countdownSeconds?: number;
  hostAnswer?: string | null;
  challengerAnswer?: string | null;
  roundStartTime?: number;
  isSuddenDeath: boolean;
  winnerId?: string | null;
  rematchRequests?: Set<string>;
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
  "match:countdown": (data: { count: number; text: string }) => void;
  "round:start": (data: {
    roundNumber: number;
    question: ClientQuestion;
    hostScore?: number;
    challengerScore?: number;
    startTime?: number;
    isSuddenDeath?: boolean;
  }) => void;
  "player:answered": (data: { playerId: string }) => void;
  "round:result": (data: RoundResultPayload) => void;
  "match:end": (data: MatchEndPayload) => void;
  "match:rematch_status": (data: { requestedBy: string[] }) => void;
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
  "player:submit_answer": (
    data: { roomCode: string; roundNumber: number; answer: string },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
  "match:play_again": (
    data: { roomCode: string },
    callback?: (res: { success: boolean; error?: string }) => void
  ) => void;
}
