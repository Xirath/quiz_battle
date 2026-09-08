import { createGameServer } from "./game-server";

// Load environment variables if available
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // .env might not exist or already loaded
  }
}

const serverInstance = createGameServer();

serverInstance
  .listen()
  .then(({ port }) => {
    console.log(`[QuizBattle] ⚡ Game Server is running at http://localhost:${port}`);
  })
  .catch((err) => {
    console.error("[QuizBattle] Failed to start Game Server:", err);
    process.exit(1);
  });

const shutdown = async () => {
  console.log("\n[QuizBattle] Shutting down Game Server...");
  await serverInstance.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
