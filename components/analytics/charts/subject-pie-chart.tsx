"use client";

import { useMemo } from "react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { Pie } from "react-chartjs-2";

type SubjectSlice = {
  label: string;
  value: number;
};

type SubjectPieChartProps = {
  data: SubjectSlice[];
};

ChartJS.register(ArcElement, Tooltip, Legend);

function generatePalette(length: number): string[] {
  const base = [
    "#38bdf8",
    "#6366f1",
    "#a855f7",
    "#f97316",
    "#22d3ee",
    "#facc15",
    "#34d399",
    "#f472b6",
  ];

  return Array.from({ length }, (_, index) => base[index % base.length]);
}

export function SubjectPieChart({ data }: SubjectPieChartProps) {
  const chartData = useMemo(() => {
    const labels = data.map((item) => item.label);
    const values = data.map((item) => item.value);
    const colors = generatePalette(values.length);

    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: "rgba(15, 23, 42, 0.8)",
          borderWidth: 2,
        },
      ],
    };
  }, [data]);

  return (
    <div className="relative mx-auto h-[280px] w-full max-w-md">
      <Pie
        data={chartData}
        options={{ plugins: { legend: { position: "bottom" } } }}
      />
    </div>
  );
}
