import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";

const features = [
  {
    title: "Flip your knowledge",
    description:
      "Immersive 3D flashcards keep study sessions fast, focused, and fun.",
  },
  {
    title: "Collaborate effortlessly",
    description:
      "Share complete subjects or specific decks with teammates in a single click.",
  },
  {
    title: "Progress that powers you",
    description:
      "Detailed analytics show accuracy trends, streaks, and goal completion.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <TopNav />
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 pb-20 pt-20 text-center sm:gap-12">
        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs tracking-[0.4em] text-slate-300">
          STUDY SMARTER TOGETHER
        </span>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl">
          A beautiful study companion built for teams and ambitious learners.
        </h1>
        <p className="max-w-2xl text-base text-slate-300 sm:text-lg">
          StudySpark combines collaborative flashcard decks, rich analytics, and
          a delightful experience so you can stay on track and celebrate wins
          with your peers.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/signup">Get started free</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link href="/login">I already have an account</Link>
          </Button>
        </div>
      </section>
      <section className="border-t border-white/5 bg-slate-950/40 py-20">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-3xl border border-white/5 bg-white/5 p-6 text-left shadow-xl shadow-slate-950/50 backdrop-blur-xl"
            >
              <h3 className="text-xl font-semibold text-white">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm text-slate-300">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
