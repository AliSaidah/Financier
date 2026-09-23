import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { UpdateChecker } from "./components/UpdateChecker";
import { SettingsModal } from "./components/SettingsModal";
import { CfCvSetupModal } from "./components/CfCvSetupModal";
import { exportTransactionsExcel } from "./utils/excelExporter";
import { parseOfxFile } from "./utils/csvParser";
import { applyBlacklist } from "./utils/blacklist";
import { useFinancierStore } from "./store/useFinancierStore";
import { PagamentosPage } from "./pages/Pagamentos";
import { RecebimentosPage } from "./pages/Recebimentos";
import { ResumoPage } from "./pages/Resumo";
import { PainelPage } from "./pages/Painel";
import { HistoricoPage } from "./pages/Historico";
import { ContasPage } from "./pages/Contas";
import { FinanceiroPage } from "./pages/Financeiro";
import { UploadPage } from "./pages/Upload";
import { HistoryEntry, Transaction } from "./types/finance";
import { BANKS } from "./data/constants";
import { mergeWithoutDuplicates } from "./utils/duplicateDetector";
import { applyRule } from "./utils/categoryRules";
import { MovimentacaoReport, type MovScope } from "./components/MovimentacaoReport";
import { MovimentacaoModal } from "./components/MovimentacaoModal";
import { generatePdfFromElement } from "./utils/pdfFromElement";
import { AlertTriangle, CheckCircle2, FileDown, FileSpreadsheet, ArrowRightLeft, ChevronDown, X } from "lucide-react";

function readTransactionDate(dateValue: string): Date {
  const value = String(dateValue ?? "").trim();
  // ISO-like YYYY-MM-DD — parse as local midnight to avoid UTC offset shifting the day
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  // DD/MM/YYYY
  const ddmmyyyy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
  // Last resort: native parse (may still have UTC issues for some formats)
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function latestMonthYear(transactions: Transaction[]): { month: number; year: number } {
  if (!transactions.length) {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }
  const latest = transactions.reduce((acc, tx) => {
    const current = readTransactionDate(tx.date);
    return current > acc ? current : acc;
  }, readTransactionDate(transactions[0].date));
  return { month: latest.getMonth(), year: latest.getFullYear() };
}

const PAGE_TRANSITION = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
  transition: { duration: 0.18, ease: "easeOut" as const }
};

