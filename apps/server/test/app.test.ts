import { describe, expect, it } from "vitest";
import type { DailyStatStatus, UserConfig } from "@molty/shared";
import { createServer } from "../src/app.js";
import type { AchievementContextKind, UserRepository } from "../src/repository.js";
import { ACHIEVEMENT_DEFINITIONS } from "../src/achievements.js";

type UserRecord = Omit<UserConfig, "friends" | "groups">;
type DailyStatRecord = {
  userId: number;
  dateKey: string;
  totalSeconds: number;
  status: DailyStatStatus;
  error: string | null;
  fetchedAt: Date;
};
type WeeklyStatRecord = {
  userId: number;
  rangeKey: string;
  totalSeconds: number;
  dailyAverageSeconds: number;
  status: DailyStatStatus;
  error: string | null;
  fetchedAt: Date;
};
type AchievementRecord = {
  userId: number;
  achievementId: string;
  contextKind: AchievementContextKind;
  contextKey: string;
  awardedAt: Date;
  metadata: unknown | null;
};

const createMemoryRepository = (): UserRepository => {
  let users: UserRecord[] = [];
  let friendships: Array<{ userId: number; friendId: number }> = [];
  let groups: Array<{ id: number; ownerId: number; name: string }> = [];
  let groupMembers: Array<{ groupId: number; userId: number }> = [];
  let dailyStats: DailyStatRecord[] = [];
  let weeklyStats: WeeklyStatRecord[] = [];
  let achievements: AchievementRecord[] = [];
  let nextId = 1;
  let nextGroupId = 1;

  const withRelations = (user: UserRecord): UserConfig => {
    const friends = friendships
      .filter((entry) => entry.userId === user.id)
      .map((entry) => users.find((friend) => friend.id === entry.friendId))
      .filter(Boolean)
      .map((friend) => ({
        id: friend!.id,
        username: friend!.wakawarsUsername,
        apiKey: friend!.apiKey
      }));

    return {
      ...user,
      friends,
      groups: groups
        .filter((group) => group.ownerId === user.id)
        .map((group) => ({
          id: group.id,
          name: group.name,
          members: groupMembers
            .filter((member) => member.groupId === group.id)
            .map((member) => users.find((entry) => entry.id === member.userId))
            .filter(Boolean)
            .map((member) => ({
              id: member!.id,
              username: member!.wakawarsUsername
            }))
        }))
    };
  };

  const findUser = (predicate: (user: UserRecord) => boolean) => users.find(predicate) ?? null;

  return {
    countUsers: async () => users.length,
    listUsers: async () =>
      users.map((user) => ({
        id: user.id,
        wakawarsUsername: user.wakawarsUsername,
        apiKey: user.apiKey,
        wakatimeTimezone: user.wakatimeTimezone ?? null
      })),
    getUsersByIds: async (userIds) =>
      users
        .filter((user) => userIds.includes(user.id))
        .map((user) => ({
          id: user.id,
          wakawarsUsername: user.wakawarsUsername,
          statsVisibility: user.statsVisibility,
          isCompeting: user.isCompeting,
          wakatimeTimezone: user.wakatimeTimezone ?? null
        })),
    getUserById: async (userId) => {
      const user = findUser((entry) => entry.id === userId);
      return user ? withRelations(user) : null;
    },
    getUserByUsername: async (username) => {
      const user = findUser((entry) => entry.wakawarsUsername === username);
      return user ? withRelations(user) : null;
    },
    createUser: async ({ wakawarsUsername, apiKey }) => {
      const user: UserRecord = {
        id: nextId++,
        wakawarsUsername,
        apiKey,
        wakatimeTimezone: null,
        passwordHash: null,
        statsVisibility: "everyone",
        isCompeting: true
      };
      users = [...users, user];
      return withRelations(user);
    },
    updateUser: async (userId, { wakawarsUsername, apiKey }) => {
      users = users.map((user) =>
        user.id === userId ? { ...user, wakawarsUsername, apiKey } : user
      );
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    setWakaTimeTimezone: async (userId, timeZone) => {
      users = users.map((user) =>
        user.id === userId ? { ...user, wakatimeTimezone: timeZone } : user
      );
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    setPassword: async (userId, passwordHash) => {
      users = users.map((user) => (user.id === userId ? { ...user, passwordHash } : user));
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    setStatsVisibility: async (userId, statsVisibility) => {
      users = users.map((user) =>
        user.id === userId ? { ...user, statsVisibility } : user
      );
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    setCompetitionStatus: async (userId, isCompeting) => {
      users = users.map((user) =>
        user.id === userId ? { ...user, isCompeting } : user
      );
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    addFriendship: async (userId, friendId) => {
      const exists = friendships.some(
        (entry) => entry.userId === userId && entry.friendId === friendId
      );
      if (!exists && userId !== friendId) {
        friendships = [...friendships, { userId, friendId }];
      }
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    removeFriendship: async (userId, friendId) => {
      friendships = friendships.filter(
        (entry) => !(entry.userId === userId && entry.friendId === friendId)
      );
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    createGroup: async (userId, name) => {
      groups = [...groups, { id: nextGroupId++, ownerId: userId, name }];
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    deleteGroup: async (userId, groupId) => {
      groups = groups.filter(
        (group) => !(group.id === groupId && group.ownerId === userId)
      );
      groupMembers = groupMembers.filter((member) => member.groupId !== groupId);
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    addGroupMember: async (userId, groupId, memberId) => {
      const group = groups.find(
        (entry) => entry.id === groupId && entry.ownerId === userId
      );
      const exists = groupMembers.some(
        (entry) => entry.groupId === groupId && entry.userId === memberId
      );
      if (group && !exists && userId !== memberId) {
        groupMembers = [...groupMembers, { groupId, userId: memberId }];
      }
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    removeGroupMember: async (userId, groupId, memberId) => {
      const group = groups.find(
        (entry) => entry.id === groupId && entry.ownerId === userId
      );
      if (group) {
        groupMembers = groupMembers.filter(
          (entry) => !(entry.groupId === groupId && entry.userId === memberId)
        );
      }
      const updated = findUser((entry) => entry.id === userId);
      return withRelations(updated!);
    },
    getIncomingFriendIds: async (userId, candidateIds) =>
      friendships
        .filter((entry) => entry.friendId === userId && candidateIds.includes(entry.userId))
        .map((entry) => entry.userId),
    getGroupPeerIds: async (userId) => {
      const groupIds = new Set<number>();
      groups
        .filter((group) => group.ownerId === userId)
        .forEach((group) => groupIds.add(group.id));
      groupMembers
        .filter((member) => member.userId === userId)
        .forEach((member) => groupIds.add(member.groupId));

      const peerIds = new Set<number>();
      groupIds.forEach((groupId) => {
        const group = groups.find((entry) => entry.id === groupId);
        if (group) {
          peerIds.add(group.ownerId);
        }
        groupMembers
          .filter((member) => member.groupId === groupId)
          .forEach((member) => peerIds.add(member.userId));
      });
      peerIds.delete(userId);
      return Array.from(peerIds);
    },
    getGroupOwnerIdsForMember: async (memberId, ownerIds) =>
      groups
        .filter((group) => ownerIds.includes(group.ownerId))
        .filter((group) =>
          groupMembers.some(
            (member) => member.groupId === group.id && member.userId === memberId
          )
        )
        .map((group) => group.ownerId),
    searchUsers: async (query, options) => {
      const normalized = query.toLowerCase();
      const filtered = users.filter(
        (user) =>
          user.wakawarsUsername.toLowerCase().includes(normalized) &&
          user.id !== options?.excludeUserId
      );
      return filtered
        .slice(0, options?.limit ?? filtered.length)
        .map((user) => ({ id: user.id, wakawarsUsername: user.wakawarsUsername }));
    },
    upsertDailyStat: async (input) => {
      const existingIndex = dailyStats.findIndex(
        (stat) => stat.userId === input.userId && stat.dateKey === input.dateKey
      );
      const record: DailyStatRecord = {
        userId: input.userId,
        dateKey: input.dateKey,
        totalSeconds: input.totalSeconds,
        status: input.status,
        error: input.error ?? null,
        fetchedAt: input.fetchedAt
      };
      if (existingIndex >= 0) {
        dailyStats = dailyStats.map((stat, index) => (index === existingIndex ? record : stat));
        return;
      }
      dailyStats = [...dailyStats, record];
    },
    getDailyStats: async ({ userIds, dateKey }) =>
      dailyStats
        .filter((stat) => userIds.includes(stat.userId) && stat.dateKey === dateKey)
        .map((stat) => ({
          ...stat,
          username: users.find((user) => user.id === stat.userId)?.wakawarsUsername ?? ""
        })),
    upsertWeeklyStat: async (input) => {
      const existingIndex = weeklyStats.findIndex(
        (stat) => stat.userId === input.userId && stat.rangeKey === input.rangeKey
      );
      const record: WeeklyStatRecord = {
        userId: input.userId,
        rangeKey: input.rangeKey,
        totalSeconds: input.totalSeconds,
        dailyAverageSeconds: input.dailyAverageSeconds,
        status: input.status,
        error: input.error ?? null,
        fetchedAt: input.fetchedAt
      };
      if (existingIndex >= 0) {
        weeklyStats = weeklyStats.map((stat, index) => (index === existingIndex ? record : stat));
        return;
      }
      weeklyStats = [...weeklyStats, record];
    },
    getWeeklyStats: async ({ userIds, rangeKey }) =>
      weeklyStats
        .filter((stat) => userIds.includes(stat.userId) && stat.rangeKey === rangeKey)
        .map((stat) => ({
          ...stat,
          username: users.find((user) => user.id === stat.userId)?.wakawarsUsername ?? ""
        })),
    grantAchievement: async (input) => {
      const existingIndex = achievements.findIndex(
        (entry) =>
          entry.userId === input.userId &&
          entry.achievementId === input.achievementId &&
          entry.contextKind === input.contextKind &&
          entry.contextKey === input.contextKey
      );
      const record: AchievementRecord = {
        userId: input.userId,
        achievementId: input.achievementId,
        contextKind: input.contextKind,
        contextKey: input.contextKey,
        awardedAt: input.awardedAt,
        metadata: input.metadata ?? null
      };
      if (existingIndex >= 0) {
        achievements = achievements.map((entry, index) =>
          index === existingIndex ? record : entry
        );
        return;
      }

      achievements = [...achievements, record];
    },
    listAchievementUnlocks: async ({ userId }) => {
      const grouped = new Map<
        string,
        { count: number; firstAwardedAt: Date; lastAwardedAt: Date }
      >();

      achievements
        .filter((entry) => entry.userId === userId)
        .forEach((entry) => {
          const existing = grouped.get(entry.achievementId);
          if (!existing) {
            grouped.set(entry.achievementId, {
              count: 1,
              firstAwardedAt: entry.awardedAt,
              lastAwardedAt: entry.awardedAt
            });
            return;
          }

          grouped.set(entry.achievementId, {
            count: existing.count + 1,
            firstAwardedAt:
              existing.firstAwardedAt.getTime() <= entry.awardedAt.getTime()
                ? existing.firstAwardedAt
                : entry.awardedAt,
            lastAwardedAt:
              existing.lastAwardedAt.getTime() >= entry.awardedAt.getTime()
                ? existing.lastAwardedAt
                : entry.awardedAt
          });
        });

      return Array.from(grouped.entries())
        .map(([achievementId, value]) => ({
          achievementId,
          count: value.count,
          firstAwardedAt: value.firstAwardedAt,
          lastAwardedAt: value.lastAwardedAt
        }))
        .sort((a, b) => b.lastAwardedAt.getTime() - a.lastAwardedAt.getTime());
    },
    createProviderLog: async () => {}
  };
};

const getSessionId = async (response: Response) => {
  const payload = (await response.json()) as {
    sessionId?: string;
    config?: { wakawarsUsername: string; hasApiKey: boolean };
  };
  return { sessionId: payload.sessionId ?? null, payload };
};

describe("server app", () => {
  it("stores config and returns public config", async () => {
    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      enableStatusSync: false
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

    const { sessionId, payload } = await getSessionId(response);
    expect(sessionId).toBeTruthy();
    expect(payload.config.wakawarsUsername).toBe("mo");
    expect(payload.config.hasApiKey).toBe(true);

    const configResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );
    const configPayload = (await configResponse.json()) as {
      wakawarsUsername: string;
      hasApiKey: boolean;
    };
    expect(configPayload.wakawarsUsername).toBe("mo");
    expect(configPayload.hasApiKey).toBe(true);
  });

  it("updates username from settings session", async () => {
    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "amy",
          apiKey: "key"
        })
      })
    );

    const updateResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/username", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ wakawarsUsername: "captain-mo" })
      })
    );
    const updatePayload = (await updateResponse.json()) as {
      wakawarsUsername: string;
    };
    expect(updateResponse.status).toBe(200);
    expect(updatePayload.wakawarsUsername).toBe("captain-mo");

    const takenResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/username", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ wakawarsUsername: "amy" })
      })
    );
    expect(takenResponse.status).toBe(409);
  });

  it("adds friends and returns leaderboard stats", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "amy",
          apiKey: "key"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "ben",
          apiKey: "key"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "amy" })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "ben" })
      })
    );

    const dateKey = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const mo = await store.getUserByUsername("mo");
    const amy = await store.getUserByUsername("amy");
    const ben = await store.getUserByUsername("ben");
    await store.upsertDailyStat({
      userId: mo!.id,
      dateKey,
      totalSeconds: 900,
      status: "ok",
      error: null,
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: amy!.id,
      dateKey,
      totalSeconds: 3600,
      status: "ok",
      error: null,
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: ben!.id,
      dateKey,
      totalSeconds: 1800,
      status: "ok",
      error: null,
      fetchedAt: now
    });

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );
    const statsPayload = (await statsResponse.json()) as { entries: Array<{ username: string }> };
    expect(statsPayload.entries.map((entry) => entry.username)).toEqual(["amy", "ben", "mo"]);
  });

  it("includes group members in leaderboards for all members", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId: moSession } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    const { sessionId: amySession } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "amy",
            apiKey: "key"
          })
        })
      )
    );

    await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "ben",
            apiKey: "key"
          })
        })
      )
    );

    const groupResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/groups", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": moSession ?? ""
        },
        body: JSON.stringify({ name: "Alpha" })
      })
    );
    const groupPayload = (await groupResponse.json()) as {
      groups: Array<{ id: number }>;
    };
    const groupId = groupPayload.groups[0]?.id;
    expect(groupId).toBeTruthy();

    await app.handle(
      new Request(`http://localhost/wakawars/v0/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": moSession ?? ""
        },
        body: JSON.stringify({ username: "amy" })
      })
    );

    await app.handle(
      new Request(`http://localhost/wakawars/v0/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": moSession ?? ""
        },
        body: JSON.stringify({ username: "ben" })
      })
    );

    const dateKey = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const mo = await store.getUserByUsername("mo");
    const amy = await store.getUserByUsername("amy");
    const ben = await store.getUserByUsername("ben");
    await store.upsertDailyStat({
      userId: mo!.id,
      dateKey,
      totalSeconds: 3600,
      status: "ok",
      error: null,
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: amy!.id,
      dateKey,
      totalSeconds: 900,
      status: "ok",
      error: null,
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: ben!.id,
      dateKey,
      totalSeconds: 1800,
      status: "ok",
      error: null,
      fetchedAt: now
    });

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today", {
        headers: { "x-wakawars-session": amySession ?? "" }
      })
    );
    const statsPayload = (await statsResponse.json()) as { entries: Array<{ username: string }> };
    const usernames = statsPayload.entries.map((entry) => entry.username).sort();
    expect(usernames).toEqual(["amy", "ben", "mo"]);
  });

  it("returns weekly leaderboard stats sorted by total time", async () => {
    const repository = createMemoryRepository();
    const otherOffset = 600;
    const dailyAverageOffset = 60;
    const weeklyStatsByKey = new Map([
      ["key-mo", { totalSeconds: 7200, dailyAverageSeconds: 1028 }],
      ["key-amy", { totalSeconds: 14400, dailyAverageSeconds: 2057 }],
      ["key-ben", { totalSeconds: 3600, dailyAverageSeconds: 514 }]
    ]);
    const fetcher: typeof fetch = async (_input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      const authHeader = headers?.Authorization ?? headers?.authorization ?? "";
      const encoded = authHeader.replace(/^Basic\s+/i, "");
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const apiKey = decoded.split(":")[0] ?? "";
      const stat = weeklyStatsByKey.get(apiKey);

      if (!stat) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          data: {
            total_seconds: stat.totalSeconds,
            total_seconds_including_other_language: stat.totalSeconds + otherOffset,
            daily_average: stat.dailyAverageSeconds,
            daily_average_including_other_language: stat.dailyAverageSeconds + dailyAverageOffset
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };
    const { app, weeklyCache } = createServer({
      port: 0,
      repository,
      fetcher,
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key-mo"
          })
        })
      )
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "amy",
          apiKey: "key-amy"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "ben",
          apiKey: "key-ben"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "amy" })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "ben" })
      })
    );

    await weeklyCache.runOnce();

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/weekly", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );
    const statsPayload = (await statsResponse.json()) as {
      entries: Array<{
        username: string;
        totalSeconds: number;
        dailyAverageSeconds: number;
      }>;
    };
    expect(statsPayload.entries.map((entry) => entry.username)).toEqual(["amy", "mo", "ben"]);
    const amyEntry = statsPayload.entries.find((entry) => entry.username === "amy");
    expect(amyEntry?.totalSeconds).toBe(
      weeklyStatsByKey.get("key-amy")!.totalSeconds + otherOffset
    );
    expect(amyEntry?.dailyAverageSeconds).toBe(
      weeklyStatsByKey.get("key-amy")!.dailyAverageSeconds + dailyAverageOffset
    );
  });

  it("rejects unknown friends", async () => {
    const { app } = createServer({
      port: 0,
      repository: createMemoryRepository(),
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "ghost" })
      })
    );

    expect(response.status).toBe(404);
  });

  it("respects friends-only visibility", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId: moSession } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    const { sessionId: amySession } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "amy",
            apiKey: "key"
          })
        })
      )
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/visibility", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": amySession ?? ""
        },
        body: JSON.stringify({ visibility: "friends" })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": moSession ?? ""
        },
        body: JSON.stringify({ username: "amy" })
      })
    );

    const dateKey = new Date().toISOString().slice(0, 10);
    const now = new Date();
    await store.upsertDailyStat({
      userId: 1,
      dateKey,
      totalSeconds: 3600,
      status: "ok",
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: 2,
      dateKey,
      totalSeconds: 1800,
      status: "ok",
      fetchedAt: now
    });

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today", {
        headers: { "x-wakawars-session": moSession ?? "" }
      })
    );
    const payload = (await response.json()) as {
      entries: Array<{ username: string; status: string }>;
    };
    const amyEntry = payload.entries.find((entry) => entry.username === "amy");
    expect(amyEntry?.status).toBe("private");

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": amySession ?? ""
        },
        body: JSON.stringify({ username: "mo" })
      })
    );

    const responseAfterMutual = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today", {
        headers: { "x-wakawars-session": moSession ?? "" }
      })
    );
    const payloadAfterMutual = (await responseAfterMutual.json()) as {
      entries: Array<{ username: string; status: string }>;
    };
    const amyEntryAfterMutual = payloadAfterMutual.entries.find(
      (entry) => entry.username === "amy"
    );
    expect(amyEntryAfterMutual?.status).toBe("ok");
  });

  it("marks private users when unauthorized", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          wakawarsUsername: "private",
          apiKey: "key"
        })
      })
    );

    await app.handle(
      new Request("http://localhost/wakawars/v0/friends", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wakawars-session": sessionId ?? ""
        },
        body: JSON.stringify({ username: "private" })
      })
    );

    const dateKey = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const mo = await store.getUserByUsername("mo");
    const privateUser = await store.getUserByUsername("private");
    await store.upsertDailyStat({
      userId: mo!.id,
      dateKey,
      totalSeconds: 1200,
      status: "ok",
      error: null,
      fetchedAt: now
    });
    await store.upsertDailyStat({
      userId: privateUser!.id,
      dateKey,
      totalSeconds: 0,
      status: "private",
      error: "User data is private or unauthorized",
      fetchedAt: now
    });

    const statsResponse = await app.handle(
      new Request("http://localhost/wakawars/v0/stats/today", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );
    const statsPayload = (await statsResponse.json()) as {
      entries: Array<{ username: string; status: string }>;
    };

    const privateEntry = statsPayload.entries.find((entry) => entry.username === "private");
    expect(privateEntry?.status).toBe("private");
  });

  it("returns aggregated achievements with repeat counts", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    const mo = await store.getUserByUsername("mo");
    const baseDate = new Date("2026-02-01T12:00:00.000Z");
    await Promise.all([
      store.grantAchievement({
        userId: mo!.id,
        achievementId: "merge-mountain-12h",
        contextKind: "daily",
        contextKey: "2026-02-01",
        awardedAt: baseDate
      }),
      store.grantAchievement({
        userId: mo!.id,
        achievementId: "merge-mountain-12h",
        contextKind: "daily",
        contextKey: "2026-02-02",
        awardedAt: new Date("2026-02-02T12:00:00.000Z")
      }),
      store.grantAchievement({
        userId: mo!.id,
        achievementId: "merge-mountain-12h",
        contextKind: "daily",
        contextKey: "2026-02-03",
        awardedAt: new Date("2026-02-03T12:00:00.000Z")
      }),
      store.grantAchievement({
        userId: mo!.id,
        achievementId: "merge-mountain-12h",
        contextKind: "daily",
        contextKey: "2026-02-04",
        awardedAt: new Date("2026-02-04T12:00:00.000Z")
      }),
      store.grantAchievement({
        userId: mo!.id,
        achievementId: "streak-forge-8h",
        contextKind: "daily",
        contextKey: "2026-02-04",
        awardedAt: new Date("2026-02-04T12:00:00.000Z")
      })
    ]);

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/achievements/mo", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );

    const payload = (await response.json()) as {
      username: string;
      totalUnlocks: number;
      achievements: Array<{ id: string; count: number }>;
    };
    const mergeAchievement = payload.achievements.find(
      (achievement) => achievement.id === "merge-mountain-12h"
    );
    expect(payload.username).toBe("mo");
    expect(payload.totalUnlocks).toBe(5);
    expect(mergeAchievement?.count).toBe(4);
  });

  it("returns full achievement catalog with locked and unlocked items", async () => {
    const repository = createMemoryRepository();
    const { app, store } = createServer({
      port: 0,
      repository,
      enableStatusSync: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key"
          })
        })
      )
    );

    const mo = await store.getUserByUsername("mo");
    await store.grantAchievement({
      userId: mo!.id,
      achievementId: "streak-forge-8h",
      contextKind: "daily",
      contextKey: "2026-02-10",
      awardedAt: new Date("2026-02-10T12:00:00.000Z")
    });

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/achievements", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );

    const payload = (await response.json()) as {
      totalDefined: number;
      unlockedCount: number;
      achievements: Array<{ id: string; unlocked: boolean; count: number }>;
    };
    const unlocked = payload.achievements.find(
      (achievement) => achievement.id === "streak-forge-8h"
    );
    const locked = payload.achievements.find(
      (achievement) => achievement.id === "legendary-commit-16h"
    );

    expect(payload.totalDefined).toBe(ACHIEVEMENT_DEFINITIONS.length);
    expect(payload.unlockedCount).toBe(1);
    expect(payload.achievements.length).toBe(ACHIEVEMENT_DEFINITIONS.length);
    expect(unlocked?.unlocked).toBe(true);
    expect(unlocked?.count).toBe(1);
    expect(locked?.unlocked).toBe(false);
    expect(locked?.count).toBe(0);
  });

  it("unlocks achievements from daily and weekly sync", async () => {
    const repository = createMemoryRepository();
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);

      if (url.includes("/status_bar/today")) {
        return new Response(
          JSON.stringify({
            data: {
              grand_total: {
                total_seconds: 12 * 60 * 60
              },
              range: {
                date: "2026-02-10",
                timezone: "UTC"
              },
              editors: [
                {
                  name: "VS Code",
                  total_seconds: 12 * 60 * 60
                }
              ]
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      if (url.includes("/stats/")) {
        return new Response(
          JSON.stringify({
            data: {
              total_seconds: 85 * 60 * 60,
              daily_average: Math.round((85 * 60 * 60) / 7),
              range: {
                end: "2026-02-10"
              },
              editors: [
                {
                  name: "VS Code",
                  total_seconds: 85 * 60 * 60
                }
              ],
              languages: [
                { name: "TypeScript", total_seconds: 20 * 60 * 60 },
                { name: "JavaScript", total_seconds: 18 * 60 * 60 },
                { name: "Go", total_seconds: 16 * 60 * 60 },
                { name: "Rust", total_seconds: 14 * 60 * 60 },
                { name: "SQL", total_seconds: 17 * 60 * 60 }
              ]
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    };

    const { app, store, statusSync, weeklyCache } = createServer({
      port: 0,
      repository,
      fetcher,
      enableStatusSync: false,
      enableWeeklyCache: false
    });

    const { sessionId } = await getSessionId(
      await app.handle(
        new Request("http://localhost/wakawars/v0/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wakawarsUsername: "mo",
            apiKey: "key-mo"
          })
        })
      )
    );

    const mo = await store.getUserByUsername("mo");
    await statusSync.syncUser({
      id: mo!.id,
      apiKey: mo!.apiKey,
      wakatimeTimezone: mo!.wakatimeTimezone
    });
    await weeklyCache.syncUser({
      id: mo!.id,
      apiKey: mo!.apiKey
    });

    const response = await app.handle(
      new Request("http://localhost/wakawars/v0/achievements/mo", {
        headers: { "x-wakawars-session": sessionId ?? "" }
      })
    );

    const payload = (await response.json()) as {
      achievements: Array<{ id: string }>;
    };
    const achievementIds = payload.achievements.map((achievement) => achievement.id);
    expect(achievementIds).toContain("streak-forge-8h");
    expect(achievementIds).toContain("merge-mountain-12h");
    expect(achievementIds).toContain("solo-day-8h");
    expect(achievementIds).toContain("overclocked-core-10h");
    expect(achievementIds).toContain("green-wall-80h");
    expect(achievementIds).toContain("mono-stack-80h");
    expect(achievementIds).toContain("language-hydra-80h");
    expect(achievementIds).toContain("marathon-pace-8h");
    expect(achievementIds).not.toContain("legendary-commit-16h");
  });
});
