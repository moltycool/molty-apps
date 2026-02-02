import { PrismaClient } from "@prisma/client";

export const createPrismaClient = (databaseUrl?: string) => {
  if (databaseUrl) {
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
  }

  return new PrismaClient();
};
