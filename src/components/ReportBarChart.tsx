import { toCurrencyBRL } from "../lib/formatters";

// ─── Color palette (same as pie chart) ───────────────────────────────────────
const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16",
  "#10b981","#14b8a6","#06b6d4","#3b82f6","#6366f1",
  "#8b5cf6","#a855f7",
];
const OUTROS_COLOR = "#64748b";

// ─── Top-N aggregation ───────────────────────────────────────────────────────
export interface BarEntry { label: string; value: number; }

export function applyTopN(data: BarEntry[], n = 10): BarEntry[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const outrosTotal = sorted.slice(n).reduce((s, d) => s + d.value, 0);
  if (outrosTotal > 0) top.push({ label: "Outros", value: outrosTotal });
  return top;
}

// ─── Comparison series type ───────────────────────────────────────────────────
export interface BarChartSeries {
  label: string;
  color: string;
  values: number[];  // indexed same as categories[]
}

export interface ComparisonData {
  categories: string[];
  series: BarChartSeries[];
}

// ─── Layout constants — horizontal ────────────────────────────────────────────
const LABEL_W   = 148;
const VALUE_W   = 90;
const PAD       = 8;
const ROW_H     = 30;
const BAR_H     = 14;
const MINI_H    = 9;
const MINI_GAP  = 3;
const CAT_PAD   = 8;   // padding below each comparison category block
const LEGEND_H  = 22;

// ─── Layout constants — vertical ───────────────────────────────────────────────
const V_AREA_H   = 200;  // bar area height
const V_LABEL_H  = 38;   // space for category labels (horizontais, até 2 linhas)
const V_VALUE_H  = 18;   // space for value text above bar
const V_LEGEND_H = 22;
const MINI_BAR_W = 14;
const MINI_GAP_W = 3;

