// Grants or removes the admin role for an existing account.
//
//   npm run admin:grant -- <username>
//   npm run admin:revoke -- <username>
//
// It talks to whichever database DATABASE_URL points at (loaded from .env), so
// to promote an account on the live site, run it with the production
// DATABASE_URL.
import { PrismaClient } from "@prisma/client";

const [action, username] = process.argv.slice(2);

if (!["grant", "revoke"].includes(action) || !username) {
  console.error("Usage: node scripts/set-admin.mjs <grant|revoke> <username>");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`No account with the username "${username}".`);
    process.exitCode = 1;
  } else {
    const role = action === "grant" ? "ADMIN" : "USER";
    await prisma.user.update({ where: { id: user.id }, data: { role } });
    const host = new URL(process.env.DATABASE_URL).host;
    console.log(`${username} is now ${role} (database: ${host}).`);
    console.log("Log out and back in to see the Admin link.");
  }
} finally {
  await prisma.$disconnect();
}
