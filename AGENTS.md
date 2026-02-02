# WakaWars (Molty Apps) - Project Specifications

## Overview

- WakaWars is a macOS menu bar app that shares WakaTime daily hours and shows a local leaderboard.
- The app is local-first: no external login provider, no auth tokens, and no remote user database.
- Users set a WakaWars username and their WakaTime API key during onboarding.
- Friends are added by WakaWars username (assumed to match WakaTime username).

## Monorepo Structure

- `apps/server`: Elysia API server (Prisma + PostgreSQL).
- `apps/wakawars`: Electron app (Vite + React renderer).
- `packages/shared`: Shared types + leaderboard helpers.

## Server (Elysia)

- Base URL: `http://localhost:3000` in dev, `https://wakawars.molty.app` in production.
- All WakaWars endpoints are grouped under `/wakawars/v0`.
- Required env: `DATABASE_URL` (PostgreSQL).
- Routes:
  - `GET /wakawars/v0/session`
  - `POST /wakawars/v0/session/login`
  - `POST /wakawars/v0/session/logout`
  - `POST /wakawars/v0/password`
  - `GET /wakawars/v0/config`
  - `POST /wakawars/v0/config`
  - `POST /wakawars/v0/friends`
  - `DELETE /wakawars/v0/friends/:username`
  - `GET /wakawars/v0/stats/today`

## WakaTime Integration

- Daily totals are fetched from:
  - `https://wakatime.com/api/v1/users/current/status_bar/today` for the local user.
  - `https://wakatime.com/api/v1/users/{username}/status_bar/today` for friends.
- Requests use Basic auth with the API key.
- Caching is in-memory on the server to reduce API calls.

## Auth and Sessions

- A password is optional and set after onboarding.
- When a password is set, sessions are required for protected routes.
- Sessions are stored in the database (persistent between app launches).
- The Electron app stores the session id locally and restores it on launch.

## Desktop App (Electron + React)

- Menu bar app with tray icon and hidden window by default (even in dev).
- Settings are opened by a cog icon in the header (no tabs).
- Auto-refreshes stats every 15 minutes.
- Add Friend is docked at the bottom of the main view with a dismiss button.
- Add Friend is also available in Settings.
- Launch at login toggle is available in Settings on macOS.
- UI is compact and competitive (medals for top ranks).

## Updates and Packaging

- Packaging uses electron-builder (DMG + ZIP for macOS).
- Auto-updates use `electron-updater` with a generic feed at:
  - `https://wakawars.molty.app/updates`
- Notarization is enabled via `build/notarize.cjs` and macOS entitlements in `apps/wakawars/build`.

## Bun Usage

- Bun is the package manager and script runner.
- Install dependencies:
  - `bun install`
- Run dev:
  - `bun run dev`
- Run tests:
  - `bun run test`
