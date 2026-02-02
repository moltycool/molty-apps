import { describe, expect, it } from "vitest";
import type { UserConfig } from "@molty/shared";
import { createServer } from "../src/app.js";
import type { ConfigRepository } from "../src/repository.js";

const createMemoryRepository = (): ConfigRepository => {
  let config: UserConfig = {
    wakawarsUsername: "",
    apiKey: "",
    passwordHash: null,
    friends: []
  };

  return {
    getConfig: async () => config,
    saveConfig: async ({ wakawarsUsername, apiKey }) => {
      config = { ...config, wakawarsUsername, apiKey };
      return config;
    },
    addFriend: async ({ username, apiKey }) => {
      if (!username || username === config.wakawarsUsername) {
        return config;
      }

      const exists = config.friends.find((friend) => friend.username === username);
      if (!exists) {
        config = {
          ...config,
          friends: [...config.friends, { username, apiKey: apiKey ?? null }]
        };
      } else if (apiKey) {
        config = {
          ...config,
          friends: config.friends.map((friend) =>
            friend.username === username
              ? {
                  ...friend,
                  apiKey: apiKey ?? friend.apiKey
                }
              : friend
          )
        };
      }

      return config;
    },
    removeFriend: async (username) => {
      config = {
        ...config,
        friends: config.friends.filter((friend) => friend.username !== username)
      };
      return config;
    },
    getAuthState: async () => ({
      userId: 1,
      wakawarsUsername: config.wakawarsUsername,
      passwordHash: config.passwordHash ?? null
    }),
    setPassword: async (passwordHash) => {
      config = { ...config, passwordHash };
      return config;
    }
  };
};

describe("server app", () => {
  it("stores config and returns public config", async () => {
    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      fetcher: async () => new Response()
    });

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "mo",
          apiKey: "key"
        })
      })
    );

    const payload = (await response.json()) as { wakawarsUsername: string; hasApiKey: boolean };
    expect(payload.wakawarsUsername).toBe("mo");
    expect(payload.hasApiKey).toBe(true);

    const configResponse = await app.handle(new Request("http://localhost/wakawars/v0/config"));
    const configPayload = (await configResponse.json()) as { wakawarsUsername: string; hasApiKey: boolean };
    expect(configPayload.wakawarsUsername).toBe("mo");
    expect(configPayload.hasApiKey).toBe(true);
  });

  it("adds friends and returns leaderboard stats", async () => {
    const mockFetch = async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/users/ben/status_bar/today")) {
        return new Response(JSON.stringify({ data: { grand_total: { total_seconds: 1800 } } }), {
          status: 200
        });
      }
      if (url.includes("/users/amy/status_bar/today")) {
        return new Response(JSON.stringify({ data: { grand_total: { total_seconds: 3600 } } }), {
          status: 200
        });
      }
      return new Response(JSON.stringify({ data: { grand_total: { total_seconds: 900 } } }), {
        status: 200
      });
    };

    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      fetcher: mockFetch as typeof fetch
    });

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "mo",
          apiKey: "key"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "amy" })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "ben" })
      })
    );

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today")
    );
    const statsPayload = (await statsResponse.json()) as { entries: Array<{ username: string }> };
    expect(statsPayload.entries.map((entry) => entry.username)).toEqual(["amy", "ben", "mo"]);
  });

  it("marks private users when unauthorized", async () => {
    const mockFetch = async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/users/private/status_bar/today")) {
        return new Response("", { status: 403 });
      }
      return new Response(JSON.stringify({ data: { grand_total: { total_seconds: 1200 } } }), {
        status: 200
      });
    };

    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      fetcher: mockFetch as typeof fetch
    });

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "mo",
          apiKey: "key"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "private" })
      })
    );

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today")
    );
    const statsPayload = (await statsResponse.json()) as {
      entries: Array<{ username: string; status: string }>;
    };

    const privateEntry = statsPayload.entries.find((entry) => entry.username === "private");
    expect(privateEntry?.status).toBe("private");
  });
});
