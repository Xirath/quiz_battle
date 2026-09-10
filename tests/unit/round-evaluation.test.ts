import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "@/server/room-manager";
import type { AuthenticatedUser, MatchQuestion } from "@/server/types";

describe("RoomManager - Round Evaluation & Answer Submissions", () => {
  let roomManager: RoomManager;
  const host: AuthenticatedUser = {
    id: "host-user-1",
    name: "Host User",
    email: "host@test.com",
  };
  const challenger: AuthenticatedUser = {
    id: "challenger-user-2",
    name: "Challenger User",
    email: "challenger@test.com",
  };

  const sampleQuestions: MatchQuestion[] = [
    {
      id: "q-1",
      category: "Science",
      question: "What is H2O?",
      correctAnswer: "Water",
      options: ["Water", "Oxygen", "Hydrogen", "Helium"],
    },
    {
      id: "q-2",
      category: "History",
      question: "Who was the first president of the United States?",
      correctAnswer: "George Washington",
      options: ["George Washington", "Thomas Jefferson", "Abraham Lincoln", "John Adams"],
    },
  ];

  let roomCode: string;

  beforeEach(() => {
    roomManager = new RoomManager();
    const room = roomManager.createRoom(host);
    roomCode = room.code;
    roomManager.joinRoom(roomCode, challenger);
    roomManager.startMatch(roomCode, sampleQuestions);
  });

  it("sets match status to in_round and records answers correctly", () => {
    roomManager.startRound(roomCode, 1);
    const match = roomManager.getMatch(roomCode);
    expect(match?.status).toBe("in_round");
    expect(match?.currentRoundNumber).toBe(1);

    // Host submits answer
    const hostResult = roomManager.submitAnswer(roomCode, host.id, 1, "Water");
    expect(hostResult.isCorrect).toBe(true);
    expect(hostResult.isFirst).toBe(true);
    expect(hostResult.bothAnswered).toBe(false);

    const matchAfterHost = roomManager.getMatch(roomCode);
    expect(matchAfterHost?.hostAnswer).toBe("Water");
    expect(matchAfterHost?.challengerAnswer).toBeNull();

    // Challenger submits answer
    const challengerResult = roomManager.submitAnswer(roomCode, challenger.id, 1, "Oxygen");
    expect(challengerResult.isCorrect).toBe(false);
    expect(challengerResult.isFirst).toBe(false);
    expect(challengerResult.bothAnswered).toBe(true);

    const matchAfterBoth = roomManager.getMatch(roomCode);
    expect(matchAfterBoth?.challengerAnswer).toBe("Oxygen");
  });

  it("prevents double submissions from the same player in the same round", () => {
    roomManager.startRound(roomCode, 1);
    roomManager.submitAnswer(roomCode, host.id, 1, "Water");

    expect(() => {
      roomManager.submitAnswer(roomCode, host.id, 1, "Oxygen");
    }).toThrow("Player has already submitted an answer for this round");
  });

  it("rejects answer if roundNumber does not match current round", () => {
    roomManager.startRound(roomCode, 1);

    expect(() => {
      roomManager.submitAnswer(roomCode, host.id, 2, "Water");
    }).toThrow("Invalid round number");
  });

  it("evaluates round correctly when both submit answers", () => {
    roomManager.startRound(roomCode, 1);
    roomManager.submitAnswer(roomCode, host.id, 1, "Water");
    roomManager.submitAnswer(roomCode, challenger.id, 1, "Oxygen");

    const result = roomManager.evaluateRound(roomCode);
    expect(result).not.toBeNull();
    expect(result?.roundNumber).toBe(1);
    expect(result?.correctAnswer).toBe("Water");
    expect(result?.hostAnswer).toBe("Water");
    expect(result?.challengerAnswer).toBe("Oxygen");
    expect(result?.hostCorrect).toBe(true);
    expect(result?.challengerCorrect).toBe(false);
    expect(result?.hostScore).toBe(1);
    expect(result?.challengerScore).toBe(0);

    const updatedMatch = roomManager.getMatch(roomCode);
    expect(updatedMatch?.status).toBe("ROUND_RESULT");
    expect(updatedMatch?.hostScore).toBe(1);
    expect(updatedMatch?.challengerScore).toBe(0);
  });

  it("evaluates round correctly when neither player submits (timer expires)", () => {
    roomManager.startRound(roomCode, 1);
    // No answers submitted

    const result = roomManager.evaluateRound(roomCode);
    expect(result).not.toBeNull();
    expect(result?.hostAnswer).toBeNull();
    expect(result?.challengerAnswer).toBeNull();
    expect(result?.hostCorrect).toBe(false);
    expect(result?.challengerCorrect).toBe(false);
    expect(result?.hostScore).toBe(0);
    expect(result?.challengerScore).toBe(0);
  });

  it("transitions to next round cleanly", () => {
    roomManager.startRound(roomCode, 1);
    roomManager.submitAnswer(roomCode, host.id, 1, "Water");
    roomManager.submitAnswer(roomCode, challenger.id, 1, "Water");
    roomManager.evaluateRound(roomCode);

    const next = roomManager.nextRound(roomCode);
    expect(next).not.toBeNull();
    expect(next?.roundNumber).toBe(2);
    expect(next?.question.id).toBe("q-2");

    const match = roomManager.getMatch(roomCode);
    expect(match?.currentRoundNumber).toBe(2);
    expect(match?.status).toBe("in_round");
    expect(match?.hostAnswer).toBeNull();
    expect(match?.challengerAnswer).toBeNull();
  });
});
