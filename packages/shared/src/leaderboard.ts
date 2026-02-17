import type { DailyStat, DailyStatStatus } from "./types.js";

const statusOrder: Record<DailyStatStatus, number> = {
  ok: 0,
  private: 1,
  not_found: 2,
  error: 3
};

export const sortStats = <T extends DailyStat>(stats: T[]): T[] => {
  return [...stats].sort((a, b) => {
    const statusDelta = statusOrder[a.status] - statusOrder[b.status];
    if (statusDelta !== 0) return statusDelta;

    const timeDelta = b.totalSeconds - a.totalSeconds;
    if (timeDelta !== 0) return timeDelta;

    return a.username.localeCompare(b.username);
  });
};

export const computeLeaderboard = <T extends DailyStat>(
  stats: T[],
  selfUsername: string
): Array<T & { rank: number | null; deltaSeconds: number }> => {
  const ordered = sortStats(stats);
  const ranked = ordered.filter((entry) => entry.status === "ok");
  const shouldBreakAllZeroTies =
    ranked.length > 0 && ranked.every((entry) => entry.totalSeconds === 0);
  const selfEntry = ordered.find((entry) => entry.username === selfUsername);
  const selfSeconds = selfEntry?.totalSeconds ?? 0;

  let currentRank = 0;
  let lastSeconds: number | null = null;

  return ordered.map((entry, index) => {
    const isRanked = entry.status === "ok";
    if (isRanked) {
      if (shouldBreakAllZeroTies) {
        currentRank = index + 1;
        lastSeconds = entry.totalSeconds;
      } else if (lastSeconds === null || entry.totalSeconds !== lastSeconds) {
        currentRank = index + 1;
        lastSeconds = entry.totalSeconds;
      }
    }

    return {
      ...entry,
      rank: isRanked ? currentRank : null,
      deltaSeconds: entry.totalSeconds - selfSeconds
    };
  });
};

type SliceOptions = {
  podiumCount?: number;
  aroundCount?: number;
};

export const sliceLeaderboard = <T extends DailyStat>(
  entries: T[],
  selfUsername: string,
  { podiumCount = 3, aroundCount = 1 }: SliceOptions = {}
): {
  ordered: T[];
  podium: T[];
  nearMe: T[];
  rest: T[];
  selfEntry?: T;
  leaderEntry?: T;
} => {
  const ordered = sortStats(entries);
  const ranked = ordered.filter((entry) => entry.status === "ok");
  const podium = ranked.slice(0, podiumCount);
  const selfIndex = ranked.findIndex((entry) => entry.username === selfUsername);
  const selfEntry = selfIndex >= 0 ? ranked[selfIndex] : undefined;
  const leaderEntry = ranked[0];

  let nearMe: T[] = [];
  if (selfIndex >= 0) {
    const start = Math.max(0, selfIndex - aroundCount);
    const end = Math.min(ranked.length, selfIndex + aroundCount + 1);
    nearMe = ranked.slice(start, end);
  }

  const picked = new Set<string>();
  podium.forEach((entry) => picked.add(entry.username));
  nearMe.forEach((entry) => picked.add(entry.username));
  const rest = ordered.filter((entry) => !picked.has(entry.username));

  return {
    ordered,
    podium,
    nearMe,
    rest,
    selfEntry,
    leaderEntry,
  };
};
