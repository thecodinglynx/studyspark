"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

type PracticeBarChartProps = {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
  }>;
};

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

function generatePalette(length: number): string[] {
  const base = [
    "rgba(56, 189, 248, 0.6)",
    "rgba(99, 102, 241, 0.6)",
    "rgba(168, 85, 247, 0.6)",
    "rgba(249, 115, 22, 0.6)",
    "rgba(34, 211, 238, 0.6)",
    "rgba(250, 204, 21, 0.6)",
    "rgba(52, 211, 153, 0.6)",
    "rgba(244, 114, 182, 0.6)",
  ];

  return Array.from({ length }, (_, index) => base[index % base.length]);
}

export function PracticeBarChart({ labels, datasets }: PracticeBarChartProps) {
  const colors = useMemo(
    () => generatePalette(datasets.length),
    [datasets.length]
  );

  const chartData = useMemo(
    () => ({
      labels,
      datasets: datasets.map((dataset, index) => ({
        ...dataset,
        backgroundColor: colors[index],
        borderColor: colors[index].replace("0.6", "1"),
        borderWidth: 1,
        borderRadius: 12,
        barThickness: 20,
        order: index,
      })),
    }),
    [colors, datasets, labels]
  );

  const options = useMemo(
    () => ({
      indexAxis: "x" as const,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: "#cbd5f5",
          },
          grid: {
            display: false,
          },
        },
        y: {
          ticks: {
            color: "#94a3b8",
          },
          grid: {
            color: "rgba(148, 163, 184, 0.1)",
            drawBorder: false,
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          labels: {
            color: "#e2e8f0",
          },
        },
      },
    }),
    []
  );

  return (
    <div className="relative h-[280px] w-full">
      <Bar data={chartData} options={options} />
    </div>
  );
}
