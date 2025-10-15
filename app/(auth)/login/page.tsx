import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/login-form";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { getCurrentSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getCurrentSession();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-4 pb-24 pt-20">
        <div className="max-w-xl text-center">
          <h1 className="text-4xl font-semibold text-white">Welcome back</h1>
          <p className="mt-3 text-base text-slate-300">
            Pick up where you left off with your subjects, or jump into a shared
            deck from your team.
          </p>
        </div>
        <Panel className="w-full max-w-md bg-slate-900/70 p-8">
          <LoginForm />
          <p className="mt-6 text-center text-sm text-slate-400">
            New here?{" "}
            <Link href="/signup" className="text-blue-400 hover:text-blue-300">
              Create an account
            </Link>
          </p>
        </Panel>
      </section>
    </main>
  );
}
