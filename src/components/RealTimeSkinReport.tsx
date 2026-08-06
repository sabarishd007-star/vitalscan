import { useMemo, useState } from "react";
import type { LocalizedAnalysis, SkinAnalysisResult } from "../utils/skinEngine";
import { convertToOverlayData } from "../utils/skinOverlayAdapter";
import type { FaceMeshData } from "../utils/faceLandmarker";
import { SkinAnalysisOverlay } from "./SkinAnalysisOverlay";

type Props = {
  result: SkinAnalysisResult;
  imageUrl: string;
  mesh?: FaceMeshData;
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

export default function RealTimeSkinReport({ result, imageUrl, mesh }: Props) {
  const [selected, setSelected] = useState("all");
  const [viewMode, setViewMode] = useState<"hud" | "zones">("hud");

  const analysis: LocalizedAnalysis = useMemo(
    () =>
      result.localized_analysis ?? {
        primary_skin_type: result.skinType,
        metrics: {
          dark_circles: { score: Math.round(result.darkCircles * 10), max: 100, description: "Under-eye dark circle score" },
          open_pores: { score: Math.round(result.poreVisibility * 10), max: 100, description: "Pore visibility score" },
          texture: { score: Math.round(result.texture * 10), max: 100, description: "Skin roughness score" },
          redness: { score: Math.round(result.redness * 10), max: 100, description: "Visible redness score" },
          oiliness: { score: Math.round(result.oiliness * 10), max: 100, description: "T-Zone oiliness score" },
          dryness: { score: Math.round(result.dryness * 10), max: 100, description: "Flaky dryness score" },
        },
        bounding_regions: {
          dark_circles: { x: 0.25, y: 0.44, w: 0.5, h: 0.12 },
          open_pores: { x: 0.38, y: 0.42, w: 0.24, h: 0.22 },
          texture: { x: 0.2, y: 0.28, w: 0.6, h: 0.5 },
          redness: { x: 0.28, y: 0.48, w: 0.44, h: 0.25 },
          oiliness: { x: 0.3, y: 0.22, w: 0.4, h: 0.45 },
          dryness: { x: 0.18, y: 0.45, w: 0.64, h: 0.35 },
        },
      },
    [result]
  );

  // Honest callouts derived from the measured scores (not fabricated).
  const issues = useMemo(() => convertToOverlayData(result).issues, [result]);

  const visible = Object.entries(analysis.bounding_regions).filter(
    ([key]) => selected === "all" || selected === key
  );

  return (
    <section className="rounded-3xl border border-cyan-500/30 bg-slate-950/80 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-cyan-300 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            AI High-Tech Diagnostic Map
          </h2>
          <p className="mt-1 text-xs text-slate-300">Live facial landmarks and dynamic concern pulse nodes.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-900/80 p-1 rounded-xl border border-cyan-500/30 flex text-xs">
            <button
              onClick={() => setViewMode("hud")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${viewMode === "hud" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              🛸 Sci-Fi HUD
            </button>
            <button
              onClick={() => setViewMode("zones")}
              className={`px-3 py-1 rounded-lg font-semibold transition ${viewMode === "zones" ? "bg-cyan-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
            >
              📐 Zone Boxes
            </button>
          </div>
          <span className="rounded-full bg-pink-500/20 px-3 py-1 text-xs font-bold text-pink-100">{analysis.primary_skin_type} skin</span>
        </div>
      </div>

      {viewMode === "hud" ? (
        <SkinAnalysisOverlay
          imageSrc={imageUrl}
          issues={issues}
          confidence={result.analysisConfidence}
          meshPoints={mesh?.points}
          meshEdges={mesh?.edges}
        />
      ) : (
        <div className="relative mx-auto aspect-[3/4] max-w-md overflow-hidden rounded-2xl bg-slate-950">
          <img src={imageUrl} alt="Captured skin scan" className="h-full w-full object-cover" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
            {visible.map(([key, region]) => {
              const color = REGION_COLORS[key] ?? REGION_COLORS.texture;
              return <rect key={key} x={region.x} y={region.y} width={region.w} height={region.h} rx="0.025" fill={color.fill} stroke={color.stroke} strokeWidth="0.008" strokeDasharray="0.02 0.015" />;
            })}
          </svg>
        </div>
      )}

      {issues.length === 0 && viewMode === "hud" && (
        <p className="mt-3 text-center text-xs text-white/60">
          No concern crossed its detection threshold for this capture.
        </p>
      )}

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
