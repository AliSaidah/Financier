import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, X, FileDown } from "lucide-react";
import { useFinancierStore } from "../store/useFinancierStore";
import { calculateSummary } from "../utils/summaryCalculator";
import { toCurrencyBRL } from "../lib/formatters";
import { Transaction } from "../types/finance";
import { CategoryBadge } from "../components/CategoryBadge";
import { EvolucaoReport } from "../components/EvolucaoReport";
import { generatePdfFromElement } from "../utils/pdfFromElement";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function quarterOf(mk: string): string {
  const [y, mo] = mk.split("-");
  return `${y}-Q${Math.floor((+mo - 1) / 3) + 1}`;
}
function bucketKeyOf(dateRaw: string, gran: "mensal" | "trimestral"): string {
  const mk = dateRaw.match(/^(\d{4})-(\d{2})/) ? dateRaw.slice(0, 7) : "0000-00";
  return gran === "mensal" ? mk : quarterOf(mk);
}
function bucketLabel(key: string, gran: "mensal" | "trimestral"): string {
  if (gran === "mensal") {
    const [y, mo] = key.split("-");
    return `${MONTH_ABBR[(+mo) - 1] ?? mo}/${y.slice(2)}`;
  }
  const [y, q] = key.split("-Q");
  return `${q}º tri/${y.slice(2)}`;
}

