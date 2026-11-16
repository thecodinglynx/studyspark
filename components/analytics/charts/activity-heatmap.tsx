import type { HeatmapDay } from "@/lib/analytics";

const LEVEL_CLASS: Record<HeatmapDay["level"], string> = {
  0: "bg-slate-800",
  1: "bg-sky-900",
  2: "bg-sky-700",
  3: "bg-sky-500",
  4: "bg-sky-300",
};

const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

const describeDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const describeCell = (cell: HeatmapDay) =>
  `${
    cell.count === 0
      ? "Nothing"
      : cell.count === 1
        ? "1 activity"
        : `${cell.count} activities`
  } on ${describeDay(cell.day)}`;

/**
 * One square per day, a column per week: busy stretches and gaps show up at a
 * glance. Plain HTML, so it needs no chart library, and each square is
 * labelled for screen readers.
 */
export function ActivityHeatmap({ weeks }: { weeks: HeatmapDay[][] }) {
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex w-max gap-3">
          <div
            aria-hidden="true"
            className="grid grid-rows-7 gap-1 pr-1 text-[11px] leading-5 text-slate-400"
          >
            {WEEKDAYS.map((label, index) => (
              <span key={index} className="h-5">
                {label}
              </span>
            ))}
          </div>
          <ul className="flex gap-1" aria-label="Activity per day">
            {weeks.map((week) => (
              <li key={week[0].day}>
                <ul className="grid grid-rows-7 gap-1">
                  {week.map((cell) =>
                    cell.future ? (
                      <li key={cell.day} aria-hidden="true" className="h-5 w-5" />
                    ) : (
                      <li
                        key={cell.day}
                        title={describeCell(cell)}
                        aria-label={describeCell(cell)}
                        data-level={cell.level}
                        className={`h-5 w-5 rounded-[5px] ${LEVEL_CLASS[cell.level]}`}
                      />
                    )
                  )}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"
      >
        <span>Less</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span key={level} className={`h-3.5 w-3.5 rounded-[4px] ${LEVEL_CLASS[level]}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
