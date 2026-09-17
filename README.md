# ⚔️ Quiz Battle

**Quiz Battle** is a real-time 1v1 multiplayer trivia battle web application built with **Next.js**, **Socket.io**, and **PostgreSQL (Supabase)**. Two players face off in high-intensity live duels, racing to be the first to reach 6 correct answers.

---

## 🎯 Problem and Target Audience

### Problem
Traditional digital trivia games and quiz applications are often asynchronous (turn-based with long waiting times), single-player only, or lack real-time competitive tension. Players either wait for opponents to take their turn hours later or compete against static high-score tables. There is a lack of lightweight, browser-based multiplayer games where friends or colleagues can immediately join a room via a quick code, strategically ban quiz categories, and duel simultaneously in real time under an active countdown timer.

### Target Audience
* **Trivia & Quiz Enthusiasts:** Players who enjoy fast-paced, direct head-to-head knowledge competitions.
* **Friends, Students & Colleagues:** Groups wanting a quick, engaging activity during breaks, study sessions, or social events.
* **Casual Gamers:** Users seeking instant browser-based gameplay with no app downloads, installations, or complicated setups.

---

## ⚡ Features

- **⚔️ 1v1 Real-Time Multiplayer Battles:** Instant room creation and pairing via 6-character room codes powered by low-latency Socket.io WebSockets.
- **🚫 Strategic Category Ban Phase:** Before starting a match, players take turns banning trivia categories until a single contested category remains.
- **⏱️ Synchronized Rounds & Active Timer:** Both players receive identical questions simultaneously with a synchronized 10-second countdown timer.
- **🏆 First to 6 Points (Score):** The match is won by the first player to submit 6 correct answers.
- **🔥 Sudden Death & Tiebreakers:** If question pools run out or ties occur at match point, sudden-death questions determine the winner.
- **🌐 Dynamic Trivia via Open Trivia DB:** Real-time question fetching across multiple categories and difficulties with secure HTML entity decoding.
- **🔐 Seamless Authentication:**
  - Google OAuth integration for production and standard users.
  - Built-in **Dev Mock Login** for rapid local multi-user testing in standard and incognito browser tabs.
- **📊 Persistent Stats & Match History:** Comprehensive user stats (wins, losses, total matches, total correct answers) and detailed match records persisted to PostgreSQL via Prisma ORM.
- **🔄 Rematch & Room Lifecycle:** Seamless rematch triggers within the same room immediately following match conclusion.
- **🛡️ Reconnection & Forfeit (Walkover) Handling:** Grace period for transient disconnects and automatic forfeit victory awarded if an opponent leaves mid-match.

---

## 📸 Screenshots, Demo & Deployment

> 🚀 **Live Demo:** [https://quiz-battle-three.vercel.app/](https://quiz-battle-three.vercel.app/)

### Screenshots

| Lobby & Room Creation | Category Ban Phase |
| :---: | :---: |
| ![Lobby & Room Creation](public/screenshots/lobby.png) | ![Category Ban Phase](public/screenshots/category-ban.png) |

| Active Battle Match | Match Results & Rematch |
| :---: | :---: |
| ![Active Battle Match](public/screenshots/battle.png) | ![Match Results](public/screenshots/match-results.png) |

---

## 🛠️ Technology Choices (Tech Stack)

The project uses a modern fullstack TypeScript architecture designed for performance, type safety, and real-time multiplayer state management:

| Domain | Technology / Library | Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **Next.js 16 (App Router)** & **React 19** | React Server Components (RSC) by default for fast initial render and SEO, isolating Client Components to interactive leaves. |
| **Styling** | **Tailwind CSS v4** | Modern utility-first CSS engine with semantic theme tokens and responsive layouts. |
| **Realtime & WebSockets** | **Socket.io & Node.js** | Dedicated standalone server ensuring reliable in-memory room state, question timers, and instant client synchronization. |
| **Database & ORM** | **PostgreSQL (Supabase)** & **Prisma ORM** | Scalable cloud relational database with type-safe queries, relations, and automated schema migrations. |
| **Authentication** | **Auth.js (NextAuth v5 beta)** | Flexible auth handling with Prisma Adapter, Google OAuth provider, and Dev Mock Auth for streamlined testing. |
| **Trivia Source** | **Open Trivia DB API** | Extensive open trivia question database with categorized multiple-choice questions. |
| **Testing & Tooling** | **Vitest**, **TypeScript**, **ESLint**, **Concurrently** | Fast unit and integration tests, strict compile-time type safety, and concurrent multi-process developer workflow. |

---

## 💻 Local Setup

Follow these steps to run the application locally:

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- `npm`, `pnpm`, or `yarn`
- A free [Supabase](https://supabase.com/) PostgreSQL database (or local PostgreSQL instance)

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/quiz_battle.git
cd quiz_battle
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables (`.env`)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your configuration in `.env`:
```env
# Supabase PostgreSQL Connection Strings
DATABASE_URL="postgresql://postgres.yourprojectref:yourpassword@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.yourprojectref:yourpassword@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# Auth.js Secret (random 32+ character string in development)
AUTH_SECRET="your-development-secret-key-at-least-32-chars-long"
AUTH_TRUST_HOST=true

# Google OAuth (Optional in development if using Dev Mock Login)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# Enable Dev Mock Login for local testing
ENABLE_DEV_MOCK_AUTH=true
```

### 4. Sync Database Schema
Apply the Prisma schema to your database and generate the Prisma Client:
```bash
npm run db:push
npm run db:generate
```

### 5. Start Development Servers
Run both the Next.js frontend (port 3000) and the standalone Socket.io game server (port 3001) concurrently:
```bash
npm run dev
```

### 6. Open in Browser
- Navigate to [http://localhost:3000](http://localhost:3000).
- **Multiplayer Testing Tip:** Open a normal browser window and sign in as *Player 1 (Alice)* using Dev Mock Login. Then open an **Incognito Window** and sign in as *Player 2 (Bob)*. Create a room in one window and join with the 6-character code in the other.

### 7. Run Test Suite
```bash
npm run test
```

---

## ⚠️ Known Limitations

- **Standalone Socket Server Deployment:** Serverless environments (like standard Vercel serverless functions) do not support persistent stateful WebSocket connections. In production, the Socket.io server must be deployed to a persistent container/host (such as Render, Railway, or Fly.io).
- **Open Trivia DB Rate Limits:** The Open Trivia DB API enforces IP-based rate limiting on consecutive requests, which can lead to request throttling if many matches are initialized in rapid succession.
- **Question Language:** Questions sourced dynamically from Open Trivia DB are in English.
- **Player Limit:** The current room architecture is purposefully designed for 1v1 duels and does not support 3+ concurrent players in a single match.

---

## 🚀 Possible Next Steps

1. **Multiplayer Battle Royale Mode:** Expand room state to support 3–8 concurrent players with round-by-round eliminations.
2. **AI-Generated & Multilingual Questions:** Integrate OpenAI or Google Gemini API to generate dynamic questions in Swedish and specialized niche topics.
3. **Global Leaderboard & MMR/ELO System:** Introduce competitive ranks, matchmaking tiers, and an all-time global leaderboard.
4. **Audio & Sound Effects:** Add high-impact sound design for countdowns, buzzer choices, winning streaks, and defeat/victory screens.
5. **Custom Quiz Creator:** Enable users to author, publish, and challenge friends with custom-built question decks.
6. **Progressive Web App (PWA):** Enable mobile installability, offline indicators, and native push notifications for match invites.

