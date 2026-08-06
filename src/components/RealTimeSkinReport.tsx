import { useState } from "react";
import type { LocalizedAnalysis } from "../utils/skinEngine";

type Props = {
  analysis: LocalizedAnalysis;
  imageUrl: string;
};

const REGION_COLORS: Record<string, { stroke: string; fill: string }> = {
  dark_circles: { stroke: "#fb7185", fill: "rgba(251, 113, 133, 0.18)" },
  open_pores: { stroke: "#f59e0b", fill: "rgba(245, 158, 11, 0.18)" },
  texture: { stroke: "#a78bfa", fill: "rgba(167, 139, 250, 0.18)" },
  redness: { stroke: "#ef4444", fill: "rgba(239, 68, 68, 0.16)" },
  oiliness: { stroke: "#22d3ee", fill: "rgba(34, 211, 238, 0.16)" },
  dryness: { stroke: "#facc15", fill: "rgba(250, 204, 21, 0.16)" },
};

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RealTimeSkinReport({ analysis, imageUrl }: Props) {
  const [selected, setSelected] = useState("all");
  const visible = Object.entries(analysis.bounding_regions).filter(([key]) => selected === "all" || selected === key);

  return (
    <section className="rounded-3xl border border-white/20 bg-white/10 p-5 shadow-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">Region-Aware Scan Map</h2>
          <p className="mt-1 text-xs text-white/60">Estimates are measured within Face Mesh zones, not the image background.</p>
        </div>
        <span className="rounded-full bg-pink-500/20 px-3 py-1 text-xs font-bold text-pink-100">{analysis.primary_skin_type} skin</span>
      </div>

      <div className="relative mx-auto aspect-[3/4] max-w-md overflow-hidden rounded-2xl bg-slate-950">
        <img src={imageUrl} alt="Captured skin scan" className="h-full w-full object-cover" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {visible.map(([key, region]) => {
            const color = REGION_COLORS[key] ?? REGION_COLORS.texture;
            return <rect key={key} x={region.x} y={region.y} width={region.w} height={region.h} rx="0.025" fill={color.fill} stroke={color.stroke} strokeWidth="0.008" strokeDasharray="0.02 0.015" />;
          })}
        </svg>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => setSelected("all")} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${selected === "all" ? "bg-white text-slate-900" : "bg-white/10 text-white"}`}>All zones</button>
        {Object.entries(analysis.metrics).map(([key, metric]) => (
          <button key={key} onClick={() => setSelected(key)} className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${selected === key ? "bg-white text-slate-900" : "bg-white/10 text-white"}`}>
            {title(key)} ({metric.score}/{metric.max})
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs italic text-white/50">Cosmetic image estimate only; it is not a dermatological diagnosis.</p>
    </section>
  );
}
