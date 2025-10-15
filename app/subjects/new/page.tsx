import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { CreateSubjectForm } from "@/components/dashboard/create-subject-form";
import { getCurrentSession } from "@/lib/auth";

export default async function NewSubjectPage() {
  const session = await getCurrentSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-4xl flex-col gap-8 px-4 pb-24 pt-16">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">
            Create
          </p>
          <h1 className="mt-2 text-4xl font-semibold text-white">
            New subject
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Define the subject you want to study, choose flashcards or a
            checklist, and start tracking progress right away.
          </p>
        </div>
        <Panel className="bg-slate-900/70 p-6">
          <CreateSubjectForm />
        </Panel>
      </section>
    </main>
  );
}
