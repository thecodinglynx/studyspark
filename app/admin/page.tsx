import { redirect } from "next/navigation";
import { InviteManager } from "@/components/admin/invite-manager";
import { TopNav } from "@/components/top-nav";
import { checkAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    redirect(admin.status === 401 ? "/login" : "/dashboard");
  }

  const [subjects, codes] = await Promise.all([
    prisma.subject.findMany({
      select: {
        id: true,
        title: true,
        type: true,
        owner: { select: { username: true } },
        _count: { select: { cards: true, checklistItems: true } },
      },
      orderBy: [{ title: "asc" }, { createdAt: "desc" }],
    }),
    prisma.inviteCode.findMany({
      select: {
        id: true,
        code: true,
        role: true,
        maxUses: true,
        usedCount: true,
        createdAt: true,
        subjects: { select: { subject: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-24 pt-16">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
            Admin
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-white">
            Invite codes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Pick subjects and generate a code. Anyone who signs up with that
            code gets access to those subjects straight away.
          </p>
        </header>
        <InviteManager
          subjects={subjects.map((subject) => ({
            id: subject.id,
            title: subject.title,
            type: subject.type,
            ownerUsername: subject.owner.username,
            itemCount:
              subject.type === "FLASHCARDS"
                ? subject._count.cards
                : subject._count.checklistItems,
          }))}
          codes={codes.map((code) => ({
            id: code.id,
            code: code.code,
            role: code.role,
            maxUses: code.maxUses,
            usedCount: code.usedCount,
            createdAt: code.createdAt.toISOString(),
            subjectTitles: code.subjects.map((entry) => entry.subject.title),
          }))}
        />
      </section>
    </main>
  );
}
