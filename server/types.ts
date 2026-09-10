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
  status: "countdown" | "in_round" | "round_ended" | "match_ended";
  countdownSeconds?: number;
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
  }) => void;
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
}
