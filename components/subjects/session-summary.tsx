import { LocalTime } from "@/components/ui/local-time";

interface SessionSummaryProps {
  /** An ISO timestamp for when the study run was saved. */
  studiedAt: string;
  cardsUsed: number;
  totalCards: number;
  correct: number;
  incorrect: number;
  durationMin: number;
}

/**
 * One saved study run: when it happened, then what came of it. The date is
 * kept on a single line and the details wrap between items rather than inside
 * them, so it stays readable in a narrow column. Every number says what it is.
 */
export function SessionSummary({
  studiedAt,
  cardsUsed,
  totalCards,
  correct,
  incorrect,
  durationMin,
}: SessionSummaryProps) {
  return (
    <div className="flex flex-col gap-1">
      <LocalTime value={studiedAt} className="font-medium text-slate-200" />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="whitespace-nowrap text-blue-300">
          {cardsUsed} of {totalCards} cards
        </span>
        <span className="whitespace-nowrap text-emerald-300">
          {correct} correct
        </span>
        <span className="whitespace-nowrap text-rose-300">
          {incorrect} incorrect
        </span>
        <span className="whitespace-nowrap text-slate-400">
          Studied for {durationMin} min
        </span>
      </div>
    </div>
  );
}
