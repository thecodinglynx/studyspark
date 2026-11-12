import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString =
  process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? null;

if (!connectionString) {
  throw new Error(
    "Database connection string is missing. Set NEON_DATABASE_URL or DATABASE_URL."
  );
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

const isNeon = connectionString?.includes(".neon.tech");

let prismaClient: PrismaClient;

if (isNeon) {
  neonConfig.webSocketConstructor = ws;
  neonConfig.poolQueryViaFetch = true;
  const adapter = new PrismaNeon({ connectionString });
  prismaClient = global.prisma ?? new PrismaClient({ adapter });
} else {
  prismaClient = global.prisma ?? new PrismaClient();
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
