import { forwardRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { toCurrencyBRL } from "../lib/formatters";
import type { Conta } from "../types/finance";

interface Props {
  monthName: string;
  year: number;
  userName: string;
  contasPagar: Conta[];
  contasReceber: Conta[];
  scope: "pagar" | "receber" | "ambas";
  periodLabel?: string;   // sobrescreve "Mês Ano" no cabeçalho (ex: "20/07/2026")
  statusLabel?: string;   // acrescenta ao subtítulo (ex: "Em aberto")
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

  sectionTitle: {
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.09em",
    color: "#94a3b8",
    marginBottom: "10px",
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#94a3b8",
  padding: "6px 8px",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 11,
  color: "#334155",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function getReportStatus(conta: Conta, todayStr: string): { label: string; color: string; bg: string } {
  if (conta.status === "quitado") return { label: "Quitada", color: "#10b981", bg: "rgba(16,185,129,0.12)" };
  if (conta.vencimento < todayStr) return { label: "Vencida", color: "#ef4444", bg: "rgba(239,68,68,0.12)" };
  if (conta.vencimento === todayStr) return { label: "Pendente", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
  return { label: "A vencer", color: "#64748b", bg: "rgba(100,116,139,0.1)" };
}

// ─── Table section ────────────────────────────────────────────────────────────

// Sub-bloco: subheader + tabela de um grupo (A vencer / Quitadas)
function SubSection({
  label, rows, accentColor, todayStr, muted,
}: { label: string; rows: Conta[]; accentColor: string; todayStr: string; muted?: boolean }) {
  if (rows.length === 0) return null;
  const subtotal = rows.reduce((s, c) => s + c.valor, 0);

  return (
    <div style={{ marginTop: 10 }}>
      {/* Subheader */}
      <div data-pdf-block style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 0 5px", borderBottom: `1px solid ${muted ? "#e2e8f0" : "#cbd5e1"}`, marginBottom: 2,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: muted ? "#94a3b8" : "#475569" }}>
          {label} <span style={{ color: "#cbd5e1" }}>· {rows.length}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: muted ? "#94a3b8" : accentColor, fontVariantNumeric: "tabular-nums" }}>
          {toCurrencyBRL(subtotal)}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", opacity: muted ? 0.85 : 1 }}>
        <thead>
          <tr>
            <th style={thStyle}>Descrição</th>
            <th style={thStyle}>Categoria</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Vencimento</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
            <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const st = getReportStatus(c, todayStr);
            return (
              <tr key={c.id} data-pdf-block style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                <td style={{ ...tdStyle, fontWeight: 500, color: "#1e293b" }}>{c.descricao}</td>
                <td style={tdStyle}>{c.category ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{formatDate(c.vencimento)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {toCurrencyBRL(c.valor)}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <span style={{ display: "inline-block", lineHeight: 1, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 6, color: st.color, backgroundColor: st.bg }}>
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ContaTable({
  title, accentColor, contas, todayStr,
}: { title: string; accentColor: string; contas: Conta[]; todayStr: string }) {
  const abertas  = contas.filter((c) => c.status !== "quitado");
  const quitadas = contas.filter((c) => c.status === "quitado");
  const total    = contas.reduce((s, c) => s + c.valor, 0);

  const tint = accentColor === "#ef4444" ? "#fef2f2" : "#f0fdf4";
  return (
    <div style={{ padding: `14px ${H}px` }}>
      <div data-pdf-block style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 8, backgroundColor: tint,
        borderLeft: `4px solid ${accentColor}`, marginBottom: 12,
      }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: accentColor, letterSpacing: "-0.01em" }}>{title}</span>
      </div>
      {contas.length === 0 ? (
        <p style={{ fontSize: 11, color: "#94a3b8", padding: "4px 0 8px" }}>Nenhuma conta neste mês.</p>
      ) : (
        <>
          <SubSection label="A vencer / em aberto" rows={abertas}  accentColor={accentColor} todayStr={todayStr} />
          <SubSection label="Quitadas"             rows={quitadas} accentColor={accentColor} todayStr={todayStr} muted />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #e2e8f0", marginTop: 8, paddingTop: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>Total geral</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: accentColor, fontVariantNumeric: "tabular-nums" }}>
              {toCurrencyBRL(total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const ContasReport = forwardRef<HTMLDivElement, Props>(function ContasReport(
  { monthName, year, userName, contasPagar, contasReceber, scope, periodLabel, statusLabel },
  ref,
) {
  const subtitleBase =
    scope === "pagar"   ? "Relatório de Contas a Pagar" :
    scope === "receber" ? "Relatório de Contas a Receber" :
    "Relatório de Contas";
  const subtitle = statusLabel ? `${subtitleBase} · ${statusLabel}` : subtitleBase;
  const now = new Date();
  const todayStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const generatedAt =
    now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " +
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const reportJSX = (
    <div ref={ref} id="contas-print-report" style={S.page}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src={logo} alt="Financier" style={{ height: 36, width: 36, borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>Financier</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{periodLabel ?? `${monthName} ${year}`}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Gerado por {userName} em {generatedAt}</div>
        </div>
      </div>

      {/* ── Tabelas ─────────────────────────────────────────────────────── */}
      {(scope === "ambas" || scope === "pagar") && (
        <ContaTable title="Contas a Pagar"   accentColor="#ef4444" contas={contasPagar}   todayStr={todayStr} />
      )}
      {(scope === "ambas" || scope === "receber") && (
        <ContaTable title="Contas a Receber" accentColor="#10b981" contas={contasReceber} todayStr={todayStr} />
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={S.footer}>
        Gerado por Financier · Fechamento de caixa inteligente
      </div>

    </div>
  );

  return createPortal(reportJSX, document.body);
});