function parseDateLocal(raw: string): Date {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(raw);
}
function monthKey(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "0000-00";
}
function monthLabel(key: string): string {
  const [y, mo] = key.split("-");
  const idx = (+mo) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${y}` : key;
}
function formatDate(raw: string): string {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
}
function pct(part: number, base: number): string {
  return base > 0 ? `${((part / base) * 100).toFixed(1)}%` : "—";
}

interface TaggedTx { tx: Transaction; userId: string; userName: string; }

interface UserSummary {
  id: string; name: string;
  receita: number; despesa: number; resultado: number;
  custosFix: number; custosVar: number; margemContrib: number;
  count: number; saldoTotal: number;
  despesasLiquidas: Transaction[]; receitasLiquidas: Transaction[];
}

interface CatRow { category: string; categoryId?: string; total: number; count: number; }

function buildCategoryRank(txs: Transaction[], limit = 8): CatRow[] {
  const map = new Map<string, { total: number; count: number; name: string; id?: string }>();
  for (const tx of txs) {
    const id = tx.categoryId;
    const name = tx.category || "Sem categoria";
    const key = id ?? name;
    const prev = map.get(key) ?? { total: 0, count: 0, name, id };
    map.set(key, { total: prev.total + Math.abs(tx.amount), count: prev.count + 1, name: prev.name, id: prev.id });
  }
  return Array.from(map.values())
    .map((d) => ({ category: d.name, categoryId: d.id, total: d.total, count: d.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// ─── Linha do mini-DRE ────────────────────────────────────────────────────────

function DRELine({ label, value, hint, deduction, result }: {
  label: string; value: number; hint?: string; deduction?: boolean; result?: boolean;
}) {
  const color = result ? (value >= 0 ? "text-emerald-400" : "text-red-400") : deduction ? "text-slate-400" : "text-slate-200";
  return (
    <div className={`flex items-center justify-between py-2 ${result ? "border-t border-white/[0.08] mt-1 pt-3" : ""}`}>
      <span className={`flex items-center gap-2 ${result ? "text-sm font-bold text-white" : "text-sm text-slate-300"}`}>
        {deduction && <span className="text-red-400/60">−</span>}
        {label}
        {hint && <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">{hint}</span>}
      </span>
      <span className={`tabular-nums ${result ? "text-lg font-bold" : "text-sm font-medium"} ${color}`}>
        {deduction ? "− " : ""}{toCurrencyBRL(Math.abs(value))}
      </span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function CategoryRank({ title, rows, accentBar, onClickCategory }: {
  title: string; rows: CatRow[]; accentBar: string; onClickCategory: (r: CatRow) => void;
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.total), 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
      <div className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-600">Nenhuma transação no período.</p>
      ) : (
        <div className="space-y-1.5 px-5 py-3">
          {rows.map((r) => {
            const w = max > 0 ? (r.total / max) * 100 : 0;
            return (
              <button key={r.categoryId ?? r.category} onClick={() => onClickCategory(r)}
                className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1 transition hover:bg-white/[0.04]">
                <div className="flex w-40 shrink-0 justify-end"><CategoryBadge category={r.category} /></div>
                <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.05]">
                  <div className={`h-full rounded-md ${accentBar} opacity-80`} style={{ width: `${w.toFixed(1)}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-100">{toCurrencyBRL(r.total)}</span>
              </button>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-xs font-semibold text-slate-500">Total (top {rows.length})</span>
          <span className="tabular-nums text-sm font-bold text-white">{toCurrencyBRL(total)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Evolução do resultado (lucro × prejuízo por período) ──────────────────────

interface EvolProps {
  allData: { id: string; name: string; transactions: Transaction[]; fixedCategoryIds: string[]; excludedCategoryIds: string[] }[];
  selectedUser: string | null;
  scopeName: string;
  availableMonths: string[];
  generatedBy: string;
}

function EvolucaoResultado({ allData, selectedUser, scopeName, availableMonths, generatedBy }: EvolProps) {
  const [gran, setGran] = useState<"mensal" | "trimestral">("mensal");
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (availableMonths.length === 0) return;
    setFrom((p) => (p && availableMonths.includes(p) ? p : availableMonths[0]));
    setTo((p) => (p && availableMonths.includes(p) ? p : availableMonths[availableMonths.length - 1]));
  }, [availableMonths]);

  const aggs = useMemo(() => {
    const scopeUsers = selectedUser ? allData.filter((u) => u.id === selectedUser) : allData;
    const bucketMap = new Map<string, Map<string, { receb: Transaction[]; pag: Transaction[] }>>();
    for (const u of scopeUsers) {
      for (const tx of u.transactions) {
        if (tx.ignored) continue;
        const mk = tx.date.slice(0, 7);
        if (from && mk < from) continue;
        if (to && mk > to) continue;
        const key = bucketKeyOf(tx.date, gran);
        let byUser = bucketMap.get(key);
        if (!byUser) { byUser = new Map(); bucketMap.set(key, byUser); }
        let slot = byUser.get(u.id);
        if (!slot) { slot = { receb: [], pag: [] }; byUser.set(u.id, slot); }
        (tx.amount >= 0 ? slot.receb : slot.pag).push(tx);
      }
    }
    return Array.from(bucketMap.keys()).sort().map((key) => {
      let resultado = 0, cf = 0, cv = 0, receita = 0, despesa = 0;
      const despesas: Transaction[] = [];
      for (const [uid, slot] of bucketMap.get(key)!) {
        const u = allData.find((x) => x.id === uid)!;
        const s = calculateSummary(slot.receb, slot.pag, u.fixedCategoryIds, u.excludedCategoryIds);
        resultado += s.resultadoEst; cf += s.custosFix; cv += s.custosVar;
        receita += s.receitaTotal; despesa += s.despesaTotal;
        despesas.push(...s.despesasLiquidas);
      }
      return { key, label: bucketLabel(key, gran), resultado, receita, despesa, cf, cv, despesas };
    });
  }, [allData, selectedUser, gran, from, to]);

  const maxAbs         = aggs.reduce((m, a) => Math.max(m, Math.abs(a.resultado)), 0);
  const totalResultado = aggs.reduce((s, a) => s + a.resultado, 0);
  const totalReceita   = aggs.reduce((s, a) => s + a.receita, 0);
  const totalDespesa   = aggs.reduce((s, a) => s + a.despesa, 0);
  const totalCF        = aggs.reduce((s, a) => s + a.cf, 0);
  const totalCV        = aggs.reduce((s, a) => s + a.cv, 0);
  const mesesLucro     = aggs.filter((a) => a.resultado >= 0).length;
  const mesesPrej      = aggs.length - mesesLucro;
  const topGastos      = buildCategoryRank(aggs.flatMap((a) => a.despesas), 5);
  const isLucro        = totalResultado >= 0;
  const unitSingular   = gran === "mensal" ? "mês" : "trimestre";
  const unitPlural     = gran === "mensal" ? "meses" : "trimestres";
  const melhor         = aggs.reduce<typeof aggs[number] | null>((b, a) => (!b || a.resultado > b.resultado ? a : b), null);
  const pior           = aggs.reduce<typeof aggs[number] | null>((w, a) => (!w || a.resultado < w.resultado ? a : w), null);

  const periodLabel = from && to
    ? (from === to ? monthLabel(from) : `${monthLabel(from)} → ${monthLabel(to)}`)
    : "período";

  async function handlePdf() {
    if (pdfLoading || aggs.length === 0) return;
    setPdfLoading(true);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const el = reportRef.current;
      if (!el) return;
      const scopeSlug = scopeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await generatePdfFromElement(el, `analise-resultado-${scopeSlug || "geral"}-${from}_a_${to}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF de resultado:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
      {/* Cabeçalho + controles */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Evolução do resultado · {scopeName}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePdf}
            disabled={pdfLoading || aggs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileDown size={12} />
            {pdfLoading ? "Gerando…" : "PDF"}
          </button>
          <div className="flex rounded-lg border border-white/[0.08] bg-slate-800/60 p-0.5">
            {(["mensal", "trimestral"] as const).map((g) => (
              <button key={g} onClick={() => setGran(g)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${gran === g ? "bg-accentPositive/15 text-accentPositive" : "text-slate-500 hover:text-slate-300"}`}>
                {g === "mensal" ? "Mensal" : "Trimestral"}
              </button>
            ))}
          </div>
          {availableMonths.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-2 py-1">
              <select value={from} onChange={(e) => { const v = e.target.value; setFrom(v); if (to && v > to) setTo(v); }}
                className="rounded-md bg-transparent text-[11px] font-medium text-slate-300 outline-none [color-scheme:dark]">
                {availableMonths.map((m) => <option key={m} value={m} className="bg-slate-900">{monthLabel(m)}</option>)}
              </select>
              <span className="text-[11px] text-slate-500">até</span>
              <select value={to} onChange={(e) => { const v = e.target.value; setTo(v); if (from && v < from) setFrom(v); }}
                className="rounded-md bg-transparent text-[11px] font-medium text-slate-300 outline-none [color-scheme:dark]">
                {availableMonths.map((m) => <option key={m} value={m} className="bg-slate-900">{monthLabel(m)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {aggs.length === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-slate-600">Nenhum dado no período selecionado.</p>
      ) : (
        <>
          {/* Frase-resumo em português claro */}
          <div className="px-5 pt-4">
            <p className="text-sm leading-relaxed text-slate-300">
              No período, o resultado foi{" "}
              <span className={`font-bold ${isLucro ? "text-emerald-400" : "text-red-400"}`}>
                {isLucro ? "lucro" : "prejuízo"} de {toCurrencyBRL(Math.abs(totalResultado))}
              </span>{" "}
              — <span className="font-semibold text-emerald-400/90">{mesesLucro}</span> {mesesLucro === 1 ? unitSingular : unitPlural} no positivo,{" "}
              <span className="font-semibold text-red-400/90">{mesesPrej}</span> no negativo.
              {aggs.length > 1 && melhor && pior && (
                <> Melhor: <span className="font-medium text-slate-200">{melhor.label}</span> ({melhor.resultado >= 0 ? "+" : "−"}{toCurrencyBRL(Math.abs(melhor.resultado))}) · Pior: <span className="font-medium text-slate-200">{pior.label}</span> ({pior.resultado >= 0 ? "+" : "−"}{toCurrencyBRL(Math.abs(pior.resultado))}).</>
              )}
            </p>
          </div>

          {/* Gráfico de colunas (verde = lucro, vermelho = prejuízo) */}
          <div className="overflow-x-auto px-5 pt-4">
            <div style={{ minWidth: aggs.length * 46 }}>
              <div className="flex items-end gap-2" style={{ height: 120 }}>
                {aggs.map((a) => {
                  const lucro = a.resultado >= 0;
                  const h = maxAbs > 0 ? Math.max(4, (Math.abs(a.resultado) / maxAbs) * 116) : 4;
                  return (
                    <div key={a.key} className="flex flex-1 justify-center" style={{ minWidth: 38 }}
                      title={`${a.label}: ${lucro ? "" : "−"}${toCurrencyBRL(Math.abs(a.resultado))}`}>
                      <div className={`w-full max-w-[30px] rounded-t ${lucro ? "bg-emerald-500" : "bg-red-500"} opacity-85`} style={{ height: h }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex gap-2 border-t border-white/[0.06] pt-1.5">
                {aggs.map((a) => (
                  <span key={a.key} className="flex-1 text-center text-[10px] font-medium text-slate-400" style={{ minWidth: 38 }}>{a.label}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Tabela: Período · Entrou · Saiu · Resultado */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2 font-semibold">{gran === "mensal" ? "Mês" : "Trimestre"}</th>
                  <th className="px-5 py-2 text-right font-semibold">Entrou</th>
                  <th className="px-5 py-2 text-right font-semibold">Saiu</th>
                  <th className="px-5 py-2 text-right font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {aggs.map((a) => {
                  const lucro = a.resultado >= 0;
                  return (
                    <tr key={a.key} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-2 font-medium text-slate-200">{a.label}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-emerald-400/90">{toCurrencyBRL(a.receita)}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-red-400/90">{toCurrencyBRL(a.despesa)}</td>
                      <td className={`px-5 py-2 text-right font-bold tabular-nums ${lucro ? "text-emerald-400" : "text-red-400"}`}>
                        {lucro ? "" : "−"}{toCurrencyBRL(Math.abs(a.resultado))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-white/[0.08] bg-slate-800/40">
                <tr>
                  <td className="px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-300">Total</td>
                  <td className="px-5 py-2.5 text-right font-bold tabular-nums text-emerald-400">{toCurrencyBRL(totalReceita)}</td>
                  <td className="px-5 py-2.5 text-right font-bold tabular-nums text-red-400">{toCurrencyBRL(totalDespesa)}</td>
                  <td className={`px-5 py-2.5 text-right font-bold tabular-nums ${isLucro ? "text-emerald-400" : "text-red-400"}`}>
                    {isLucro ? "" : "−"}{toCurrencyBRL(Math.abs(totalResultado))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* CF vs CV + maiores gastos */}
          <div className="grid grid-cols-1 gap-px border-t border-white/[0.06] bg-white/[0.06] sm:grid-cols-2">
            <div className="bg-bgSecondary px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Custos fixos vs variáveis</p>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400/80">Fixos (CF)</span>
                  <span className="tabular-nums font-semibold text-slate-200">{toCurrencyBRL(totalCF)} <span className="text-slate-600">· {pct(totalCF, totalReceita)}</span></span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-orange-400/80">Variáveis (CV)</span>
                  <span className="tabular-nums font-semibold text-slate-200">{toCurrencyBRL(totalCV)} <span className="text-slate-600">· {pct(totalCV, totalReceita)}</span></span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full bg-red-500/70" style={{ width: `${totalCF + totalCV > 0 ? (totalCF / (totalCF + totalCV)) * 100 : 0}%` }} />
                  <div className="h-full bg-orange-500/70" style={{ width: `${totalCF + totalCV > 0 ? (totalCV / (totalCF + totalCV)) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
            <div className="bg-bgSecondary px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Maiores gastos no período</p>
              {topGastos.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">Nenhuma despesa.</p>
              ) : (
                <div className="mt-2 space-y-1">
                  {topGastos.map((g, i) => (
                    <div key={g.categoryId ?? g.category} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="w-3 shrink-0 text-right text-[10px] text-slate-600">{i + 1}</span>
                        <span className="truncate text-slate-300">{g.category}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-slate-200">{toCurrencyBRL(g.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Relatório PDF (off-screen) */}
      {aggs.length > 0 && (
        <EvolucaoReport
          ref={reportRef}
          scopeName={scopeName}
          granLabel={gran === "mensal" ? "Mensal" : "Trimestral"}
          periodLabel={periodLabel}
          generatedBy={generatedBy}
          bucketLabel={gran === "mensal" ? "Mês" : "Trimestre"}
          aggs={aggs.map((a) => ({ label: a.label, receita: a.receita, despesa: a.despesa, resultado: a.resultado }))}
          totalResultado={totalResultado}
          totalReceita={totalReceita}
          totalDespesa={totalDespesa}
          qtdLucro={mesesLucro}
          qtdPrej={mesesPrej}
          unitPlural={unitPlural}
          totalCF={totalCF}
          totalCV={totalCV}
          topGastos={topGastos.map((g) => ({ category: g.category, total: g.total }))}
        />
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Drill { title: string; accent: string; rows: TaggedTx[]; }

export function PainelPage() {
  const users              = useFinancierStore((s) => s.users);
  const activeUserId       = useFinancierStore((s) => s.activeUserId);
  const activeTransactions = useFinancierStore((s) => s.transactions);
  const getAllUsersData    = useFinancierStore((s) => s.getAllUsersData);

  const [mode, setMode]   = useState<"mes" | "periodo">("mes");
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo,   setPeriodTo]   = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null); // null = Todos
  const [drill, setDrill] = useState<Drill | null>(null);
  const [drillUser, setDrillUser] = useState<string | null>(null); // filtro de loja no modal

  function prevMonth() { if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  const allData = useMemo(
    () => getAllUsersData(),
    [users, activeUserId, activeTransactions, getAllUsersData],
  );

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const u of allData) for (const tx of u.transactions) if (!tx.ignored) set.add(monthKey(tx.date));
    return Array.from(set).sort();
  }, [allData]);

  useEffect(() => {
    if (availableMonths.length === 0) return;
    const first = availableMonths[0];
    const last  = availableMonths[availableMonths.length - 1];
    setPeriodFrom((p) => (p && availableMonths.includes(p) ? p : first));
    setPeriodTo((p) => (p && availableMonths.includes(p) ? p : last));
  }, [availableMonths]);

  const built = useMemo(() => {
    const inPeriod = (tx: Transaction) => {
      if (tx.ignored) return false;
      if (mode === "periodo") {
        if (!periodFrom || !periodTo) return true;
        const k = monthKey(tx.date);
        return k >= periodFrom && k <= periodTo;
      }
      const d = parseDateLocal(tx.date);
      return d.getMonth() === month && d.getFullYear() === year;
    };
    const userSummaries: UserSummary[] = [];
    const despTagged: TaggedTx[] = [];
    const recTagged: TaggedTx[] = [];
    const cfTagged: TaggedTx[] = [];
    const cvTagged: TaggedTx[] = [];

    for (const u of allData) {
      const fixedSet = new Set(u.fixedCategoryIds);
      const txs   = u.transactions.filter(inPeriod);
      const receb = txs.filter((t) => t.amount >= 0);
      const pag   = txs.filter((t) => t.amount < 0);
      const s = calculateSummary(receb, pag, u.fixedCategoryIds, u.excludedCategoryIds);
      const saldoTotal = u.transactions.reduce((a, t) => (t.ignored ? a : a + t.amount), 0);
      userSummaries.push({
        id: u.id, name: u.name,
        receita: s.receitaTotal, despesa: s.despesaTotal, resultado: s.resultadoEst,
        custosFix: s.custosFix, custosVar: s.custosVar, margemContrib: s.margemContrib,
        count: txs.length, saldoTotal,
        despesasLiquidas: s.despesasLiquidas, receitasLiquidas: s.receitasLiquidas,
      });
      for (const tx of s.despesasLiquidas) {
        despTagged.push({ tx, userId: u.id, userName: u.name });
        const isCF = tx.category && tx.category !== "Sem categoria" && fixedSet.has(tx.categoryId ?? tx.category);
        (isCF ? cfTagged : cvTagged).push({ tx, userId: u.id, userName: u.name });
      }
      for (const tx of s.receitasLiquidas) recTagged.push({ tx, userId: u.id, userName: u.name });
    }
    userSummaries.sort((a, b) => b.resultado - a.resultado);
    return { userSummaries, despTagged, recTagged, cfTagged, cvTagged };
  }, [allData, mode, month, year, periodFrom, periodTo]);

  const { userSummaries, despTagged, recTagged, cfTagged, cvTagged } = built;

  // ── Escopo: uma loja específica ou todas ──────────────────────────────────
  const inScope = (t: TaggedTx) => !selectedUser || t.userId === selectedUser;
  const scopeSummaries = selectedUser ? userSummaries.filter((s) => s.id === selectedUser) : userSummaries;

  const sc = {
    receita:   scopeSummaries.reduce((a, s) => a + s.receita, 0),
    despesa:   scopeSummaries.reduce((a, s) => a + s.despesa, 0),
    resultado: scopeSummaries.reduce((a, s) => a + s.resultado, 0),
    custosFix: scopeSummaries.reduce((a, s) => a + s.custosFix, 0),
    custosVar: scopeSummaries.reduce((a, s) => a + s.custosVar, 0),
    saldo:     scopeSummaries.reduce((a, s) => a + s.saldoTotal, 0),
  };
  const margemContrib = sc.receita - sc.custosVar;
  const isLucro = sc.resultado >= 0;
  const scopeName = selectedUser ? (scopeSummaries[0]?.name ?? "") : "Todos os usuários";

  const despScoped = useMemo(() => despTagged.filter(inScope), [despTagged, selectedUser]);
  const recScoped  = useMemo(() => recTagged.filter(inScope),  [recTagged, selectedUser]);
  const cfScoped   = useMemo(() => cfTagged.filter(inScope),   [cfTagged, selectedUser]);
  const cvScoped   = useMemo(() => cvTagged.filter(inScope),   [cvTagged, selectedUser]);

  const despesaRank = useMemo(() => buildCategoryRank(despScoped.map((t) => t.tx)), [despScoped]);
  const receitaRank = useMemo(() => buildCategoryRank(recScoped.map((t) => t.tx)), [recScoped]);

  const maxResultadoAbs = userSummaries.reduce((m, s) => Math.max(m, Math.abs(s.resultado)), 0);

  function openDrill(title: string, accent: string, rows: TaggedTx[]) {
    setDrillUser(null);
    setDrill({ title, accent, rows });
  }
  function openCategory(r: CatRow, source: TaggedTx[], accent: string) {
    const rows = source.filter((t) =>
      r.categoryId && t.tx.categoryId ? t.tx.categoryId === r.categoryId : (t.tx.category || "Sem categoria") === r.category
    );
    openDrill(r.category, accent, rows);
  }

  const periodText = mode === "mes"
    ? `${MONTH_NAMES[month]} ${year}`
    : periodFrom && periodTo
    ? (periodFrom === periodTo ? monthLabel(periodFrom) : `${monthLabel(periodFrom)} → ${monthLabel(periodTo)}`)
    : "período";

  return (
    <div className="pb-10">
      {/* ── Header: título + período ─────────────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accentPositive/10 text-accentPositive ring-1 ring-accentPositive/20">
            <Layers size={17} />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-white">Painel Gerencial</h2>
            <p className="text-xs text-slate-500">{scopeName} · {periodText}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-white/[0.08] bg-slate-800/60 p-1">
            {(["mes", "periodo"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${mode === m ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25" : "text-slate-500 hover:text-slate-300"}`}>
                {m === "mes" ? "Por mês" : "Por período"}
              </button>
            ))}
          </div>
          {mode === "mes" ? (
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-slate-800/60 px-1 py-1">
              <button onClick={prevMonth} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"><ChevronLeft size={14} /></button>
              <span className="min-w-[120px] text-center text-sm font-medium text-slate-300">{MONTH_NAMES[month]} {year}</span>
              <button onClick={nextMonth} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"><ChevronRight size={14} /></button>
            </div>
          ) : availableMonths.length === 0 ? (
            <span className="text-xs text-slate-600">Nenhum extrato carregado</span>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-slate-800/60 px-2 py-1.5">
              <select value={periodFrom}
                onChange={(e) => { const v = e.target.value; setPeriodFrom(v); if (periodTo && v > periodTo) setPeriodTo(v); }}
                className="rounded-md bg-transparent text-xs font-medium text-slate-300 outline-none [color-scheme:dark]">
                {availableMonths.map((m) => <option key={m} value={m} className="bg-slate-900">{monthLabel(m)}</option>)}
              </select>
              <span className="text-xs text-slate-500">até</span>
              <select value={periodTo}
                onChange={(e) => { const v = e.target.value; setPeriodTo(v); if (periodFrom && v < periodFrom) setPeriodFrom(v); }}
                className="rounded-md bg-transparent text-xs font-medium text-slate-300 outline-none [color-scheme:dark]">
                {availableMonths.map((m) => <option key={m} value={m} className="bg-slate-900">{monthLabel(m)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Seletor de lojas (cards com resultado) ───────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {/* Card "Todos" */}
        <button
          onClick={() => setSelectedUser(null)}
          className={`rounded-xl p-4 text-left ring-1 transition ${
            selectedUser === null
              ? "bg-accentPositive/[0.08] ring-accentPositive/40 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
              : "bg-bgSecondary ring-white/[0.07] hover:ring-white/[0.15]"
          }`}
        >
          <p className="text-xs font-semibold text-slate-300">Todos</p>
          <p className={`mt-1.5 text-lg font-bold tabular-nums ${userSummaries.reduce((a, s) => a + s.resultado, 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {toCurrencyBRL(userSummaries.reduce((a, s) => a + s.resultado, 0))}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-600">{userSummaries.length} lojas consolidadas</p>
        </button>

        {userSummaries.map((s) => {
          const active = selectedUser === s.id;
          const lucro = s.resultado >= 0;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedUser(active ? null : s.id)}
              className={`rounded-xl p-4 text-left ring-1 transition ${
                active
                  ? "bg-accentPositive/[0.08] ring-accentPositive/40 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                  : "bg-bgSecondary ring-white/[0.07] hover:ring-white/[0.15]"
              }`}
            >
              <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-300">
                {s.name}
                {s.id === activeUserId && <span className="rounded bg-accentPositive/15 px-1 py-0.5 text-[8px] font-bold uppercase text-accentPositive">ativo</span>}
              </p>
              <p className={`mt-1.5 text-lg font-bold tabular-nums ${lucro ? "text-emerald-400" : "text-red-400"}`}>
                {lucro ? "" : "−"}{toCurrencyBRL(Math.abs(s.resultado))}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">{lucro ? "lucro" : "prejuízo"} · {pct(s.resultado, s.receita)} da receita</p>
            </button>
          );
        })}
      </div>

      {/* ── Mini-DRE do escopo ───────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Mini-cards */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <MiniStat label="Saldo" value={toCurrencyBRL(sc.saldo)} color={sc.saldo >= 0 ? "text-sky-300" : "text-red-400"} />
          <MiniStat label="Entradas" value={toCurrencyBRL(sc.receita)} color="text-emerald-400" />
          <MiniStat label="Saídas" value={toCurrencyBRL(sc.despesa)} color="text-red-400" />
        </div>
        {/* DRE */}
        <div className="rounded-xl bg-bgSecondary px-5 py-4 ring-1 ring-white/[0.07] lg:col-span-3">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Demonstrativo · {scopeName}</h3>
            <div className="flex gap-1.5">
              <button onClick={() => openDrill("Despesas Fixas (CF)", "#ef4444", cfScoped)}
                className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/20">CF ▸</button>
              <button onClick={() => openDrill("Despesas Variáveis (CV)", "#f97316", cvScoped)}
                className="rounded-md bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-400 transition hover:bg-orange-500/20">CV ▸</button>
            </div>
          </div>
          <DRELine label="Receita" value={sc.receita} />
          <DRELine label="Custos Variáveis" value={sc.custosVar} hint={pct(sc.custosVar, sc.receita)} deduction />
          <DRELine label="Margem de Contribuição" value={margemContrib} hint={pct(margemContrib, sc.receita)} />
          <DRELine label="Custos Fixos" value={sc.custosFix} hint={pct(sc.custosFix, sc.receita)} deduction />
          <DRELine label={isLucro ? "Resultado — Lucro" : "Resultado — Prejuízo"} value={sc.resultado} hint={pct(sc.resultado, sc.receita)} result />
        </div>
      </div>

      {/* ── Evolução do resultado (lucro × prejuízo por período) ─────────── */}
      <EvolucaoResultado
        allData={allData}
        selectedUser={selectedUser}
        scopeName={scopeName}
        availableMonths={availableMonths}
        generatedBy={users.find((u) => u.id === activeUserId)?.name ?? "Principal"}
      />

      {/* ── Comparativo entre lojas (só no modo Todos) ───────────────────── */}
      {!selectedUser && userSummaries.length > 1 && (
        <div className="mb-6 overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
          <div className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Comparativo entre lojas · clique para focar</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2.5 font-semibold">Loja</th>
                <th className="px-5 py-2.5 text-right font-semibold">Saldo</th>
                <th className="px-5 py-2.5 text-right font-semibold">Entradas</th>
                <th className="px-5 py-2.5 text-right font-semibold">Saídas</th>
                <th className="px-5 py-2.5 text-right font-semibold">Resultado</th>
                <th className="w-24 px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {userSummaries.map((s) => {
                const lucro = s.resultado >= 0;
                const w = maxResultadoAbs > 0 ? (Math.abs(s.resultado) / maxResultadoAbs) * 100 : 0;
                return (
                  <tr key={s.id} onClick={() => setSelectedUser(s.id)} className="cursor-pointer transition hover:bg-white/[0.04]">
                    <td className="px-5 py-3 font-medium text-slate-200">{s.name}</td>
                    <td className={`px-5 py-3 text-right font-semibold tabular-nums ${s.saldoTotal >= 0 ? "text-sky-300" : "text-red-400"}`}>{toCurrencyBRL(s.saldoTotal)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-400/90">{toCurrencyBRL(s.receita)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-red-400/90">{toCurrencyBRL(s.despesa)}</td>
                    <td className={`px-5 py-3 text-right font-semibold tabular-nums ${lucro ? "text-emerald-400" : "text-red-400"}`}>{lucro ? "" : "−"}{toCurrencyBRL(Math.abs(s.resultado))}</td>
                    <td className="px-5 py-3">
                      <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className={`h-full rounded-full ${lucro ? "bg-emerald-500" : "bg-red-500"} opacity-80`} style={{ width: `${w.toFixed(1)}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-white/[0.08] bg-slate-800/40">
              <tr>
                <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Total</td>
                <td className={`px-5 py-3 text-right font-bold tabular-nums ${sc.saldo >= 0 ? "text-sky-300" : "text-red-400"}`}>{toCurrencyBRL(sc.saldo)}</td>
                <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-400">{toCurrencyBRL(sc.receita)}</td>
                <td className="px-5 py-3 text-right font-bold tabular-nums text-red-400">{toCurrencyBRL(sc.despesa)}</td>
                <td className={`px-5 py-3 text-right font-bold tabular-nums ${isLucro ? "text-emerald-400" : "text-red-400"}`}>{isLucro ? "" : "−"}{toCurrencyBRL(Math.abs(sc.resultado))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Rankings do escopo ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CategoryRank title={`Despesas por categoria · ${scopeName}`} rows={despesaRank} accentBar="bg-red-500" onClickCategory={(r) => openCategory(r, despScoped, "#ef4444")} />
        <CategoryRank title={`Receitas por categoria · ${scopeName}`} rows={receitaRank} accentBar="bg-emerald-500" onClickCategory={(r) => openCategory(r, recScoped, "#10b981")} />
      </div>

      {/* ── Drill-down: lista de transações com filtro de loja ───────────── */}
      {drill && (() => {
        const storesInDrill = Array.from(new Map(drill.rows.map((r) => [r.userId, r.userName])).entries());
        const visibleRows = drillUser ? drill.rows.filter((r) => r.userId === drillUser) : drill.rows;
        const showStoreCol = !drillUser && storesInDrill.length > 1;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setDrill(null); }}>
            <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: drill.accent }} />
                  <span className="text-sm font-semibold text-white">{drill.title}</span>
                  <span className="text-xs text-slate-500">· {visibleRows.length} {visibleRows.length === 1 ? "transação" : "transações"}</span>
                </div>
                <button onClick={() => setDrill(null)} className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"><X size={15} /></button>
              </div>

              {/* Chips de loja */}
              {storesInDrill.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-5 py-2.5">
                  <button onClick={() => setDrillUser(null)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${!drillUser ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25" : "bg-white/[0.04] text-slate-400 hover:text-slate-200"}`}>
                    Todos
                  </button>
                  {storesInDrill.map(([uid, uname]) => (
                    <button key={uid} onClick={() => setDrillUser(uid)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${drillUser === uid ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25" : "bg-white/[0.04] text-slate-400 hover:text-slate-200"}`}>
                      {uname}
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-800/90 text-left">
                    <tr>
                      <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Data</th>
                      {showStoreCol && <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Loja</th>}
                      <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Terceiro</th>
                      <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Categoria</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {visibleRows.map((t, i) => (
                      <tr key={t.tx.id + i} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-2.5 tabular-nums text-slate-400">{formatDate(t.tx.date)}</td>
                        {showStoreCol && <td className="px-5 py-2.5 text-slate-300">{t.userName}</td>}
                        <td className="px-5 py-2.5 text-slate-200">{t.tx.thirdParty}</td>
                        <td className="px-5 py-2.5"><CategoryBadge category={t.tx.category || "Sem categoria"} /></td>
                        <td className="px-5 py-2.5 text-right font-medium tabular-nums text-slate-100">{toCurrencyBRL(Math.abs(t.tx.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-white/[0.08] bg-slate-800/50">
                    <tr>
                      <td colSpan={showStoreCol ? 4 : 3} className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Total</td>
                      <td className="px-5 py-2.5 text-right text-sm font-bold tabular-nums text-white">
                        {toCurrencyBRL(visibleRows.reduce((s, t) => s + Math.abs(t.tx.amount), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
