export type Friend = {
  username: string; // WakaWars username (assumed to match WakaTime username)
  apiKey?: string | null;
};

export type FriendPublic = {
  username: string;
};

export type UserConfig = {
  wakawarsUsername: string;
  apiKey: string;
  friends: Friend[];
  passwordHash?: string | null;
};

export type PublicConfig = {
  wakawarsUsername: string;
  friends: FriendPublic[];
  hasApiKey: boolean;
  passwordSet: boolean;
};

export type DailyStatStatus = "ok" | "private" | "not_found" | "error";

export type DailyStat = {
  username: string; // WakaWars username
  totalSeconds: number;
  status: DailyStatStatus;
  error?: string | null;
};

export type LeaderboardEntry = DailyStat & {
  rank: number | null;
  deltaSeconds: number;
};

export type LeaderboardResponse = {
  date: string;
  updatedAt: string;
  entries: LeaderboardEntry[];
};
