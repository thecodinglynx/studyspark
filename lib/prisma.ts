import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

const isNeon = connectionString?.includes(".neon.tech");

let prismaClient: PrismaClient;

if (isNeon && connectionString) {
  neonConfig.webSocketConstructor = ws;
  const adapter = new PrismaNeon({ connectionString });
  prismaClient = global.prisma ?? new PrismaClient({ adapter } as any);
} else {
  prismaClient = global.prisma ?? new PrismaClient();
}

export const prisma = prismaClient;

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
