import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenTdbClient, shuffleArray } from "@/server/open-tdb-client";
import type { MatchQuestion } from "@/server/types";

describe("OpenTdbClient", () => {
  let client: OpenTdbClient;

  beforeEach(() => {
    client = new OpenTdbClient();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("shuffleArray (Fisher-Yates)", () => {
    it("preserves all elements and length when shuffling", () => {
      const original = ["Option A", "Option B", "Option C", "Option D"];
      const shuffled = shuffleArray(original);

      expect(shuffled).toHaveLength(4);
      expect(shuffled.sort()).toEqual([...original].sort());
    });

    it("does not mutate the original array", () => {
      const original = ["A", "B", "C", "D"];
      const copy = [...original];
      shuffleArray(original);

      expect(original).toEqual(copy);
    });
  });

  describe("HTML Entity Sanitization & Decoding", () => {
    it("decodes HTML entities across question text, category, and answers", async () => {
      const mockApiResponse = {
        response_code: 0,
        results: [
          {
            type: "multiple",
            difficulty: "medium",
            category: "Entertainment: Film &amp; Cinema",
            question: "Who said &quot;May the Force be with you&quot; in &#039;Star Wars&#039;?",
            correct_answer: "Han Solo &amp; Obi-Wan",
            incorrect_answers: [
              "Luke &lt;Skywalker&gt;",
              "Darth Vader &copy;",
              "Yoda &amp; Friends",
            ],
          },
        ],
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api_token.php?command=request")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response_code: 0, token: "mock-token-123" }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockApiResponse),
        } as Response);
      });

      const questions = await client.fetchQuestions(1);

      expect(questions).toHaveLength(1);
      const q = questions[0];
      expect(q.category).toBe("Entertainment: Film & Cinema");
      expect(q.question).toBe('Who said "May the Force be with you" in \'Star Wars\'?');
      expect(q.correctAnswer).toBe("Han Solo & Obi-Wan");
      expect(q.options).toContain("Han Solo & Obi-Wan");
      expect(q.options).toContain("Luke <Skywalker>");
      expect(q.options).toContain("Darth Vader ©");
      expect(q.options).toContain("Yoda & Friends");
      expect(q.options).toHaveLength(4);
    });
  });

  describe("Session Token Management", () => {
    it("requests a session token on first query and uses it for question fetching", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api_token.php?command=request")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response_code: 0, token: "tok-abc-999" }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              response_code: 0,
              results: [
                {
                  type: "multiple",
                  difficulty: "easy",
                  category: "General Knowledge",
                  question: "What is 2 + 2?",
                  correct_answer: "4",
                  incorrect_answers: ["1", "2", "3"],
                },
              ],
            }),
        } as Response);
      });

      global.fetch = fetchMock;

      const questions = await client.fetchQuestions(1);
      expect(questions).toHaveLength(1);

      // Verify token request happened
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("api_token.php?command=request")
      );
      // Verify question fetch included token
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("token=tok-abc-999")
      );
    });

    it("requests a new token if response code is 3 (token not found / expired)", async () => {
      let tokenRequestCount = 0;
      let questionCallCount = 0;

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api_token.php?command=request")) {
          tokenRequestCount++;
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response_code: 0, token: `token-v${tokenRequestCount}` }),
          } as Response);
        }
        if (url.includes("api.php")) {
          questionCallCount++;
          if (questionCallCount === 1) {
            // First time token expired
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ response_code: 3, results: [] }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response_code: 0,
                results: [
                  {
                    type: "multiple",
                    difficulty: "easy",
                    category: "General Knowledge",
                    question: "What is 1 + 1?",
                    correct_answer: "2",
                    incorrect_answers: ["0", "3", "4"],
                  },
                ],
              }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const questions = await client.fetchQuestions(1);
      expect(questions).toHaveLength(1);
      expect(questions[0].correctAnswer).toBe("2");
      expect(tokenRequestCount).toBe(2);
    });

    it("resets the session token if response code is 4 (token empty)", async () => {
      let questionCallCount = 0;

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("api_token.php?command=request")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response_code: 0, token: "initial-token" }),
          } as Response);
        }
        if (url.includes("api_token.php?command=reset")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ response_code: 0, token: "initial-token" }),
          } as Response);
        }
        if (url.includes("api.php")) {
          questionCallCount++;
          if (questionCallCount === 1) {
            // First time token empty
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ response_code: 4, results: [] }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response_code: 0,
                results: [
                  {
                    type: "multiple",
                    difficulty: "easy",
                    category: "General Knowledge",
                    question: "What is capital of France?",
                    correct_answer: "Paris",
                    incorrect_answers: ["London", "Rome", "Berlin"],
                  },
                ],
              }),
          } as Response);
        }
        return Promise.reject(new Error("Unknown URL"));
      });

      const questions = await client.fetchQuestions(1);
      expect(questions).toHaveLength(1);
      expect(questions[0].correctAnswer).toBe("Paris");
    });
  });

  describe("Answer Key Masking & Client Stripping", () => {
    it("strips correctAnswer when formatting for client payload", () => {
      const matchQuestion: MatchQuestion = {
        id: "q-test-1",
        category: "Science",
        question: "What is H2O?",
        correctAnswer: "Water",
        options: ["Water", "Helium", "Hydrogen", "Oxygen"],
      };

      const clientPayload = client.toClientQuestion(matchQuestion, 1);

      expect(clientPayload).toEqual({
        roundNumber: 1,
        category: "Science",
        question: "What is H2O?",
        options: ["Water", "Helium", "Hydrogen", "Oxygen"],
      });
      expect("correctAnswer" in clientPayload).toBe(false);
      expect((clientPayload as unknown as Record<string, unknown>).correctAnswer).toBeUndefined();
    });
  });

  describe("Resilience Fallbacks", () => {
    it("returns curated fallback questions when OpenTDB is rate-limited (code 5) or fails", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

      const questions = await client.fetchQuestions(20);

      expect(questions).toHaveLength(20);
      expect(questions[0].question).toBeDefined();
      expect(questions[0].correctAnswer).toBeDefined();
      expect(questions[0].options).toHaveLength(4);
      expect(questions[0].options).toContain(questions[0].correctAnswer);
    });
  });
});
