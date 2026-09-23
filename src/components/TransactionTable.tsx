import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ArrowDownWideNarrow, ArrowUpNarrowWide, Check, EyeOff, History, Pencil, Search, SlidersHorizontal, Tag, X, Zap } from "lucide-react";
import { CategoryGroup, PAYMENT_METHODS } from "../data/constants";
import { toCurrencyBRL, digitsToBRLInput, parseBRLInput } from "../lib/formatters";
import { useFinancierStore } from "../store/useFinancierStore";
import { Transaction } from "../types/finance";
import { CategoryBadge } from "./CategoryBadge";
import { CategorySelector } from "./CategorySelector";

function Checkbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <label className="relative flex h-4 w-4 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        ref={(el) => { if (el) el.indeterminate = indeterminate ?? false; }}
        className="sr-only"
      />
      <div
        className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-all duration-150 ${
          checked
            ? "border-accentPositive bg-accentPositive/25 text-accentPositive"
            : indeterminate
            ? "border-accentPositive/60 bg-accentPositive/10 text-accentPositive/80"
            : "border-slate-600 bg-slate-800/60 text-transparent hover:border-slate-400"
        }`}
      >
        {checked && <Check size={9} strokeWidth={3} />}
        {!checked && indeterminate && <span className="h-px w-2 rounded-full bg-accentPositive/80" />}
      </div>
    </label>
  );
}

function formatDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

const ROW_HEIGHT = 48; // px — fixed height for each row

// Somente Transferência Interna fica sem CF/CV
const TIPO_EXCLUDED = new Set(["transferencia-interna", "estorno-reembolso"]);

/**
 * Chave usada para lookup/toggle de CF/CV.
 * Categorias canônicas → categoryId (ex: "aluguel")
 * Categorias custom    → category name (ex: "Consultoria")
 * Retorna null quando a transação não deve ter classificação CF/CV.
 */
function getTipoKey(tx: { category: string; categoryId?: string }): string | null {
  if (!tx.category || tx.category === "Sem categoria") return null;
  if (tx.categoryId && TIPO_EXCLUDED.has(tx.categoryId))  return null;
  return tx.categoryId ?? tx.category;
}

interface Props {
  transactions: Transaction[];
  categoryGroups: CategoryGroup[];
  categoryType: "income" | "expense";
  onChangeCategory: (id: string, category: string, subCategory?: string) => void;
  fixedCategoryIds?: string[];
  onToggleTipo?: (categoryId: string) => void;
}

export function TransactionTable({ transactions, categoryGroups, categoryType, onChangeCategory, fixedCategoryIds = [], onToggleTipo }: Props) {
  const updatePaymentMethod   = useFinancierStore((s) => s.updateTransactionPaymentMethod);
  const toggleIgnored         = useFinancierStore((s) => s.toggleTransactionIgnored);
  const lastChangedIdxRef = useRef<number>(-1);
  const [flashCount, setFlashCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSubCategory, setBulkSubCategory] = useState<string | undefined>(undefined);
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [onlyAutoCategorized, setOnlyAutoCategorized] = useState(false);
  const [zapSparking, setZapSparking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTipo, setFilterTipo] = useState<"CF" | "CV" | null>(null);
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");
  const [sortMode, setSortMode] = useState<"none" | "valor-desc" | "valor-asc">("none");
  const [filterPaymentMethods, setFilterPaymentMethods] = useState<Set<string>>(new Set());
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [filterDropPos, setFilterDropPos] = useState({ top: 0, left: 0 });
  const filterBtnRef  = useRef<HTMLButtonElement>(null);
  const filterDropRef = useRef<HTMLDivElement>(null);

  // ── Keep-visible after categorizing (fixes transaction "disappearing" from onlyUncategorized filter) ──
  const [keepVisibleIds, setKeepVisibleIds] = useState<Set<string>>(new Set());
  const keepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use a ref so the F2 useEffect doesn't go stale on filter toggle
  const onlyUncategorizedRef = useRef(onlyUncategorized);
  useEffect(() => { onlyUncategorizedRef.current = onlyUncategorized; }, [onlyUncategorized]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (keepTimerRef.current) clearTimeout(keepTimerRef.current); };
  }, []);

  // Formas de pagamento distintas presentes no extrato atual
  const availablePaymentMethods = useMemo(() => {
    const seen = new Set<string>();
    for (const tx of transactions) seen.add(tx.paymentMethod);
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [transactions]);

  // Intervalo de datas do extrato atual (para limitar os date inputs)
  const dateRange = useMemo(() => {
    if (!transactions.length) return { min: "", max: "" };
    let min = transactions[0].date.slice(0, 10);
    let max = min;
    for (const tx of transactions) {
      const d = tx.date.slice(0, 10);
      if (d < min) min = d;
      if (d > max) max = d;
    }
    return { min, max };
  }, [transactions]);

  function openFiltersDropdown() {
    if (!filterBtnRef.current) return;
    const rect = filterBtnRef.current.getBoundingClientRect();
    setFilterDropPos({ top: rect.bottom + 6, left: rect.left });
    setShowFiltersDropdown((v) => !v);
  }

  // Scroll container ref for the virtualizer
  const scrollRef = useRef<HTMLDivElement>(null);

  // Limpa seleção e filtros quando o conjunto de transações muda (troca de período/extrato).
  useEffect(() => {
    setSelectedIds(new Set());
    setKeepVisibleIds(new Set());
    setFilterPaymentMethods(new Set());
    setFilterDateFrom("");
    setFilterDateTo("");
    if (keepTimerRef.current) { clearTimeout(keepTimerRef.current); keepTimerRef.current = null; }
  }, [transactions]);

  const uncategorizedCount   = transactions.filter((tx) => !tx.category || tx.category === "Sem categoria").length;
  const autoCategorizedCount = transactions.filter((tx) => tx.autoCategorized).length;

  const parsedMin = valueMin !== "" ? parseBRLInput(valueMin) : null;
  const parsedMax = valueMax !== "" ? parseBRLInput(valueMax) : null;

  const visibleTransactions = transactions.filter((tx) => {
    // Quando o filtro "Sem categoria" está ativo, transações recém-categorizadas
    // ficam visíveis por 1.5s (keepVisibleIds) para não sumirem abruptamente.
    if (onlyUncategorized && !keepVisibleIds.has(tx.id)) {
      if (tx.category && tx.category !== "Sem categoria") return false;
    }
    if (onlyAutoCategorized && !tx.autoCategorized) return false;

    // CF/CV filter (expense mode only)
    if (filterTipo) {
      const key = getTipoKey(tx);
      if (key !== null) {
        const isCF = fixedCategoryIds.includes(key);
        if (filterTipo === "CF" && !isCF) return false;
        if (filterTipo === "CV" &&  isCF) return false;
      }
    }

    // Value range filter (absolute amount)
    const absAmount = Math.abs(tx.amount);
    if (parsedMin !== null && absAmount < parsedMin) return false;
    if (parsedMax !== null && absAmount > parsedMax) return false;

    // Payment method filter
    if (filterPaymentMethods.size > 0 && !filterPaymentMethods.has(tx.paymentMethod)) return false;

    // Date range filter
    if (filterDateFrom && tx.date.slice(0, 10) < filterDateFrom) return false;
    if (filterDateTo   && tx.date.slice(0, 10) > filterDateTo)   return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        tx.thirdParty.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.paymentMethod.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Ordenação: por valor quando escolhido; padrão = cronológica (o ledger
  // contínuo acumula uploads fora de ordem, então sempre ordenamos por data).
  if (sortMode !== "none") {
    visibleTransactions.sort((a, b) =>
      sortMode === "valor-desc"
        ? Math.abs(b.amount) - Math.abs(a.amount)
        : Math.abs(a.amount) - Math.abs(b.amount)
    );
  } else {
    visibleTransactions.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ── Virtualizer ────────────────────────────────────────────────────────────
  const showTipo  = categoryType === "expense";
  const colCount  = showTipo ? 8 : 7;

  const rowVirtualizer = useVirtualizer({
    count: visibleTransactions.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 30,
  });

  const virtualItems  = rowVirtualizer.getVirtualItems();
  const totalSize     = rowVirtualizer.getTotalSize();
  const paddingTop    = virtualItems.length > 0 ? Math.round(virtualItems[0].start) : 0;
  const paddingBottom = virtualItems.length > 0 ? Math.round(totalSize - virtualItems[virtualItems.length - 1].end) : 0;

  // ── handleChangeCategory — mantém a transação visível 1.5s ao categorizar ──
  const handleChangeCategory = useCallback((id: string, category: string, subCategory?: string) => {
    if (onlyUncategorizedRef.current) {
      setKeepVisibleIds((prev) => new Set([...prev, id]));
      if (keepTimerRef.current) clearTimeout(keepTimerRef.current);
      keepTimerRef.current = setTimeout(() => setKeepVisibleIds(new Set()), 1500);
    }
    onChangeCategory(id, category, subCategory);
  }, [onChangeCategory]);

  // ── F2 shortcut ────────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "F2") return;
      const idx = lastChangedIdxRef.current;
      if (idx < 0 || idx >= visibleTransactions.length) return;
      const sourceTx = visibleTransactions[idx];
      const sourceCategory = sourceTx.category;
      if (!sourceCategory || sourceCategory === "Sem categoria") return;
      const toUpdate = visibleTransactions.slice(idx + 1);
      toUpdate.forEach((tx) => handleChangeCategory(tx.id, sourceCategory, sourceTx.subCategory));
      setFlashCount(toUpdate.length);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleTransactions, handleChangeCategory]);

  useEffect(() => {
    if (!flashCount) return;
    const t = setTimeout(() => setFlashCount(0), 1400);
    return () => clearTimeout(t);
  }, [flashCount]);

  useEffect(() => {
    if (!showFiltersDropdown) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (filterBtnRef.current?.contains(target)) return;
      if (filterDropRef.current?.contains(target)) return;
      setShowFiltersDropdown(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showFiltersDropdown]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allSelected  = visibleTransactions.length > 0 && visibleTransactions.every((tx) => selectedIds.has(tx.id));
  const someSelected = visibleTransactions.some((tx) => selectedIds.has(tx.id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleTransactions.map((tx) => tx.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulkCategory() {
    if (!bulkCategory) return;
    selectedIds.forEach((id) => handleChangeCategory(id, bulkCategory, bulkSubCategory));
    setFlashCount(selectedIds.size);
    setSelectedIds(new Set());
    setBulkCategory("");
    setBulkSubCategory(undefined);
  }

  if (!transactions.length) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-bgSecondary/40 px-6 py-10 text-center text-sm text-slate-500">
        Nenhuma transação encontrada para o período selecionado.
      </div>
    );
  }

  return (
    <>
      {/* Filter bar */}
      <div className="mb-2 flex items-center gap-2">
        {/* Search */}
        <div className="relative flex items-center">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(new Set()); }}
            placeholder="Pesquisar..."
            className="h-8 w-48 rounded-lg border border-white/[0.07] bg-slate-800/60 pl-7 pr-3 text-xs text-slate-300 placeholder-slate-600 outline-none transition focus:border-accentPositive/40 focus:w-64"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-slate-500 hover:text-slate-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Auto-categorizadas */}
        {autoCategorizedCount > 0 && (
          <button
            onClick={() => {
              setZapSparking(true);
              setTimeout(() => setZapSparking(false), 500);
              setOnlyAutoCategorized((v) => !v);
              setOnlyUncategorized(false);
              setSelectedIds(new Set());
            }}
            className={`relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
              onlyAutoCategorized
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                : "border-emerald-500/35 bg-emerald-500/10 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.1)] hover:border-emerald-400/50 hover:shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:text-emerald-300"
            }`}
          >
            <span className="relative flex items-center justify-center">
              <Zap
                size={11}
                strokeWidth={zapSparking ? 2.5 : 2}
                className={`transition-all duration-150 ${
                  zapSparking
                    ? "scale-125 text-yellow-300"
                    : onlyAutoCategorized ? "text-yellow-300" : "text-emerald-400"
                }`}
              />
              {zapSparking && (
                <span className="absolute inset-0 animate-ping rounded-full bg-yellow-400/40" />
              )}
            </span>
            Auto
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold transition ${
              onlyAutoCategorized
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-emerald-500/10 text-emerald-500/60"
            }`}>
              {autoCategorizedCount}
            </span>
          </button>
        )}

        {/* Sem categoria */}
        {uncategorizedCount > 0 && (
          <button
            onClick={() => { setOnlyUncategorized((v) => !v); setOnlyAutoCategorized(false); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              onlyUncategorized
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-white/[0.07] bg-transparent text-slate-500 hover:border-white/[0.12] hover:text-slate-300"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${onlyUncategorized ? "bg-amber-400" : "bg-slate-600"}`} />
            Sem categoria
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${onlyUncategorized ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-400"}`}>
              {uncategorizedCount}
            </span>
          </button>
        )}

        {/* Dropdown de filtros avançados */}
        {(() => {
          const activeCount =
            (filterTipo ? 1 : 0) +
            (filterPaymentMethods.size > 0 ? 1 : 0) +
            (filterDateFrom || filterDateTo ? 1 : 0) +
            (valueMin || valueMax ? 1 : 0) +
            (sortMode !== "none" ? 1 : 0);
          const isActive = activeCount > 0;

          function clearAll() {
            setFilterTipo(null);
            setFilterPaymentMethods(new Set());
            setFilterDateFrom("");
            setFilterDateTo("");
            setValueMin("");
            setValueMax("");
            setSortMode("none");
            setSelectedIds(new Set());
          }

          function togglePaymentMethod(method: string) {
            setFilterPaymentMethods((prev) => {
              const next = new Set(prev);
              if (next.has(method)) next.delete(method); else next.add(method);
              return next;
            });
            setSelectedIds(new Set());
          }

          return (
            <div className="relative">
              <button
                ref={filterBtnRef}
                onClick={openFiltersDropdown}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  isActive || showFiltersDropdown
                    ? "border-accentPositive/30 bg-accentPositive/10 text-accentPositive"
                    : "border-white/[0.07] bg-transparent text-slate-500 hover:border-white/[0.12] hover:text-slate-300"
                }`}
              >
                <SlidersHorizontal size={11} />
                Filtros
                {isActive && (
                  <span className="rounded-full bg-accentPositive/20 px-1.5 py-0.5 text-[10px] font-semibold text-accentPositive">
                    {activeCount}
                  </span>
                )}
              </button>

              {showFiltersDropdown && createPortal(
                <div
                  ref={filterDropRef}
                  style={{ position: "fixed", top: filterDropPos.top, left: filterDropPos.left, zIndex: 9999, width: 300 }}
                  className="overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/60 ring-1 ring-black/20"
                >
                  <div className="max-h-[70vh] overflow-y-auto p-4">

                    {/* CF / CV — só no modo despesa */}
                    {showTipo && (
                      <div className="mb-4">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tipo</p>
                        <div className="flex gap-2">
                          {(["CF", "CV"] as const).map((tipo) => (
                            <button
                              key={tipo}
                              onClick={() => { setFilterTipo((v) => v === tipo ? null : tipo); setSelectedIds(new Set()); }}
                              className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition ${
                                filterTipo === tipo
                                  ? tipo === "CF"
                                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                                    : "border-slate-400/30 bg-slate-500/15 text-slate-300"
                                  : "border-white/[0.07] text-slate-500 hover:border-white/[0.15] hover:text-slate-300"
                              }`}
                            >
                              {tipo === "CF" ? "Conta Fixa" : "Conta Variável"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Forma de Pagamento */}
                    {availablePaymentMethods.length > 0 && (
                      <div className="mb-4">
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Forma de Pagamento</p>
                          {filterPaymentMethods.size > 0 && (
                            <button
                              onClick={() => { setFilterPaymentMethods(new Set()); setSelectedIds(new Set()); }}
                              className="text-[10px] text-slate-600 transition hover:text-slate-400"
                            >
                              limpar
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {availablePaymentMethods.map((method) => (
                            <button
                              key={method}
                              onClick={() => togglePaymentMethod(method)}
                              className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                                filterPaymentMethods.has(method)
                                  ? "bg-accentPositive/20 text-accentPositive ring-1 ring-accentPositive/30"
                                  : "bg-white/[0.05] text-slate-400 hover:bg-white/[0.09] hover:text-slate-300"
                              }`}
                            >
                              {method}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Período */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Período</p>
                        {(filterDateFrom || filterDateTo) && (
                          <button
                            onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); setSelectedIds(new Set()); }}
                            className="text-[10px] text-slate-600 transition hover:text-slate-400"
                          >
                            limpar
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        {([
                          { label: "De",  value: filterDateFrom, set: setFilterDateFrom, min: dateRange.min, max: filterDateTo || dateRange.max },
                          { label: "Até", value: filterDateTo,   set: setFilterDateTo,   min: filterDateFrom || dateRange.min, max: dateRange.max },
                        ] as const).map(({ label, value, set, min, max }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-right text-xs text-slate-500">{label}</span>
                            <input
                              type="date"
                              value={value}
                              min={min}
                              max={max}
                              onChange={(e) => { set(e.target.value); setSelectedIds(new Set()); }}
                              className="flex-1 rounded-lg border border-white/[0.07] bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-300 outline-none transition focus:border-accentPositive/40 [color-scheme:dark]"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Valor */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Valor (R$)</p>
                      <div className="flex flex-col gap-2">
                        {[
                          { label: "De",  value: valueMin, onChange: setValueMin,  placeholder: "0,00" },
                          { label: "Até", value: valueMax, onChange: setValueMax, placeholder: "99.999,00" },
                        ].map(({ label, value, onChange, placeholder }) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-right text-xs text-slate-500">{label}</span>
                            <div className="relative flex-1">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">R$</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={value}
                                onChange={(e) => { onChange(digitsToBRLInput(e.target.value)); setSelectedIds(new Set()); }}
                                placeholder={placeholder}
                                className="w-full rounded-lg border border-white/[0.07] bg-slate-800/60 py-1.5 pl-8 pr-2.5 text-xs tabular-nums text-slate-300 placeholder-slate-600 outline-none transition focus:border-accentPositive/40"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Ordenar por valor */}
                    <div>
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ordenar por valor</p>
                      <div className="flex flex-col gap-1.5">
                        {([
                          { mode: "valor-desc", label: "Maior → menor" },
                          { mode: "valor-asc",  label: "Menor → maior" },
                        ] as const).map(({ mode, label }) => {
                          const active = sortMode === mode;
                          return (
                            <button
                              key={mode}
                              onClick={() => { setSortMode(active ? "none" : mode); setSelectedIds(new Set()); }}
                              className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? "border-accentPositive/30 bg-accentPositive/10 text-accentPositive"
                                  : "border-white/[0.07] bg-slate-800/60 text-slate-400 hover:border-white/[0.15] hover:text-slate-200"
                              }`}
                            >
                              <span className="flex items-center gap-1.5">
                                {mode === "valor-desc" ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />}
                                {label}
                              </span>
                              {active && <Check size={13} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Footer: limpar tudo */}
                  {isActive && (
                    <div className="border-t border-white/[0.06] px-4 py-2.5">
                      <button
                        onClick={clearAll}
                        className="flex w-full items-center justify-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-300"
                      >
                        <X size={11} />
                        Limpar todos os filtros
                      </button>
                    </div>
                  )}
                </div>,
                document.body
              )}
            </div>
          );
        })()}

        {/* Contador de resultados quando filtrando */}
        {(searchQuery || onlyUncategorized || onlyAutoCategorized || filterTipo || valueMin || valueMax ||
          filterPaymentMethods.size > 0 || filterDateFrom || filterDateTo || sortMode !== "none") && (
          <span className="ml-auto text-xs text-slate-500">
            {visibleTransactions.length} resultado{visibleTransactions.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Virtualized table */}
      <div className="overflow-hidden rounded-xl ring-1 ring-white/[0.07]">
        {flashCount > 0 && (
          <div className="flex items-center gap-2 bg-accentPositive/10 px-4 py-2 text-xs font-medium text-accentPositive ring-1 ring-accentPositive/20">
            <span className="h-1.5 w-1.5 rounded-full bg-accentPositive" />
            Categoria aplicada em {flashCount} {flashCount === 1 ? "transação" : "transações"}
          </div>
        )}

        {/* Scroll container — virtualizer scrolls this */}
        <div
          ref={scrollRef}
          style={{ overflowY: "auto", height: "calc(100vh - 300px)", minHeight: 200 }}
        >
          <table className="w-full text-sm">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10 bg-slate-800/95 text-left backdrop-blur-sm">
              <tr>
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Data</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Forma</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Terceiro</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500" title="Selecione e pressione F2 para copiar para baixo">
                  Categoria <span className="text-slate-600">· F2 ↓</span>
                </th>
                {showTipo && (
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
                )}
                <th className="px-3 py-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-white/[0.04] bg-bgSecondary/30">
              {/* Top spacer */}
              {paddingTop > 0 && (
                <tr style={{ height: paddingTop }}>
                  <td colSpan={colCount} />
                </tr>
              )}

              {/* Virtual rows */}
              {virtualItems.map((virtualRow) => {
                const tx         = visibleTransactions[virtualRow.index];
                const isSelected = selectedIds.has(tx.id);
                const isJustCategorized = keepVisibleIds.has(tx.id);
                return (
                  <tr
                    key={tx.id}
                    style={{ height: ROW_HEIGHT }}
                    className={`group transition-colors duration-100 hover:bg-white/[0.03] ${
                      isSelected
                        ? "bg-accentPositive/[0.04]"
                        : isJustCategorized
                        ? "bg-emerald-500/[0.04]"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <Checkbox checked={isSelected} onChange={() => toggleOne(tx.id)} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{formatDate(tx.date)}</td>
                    <td className="px-4 py-2.5 font-medium tabular-nums text-slate-100">{toCurrencyBRL(tx.amount)}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={PAYMENT_METHODS.includes(tx.paymentMethod as typeof PAYMENT_METHODS[number]) ? tx.paymentMethod : "Não informado"}
                        onChange={(e) => updatePaymentMethod(tx.id, e.target.value)}
                        className="rounded-lg border border-white/[0.08] bg-slate-800/60 px-2 py-1 text-xs text-slate-300 outline-none transition hover:border-white/20 focus:border-accentPositive/40"
                      >
                        {!PAYMENT_METHODS.includes(tx.paymentMethod as typeof PAYMENT_METHODS[number]) && (
                          <option value={tx.paymentMethod}>{tx.paymentMethod}</option>
                        )}
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        {tx.manual && (
                          <span title="Inserida manualmente" className="text-slate-500">
                            <Pencil size={11} strokeWidth={2} />
                          </span>
                        )}
                        {tx.thirdParty}
                        {tx.flagged && (
                          <span className="text-amber-400" title={tx.flagReason ?? "Revisar"}>⚠</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <CategoryBadge category={tx.category} />
                        {/* Indicador visual: recém-categorizado (enquanto keep-visible está ativo) */}
                        {isJustCategorized && (
                          <span title="Categorizado" className="flex items-center text-emerald-400/60">
                            <Check size={11} strokeWidth={3} />
                          </span>
                        )}
                        {tx.fromMemory && !isJustCategorized && (
                          <span title="Categoria lembrada — você já categorizou esse terceiro assim antes" className="flex items-center text-sky-400/70">
                            <History size={11} strokeWidth={2.5} />
                          </span>
                        )}
                        {tx.autoCategorized && !tx.fromMemory && !isJustCategorized && (
                          <span title="Categorizado automaticamente" className="flex items-center text-emerald-400/60">
                            <Zap size={11} strokeWidth={2.5} />
                          </span>
                        )}
                        {tx.memoryConflict && tx.memoryConflict.length > 0 && (
                          <span
                            title={`Esse terceiro já foi categorizado de formas diferentes: ${tx.memoryConflict.join(", ")}. Escolha manualmente.`}
                            className="flex items-center text-amber-400"
                          >
                            <AlertTriangle size={11} strokeWidth={2.5} />
                          </span>
                        )}
                        <CategorySelector
                          value={tx.category}
                          subCategory={tx.subCategory}
                          groups={categoryGroups}
                          categoryType={categoryType}
                          onSelect={(cat, sub) => {
                            lastChangedIdxRef.current = virtualRow.index;
                            handleChangeCategory(tx.id, cat, sub);
                          }}
                        />
                        {/* Sugestões (terceiro categorizado de formas diferentes) — clique aplica */}
                        {tx.memoryConflict && tx.memoryConflict.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-600">sugestões:</span>
                            {tx.memoryConflict.slice(0, 3).map((cat) => (
                              <button
                                key={cat}
                                onClick={() => {
                                  lastChangedIdxRef.current = virtualRow.index;
                                  handleChangeCategory(tx.id, cat);
                                }}
                                title={`Aplicar "${cat}"`}
                                className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/20 transition hover:bg-amber-500/20"
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    {showTipo && (
                      <td className="px-4 py-2.5">
                        {(() => {
                          const key = getTipoKey(tx);
                          if (!key) return <span className="text-xs text-slate-600">—</span>;
                          const isCF = fixedCategoryIds.includes(key);
                          return (
                            <button
                              onClick={() => onToggleTipo?.(key)}
                              title={isCF ? "Clique para mudar para CV" : "Clique para mudar para CF"}
                              className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                                isCF
                                  ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                                  : "bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                              }`}
                            >
                              {isCF ? "CF" : "CV"}
                            </button>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => toggleIgnored(tx.id)}
                        title="Ignorar transação"
                        className="flex items-center justify-center rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                      >
                        <EyeOff size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Bottom spacer */}
              {paddingBottom > 0 && (
                <tr style={{ height: paddingBottom }}>
                  <td colSpan={colCount} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-slate-900/95 px-4 py-3 shadow-2xl shadow-black/60 backdrop-blur-md ring-1 ring-black/30">
            {/* Count + soma */}
            <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <Tag size={14} className="text-accentPositive" />
              <span>{selectedIds.size} {selectedIds.size === 1 ? "selecionada" : "selecionadas"}</span>
              <span className="tabular-nums font-semibold text-accentPositive">
                {toCurrencyBRL(transactions.reduce((a, tx) => selectedIds.has(tx.id) ? a + Math.abs(tx.amount) : a, 0))}
              </span>
            </div>

            <div className="h-4 w-px bg-white/10" />

            {/* Category picker inline */}
            <div className="flex items-center gap-2">
              <CategorySelector
                value={bulkCategory}
                groups={categoryGroups}
                categoryType={categoryType}
                onSelect={(cat, sub) => { setBulkCategory(cat); setBulkSubCategory(sub); }}
              />
              {bulkCategory && (
                <span className="text-xs text-slate-400">
                  {bulkSubCategory ?? bulkCategory}
                </span>
              )}
            </div>

            {/* Apply button */}
            <button
              onClick={applyBulkCategory}
              disabled={!bulkCategory}
              className="rounded-lg bg-accentPositive px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Aplicar
            </button>

            <div className="h-4 w-px bg-white/10" />

            {/* Clear selection */}
            <button
              onClick={() => setSelectedIds(new Set())}
              title="Limpar seleção"
              className="rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
