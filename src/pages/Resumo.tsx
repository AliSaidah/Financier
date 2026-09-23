import { useRef, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, Landmark, X, Zap, Printer, FileDown, ArrowUpRight, ArrowDownLeft, Wallet, Pencil } from "lucide-react";
import { Transaction } from "../types/finance";
import { toCurrencyBRL, digitsToBRLInput, parseBRLInput, numberToBRLInput } from "../lib/formatters";
import { CategoryBadge } from "../components/CategoryBadge";
import { PeriodFilter } from "../components/PeriodFilter";
import { applyTopN, BarEntry, ComparisonData } from "../components/ReportBarChart";
import { PrintReport } from "../components/PrintReport";
import { InsightsCard } from "../components/InsightsCard";
import { IndicadoresCard } from "../components/IndicadoresCard";
import { calculateSummary, isExcludedFromAnalysis, txCategoryKey } from "../utils/summaryCalculator";
import { generatePdfFromElement } from "../utils/pdfFromElement";
import { useFinancierStore } from "../store/useFinancierStore";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  pagamentos: Transaction[];
  recebimentos: Transaction[];
  fixedCategoryIds: string[];
  month: number;
  year: number;
  availablePeriods: { year: number; month: number }[];
  onChangePeriod: (month: number, year: number) => void;
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface CategoryStat {
  category: string;
  categoryId?: string;
  total: number;
  count: number;
  pct: number;
}

