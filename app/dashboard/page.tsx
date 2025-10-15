import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";

type ShareRole = "VIEWER" | "EDITOR";
type SubjectWithRelations = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  studyGoal: number;
  updatedAt: Date;
  type: "FLASHCARDS" | "CHECKLIST";
  owner: { id: string; username: string; name: string | null };
  shares: Array<{
    id: string;
    role: ShareRole;
    userId: string;
    user: { id: string; username: string; name: string | null };
  }>;
  _count: {
    cards: number;
    shares: number;
    sessions: number;
  };
  checklistItems: Array<{ id: string; title: string }>;
  sessions: Array<{
    id: string;
    correct: number;
    incorrect: number;
    durationMin: number;
    cardCount: number;
    studiedAt: Date;
  }>;
  checklistEntries: Array<{
    id: string;
    practicedAt: Date;
    item: { id: string; title: string };
  }>;
};

type SubjectWithAnalytics = SubjectWithRelations & {
  analytics:
    | {
        kind: "FLASHCARDS";
        totalAttempts: number;
        accuracy: number;
      }
    | {
        kind: "CHECKLIST";
        totalPractices: number;
        lastPracticedAt: Date | null;
      };
};

type DashboardTotals = {
  _sum: {
    correct: number | null;
    incorrect: number | null;
    durationMin: number | null;
  };
  _count: number;
};

