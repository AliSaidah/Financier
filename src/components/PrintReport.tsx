import { forwardRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { toCurrencyBRL } from "../lib/formatters";
import { ReportBarChart, BarEntry, ComparisonData } from "./ReportBarChart";
import type { PeriodSummary } from "../utils/summaryCalculator";

interface Props {
  monthName: string;
  year: number;
  userName: string;
  periodFrom?: Date;
  periodTo?: Date;
  summary: PeriodSummary;
  numVendas: number;
  showTicketMedio: boolean;
  despesasEntries: BarEntry[];
  receitasEntries: BarEntry[];
  showComparison: boolean;
  despesasComparison?: ComparisonData;
  receitasComparison?: ComparisonData;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const H = 32; // horizontal padding

const S = {
  page: {
    position: "absolute",
    left: "-9999px",
    top: "0",
    width: "794px",
    backgroundColor: "#ffffff",
    color: "#1e293b",
    fontFamily: "Inter, Arial, sans-serif",
    fontSize: "12px",
    lineHeight: 1.5,
  } as React.CSSProperties,

  header: {
    padding: `28px ${H}px 16px`,
    borderBottom: "2px solid #e2e8f0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,

  sectionWrap: (bg = "#fff") => ({
    padding: `16px ${H}px 0`,
    backgroundColor: bg,
  } as React.CSSProperties),

  sectionTitle: {
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "-0.01em",
    color: "#0f172a",
    marginBottom: "10px",
    paddingBottom: "6px",
    borderBottom: "2px solid #e2e8f0",
  } as React.CSSProperties,

  footer: {
    padding: `14px ${H}px`,
    borderTop: "1px solid #e2e8f0",
    textAlign: "center" as const,
    fontSize: "10px",
    color: "#94a3b8",
    marginTop: "16px",
  } as React.CSSProperties,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(value: number, base: number): string {
  if (!base || !isFinite(value / base)) return "";
  return `${((value / base) * 100).toFixed(1)}%`;
}

// ─── Mini summary cards ───────────────────────────────────────────────────────

function DRECard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "17px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

// ─── KPI card (indicadores) ───────────────────────────────────────────────────

function KpiPrintCard({
  label, value, sub, color = "#0f172a",
}: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{
      backgroundColor: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      padding: "12px 14px",
    }}>
      <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", lineHeight: 1.4 }}>
        {sub}
      </div>
    </div>
  );
}

// ─── Cabeçalho colorido de seção (Despesas / Receitas) ────────────────────────

function ChartBandHeader({ label, sub, accent, tint }: { label: string; sub: string; accent: string; tint: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "8px 12px", borderRadius: "8px", backgroundColor: tint,
      borderLeft: `4px solid ${accent}`, marginBottom: "12px",
    }}>
      <span style={{ fontSize: "15px", fontWeight: 800, color: accent, letterSpacing: "-0.01em" }}>{label}</span>
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8" }}>{sub}</span>
    </div>
  );
}

// ─── DRE table row ────────────────────────────────────────────────────────────

