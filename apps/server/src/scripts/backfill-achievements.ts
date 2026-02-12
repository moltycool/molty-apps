import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import type { DailyStatStatus } from "@molty/shared";
import {
  awardDailyAchievements,
  awardWeeklyAchievements,
} from "../achievements.js";
import { createPrismaRepository } from "../repository.js";
import { DEFAULT_WAKATIME_WEEKLY_RANGE } from "../wakatime-weekly-cache.js";

type DailyHistoryRow = {
  user_id: number;
  date_key: string;
  total_seconds: number;
  status: string;
  fetched_at: Date;
  payload: unknown | null;
};

type WeeklyHistoryRow = {
  user_id: number;
  range_key: string;
  total_seconds: number;
  daily_average_seconds: number;
  status: string;
  fetched_at: Date;
};

type ScalarCountRow = { count: bigint | number };

type WeekDayRecord = {
  dateKey: string;
  totalSeconds: number;
  fetchedAt: Date;
  payload?: unknown;
};

type WeeklyBucket = {
  userId: number;
  isoWeekKey: string;
  rangeKey: string;
  fetchedAt: Date;
  days: WeekDayRecord[];
};

const asObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parseDateKey = (dateKey: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const parsed = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getIsoWeekStart = (value: Date): Date => {
  const normalized = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() - day + 1);
  return normalized;
};

