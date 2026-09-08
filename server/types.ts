export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface SocketData {
  user: AuthenticatedUser;
}

export interface ServerToClientEvents {
  "auth:success": (user: AuthenticatedUser) => void;
  "server:status": (status: { online: boolean; timestamp: number }) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
}
