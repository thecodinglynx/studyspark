import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { SubjectStudy } from "@/components/subjects/subject-study";
import { CardEditor } from "@/components/subjects/card-editor";
import { ShareManager } from "@/components/subjects/share-manager";

type ShareRole = "VIEWER" | "EDITOR";

interface SubjectShareDetail {
  id: string;
  role: ShareRole;
  userId: string;
  user: { id: string; username: string; name: string | null };
}

interface SubjectCardDetail {
  id: string;
  prompt: string;
  answer: string;
}

interface SubjectSessionSummary {
  id: string;
  correct: number;
  incorrect: number;
  durationMin: number;
  studiedAt: Date;
}

interface SubjectDetail {
  id: string;
  title: string;
  description: string | null;
  ownerId: string;
  studyGoal: number;
  owner: { id: string; username: string; name: string | null };
  cards: SubjectCardDetail[];
  shares: SubjectShareDetail[];
  sessions: SubjectSessionSummary[];
}

interface SubjectPageProps {
  params: { id: string };
}

export default async function SubjectPage({ params }: SubjectPageProps) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const subject = (await prisma.subject.findUnique({
    where: { id: params.id },
    include: {
      cards: { orderBy: { createdAt: "asc" } },
      owner: { select: { id: true, username: true, name: true } },
      shares: {
        include: { user: { select: { id: true, username: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      sessions: {
        where: { userId: session.user.id },
        orderBy: { studiedAt: "desc" },
        take: 50,
      },
    },
  })) as SubjectDetail | null;

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

  const cardSummaries = subject.cards.map((card) => ({
    id: card.id,
    prompt: card.prompt,
    answer: card.answer,
  }));

  if (!isParticipant) {
    redirect("/dashboard");
  }

  const totals = subject.sessions.reduce<{
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
  );

  const totalAttempts = totals.correct + totals.incorrect;
  const accuracy =
    totalAttempts === 0
      ? 0
      : Math.round((totals.correct / totalAttempts) * 100);

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
            <p className="text-3xl font-semibold text-white">
              {subject.cards.length}
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
              Cards
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate-400">
              <div className="text-center md:text-right">
                <p className="text-lg font-semibold text-emerald-300">
                  {totals.correct}
                </p>
                <p>Correct</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-lg font-semibold text-rose-300">
                  {totals.incorrect}
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
          </Panel>
        </div>

        <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
          <Panel className="bg-slate-900/60 p-6">
            <SubjectStudy
              subjectId={subject.id}
              cards={cardSummaries}
              studyGoal={subject.studyGoal}
              canEditCards={canEditCards}
            />
            {canEditCards && (
              <div className="mt-10 border-t border-white/5 pt-8">
                <CardEditor
                  subjectId={subject.id}
                  cards={cardSummaries}
                  canEdit={canEditCards}
                />
              </div>
            )}
          </Panel>
          <Panel className="h-fit bg-slate-900/70 p-6">
            <ShareManager
              subjectId={subject.id}
              isOwner={subject.ownerId === session.user.id}
              shares={subject.shares.map((share) => ({
                id: share.id,
                role: share.role,
                username: share.user.username,
                name: share.user.name ?? null,
              }))}
            />
            <div className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
                Recent sessions
              </h2>
              <div className="mt-3 space-y-3 text-xs text-slate-400">
                {subject.sessions.length === 0 && (
                  <p>No sessions yet. Start your first study run!</p>
                )}
                {subject.sessions.map((sessionItem) => (
                  <div
                    key={sessionItem.id}
                    className="grid grid-cols-2 items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-4 py-3 text-left sm:grid-cols-4"
                  >
                    <span className="text-xs font-medium text-slate-200">
                      {sessionItem.studiedAt.toLocaleString()}
                    </span>
                    <span className="text-right text-emerald-300 sm:text-center">
                      +{sessionItem.correct}
                    </span>
                    <span className="text-right text-rose-300 sm:text-center">
                      -{sessionItem.incorrect}
                    </span>
                    <span className="text-right text-slate-300">
                      {sessionItem.durationMin} min
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </section>
    </main>
  );
}