const toIsoWeekKey = (date: Date): string => {
  const normalized = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((normalized.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );

  return `${normalized.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const toDailyStatus = (value: string): DailyStatStatus => {
  if (
    value === "ok" ||
    value === "private" ||
    value === "not_found" ||
    value === "error"
  ) {
    return value;
  }

  return "error";
};

const extractNamedEntryValues = (
  payload: unknown,
  key: string
): Array<{ name: string; seconds: number }> => {
  const data = asObject(asObject(payload)?.data);
  const entries = Array.isArray(data?.[key]) ? data?.[key] : [];

  const values = entries
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => {
      const seconds =
        asNumber(entry.total_seconds) ??
        asNumber(entry.seconds) ??
        asNumber(entry.total) ??
        0;
      const name =
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : "unknown";
      return { name, seconds };
    })
    .filter((entry) => entry.seconds > 0);

  const deduped = new Map<string, number>();
  values.forEach((entry) => {
    deduped.set(entry.name, (deduped.get(entry.name) ?? 0) + entry.seconds);
  });

  return Array.from(deduped.entries()).map(([name, seconds]) => ({
    name,
    seconds,
  }));
};

const mergeNamedSeconds = (
  target: Map<string, number>,
  values: Array<{ name: string; seconds: number }>
) => {
  values.forEach((entry) => {
    target.set(entry.name, (target.get(entry.name) ?? 0) + entry.seconds);
  });
};

const toNamedPayloadEntries = (values: Map<string, number>) =>
  Array.from(values.entries())
    .map(([name, seconds]) => ({
      name,
      total_seconds: seconds,
    }))
    .sort((a, b) => b.total_seconds - a.total_seconds);

const buildWeeklyPayload = ({
  weekStart,
  dayByDate,
}: {
  weekStart: Date;
  dayByDate: Map<string, WeekDayRecord>;
}) => {
  const editors = new Map<string, number>();
  const languages = new Map<string, number>();
  const projects = new Map<string, number>();

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addUtcDays(weekStart, index);
    const dateKey = toDateKey(date);
    const day = dayByDate.get(dateKey);

    if (day?.payload) {
      mergeNamedSeconds(
        editors,
        extractNamedEntryValues(day.payload, "editors")
      );
      mergeNamedSeconds(
        languages,
        extractNamedEntryValues(day.payload, "languages")
      );
      mergeNamedSeconds(
        projects,
        extractNamedEntryValues(day.payload, "projects")
      );
    }

    return {
      date: dateKey,
      grand_total: {
        total_seconds: day?.totalSeconds ?? 0,
      },
    };
  });

  const weekEnd = addUtcDays(weekStart, 6);

  return {
    data: {
      range: {
        start: toDateKey(weekStart),
        end: toDateKey(weekEnd),
      },
      editors: toNamedPayloadEntries(editors),
      languages: toNamedPayloadEntries(languages),
      projects: toNamedPayloadEntries(projects),
      days,
    },
  };
};

const createWeeklyBucketsFromDailyHistory = ({
  dailyRows,
  weeklyRangeKey,
}: {
  dailyRows: DailyHistoryRow[];
  weeklyRangeKey: string;
}) => {
  const buckets = new Map<string, WeeklyBucket>();

  dailyRows.forEach((row) => {
    if (toDailyStatus(row.status) !== "ok") {
      return;
    }

    const dayDate = parseDateKey(row.date_key);
    if (!dayDate) {
      return;
    }

    const isoWeekKey = toIsoWeekKey(dayDate);
    const key = `${row.user_id}:${weeklyRangeKey}:${isoWeekKey}`;
    const existing = buckets.get(key);
    const day: WeekDayRecord = {
      dateKey: row.date_key,
      totalSeconds: row.total_seconds,
      fetchedAt: row.fetched_at,
      payload: row.payload ?? undefined,
    };

    if (!existing) {
      buckets.set(key, {
        userId: row.user_id,
        isoWeekKey,
        rangeKey: weeklyRangeKey,
        fetchedAt: row.fetched_at,
        days: [day],
      });
      return;
    }

    existing.days.push(day);
    if (row.fetched_at.getTime() > existing.fetchedAt.getTime()) {
      existing.fetchedAt = row.fetched_at;
    }
  });

  return Array.from(buckets.values());
};

const loadDailyHistory = async (
  prisma: PrismaClient
): Promise<DailyHistoryRow[]> => {
  return prisma.$queryRaw<DailyHistoryRow[]>(Prisma.sql`
    SELECT
      s.user_id,
      s.date_key,
      s.total_seconds,
      s.status,
      s.fetched_at,
      NULL::jsonb AS payload
    FROM ww_daily_stat s
    ORDER BY s.user_id ASC, s.date_key ASC
  `);
};

const loadWeeklyHistory = async (
  prisma: PrismaClient
): Promise<WeeklyHistoryRow[]> => {
  return prisma.$queryRaw<WeeklyHistoryRow[]>(Prisma.sql`
    SELECT
      user_id,
      range_key,
      total_seconds,
      daily_average_seconds,
      status,
      fetched_at
    FROM ww_weekly_stat
    ORDER BY user_id ASC, fetched_at ASC
  `);
};

const toSafeNumber = (value: bigint | number) =>
  typeof value === "bigint" ? Number(value) : value;

const PROGRESS_EVERY = Math.max(
  1,
  Number(process.env.BACKFILL_PROGRESS_EVERY ?? "500")
);
const DB_RETRY_ATTEMPTS = Math.max(
  1,
  Number(process.env.BACKFILL_DB_RETRY_ATTEMPTS ?? "6")
);
const DB_RETRY_BASE_DELAY_MS = Math.max(
  100,
  Number(process.env.BACKFILL_DB_RETRY_BASE_DELAY_MS ?? "500")
);
const DB_RETRY_MAX_DELAY_MS = Math.max(
  DB_RETRY_BASE_DELAY_MS,
  Number(process.env.BACKFILL_DB_RETRY_MAX_DELAY_MS ?? "5000")
);
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1002", "P1017"]);

const shouldLogProgress = (processed: number, total: number) =>
  processed === 1 ||
  processed === total ||
  processed % PROGRESS_EVERY === 0;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isRetryableDatabaseError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_PRISMA_CODES.has(error.code);
  }

  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("connection terminated") ||
    message.includes("connection reset")
  );
};

const reconnectPrisma = async (prisma: PrismaClient) => {
  try {
    await prisma.$disconnect();
  } catch {}

  await prisma.$connect();
};

const withDbRetry = async <T>({
  prisma,
  label,
  run,
}: {
  prisma: PrismaClient;
  label: string;
  run: () => Promise<T>;
}) => {
  let attempt = 1;

  while (true) {
    try {
      return await run();
    } catch (error) {
      if (!isRetryableDatabaseError(error) || attempt >= DB_RETRY_ATTEMPTS) {
        throw error;
      }

      const delayMs = Math.min(
        DB_RETRY_MAX_DELAY_MS,
        DB_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)
      );

      // eslint-disable-next-line no-console
      console.warn(
        `[backfill] ${label} failed on attempt ${attempt}/${DB_RETRY_ATTEMPTS}: ${toErrorMessage(error)}`
      );
      // eslint-disable-next-line no-console
      console.warn(
        `[backfill] retrying in ${delayMs}ms (P1001/P1002 resilient mode)`
      );

      try {
        await reconnectPrisma(prisma);
        // eslint-disable-next-line no-console
        console.log("[backfill] prisma reconnect succeeded");
      } catch (reconnectError) {
        // eslint-disable-next-line no-console
        console.warn(
          `[backfill] prisma reconnect failed: ${toErrorMessage(reconnectError)}`
        );
      }

      await sleep(delayMs);
      attempt += 1;
    }
  }
};

const countAchievements = async (prisma: PrismaClient) => {
  const rows = await prisma.$queryRaw<ScalarCountRow[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS count
    FROM ww_user_achievement
  `);
  return toSafeNumber(rows[0]?.count ?? 0);
};