// Quebra o rótulo em até 2 linhas centralizadas (sem rotação).
function wrapLabel(label: string, maxChars = 13, maxLines = 2): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (candidate.length <= maxChars) {
      cur = candidate;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  const flat = label.replace(/\s+/g, " ");
  if (lines.join(" ").length < flat.length && lines.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, maxChars - 1)}…`;
  }
  return lines.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  /** Single-period mode */
  entries?: BarEntry[];
  /** Comparison mode */
  comparisonData?: ComparisonData;
  /** "dark" = screen (light text), "light" = print/PDF (dark text) */
  theme?: "dark" | "light";
  /** SVG coordinate width (scales with viewBox) */
  svgWidth?: number;
  /** "horizontal" (default) or "vertical" bars */
  orientation?: "horizontal" | "vertical";
  /** Force a single fill color for all bars (overrides the palette) */
  color?: string;
}

export function ReportBarChart({
  entries,
  comparisonData,
  theme = "dark",
  svgWidth = 560,
  orientation = "horizontal",
  color,
}: Props) {
  const BAR_W  = svgWidth - LABEL_W - VALUE_W - PAD * 2;
  const isDark = theme === "dark";

  const textPrimary   = isDark ? "#f1f5f9" : "#1e293b";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const barBg         = isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0";
  const rowBg         = isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)";

  // ── Vertical: single-period bars ────────────────────────────────────────
  if (orientation === "vertical" && entries && entries.length > 0) {
    const maxVal  = entries.reduce((m, e) => Math.max(m, e.value), 0);
    const n       = entries.length;
    const groupW  = svgWidth / n;
    const barW    = Math.min(groupW * 0.55, 56);
    const svgH    = V_VALUE_H + V_AREA_H + V_LABEL_H;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgH}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
      >
        {entries.map((entry, i) => {
          const bh    = maxVal > 0 ? (entry.value / maxVal) * V_AREA_H : 0;
          const cx    = i * groupW + groupW / 2;
          const x     = cx - barW / 2;
          const y     = V_VALUE_H + (V_AREA_H - bh);
          const fill  = color ?? (entry.label === "Outros" ? OUTROS_COLOR : PALETTE[i % PALETTE.length]);
          const labelY = V_VALUE_H + V_AREA_H + 14;
          return (
            <g key={`${entry.label}-${i}`}>
              {/* Track */}
              <rect x={x} y={V_VALUE_H} width={barW} height={V_AREA_H} fill={barBg} rx={3} />
              {/* Fill */}
              {bh > 0 && (
                <rect x={x} y={y} width={barW} height={bh} fill={fill} rx={3} opacity={0.9} />
              )}
              {/* Value */}
              <text
                x={cx}
                y={Math.max(y - 4, 10)}
                fontSize={10}
                fill={textPrimary}
                textAnchor="middle"
                fontFamily="Inter, Arial, sans-serif"
                fontWeight="500"
              >
                {toCurrencyBRL(entry.value)}
              </text>
              {/* Label (horizontal, até 2 linhas) */}
              <text
                x={cx}
                y={labelY}
                fontSize={9}
                fill={textSecondary}
                textAnchor="middle"
                fontFamily="Inter, Arial, sans-serif"
              >
                {wrapLabel(entry.label).map((ln, li) => (
                  <tspan key={li} x={cx} dy={li === 0 ? 0 : 10}>{ln}</tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Vertical: comparison mode (grouped vertical mini-bars) ──────────────
  if (orientation === "vertical" && comparisonData && comparisonData.categories.length > 0 && comparisonData.series.length > 0) {
    const { categories, series } = comparisonData;
    const maxVal   = Math.max(...series.flatMap((s) => s.values), 0);
    const n        = categories.length;
    const groupW   = svgWidth / n;
    const seriesW  = series.length * (MINI_BAR_W + MINI_GAP_W) - MINI_GAP_W;
    const svgH     = V_LEGEND_H + V_VALUE_H + V_AREA_H + V_LABEL_H;
    const barsTop  = V_LEGEND_H + V_VALUE_H;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgH}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Legend */}
        {series.map((s, i) => (
          <g key={`leg-${s.label}`} transform={`translate(${i * 110 + 4}, 0)`}>
            <rect x={0} y={4} width={10} height={10} fill={s.color} rx={2} />
            <text x={14} y={13} fontSize={10} fill={textSecondary} fontFamily="Inter, Arial, sans-serif">
              {s.label}
            </text>
          </g>
        ))}

        {/* Category groups */}
        {categories.map((cat, ci) => {
          const groupX = ci * groupW + (groupW - seriesW) / 2;
          const labelX = ci * groupW + groupW / 2;
          const labelY = barsTop + V_AREA_H + 14;
          return (
            <g key={`cat-${cat}`}>
              {series.map((s, si) => {
                const val = s.values[ci];
                const bh  = maxVal > 0 ? (val / maxVal) * V_AREA_H : 0;
                const x   = groupX + si * (MINI_BAR_W + MINI_GAP_W);
                const y   = barsTop + (V_AREA_H - bh);
                return (
                  <g key={`bar-${s.label}`}>
                    <rect x={x} y={barsTop} width={MINI_BAR_W} height={V_AREA_H} fill={barBg} rx={2} />
                    {bh > 0 && (
                      <rect x={x} y={y} width={MINI_BAR_W} height={bh} fill={s.color} rx={2} opacity={0.9} />
                    )}
                  </g>
                );
              })}
              {/* Category label (horizontal, até 2 linhas) */}
              <text
                x={labelX}
                y={labelY}
                fontSize={9}
                fill={textSecondary}
                textAnchor="middle"
                fontFamily="Inter, Arial, sans-serif"
              >
                {wrapLabel(cat).map((ln, li) => (
                  <tspan key={li} x={labelX} dy={li === 0 ? 0 : 10}>{ln}</tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Horizontal: single-period bars ───────────────────────────────────────
  if (entries && entries.length > 0) {
    const maxVal = entries.reduce((m, e) => Math.max(m, e.value), 0);
    const svgH   = entries.length * ROW_H;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgH}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
      >
        {entries.map((entry, i) => {
          const bw    = maxVal > 0 ? (entry.value / maxVal) * BAR_W : 0;
          const y     = i * ROW_H;
          const fill  = color ?? (entry.label === "Outros" ? OUTROS_COLOR : PALETTE[i % PALETTE.length]);
          return (
            <g key={`${entry.label}-${i}`}>
              {i % 2 === 0 && (
                <rect x={0} y={y} width={svgWidth} height={ROW_H} fill={rowBg} />
              )}
              {/* Label */}
              <text
                x={LABEL_W - 4}
                y={y + ROW_H / 2 + 4}
                fontSize={11}
                fill={textSecondary}
                textAnchor="end"
                fontFamily="Inter, Arial, sans-serif"
              >
                {entry.label.length > 19 ? entry.label.slice(0, 18) + "…" : entry.label}
              </text>
              {/* Bar track */}
              <rect
                x={LABEL_W + PAD}
                y={y + (ROW_H - BAR_H) / 2}
                width={BAR_W}
                height={BAR_H}
                fill={barBg}
                rx={3}
              />
              {/* Bar fill */}
              {bw > 0 && (
                <rect
                  x={LABEL_W + PAD}
                  y={y + (ROW_H - BAR_H) / 2}
                  width={bw}
                  height={BAR_H}
                  fill={fill}
                  rx={3}
                  opacity={0.85}
                />
              )}
              {/* Value */}
              <text
                x={svgWidth - PAD}
                y={y + ROW_H / 2 + 4}
                fontSize={11}
                fill={textPrimary}
                textAnchor="end"
                fontFamily="Inter, Arial, sans-serif"
                fontWeight="500"
              >
                {toCurrencyBRL(entry.value)}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }

  // ── Horizontal: comparison mode (grouped horizontal mini-bars) ───────────
  if (comparisonData && comparisonData.categories.length > 0 && comparisonData.series.length > 0) {
    const { categories, series } = comparisonData;
    const maxVal   = Math.max(...series.flatMap((s) => s.values), 0);
    const seriesH  = series.length * (MINI_H + MINI_GAP) - MINI_GAP;
    const CAT_H    = 16 + seriesH + CAT_PAD;   // label-row + bars + bottom-pad
    const svgH     = LEGEND_H + categories.length * CAT_H;

    return (
      <svg
        viewBox={`0 0 ${svgWidth} ${svgH}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Legend */}
        {series.map((s, i) => (
          <g key={`leg-${s.label}`} transform={`translate(${LABEL_W + PAD + i * 110}, 0)`}>
            <rect x={0} y={4} width={10} height={10} fill={s.color} rx={2} />
            <text x={14} y={13} fontSize={10} fill={textSecondary} fontFamily="Inter, Arial, sans-serif">
              {s.label}
            </text>
          </g>
        ))}

        {/* Category rows */}
        {categories.map((cat, ci) => {
          const rowY = LEGEND_H + ci * CAT_H;
          return (
            <g key={`cat-${cat}`}>
              {ci % 2 === 0 && (
                <rect x={0} y={rowY} width={svgWidth} height={CAT_H} fill={rowBg} />
              )}
              {/* Category label */}
              <text
                x={LABEL_W - 4}
                y={rowY + 13}
                fontSize={11}
                fill={textSecondary}
                textAnchor="end"
                fontFamily="Inter, Arial, sans-serif"
              >
                {cat.length > 19 ? cat.slice(0, 18) + "…" : cat}
              </text>

              {/* Mini bars per series */}
              {series.map((s, si) => {
                const bw   = maxVal > 0 ? (s.values[ci] / maxVal) * BAR_W : 0;
                const barY = rowY + 16 + si * (MINI_H + MINI_GAP);
                return (
                  <g key={`bar-${s.label}`}>
                    {/* Track */}
                    <rect x={LABEL_W + PAD} y={barY} width={BAR_W} height={MINI_H} fill={barBg} rx={2} />
                    {/* Fill */}
                    {bw > 0 && (
                      <rect x={LABEL_W + PAD} y={barY} width={bw} height={MINI_H} fill={s.color} rx={2} opacity={0.85} />
                    )}
                    {/* Value */}
                    <text
                      x={svgWidth - PAD}
                      y={barY + MINI_H - 1}
                      fontSize={9}
                      fill={textPrimary}
                      textAnchor="end"
                      fontFamily="Inter, Arial, sans-serif"
                    >
                      {toCurrencyBRL(s.values[ci])}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  }

  return (
    <p
      style={{
        fontSize: 12,
        color: textSecondary,
        textAlign: "center",
        padding: "16px 0",
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      Nenhum dado para o período.
    </p>
  );
}
