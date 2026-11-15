import { redirect } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { ProfileForm } from "@/components/settings/profile-form";
import { Panel } from "@/components/ui/panel";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, name: true, group: { select: { name: true } } },
  });
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pb-24 pt-16">
        <header>
          <p className="text-sm uppercase tracking-[0.4em] text-blue-300/80">Settings</p>
          <h1 className="mt-2 text-4xl font-semibold text-white">Your profile</h1>
          <p className="mt-2 text-sm text-slate-300">Update how your name appears in StudySpark.</p>
        </header>
        <Panel className="p-6">
          <ProfileForm username={user.username} name={user.name} />
        </Panel>
        {user.group && (
          <p className="text-sm text-slate-400">
            You are in the group <span className="text-slate-200">{user.group.name}</span>.
          </p>
        )}
      </section>
    </main>
  );
}
