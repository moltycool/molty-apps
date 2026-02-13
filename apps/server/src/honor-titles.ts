import { ACHIEVEMENT_DEFINITIONS } from "./achievements.js";
import type { AchievementGrantSummary } from "./repository.js";

const WORKWEEK_WARRIOR_40H = "workweek-warrior-40h";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const HONOR_TITLE_ACHIEVEMENT_IDS = ACHIEVEMENT_DEFINITIONS.map(
  (achievement) => achievement.id
);

const TITLE_BY_ACHIEVEMENT_ID: Record<string, string> = {
  "quick-boot-4h": "Daybreak Sprinter",
  "focus-reactor-6h": "Focus Reactor",
  "streak-forge-8h": "Green Wall Initiate",
  "overclocked-core-10h": "Overclock Core",
  "merge-mountain-12h": "Merge Mountain Slayer",
  "night-shift-14h": "Night Shift Sentinel",
  "legendary-commit-16h": "Commit Overlord",
  "boss-raid-20h": "Boss Raider",
  "weekend-warrior-8h": "Weekend Warrior",
  "weekend-overdrive-12h": "Weekend Overdrive",
  "solo-day-8h": "Solo Blade",
  "switchblade-day-8h": "Switchblade",
  "mono-language-day-8h": "Mono Tongue",
  "language-juggler-day-8h": "Language Juggler",
  "deep-focus-day-8h": "Deep Focus Diver",
  "workweek-warrior-40h": "Workweek Warrior",
  "ship-it-60h": "Release Captain",
  "green-wall-80h": "Green Wall Commander",
  "graph-overflow-100h": "Graph Breaker",
  "matrix-120h": "Matrix Sovereign",
  "mono-stack-80h": "Solo Stack Hero",
  "mono-stack-100h": "Solo Stack Mythic",
  "polyglot-stack-80h": "Polyglot General",
  "language-hydra-80h": "Language Hydra",
  "language-spectrum-80h": "Spectrum Master",
  "editor-arsenal-80h": "Editor Arsenal",
  "project-monolith-80h": "Monolith Architect",
  "project-nomad-80h": "Project Nomad",
  "seven-sunrise-week": "Seven Sunrises",
  "iron-week-4h": "Iron Week",
  "marathon-pace-8h": "Marathon Coder",
  "ultra-pace-10h": "Turbo Engine"
};

const ACHIEVEMENT_PRIORITY: Record<string, number> = {
  "quick-boot-4h": 1,
  "focus-reactor-6h": 2,
  "streak-forge-8h": 3,
  "overclocked-core-10h": 4,
  "merge-mountain-12h": 5,
  "night-shift-14h": 6,
  "legendary-commit-16h": 8,
  "boss-raid-20h": 10,
  "weekend-warrior-8h": 2,
  "weekend-overdrive-12h": 4,
  "solo-day-8h": 3,
  "switchblade-day-8h": 4,
  "mono-language-day-8h": 4,
  "language-juggler-day-8h": 5,
  "deep-focus-day-8h": 4,
  "workweek-warrior-40h": 5,
  "ship-it-60h": 6,
  "green-wall-80h": 7,
  "graph-overflow-100h": 9,
  "matrix-120h": 10,
  "mono-stack-80h": 7,
  "mono-stack-100h": 9,
  "polyglot-stack-80h": 7,
  "language-hydra-80h": 8,
  "language-spectrum-80h": 9,
  "editor-arsenal-80h": 8,
  "project-monolith-80h": 7,
  "project-nomad-80h": 7,
  "seven-sunrise-week": 4,
  "iron-week-4h": 6,
  "marathon-pace-8h": 7,
  "ultra-pace-10h": 8
};

const getIsoWeekStartMs = (year: number, week: number): number | null => {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) {
    return null;
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const weekOneMondayMs = jan4.getTime() - (jan4Weekday - 1) * 86400000;
  return weekOneMondayMs + (week - 1) * WEEK_MS;
};

