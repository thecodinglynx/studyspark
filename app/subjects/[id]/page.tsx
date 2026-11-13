import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { LocalTime } from "@/components/ui/local-time";
import { SessionSummary } from "@/components/subjects/session-summary";
import { SubjectStudy } from "@/components/subjects/subject-study";
import { ChecklistStudy } from "@/components/subjects/checklist-study";
import { ChecklistEditor } from "@/components/subjects/checklist-editor";
import { CardEditor } from "@/components/subjects/card-editor";
import { DeleteSubject } from "@/components/subjects/delete-subject";
import { ShareWithGroup } from "@/components/subjects/share-with-group";
import { ShareManager } from "@/components/subjects/share-manager";
import { checkAdmin } from "@/lib/admin";

type ShareRole = "VIEWER" | "EDITOR";

interface SubjectShareDetail {
  id: string;
  role: ShareRole;
  userId: string;
  groupId: string | null;
  user: { id: string; username: string; name: string | null };
}

interface SubjectCardDetail {
  id: string;
  prompt: string;
  answer: string;
  performances: Array<{
    correctCount: number;
    incorrectCount: number;
    lastStudiedAt: Date | null;
  }>;
}

interface SubjectSessionSummary {
  id: string;
  correct: number;
  incorrect: number;
  durationMin: number;
  cardCount: number;
  studiedAt: Date;
}

interface ChecklistItemDetail {
  id: string;
  title: string;
  description: string | null;
  entries: Array<{ id: string; practicedAt: Date }>;
}

interface ChecklistEntryDetail {
  id: string;
  practicedAt: Date;
  item: { id: string; title: string };
}

interface SubjectDetail {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  studyGoal: number;
  type: "FLASHCARDS" | "CHECKLIST";
  owner: { id: string; username: string; name: string | null };
  cards: SubjectCardDetail[];
  checklistItems: ChecklistItemDetail[];
  checklistEntries: ChecklistEntryDetail[];
  shares: SubjectShareDetail[];
  groupShares: Array<{ groupId: string; role: ShareRole }>;
  sessions: SubjectSessionSummary[];
}

interface SubjectPageProps {
  params: Promise<{ id: string }>;
}