async function getDashboardData(userId: string): Promise<{
  subjects: SubjectWithAnalytics[];
  totals: DashboardTotals;
}> {
  const includeConfig = {
    owner: { select: { username: true, id: true, name: true } },
    shares: {
      include: {
        user: { select: { id: true, username: true, name: true } },
      },
    },
    _count: {
      select: {
        cards: true,
        shares: true,
        sessions: true,
      },
    },
    sessions: {
      where: { userId },
      orderBy: { studiedAt: "desc" },
      take: 5,
    },
    checklistItems: {
      orderBy: { position: "asc" },
      select: { id: true, title: true },
    },
    checklistEntries: {
      where: { userId },
      orderBy: { practicedAt: "desc" },
      take: 5,
      include: { item: { select: { id: true, title: true } } },
    },
  } as const;

  const subjects = (await prisma.subject.findMany({
    where: {
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    include: includeConfig as any,
    orderBy: { updatedAt: "desc" },
  })) as unknown as SubjectWithRelations[];

  const totals = await prisma.studySession.aggregate({
    where: { userId },
    _sum: {
      correct: true,
      incorrect: true,
      durationMin: true,
    },
    _count: true,
  });

  type ProgressRecord = {
    subjectId: string;
    _sum: {
      correct: number | null;
      incorrect: number | null;
      cardCount: number | null;
    };
  };

  const studySessionGroupByClient = prisma as unknown as {
    studySession: {
      groupBy: (args: {
        by: ["subjectId"];
        where: { userId: string };
        _sum: { correct: true; incorrect: true; cardCount: true };
      }) => Promise<ProgressRecord[]>;
    };
  };

  const progressRecords = await studySessionGroupByClient.studySession.groupBy({
    by: ["subjectId"],
    where: { userId },
    _sum: { correct: true, incorrect: true, cardCount: true },
  });
  const progressMap = new Map(
    progressRecords.map((item) => [item.subjectId, item])
  );

  const checklistProgressRaw = await (
    prisma as unknown as {
      checklistEntry: {
        groupBy: (args: unknown) => Promise<unknown>;
      };
    }
  ).checklistEntry.groupBy({
    by: ["subjectId"],
    where: { userId },
    _count: { _all: true },
    _max: { practicedAt: true },
  });

  type ChecklistProgressRecord = {
    subjectId: string;
    _count: { _all: number };
    _max: { practicedAt: Date | null };
  };

  const checklistRecords = checklistProgressRaw as ChecklistProgressRecord[];
  const checklistMap = new Map(
    checklistRecords.map((item) => [item.subjectId, item])
  );

  const enrichedSubjects: SubjectWithAnalytics[] = subjects.map(
    (subject: SubjectWithRelations) => {
      if (subject.type === "FLASHCARDS") {
        const progress = progressMap.get(subject.id);
        const totalAttempts =
          progress?._sum.cardCount ??
          (progress?._sum.correct ?? 0) + (progress?._sum.incorrect ?? 0);
        const accuracy =
          totalAttempts === 0
            ? 0
            : Math.round(((progress?._sum.correct ?? 0) / totalAttempts) * 100);

        return {
          ...subject,
          analytics: {
            kind: "FLASHCARDS",
            totalAttempts,
            accuracy,
          },
        } satisfies SubjectWithAnalytics;
      }

      const checklist = checklistMap.get(subject.id);
      const totalPractices =
        checklist?._count._all ?? subject.checklistEntries.length;
      const lastPracticedAt =
        checklist?._max.practicedAt ??
        subject.checklistEntries[0]?.practicedAt ??
        null;

      return {
        ...subject,
        analytics: {
          kind: "CHECKLIST",
          totalPractices,
          lastPracticedAt,
        },
      } satisfies SubjectWithAnalytics;
    }
  );

  return {
    subjects: enrichedSubjects,
    totals: totals as DashboardTotals,
  };
}

export default async function DashboardPage() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const data = await getDashboardData(session.user.id);

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-24 pt-16">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
              Dashboard
            </p>
            <h1 className="mt-2 text-4xl font-semibold text-white">
              Welcome back, {session.user.username}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Track your progress across subjects, invite collaborators, and
              launch a study session in one click.
            </p>
          </div>
          <Panel className="w-full max-w-sm bg-slate-900/70">
            <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
              This month
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-white">
                  {data.totals._count}
                </p>
                <p className="text-xs text-slate-400">Sessions</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-emerald-400">
                  {data.totals._sum.correct ?? 0}
                </p>
                <p className="text-xs text-slate-400">Correct</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-rose-400">
                  {data.totals._sum.incorrect ?? 0}
                </p>
                <p className="text-xs text-slate-400">Incorrect</p>
              </div>
            </div>
          </Panel>
        </header>

        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-white">Subjects</h2>
              <Link
                href="/subjects/new"
                className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm text-blue-300 transition hover:border-blue-300 hover:text-blue-200"
              >
                Create subject
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {data.subjects.map((subject: SubjectWithAnalytics) => (
                <Panel key={subject.id} className="bg-slate-900/70 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {subject.title}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {subject.ownerId === session.user.id
                          ? "Owned by you"
                          : `Shared by ${subject.owner.username}`}
                      </p>
                    </div>
                    <Link
                      href={`/subjects/${subject.id}`}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-blue-300 hover:border-blue-300"
                    >
                      Open
                    </Link>
                  </div>
                  {subject.description && (
                    <p className="mt-3 line-clamp-3 text-sm text-slate-300">
                      {subject.description}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>
                      {subject.type === "FLASHCARDS"
                        ? `${subject._count.cards} cards`
                        : `${subject.checklistItems.length} checklist items`}
                    </span>
                    {subject.analytics.kind === "FLASHCARDS" ? (
                      <>
                        <span>{subject.analytics.accuracy}% accuracy</span>
                        <span>{subject.analytics.totalAttempts} attempts</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {subject.analytics.totalPractices} practices
                        </span>
                        <span>
                          {subject.analytics.lastPracticedAt
                            ? `Last practiced ${subject.analytics.lastPracticedAt.toLocaleDateString()}`
                            : "Not practiced yet"}
                        </span>
                      </>
                    )}
                  </div>
                  {subject.type === "FLASHCARDS" &&
                    subject.sessions.length > 0 && (
                      <div className="mt-4 space-y-2 text-xs text-slate-400">
                        <p className="uppercase tracking-[0.3em] text-slate-500">
                          Recent sessions
                        </p>
                        {subject.sessions.map((sessionItem) => {
                          const cardsUsed =
                            sessionItem.cardCount && sessionItem.cardCount > 0
                              ? sessionItem.cardCount
                              : sessionItem.correct + sessionItem.incorrect;
                          const totalCardsAvailable =
                            subject._count.cards > 0
                              ? subject._count.cards
                              : Math.max(cardsUsed, 0);

                          return (
                            <div
                              key={sessionItem.id}
                              className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-[auto_auto_auto_auto_auto] sm:gap-x-6"
                            >
                              <span className="text-slate-200">
                                {sessionItem.studiedAt.toLocaleDateString()}
                              </span>
                              <span className="whitespace-nowrap text-right text-blue-300 sm:text-center">
                                {cardsUsed}/{totalCardsAvailable} cards
                              </span>
                              <span className="text-right text-emerald-300 sm:text-center">
                                +{sessionItem.correct}
                              </span>
                              <span className="text-right text-rose-300 sm:text-center">
                                -{sessionItem.incorrect}
                              </span>
                              <span className="text-right text-slate-400">
                                {sessionItem.durationMin} min
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  {subject.type === "CHECKLIST" &&
                    subject.checklistEntries.length > 0 && (
                      <div className="mt-4 space-y-2 text-xs text-slate-400">
                        <p className="uppercase tracking-[0.3em] text-slate-500">
                          Recent practice
                        </p>
                        {subject.checklistEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="text-slate-200">
                              {entry.item.title}
                            </span>
                            <span className="text-slate-400">
                              {entry.practicedAt.toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                </Panel>
              ))}
              {data.subjects.length === 0 && (
                <Panel className="bg-slate-900/40 p-10 text-center text-slate-400">
                  <p>No subjects yet. Create one to start studying!</p>
                </Panel>
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