function App() {
  const {
    activeTab,
    selectedBank,
    monthFilter,
    yearFilter,
    transactions,
    history,
    users,
    activeUserId,
    setActiveTab,
    setSelectedBank,
    setTransactions,
    setPeriod,
    updateTransactionCategory,
    clearData,
    clearCategoriesForIds,
    addHistoryEntry,
    removeHistoryEntry,
    fixedCategoryIds,
    cfCvConfigured,
    setFixedCategories,
    toggleFixedCategory,
  } = useFinancierStore();

  const activeUser = users.find((u) => u.id === activeUserId) ?? null;

  const [showSettings, setShowSettings] = useState(false);
  const [showCfCvModal, setShowCfCvModal] = useState(false);
  const [showUncategorizedWarning, setShowUncategorizedWarning] = useState(false);
  const [appendToast, setAppendToast] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Relatório de movimentação (PDF) ──────────────────────────────────────
  const [showReportMenu, setShowReportMenu] = useState(false);
  const [showMovModal, setShowMovModal]     = useState(false);
  const [movParams, setMovParams]           = useState<{ scope: MovScope; from: string; to: string } | null>(null);
  const [movLoading, setMovLoading]         = useState(false);
  const [movSuccess, setMovSuccess]         = useState<string | null>(null);
  const movReportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appendToast) return;
    const t = setTimeout(() => setAppendToast(null), 7000);
    return () => clearTimeout(t);
  }, [appendToast]);

  const years = useMemo(() => {
    const unique = new Set(transactions.map((tx) => readTransactionDate(tx.date).getFullYear()));
    if (!unique.size) unique.add(new Date().getFullYear());
    return [...unique].sort((a, b) => b - a);
  }, [transactions]);

  const availablePeriods = useMemo(() => {
    if (!transactions.length) {
      const now = new Date();
      return [{ year: now.getFullYear(), month: now.getMonth() }];
    }
    const seen = new Set<string>();
    const result: { year: number; month: number }[] = [];
    transactions.forEach((tx) => {
      const d = readTransactionDate(tx.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    });
    return result.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [transactions]);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((tx) => {
        const date = readTransactionDate(tx.date);
        return date.getMonth() === monthFilter && date.getFullYear() === yearFilter && !tx.ignored;
      }),
    [transactions, monthFilter, yearFilter]
  );

  const recebimentos = useMemo(() => filteredTransactions.filter((tx) => tx.amount >= 0), [filteredTransactions]);
  const pagamentos   = useMemo(() => filteredTransactions.filter((tx) => tx.amount < 0),  [filteredTransactions]);

  // IDs das transações da aba ativa (para "Limpar categorias")
  const activeTabTransactionIds = useMemo(() => {
    if (activeTab === "recebimentos") return recebimentos.map((tx) => tx.id);
    if (activeTab === "pagamentos")   return pagamentos.map((tx) => tx.id);
    if (activeTab === "resumo")       return filteredTransactions.map((tx) => tx.id);
    return [];
  }, [activeTab, recebimentos, pagamentos, filteredTransactions]);

  // Livro-caixa contínuo: todo upload ACUMULA no ledger do perfil ativo.
  const applyParsedTransactions = (parsed: Transaction[]) => {
    const cleaned = selectedBank ? applyBlacklist(parsed, selectedBank) : parsed;

    // ── Memória de categorias: aplica as regras aprendidas (store persistido) ──
    // Regra fixa/única → aplica sozinha; terceiro com histórico misto → deixa
    // "Sem categoria" com sugestões ranqueadas por valor (memoryConflict).
    const rules = useFinancierStore.getState().categoryRules;
    const withLearned = cleaned.map((tx) => applyRule(rules, tx));

    // Acumula no ledger existente (dedup robusto). O que já está no ledger
    // (com edições/categorizações) prevalece; só as transações novas entram.
    const merged = mergeWithoutDuplicates(transactions, withLearned);
    const nextTransactions = merged.merged;
    const added = withLearned.length - merged.ignoredCount;
    const addedLabel = `${added} ${added === 1 ? "transação adicionada" : "novas transações adicionadas"}`;
    setAppendToast(
      merged.ignoredCount > 0
        ? `${addedLabel} · ${merged.ignoredCount} ${merged.ignoredCount === 1 ? "duplicada ignorada" : "duplicadas ignoradas"}`
        : added > 0
        ? addedLabel
        : "Nenhuma transação nova — todas já estavam neste perfil"
    );

    // Registro no Histórico = ESTE upload (só o extrato novo)
    if (withLearned.length > 0 && selectedBank) {
      const dates     = withLearned.map((tx) => tx.date).sort();
      const bankLabel = BANKS.find((b) => b.id === selectedBank)?.label ?? selectedBank;
      const entry: HistoryEntry = {
        id:           `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bankId:       selectedBank,
        bankLabel,
        transactions: withLearned,
        dateFrom:     dates[0],
        dateTo:       dates[dates.length - 1],
        uploadedAt:   new Date().toISOString(),
      };
      addHistoryEntry(entry);
    }

    setTransactions(nextTransactions);
    // Pula o período para o mês mais recente do extrato recém-enviado
    if (withLearned.length > 0) {
      const latest = latestMonthYear(withLearned);
      setPeriod(latest.month, latest.year);
    }
    setActiveTab("recebimentos");
    // Mostra configuração CF/CV na primeira importação que tiver pagamentos
    if (!cfCvConfigured && nextTransactions.some((tx) => tx.amount < 0)) {
      setShowCfCvModal(true);
    }
  };

  const handleFile = async (file: File): Promise<void> => {
    if (!selectedBank) return;
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseOfxFile(buffer, selectedBank);
      if (!parsed.length) {
        setUploadError("Nenhuma transação encontrada. Verifique se o arquivo OFX é válido e pertence ao banco selecionado.");
        return;
      }
      // Livro-caixa contínuo: sempre acumula (dedup cuida de sobreposições).
      applyParsedTransactions(parsed);
    } catch {
      setUploadError("Não foi possível ler o arquivo. Certifique-se de que é um extrato OFX válido.");
    }
  };

  // No ledger contínuo, "Carregar" um extrato do histórico apenas navega até o
  // mês dele (os dados já estão todos no ledger consolidado).
  const handleLoadFromHistory = (entry: HistoryEntry) => {
    const latest = latestMonthYear(entry.transactions);
    setPeriod(latest.month, latest.year);
    setActiveTab("recebimentos");
  };

  const handleManualPeriodChange = (month: number, year: number) => {
    setPeriod(month, year);
  };

  const uncategorizedCount = useMemo(
    () => transactions.filter((tx) => !tx.ignored && (!tx.category || tx.category === "Sem categoria")).length,
    [transactions]
  );

  const doExport = () => exportTransactionsExcel(transactions.filter((tx) => !tx.ignored), monthFilter, yearFilter, fixedCategoryIds);

  const handleExportClick = () => {
    if (uncategorizedCount > 0) {
      setShowUncategorizedWarning(true);
    } else {
      doExport();
    }
  };

  // ── Relatório de movimentação diária ─────────────────────────────────────
  const ledger = useMemo(() => transactions.filter((tx) => !tx.ignored), [transactions]);

  // Intervalo padrão: menor e maior data do livro-caixa (fallback: hoje)
  const defaultRange = useMemo(() => {
    const isoDates = ledger
      .map((tx) => (tx.date.match(/^\d{4}-\d{2}-\d{2}/) ? tx.date.slice(0, 10) : null))
      .filter((d): d is string => d !== null)
      .sort();
    if (isoDates.length === 0) {
      const today = new Date();
      const iso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
      return { from: iso, to: iso };
    }
    return { from: isoDates[0], to: isoDates[isoDates.length - 1] };
  }, [ledger]);

  const handleGenerateMovReport = (scope: MovScope, from: string, to: string) => {
    setShowMovModal(false);
    setMovParams({ scope, from, to });
    // Espera o relatório off-screen re-renderizar com os novos parâmetros
    setMovLoading(true);
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      const el = movReportRef.current;
      if (!el) { setMovLoading(false); return; }
      try {
        const scopeTag = scope === "entradas" ? "-entradas" : scope === "saidas" ? "-saidas" : "";
        const fileName = `movimentacao-${from}-a-${to}${scopeTag}.pdf`;
        await generatePdfFromElement(el, fileName);
        setMovSuccess(fileName);
        setTimeout(() => setMovSuccess(null), 6000);
      } catch (err) {
        console.error("Erro ao gerar relatório de movimentação:", err);
      } finally {
        setMovLoading(false);
      }
    }));
  };

  const currentTitle: Record<string, string> = {
    upload: "Upload", recebimentos: "Recebimentos", pagamentos: "Pagamentos",
    contas: "Contas", resumo: "Análise", painel: "Painel Gerencial", historico: "Histórico", financeiro: "Financeiro",
  };

  return (
    <div className="flex h-screen overflow-hidden bg-transparent text-textPrimary print:hidden">
      <Sidebar
        activeTab={activeTab}
        selectedBank={selectedBank}
        activeUser={activeUser}
        onChangeTab={setActiveTab}
        onChangeBank={() => {
          setSelectedBank(null);
          setActiveTab("upload");
        }}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        {activeTab !== "upload" && (
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-6 py-4 backdrop-blur-sm">
            <Header
              title={currentTitle[activeTab] ?? ""}
              onClearAll={activeTab !== "historico" && activeTab !== "contas" && activeTab !== "painel" ? clearData : undefined}
              onClearCategories={
                activeTab !== "historico" && activeTab !== "contas" && activeTab !== "painel" && activeTabTransactionIds.length > 0
                  ? () => clearCategoriesForIds(activeTabTransactionIds)
                  : undefined
              }
            />
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Aviso: terceiros com categorizações divergentes na memória */}
          {(activeTab === "recebimentos" || activeTab === "pagamentos") && (() => {
            const list = activeTab === "recebimentos" ? recebimentos : pagamentos;
            const count = list.filter((tx) => tx.memoryConflict && tx.memoryConflict.length > 0).length;
            if (count === 0) return null;
            return (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
                <AlertTriangle size={14} className="shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300">
                  {count === 1
                    ? "1 transação ficou sem categoria porque o terceiro já foi categorizado de formas diferentes."
                    : `${count} transações ficaram sem categoria porque os terceiros já foram categorizados de formas diferentes.`}{" "}
                  <span className="text-amber-300/70">Procure o ícone de alerta na tabela e escolha manualmente.</span>
                </p>
              </div>
            );
          })()}
          <AnimatePresence mode="wait">
            {activeTab === "upload" && (
              <motion.div key="upload" {...PAGE_TRANSITION}>
                <UploadPage
                  selectedBank={selectedBank}
                  onBankSelect={setSelectedBank}
                  onFile={handleFile}
                  uploadError={uploadError}
                  onClearError={() => setUploadError(null)}
                  activeUserName={activeUser?.name ?? "Principal"}
                />
              </motion.div>
            )}
            {activeTab === "recebimentos" && (
              <motion.div key="recebimentos" {...PAGE_TRANSITION}>
                <RecebimentosPage
                  recebimentos={recebimentos}
                  onChangeCategory={updateTransactionCategory}
                  month={monthFilter}
                  year={yearFilter}
                  availablePeriods={availablePeriods}
                  onChangePeriod={handleManualPeriodChange}
                />
              </motion.div>
            )}
            {activeTab === "pagamentos" && (
              <motion.div key="pagamentos" {...PAGE_TRANSITION}>
                <PagamentosPage
                  pagamentos={pagamentos}
                  onChangeCategory={updateTransactionCategory}
                  month={monthFilter}
                  year={yearFilter}
                  availablePeriods={availablePeriods}
                  onChangePeriod={handleManualPeriodChange}
                  fixedCategoryIds={fixedCategoryIds}
                  onToggleTipo={toggleFixedCategory}
                />
              </motion.div>
            )}
            {activeTab === "contas" && (
              <motion.div key="contas" {...PAGE_TRANSITION}>
                <ContasPage />
              </motion.div>
            )}
            {activeTab === "resumo" && (
              <motion.div key="resumo" {...PAGE_TRANSITION}>
                <ResumoPage
                  pagamentos={pagamentos}
                  recebimentos={recebimentos}
                  fixedCategoryIds={fixedCategoryIds}
                  month={monthFilter}
                  year={yearFilter}
                  availablePeriods={availablePeriods}
                  onChangePeriod={handleManualPeriodChange}
                />
              </motion.div>
            )}
            {activeTab === "painel" && (
              <motion.div key="painel" {...PAGE_TRANSITION}>
                <PainelPage />
              </motion.div>
            )}
            {activeTab === "historico" && (
              <motion.div key="historico" {...PAGE_TRANSITION}>
                <HistoricoPage
                  history={history}
                  onLoad={handleLoadFromHistory}
                  onDelete={removeHistoryEntry}
                />
              </motion.div>
            )}
            {activeTab === "financeiro" && (
              <motion.div key="financeiro" {...PAGE_TRANSITION} className="-mx-6 -my-5 flex h-full flex-col">
                <FinanceiroPage />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer actions */}
          {activeTab !== "upload" && activeTab !== "historico" && activeTab !== "contas" && activeTab !== "painel" && activeTab !== "financeiro" && (
            <div className="mt-5 flex items-center gap-3">
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowReportMenu((v) => !v)}
                  disabled={movLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
                >
                  <FileDown size={15} />
                  Gerar relatório
                  <ChevronDown size={13} className={`transition-transform ${showReportMenu ? "rotate-180" : ""}`} />
                </button>
                {showReportMenu && !movLoading && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowReportMenu(false)} />
                    <div className="absolute bottom-full right-0 z-30 mb-2 w-64 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900 shadow-2xl">
                      <button
                        onClick={() => { setShowReportMenu(false); handleExportClick(); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <FileSpreadsheet size={17} className="shrink-0 text-emerald-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Planilha Excel</p>
                          <p className="text-[11px] text-slate-500">Dados + análise por categoria</p>
                        </div>
                        {uncategorizedCount > 0 && (
                          <span className="ml-auto rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                            {uncategorizedCount}
                          </span>
                        )}
                      </button>
                      <div className="h-px bg-white/[0.06]" />
                      <button
                        onClick={() => { setShowReportMenu(false); setShowMovModal(true); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.04]"
                      >
                        <ArrowRightLeft size={17} className="shrink-0 text-accentPositive" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">Relatório de movimentação</p>
                          <p className="text-[11px] text-slate-500">Entradas e saídas por dia · PDF</p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Uncategorized warning modal */}
      {showUncategorizedWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
            <div className="mb-1 flex items-center gap-2 text-amber-400">
              <span className="text-lg">⚠</span>
              <h2 className="font-semibold">Transações sem categoria</h2>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              {uncategorizedCount} {uncategorizedCount === 1 ? "transação ainda está" : "transações ainda estão"} sem categoria. O Excel será gerado assim mesmo, mas a aba de análise ficará incompleta.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowUncategorizedWarning(false)}
                className="flex-1 rounded-xl border border-white/[0.08] py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
              >
                Voltar e categorizar
              </button>
              <button
                onClick={() => { setShowUncategorizedWarning(false); doExport(); }}
                className="flex-1 rounded-xl bg-amber-500/20 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/30"
              >
                Exportar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {/* CF/CV setup modal */}
      {showCfCvModal && (
        <CfCvSetupModal
          onConfirm={(ids) => { setFixedCategories(ids); setShowCfCvModal(false); }}
        />
      )}

      {/* Modal: escolher escopo + intervalo do relatório de movimentação */}
      {showMovModal && (
        <MovimentacaoModal
          defaultFrom={defaultRange.from}
          defaultTo={defaultRange.to}
          onConfirm={handleGenerateMovReport}
          onClose={() => setShowMovModal(false)}
        />
      )}

      {/* Relatório de movimentação (off-screen, capturado pelo html2canvas) */}
      {movParams && (
        <MovimentacaoReport
          ref={movReportRef}
          transactions={ledger}
          from={movParams.from}
          to={movParams.to}
          scope={movParams.scope}
          userName={activeUser?.name ?? "Principal"}
        />
      )}

      {/* Overlay de loading da geração do PDF */}
      {movLoading && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3" style={{ zIndex: 10000, background: "rgba(15,23,42,0.88)", backdropFilter: "blur(4px)" }}>
          <svg className="animate-spin" width={28} height={28} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-slate-200">Gerando relatório…</p>
        </div>
      )}

      {/* Toast: relatório de movimentação baixado */}
      {movSuccess && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-slate-900 to-[#0d1426] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          style={{ zIndex: 10001 }}
        >
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Relatório baixado com sucesso</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{movSuccess} · pasta Downloads</p>
          </div>
          <button
            onClick={() => setMovSuccess(null)}
            className="ml-1 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <UpdateChecker />

      {/* Toast: resultado do upload (livro-caixa contínuo) */}
      {appendToast && (
        <div
          className="fixed bottom-6 right-6 flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-gradient-to-b from-slate-900 to-[#0d1426] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
          style={{ zIndex: 10001 }}
        >
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Extrato complementado</p>
            <p className="mt-0.5 text-xs text-slate-400">{appendToast}</p>
          </div>
          <button
            onClick={() => setAppendToast(null)}
            className="ml-1 shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
