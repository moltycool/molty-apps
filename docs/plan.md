# WakaWars Menu Bar App: Implementation Plan

## Goals
- macOS menu bar app to share WakaTime daily hours and show a daily leaderboard.
- Local-only app: no external login or OAuth; user provides WakaTime API key during onboarding.
- Users can add friends by username; app attempts to fetch their daily stats and handles private/forbidden data gracefully.
- Monorepo with Electron (WakaWars), Vite + React (renderer UI), and Elysia (local server).
- Production-ready, with tests and guarded edge cases.

---

## Research Proposals (3 options)

### Proposal A — **Embedded Elysia server in Electron main process** (single process)
**How it works**
- Electron main process boots and starts an Elysia HTTP server on localhost.
- Renderer UI (Vite/React) calls `http://127.0.0.1:<port>` for config + stats.

**Pros**
- No extra processes to package/monitor.
- Simple runtime distribution (only Electron).
- Lower operational complexity.

**Cons / Risks**
- Elysia Node adapter is a moving target; must track compatibility carefully.
- A crash in main process brings down the server.

**Best fit when**
- You want simple packaging and tight integration.

---

### Proposal B — **Sidecar Elysia server process** (separate Node or Bun runtime)
**How it works**
- Electron main spawns a separate server process (Elysia).
- Renderer talks to it via localhost.

**Pros**
- Isolation between UI and server; one can restart independently.
- Can run Elysia on Bun for “native” runtime support if desired.

**Cons / Risks**
- Packaging is more complex (must bundle server runtime or require Bun/Node).
- Process lifecycle management, port selection, and log handling add complexity.

**Best fit when**
- You need strong isolation or expect heavier server workloads.

---

### Proposal C — **Elysia as a pure in-memory API (no HTTP)**
**How it works**
- Elysia is used for routing logic but invoked directly in the main process (no HTTP server).

**Pros**
- No ports, no network concerns.
- Very fast.

**Cons / Risks**
- Renderer cannot call it directly; requires IPC layer.
- Loses Elysia’s HTTP advantages and complicates tests.

**Best fit when**
- You want IPC-only architecture and minimal HTTP surface.

---

## Selected Plan
**Pick: Proposal B (separate Elysia server process)**

**Why**
- Required by the updated spec: server runs independently at `http://localhost:3000`.
- Clean separation: Electron/renderer never import server code or handle secrets.
- Easier to scale to future integrations (DB, migrations, background jobs).

---

## Concrete Plan (Detailed)

### 1) Monorepo structure
```
/ (root)
  apps/
    wakawars/    # Electron + Vite (React)
    server/      # Elysia server (separate process)
  packages/
    shared/      # Shared types + utilities
  docs/
    research/    # Research deliverables
```

### 2) Shared types + utilities
- `packages/shared`
  - `types.ts`: UserConfig, Friend, PublicConfig, DailyStat, LeaderboardEntry
  - `format.ts`: helpers for hours formatting, delta calculation
  - `leaderboard.ts`: stable sort & rank algorithm
  - Tests: edge cases for sorting, ties, rounding

### 3) Elysia server (local HTTP + Prisma/Postgres)
- `apps/server/src/app.ts`
  - `createServer({ port, hostname, databaseUrl, fetch })`
  - Runs at `http://localhost:3000` with prefix `/wakawars/v0`
  - CORS enabled for `http://localhost:*` origins.
  - Endpoints:
    - `GET /health`
    - `GET /config` (public config, no API key)
    - `POST /config` (username + API key)
    - `POST /friends` (add by username)
    - `DELETE /friends/:username`
    - `GET /stats/today` (leaderboard for today; handles private users)
- `apps/server/prisma/schema.prisma`
  - `User` + `Friend` models
  - Postgres provider, `DATABASE_URL` required
- `apps/server/src/wakatime.ts`
  - `getStatusBarToday(user, apiKey)`
  - Handles 403/404 -> `private`/`not_found` status in results.
  - Short TTL cache (e.g., 2 minutes) to avoid excessive calls.
- Tests for server endpoints using mocked fetch.

### 4) Electron main (menu bar app)
- Create tray icon (template SVG data URL).
- Build a popover-like window anchored under the menu bar icon.
- Keep app running even when all windows are closed.
- Connects to server at `http://localhost:3000`.
- Start local Elysia server on a free port; expose API base to renderer via IPC.
- Hide on blur; support multi-display and clamped positioning.

### 5) Vite + React renderer
- **Onboarding flow** (first run)
  - Input: username + WakaTime API key.
  - Save via `POST /config`.
- **Main view**
  - “Today” leaderboard list (self + friends), sorted by hours.
  - “Add friend” form (username only).
  - Refresh button and last updated timestamp.
  - Empty/permission states when a friend is private.

### 6) Tests & CI-ready scripts
- `packages/shared`: unit tests for formatting + leaderboard ordering.
- `apps/server`: API + storage tests with temp directories.
- Optional smoke test script for server health.

### 7) Production readiness checklist
- Handles empty data, offline errors, and WakaTime API failures.
- All secrets stay in main process / server, not renderer.
- Local storage is scoped to app data directory.
- Strict TypeScript with `noImplicitAny` and `strict` true.

---

## Rollout Phases
1) **Foundation**: monorepo, shared types, server skeleton + tests.
2) **Electron app**: tray window + IPC + server boot.
3) **Renderer**: onboarding + leaderboard UI + friend management.
4) **Harden**: caching, error states, update/refresh UI.
5) **QA**: run tests + manual macOS checks (tray behavior, focus, multi-display).