const parseIsoWeekFromContextKey = (contextKey: string): number | null => {
  const match = contextKey.match(/(\d{4})-W(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  return getIsoWeekStartMs(year, week);
};

const getLongestConsecutiveWeekStreak = (contextKeys: string[]): number => {
  const weekStarts = Array.from(
    new Set(
      contextKeys
        .map((contextKey) => parseIsoWeekFromContextKey(contextKey))
        .filter((value): value is number => value !== null)
    )
  ).sort((a, b) => a - b);

  let longest = 0;
  let current = 0;
  let previous: number | null = null;

  weekStarts.forEach((weekStart) => {
    current = previous !== null && weekStart - previous === WEEK_MS ? current + 1 : 1;
    previous = weekStart;
    longest = Math.max(longest, current);
  });

  return longest;
};

const getCount = (counts: Map<string, number>, achievementId: string): number =>
  counts.get(achievementId) ?? 0;

const resolveComboHonorTitle = ({
  achievementCounts,
  weeklyFortyContextKeys
}: {
  achievementCounts: Map<string, number>;
  weeklyFortyContextKeys: string[];
}): string | null => {
  const weeklyFortyStreak = getLongestConsecutiveWeekStreak(weeklyFortyContextKeys);
  if (weeklyFortyStreak >= 8) {
    return "Emperor of Weeks";
  }
  if (weeklyFortyStreak >= 4) {
    return "Sultan of Weeks";
  }

  if (getCount(achievementCounts, "matrix-120h") >= 2) {
    return "Matrix Deity";
  }

  if (getCount(achievementCounts, "graph-overflow-100h") >= 2) {
    return "Overflow Breaker";
  }

  if (getCount(achievementCounts, "green-wall-80h") >= 4) {
    return "Eternal Green Wall";
  }

  if (
    getCount(achievementCounts, "language-spectrum-80h") >= 1 &&
    getCount(achievementCounts, "editor-arsenal-80h") >= 1
  ) {
    return "Master of All Trades";
  }

  if (
    getCount(achievementCounts, "mono-stack-100h") >= 1 &&
    getCount(achievementCounts, "project-monolith-80h") >= 1
  ) {
    return "Solo Stack Titan";
  }

  if (
    getCount(achievementCounts, "ultra-pace-10h") >= 2 &&
    getCount(achievementCounts, "iron-week-4h") >= 2
  ) {
    return "Unstoppable Machine";
  }

  return null;
};

const resolveTopAchievementTitle = (
  achievementCounts: Map<string, number>
): string | null => {
  const ranked = Array.from(achievementCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([achievementId, count]) => ({
      achievementId,
      count,
      title: TITLE_BY_ACHIEVEMENT_ID[achievementId] ?? "Achievement Hunter",
      priority: ACHIEVEMENT_PRIORITY[achievementId] ?? 0
    }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.count !== b.count) return b.count - a.count;
      return a.achievementId.localeCompare(b.achievementId);
    });

  return ranked[0]?.title ?? null;
};

const resolveHonorTitle = ({
  achievementCounts,
  weeklyFortyContextKeys
}: {
  achievementCounts: Map<string, number>;
  weeklyFortyContextKeys: string[];
}): string | null => {
  const comboTitle = resolveComboHonorTitle({
    achievementCounts,
    weeklyFortyContextKeys
  });
  if (comboTitle) {
    return comboTitle;
  }

  return resolveTopAchievementTitle(achievementCounts);
};

export const resolveHonorTitlesByUserId = ({
  userIds,
  grants
}: {
  userIds: number[];
  grants: AchievementGrantSummary[];
}): Map<number, string | null> => {
  const countsByUserId = new Map<number, Map<string, number>>();
  const weeklyFortyContextKeysByUserId = new Map<number, string[]>();

  grants.forEach((grant) => {
    const userCounts = countsByUserId.get(grant.userId) ?? new Map<string, number>();
    userCounts.set(grant.achievementId, (userCounts.get(grant.achievementId) ?? 0) + 1);
    countsByUserId.set(grant.userId, userCounts);

    if (
      grant.achievementId === WORKWEEK_WARRIOR_40H &&
      grant.contextKind === "weekly"
    ) {
      const contextKeys = weeklyFortyContextKeysByUserId.get(grant.userId) ?? [];
      contextKeys.push(grant.contextKey);
      weeklyFortyContextKeysByUserId.set(grant.userId, contextKeys);
    }
  });

  return new Map(
    userIds.map((userId) => {
      const achievementCounts = countsByUserId.get(userId) ?? new Map<string, number>();
      const weeklyFortyContextKeys = weeklyFortyContextKeysByUserId.get(userId) ?? [];
      return [
        userId,
        resolveHonorTitle({
          achievementCounts,
          weeklyFortyContextKeys
        })
      ];
    })
  );
};
