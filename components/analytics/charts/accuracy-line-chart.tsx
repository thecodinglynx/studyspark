"use client";

import { useMemo } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

const PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#f97316",
  "#34d399",
  "#f472b6",
  "#facc15",
  "#22d3ee",
  "#818cf8",
];

interface AccuracyLineChartProps {
  labels: string[];
  datasets: Array<{
    label: string;
    /** Percent right per label; null leaves a gap for a week without answers. */
    data: Array<number | null>;
  }>;
}

export function AccuracyLineChart({ labels, datasets }: AccuracyLineChartProps) {
  const chartData = useMemo(
    () => ({
      labels,
      datasets: datasets.map((dataset, index) => {
        const color = PALETTE[index % PALETTE.length];
        return {
          ...dataset,
          borderColor: color,
          backgroundColor: color,
          pointBackgroundColor: color,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          tension: 0.25,
          // Join the dots across a week with no study instead of dropping the line.
          spanGaps: true,
        };
      }),
    }),
    [labels, datasets]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: "#cbd5f5" },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: "#94a3b8",
            stepSize: 25,
            callback: (value: string | number) => `${value}%`,
          },
          grid: { color: "rgba(148, 163, 184, 0.1)" },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          labels: { color: "#e2e8f0" },
        },
        tooltip: {
          callbacks: {
            label: (context: {
              dataset: { label?: string };
              parsed: { y: number | null };
            }) => `${context.dataset.label}: ${context.parsed.y}% right`,
          },
        },
      },
    }),
    []
  );

  return (
    <div className="relative h-[280px] w-full">
      <Line data={chartData} options={options} />
    </div>
  );
}
