import { redirect } from "next/navigation";
import { GroupManager } from "@/components/admin/group-manager";
import { InviteManager } from "@/components/admin/invite-manager";
import { TopNav } from "@/components/top-nav";
import { checkAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    redirect(admin.status === 401 ? "/login" : "/dashboard");
  }

  const [subjects, codes, groups, ungrouped] = await Promise.all([
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
        groupId: true,
        group: { select: { name: true } },
        subjects: { select: { subject: { select: { id: true, title: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.group.findMany({
      select: {
        id: true,
        name: true,
        members: {
          select: { id: true, username: true, name: true },
          orderBy: { username: "asc" },
        },
        _count: { select: { inviteCodes: true, subjects: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { groupId: null },
      select: { id: true, username: true, name: true },
      orderBy: { username: "asc" },
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
            Invite codes and groups
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Pick subjects and generate a code. Anyone who signs up with that
            code gets access to those subjects straight away and joins the
            code&apos;s group.
          </p>
        </header>
        <InviteManager
          groups={groups.map((group) => ({ id: group.id, name: group.name }))}
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
            groupId: code.groupId,
            groupName: code.group?.name ?? null,
            subjectIds: code.subjects.map((entry) => entry.subject.id),
            subjectTitles: code.subjects.map((entry) => entry.subject.title),
          }))}
        />
        <GroupManager
          groups={groups.map((group) => ({
            id: group.id,
            name: group.name,
            members: group.members,
            codeCount: group._count.inviteCodes,
            subjectCount: group._count.subjects,
          }))}
          ungrouped={ungrouped}
        />
      </section>
    </main>
  );
}
