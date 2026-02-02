import type { PrismaClient } from "@prisma/client";
import type { UserConfig } from "@molty/shared";

export type AuthState = {
  userId: number;
  wakawarsUsername: string;
  passwordHash: string | null;
};

export type ConfigRepository = {
  getConfig: () => Promise<UserConfig>;
  saveConfig: (config: { wakawarsUsername: string; apiKey: string }) => Promise<UserConfig>;
  addFriend: (friend: {
    username: string;
    apiKey?: string | null;
  }) => Promise<UserConfig>;
  removeFriend: (username: string) => Promise<UserConfig>;
  getAuthState: () => Promise<AuthState>;
  setPassword: (passwordHash: string | null) => Promise<UserConfig>;
};

type PrismaUser = {
  id: number;
  wakawarsUsername: string;
  apiKey: string;
  passwordHash: string | null;
  friends: Array<{ username: string; apiKey: string | null }>;
};

const mapUserToConfig = (user: PrismaUser): UserConfig => ({
  wakawarsUsername: user.wakawarsUsername,
  apiKey: user.apiKey,
  passwordHash: user.passwordHash,
  friends: user.friends.map((friend) => ({
    username: friend.username,
    apiKey: friend.apiKey
  }))
});

export const createPrismaRepository = (prisma: PrismaClient): ConfigRepository => {
  const ensureUser = async (): Promise<PrismaUser> => {
    const existing = await prisma.user.findFirst({
      include: {
        friends: true
      }
    });

    if (existing) {
      return existing as PrismaUser;
    }

    const created = await prisma.user.create({
      data: {
        wakawarsUsername: "",
        apiKey: ""
      },
      include: {
        friends: true
      }
    });

    return created as PrismaUser;
  };

  const getConfig = async () => {
    const user = await ensureUser();
    return mapUserToConfig(user);
  };

  const saveConfig = async ({
    wakawarsUsername,
    apiKey
  }: {
    wakawarsUsername: string;
    apiKey: string;
  }) => {
    const user = await ensureUser();

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { wakawarsUsername, apiKey },
      include: { friends: true }
    });

    return mapUserToConfig(updated as PrismaUser);
  };

  const addFriend = async ({
    username,
    apiKey
  }: {
    username: string;
    apiKey?: string | null;
  }) => {
    const user = await ensureUser();

    if (username === user.wakawarsUsername) {
      return mapUserToConfig(user);
    }

    const existing = await prisma.friend.findUnique({
      where: {
        userId_username: {
          userId: user.id,
          username
        }
      }
    });

    if (!existing) {
      await prisma.friend.create({
        data: {
          username,
          apiKey: apiKey || null,
          userId: user.id
        }
      });
    } else {
      await prisma.friend.update({
        where: {
          userId_username: {
            userId: user.id,
            username
          }
        },
        data: {
          apiKey: apiKey ?? existing.apiKey
        }
      });
    }

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { friends: true }
    });

    return mapUserToConfig(updated as PrismaUser);
  };

  const removeFriend = async (username: string) => {
    const user = await ensureUser();

    await prisma.friend.deleteMany({
      where: {
        userId: user.id,
        username
      }
    });

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      include: { friends: true }
    });

    return mapUserToConfig(updated as PrismaUser);
  };

  const getAuthState = async (): Promise<AuthState> => {
    const user = await ensureUser();
    return {
      userId: user.id,
      wakawarsUsername: user.wakawarsUsername,
      passwordHash: user.passwordHash
    };
  };

  const setPassword = async (passwordHash: string | null) => {
    const user = await ensureUser();

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
      include: { friends: true }
    });

    return mapUserToConfig(updated as PrismaUser);
  };

  return {
    getConfig,
    saveConfig,
    addFriend,
    removeFriend,
    getAuthState,
    setPassword
  };
};
