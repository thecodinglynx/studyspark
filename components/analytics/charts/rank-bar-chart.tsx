"use client";

import { useMemo } from "react";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const HIGHLIGHT = "#38bdf8";
const OTHER = "#64748b";

interface RankBarChartProps {
  labels: string[];
  /** One value per label; null means there is nothing to show for it yet. */
  values: Array<number | null>;
  /**
   * Index of the bar drawn in the accent colour (the viewer); every other bar
   * is grey. Leave it out to draw all bars in the accent colour.
   */
  highlight?: number;
  /** How a value is written in the tooltip and on the axis. */
  format?: (value: number) => string;
  /** Fixed top of the axis, for percentages. */
  max?: number;
  /** Name of the measure, for the tooltip and screen readers. */
  measure: string;
}

/**
 * Horizontal bars, one per person or subject, longest first. Everything is one
 * colour except the viewer's bar, so "where am I?" is answered at a glance.
 */
export function RankBarChart({
  labels,
  values,
  highlight,
  format = String,
  max,
  measure,
}: RankBarChartProps) {
  const chartData = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: measure,
          data: values,
          backgroundColor: values.map((_, index) =>
            highlight === undefined || index === highlight ? HIGHLIGHT : OTHER
          ),
          borderRadius: 6,
          barThickness: 18,
        },
      ],
    }),
    [labels, values, highlight, measure]
  );

  const options = useMemo(
    () => ({
      indexAxis: "y" as const,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          ...(max === undefined ? {} : { max }),
          ticks: {
            color: "#94a3b8",
            precision: 0,
            maxTicksLimit: 5,
            maxRotation: 0,
            callback: (value: string | number) => format(Number(value)),
          },
          grid: { color: "rgba(148, 163, 184, 0.1)" },
        },
        y: {
          ticks: { color: "#e2e8f0" },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: { parsed: { x: number | null } }) =>
              context.parsed.x === null
                ? `${measure}: nothing yet`
                : `${measure}: ${format(context.parsed.x)}`,
          },
        },
      },
    }),
    [format, max, measure]
  );

  const summary = labels
    .map((label, index) => {
      const value = values[index];
      return `${label} ${value === null ? "nothing yet" : format(value)}`;
    })
    .join(", ");

  return (
    <div
      className="relative w-full"
      style={{ height: Math.max(120, labels.length * 34 + 40) }}
      role="img"
      aria-label={`${measure}: ${summary}`}
    >
      <Bar data={chartData} options={options} />
    </div>
  );
}
