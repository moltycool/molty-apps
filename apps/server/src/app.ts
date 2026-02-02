import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { computeLeaderboard } from "@molty/shared";
import type { PublicConfig, UserConfig, DailyStat, LeaderboardResponse } from "@molty/shared";
import { createWakaTimeClient } from "./wakatime.js";
import { createPrismaClient } from "./db.js";
import { createPrismaRepository, type ConfigRepository } from "./repository.js";
import { hashPassword, verifyPassword } from "./auth.js";
import {
  createMemorySessionStore,
  createPrismaSessionStore,
  type SessionStore
} from "./session-store.js";

export type ServerOptions = {
  port: number;
  hostname?: string;
  fetcher?: typeof fetch;
  databaseUrl?: string;
  repository?: ConfigRepository;
  sessionStore?: SessionStore;
};

const toPublicConfig = (config: UserConfig): PublicConfig => ({
  wakawarsUsername: config.wakawarsUsername,
  friends: config.friends.map((friend) => ({
    username: friend.username
  })),
  hasApiKey: Boolean(config.apiKey),
  passwordSet: Boolean(config.passwordHash)
});

const normalizeUsername = (value: string): string => value.trim();

export const createServer = ({
  port,
  hostname = "localhost",
  fetcher,
  databaseUrl,
  repository,
  sessionStore
}: ServerOptions) => {
  const prisma = repository ? null : createPrismaClient(databaseUrl);
  const store = repository ?? createPrismaRepository(prisma!);
  const wakatime = createWakaTimeClient({ fetcher });
  const sessions =
    sessionStore ?? (prisma ? createPrismaSessionStore(prisma) : createMemorySessionStore());

  const requireSession = async (headers: Record<string, string | undefined>, set: { status: number }) => {
    const auth = await store.getAuthState();
    if (!auth.passwordHash) {
      return { ok: true, auth } as const;
    }

    const token = headers["x-wakawars-session"];
    if (!token || !(await sessions.verify(token, auth.userId))) {
      set.status = 401;
      return { ok: false, auth } as const;
    }

    return { ok: true, auth } as const;
  };

  const app = new Elysia({ adapter: node() })
    .use(
      cors({
        origin: true,
        methods: ["GET", "POST", "DELETE"]
      })
    )
    .get("/health", () => ({ status: "ok", apps: ["wakawars"] }))
    .group("/wakawars/v0", (group) =>
      group
        .get("/health", () => ({ status: "ok" }))
        .get("/session", async ({ headers }) => {
          const auth = await store.getAuthState();

          if (!auth.passwordHash) {
            return {
              authenticated: true,
              passwordSet: false,
              wakawarsUsername: auth.wakawarsUsername
            };
          }

          const token = headers["x-wakawars-session"];
          const authenticated = Boolean(token && (await sessions.verify(token, auth.userId)));

          return {
            authenticated,
            passwordSet: true,
            wakawarsUsername: auth.wakawarsUsername
          };
        })
        .post(
          "/session/login",
          async ({ body, set }) => {
            const auth = await store.getAuthState();

            if (!auth.passwordHash) {
              set.status = 400;
              return { error: "Password not set" };
            }

            if (normalizeUsername(body.username) !== auth.wakawarsUsername) {
              set.status = 401;
              return { error: "Invalid credentials" };
            }

            const ok = await verifyPassword(body.password, auth.passwordHash);
            if (!ok) {
              set.status = 401;
              return { error: "Invalid credentials" };
            }

            const sessionId = await sessions.create(auth.userId);
            return { sessionId, wakawarsUsername: auth.wakawarsUsername };
          },
          {
            body: t.Object({
              username: t.String(),
              password: t.String()
            })
          }
        )
        .post("/session/logout", async ({ headers }) => {
          const token = headers["x-wakawars-session"];
          if (token) {
            await sessions.revoke(token);
          }
          return { ok: true };
        })
        .post(
          "/password",
          async ({ body, headers, set }) => {
            const password = body.password.trim();
            if (!password) {
              set.status = 400;
              return { error: "Password is required" };
            }

            const auth = await store.getAuthState();
            if (auth.passwordHash) {
              const token = headers["x-wakawars-session"];
              if (!token || !(await sessions.verify(token, auth.userId))) {
                set.status = 401;
                return { error: "Unauthorized" };
              }
            }

            const hashed = await hashPassword(password);
            await store.setPassword(hashed);
            return { passwordSet: true };
          },
          {
            body: t.Object({
              password: t.String()
            })
          }
        )
        .get("/config", async ({ headers, set }) => {
          const authCheck = await requireSession(headers, set);
          if (!authCheck.ok) {
            return { error: "Unauthorized" };
          }

          const config = await store.getConfig();
          return toPublicConfig(config);
        })
        .post(
          "/config",
          async ({ body, set, headers }) => {
            const authCheck = await requireSession(headers, set);
            if (!authCheck.ok) {
              return { error: "Unauthorized" };
            }

            const wakawarsUsername = normalizeUsername(body.wakawarsUsername);
            const apiKey = body.apiKey.trim();

            if (!wakawarsUsername) {
              set.status = 400;
              return { error: "WakaWars username is required" };
            }

            if (!apiKey) {
              set.status = 400;
              return { error: "WakaTime API key is required" };
            }

            const updated = await store.saveConfig({
              wakawarsUsername,
              apiKey
            });

            return toPublicConfig(updated);
          },
          {
            body: t.Object({
              wakawarsUsername: t.String(),
              apiKey: t.String()
            })
          }
        )
        .post(
          "/friends",
          async ({ body, set, headers }) => {
            const authCheck = await requireSession(headers, set);
            if (!authCheck.ok) {
              return { error: "Unauthorized" };
            }

            const friendUsername = normalizeUsername(body.username);
            const friendApiKey = body.apiKey?.trim() || null;

            if (!friendUsername) {
              set.status = 400;
              return { error: "Friend username is required" };
            }

            const updated = await store.addFriend({
              username: friendUsername,
              apiKey: friendApiKey
            });

            return toPublicConfig(updated);
          },
          {
            body: t.Object({
              username: t.String(),
              apiKey: t.Optional(t.String())
            })
          }
        )
        .delete(
          "/friends/:username",
          async ({ params, headers, set }) => {
            const authCheck = await requireSession(headers, set);
            if (!authCheck.ok) {
              return { error: "Unauthorized" };
            }

            const friendUsername = normalizeUsername(params.username);

            const updated = await store.removeFriend(friendUsername);

            return toPublicConfig(updated);
          },
          {
            params: t.Object({
              username: t.String()
            })
          }
        )
        .get("/stats/today", async ({ set, headers }) => {
          const authCheck = await requireSession(headers, set);
          if (!authCheck.ok) {
            return { error: "Unauthorized" };
          }

          const config = await store.getConfig();

          if (!config.wakawarsUsername || !config.apiKey) {
            set.status = 400;
            return { error: "App is not configured" };
          }

          const users = [
            {
              username: config.wakawarsUsername,
              wakatimeUsername: "current",
              apiKey: config.apiKey
            },
            ...config.friends.map((friend) => ({
              username: friend.username,
              wakatimeUsername: friend.username,
              apiKey: friend.apiKey || config.apiKey
            }))
          ];

          const results = await Promise.all(
            users.map(async (user) => {
              if (!user.apiKey) {
                return {
                  username: user.username,
                  status: "error",
                  totalSeconds: 0,
                  error: "Missing API key",
                  fetchedAt: Date.now()
                } as const;
              }

              return wakatime.getStatusBarToday(user.wakatimeUsername, user.apiKey);
            })
          );

          const stats: DailyStat[] = results.map((result, index) => ({
            username: users[index].username,
            totalSeconds: result.totalSeconds,
            status: result.status,
            error: result.error ?? null
          }));

          const entries = computeLeaderboard(stats, config.wakawarsUsername);
          const updatedAtEpoch = Math.max(...results.map((result) => result.fetchedAt));

          const response: LeaderboardResponse = {
            date: new Date().toISOString().slice(0, 10),
            updatedAt: new Date(updatedAtEpoch).toISOString(),
            entries
          };

          return response;
        })
    );

  const listen = () => {
    app.listen({ port, hostname });
    return app;
  };

  const disconnect = async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  };

  const close = async () => {
    if (app.server) {
      await new Promise<void>((resolve) => app.server?.close(() => resolve()));
    }
    await disconnect();
  };

  return { app, listen, store, disconnect, close };
};
