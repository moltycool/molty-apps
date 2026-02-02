import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export type SessionStore = {
  create: (userId: number) => Promise<string>;
  verify: (token: string, userId: number) => Promise<boolean>;
  revoke: (token: string) => Promise<void>;
};

export const createMemorySessionStore = (): SessionStore => {
  const sessions = new Map<string, { userId: number; createdAt: number }>();

  const create = async (userId: number) => {
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { userId, createdAt: Date.now() });
    return token;
  };

  const verify = async (token: string, userId: number) => {
    const session = sessions.get(token);
    return Boolean(session && session.userId === userId);
  };

  const revoke = async (token: string) => {
    sessions.delete(token);
  };

  return { create, verify, revoke };
};

export const createPrismaSessionStore = (prisma: PrismaClient): SessionStore => {
  const create = async (userId: number) => {
    const token = crypto.randomBytes(24).toString("hex");
    await prisma.session.create({
      data: {
        token,
        userId
      }
    });
    return token;
  };

  const verify = async (token: string, userId: number) => {
    const session = await prisma.session.findUnique({
      where: { token }
    });

    if (!session || session.userId !== userId) {
      return false;
    }

    await prisma.session.update({
      where: { token },
      data: { lastUsedAt: new Date() }
    });

    return true;
  };

  const revoke = async (token: string) => {
    await prisma.session.deleteMany({
      where: { token }
    });
  };

  return { create, verify, revoke };
};
