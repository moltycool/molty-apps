import { describe, expect, it } from "vitest";
import { computeLeaderboard, formatDelta, formatDuration } from "../src/index.js";
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
});
