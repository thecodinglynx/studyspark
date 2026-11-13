import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const displayName = (person: { name: string | null; username: string }) =>
  person.name?.trim() || person.username;

export default async function GroupPage() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          members: {
            select: { id: true, username: true, name: true },
            orderBy: { username: "asc" },
          },
          subjects: {
            orderBy: { createdAt: "desc" },
            select: {
              role: true,
              subject: {
                select: {
                  id: true,
                  title: true,
                  type: true,
                  ownerId: true,
                  owner: { select: { username: true, name: true } },
                  _count: { select: { cards: true, checklistItems: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const group = me?.group;

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-24 pt-16">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
            Group
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-white">
            {group ? group.name : "You are not in a group"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            {group
              ? "The people you study with. You can see each other here, share subjects, and compare progress."
              : "Groups are set up by an admin. Signing up with an invite code puts you in the group that code belongs to."}
          </p>
        </header>

        {!group ? (
          <Panel className="bg-slate-900/70 p-8 text-center">
            <p className="mx-auto max-w-md text-sm text-slate-300">
              Once you are in a group, the people in it and the subjects they
              share with you will appear here.
            </p>
            <Link
              href="/dashboard"
              className="mt-5 inline-flex rounded-full bg-blue-500 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
            >
              Back to your subjects
            </Link>
          </Panel>
        ) : (
          <>
            <div className="grid gap-8 lg:grid-cols-[1fr,2fr]">
              <Panel className="h-fit bg-slate-900/70 p-6">
                <h2 className="text-lg font-semibold text-white">
                  Members ({group.members.length})
                </h2>
                <ul className="mt-4 flex flex-col gap-2">
                  {group.members.map((member) => (
                    <li
                      key={member.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {displayName(member)}
                        </p>
                        {member.name?.trim() && (
                          <p className="truncate text-xs text-slate-400">
                            @{member.username}
                          </p>
                        )}
                      </div>
                      {member.id === session.user.id && (
                        <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-200">
                          You
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/analytics"
                  className="mt-5 inline-flex text-sm font-medium text-blue-300 transition hover:text-blue-200"
                >
                  See how you compare →
                </Link>
              </Panel>

              <Panel className="bg-slate-900/70 p-6">
                <h2 className="text-lg font-semibold text-white">
                  Shared with the group
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Subjects members have shared with everyone in the group. To
                  share one of yours, open it and use &ldquo;Share with your
                  group&rdquo;.
                </p>
                {group.subjects.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-500">
                    Nothing has been shared yet.
                  </p>
                ) : (
                  <ul className="mt-6 flex flex-col gap-3">
                    {group.subjects.map(({ subject, role }) => (
                      <li
                        key={subject.id}
                        className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-white">
                              {subject.title}
                            </h3>
                            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-slate-200">
                              {subject.type === "FLASHCARDS"
                                ? "Flashcards"
                                : "Checklist"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-400">
                            {subject.type === "FLASHCARDS"
                              ? `${subject._count.cards} cards`
                              : `${subject._count.checklistItems} items`}
                            {" · "}
                            {subject.ownerId === session.user.id
                              ? "Shared by you"
                              : `Shared by ${displayName(subject.owner)}`}
                            {" · "}
                            {role === "EDITOR"
                              ? "Members can edit"
                              : "Members can study"}
                          </p>
                        </div>
                        <Link
                          href={`/subjects/${subject.id}`}
                          className="rounded-full bg-blue-500/15 px-4 py-1.5 text-center text-sm font-medium text-blue-200 transition hover:bg-blue-500/25"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
