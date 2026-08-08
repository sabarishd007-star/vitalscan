import React, { useState, useEffect } from 'react';

export interface Coordinate {
  x: number; // Normalized coordinate (0.0 to 1.0)
  y: number; // Normalized coordinate (0.0 to 1.0)
}

export interface DetectedIssue {
  id: string;
  label: string;
  severity: 'Low' | 'Moderate' | 'Severe';
  confidence: number;
  location: Coordinate; // Source location on face
  labelOffset: { dx: number; dy: number }; // Offset where the text box sits
  landmarkIndex?: number; // Optional MediaPipe or face mesh landmark index
}

export interface SkinAnalysisOverlayProps {
  imageSrc: string;
  issues: DetectedIssue[];
  meshPoints?: Coordinate[];
  meshEdges?: [number, number][];
  confidence?: number;
}

// 32 Anatomically Clean Face Landmarks
const CLEAN_FACE_LANDMARKS: Coordinate[] = [
  // Forehead arch
  { x: 0.50, y: 0.16 }, // 0: Top Center
  { x: 0.42, y: 0.18 }, // 1: Top Left
  { x: 0.58, y: 0.18 }, // 2: Top Right
  { x: 0.35, y: 0.24 }, // 3: Temple Left
  { x: 0.65, y: 0.24 }, // 4: Temple Right

  // Eyebrows
  { x: 0.35, y: 0.30 }, // 5: Left Brow Outer
  { x: 0.42, y: 0.28 }, // 6: Left Brow Mid
  { x: 0.47, y: 0.30 }, // 7: Left Brow Inner
  { x: 0.53, y: 0.30 }, // 8: Right Brow Inner
  { x: 0.58, y: 0.28 }, // 9: Right Brow Mid
  { x: 0.65, y: 0.30 }, // 10: Right Brow Outer

  // Eyes
  { x: 0.37, y: 0.36 }, // 11: Left Eye Outer
  { x: 0.41, y: 0.34 }, // 12: Left Eye Top
  { x: 0.45, y: 0.36 }, // 13: Left Eye Inner
  { x: 0.41, y: 0.38 }, // 14: Left Eye Bottom
  { x: 0.55, y: 0.36 }, // 15: Right Eye Inner
  { x: 0.59, y: 0.34 }, // 16: Right Eye Top
  { x: 0.63, y: 0.36 }, // 17: Right Eye Outer
  { x: 0.59, y: 0.38 }, // 18: Right Eye Bottom

  // Nose
  { x: 0.50, y: 0.31 }, // 19: Nose Bridge Top
  { x: 0.50, y: 0.40 }, // 20: Nose Bridge Mid
  { x: 0.50, y: 0.48 }, // 21: Nose Tip
  { x: 0.45, y: 0.50 }, // 22: Left Nostril
  { x: 0.55, y: 0.50 }, // 23: Right Nostril

  // Cheeks
  { x: 0.32, y: 0.45 }, // 24: Left Cheek Outer
  { x: 0.38, y: 0.48 }, // 25: Left Cheek Mid
  { x: 0.68, y: 0.45 }, // 26: Right Cheek Outer
  { x: 0.62, y: 0.48 }, // 27: Right Cheek Mid

  // Mouth & Lips
  { x: 0.44, y: 0.58 }, // 28: Mouth Left
  { x: 0.50, y: 0.56 }, // 29: Upper Lip Mid
  { x: 0.56, y: 0.58 }, // 30: Mouth Right
  { x: 0.50, y: 0.61 }, // 31: Lower Lip Mid

  // Jaw & Chin
  { x: 0.30, y: 0.58 }, // 32: Jaw Left Upper
  { x: 0.35, y: 0.68 }, // 33: Jaw Left Mid
  { x: 0.44, y: 0.74 }, // 34: Chin Left
  { x: 0.50, y: 0.77 }, // 35: Chin Tip
  { x: 0.56, y: 0.74 }, // 36: Chin Right
  { x: 0.65, y: 0.68 }, // 37: Jaw Right Mid
  { x: 0.70, y: 0.58 }, // 38: Jaw Right Upper
];

// Clean Anatomical Edges (Zero Crisscrossing Lines)
const CLEAN_MESH_EDGES: [number, number][] = [
  // Forehead & Temples
  [1, 0], [0, 2], [1, 3], [2, 4], [1, 6], [0, 19], [2, 9],
  // Eyebrows
  [3, 5], [5, 6], [6, 7], [7, 19], [19, 8], [8, 9], [9, 10], [10, 4],
  // Left Eye
  [11, 12], [12, 13], [13, 14], [14, 11], [5, 11], [6, 12], [7, 13],
  // Right Eye
  [15, 16], [16, 17], [17, 18], [18, 15], [8, 15], [9, 16], [10, 17],
  // Nose Structure
  [19, 20], [20, 21], [21, 22], [21, 23], [13, 20], [15, 20],
  // Cheeks
  [11, 24], [14, 25], [22, 25], [24, 25],
  [17, 26], [18, 27], [23, 27], [26, 27],
  // Mouth
  [22, 29], [23, 29], [28, 29], [29, 30], [30, 31], [31, 28],
  [25, 28], [27, 30],
  // Jawline & Chin
  [24, 32], [32, 33], [33, 34], [34, 35], [35, 36], [36, 37], [37, 38], [38, 26],
  [28, 34], [31, 35], [30, 36]
];

