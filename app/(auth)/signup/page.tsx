import Link from "next/link";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/forms/signup-form";
import { TopNav } from "@/components/top-nav";
import { Panel } from "@/components/ui/panel";
import { getCurrentSession } from "@/lib/auth";

export default async function SignupPage() {
  const session = await getCurrentSession();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-4 pb-24 pt-20">
        <div className="max-w-xl text-center">
          <h1 className="text-4xl font-semibold text-white">
            Create your StudySpark account
          </h1>
          <p className="mt-3 text-base text-slate-300">
            You’ll be practicing with friends in seconds. No email required—just
            pick a username and password.
          </p>
        </div>
        <Panel className="w-full max-w-md bg-slate-900/70 p-8">
          <SignupForm />
          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Log in
            </Link>
          </p>
        </Panel>
      </section>
    </main>
  );
}
