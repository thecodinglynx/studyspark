import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { CreateSubjectForm } from "@/components/dashboard/create-subject-form";

type ShareRole = "VIEWER" | "EDITOR";
type SubjectWithRelations = {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  studyGoal: number;
  updatedAt: Date;
  owner: { id: string; username: string; name: string | null };
  shares: Array<{
    id: string;
    role: ShareRole;
    userId: string;
    user: { id: string; username: string; name: string | null };
  }>;
  _count: { cards: number; shares: number; sessions: number };
  sessions: Array<{
    id: string;
    correct: number;
    incorrect: number;
    durationMin: number;
    studiedAt: Date;
  }>;
};

type SubjectWithAnalytics = SubjectWithRelations & {
  analytics: {
    totalAttempts: number;
    accuracy: number;
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
  const subjects = (await prisma.subject.findMany({
    where: {
      OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
    },
    include: {
      owner: { select: { username: true, id: true, name: true } },
      shares: {
        include: {
          user: { select: { id: true, username: true, name: true } },
        },
      },
      _count: { select: { cards: true, shares: true, sessions: true } },
      sessions: {
        where: { userId },
        orderBy: { studiedAt: "desc" },
        take: 5,
      },
    },
    orderBy: { updatedAt: "desc" },
  })) as SubjectWithRelations[];

  const totals = await prisma.studySession.aggregate({
    where: { userId },
    _sum: {
      correct: true,
      incorrect: true,
      durationMin: true,
    },
    _count: true,
  });

  const progressBySubject = await prisma.studySession.groupBy({
    by: ["subjectId"],
    where: { userId },
    _sum: {
      correct: true,
      incorrect: true,
    },
  });

  type ProgressRecord = {
    subjectId: string;
    _sum: { correct: number | null; incorrect: number | null };
  };

  const progressRecords = progressBySubject as ProgressRecord[];
  const progressMap = new Map(
    progressRecords.map((item) => [item.subjectId, item])
  );

  const enrichedSubjects: SubjectWithAnalytics[] = subjects.map(
    (subject: SubjectWithRelations) => {
      const progress = progressMap.get(subject.id);
      const totalAttempts =
        (progress?._sum.correct ?? 0) + (progress?._sum.incorrect ?? 0);
      const accuracy =
        totalAttempts === 0
          ? 0
          : Math.round(((progress?._sum.correct ?? 0) / totalAttempts) * 100);

      return {
        ...subject,
        analytics: {
          totalAttempts,
          accuracy,
        },
      } as SubjectWithAnalytics;
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

        <section className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-semibold text-white">Subjects</h2>
              <Link
                href="/subjects/new"
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                View sharing guide
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
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                    <span>{subject._count.cards} cards</span>
                    <span>{subject.analytics.accuracy}% accuracy</span>
                    <span>{subject.analytics.totalAttempts} attempts</span>
                  </div>
                  {subject.sessions.length > 0 && (
                    <div className="mt-4 space-y-2 text-xs text-slate-400">
                      <p className="uppercase tracking-[0.3em] text-slate-500">
                        Recent sessions
                      </p>
                      {subject.sessions.map((sessionItem) => (
                        <div
                          key={sessionItem.id}
                          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                        >
                          <span className="text-slate-200">
                            {sessionItem.studiedAt.toLocaleDateString()}
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
          <Panel className="h-fit bg-slate-900/70 p-6">
            <h2 className="text-lg font-semibold text-white">
              Create a subject
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Define your study goal, add cards, and invite collaborators
              instantly.
            </p>
            <div className="mt-6">
              <CreateSubjectForm />
            </div>
          </Panel>
        </section>
      </section>
    </main>
  );
}