export const SkinAnalysisOverlay: React.FC<SkinAnalysisOverlayProps> = ({
  imageSrc,
  issues,
  meshPoints,
  meshEdges,
  confidence = 0,
}) => {
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 150);
    return () => clearTimeout(timer);
  }, []);

  // Limit active displayed issues to top 2 primary concerns for clean, uncluttered HUD
  const displayIssues = issues.slice(0, 2);

  // Real MediaPipe mesh drives the wireframe when present; otherwise fall back
  // to the static anatomical template.
  const usesLiveMesh = Boolean(meshPoints && meshPoints.length > 100);
  // The displayed photo is the mirrored selfie capture (see skinAnalysisService),
  // but MediaPipe landmarks are relative to the un-mirrored camera frame. Flip X
  // so the wireframe and pulse anchors align with the mirrored image. Callout
  // anchors use the server's bounding_regions, which are relative to the same
  // mirrored image, so they are NOT flipped here.
  const meshVertices: Coordinate[] = usesLiveMesh
    ? (meshPoints ?? []).map((p) => ({ x: 1 - p.x, y: p.y }))
    : CLEAN_FACE_LANDMARKS;
  const meshConnections: [number, number][] = usesLiveMesh ? meshEdges ?? [] : CLEAN_MESH_EDGES;

  const anchorPoint = (issue: DetectedIssue): Coordinate => {
    if (usesLiveMesh || issue.landmarkIndex === undefined) return issue.location;
    return (
      meshPoints?.[issue.landmarkIndex] ??
      CLEAN_FACE_LANDMARKS[issue.landmarkIndex] ??
      issue.location
    );
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto overflow-hidden rounded-2xl border border-cyan-500/40 bg-slate-950 shadow-[0_0_50px_rgba(6,182,212,0.25)]">
      {/* 1. Base Photo */}
      <img
        src={imageSrc}
        alt="Skin Analysis Target"
        className="w-full h-auto object-cover block filter brightness-95 contrast-105"
      />

      {/* 2. Scaled SVG HUD Overlay Viewport */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none select-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          {/* Cyberpunk Cyan Grid Pattern */}
          <pattern id="hudGrid" width="4" height="4" patternUnits="userSpaceOnUse">
            <path
              d="M 4 0 L 0 0 0 4"
              fill="none"
              stroke="rgba(6, 182, 212, 0.16)"
              strokeWidth="0.1"
            />
            <circle cx="0" cy="0" r="0.08" fill="rgba(56, 189, 248, 0.35)" />
          </pattern>

          {/* Glow Filters */}
          <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="glowOrange" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Layer A: Tech Grid Overlay */}
        <rect width="100" height="100" fill="url(#hudGrid)" />

        {/* Layer B: Face Reticle Corner Brackets */}
        <g stroke="#38bdf8" strokeWidth="0.3" fill="none" filter="url(#glowCyan)" className="opacity-90">
          <path d="M 27 27 L 27 16 L 38 16" />
          <path d="M 62 16 L 73 16 L 73 27" />
          <path d="M 27 73 L 27 84 L 38 84" />
          <path d="M 62 84 L 73 84 L 73 73" />
          <path d="M 23 50 L 25 50 M 75 50 L 77 50 M 50 12 L 50 14 M 50 86 L 50 88" strokeDasharray="0.4 0.4" />
        </g>

        {/* Layer C: Left HUD Elements */}
        {/* ECG Pulse Wave */}
        <g stroke="#38bdf8" strokeWidth="0.22" fill="none" filter="url(#glowCyan)" className="opacity-80">
          <path d="M 4 24 L 7 24 L 8 21 L 9.5 28 L 11 16 L 12.5 26 L 13.5 24 L 18 24" />
        </g>

        {/* Left Target Radar Dial */}
        <g className="opacity-80">
          <circle cx="11" cy="60" r="4.5" fill="none" stroke="#38bdf8" strokeWidth="0.18" strokeDasharray="0.6 0.3" />
          <circle cx="11" cy="60" r="3" fill="none" stroke="#06b6d4" strokeWidth="0.15" />
          <circle cx="11" cy="60" r="0.4" fill="#38bdf8" filter="url(#glowCyan)" />
          <line x1="11" y1="60" x2="14.5" y2="57" stroke="#38bdf8" strokeWidth="0.18" filter="url(#glowCyan)" />
        </g>

        {/* Layer D: Right HUD Elements */}
        <text x="80" y="23" fill="#38bdf8" fontSize="1.8" fontFamily="sans-serif" letterSpacing="0.1" className="opacity-90">
          Skin Analysis Active
        </text>

        {/* 3 Circular Speed Gauges */}
        {[81, 87, 93].map((cx, idx) => (
          <g key={`gauge-${idx}`} className="opacity-85">
            <circle cx={cx} cy="30" r="1.8" fill="none" stroke="#38bdf8" strokeWidth="0.15" strokeDasharray="0.5 0.3" />
            <line
              x1={cx}
              y1="30"
              x2={cx + (idx === 0 ? 0.7 : idx === 1 ? -0.6 : 0.4)}
              y2={30 - (idx === 0 ? 1.0 : idx === 1 ? 0.9 : 1.1)}
              stroke="#38bdf8"
              strokeWidth="0.2"
              filter="url(#glowCyan)"
            />
          </g>
        ))}

        <text x="80" y="44" fill="#38bdf8" fontSize="2.0" fontFamily="sans-serif" className="opacity-90">
          Detection Confidence: {Math.round(confidence)}%
        </text>

        {/* Right Radar Target Hexagon */}
        <g className="opacity-85">
          <circle cx="85" cy="60" r="4" fill="none" stroke="#38bdf8" strokeWidth="0.18" strokeDasharray="0.5 0.3" />
          <polygon points="85,57.5 87.2,58.8 87.2,61.2 85,62.5 82.8,61.2 82.8,58.8" fill="#06b6d4" fillOpacity="0.4" stroke="#38bdf8" strokeWidth="0.18" filter="url(#glowCyan)" />
          <circle cx="85" cy="60" r="0.4" fill="#ffffff" />
        </g>

        <text x="80" y="72" fill="#38bdf8" fontSize="2.0" fontFamily="sans-serif" className="opacity-90">
          Face Mesh: {usesLiveMesh ? "Live" : "Estimated"}
        </text>

        <path
          d="M 91 80 Q 91 82 89 82 Q 91 82 91 84 Q 91 82 93 82 Q 91 82 91 80 Z"
          fill="#38bdf8"
          filter="url(#glowCyan)"
          className="opacity-80 animate-pulse"
        />

        {/* Layer E: 3D Face Wireframe Mesh */}
        {/* Wireframe Connecting Lines */}
        {meshConnections.map(([i, j], edgeIdx) => {
          const p1 = meshVertices[i];
          const p2 = meshVertices[j];
          if (!p1 || !p2) return null;

          return (
            <line
              key={`edge-${edgeIdx}`}
              x1={p1.x * 100}
              y1={p1.y * 100}
              x2={p2.x * 100}
              y2={p2.y * 100}
              stroke="rgba(224, 242, 254, 0.85)"
              strokeWidth="0.25"
              filter="url(#glowCyan)"
            />
          );
        })}

        {/* Glowing Face Mesh Vertices */}
        {meshVertices.map((pt, idx) => (
          <circle
            key={`mesh-node-${idx}`}
            cx={pt.x * 100}
            cy={pt.y * 100}
            r="0.45"
            fill="#ffffff"
            stroke="#06b6d4"
            strokeWidth="0.12"
            filter="url(#glowCyan)"
          />
        ))}

        {/* Layer F: Diagnostic Pointer Lines & Sleek Callout Text */}
        {displayIssues.map((issue) => {
          const anchor = anchorPoint(issue);
          const originX = anchor.x * 100;
          const originY = anchor.y * 100;

          const targetX = originX + issue.labelOffset.dx;
          const targetY = originY + issue.labelOffset.dy;

          const isOrange = issue.severity === 'Severe' || issue.label.toLowerCase().includes('pimple') || issue.label.toLowerCase().includes('dark');
          const colorHex = isOrange ? '#f97316' : '#38bdf8';

          return (
            <g key={issue.id}>
              {/* Target Spot Glowing Pulse Rings */}
              <circle
                cx={originX}
                cy={originY}
                r="1.2"
                fill="none"
                stroke={colorHex}
                strokeWidth="0.3"
                filter="url(#glowOrange)"
                className="animate-ping opacity-75"
              />
              <circle
                cx={originX}
                cy={originY}
                r="0.6"
                fill={colorHex}
                filter="url(#glowOrange)"
              />

              {/* Connecting Diagnostic Pointer Line */}
              <line
                x1={originX}
                y1={originY}
                x2={targetX}
                y2={targetY}
                stroke={colorHex}
                strokeWidth="0.35"
                strokeDasharray="100"
                strokeDashoffset={isAnimated ? "0" : "100"}
                style={{ transition: 'stroke-dashoffset 0.8s ease-in-out' }}
                filter="url(#glowOrange)"
              />

              {/* Clean Glowing SVG Text Label */}
              <text
                x={targetX + (issue.labelOffset.dx > 0 ? 1 : -1)}
                y={targetY}
                fill={colorHex}
                fontSize="3.2"
                fontWeight="700"
                fontFamily="sans-serif"
                filter="url(#glowOrange)"
                textAnchor={issue.labelOffset.dx > 0 ? "start" : "end"}
                dominantBaseline="middle"
                className={`transition-opacity duration-500 ${
                  isAnimated ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {issue.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default SkinAnalysisOverlay;
