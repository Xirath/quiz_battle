import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "@/server/room-manager";
import {
  OPENTDB_CATEGORIES,
  getRandomCategories,
  getCategoryById,
} from "@/server/open-tdb-client";
import type { AuthenticatedUser, CategoryItem } from "@/server/types";

describe("Category Ban / Veto System Unit Tests", () => {
  let roomManager: RoomManager;

  const hostUser: AuthenticatedUser = {
    id: "user-host-1",
    name: "Host Player",
    email: "host@quizbattle.local",
  };

  const challengerUser: AuthenticatedUser = {
    id: "user-challenger-2",
    name: "Challenger Player",
    email: "challenger@quizbattle.local",
  };

  const sampleCategories: CategoryItem[] = [
    { id: 9, name: "General Knowledge" },
    { id: 10, name: "Entertainment: Books" },
    { id: 11, name: "Entertainment: Film" },
    { id: 12, name: "Entertainment: Music" },
    { id: 15, name: "Entertainment: Video Games" },
  ];

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe("getRandomCategories", () => {
    it("returns 5 unique categories from OPENTDB_CATEGORIES", () => {
      expect(OPENTDB_CATEGORIES).toHaveLength(24);
      const categories = getRandomCategories(5);
      expect(categories).toHaveLength(5);

      const ids = categories.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      categories.forEach((cat) => {
        const found = getCategoryById(cat.id);
        expect(found).toBeDefined();
        expect(found?.name).toBe(cat.name);
      });
    });
  });

  describe("RoomManager Ban Phase Lifecycle", () => {
    let roomCode: string;

    beforeEach(() => {
      const room = roomManager.createRoom(hostUser);
      roomManager.joinRoom(room.code, challengerUser);
      roomCode = room.code;
    });

    it("initializes ban phase with 5 categories and sets Host for Turn 1", () => {
      const banState = roomManager.initBanPhase(roomCode, sampleCategories, 10000);

      expect(banState.categories).toHaveLength(5);
      expect(banState.bannedCategoryIds).toEqual([]);
      expect(banState.currentBanningPlayerId).toBe(hostUser.id);
      expect(banState.turnNumber).toBe(1);
      expect(banState.banHistory).toHaveLength(0);
      expect(banState.selectedCategory).toBeNull();

      const match = roomManager.getMatch(roomCode);
      expect(match).not.toBeNull();
      expect(match?.status).toBe("ban_phase");
    });

    it("executes full 4-turn alternating ban sequence: Host -> Challenger -> Host -> Challenger", () => {
      roomManager.initBanPhase(roomCode, sampleCategories, 10000);

      // Turn 1: Host bans General Knowledge (id 9)
      const res1 = roomManager.banCategory(roomCode, hostUser.id, 9, 10000);
      expect(res1.isComplete).toBe(false);
      expect(res1.banState.bannedCategoryIds).toEqual([9]);
      expect(res1.banState.turnNumber).toBe(2);
      expect(res1.banState.currentBanningPlayerId).toBe(challengerUser.id);
      expect(res1.banState.banHistory).toHaveLength(1);
      expect(res1.banState.banHistory[0].bannedByPlayerId).toBe(hostUser.id);

      // Turn 2: Challenger bans Books (id 10)
      const res2 = roomManager.banCategory(roomCode, challengerUser.id, 10, 10000);
      expect(res2.isComplete).toBe(false);
      expect(res2.banState.bannedCategoryIds).toEqual([9, 10]);
      expect(res2.banState.turnNumber).toBe(3);
      expect(res2.banState.currentBanningPlayerId).toBe(hostUser.id);

      // Turn 3: Host bans Film (id 11)
      const res3 = roomManager.banCategory(roomCode, hostUser.id, 11, 10000);
      expect(res3.isComplete).toBe(false);
      expect(res3.banState.bannedCategoryIds).toEqual([9, 10, 11]);
      expect(res3.banState.turnNumber).toBe(4);
      expect(res3.banState.currentBanningPlayerId).toBe(challengerUser.id);

      // Turn 4: Challenger bans Music (id 12) -> Final category should be Video Games (id 15)
      const res4 = roomManager.banCategory(roomCode, challengerUser.id, 12, 10000);
      expect(res4.isComplete).toBe(true);
      expect(res4.selectedCategory).toEqual({
        id: 15,
        name: "Entertainment: Video Games",
      });
      expect(res4.banState.bannedCategoryIds).toEqual([9, 10, 11, 12]);
      expect(res4.banState.selectedCategory).toEqual({
        id: 15,
        name: "Entertainment: Video Games",
      });

      const match = roomManager.getMatch(roomCode);
      expect(match?.selectedCategory).toEqual({
        id: 15,
        name: "Entertainment: Video Games",
      });
    });

    it("rejects bans when it is not the player's turn", () => {
      roomManager.initBanPhase(roomCode, sampleCategories, 10000);

      // Challenger tries to ban on Turn 1 (Host's turn)
      expect(() => {
        roomManager.banCategory(roomCode, challengerUser.id, 9, 10000);
      }).toThrow("Not your turn to ban");
    });

    it("rejects banning an already banned category", () => {
      roomManager.initBanPhase(roomCode, sampleCategories, 10000);
      roomManager.banCategory(roomCode, hostUser.id, 9, 10000);

      // Challenger tries to ban category 9 again on Turn 2
      expect(() => {
        roomManager.banCategory(roomCode, challengerUser.id, 9, 10000);
      }).toThrow("Category is already banned");
    });

    it("rejects banning a category not in the 5 presented categories", () => {
      roomManager.initBanPhase(roomCode, sampleCategories, 10000);

      // Host tries to ban category 23 (History), which was not presented
      expect(() => {
        roomManager.banCategory(roomCode, hostUser.id, 23, 10000);
      }).toThrow("Invalid category");
    });

    it("autoBanCategory picks an unbanned category and advances turn correctly", () => {
      roomManager.initBanPhase(roomCode, sampleCategories, 10000);

      // Turn 1 auto-ban on behalf of Host
      const autoRes1 = roomManager.autoBanCategory(roomCode, 10000);
      expect(autoRes1.isComplete).toBe(false);
      expect(autoRes1.banState.bannedCategoryIds).toHaveLength(1);
      expect(autoRes1.banState.banHistory[0].bannedByPlayerId).toBe(hostUser.id);
      expect(autoRes1.banState.currentBanningPlayerId).toBe(challengerUser.id);

      // Turn 2 auto-ban on behalf of Challenger
      const autoRes2 = roomManager.autoBanCategory(roomCode, 10000);
      expect(autoRes2.isComplete).toBe(false);
      expect(autoRes2.banState.bannedCategoryIds).toHaveLength(2);
      expect(autoRes2.banState.banHistory[1].bannedByPlayerId).toBe(challengerUser.id);
    });
  });
});
