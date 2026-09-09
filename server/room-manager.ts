import type { AuthenticatedUser, RoomState } from "./types";

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

export class RoomManager {
  private rooms = new Map<string, RoomState>();

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
      return { ...room };
    }

    if (room.host.id === playerId) {
      if (room.challenger) {
        // Promote challenger to host
        room.host = room.challenger;
        room.challenger = null;
        room.status = "waiting";
        return { ...room };
      } else {
        // No players left, delete room
        this.rooms.delete(normalizedCode);
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
  }
}

export const defaultRoomManager = new RoomManager();