export default async function SubjectPage(props: SubjectPageProps) {
  const params = await props.params;
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Who else has access to a subject is for admins only. Regular users,
  // including owners, are not shown (or sent) the other users' names.
  const isAdmin = (await checkAdmin()).ok;

  // Admins can share with any group, so they are offered all of them.
  const allGroups = isAdmin
    ? await prisma.group.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  // The group the viewer belongs to, if any, for sharing their own subjects.
  const viewerGroup = (
    await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { group: { select: { id: true, name: true } } },
    })
  )?.group;

  const includeConfig = {
    cards: {
      orderBy: { createdAt: "asc" },
      include: {
        performances: {
          where: { userId: session.user.id },
          select: {
            correctCount: true,
            incorrectCount: true,
            lastStudiedAt: true,
          },
        },
      },
    },
    checklistItems: {
      orderBy: { position: "asc" },
      include: {
        entries: {
          where: { userId: session.user.id },
          orderBy: { practicedAt: "desc" },
          take: 1,
        },
      },
    },
    owner: { select: { id: true, username: true, name: true } },
    shares: {
      include: { user: { select: { id: true, username: true, name: true } } },
      orderBy: { createdAt: "asc" },
    },
    groupShares: { select: { groupId: true, role: true } },
    sessions: {
      where: { userId: session.user.id },
      orderBy: { studiedAt: "desc" },
      take: 50,
    },
    checklistEntries: {
      where: { userId: session.user.id },
      orderBy: { practicedAt: "desc" },
      take: 20,
      include: {
        item: { select: { id: true, title: true } },
      },
    },
  } satisfies Prisma.SubjectInclude;

  const subject: SubjectDetail | null = await prisma.subject.findUnique({
    where: { id: params.id },
    include: includeConfig,
  });

  if (!subject) {
    notFound();
  }

  const isParticipant =
    subject.ownerId === session.user.id ||
    subject.shares.some(
      (share: SubjectShareDetail) => share.userId === session.user.id
    );

  const viewerShare = subject.shares.find(
    (share: SubjectShareDetail) => share.userId === session.user.id
  );

  const canEditCards =
    subject.ownerId === session.user.id || viewerShare?.role === "EDITOR";

  const studyCards =
    subject.type === "FLASHCARDS"
      ? subject.cards.map((card) => ({
          id: card.id,
          prompt: card.prompt,
          answer: card.answer,
          stats: card.performances[0]
            ? {
                correctCount: card.performances[0].correctCount,
                incorrectCount: card.performances[0].incorrectCount,
                lastStudiedAt: card.performances[0].lastStudiedAt
                  ? card.performances[0].lastStudiedAt.toISOString()
                  : null,
              }
            : undefined,
        }))
      : [];

  const editorCards = studyCards.map((card) => ({
    id: card.id,
    prompt: card.prompt,
    answer: card.answer,
  }));

  const checklistItems =
    subject.type === "CHECKLIST"
      ? subject.checklistItems.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
          lastPracticedAt: item.entries[0]?.practicedAt.toISOString() ?? null,
        }))
      : [];

  const recentChecklistEntries =
    subject.type === "CHECKLIST"
      ? subject.checklistEntries.map((entry) => ({
          id: entry.id,
          itemTitle: entry.item.title,
          practicedAt: entry.practicedAt.toISOString(),
        }))
      : [];

  if (!isParticipant) {
    redirect("/dashboard");
  }

  const flashcardTotals =
    subject.type === "FLASHCARDS"
      ? subject.sessions.reduce<{
          correct: number;
          incorrect: number;
          durationMin: number;
        }>(
          (
            acc: { correct: number; incorrect: number; durationMin: number },
            curr: { correct: number; incorrect: number; durationMin: number }
          ) => {
            acc.correct += curr.correct;
            acc.incorrect += curr.incorrect;
            acc.durationMin += curr.durationMin;
            return acc;
          },
          { correct: 0, incorrect: 0, durationMin: 0 }
        )
      : null;

  const totalAttempts = flashcardTotals
    ? flashcardTotals.correct + flashcardTotals.incorrect
    : 0;
  const accuracy =
    flashcardTotals && totalAttempts > 0
      ? Math.round((flashcardTotals.correct / totalAttempts) * 100)
      : 0;

  // Counted separately: recentChecklistEntries only holds the latest 20.
  const totalPractices =
    subject.type === "CHECKLIST"
      ? await prisma.checklistEntry.count({
          where: { subjectId: subject.id, userId: session.user.id },
        })
      : 0;

  const checklistStats =
    subject.type === "CHECKLIST"
      ? {
          itemCount: checklistItems.length,
          totalPractices,
          lastPracticedAt: recentChecklistEntries[0]?.practicedAt ?? null,
        }
      : null;

  const isOwner = subject.ownerId === session.user.id;

  // Who this subject can be shared with: an admin's choice of any group, or
  // just the viewer's own group. The viewer's own group is listed first.
  const shareTargets = (
    isAdmin ? allGroups : viewerGroup ? [viewerGroup] : []
  )
    .map((group) => ({
      id: group.id,
      name: group.name,
      currentRole:
        subject.groupShares.find((entry) => entry.groupId === group.id)?.role ??
        null,
    }))
    .sort(
      (a, b) =>
        Number(b.id === viewerGroup?.id) - Number(a.id === viewerGroup?.id)
    );

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pb-24 pt-12">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              ← Back to dashboard
            </Link>
            <h1 className="mt-3 text-4xl font-semibold text-white">
              {subject.title}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Owned by{" "}
              {subject.ownerId === session.user.id
                ? "you"
                : subject.owner.username}
            </p>
            {subject.description && (
              <p className="mt-4 max-w-2xl text-base text-slate-200/90">
                {subject.description}
              </p>
            )}
          </div>
          <Panel className="w-full max-w-xs bg-slate-900/70 p-6 text-left md:max-w-sm md:text-right">
            {subject.type === "FLASHCARDS" && flashcardTotals && (
              <>
                <p className="text-3xl font-semibold text-white">
                  {subject.cards.length}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Cards
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-400">
                  <div className="text-center md:text-right">
                    <p className="text-lg font-semibold text-emerald-300">
                      {flashcardTotals.correct}
                    </p>
                    <p>Correct</p>
                  </div>
                  <div className="text-center md:text-right">
                    <p className="text-lg font-semibold text-rose-300">
                      {flashcardTotals.incorrect}
                    </p>
                    <p>Incorrect</p>
                  </div>
                  <div className="text-center md:text-right">
                    <p className="text-lg font-semibold text-blue-300">
                      {accuracy}%
                    </p>
                    <p>Accuracy</p>
                  </div>
                </div>
              </>
            )}
            {subject.type === "CHECKLIST" && checklistStats && (
              <>
                <p className="text-3xl font-semibold text-white">
                  {checklistStats.itemCount}
                </p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Items
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-xs text-slate-400">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-emerald-300">
                      {checklistStats.totalPractices}
                    </p>
                    <p>Total practices</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-300">
                      {checklistStats.lastPracticedAt ? (
                        <LocalTime
                          value={checklistStats.lastPracticedAt}
                          variant="date"
                        />
                      ) : (
                        "Not practiced yet"
                      )}
                    </p>
                    <p>Last practiced</p>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>

        {isOwner && (
          <Panel className="bg-slate-900/70 p-6">
            {shareTargets.length > 0 ? (
              <ShareWithGroup
                subjectId={subject.id}
                targets={shareTargets}
                ownGroupId={viewerGroup?.id ?? null}
              />
            ) : (
              <NoGroupToShareWith isAdmin={isAdmin} />
            )}
          </Panel>
        )}

        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <Panel className="bg-slate-900/60 p-6">
            {subject.type === "FLASHCARDS" ? (
              <>
                <SubjectStudy
                  subjectId={subject.id}
                  cards={studyCards}
                  studyGoal={subject.studyGoal}
                  canEditCards={canEditCards}
                />
                {canEditCards && (
                  <div className="mt-10 border-t border-white/5 pt-8">
                    <CardEditor
                      subjectId={subject.id}
                      cards={editorCards}
                      canEdit={canEditCards}
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <ChecklistStudy
                  subjectId={subject.id}
                  items={checklistItems}
                  recentEntries={recentChecklistEntries}
                />
                {canEditCards && (
                  <div className="mt-10 border-t border-white/5 pt-8">
                    <ChecklistEditor
                      subjectId={subject.id}
                      items={checklistItems.map(
                        ({ id, title, description }) => ({
                          id,
                          title,
                          description,
                        })
                      )}
                      canEdit={canEditCards}
                    />
                  </div>
                )}
              </>
            )}
            {subject.ownerId === session.user.id && (
              <div className="mt-10 border-t border-white/5 pt-8">
                <DeleteSubject subjectId={subject.id} title={subject.title} />
              </div>
            )}
          </Panel>
          <Panel className="h-fit bg-slate-900/70 p-6">
            {isAdmin && (
              <ShareManager
                subjectId={subject.id}
                isOwner={subject.ownerId === session.user.id}
                shares={subject.shares.map((share) => ({
                  id: share.id,
                  role: share.role,
                  username: share.user.username,
                  name: share.user.name ?? null,
                  viaGroup: share.groupId !== null,
                }))}
              />
            )}
            {subject.type === "FLASHCARDS" ? (
              <div className={isAdmin ? "mt-8" : ""}>
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Recent sessions
                </h2>
                <div className="mt-3 space-y-3 text-xs text-slate-400">
                  {subject.sessions.length === 0 && (
                    <p>No sessions yet. Start your first study run!</p>
                  )}
                  {subject.sessions.map((sessionItem) => {
                    const cardsUsed =
                      sessionItem.cardCount && sessionItem.cardCount > 0
                        ? sessionItem.cardCount
                        : sessionItem.correct + sessionItem.incorrect;
                    const totalCards =
                      subject.cards.length > 0
                        ? subject.cards.length
                        : Math.max(cardsUsed, 0);

                    return (
                      <div
                        key={sessionItem.id}
                        className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-xs text-slate-300"
                      >
                        <SessionSummary
                          studiedAt={sessionItem.studiedAt.toISOString()}
                          cardsUsed={cardsUsed}
                          totalCards={totalCards}
                          correct={sessionItem.correct}
                          incorrect={sessionItem.incorrect}
                          durationMin={sessionItem.durationMin}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className={isAdmin ? "mt-8" : ""}>
                <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                  Recent practice
                </h2>
                <div className="mt-3 space-y-3 text-xs text-slate-400">
                  {recentChecklistEntries.length === 0 && (
                    <p>
                      No practice logged yet. Select items and log them to track
                      progress.
                    </p>
                  )}
                  {recentChecklistEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/5 px-4 py-3"
                    >
                      <span className="text-xs font-medium text-slate-200">
                        {entry.itemTitle}
                      </span>
                      <LocalTime
                        value={entry.practicedAt}
                        className="text-slate-400"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </section>
    </main>
  );
}

/** Shown to an owner who has no group to share with, so the option is not simply missing. */
function NoGroupToShareWith({ isAdmin }: { isAdmin: boolean }) {
  return (
    <section aria-labelledby="share-group-heading">
      <h3 id="share-group-heading" className="text-lg font-semibold text-white">
        Share with a group
      </h3>
      <p className="mt-2 text-sm text-slate-400">
        {isAdmin ? (
          <>
            There are no groups yet. Create one in the Groups section of the{" "}
            <Link href="/admin" className="text-blue-300 hover:text-blue-200">
              Admin page
            </Link>
            , then you can share this subject with it.
          </>
        ) : (
          "You are not in a group, so there is nobody to share this with yet. Groups are set up by an admin, and signing up with an invite code puts you in one."
        )}
      </p>
    </section>
  );
}