function DRELine({
  label, value, pct, indent = false, isSubtotal = false, isResult = false, positive,
}: {
  label: string;
  value: number;
  pct?: string;
  indent?: boolean;
  isSubtotal?: boolean;
  isResult?: boolean;
  positive?: boolean;   // force color: undefined = auto by value sign
}) {
  const autoPositive = positive !== undefined ? positive : value >= 0;
  const valueColor = isResult || isSubtotal
    ? (autoPositive ? "#10b981" : "#ef4444")
    : (indent ? "#94a3b8" : "#475569");

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: isResult ? "9px 0 7px" : "5px 0",
      paddingLeft: indent ? 16 : 0,
      borderTop: (isSubtotal || isResult) ? "1px solid #e2e8f0" : undefined,
      marginTop: (isSubtotal || isResult) ? 2 : 0,
    }}>
      <span style={{
        fontSize: isResult ? 13 : 11,
        fontWeight: isResult ? 700 : isSubtotal ? 600 : 400,
        color: indent ? "#94a3b8" : "#475569",
      }}>
        {indent && <span style={{ marginRight: 6, opacity: 0.5 }}>−</span>}
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {pct && (
          <span style={{ fontSize: 10, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
            {pct}
          </span>
        )}
        <span style={{
          fontSize: isResult ? 13 : 11,
          fontWeight: isResult ? 700 : isSubtotal ? 600 : 400,
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
        }}>
          {indent ? `− ${toCurrencyBRL(value)}` : toCurrencyBRL(Math.abs(value))}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const PrintReport = forwardRef<HTMLDivElement, Props>(function PrintReport(
  {
    monthName, year, userName, periodFrom, periodTo, summary,
    numVendas, showTicketMedio,
    despesasEntries, receitasEntries,
    showComparison, despesasComparison, receitasComparison,
  },
  ref,
) {
  const { receitaTotal, custosFix, custosVar, margemContrib, resultadoEst } = summary;
  const isLucro = resultadoEst >= 0;

  // ── Indicadores (mesmo cálculo do IndicadoresCard da tela) ───────────────
  const margemLucro     = receitaTotal > 0 ? (resultadoEst / receitaTotal) * 100 : null;
  const mcRatio         = receitaTotal > 0 ? margemContrib / receitaTotal : 0;
  const mcPct           = receitaTotal > 0 ? `${(mcRatio * 100).toFixed(1)}%` : "—";
  const pontoEquilibrio = mcRatio > 0 ? custosFix / mcRatio : null;
  const peAtingido      = pontoEquilibrio !== null && receitaTotal >= pontoEquilibrio;
  const ticketMedio     = numVendas > 0 ? receitaTotal / numVendas : null;

  const now = new Date();
  const generatedAt =
    now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " +
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const fmtShortDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

  const periodLabel = periodFrom && periodTo
    ? `${fmtShortDate(periodFrom)} a ${fmtShortDate(periodTo)}`
    : null;

  const reportJSX = (
    <div ref={ref} id="financier-print-report" style={S.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src={logo} alt="Financier" style={{ height: 36, width: 36, borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>Financier</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Relatório Gerencial</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{monthName} {year}</div>
          {periodLabel && (
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Extrato de {periodLabel}</div>
          )}
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Gerado por {userName} em {generatedAt}</div>
        </div>
      </div>

      {/* ── Mini cards (visão rápida) ────────────────────────────────────── */}
      <div style={{ padding: `6px ${H}px 0`, backgroundColor: "#f8fafc" }}>
        <div style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "-0.01em", color: "#0f172a", paddingTop: "14px", marginBottom: "10px" }}>
          Resultado do Período
        </div>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
        gap: "12px", padding: `12px ${H}px 16px`,
        backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0",
      }}>
        <DRECard label="Total Recebido"     value={toCurrencyBRL(receitaTotal)}           color="#0f172a" />
        <DRECard label="Despesas Fixas"     value={toCurrencyBRL(custosFix)}              color="#ef4444" />
        <DRECard label="Despesas Variáveis" value={toCurrencyBRL(custosVar)}              color="#f97316" />
        <DRECard
          label={isLucro ? "Lucro" : "Prejuízo"}
          value={toCurrencyBRL(Math.abs(resultadoEst))}
          color={isLucro ? "#10b981" : "#ef4444"}
        />
      </div>

      {/* ── Resultado Estimado do Período ───────────────────────────────── */}
      <div data-pdf-block style={{ padding: `14px ${H}px 10px`, borderBottom: "1px solid #e2e8f0" }}>
        <div style={S.sectionTitle}>Resultado Estimado do Período</div>

        {/* Headline: resultado + margem de lucro */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <span style={{
            fontSize: "22px", fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: isLucro ? "#10b981" : "#ef4444",
          }}>
            {isLucro ? "" : "−"}{toCurrencyBRL(Math.abs(resultadoEst))}
          </span>
          {margemLucro !== null && (
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "3px 9px", borderRadius: "999px",
              color: isLucro ? "#059669" : "#dc2626",
              backgroundColor: isLucro ? "#d1fae5" : "#fee2e2",
            }}>
              {margemLucro.toFixed(1)}% de margem de lucro
            </span>
          )}
        </div>

        {/* Fluxo de cálculo */}
        <DRELine label="Receita Total" value={receitaTotal} />

        <DRELine
          label="Custos Variáveis"
          value={custosVar}
          pct={fmtPct(custosVar, receitaTotal)}
          indent
        />
        <DRELine
          label="Margem de Contribuição"
          value={margemContrib}
          pct={fmtPct(margemContrib, receitaTotal)}
          isSubtotal
        />

        <DRELine
          label="Custos Fixos"
          value={custosFix}
          pct={fmtPct(custosFix, receitaTotal)}
          indent
        />
        <DRELine
          label={isLucro ? "Resultado Estimado — Lucro" : "Resultado Estimado — Prejuízo"}
          value={resultadoEst}
          pct={fmtPct(resultadoEst, receitaTotal)}
          isResult
        />
      </div>

      {/* ── Indicadores ─────────────────────────────────────────────────── */}
      <div data-pdf-block style={{ padding: `14px ${H}px 16px`, borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
        <div style={S.sectionTitle}>Indicadores</div>
        <div style={{ display: "grid", gridTemplateColumns: showTicketMedio ? "1fr 1fr 1fr" : "1fr 1fr", gap: "12px" }}>
          <KpiPrintCard
            label="Margem de Contribuição"
            value={mcPct}
            sub={receitaTotal > 0
              ? `${toCurrencyBRL(margemContrib)} sobram para cobrir os custos fixos`
              : "Sem receita no período"}
            color={margemContrib >= 0 ? "#0f172a" : "#ef4444"}
          />
          <KpiPrintCard
            label="Ponto de Equilíbrio"
            value={pontoEquilibrio !== null ? toCurrencyBRL(pontoEquilibrio) : "—"}
            sub={
              pontoEquilibrio === null
                ? "Margem insuficiente para calcular"
                : peAtingido
                ? "Atingido — a receita já cobre todos os custos"
                : `Faltam ${toCurrencyBRL(pontoEquilibrio - receitaTotal)} de receita para empatar`
            }
            color={pontoEquilibrio === null ? "#94a3b8" : peAtingido ? "#10b981" : "#d97706"}
          />
          {showTicketMedio && (
            <KpiPrintCard
              label="Ticket Médio"
              value={ticketMedio !== null ? toCurrencyBRL(ticketMedio) : "—"}
              sub={numVendas > 0
                ? `${numVendas} ${numVendas === 1 ? "recebimento" : "recebimentos"} no período`
                : "Nenhum recebimento no período"}
            />
          )}
        </div>
      </div>

      {/* ── Gráfico Despesas ────────────────────────────────────────────── */}
      <div data-pdf-block style={{ ...S.sectionWrap(), paddingTop: "18px" }}>
        <ChartBandHeader label="Despesas" sub={`por categoria${showComparison ? " — comparativo" : ""}`} accent="#ef4444" tint="#fef2f2" />
        <ReportBarChart
          entries={showComparison ? undefined : despesasEntries}
          comparisonData={showComparison ? despesasComparison : undefined}
          theme="light"
          svgWidth={730}
          orientation="vertical"
          color="#ef4444"
        />
      </div>

      {/* ── Gráfico Receitas ────────────────────────────────────────────── */}
      <div data-pdf-block style={{ ...S.sectionWrap(), marginTop: 18 }}>
        <ChartBandHeader label="Receitas" sub={`por categoria${showComparison ? " — comparativo" : ""}`} accent="#10b981" tint="#f0fdf4" />
        <ReportBarChart
          entries={showComparison ? undefined : receitasEntries}
          comparisonData={showComparison ? receitasComparison : undefined}
          theme="light"
          svgWidth={730}
          orientation="vertical"
          color="#10b981"
        />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={S.footer}>
        Gerado por Financier · Fechamento de caixa inteligente
      </div>

    </div>
  );

  return createPortal(reportJSX, document.body);
});