export const runAchievementsBackfill = async ({
  prisma,
  weeklyRangeKey = process.env.WAKAWARS_WEEKLY_RANGE_KEY ?? DEFAULT_WAKATIME_WEEKLY_RANGE,
}: {
  prisma: PrismaClient;
  weeklyRangeKey?: string;
}) => {
  // eslint-disable-next-line no-console
  console.log("[backfill] started");
  const store = createPrismaRepository(prisma);
  // eslint-disable-next-line no-console
  console.log("[backfill] counting existing achievements");
  const achievementsBefore = await withDbRetry({
    prisma,
    label: "count achievements before",
    run: () => countAchievements(prisma),
  });
  // eslint-disable-next-line no-console
  console.log("[backfill] loading daily history");
  const dailyRows = await withDbRetry({
    prisma,
    label: "load daily history",
    run: () => loadDailyHistory(prisma),
  });
  // eslint-disable-next-line no-console
  console.log("[backfill] loading weekly history");
  const weeklyRows = await withDbRetry({
    prisma,
    label: "load weekly history",
    run: () => loadWeeklyHistory(prisma),
  });
  const dailyRowsOk = dailyRows.filter(
    (row) => toDailyStatus(row.status) === "ok"
  ).length;
  const dailyRowsAbove4h = dailyRows.filter(
    (row) => toDailyStatus(row.status) === "ok" && row.total_seconds >= 4 * 60 * 60
  ).length;
  const dailyRowsWithPayload = dailyRows.filter((row) => Boolean(row.payload)).length;
  const weeklyRowsOk = weeklyRows.filter(
    (row) => toDailyStatus(row.status) === "ok"
  ).length;
  const weeklyRowsAbove40h = weeklyRows.filter(
    (row) => toDailyStatus(row.status) === "ok" && row.total_seconds >= 40 * 60 * 60
  ).length;

  // eslint-disable-next-line no-console
  console.log("[backfill] history loaded", {
    dailyRows: dailyRows.length,
    weeklyRows: weeklyRows.length,
    dailyRowsOk,
    weeklyRowsOk,
  });

  let dailyAwardsProcessed = 0;
  // eslint-disable-next-line no-console
  console.log("[backfill] awarding daily achievements");
  for (let index = 0; index < dailyRows.length; index += 1) {
    const row = dailyRows[index]!;
    await withDbRetry({
      prisma,
      label: `award daily user=${row.user_id} date=${row.date_key}`,
      run: () =>
        awardDailyAchievements({
          store,
          userId: row.user_id,
          dateKey: row.date_key,
          status: toDailyStatus(row.status),
          totalSeconds: row.total_seconds,
          payload: row.payload ?? undefined,
          fetchedAt: row.fetched_at,
        }),
    });
    dailyAwardsProcessed += 1;
    if (shouldLogProgress(index + 1, dailyRows.length)) {
      // eslint-disable-next-line no-console
      console.log(
        `[backfill] daily progress ${index + 1}/${dailyRows.length}`
      );
    }
  }

  const weeklyBuckets = createWeeklyBucketsFromDailyHistory({
    dailyRows,
    weeklyRangeKey,
  });
  // eslint-disable-next-line no-console
  console.log("[backfill] built weekly buckets", {
    weeklyBuckets: weeklyBuckets.length,
    weeklyRangeKey,
  });

  const awardedWeeklyContexts = new Set<string>();
  let weeklyAwardsProcessed = 0;

  // eslint-disable-next-line no-console
  console.log("[backfill] awarding weekly achievements from buckets");
  for (let index = 0; index < weeklyBuckets.length; index += 1) {
    const bucket = weeklyBuckets[index]!;
    const dayByDate = new Map<string, WeekDayRecord>(
      bucket.days.map((day) => [day.dateKey, day])
    );
    const firstDayDate = parseDateKey(bucket.days[0]!.dateKey);
    if (!firstDayDate) {
      continue;
    }

    const weekStart = getIsoWeekStart(firstDayDate);
    const totalSeconds = bucket.days.reduce(
      (sum, day) => sum + day.totalSeconds,
      0
    );
    const payload = buildWeeklyPayload({
      weekStart,
      dayByDate,
    });

    await withDbRetry({
      prisma,
      label: `award weekly bucket user=${bucket.userId} week=${bucket.isoWeekKey}`,
      run: () =>
        awardWeeklyAchievements({
          store,
          userId: bucket.userId,
          rangeKey: bucket.rangeKey,
          status: "ok",
          totalSeconds,
          dailyAverageSeconds: totalSeconds / 7,
          payload,
          fetchedAt: bucket.fetchedAt,
        }),
    });

    awardedWeeklyContexts.add(
      `${bucket.userId}:${bucket.rangeKey}:${bucket.isoWeekKey}`
    );
    weeklyAwardsProcessed += 1;
    if (shouldLogProgress(index + 1, weeklyBuckets.length)) {
      // eslint-disable-next-line no-console
      console.log(
        `[backfill] weekly-bucket progress ${index + 1}/${weeklyBuckets.length}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log("[backfill] awarding weekly fallback from weekly_stat");
  for (let index = 0; index < weeklyRows.length; index += 1) {
    const row = weeklyRows[index]!;
    const parsed = parseDateKey(toDateKey(row.fetched_at));
    if (!parsed) {
      continue;
    }

    const contextKey = `${row.user_id}:${row.range_key}:${toIsoWeekKey(parsed)}`;
    if (awardedWeeklyContexts.has(contextKey)) {
      continue;
    }

    await withDbRetry({
      prisma,
      label: `award weekly fallback user=${row.user_id} range=${row.range_key}`,
      run: () =>
        awardWeeklyAchievements({
          store,
          userId: row.user_id,
          rangeKey: row.range_key,
          status: toDailyStatus(row.status),
          totalSeconds: row.total_seconds,
          dailyAverageSeconds: row.daily_average_seconds,
          fetchedAt: row.fetched_at,
        }),
    });

    weeklyAwardsProcessed += 1;
    if (shouldLogProgress(index + 1, weeklyRows.length)) {
      // eslint-disable-next-line no-console
      console.log(
        `[backfill] weekly-fallback progress ${index + 1}/${weeklyRows.length}`
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log("[backfill] recounting achievements");
  const achievementsAfter = await withDbRetry({
    prisma,
    label: "count achievements after",
    run: () => countAchievements(prisma),
  });
  // eslint-disable-next-line no-console
  console.log("[backfill] counting users");
  const usersCount = await withDbRetry({
    prisma,
    label: "count users",
    run: () => store.countUsers(),
  });

  return {
    usersCount,
    achievementsBefore,
    achievementsAfter,
    achievementsCreated: achievementsAfter - achievementsBefore,
    dailyRows: dailyRows.length,
    dailyRowsOk,
    dailyRowsAbove4h,
    dailyRowsWithPayload,
    weeklyRows: weeklyRows.length,
    weeklyRowsOk,
    weeklyRowsAbove40h,
    weeklyBuckets: weeklyBuckets.length,
    dailyAwardsProcessed,
    weeklyAwardsProcessed,
    weeklyRangeKey,
  };
};

const run = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const summary = await runAchievementsBackfill({ prisma });
    // eslint-disable-next-line no-console
    console.log("[wakawars] achievements backfill complete", summary);
    if (summary.achievementsCreated === 0) {
      // eslint-disable-next-line no-console
      console.warn(
        "[wakawars] no new achievements created (check dailyRowsOk, dailyRowsAbove4h, weeklyRowsAbove40h)"
      );
    }
  } finally {
    await prisma.$disconnect();
  }
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[wakawars] achievements backfill failed", error);
  process.exit(1);
});
