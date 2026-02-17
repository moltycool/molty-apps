import { describe, expect, it } from "vitest";
import {
  computeLeaderboard,
  formatDelta,
  formatDuration,
  sliceLeaderboard,
} from "../src/index.js";
import type { DailyStat } from "../src/types.js";

describe("formatDuration", () => {
  it("formats minutes and hours consistently", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(59)).toBe("1m");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3660)).toBe("1h 1m");
  });
});

describe("formatDelta", () => {
  it("uses zero delta under threshold", () => {
    expect(formatDelta(0)).toBe("0m");
    expect(formatDelta(299)).toBe("0m");
  });

  it("shows sign and magnitude when above threshold", () => {
    expect(formatDelta(301)).toBe("+5m");
    expect(formatDelta(-301)).toBe("-5m");
  });
});

describe("computeLeaderboard", () => {
  it("orders by status then time", () => {
    const stats: DailyStat[] = [
      { username: "ben", totalSeconds: 1000, status: "ok" },
      { username: "amy", totalSeconds: 2000, status: "ok" },
      { username: "dena", totalSeconds: 0, status: "private" },
      { username: "mo", totalSeconds: 1500, status: "ok" }
    ];

    const leaderboard = computeLeaderboard(stats, "mo");
    expect(leaderboard.map((entry) => entry.username)).toEqual(["amy", "mo", "ben", "dena"]);
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[3].rank).toBeNull();
  });

  it("keeps equal totals at the same rank", () => {
    const stats: DailyStat[] = [
      { username: "amy", totalSeconds: 1200, status: "ok" },
      { username: "ben", totalSeconds: 1200, status: "ok" },
      { username: "mo", totalSeconds: 900, status: "ok" }
    ];

    const leaderboard = computeLeaderboard(stats, "mo");
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(1);
    expect(leaderboard[2].rank).toBe(3);
  });

  it("assigns unique ranks when all ranked users are at zero", () => {
    const stats: DailyStat[] = [
      { username: "zoe", totalSeconds: 0, status: "ok" },
      { username: "amy", totalSeconds: 0, status: "ok" },
      { username: "mo", totalSeconds: 0, status: "ok" }
    ];

    const leaderboard = computeLeaderboard(stats, "mo");
    expect(leaderboard.map((entry) => entry.username)).toEqual(["amy", "mo", "zoe"]);
    expect(leaderboard[0].rank).toBe(1);
    expect(leaderboard[1].rank).toBe(2);
    expect(leaderboard[2].rank).toBe(3);
  });
});

describe("sliceLeaderboard", () => {
  it("splits podium, near-me, and rest without duplicates", () => {
    const stats: DailyStat[] = [
      { username: "amy", totalSeconds: 4000, status: "ok" },
      { username: "ben", totalSeconds: 3500, status: "ok" },
      { username: "cora", totalSeconds: 3000, status: "ok" },
      { username: "mo", totalSeconds: 2500, status: "ok" },
      { username: "dena", totalSeconds: 2400, status: "ok" },
      { username: "eli", totalSeconds: 0, status: "private" },
    ];

    const slices = sliceLeaderboard(stats, "mo", { podiumCount: 3, aroundCount: 1 });
    expect(slices.podium.map((entry) => entry.username)).toEqual(["amy", "ben", "cora"]);
    expect(slices.nearMe.map((entry) => entry.username)).toEqual(["cora", "mo", "dena"]);
    expect(slices.rest.map((entry) => entry.username)).toEqual(["eli"]);
  });

  it("returns empty near-me when self is missing", () => {
    const stats: DailyStat[] = [
      { username: "amy", totalSeconds: 1200, status: "ok" },
      { username: "ben", totalSeconds: 900, status: "ok" },
    ];

    const slices = sliceLeaderboard(stats, "zoe");
    expect(slices.nearMe).toEqual([]);
    expect(slices.podium.map((entry) => entry.username)).toEqual(["amy", "ben"]);
  });

  it("handles small lists with fewer than podium entries", () => {
    const stats: DailyStat[] = [
      { username: "amy", totalSeconds: 1200, status: "ok" },
    ];

    const slices = sliceLeaderboard(stats, "amy");
    expect(slices.podium.map((entry) => entry.username)).toEqual(["amy"]);
    expect(slices.nearMe.map((entry) => entry.username)).toEqual(["amy"]);
    expect(slices.rest).toEqual([]);
  });
});
