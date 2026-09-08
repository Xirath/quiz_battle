@AGENTS.md

## Agent skills

### Issue tracker

GitHub issues tracked via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical roles mapped 1:1 to label names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`CONTEXT.md` and `docs/adr/` at root). See `docs/agents/domain.md`.

## Architecture & Coding Guidelines

### React Server Components (RSC)
- **Server Components by default**: All components must be React Server Components by default.
- **Client Components only when required**: Only add `'use client'` to components that strictly require client-side interactivity, browser APIs, React hooks (`useState`, `useEffect`, `useRef`), or WebSocket event listeners.
- **Push boundaries to the leaves**: Keep client component boundaries as small as possible at the leaves of the component tree; compose pages so data fetching and layout remain on the server and wrap interactive widgets.

### Naming Conventions
- **Files and directories**: Follow Next.js conventions and use lowercase `kebab-case` for all file and directory names (e.g., `user-profile.tsx`, `game-room.ts`, `open-tdb-client.ts`). Framework routing files follow Next.js conventions (`page.tsx`, `layout.tsx`, `route.ts`). Tooling and configuration files are exempt from this convention (e.g., `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `tsconfig.json`).
- **Component identifiers**: Use `PascalCase` for React component functions, types, and exports (e.g., `UserProfile`, `ScoreBoard`, `BattleArena`).

### Styling & Design System
- **CSS variables as single source of truth**: Define all colors, fonts, themes, and accents as semantic CSS variables in `app/globals.css` and map them through `@theme inline`.
- **Semantic theme tokens over hardcoded values**: Components must consume semantic CSS variables and theme utility classes (e.g., `bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `text-primary-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`, `bg-success`, `bg-destructive`) instead of hardcoded hex values, raw RGBs, or un-themed arbitrary palette classes.
