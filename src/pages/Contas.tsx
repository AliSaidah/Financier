import { useMemo, useRef, useState } from "react";
import {
  Plus, ChevronLeft, ChevronRight, CheckCircle2, Circle,
  Trash2, Pencil, Wallet, AlertTriangle, RotateCcw, RefreshCw,
  Search, FileDown, X,
} from "lucide-react";
import { Conta } from "../types/finance";
import { useFinancierStore } from "../store/useFinancierStore";
import { toCurrencyBRL, splitParcelas } from "../lib/formatters";
import { ContaModal, vencimentoValido } from "../components/ContaModal";
import { ContasReport } from "../components/ContasReport";
import { ContasReportConsolidado, UserContasBlock } from "../components/ContasReportConsolidado";
import { ContasReportModal, ContasReportConfig } from "../components/ContasReportModal";
import { generatePdfFromElement } from "../utils/pdfFromElement";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseDateLocal(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(iso);
}

// Soma N meses a uma data ISO, mantendo o dia (com clamp para fim de mês)
function addMonthsISO(iso: string, n: number): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const target = new Date(+m[1], +m[2] - 1 + n, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(+m[3], daysInMonth);
  return [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

type DueStatus = "vencida" | "hoje" | "proxima" | "futura" | "quitada";

function daysUntilDue(conta: Conta): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseDateLocal(conta.vencimento);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function getDueStatus(conta: Conta): DueStatus {
  if (conta.status === "quitado") return "quitada";
  const diff = daysUntilDue(conta);
  if (diff < 0) return "vencida";
  if (diff === 0) return "hoje";
  if (diff <= 7) return "proxima";
  return "futura";
}

const STATUS_BAR: Record<DueStatus, string> = {
  vencida: "bg-red-500",
  hoje:    "bg-amber-400",
  proxima: "bg-blue-400",
  futura:  "bg-slate-600",
  quitada: "bg-emerald-500",
};

const STATUS_DATE_COLOR: Record<DueStatus, string> = {
  vencida: "text-red-400",
  hoje:    "text-amber-400",
  proxima: "text-blue-400",
  futura:  "text-slate-400",
  quitada: "text-emerald-400",
};

const STATUS_LABEL: Record<DueStatus, string> = {
  vencida: "Vencida",
  hoje:    "Vence hoje",
  proxima: "",
  futura:  "",
  quitada: "Quitado",
};

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, warn,
}: { label: string; value: string; sub?: string; color: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl bg-bgSecondary p-4 ring-1 ${warn ? "ring-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]" : "ring-white/[0.07]"}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums tracking-tight ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-slate-600">{sub}</p>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type TipoFilter   = "pagar" | "receber";
type StatusFilter = "todas" | "abertas" | "quitadas";
type SortMode     = "padrao" | "venc-asc" | "venc-desc" | "valor-desc" | "valor-asc";

export function ContasPage() {
  const { contas, addConta, updateConta, deleteConta, toggleContaQuitado, users, activeUserId, getAllUsersContas } = useFinancierStore();
  const activeUserName = users.find((u) => u.id === activeUserId)?.name ?? "Principal";

  // Período local (independente do período do extrato)
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year,  setYear]  = useState(today.getFullYear());

  const [tipoFilter, setTipoFilter]         = useState<TipoFilter>("pagar");
  const [statusFilter, setStatusFilter]     = useState<StatusFilter>("todas");
  const [sortMode, setSortMode]             = useState<SortMode>("padrao");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchQuery, setSearchQuery]       = useState("");
  const [showModal,  setShowModal]          = useState(false);
  const [editingConta, setEditingConta]     = useState<Conta | null>(null);
  const [confirmingQuit, setConfirmingQuit] = useState<Conta | null>(null);
  const [pdfLoading, setPdfLoading]         = useState(false);
  const [pdfSuccess, setPdfSuccess]         = useState<string | null>(null);
  const [reportScope, setReportScope]       = useState<"pagar" | "receber" | "ambas">("ambas");
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPeriodLabel, setReportPeriodLabel] = useState<string | undefined>(undefined);
  const [reportStatusLabel, setReportStatusLabel] = useState<string | undefined>(undefined);
  const [singlePagar, setSinglePagar]       = useState<Conta[]>([]);
  const [singleReceber, setSingleReceber]   = useState<Conta[]>([]);
  const [consolidadoBlocks, setConsolidadoBlocks] = useState<UserContasBlock[] | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const consolidadoRef = useRef<HTMLDivElement>(null);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  // ── Contas com data inválida (ex: ano 0112 digitado errado) ─────────────
  const invalidContas = useMemo(
    () => contas.filter((c) => !vencimentoValido(c.vencimento)),
    [contas]
  );

  // ── Contas do mês/ano selecionado ────────────────────────────────────────
  const monthContas = useMemo(() => contas.filter((c) => {
    const d = parseDateLocal(c.vencimento);
    return d.getMonth() === month && d.getFullYear() === year;
  }), [contas, month, year]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const aPagarAbertas   = monthContas.filter((c) => c.tipo === "pagar"   && c.status === "aberto");
  const aReceberAbertas = monthContas.filter((c) => c.tipo === "receber" && c.status === "aberto");
  const pagasMes        = monthContas.filter((c) => c.tipo === "pagar"   && c.status === "quitado");
  const recebidasMes    = monthContas.filter((c) => c.tipo === "receber" && c.status === "quitado");

  const aPagarMes    = aPagarAbertas.reduce((s, c) => s + c.valor, 0);
  const aReceberMes  = aReceberAbertas.reduce((s, c) => s + c.valor, 0);
  const pagoMes      = pagasMes.reduce((s, c) => s + c.valor, 0);
  const recebidoMes  = recebidasMes.reduce((s, c) => s + c.valor, 0);

  // Saldo previsto = TODAS as contas do mês (abertas + quitadas),
  // senão pagar uma conta faria o "previsto" melhorar artificialmente
  const totalReceberMes = aReceberMes + recebidoMes;
  const totalPagarMes   = aPagarMes + pagoMes;
  const saldoPrevisto   = totalReceberMes - totalPagarMes;

  const vencidasPagarCount   = contas.filter((c) => c.tipo === "pagar"   && c.status === "aberto" && c.vencimento < todayStr).length;
  const vencidasReceberCount = contas.filter((c) => c.tipo === "receber" && c.status === "aberto" && c.vencimento < todayStr).length;

  // ── Categorias disponíveis no mês ────────────────────────────────────────
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    monthContas.forEach((c) => { if (c.category) set.add(c.category); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [monthContas]);

  // ── Lista: contas do mês, filtradas e ordenadas ──────────────────────────
  const listContas = useMemo(() => {
    let list = monthContas.filter((c) => c.tipo === tipoFilter);
    if (categoryFilter) list = list.filter((c) => c.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) => c.descricao.toLowerCase().includes(q));
    }
    if (statusFilter === "abertas")  list = list.filter((c) => c.status === "aberto");
    if (statusFilter === "quitadas") list = list.filter((c) => c.status === "quitado");

    // Ordenação explícita: lista única ordenada pelo critério escolhido
    if (sortMode !== "padrao") {
      return [...list].sort((a, b) => {
        switch (sortMode) {
          case "venc-asc":   return a.vencimento.localeCompare(b.vencimento);
          case "venc-desc":  return b.vencimento.localeCompare(a.vencimento);
          case "valor-desc": return b.valor - a.valor;
          case "valor-asc":  return a.valor - b.valor;
        }
      });
    }

    // Padrão: abertas primeiro (mais próximas do vencimento), quitadas depois
    const abertas  = list.filter((c) => c.status === "aberto").sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const quitadas = list.filter((c) => c.status === "quitado").sort((a, b) => b.vencimento.localeCompare(a.vencimento));
    return [...abertas, ...quitadas];
  }, [monthContas, tipoFilter, categoryFilter, searchQuery, statusFilter, sortMode]);

  // ── Totalizadores do rodapé ──────────────────────────────────────────────
  const totalPagarVisivel   = listContas.filter((c) => c.tipo === "pagar").reduce((s, c) => s + c.valor, 0);
  const totalReceberVisivel = listContas.filter((c) => c.tipo === "receber").reduce((s, c) => s + c.valor, 0);

  // ── Relatório configurável (filtros: perfil, tipo, status, período) ──────
  // Filtra uma lista de contas conforme o recorte escolhido no modal.
  function filterContasForReport(list: Conta[], cfg: ContasReportConfig): Conta[] {
    return list.filter((c) => {
      // status
      if (cfg.status !== "todas" && c.status !== cfg.status) return false;
      // período (vencimento)
      if (cfg.periodo === "mes") {
        const d = parseDateLocal(c.vencimento);
        if (d.getMonth() !== month || d.getFullYear() !== year) return false;
      } else if (cfg.periodo === "data") {
        if (c.vencimento.slice(0, 10) !== cfg.data) return false;
      } else { // intervalo
        const v = c.vencimento.slice(0, 10);
        if (!cfg.from || !cfg.to || v < cfg.from || v > cfg.to) return false;
      }
      return true;
    });
  }

  function periodLabelFor(cfg: ContasReportConfig): string | undefined {
    if (cfg.periodo === "data") return `Vence em ${formatDate(cfg.data ?? "")}`;
    if (cfg.periodo === "intervalo") return `${formatDate(cfg.from ?? "")} — ${formatDate(cfg.to ?? "")}`;
    return undefined; // "mes" → usa "MonthName Ano"
  }
  function statusLabelFor(cfg: ContasReportConfig): string | undefined {
    if (cfg.status === "aberto")  return "Em aberto";
    if (cfg.status === "quitado") return "Quitadas";
    return undefined; // "todas"
  }

  const sortVenc = (a: Conta, b: Conta) => a.vencimento.localeCompare(b.vencimento);

  async function handleGenerateReport(cfg: ContasReportConfig) {
    if (pdfLoading) return;
    setShowReportModal(false);
    setReportScope(cfg.scope);
    setReportPeriodLabel(periodLabelFor(cfg));
    setReportStatusLabel(statusLabelFor(cfg));

    const consolidado = cfg.perfil === "todos";
    if (consolidado) {
      const blocks: UserContasBlock[] = getAllUsersContas().map(({ name, contas: uc }) => {
        const f = filterContasForReport(uc, cfg);
        return {
          name,
          contasPagar:   f.filter((c) => c.tipo === "pagar").sort(sortVenc),
          contasReceber: f.filter((c) => c.tipo === "receber").sort(sortVenc),
        };
      });
      setConsolidadoBlocks(blocks);
    } else {
      const f = filterContasForReport(contas, cfg);
      setSinglePagar(f.filter((c) => c.tipo === "pagar").sort(sortVenc));
      setSingleReceber(f.filter((c) => c.tipo === "receber").sort(sortVenc));
    }

    setPdfLoading(true);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const el = consolidado ? consolidadoRef.current : reportRef.current;
      if (!el) return;
      const scopeTag = cfg.scope === "pagar" ? "-a-pagar" : cfg.scope === "receber" ? "-a-receber" : "";
      const perfilTag = consolidado ? "-consolidado" : "";
      const periodoTag = cfg.periodo === "data" ? `-${cfg.data}` : cfg.periodo === "intervalo" ? `-${cfg.from}_a_${cfg.to}` : `-${year}-${String(month + 1).padStart(2, "0")}`;
      const fileName = `relatorio-contas${perfilTag}${periodoTag}${scopeTag}.pdf`;
      await generatePdfFromElement(el, fileName);
      setPdfSuccess(fileName);
      setTimeout(() => setPdfSuccess(null), 6000);
    } catch (err) {
      console.error("Erro ao gerar relatório de contas:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  function handleAdd(data: Omit<Conta, "id" | "createdAt">, parcelas?: number) {
    if (parcelas && parcelas > 1) {
      const valores = splitParcelas(data.valor, parcelas);
      valores.forEach((v, i) => {
        addConta({
          ...data,
          descricao: `${data.descricao} (${i + 1}/${parcelas})`,
          valor: v,
          vencimento: addMonthsISO(data.vencimento, i),
        });
      });
    } else {
      addConta(data);
    }
    setShowModal(false);
  }

  function handleEdit(data: Omit<Conta, "id" | "createdAt">) {
    if (!editingConta) return;
    updateConta(editingConta.id, data);
    setEditingConta(null);
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (contas.length === 0) {
    return (
      <div>
        {/* Empty state */}
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-2xl bg-accentPositive/10 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] ring-1 ring-white/[0.1]">
              <Wallet size={28} className="text-slate-400" />
            </div>
          </div>
          <p className="text-base font-semibold text-slate-300">Nenhuma conta cadastrada</p>
          <p className="mt-1 text-sm text-slate-500">Adicione contas a pagar ou a receber para acompanhar seus compromissos.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-5 flex items-center gap-2 rounded-xl bg-accentPositive/15 px-5 py-2.5 text-sm font-semibold text-accentPositive ring-1 ring-accentPositive/25 transition hover:bg-accentPositive/25"
          >
            <Plus size={15} />
            Nova conta
          </button>
        </div>
        {showModal && (
          <ContaModal defaultTipo={tipoFilter} onConfirm={handleAdd} onClose={() => setShowModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ── Aviso: contas com data inválida ───────────────────────────────── */}
      {invalidContas.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertTriangle size={13} className="shrink-0" />
            {invalidContas.length === 1
              ? "1 conta com data de vencimento inválida — corrija ou exclua:"
              : `${invalidContas.length} contas com data de vencimento inválida — corrija ou exclua:`}
          </p>
          <div className="mt-2 space-y-1.5">
            {invalidContas.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                  {c.descricao} <span className="text-slate-500">· venc. {formatDate(c.vencimento)} · {toCurrencyBRL(c.valor)}</span>
                </span>
                <button
                  onClick={() => setEditingConta(c)}
                  className="shrink-0 rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/25"
                >
                  Corrigir
                </button>
                <button
                  onClick={() => deleteConta(c.id)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-red-500/15 hover:text-red-400"
                >
                  Excluir
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat cards (dinâmicos por aba ativa) ──────────────────────────── */}
      {tipoFilter === "pagar" ? (
        <div className="mb-5 grid grid-cols-4 gap-3">
          <StatCard
            label="A pagar este mês"
            value={toCurrencyBRL(aPagarMes)}
            sub={`${aPagarAbertas.length} contas em aberto`}
            color={aPagarMes > 0 ? "text-red-400" : "text-slate-400"}
            warn={aPagarMes > 0}
          />
          <StatCard
            label="Pagas este mês"
            value={toCurrencyBRL(pagoMes)}
            sub={`${pagasMes.length} contas pagas`}
            color="text-slate-300"
          />
          <StatCard
            label="Vencidas a pagar"
            value={vencidasPagarCount === 0 ? "Nenhuma" : String(vencidasPagarCount)}
            sub={vencidasPagarCount === 0 ? "Tudo em dia" : vencidasPagarCount === 1 ? "conta vencida" : "contas vencidas"}
            color={vencidasPagarCount > 0 ? "text-red-400" : "text-accentPositive"}
            warn={vencidasPagarCount > 0}
          />
          <StatCard
            label="Saldo previsto do mês"
            value={toCurrencyBRL(saldoPrevisto)}
            sub={`${toCurrencyBRL(totalReceberMes)} receber − ${toCurrencyBRL(totalPagarMes)} pagar`}
            color={saldoPrevisto >= 0 ? "text-accentPositive" : "text-red-400"}
            warn={saldoPrevisto < 0}
          />
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-4 gap-3">
          <StatCard
            label="A receber este mês"
            value={toCurrencyBRL(aReceberMes)}
            sub={`${aReceberAbertas.length} contas em aberto`}
            color={aReceberMes > 0 ? "text-accentPositive" : "text-slate-400"}
          />
          <StatCard
            label="Recebidas este mês"
            value={toCurrencyBRL(recebidoMes)}
            sub={`${recebidasMes.length} contas recebidas`}
            color="text-slate-300"
          />
          <StatCard
            label="Vencidas a receber"
            value={vencidasReceberCount === 0 ? "Nenhuma" : String(vencidasReceberCount)}
            sub={vencidasReceberCount === 0 ? "Tudo em dia" : vencidasReceberCount === 1 ? "conta vencida" : "contas vencidas"}
            color={vencidasReceberCount > 0 ? "text-red-400" : "text-accentPositive"}
            warn={vencidasReceberCount > 0}
          />
          <StatCard
            label="Saldo previsto do mês"
            value={toCurrencyBRL(saldoPrevisto)}
            sub={`${toCurrencyBRL(totalReceberMes)} receber − ${toCurrencyBRL(totalPagarMes)} pagar`}
            color={saldoPrevisto >= 0 ? "text-accentPositive" : "text-red-400"}
            warn={saldoPrevisto < 0}
          />
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Navegação mês/ano */}
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-slate-800/60 px-1 py-1">
          <button onClick={prevMonth} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
            <ChevronLeft size={14} />
          </button>
          <span className="min-w-[120px] text-center text-sm font-medium text-slate-300">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white">
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Tipo filter chips */}
        <div className="flex rounded-xl border border-white/[0.08] bg-slate-800/60 p-1">
          {(["pagar", "receber"] as TipoFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTipoFilter(f)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                tipoFilter === f
                  ? f === "pagar"
                    ? "bg-red-500/15 text-red-300 ring-1 ring-red-500/25"
                    : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {f === "pagar" ? "A pagar" : "A receber"}
            </button>
          ))}
        </div>

        {/* Filtro de categoria */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 outline-none transition hover:border-white/[0.15] focus:border-accentPositive/30"
        >
          <option value="">Todas categorias</option>
          {availableCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        {/* Filtro de status */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 outline-none transition hover:border-white/[0.15] focus:border-accentPositive/30"
        >
          <option value="todas">Abertas e quitadas</option>
          <option value="abertas">Só em aberto</option>
          <option value="quitadas">Só quitadas</option>
        </select>

        {/* Ordenação */}
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 outline-none transition hover:border-white/[0.15] focus:border-accentPositive/30"
        >
          <option value="padrao">Ordem padrão</option>
          <option value="venc-asc">Data: mais próxima</option>
          <option value="venc-desc">Data: mais distante</option>
          <option value="valor-desc">Valor: maior → menor</option>
          <option value="valor-asc">Valor: menor → maior</option>
        </select>

        {/* Busca por descrição */}
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar descrição..."
            className="w-44 rounded-lg border border-white/[0.08] bg-slate-800/60 py-1.5 pl-8 pr-3 text-xs text-slate-300 placeholder-slate-600 outline-none transition focus:border-accentPositive/30"
          />
        </div>

        {/* Ações — push to right */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowReportModal(true)}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive disabled:cursor-wait disabled:opacity-50"
          >
            <FileDown size={13} />
            {pdfLoading ? "Gerando…" : "Gerar relatório"}
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive"
          >
            <Plus size={13} />
            Nova conta
          </button>
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────────────────────── */}
      {listContas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-slate-500">Nenhuma conta encontrada para este filtro.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {listContas.map((conta) => {
            const ds = getDueStatus(conta);
            const isQuitada = ds === "quitada";

            return (
              <div
                key={conta.id}
                className={`group flex items-center gap-0 overflow-hidden rounded-xl ring-1 transition ${
                  isQuitada
                    ? "opacity-60 ring-white/[0.05]"
                    : ds === "vencida"
                    ? "ring-red-500/20 bg-red-500/[0.03]"
                    : ds === "proxima"
                    ? "ring-blue-500/15 bg-blue-500/[0.02]"
                    : "ring-white/[0.07] bg-bgSecondary hover:ring-white/[0.12]"
                }`}
              >
                {/* Left color bar */}
                <div className={`w-1 self-stretch shrink-0 ${STATUS_BAR[ds]}`} />

                {/* Content */}
                <div className="flex flex-1 items-center gap-4 px-4 py-3.5">
                  {/* Status icon */}
                  <button
                    onClick={() => isQuitada ? toggleContaQuitado(conta.id) : setConfirmingQuit(conta)}
                    title={isQuitada ? "Reabrir" : "Marcar como quitado"}
                    className="shrink-0 text-slate-500 transition hover:scale-110 hover:text-current"
                  >
                    {isQuitada
                      ? <CheckCircle2 size={18} className="text-emerald-500" />
                      : <Circle size={18} className="text-slate-600 hover:text-accentPositive" />
                    }
                  </button>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`truncate text-sm font-semibold ${isQuitada ? "text-slate-400 line-through" : "text-white"}`}>
                        {conta.descricao}
                      </span>
                      {conta.recorrencia === "mensal-fixo" && (
                        <RefreshCw size={11} className="shrink-0 text-slate-600" aria-label="Mensal fixo" />
                      )}
                      {conta.recorrencia === "mensal-variavel" && (
                        <RefreshCw size={11} className={`shrink-0 ${conta.valor === 0 ? "text-amber-500" : "text-slate-600"}`} aria-label="Mensal variável" />
                      )}
                      {conta.category && (
                        <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-400 ring-1 ring-white/[0.08]">
                          {conta.category}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3">
                      <span className={`text-xs ${STATUS_DATE_COLOR[ds]}`}>
                        {formatDate(conta.vencimento)}
                        {STATUS_LABEL[ds] && (
                          <span className="ml-1.5 font-semibold">· {STATUS_LABEL[ds]}</span>
                        )}
                        {ds === "proxima" && (
                          <span className="ml-1.5 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 ring-1 ring-blue-500/15">
                            vence em {daysUntilDue(conta)}d
                          </span>
                        )}
                      </span>
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${
                        conta.tipo === "pagar" ? "text-red-500/70" : "text-emerald-500/70"
                      }`}>
                        {conta.tipo === "pagar" ? "pagar" : "receber"}
                      </span>
                    </div>
                  </div>

                  {/* Valor */}
                  <span className={`shrink-0 tabular-nums text-sm font-bold ${
                    isQuitada ? "text-slate-500"
                    : conta.tipo === "pagar" ? "text-red-400" : "text-accentPositive"
                  }`}>
                    {conta.tipo === "pagar" ? "−" : "+"}{toCurrencyBRL(conta.valor)}
                  </span>

                  {/* Actions — visíveis no hover */}
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setEditingConta(conta)}
                      title="Editar"
                      className="rounded-lg p-1.5 text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-300"
                    >
                      <Pencil size={13} />
                    </button>
                    {isQuitada && (
                      <button
                        onClick={() => toggleContaQuitado(conta.id)}
                        title="Reabrir"
                        className="rounded-lg p-1.5 text-slate-600 transition hover:bg-amber-500/10 hover:text-amber-400"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteConta(conta.id)}
                      title="Excluir"
                      className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer count + totalizadores */}
      {listContas.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            {listContas.filter((c) => c.status === "aberto").length} em aberto · {listContas.filter((c) => c.status === "quitado").length} quitadas
          </span>
          <span>
            {tipoFilter === "pagar"
              ? <>Total a pagar: <span className="font-semibold text-red-400">{toCurrencyBRL(totalPagarVisivel)}</span></>
              : <>Total a receber: <span className="font-semibold text-accentPositive">{toCurrencyBRL(totalReceberVisivel)}</span></>
            }
          </span>
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ContaModal defaultTipo={tipoFilter} onConfirm={handleAdd} onClose={() => setShowModal(false)} />
      )}
      {editingConta && (
        <ContaModal
          existingConta={editingConta}
          onConfirm={handleEdit}
          onClose={() => setEditingConta(null)}
        />
      )}

      {/* Confirmação de quitação */}
      {confirmingQuit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmingQuit(null); }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900 to-[#0d1426] shadow-2xl">
            <div className="flex items-start gap-3 px-6 pb-4 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                <CheckCircle2 size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold tracking-tight text-white">
                  {confirmingQuit.tipo === "pagar" ? "Quitar esta conta?" : "Confirmar recebimento?"}
                </h2>
                <p className="mt-1 truncate text-sm text-slate-300">{confirmingQuit.descricao}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  venc. {formatDate(confirmingQuit.vencimento)} ·{" "}
                  <span className={`font-semibold ${confirmingQuit.tipo === "pagar" ? "text-red-400" : "text-accentPositive"}`}>
                    {toCurrencyBRL(confirmingQuit.valor)}
                  </span>
                </p>
                {confirmingQuit.recorrencia !== "unico" && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <RefreshCw size={11} className="shrink-0" />
                    A próxima ocorrência mensal será criada automaticamente.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.015] px-6 py-4">
              <button
                onClick={() => setConfirmingQuit(null)}
                className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => { toggleContaQuitado(confirmingQuit.id); setConfirmingQuit(null); }}
                className="flex-1 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:brightness-110 active:scale-[0.98]"
              >
                {confirmingQuit.tipo === "pagar" ? "Quitar conta" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relatório PDF (off-screen) */}
      <ContasReport
        ref={reportRef}
        monthName={MONTH_NAMES[month]}
        year={year}
        userName={activeUserName}
        contasPagar={singlePagar}
        contasReceber={singleReceber}
        scope={reportScope}
        periodLabel={reportPeriodLabel}
        statusLabel={reportStatusLabel}
      />

      {/* Relatório consolidado (todos os perfis) — off-screen */}
      {consolidadoBlocks && (
        <ContasReportConsolidado
          ref={consolidadoRef}
          users={consolidadoBlocks}
          monthName={MONTH_NAMES[month]}
          year={year}
          scope={reportScope}
          generatedBy={activeUserName}
          periodLabel={reportPeriodLabel}
          statusLabel={reportStatusLabel}
        />
      )}

      {/* Modal de configuração do relatório */}
      {showReportModal && (
        <ContasReportModal
          monthLabel={`${MONTH_NAMES[month]} ${year}`}
          hasMultipleProfiles={users.length > 1}
          defaultDate={todayStr}
          defaultFrom={`${year}-${String(month + 1).padStart(2, "0")}-01`}
          defaultTo={`${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`}
          onConfirm={handleGenerateReport}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Toast: relatório baixado com sucesso */}
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

      {pdfLoading && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3" style={{ zIndex: 10000, background: "rgba(15,23,42,0.88)", backdropFilter: "blur(4px)" }}>
          <svg className="animate-spin" width={28} height={28} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-slate-200">Gerando relatório…</p>
        </div>
      )}
    </div>
  );
}