interface DrillDown {
  category: string;
  categoryId?: string;
  type: "despesas" | "receitas";
  txs: Transaction[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const MONTH_ABBR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

// Comparison period colors — oldest → newest (purple → cyan → green)
const COMP_COLORS = ["#6366f1", "#06b6d4", "#10b981"];

// Categorias que não recebem classificação CF/CV (não podem ser alternadas)
const CFCV_EXCLUDED = new Set(["transferencia-interna", "estorno-reembolso"]);

function parseDateLocal(raw: string): Date {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(raw);
}

function buildStats(transactions: Transaction[]): CategoryStat[] {
  const map = new Map<string, { total: number; count: number; name: string; id?: string }>();
  for (const tx of transactions) {
    const id   = tx.categoryId;
    const name = tx.category || tx.categoryId || "Sem categoria";
    const key  = id ?? name;
    const prev = map.get(key) ?? { total: 0, count: 0, name, id };
    map.set(key, { total: prev.total + Math.abs(tx.amount), count: prev.count + 1, name: prev.name, id: prev.id });
  }
  const rows = Array.from(map.entries())
    .map(([, d]) => ({ category: d.name, categoryId: d.id, total: d.total, count: d.count, pct: 0 }))
    .sort((a, b) => b.total - a.total);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({ ...r, pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0 }));
}

function formatDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function fmtPct(value: number, base: number): string {
  if (!base || !isFinite(value / base)) return "—";
  return `${((value / base) * 100).toFixed(1)}%`;
}

function groupByCategory(txs: Transaction[]): { category: string; total: number }[] {
  const map = new Map<string, number>();
  for (const tx of txs) {
    const cat = tx.category || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + Math.abs(tx.amount));
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function groupForaDRE(txs: Transaction[]): { category: string; net: number }[] {
  const map = new Map<string, number>();
  for (const tx of txs) {
    const cat = tx.category || "Transferência Interna";
    map.set(cat, (map.get(cat) ?? 0) + tx.amount);
  }
  return [...map.entries()]
    .map(([category, net]) => ({ category, net }))
    .filter(({ net }) => net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

// Compute category totals for a period from all transactions
function computePeriodCategoryTotals(
  allTx: Transaction[],
  m: number,
  y: number,
  type: "expense" | "income",
  excluded: ReadonlySet<string>
): BarEntry[] {
  const filtered = allTx.filter((tx) => {
    if (tx.ignored) return false;
    if (isExcludedFromAnalysis(tx, excluded)) return false;
    const d = parseDateLocal(tx.date);
    if (d.getMonth() !== m || d.getFullYear() !== y) return false;
    return type === "expense" ? tx.amount < 0 : tx.amount >= 0;
  });
  const map = new Map<string, number>();
  for (const tx of filtered) {
    const cat = tx.category || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + Math.abs(tx.amount));
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ResumoPage({
  pagamentos, recebimentos, fixedCategoryIds,
  month, year, availablePeriods, onChangePeriod,
}: Props) {

  // All transactions (for multi-period comparison)
  const allTransactions = useFinancierStore((s) => s.transactions);
  const toggleFixedCategory = useFinancierStore((s) => s.toggleFixedCategory);
  const excludedCategoryIds = useFinancierStore((s) => s.excludedCategoryIds);
  const setExcludedCategories = useFinancierStore((s) => s.setExcludedCategories);
  const saldoInicial = useFinancierStore((s) => s.saldoInicial);
  const setSaldoInicial = useFinancierStore((s) => s.setSaldoInicial);
  const excludedSet = useMemo(() => new Set(excludedCategoryIds), [excludedCategoryIds]);

  // Usuário ativo (para exibir no relatório)
  const users        = useFinancierStore((s) => s.users);
  const activeUserId = useFinancierStore((s) => s.activeUserId);
  const activeUserName = users.find((u) => u.id === activeUserId)?.name ?? "Principal";

  const {
    receitaTotal, despesaTotal, saldo,
    custosFix, custosVar, margemContrib, resultadoEst,
    receitasLiquidas, despesasLiquidas,
  } = useMemo(
    () => calculateSummary(recebimentos, pagamentos, fixedCategoryIds, excludedCategoryIds),
    [recebimentos, pagamentos, fixedCategoryIds, excludedCategoryIds]
  );

  const despesasStats = useMemo(() => buildStats(despesasLiquidas), [despesasLiquidas]);
  const receitasStats = useMemo(() => buildStats(receitasLiquidas), [receitasLiquidas]);

  // Bar chart entries (top 10 + Outros)
  const despesasEntries = useMemo(
    () => applyTopN(despesasStats.map((s) => ({ label: s.category, value: s.total }))),
    [despesasStats]
  );
  const receitasEntries = useMemo(
    () => applyTopN(receitasStats.map((s) => ({ label: s.category, value: s.total }))),
    [receitasStats]
  );

  // UI state
  const [showComparison, setShowComparison] = useState(false);
  const [drillDown, setDrillDown]           = useState<DrillDown | null>(null);
  const [pdfLoading, setPdfLoading]         = useState(false);
  const [pdfSuccess, setPdfSuccess]         = useState<string | null>(null);
  const [ticketOn, setTicketOn]             = useState(false);
  const [cfcvDrill, setCfcvDrill]           = useState<"CF" | "CV" | null>(null);
  const [view, setView]                     = useState<"simples" | "detalhada">("simples");
  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [saldoInput, setSaldoInput]         = useState("");

  // Ref for html2canvas PDF capture
  const printReportRef = useRef<HTMLDivElement>(null);

  // ── Comparison data (last 3 periods) ──────────────────────────────────────
  const TOP_COMPARE = 5;

  const comparisonPeriods = useMemo(() => {
    const sorted = [...availablePeriods].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const idx = sorted.findIndex((p) => p.month === month && p.year === year);
    if (idx < 0) return [];
    return sorted.slice(Math.max(0, idx - 2), idx + 1);
  }, [availablePeriods, month, year]);

  const canCompare = comparisonPeriods.length >= 2;

  // ── Mês anterior (para a Análise Inteligente) ────────────────────────────
  const prevPeriod = useMemo(() => {
    const sorted = [...availablePeriods].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const idx = sorted.findIndex((p) => p.month === month && p.year === year);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [availablePeriods, month, year]);

  const prevDespesasEntries = useMemo(
    () => prevPeriod
      ? computePeriodCategoryTotals(allTransactions, prevPeriod.month, prevPeriod.year, "expense", excludedSet)
      : null,
    [prevPeriod, allTransactions, excludedSet]
  );

  const prevLabel = prevPeriod
    ? `${MONTH_ABBR[prevPeriod.month]}/${String(prevPeriod.year).slice(2)}`
    : null;

  const comparisonData = useMemo((): { despesas: ComparisonData; receitas: ComparisonData } | null => {
    if (!showComparison || !canCompare) return null;

    const despesasCats = despesasStats.slice(0, TOP_COMPARE).map((s) => s.category);
    const receitasCats = receitasStats.slice(0, TOP_COMPARE).map((s) => s.category);
    const colorOffset  = 3 - comparisonPeriods.length;

    function makeSeries(cats: string[], type: "expense" | "income") {
      return comparisonPeriods.map((p, i) => {
        const tots = computePeriodCategoryTotals(allTransactions, p.month, p.year, type, excludedSet);
        const map  = new Map(tots.map((t) => [t.label, t.value]));
        return {
          label:  MONTH_ABBR[p.month] + "/" + String(p.year).slice(2),
          color:  COMP_COLORS[colorOffset + i] ?? COMP_COLORS[i % COMP_COLORS.length],
          values: cats.map((cat) => map.get(cat) ?? 0),
        };
      });
    }

    return {
      despesas: { categories: despesasCats, series: makeSeries(despesasCats, "expense") },
      receitas: { categories: receitasCats, series: makeSeries(receitasCats, "income") },
    };
  }, [showComparison, canCompare, comparisonPeriods, despesasStats, receitasStats, allTransactions, excludedSet]);

  // ── Warnings & helpers ────────────────────────────────────────────────────
  const uncategorizedCount = useMemo(
    () => [...recebimentos, ...pagamentos].filter(
      (tx) => !tx.category || tx.category === "Sem categoria"
    ).length,
    [recebimentos, pagamentos]
  );

  const cfNotConfigured = fixedCategoryIds.length === 0;

  const { cfByCategory, cvByCategory, cfStats, cvStats } = useMemo(() => {
    const fixedSet = new Set(fixedCategoryIds);
    const pgCF = despesasLiquidas.filter(
      (tx) => tx.category && tx.category !== "Sem categoria" && fixedSet.has(tx.categoryId ?? tx.category)
    );
    const pgCV = despesasLiquidas.filter(
      (tx) => !tx.category || tx.category === "Sem categoria" || !fixedSet.has(tx.categoryId ?? tx.category)
    );
    return {
      cfByCategory: groupByCategory(pgCF), cvByCategory: groupByCategory(pgCV),
      cfStats: buildStats(pgCF), cvStats: buildStats(pgCV),
    };
  }, [despesasLiquidas, fixedCategoryIds]);

  // Saldo simples: entradas − saídas de TODOS os extratos importados,
  // sem exclusões (por isso difere do resultado da análise, que exclui categorias)
  const ledgerTotals = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const tx of allTransactions) {
      if (tx.ignored) continue;
      if (tx.amount >= 0) entradas += tx.amount;
      else saidas += Math.abs(tx.amount);
    }
    // Saldo inicial (o que já havia na conta antes do 1º extrato) entra na base
    return { entradas, saidas, saldo: saldoInicial + entradas - saidas };
  }, [allTransactions, saldoInicial]);

  const foraItems = useMemo(() => {
    const recFora = recebimentos.filter((tx) => isExcludedFromAnalysis(tx, excludedSet));
    const pgFora  = pagamentos.filter((tx) => isExcludedFromAnalysis(tx, excludedSet));
    return groupForaDRE([...recFora, ...pgFora]);
  }, [recebimentos, pagamentos, excludedSet]);

  // Categorias presentes no mês (para o modal de exclusões)
  const monthCategories = useMemo(() => {
    const map = new Map<string, string>(); // key → label
    for (const tx of [...recebimentos, ...pagamentos]) {
      map.set(txCategoryKey(tx), tx.category || "Sem categoria");
    }
    // Garante que exclusões já ativas apareçam na lista mesmo sem transação no mês
    for (const key of excludedCategoryIds) if (!map.has(key)) map.set(key, key);
    // "Rendimentos" é sempre fora da análise (fixo) — não aparece como opção
    map.delete("Rendimentos");
    return [...map.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [recebimentos, pagamentos, excludedCategoryIds]);

  const [showForaModal, setShowForaModal] = useState(false);

  function toggleExcluded(key: string) {
    setExcludedCategories(
      excludedCategoryIds.includes(key)
        ? excludedCategoryIds.filter((k) => k !== key)
        : [...excludedCategoryIds, key]
    );
  }

  const margemPct     = fmtPct(margemContrib, receitaTotal);
  const resultadoPct  = fmtPct(resultadoEst,  receitaTotal);
  const isLucro       = resultadoEst >= 0;

  // ── Drill-down ────────────────────────────────────────────────────────────
  function handleDrillDown(stat: CategoryStat, type: "despesas" | "receitas") {
    const source = type === "despesas" ? despesasLiquidas : receitasLiquidas;
    const txs = source.filter((tx) => {
      if (stat.categoryId && tx.categoryId) return tx.categoryId === stat.categoryId;
      return (tx.category || "Sem categoria") === stat.category;
    });
    setDrillDown({ category: stat.category, categoryId: stat.categoryId, type, txs });
  }

  // ── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    window.print();
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  async function handlePDF() {
    const el = printReportRef.current;
    if (!el || pdfLoading) return;
    setPdfLoading(true);
    try {
      const fileName = `relatorio-financier-${year}-${String(month + 1).padStart(2, "0")}.pdf`;
      await generatePdfFromElement(el, fileName);
      setPdfSuccess(fileName);
      setTimeout(() => setPdfSuccess(null), 6000);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Print report props ────────────────────────────────────────────────────
  const printSummary = useMemo(
    () => calculateSummary(recebimentos, pagamentos, fixedCategoryIds, excludedCategoryIds),
    [recebimentos, pagamentos, fixedCategoryIds, excludedCategoryIds]
  );

  // Período do extrato (data mín/máx das transações do mês)
  const periodRange = useMemo(() => {
    const dates = [...pagamentos, ...recebimentos]
      .filter((tx) => !tx.ignored)
      .map((tx) => parseDateLocal(tx.date));
    if (dates.length === 0) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return { from: min, to: max };
  }, [pagamentos, recebimentos]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="pb-10">

      {/* ── Top bar: Period filter + view toggle + Action buttons ────────── */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <PeriodFilter month={month} year={year} availablePeriods={availablePeriods} onChange={onChangePeriod} />
          <div className="flex rounded-xl border border-white/[0.08] bg-slate-800/60 p-1">
            {(["simples", "detalhada"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                  view === v ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {v === "simples" ? "Simples" : "Detalhada"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-sky-400/30 hover:bg-sky-500/10 hover:text-sky-300"
          >
            <Printer size={13} />
            Imprimir
          </button>
          <button
            onClick={handlePDF}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive disabled:cursor-wait disabled:opacity-50"
          >
            <FileDown size={13} />
            {pdfLoading ? "Gerando…" : "Gerar PDF"}
          </button>
        </div>
      </div>

      {view === "simples" ? (
        <SimpleAnalise
          receitaTotal={receitaTotal}
          despesaTotal={despesaTotal}
          saldoMes={receitaTotal - despesaTotal}
          despesasStats={despesasStats}
          receitasStats={receitasStats}
          uncategorizedCount={uncategorizedCount}
          onVerDetalhes={() => setView("detalhada")}
          onClickCategory={(stat) => handleDrillDown(stat, "despesas")}
          onClickReceita={(stat) => handleDrillDown(stat, "receitas")}
        />
      ) : (
      <>
      {/* ── Warnings ────────────────────────────────────────────────────── */}
      {uncategorizedCount > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <AlertTriangle size={14} className="shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{uncategorizedCount} transações sem categoria.</span>{" "}
            Os valores podem mudar após a revisão.
          </p>
        </div>
      )}
      {cfNotConfigured && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.07] px-4 py-3">
          <Info size={14} className="shrink-0 text-sky-400" />
          <p className="text-xs text-sky-300">
            Nenhuma despesa fixa configurada — todos os custos estão como variáveis.{" "}
            <span className="text-sky-400">Configure na aba Pagamentos.</span>
          </p>
        </div>
      )}

      {/* ── Saldo (saldo inicial + entradas − saídas de todos os extratos) ── */}
      {allTransactions.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20">
              <Landmark size={18} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Saldo Previsto</p>
              <button
                onClick={() => { setSaldoInput(saldoInicial ? numberToBRLInput(saldoInicial) : ""); setShowSaldoModal(true); }}
                className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500 transition hover:text-sky-300"
              >
                <Pencil size={10} />
                {saldoInicial !== 0
                  ? <>inclui saldo inicial de {toCurrencyBRL(saldoInicial)}</>
                  : <>definir saldo inicial (o que já tinha na conta)</>}
              </button>
            </div>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${ledgerTotals.saldo >= 0 ? "text-sky-300" : "text-red-400"}`}>
            {toCurrencyBRL(ledgerTotals.saldo)}
          </span>
        </div>
      )}

      {/* ── Mini DRE ────────────────────────────────────────────────────── */}
      <div className="mb-6 overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
        <div className="border-b border-white/[0.05] px-5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Resultado do Período <span className="font-normal normal-case tracking-normal text-slate-600">· fluxo do mês, não é o saldo</span></p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
          <div className="px-5 py-4">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Recebido</p>
            <p className="mt-2 text-xl font-bold tabular-nums text-white">{toCurrencyBRL(receitaTotal)}</p>
          </div>
          <button onClick={() => setCfcvDrill("CF")} className="group px-5 py-4 text-left transition hover:bg-white/[0.03]">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-red-400/60">
              Despesas Fixas
              <ChevronRight size={11} className="text-slate-600 opacity-0 transition group-hover:opacity-100" />
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-red-400">{toCurrencyBRL(custosFix)}</p>
            <p className="mt-0.5 text-[10px] text-slate-600">{fmtPct(custosFix, receitaTotal)} da receita</p>
          </button>
          <button onClick={() => setCfcvDrill("CV")} className="group px-5 py-4 text-left transition hover:bg-white/[0.03]">
            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-orange-400/60">
              Despesas Variáveis
              <ChevronRight size={11} className="text-slate-600 opacity-0 transition group-hover:opacity-100" />
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-orange-400">{toCurrencyBRL(custosVar)}</p>
            <p className="mt-0.5 text-[10px] text-slate-600">Margem: <span className="text-slate-500">{margemPct}</span></p>
          </button>
          <div className={`px-5 py-4 ${isLucro ? "bg-emerald-500/[0.06]" : "bg-red-500/[0.06]"}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isLucro ? "text-emerald-400/70" : "text-red-400/70"}`}>
              {isLucro ? "Lucro" : "Prejuízo"}
            </p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${isLucro ? "text-emerald-400" : "text-red-400"}`}>
              {toCurrencyBRL(Math.abs(resultadoEst))}
            </p>
            <p className={`mt-0.5 text-[10px] ${isLucro ? "text-emerald-600" : "text-red-600"}`}>{resultadoPct} da receita</p>
          </div>
        </div>
      </div>

      {/* ── Indicadores dinâmicos (DRE interativo + KPIs) ────────────────── */}
      <IndicadoresCard
        receitaTotal={receitaTotal}
        custosVar={custosVar}
        custosFix={custosFix}
        margemContrib={margemContrib}
        resultadoEst={resultadoEst}
        numVendas={receitasLiquidas.length}
        ticketOn={ticketOn}
        onToggleTicket={setTicketOn}
      />

      {/* ── CF / CV por categoria ────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <CategoryList title="Despesas Fixas por Categoria"     items={cfByCategory} emptyMsg="Nenhum custo fixo no período." />
        <CategoryList title="Despesas Variáveis por Categoria" items={cvByCategory} emptyMsg="Nenhum custo variável no período." />
      </div>

      {/* ── Fora da análise (personalizável) ─────────────────────────────── */}
      <div className="mb-6 rounded-xl border border-white/[0.05] bg-slate-800/20 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Fora da análise
          </h3>
          <button
            onClick={() => setShowForaModal(true)}
            className="rounded-lg border border-white/[0.08] bg-slate-800/60 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:border-accentPositive/30 hover:text-accentPositive"
          >
            Escolher o que fica fora
          </button>
        </div>
        {foraItems.length === 0 ? (
          <p className="text-xs text-slate-600">Nenhuma transação excluída neste mês.</p>
        ) : (
          <div>
            {foraItems.map(({ category, net }) => (
              <div key={category} className="flex items-center justify-between border-b border-white/[0.04] py-1.5 last:border-0">
                <span className="text-xs text-slate-500">{category}</span>
                <span className={`tabular-nums text-xs font-medium ${net >= 0 ? "text-slate-400" : "text-slate-500"}`}>
                  {net >= 0 ? "+" : "−"} {toCurrencyBRL(Math.abs(net))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: escolher categorias fora da análise ───────────────────── */}
      {showForaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForaModal(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Fora da análise</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Categorias marcadas não entram em receitas, despesas nem no resultado.
                </p>
              </div>
              <button
                onClick={() => setShowForaModal(false)}
                className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-3 py-2">
              {monthCategories.map(({ key, label }) => {
                const checked = excludedCategoryIds.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleExcluded(key)}
                    className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.04]"
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                      checked ? "border-accentPositive bg-accentPositive text-slate-950" : "border-white/20"
                    }`}>
                      {checked && <CheckCircle2 size={11} strokeWidth={3} />}
                    </span>
                    <CategoryBadge category={label} />
                    {checked && <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-slate-600">fora</span>}
                  </button>
                );
              })}
            </div>
            <div className="border-t border-white/[0.06] px-5 py-3">
              <button
                onClick={() => setShowForaModal(false)}
                className="w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rankings ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">
        <RankingCard
          title="Despesas por categoria"
          stats={despesasStats}
          accentBar="bg-accentNegative"
          onClickCategory={(stat) => handleDrillDown(stat, "despesas")}
        />
        <RankingCard
          title="Receitas por categoria"
          stats={receitasStats}
          accentBar="bg-accentPositive"
          onClickCategory={(stat) => handleDrillDown(stat, "receitas")}
        />
      </div>

      {/* ── Análise Inteligente ──────────────────────────────────────────── */}
      <InsightsCard
        receitaTotal={receitaTotal}
        despesaTotal={despesaTotal}
        custosFix={custosFix}
        resultadoEst={resultadoEst}
        despesasStats={despesasStats}
        receitasStats={receitasStats}
        prevDespesas={prevDespesasEntries}
        prevLabel={prevLabel}
        uncategorizedCount={uncategorizedCount}
      />
      </>
      )}

      {/* ── Drill-down overlay ───────────────────────────────────────────── */}
      {drillDown && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setDrillDown(null); }}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2">
                <CategoryBadge category={drillDown.category} />
                <span className="text-sm font-semibold text-white">{drillDown.category}</span>
                <span className="text-xs text-slate-500">
                  · {drillDown.txs.length} {drillDown.txs.length === 1 ? "transação" : "transações"}
                </span>
              </div>
              <button
                onClick={() => setDrillDown(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
              >
                <X size={15} />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800/90 text-left">
                  <tr>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Data</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Terceiro</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Subcategoria</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Forma</th>
                    <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {drillDown.txs.map((tx) => (
                    <tr key={tx.id} className="hover:bg-white/[0.02]">
                      <td className="px-5 py-2.5 tabular-nums text-slate-400">{formatDate(tx.date)}</td>
                      <td className="px-5 py-2.5 text-slate-200">{tx.thirdParty}</td>
                      <td className="px-5 py-2.5">
                        {tx.subCategory ? (
                          <span className="rounded-md bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">{tx.subCategory}</span>
                        ) : tx.autoCategorized ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400/70" title="Categorizado automaticamente">
                            <Zap size={11} strokeWidth={2.5} />Auto
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-slate-400">{tx.paymentMethod}</td>
                      <td className="px-5 py-2.5 text-right font-medium tabular-nums text-slate-100">
                        {toCurrencyBRL(Math.abs(tx.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-white/[0.08] bg-slate-800/50">
                  <tr>
                    <td colSpan={4} className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Total</td>
                    <td className="px-5 py-2.5 text-right text-sm font-bold tabular-nums text-white">
                      {toCurrencyBRL(drillDown.txs.reduce((s, tx) => s + Math.abs(tx.amount), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Drill-down CF/CV (a partir dos cards) ────────────────────────── */}
      {cfcvDrill && (() => {
        const isCF  = cfcvDrill === "CF";
        const stats = isCF ? cfStats : cvStats;
        const total = stats.reduce((s, r) => s + r.total, 0);
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
            onClick={(e) => { if (e.target === e.currentTarget) setCfcvDrill(null); }}
          >
            <div className="w-full max-w-xl rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
                <div className="min-w-0">
                  <h3 className={`text-sm font-semibold ${isCF ? "text-red-400" : "text-orange-400"}`}>
                    {isCF ? "Despesas Fixas (CF)" : "Despesas Variáveis (CV)"}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Clique na categoria para ver as transações · "→ Fixa/Variável" reclassifica.
                  </p>
                </div>
                <button
                  onClick={() => setCfcvDrill(null)}
                  className="shrink-0 rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {stats.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-slate-500">Nenhuma categoria nesta classificação.</p>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {stats.map((stat) => {
                      const key      = stat.categoryId ?? stat.category;
                      const semCat   = stat.category === "Sem categoria";
                      const excluded = semCat || Boolean(stat.categoryId && CFCV_EXCLUDED.has(stat.categoryId));
                      return (
                        <div key={key} className="flex items-center justify-between gap-3 px-5 py-3">
                          <button
                            onClick={() => { handleDrillDown(stat, "despesas"); setCfcvDrill(null); }}
                            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-white/[0.04]"
                            title="Ver transações desta categoria"
                          >
                            <CategoryBadge category={stat.category} />
                            <span className="shrink-0 text-xs text-slate-500">
                              {stat.count} {stat.count === 1 ? "transação" : "transações"}
                            </span>
                            <ChevronRight size={12} className="shrink-0 text-slate-600" />
                          </button>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-sm font-semibold tabular-nums text-slate-100">{toCurrencyBRL(stat.total)}</span>
                            {excluded ? (
                              <span className="text-[10px] text-slate-600">—</span>
                            ) : (
                              <button
                                onClick={() => toggleFixedCategory(key)}
                                title={isCF ? "Mover para Variável" : "Mover para Fixa"}
                                className="rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive"
                              >
                                {isCF ? "→ Variável" : "→ Fixa"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
                <span className="text-xs font-semibold text-slate-500">Total {isCF ? "fixo" : "variável"}</span>
                <span className="text-sm font-bold tabular-nums text-white">{toCurrencyBRL(total)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── PrintReport portal (off-screen, visible em @media print) ──────── */}
      <PrintReport
        ref={printReportRef}
        monthName={MONTH_NAMES[month]}
        year={year}
        userName={activeUserName}
        periodFrom={periodRange?.from}
        periodTo={periodRange?.to}
        summary={printSummary}
        numVendas={receitasLiquidas.length}
        showTicketMedio={ticketOn}
        despesasEntries={despesasEntries}
        receitasEntries={receitasEntries}
        showComparison={showComparison}
        despesasComparison={comparisonData?.despesas}
        receitasComparison={comparisonData?.receitas}
      />

      {/* ── Toast: relatório baixado com sucesso ──────────────────────────── */}
      {pdfSuccess && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-slate-900 to-[#0d1426] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          style={{ zIndex: 10001 }}
        >
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Relatório baixado com sucesso</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{pdfSuccess} · pasta Downloads</p>
          </div>
          <button
            onClick={() => setPdfSuccess(null)}
            className="ml-1 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Overlay durante geração do PDF (z-index 10000, cobre o flash branco) */}
      {pdfLoading && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-3"
          style={{ zIndex: 10000, background: "rgba(15,23,42,0.88)", backdropFilter: "blur(4px)" }}
        >
          <svg className="animate-spin" width={28} height={28} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-slate-200">Gerando PDF…</p>
        </div>
      )}

      {/* ── Modal: saldo inicial ─────────────────────────────────────────── */}
      {showSaldoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSaldoModal(false); }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900 to-[#0d1426] shadow-2xl">
            <div className="flex items-center gap-3 px-6 pb-4 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20">
                <Landmark size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold tracking-tight text-white">Saldo inicial</h2>
                <p className="text-xs text-slate-500">O que já havia na conta antes do 1º extrato</p>
              </div>
              <button onClick={() => setShowSaldoModal(false)} className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="border-t border-white/[0.06] px-6 py-5">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Valor</label>
              <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 transition focus-within:border-sky-400/40">
                <span className="text-sm font-medium text-slate-500">R$</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={saldoInput}
                  onChange={(e) => setSaldoInput(digitsToBRLInput(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter") { setSaldoInicial(parseBRLInput(saldoInput) || 0); setShowSaldoModal(false); } }}
                  placeholder="0,00"
                  className="w-full bg-transparent text-sm font-semibold tabular-nums text-white placeholder-slate-600 outline-none"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                O Saldo Previsto vira <span className="text-slate-300">saldo inicial + entradas − saídas</span>, batendo com o extrato do banco.
              </p>
            </div>
            <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.015] px-6 py-4">
              <button
                onClick={() => { setSaldoInicial(0); setShowSaldoModal(false); }}
                className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
              >
                Zerar
              </button>
              <button
                onClick={() => { setSaldoInicial(parseBRLInput(saldoInput) || 0); setShowSaldoModal(false); }}
                className="flex-1 rounded-xl bg-gradient-to-b from-sky-500 to-sky-600 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryList({ title, items, emptyMsg }: { title: string; items: { category: string; total: number }[]; emptyMsg: string }) {
  const grandTotal = items.reduce((s, i) => s + i.total, 0);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
      <div className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-600">{emptyMsg}</p>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: 264 }}>
          {items.map(({ category, total }) => (
            <div key={category} className="flex items-center justify-between border-b border-white/[0.04] px-5 py-2.5 last:border-0">
              <span className="text-sm text-slate-300">{category}</span>
              <span className="tabular-nums text-sm font-medium text-slate-200">{toCurrencyBRL(total)}</span>
            </div>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-xs font-semibold text-slate-500">Total</span>
          <span className="tabular-nums text-sm font-bold text-white">{toCurrencyBRL(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}

function RankingCard({ title, stats, accentBar, onClickCategory }: { title: string; stats: CategoryStat[]; accentBar: string; onClickCategory?: (stat: CategoryStat) => void }) {
  const grandTotal = stats.reduce((s, r) => s + r.total, 0);
  const maxTotal   = stats.reduce((m, r) => Math.max(m, r.total), 0);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
      <div className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>
      {stats.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-600">Nenhuma transação no período.</p>
      ) : (
        <div className="overflow-y-auto px-5 py-3" style={{ maxHeight: 264 }}>
          <div className="space-y-1.5">
            {stats.map((stat, idx) => {
              const barW = maxTotal > 0 ? (stat.total / maxTotal) * 100 : 0;
              return (
                <div key={stat.categoryId ?? stat.category}
                  onClick={() => onClickCategory?.(stat)}
                  className={`flex items-center gap-3 rounded-lg px-1.5 py-1 ${onClickCategory ? "cursor-pointer transition hover:bg-white/[0.04]" : ""}`}
                >
                  <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{idx + 1}</span>
                  <div className="flex w-44 shrink-0 justify-end">
                    <CategoryBadge category={stat.category} />
                  </div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-white/[0.05]">
                    <div className={`h-full rounded-md ${accentBar} opacity-80 transition-all duration-500`} style={{ width: `${barW.toFixed(1)}%` }} />
                  </div>
                  <div className="flex w-24 shrink-0 flex-col items-end leading-tight">
                    <span className="text-xs font-semibold tabular-nums text-slate-100">{toCurrencyBRL(stat.total)}</span>
                    <span className="text-[10px] tabular-nums text-slate-500">{stat.count} {stat.count === 1 ? "transação" : "transações"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {stats.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-xs font-semibold text-slate-500">Total</span>
          <span className="tabular-nums text-sm font-bold text-white">{toCurrencyBRL(grandTotal)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Análise simples (padrão) ───────────────────────────────────────────────

function BigCard({ label, value, tone, icon }: {
  label: string; value: number; tone: "green" | "red" | "neutral"; icon: React.ReactNode;
}) {
  const colors = {
    green:   { text: "text-emerald-400", ring: "ring-emerald-500/20", bg: "bg-emerald-500/10", chip: "text-emerald-400" },
    red:     { text: "text-red-400",     ring: "ring-red-500/20",     bg: "bg-red-500/10",     chip: "text-red-400" },
    neutral: { text: "text-sky-300",     ring: "ring-sky-500/20",     bg: "bg-sky-500/10",     chip: "text-sky-400" },
  }[tone];
  return (
    <div className={`rounded-2xl bg-bgSecondary p-5 ring-1 ${colors.ring}`}>
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors.bg} ${colors.chip}`}>{icon}</div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
      </div>
      <p className={`mt-3 text-3xl font-bold tabular-nums tracking-tight ${colors.text}`}>{toCurrencyBRL(value)}</p>
    </div>
  );
}

function SimpleAnalise({
  receitaTotal, despesaTotal, saldoMes, despesasStats, receitasStats,
  uncategorizedCount, onVerDetalhes, onClickCategory, onClickReceita,
}: {
  receitaTotal: number; despesaTotal: number; saldoMes: number;
  despesasStats: CategoryStat[]; receitasStats: CategoryStat[];
  uncategorizedCount: number;
  onVerDetalhes: () => void;
  onClickCategory: (s: CategoryStat) => void;
  onClickReceita: (s: CategoryStat) => void;
}) {
  const positivo = saldoMes >= 0;
  return (
    <div>
      {uncategorizedCount > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <AlertTriangle size={14} className="shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{uncategorizedCount} transações sem categoria.</span>{" "}
            Categorize na aba Pagamentos para os números ficarem exatos.
          </p>
        </div>
      )}

      {/* Os 3 números que todo mundo quer ver */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <BigCard label="Você recebeu" value={receitaTotal} tone="green" icon={<ArrowUpRight size={18} />} />
        <BigCard label="Você gastou"  value={despesaTotal} tone="red"   icon={<ArrowDownLeft size={18} />} />
        <BigCard
          label={positivo ? "Sobrou no mês" : "Faltou no mês"}
          value={Math.abs(saldoMes)}
          tone={positivo ? "neutral" : "red"}
          icon={<Wallet size={18} />}
        />
      </div>

      {/* Onde foi o dinheiro */}
      <div className="grid grid-cols-2 gap-5">
        <RankingCard title="No que você mais gastou" stats={despesasStats} accentBar="bg-accentNegative" onClickCategory={onClickCategory} />
        <RankingCard title="De onde veio o dinheiro"  stats={receitasStats} accentBar="bg-accentPositive" onClickCategory={onClickReceita} />
      </div>

      {/* Convite para o modo detalhado */}
      <button
        onClick={onVerDetalhes}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-slate-800/40 py-3 text-sm font-medium text-slate-400 transition hover:border-accentPositive/30 hover:text-accentPositive"
      >
        Ver análise detalhada — despesas fixas, variáveis, lucro e comparativos
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ─── Unused but kept to avoid removing accidentally ─────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _MiniCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-bgSecondary p-4 ring-1 ring-white/[0.07]">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold tracking-tight ${color}`}>{value}</p>
    </div>
  );
}
