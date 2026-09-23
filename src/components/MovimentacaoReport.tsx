import { forwardRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { toCurrencyBRL } from "../lib/formatters";
import type { Transaction } from "../types/finance";

export type MovScope = "entradas" | "saidas" | "ambos";

interface Props {
  transactions: Transaction[]; // livro-caixa completo (já sem ignoradas)
  from: string;                // YYYY-MM-DD
  to: string;                  // YYYY-MM-DD
  scope: MovScope;
  userName: string;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

const H = 32;

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
  padding: "5px 8px",
  borderBottom: "1px solid #e2e8f0",
};

const tdStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 11,
  color: "#334155",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function parseLocal(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
}

function formatDateFull(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const wd = WEEKDAYS[parseLocal(iso).getDay()];
  return `${m[3]}/${m[2]}/${m[1]} · ${wd}`;
}

function formatDateShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ─── Bloco de transações (entradas ou saídas de um dia) ─────────────────────────

function MovTable({
  label, rows, accentColor, tint, sign,
}: { label: string; rows: Transaction[]; accentColor: string; tint: string; sign: "+" | "-" }) {
  if (rows.length === 0) return null;
  const subtotal = rows.reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div style={{ marginTop: 8 }}>
      <div data-pdf-block style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 10px", borderRadius: 6, backgroundColor: tint, marginBottom: 3,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: accentColor }}>
          {label} <span style={{ color: "#cbd5e1" }}>· {rows.length}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, fontVariantNumeric: "tabular-nums" }}>
          {sign} {toCurrencyBRL(subtotal)}
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Terceiro</th>
            <th style={thStyle}>Forma</th>
            <th style={thStyle}>Categoria</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={t.id} data-pdf-block style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
              <td style={{ ...tdStyle, fontWeight: 500, color: "#1e293b" }}>{t.thirdParty || "—"}</td>
              <td style={tdStyle}>{t.paymentMethod || "—"}</td>
              <td style={tdStyle}>{t.category && t.category !== "Sem categoria" ? t.category : "—"}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: accentColor }}>
                {sign} {toCurrencyBRL(Math.abs(t.amount))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Bloco de um dia ────────────────────────────────────────────────────────────

function DaySection({
  day, entradas, saidas, scope,
}: { day: string; entradas: Transaction[]; saidas: Transaction[]; scope: MovScope }) {
  const totalEnt = entradas.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalSai = saidas.reduce((s, t) => s + Math.abs(t.amount), 0);
  const saldo = totalEnt - totalSai;

  const showEnt = scope === "entradas" || scope === "ambos";
  const showSai = scope === "saidas" || scope === "ambos";

  return (
    <div style={{ padding: `12px ${H}px 4px`, borderBottom: "1px solid #f1f5f9" }}>
      {/* Cabeçalho do dia */}
      <div data-pdf-block style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 0 5px", borderBottom: "2px solid #e2e8f0", marginBottom: 4,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.01em" }}>
          {formatDateFull(day)}
        </span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>
          {entradas.length + saidas.length} {entradas.length + saidas.length === 1 ? "movimento" : "movimentos"}
        </span>
      </div>

      {showEnt && <MovTable label="Entradas" rows={entradas} accentColor="#10b981" tint="#f0fdf4" sign="+" />}
      {showSai && <MovTable label="Saídas"   rows={saidas}   accentColor="#ef4444" tint="#fef2f2" sign="-" />}

      {/* Totais do dia */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 24, padding: "7px 4px 8px", marginTop: 4 }}>
        {showEnt && (
          <span style={{ fontSize: 11, color: "#475569" }}>
            Entradas do dia:{" "}
            <span style={{ fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>{toCurrencyBRL(totalEnt)}</span>
          </span>
        )}
        {showSai && (
          <span style={{ fontSize: 11, color: "#475569" }}>
            Saídas do dia:{" "}
            <span style={{ fontWeight: 700, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{toCurrencyBRL(totalSai)}</span>
          </span>
        )}
        {scope === "ambos" && (
          <span style={{ fontSize: 11, color: "#475569" }}>
            Saldo do dia:{" "}
            <span style={{ fontWeight: 800, color: saldo >= 0 ? "#0f766e" : "#b91c1c", fontVariantNumeric: "tabular-nums" }}>
              {toCurrencyBRL(saldo)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────

export const MovimentacaoReport = forwardRef<HTMLDivElement, Props>(function MovimentacaoReport(
  { transactions, from, to, scope, userName },
  ref,
) {
  const subtitle =
    scope === "entradas" ? "Relatório de Movimentação · Entradas" :
    scope === "saidas"   ? "Relatório de Movimentação · Saídas" :
    "Relatório de Movimentação Diária";

  // Filtra pelo intervalo e agrupa por dia (datas YYYY-MM-DD comparam lexicograficamente)
  const inRange = transactions.filter((t) => t.date >= from && t.date <= to);
  const byDay = new Map<string, Transaction[]>();
  for (const t of inRange) {
    const arr = byDay.get(t.date);
    if (arr) arr.push(t);
    else byDay.set(t.date, [t]);
  }
  const days = Array.from(byDay.keys()).sort();

  // Totais gerais
  let grandEnt = 0, grandSai = 0;
  for (const t of inRange) {
    if (t.amount >= 0) grandEnt += t.amount;
    else grandSai += Math.abs(t.amount);
  }
  const grandSaldo = grandEnt - grandSai;

  const showEnt = scope === "entradas" || scope === "ambos";
  const showSai = scope === "saidas" || scope === "ambos";

  const now = new Date();
  const generatedAt =
    now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " +
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const reportJSX = (
    <div ref={ref} id="mov-print-report" style={S.page}>

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
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>
            {formatDateShort(from)} — {formatDateShort(to)}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Gerado por {userName} em {generatedAt}</div>
        </div>
      </div>

      {/* ── Resumo do período ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, padding: `14px ${H}px 0` }}>
        {showEnt && (
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, backgroundColor: "#f0fdf4", borderLeft: "4px solid #10b981" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Total entradas</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#10b981", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{toCurrencyBRL(grandEnt)}</div>
          </div>
        )}
        {showSai && (
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, backgroundColor: "#fef2f2", borderLeft: "4px solid #ef4444" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Total saídas</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#ef4444", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{toCurrencyBRL(grandSai)}</div>
          </div>
        )}
        {scope === "ambos" && (
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, backgroundColor: "#f8fafc", borderLeft: `4px solid ${grandSaldo >= 0 ? "#0f766e" : "#b91c1c"}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Saldo do período</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: grandSaldo >= 0 ? "#0f766e" : "#b91c1c", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{toCurrencyBRL(grandSaldo)}</div>
          </div>
        )}
      </div>

      {/* ── Dias ────────────────────────────────────────────────────────── */}
      {days.length === 0 ? (
        <p style={{ fontSize: 12, color: "#94a3b8", padding: `24px ${H}px` }}>
          Nenhuma movimentação encontrada neste intervalo.
        </p>
      ) : (
        days.map((day) => {
          const dayTx = byDay.get(day)!;
          const entradas = dayTx.filter((t) => t.amount >= 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
          const saidas   = dayTx.filter((t) => t.amount < 0).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
          return <DaySection key={day} day={day} entradas={entradas} saidas={saidas} scope={scope} />;
        })
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div style={S.footer}>
        {days.length} {days.length === 1 ? "dia" : "dias"} com movimentação · Gerado por Financier · Fechamento de caixa inteligente
      </div>

    </div>
  );

  return createPortal(reportJSX, document.body);
});
