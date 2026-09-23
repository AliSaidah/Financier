import { forwardRef } from "react";
import { createPortal } from "react-dom";
import logo from "../assets/logo.png";
import { toCurrencyBRL } from "../lib/formatters";

interface Bucket { label: string; receita: number; despesa: number; resultado: number; }

interface Props {
  scopeName: string;
  granLabel: string;       // "Mensal" | "Trimestral"
  bucketLabel: string;     // "Mês" | "Trimestre" (cabeçalho da tabela)
  periodLabel: string;     // "Jan/26 → Jul/26"
  generatedBy: string;
  aggs: Bucket[];
  totalResultado: number;
  totalReceita: number;
  totalDespesa: number;
  qtdLucro: number;
  qtdPrej: number;
  unitPlural: string;      // "meses" | "trimestres"
  totalCF: number;
  totalCV: number;
  topGastos: { category: string; total: number }[];
}

const H = 32;

function pct(part: number, base: number): string {
  return base > 0 ? `${((part / base) * 100).toFixed(1)}%` : "—";
}

const thStyle: React.CSSProperties = { textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", padding: "6px 10px", borderBottom: "1px solid #e2e8f0" };
const tdStyle: React.CSSProperties = { padding: "6px 10px", fontSize: 11, color: "#334155", fontVariantNumeric: "tabular-nums" };

export const EvolucaoReport = forwardRef<HTMLDivElement, Props>(function EvolucaoReport(
  { scopeName, granLabel, bucketLabel, periodLabel, generatedBy, aggs, totalResultado, totalReceita, totalDespesa, qtdLucro, qtdPrej, unitPlural, totalCF, totalCV, topGastos },
  ref,
) {
  const maxAbs = aggs.reduce((m, a) => Math.max(m, Math.abs(a.resultado)), 0);
  const isLucro = totalResultado >= 0;

  const now = new Date();
  const generatedAt =
    now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " + now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const page: React.CSSProperties = {
    position: "absolute", left: "-9999px", top: "0", width: "794px",
    backgroundColor: "#ffffff", color: "#1e293b",
    fontFamily: "Inter, Arial, sans-serif", fontSize: "12px", lineHeight: 1.5,
  };

  return createPortal(
    <div ref={ref} style={page}>
      {/* Header */}
      <div style={{ padding: `28px ${H}px 16px`, borderBottom: "2px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src={logo} alt="Financier" style={{ height: 36, width: 36, borderRadius: 8 }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 }}>Financier</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Análise de Resultado · {scopeName}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{periodLabel}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{granLabel} · Gerado por {generatedBy} em {generatedAt}</div>
        </div>
      </div>

      {/* Frase-resumo */}
      <div data-pdf-block style={{ padding: `16px ${H}px 4px` }}>
        <div style={{ padding: "12px 16px", borderRadius: 8, backgroundColor: isLucro ? "#f0fdf4" : "#fef2f2", borderLeft: `4px solid ${isLucro ? "#10b981" : "#ef4444"}` }}>
          <div style={{ fontSize: 13, color: "#334155" }}>
            No período, o resultado foi{" "}
            <b style={{ color: isLucro ? "#059669" : "#dc2626" }}>{isLucro ? "lucro" : "prejuízo"} de {toCurrencyBRL(Math.abs(totalResultado))}</b>
            {" "}— {qtdLucro} {unitPlural} no positivo, {qtdPrej} no negativo.
          </div>
        </div>
      </div>

      {/* Gráfico de colunas */}
      <div data-pdf-block style={{ padding: `12px ${H}px 4px` }}>
        <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>
          Evolução (verde = lucro · vermelho = prejuízo)
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
          {aggs.map((a) => {
            const lucro = a.resultado >= 0;
            const h = maxAbs > 0 ? Math.max(4, (Math.abs(a.resultado) / maxAbs) * 104) : 4;
            return (
              <div key={a.label} style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
                <div style={{ width: "70%", maxWidth: 28, height: h, borderRadius: "3px 3px 0 0", backgroundColor: lucro ? "#10b981" : "#ef4444" }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 5, paddingTop: 4, borderTop: "1px solid #e2e8f0" }}>
          {aggs.map((a) => (
            <span key={a.label} style={{ flex: 1, textAlign: "center", fontSize: 8, fontWeight: 600, color: "#475569", minWidth: 0 }}>{a.label}</span>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div data-pdf-block style={{ padding: `10px ${H}px 4px` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>{bucketLabel}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Entrou</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Saiu</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {aggs.map((a, i) => {
              const lucro = a.resultado >= 0;
              return (
                <tr key={a.label} data-pdf-block style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: "#1e293b" }}>{a.label}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#059669" }}>{toCurrencyBRL(a.receita)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "#dc2626" }}>{toCurrencyBRL(a.despesa)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: lucro ? "#059669" : "#dc2626" }}>{lucro ? "" : "−"}{toCurrencyBRL(Math.abs(a.resultado))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #e2e8f0" }}>
              <td style={{ ...tdStyle, fontWeight: 700, color: "#0f172a" }}>Total</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#059669" }}>{toCurrencyBRL(totalReceita)}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{toCurrencyBRL(totalDespesa)}</td>
              <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: isLucro ? "#059669" : "#dc2626" }}>{isLucro ? "" : "−"}{toCurrencyBRL(Math.abs(totalResultado))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* CF vs CV + maiores gastos */}
      <div data-pdf-block style={{ display: "flex", gap: 12, padding: `10px ${H}px 8px` }}>
        <div style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Custos fixos vs variáveis</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: "#ef4444" }}>Fixos (CF)</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{toCurrencyBRL(totalCF)} · {pct(totalCF, totalReceita)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ color: "#f97316" }}>Variáveis (CV)</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{toCurrencyBRL(totalCV)} · {pct(totalCV, totalReceita)}</span>
          </div>
          <div style={{ display: "flex", height: 8, overflow: "hidden", borderRadius: 999, backgroundColor: "#f1f5f9", marginTop: 8 }}>
            <div style={{ height: "100%", backgroundColor: "#ef4444", width: `${totalCF + totalCV > 0 ? (totalCF / (totalCF + totalCV)) * 100 : 0}%` }} />
            <div style={{ height: "100%", backgroundColor: "#f97316", width: `${totalCF + totalCV > 0 ? (totalCV / (totalCF + totalCV)) * 100 : 0}%` }} />
          </div>
        </div>
        <div style={{ flex: 1, padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 8 }}>Maiores gastos no período</div>
          {topGastos.length === 0 ? (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Nenhuma despesa.</div>
          ) : topGastos.map((g, i) => (
            <div key={g.category} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
              <span style={{ color: "#334155" }}>{i + 1}. {g.category}</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{toCurrencyBRL(g.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: `14px ${H}px`, borderTop: "1px solid #e2e8f0", textAlign: "center", fontSize: 10, color: "#94a3b8", marginTop: 8 }}>
        Gerado por Financier · Fechamento de caixa inteligente
      </div>
    </div>,
    document.body,
  );
});
