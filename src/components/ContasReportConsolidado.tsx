import { forwardRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { toCurrencyBRL } from "../lib/formatters";
import type { Conta } from "../types/finance";
import { ContaTable } from "./ContasReport";

export interface UserContasBlock {
  name: string;
  contasPagar: Conta[];   // já filtradas pelo mês
  contasReceber: Conta[];
}

interface Props {
  users: UserContasBlock[];
  monthName: string;
  year: number;
  scope: "pagar" | "receber" | "ambas";
  generatedBy: string;
  periodLabel?: string;   // sobrescreve "Mês Ano" no cabeçalho
  statusLabel?: string;   // acrescenta ao subtítulo
}

const H = 32;

const S = {
  page: {
    position: "absolute", left: "-9999px", top: "0", width: "794px",
    backgroundColor: "#ffffff", color: "#1e293b",
    fontFamily: "Inter, Arial, sans-serif", fontSize: "12px", lineHeight: 1.5,
  } as React.CSSProperties,
  header: {
    padding: `28px ${H}px 16px`, borderBottom: "2px solid #e2e8f0",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  } as React.CSSProperties,
  footer: {
    padding: `14px ${H}px`, borderTop: "1px solid #e2e8f0", textAlign: "center" as const,
    fontSize: "10px", color: "#94a3b8", marginTop: "16px",
  } as React.CSSProperties,
};

export const ContasReportConsolidado = forwardRef<HTMLDivElement, Props>(function ContasReportConsolidado(
  { users, monthName, year, scope, generatedBy, periodLabel, statusLabel },
  ref,
) {
  const subtitleBase =
    scope === "pagar"   ? "Contas a Pagar · Todos os perfis" :
    scope === "receber" ? "Contas a Receber · Todos os perfis" :
    "Contas a Pagar e a Receber · Todos os perfis";
  const subtitle = statusLabel ? `${subtitleBase} · ${statusLabel}` : subtitleBase;

  const now = new Date();
  const todayStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const generatedAt =
    now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const showPagar   = scope === "ambas" || scope === "pagar";
  const showReceber = scope === "ambas" || scope === "receber";

  // Só entram usuários que têm alguma conta no escopo/mês
  const visibleUsers = users.filter((u) =>
    (showPagar && u.contasPagar.length > 0) || (showReceber && u.contasReceber.length > 0)
  );

  // Totais consolidados
  const totalPagar   = users.reduce((s, u) => s + u.contasPagar.reduce((a, c) => a + c.valor, 0), 0);
  const totalReceber = users.reduce((s, u) => s + u.contasReceber.reduce((a, c) => a + c.valor, 0), 0);

  const reportJSX = (
    <div ref={ref} id="contas-consolidado-report" style={S.page}>
      {/* Header */}
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
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Gerado por {generatedBy} em {generatedAt}</div>
        </div>
      </div>

      {/* Resumo consolidado */}
      <div data-pdf-block style={{ display: "flex", gap: 10, padding: `14px ${H}px 4px` }}>
        {showPagar && (
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, backgroundColor: "#fef2f2", borderLeft: "4px solid #ef4444" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Total a pagar · {users.length} {users.length === 1 ? "perfil" : "perfis"}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#ef4444", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{toCurrencyBRL(totalPagar)}</div>
          </div>
        )}
        {showReceber && (
          <div style={{ flex: 1, padding: "10px 14px", borderRadius: 8, backgroundColor: "#f0fdf4", borderLeft: "4px solid #10b981" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Total a receber · {users.length} {users.length === 1 ? "perfil" : "perfis"}</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#10b981", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{toCurrencyBRL(totalReceber)}</div>
          </div>
        )}
      </div>

      {/* Seções por usuário */}
      {visibleUsers.length === 0 ? (
        <p style={{ fontSize: 12, color: "#94a3b8", padding: `24px ${H}px` }}>
          Nenhuma conta neste mês em nenhum perfil.
        </p>
      ) : (
        visibleUsers.map((u, idx) => (
          <div key={u.name + idx} style={{ marginTop: idx === 0 ? 6 : 18 }}>
            {/* Cabeçalho do perfil */}
            <div data-pdf-block style={{
              margin: `0 ${H}px`, padding: "8px 14px", borderRadius: 8,
              backgroundColor: "#0f172a", color: "#ffffff",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.01em" }}>{u.name}</span>
              <span style={{ fontSize: 10, color: "#cbd5e1" }}>
                {showPagar && `${u.contasPagar.length} a pagar`}
                {showPagar && showReceber && " · "}
                {showReceber && `${u.contasReceber.length} a receber`}
              </span>
            </div>

            {showPagar && u.contasPagar.length > 0 && (
              <ContaTable title="Contas a Pagar" accentColor="#ef4444" contas={u.contasPagar} todayStr={todayStr} />
            )}
            {showReceber && u.contasReceber.length > 0 && (
              <ContaTable title="Contas a Receber" accentColor="#10b981" contas={u.contasReceber} todayStr={todayStr} />
            )}
          </div>
        ))
      )}

      {/* Footer */}
      <div style={S.footer}>
        {visibleUsers.length} {visibleUsers.length === 1 ? "perfil" : "perfis"} · Gerado por Financier · Fechamento de caixa inteligente
      </div>
    </div>
  );

  return createPortal(reportJSX, document.body);
});
