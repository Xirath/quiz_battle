import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "@/server/room-manager";
import type { AuthenticatedUser } from "@/server/types";

describe("RoomManager", () => {
  let roomManager: RoomManager;

  const hostUser: AuthenticatedUser = {
    id: "user-host-1",
    name: "Host Player",
    email: "host@quizbattle.local",
    image: "https://example.com/host.png",
  };

  const challengerUser: AuthenticatedUser = {
    id: "user-challenger-2",
    name: "Challenger Player",
    email: "challenger@quizbattle.local",
    image: "https://example.com/challenger.png",
  };

  const thirdUser: AuthenticatedUser = {
    id: "user-third-3",
    name: "Third Player",
    email: "third@quizbattle.local",
    image: "https://example.com/third.png",
  };

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe("createRoom", () => {
    it("creates a room with a 6-character uppercase alphanumeric code", () => {
      const room = roomManager.createRoom(hostUser);

      expect(room.code).toBeDefined();
      expect(room.code).toHaveLength(6);
      expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
      expect(room.host).toEqual(hostUser);
      expect(room.challenger).toBeNull();
      expect(room.status).toBe("waiting");
      expect(typeof room.createdAt).toBe("number");
    });

    it("generates unique room codes for multiple rooms", () => {
      const room1 = roomManager.createRoom(hostUser);
      const room2 = roomManager.createRoom(challengerUser);

      expect(room1.code).not.toBe(room2.code);
    });
  });

  describe("getRoom", () => {
    it("retrieves a created room by code (case-insensitive)", () => {
      const created = roomManager.createRoom(hostUser);
      const retrieved = roomManager.getRoom(created.code.toLowerCase());

      expect(retrieved).toEqual(created);
    });

    it("returns null for non-existent room code", () => {
      expect(roomManager.getRoom("NONEX1")).toBeNull();
    });
  });

  describe("joinRoom", () => {
    it("allows a second player to join and marks status as ready", () => {
      const created = roomManager.createRoom(hostUser);
      const updated = roomManager.joinRoom(created.code, challengerUser);

      expect(updated.host).toEqual(hostUser);
      expect(updated.challenger).toEqual(challengerUser);
      expect(updated.status).toBe("ready");
    });

    it("throws error when joining non-existent room", () => {
      expect(() => roomManager.joinRoom("NOEXIST", challengerUser)).toThrow(
        "Room not found"
      );
    });

    it("throws error when room already has 2 players (max capacity)", () => {
      const created = roomManager.createRoom(hostUser);
      roomManager.joinRoom(created.code, challengerUser);

      expect(() => roomManager.joinRoom(created.code, thirdUser)).toThrow(
        "Room is full (maximum 2 players)"
      );
    });

    it("allows the host to join/reconnect to their own room without error", () => {
      const created = roomManager.createRoom(hostUser);
      const joined = roomManager.joinRoom(created.code, hostUser);

      expect(joined.host).toEqual(hostUser);
      expect(joined.challenger).toBeNull();
      expect(joined.status).toBe("waiting");
    });

    it("allows existing challenger to reconnect without error", () => {
      const created = roomManager.createRoom(hostUser);
      roomManager.joinRoom(created.code, challengerUser);

      const rejoined = roomManager.joinRoom(created.code, challengerUser);
      expect(rejoined.challenger).toEqual(challengerUser);
      expect(rejoined.status).toBe("ready");
    });
  });

  describe("leaveRoom", () => {
    it("resets challenger and reverts status to waiting when challenger leaves", () => {
      const created = roomManager.createRoom(hostUser);
      roomManager.joinRoom(created.code, challengerUser);

      const updated = roomManager.leaveRoom(created.code, challengerUser.id);
      expect(updated).not.toBeNull();
      expect(updated?.host).toEqual(hostUser);
      expect(updated?.challenger).toBeNull();
      expect(updated?.status).toBe("waiting");
    });

    it("deletes the room when host leaves and no challenger exists", () => {
      const created = roomManager.createRoom(hostUser);
      const result = roomManager.leaveRoom(created.code, hostUser.id);

      expect(result).toBeNull();
      expect(roomManager.getRoom(created.code)).toBeNull();
    });

    it("promotes challenger to host when host leaves", () => {
      const created = roomManager.createRoom(hostUser);
      roomManager.joinRoom(created.code, challengerUser);

      const updated = roomManager.leaveRoom(created.code, hostUser.id);
      expect(updated).not.toBeNull();
      expect(updated?.host).toEqual(challengerUser);
      expect(updated?.challenger).toBeNull();
      expect(updated?.status).toBe("waiting");
    });
  });
});
