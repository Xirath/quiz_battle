import { decode } from "html-entities";
import type { MatchQuestion, ClientQuestion } from "./types";

export interface OpenTdbRawQuestion {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface OpenTdbResponse {
  response_code: number;
  results?: OpenTdbRawQuestion[];
}

export function shuffleArray<T>(array: readonly T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const FALLBACK_QUESTIONS: Array<{
  category: string;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}> = [
  {
    category: "General Knowledge",
    question: "What is the capital city of France?",
    correctAnswer: "Paris",
    incorrectAnswers: ["London", "Rome", "Berlin"],
  },
  {
    category: "Science & Nature",
    question: "What is the chemical symbol for gold?",
    correctAnswer: "Au",
    incorrectAnswers: ["Ag", "Fe", "Cu"],
  },
  {
    category: "Entertainment: Video Games",
    question: "What year was the original Nintendo Entertainment System (NES) released in North America?",
    correctAnswer: "1985",
    incorrectAnswers: ["1983", "1987", "1989"],
  },
  {
    category: "Geography",
    question: "Which is the largest ocean on Earth?",
    correctAnswer: "Pacific Ocean",
    incorrectAnswers: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean"],
  },
  {
    category: "History",
    question: "Who was the first President of the United States?",
    correctAnswer: "George Washington",
    incorrectAnswers: ["Thomas Jefferson", "John Adams", "Benjamin Franklin"],
  },
  {
    category: "Entertainment: Film & Cinema",
    question: "Which movie won the Academy Award for Best Picture in 1994?",
    correctAnswer: "Forrest Gump",
    incorrectAnswers: ["Pulp Fiction", "The Shawshank Redemption", "Quiz Show"],
  },
  {
    category: "Science: Computers",
    question: "What does HTTP stand for in web browsing?",
    correctAnswer: "Hypertext Transfer Protocol",
    incorrectAnswers: [
      "High Text Transfer Process",
      "Hyperlink Text Technology Protocol",
      "Home Tool Transfer Program",
    ],
  },
  {
    category: "Mythology",
    question: "In Greek mythology, who is the god of the sea?",
    correctAnswer: "Poseidon",
    incorrectAnswers: ["Zeus", "Hades", "Apollo"],
  },
  {
    category: "Sports",
    question: "How many players are on the field for one team in a standard soccer match?",
    correctAnswer: "11",
    incorrectAnswers: ["9", "10", "12"],
  },
  {
    category: "General Knowledge",
    question: "What is the largest mammal currently living on Earth?",
    correctAnswer: "Blue Whale",
    incorrectAnswers: ["African Elephant", "Giraffe", "Colossal Squid"],
  },
  {
    category: "Science: Astronomy",
    question: "Which planet is known as the Red Planet?",
    correctAnswer: "Mars",
    incorrectAnswers: ["Venus", "Jupiter", "Saturn"],
  },
  {
    category: "Entertainment: Music",
    question: "Which English rock band released the iconic album 'Abbey Road' in 1969?",
    correctAnswer: "The Beatles",
    incorrectAnswers: ["The Rolling Stones", "Pink Floyd", "Led Zeppelin"],
  },
  {
    category: "Geography",
    question: "What is the longest river in the world?",
    correctAnswer: "Nile",
    incorrectAnswers: ["Amazon", "Yangtze", "Mississippi"],
  },
  {
    category: "Entertainment: Books",
    question: "Who authored the fantasy novel 'The Hobbit'?",
    correctAnswer: "J.R.R. Tolkien",
    incorrectAnswers: ["C.S. Lewis", "George R.R. Martin", "J.K. Rowling"],
  },
  {
    category: "Science: Physics",
    question: "What subatomic particle carries a negative electric charge?",
    correctAnswer: "Electron",
    incorrectAnswers: ["Proton", "Neutron", "Positron"],
  },
  {
    category: "General Knowledge",
    question: "How many continents are there on Earth?",
    correctAnswer: "7",
    incorrectAnswers: ["5", "6", "8"],
  },
  {
    category: "History",
    question: "In what year did the Titanic sink in the North Atlantic Ocean?",
    correctAnswer: "1912",
    incorrectAnswers: ["1905", "1915", "1920"],
  },
  {
    category: "Entertainment: Television",
    question: "In the animated series 'The Simpsons', what is the name of Homer's favorite bar owner?",
    correctAnswer: "Moe",
    incorrectAnswers: ["Barney", "Carl", "Lenny"],
  },
  {
    category: "Science & Nature",
    question: "What is the hardest natural substance known on Earth?",
    correctAnswer: "Diamond",
    incorrectAnswers: ["Quartz", "Topaz", "Titanium"],
  },
  {
    category: "Geography",
    question: "Which country has the largest land area in the world?",
    correctAnswer: "Russia",
    incorrectAnswers: ["Canada", "China", "United States"],
  },
];

export class OpenTdbClient {
  private sessionToken: string | null = null;
  private tokenFetchingPromise: Promise<string | null> | null = null;

  private async getSessionToken(forceNew = false): Promise<string | null> {
    if (!forceNew && this.sessionToken) {
      return this.sessionToken;
    }

    if (this.tokenFetchingPromise) {
      return this.tokenFetchingPromise;
    }

    this.tokenFetchingPromise = (async () => {
      try {
        const res = await fetch("https://opentdb.com/api_token.php?command=request");
        if (!res.ok) return null;
        const data = (await res.json()) as { response_code: number; token?: string };
        if (data.response_code === 0 && data.token) {
          this.sessionToken = data.token;
          return data.token;
        }
      } catch {
        // Network/API failure
      } finally {
        this.tokenFetchingPromise = null;
      }
      return null;
    })();

    return this.tokenFetchingPromise;
  }

  private async resetSessionToken(): Promise<boolean> {
    if (!this.sessionToken) return false;
    try {
      const res = await fetch(
        `https://opentdb.com/api_token.php?command=reset&token=${this.sessionToken}`
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { response_code: number };
      return data.response_code === 0;
    } catch {
      return false;
    }
  }

  public async fetchQuestions(amount = 20): Promise<MatchQuestion[]> {
    const token = await this.getSessionToken();
    const url = new URL("https://opentdb.com/api.php");
    url.searchParams.set("amount", String(amount));
    url.searchParams.set("type", "multiple");
    if (token) {
      url.searchParams.set("token", token);
    }

    try {
      let res = await fetch(url.toString());
      if (res.ok) {
        let data = (await res.json()) as OpenTdbResponse;

        // Response code 3: Token Not Found / Expired (>6h), request new token
        if (data.response_code === 3) {
          this.sessionToken = null;
          const newToken = await this.getSessionToken(true);
          if (newToken) {
            url.searchParams.set("token", newToken);
          } else {
            url.searchParams.delete("token");
          }
          res = await fetch(url.toString());
          if (res.ok) {
            data = (await res.json()) as OpenTdbResponse;
          }
        }
        // Response code 4: Token empty/exhausted, reset token
        else if (data.response_code === 4 && token) {
          await this.resetSessionToken();
          res = await fetch(url.toString());
          if (res.ok) {
            data = (await res.json()) as OpenTdbResponse;
          }
        }

        if (data.response_code === 0 && data.results && data.results.length > 0) {
          return this.sanitizeQuestions(data.results);
        }
      }
    } catch {
      // Fallback on network errors
    }

    // Fallback to curated pool if rate-limited (code 5) or unreachable
    return this.getFallbackQuestions(amount);
  }

  private formatMatchQuestion(
    idPrefix: string,
    index: number,
    categoryRaw: string,
    questionRaw: string,
    correctAnswerRaw: string,
    incorrectAnswersRaw: string[]
  ): MatchQuestion {
    const category = decode(categoryRaw);
    const question = decode(questionRaw);
    const correctAnswer = decode(correctAnswerRaw);
    const incorrectAnswers = incorrectAnswersRaw.map((ans) => decode(ans));
    const options = shuffleArray([correctAnswer, ...incorrectAnswers]);

    return {
      id: `${idPrefix}-${index}-${Math.random().toString(36).substring(2, 7)}`,
      category,
      question,
      correctAnswer,
      options,
    };
  }

  private sanitizeQuestions(rawQuestions: OpenTdbRawQuestion[]): MatchQuestion[] {
    const timestamp = Date.now();
    return rawQuestions.map((raw, index) =>
      this.formatMatchQuestion(
        `q-${timestamp}`,
        index,
        raw.category,
        raw.question,
        raw.correct_answer,
        raw.incorrect_answers
      )
    );
  }

  private getFallbackQuestions(amount: number): MatchQuestion[] {
    const shuffled = shuffleArray(FALLBACK_QUESTIONS);
    const selected = shuffled.slice(0, Math.min(amount, shuffled.length));

    return selected.map((item, index) =>
      this.formatMatchQuestion(
        "q-fallback",
        index,
        item.category,
        item.question,
        item.correctAnswer,
        item.incorrectAnswers
      )
    );
  }

  public toClientQuestion(
    question: MatchQuestion,
    roundNumber: number
  ): ClientQuestion {
    return {
      roundNumber,
      category: question.category,
      question: question.question,
      options: [...question.options],
    };
  }
}

export const defaultOpenTdbClient = new OpenTdbClient();
