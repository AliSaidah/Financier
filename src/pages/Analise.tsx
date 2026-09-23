import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Transaction } from "../types/finance";
import { PeriodFilter } from "../components/PeriodFilter";
import { toCurrencyBRL } from "../lib/formatters";

// Categorias que ficam fora da DRE (pelo categoryId canônico)
const FORA_DRE_IDS = new Set(["transferencia-interna", "estorno-reembolso", "investimentos"]);

function isForaDRE(tx: Transaction): boolean {
  return !!tx.categoryId && FORA_DRE_IDS.has(tx.categoryId);
}

function getCFKey(tx: Transaction): string {
  return tx.categoryId ?? tx.category;
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
    const cat = tx.category || "Sem categoria";
    map.set(cat, (map.get(cat) ?? 0) + tx.amount);
  }
  return [...map.entries()]
    .map(([category, net]) => ({ category, net }))
    .filter(({ net }) => net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

function fmtPct(value: number, base: number): string {
  if (!base || !isFinite(value / base)) return "—";
  return `${((value / base) * 100).toFixed(1)}%`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type CardVariant = "neutral" | "cost" | "result";

const CARD_STYLES: Record<CardVariant, { border: string; bg: string; label: string; value: (v: number) => string }> = {
  neutral: {
    border: "border-white/[0.07]",
    bg:     "bg-slate-800/40",
    label:  "text-slate-500",
    value:  () => "text-white",
  },
  cost: {
    border: "border-red-500/[0.18]",
    bg:     "bg-red-500/[0.05]",
    label:  "text-red-400/60",
    value:  () => "text-red-400",
  },
  result: {
    border: "",   // computed below
    bg:     "",
    label:  "text-slate-500",
    value:  (v) => v >= 0 ? "text-emerald-400" : "text-red-400",
  },
};

function SummaryCard({
  label,
  value,
  subLabel,
  subValue,
  variant = "neutral",
}: {
  label: string;
  value: number;
  subLabel?: string;
  subValue?: string;
  variant?: CardVariant;
}) {
  const s = CARD_STYLES[variant];
  const border = variant === "result"
    ? (value >= 0 ? "border-emerald-500/[0.22]" : "border-red-500/[0.22]")
    : s.border;
  const bg = variant === "result"
    ? (value >= 0 ? "bg-emerald-500/[0.05]" : "bg-red-500/[0.05]")
    : s.bg;

  return (
    <div className={`rounded-xl border p-4 ${border} ${bg}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wider ${s.label}`}>{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${s.value(value)}`}>
        {toCurrencyBRL(Math.abs(value))}
      </p>
      {subLabel && subValue && (
        <p className="mt-1 text-xs text-slate-500">
          {subLabel} <span className="font-medium text-slate-400">{subValue}</span>
        </p>
      )}
    </div>
  );
}

/** Linha de custo: label slate, valor com prefixo − e tom neutro */
function DREDeduction({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="flex items-center gap-2 text-sm text-slate-400">
        <span className="h-px w-3 rounded-full bg-slate-600" />
        {label}
      </span>
      <span className="tabular-nums text-sm text-slate-300">
        − {toCurrencyBRL(value)}
      </span>
    </div>
  );
}

/** Linha de total/subtotal: bolder, separador acima, % inline */
function DRETotal({
  label,
  value,
  pct,
  colored = false,
  size = "md",
}: {
  label: string;
  value: number;
  pct?: string;
  colored?: boolean;
  size?: "md" | "lg";
}) {
  const valueColor = colored
    ? value >= 0 ? "text-emerald-400" : "text-red-400"
    : "text-white";

  return (
    <div className={`flex items-center justify-between border-t border-white/[0.08] pt-3 pb-2.5 ${size === "lg" ? "mt-1" : ""}`}>
      <span className={`font-semibold ${size === "lg" ? "text-base text-white" : "text-sm text-slate-100"}`}>
        {label}
        {pct && (
          <span className={`ml-2 text-xs font-normal ${colored ? (value >= 0 ? "text-emerald-400/70" : "text-red-400/70") : "text-slate-500"}`}>
            {pct}
          </span>
        )}
      </span>
      <span className={`tabular-nums font-bold ${size === "lg" ? "text-lg" : "text-sm"} ${valueColor}`}>
        {toCurrencyBRL(Math.abs(value))}
      </span>
    </div>
  );
}

function CategoryList({
  title,
  items,
  emptyMsg,
}: {
  title: string;
  items: { category: string; total: number }[];
  emptyMsg: string;
}) {
  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
      {/* Header fixo */}
      <div className="border-b border-white/[0.06] px-5 py-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </div>

      {/* Body scrollável */}
      {items.length === 0 ? (
        <p className="px-5 py-4 text-xs text-slate-600">{emptyMsg}</p>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: 264 }}>
          {items.map(({ category, total }) => (
            <div
              key={category}
              className="flex items-center justify-between border-b border-white/[0.04] px-5 py-2.5 last:border-0"
            >
              <span className="text-sm text-slate-300">{category}</span>
              <span className="tabular-nums text-sm font-medium text-slate-200">
                {toCurrencyBRL(total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Total fixo no rodapé */}
      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
          <span className="text-xs font-semibold text-slate-500">Total</span>
          <span className="tabular-nums text-sm font-bold text-white">
            {toCurrencyBRL(grandTotal)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  recebimentos: Transaction[];
  pagamentos: Transaction[];
  fixedCategoryIds: string[];
  month: number;
  year: number;
  availablePeriods: { year: number; month: number }[];
  onChangePeriod: (month: number, year: number) => void;
}

export function AnalisePage({
  recebimentos,
  pagamentos,
  fixedCategoryIds,
  month,
  year,
  availablePeriods,
  onChangePeriod,
}: Props) {

  const {
    receitaTotal,
    custosFix,
    custosVar,
    margemContrib,
    margemPct,
    resultadoEst,
    resultadoPct,
    cfByCategory,
    cvByCategory,
    foraItems,
    uncategorizedCount,
  } = useMemo(() => {
    // Separa transações em DRE vs Fora da DRE
    const recDRE  = recebimentos.filter((tx) => !isForaDRE(tx));
    const pgDRE   = pagamentos.filter((tx) => !isForaDRE(tx));
    const recFora = recebimentos.filter(isForaDRE);
    const pgFora  = pagamentos.filter(isForaDRE);

    const receitaTotal = recDRE.reduce((s, tx) => s + tx.amount, 0);

    const pgCF = pgDRE.filter(
      (tx) => tx.category && tx.category !== "Sem categoria" && fixedCategoryIds.includes(getCFKey(tx))
    );
    const pgCV = pgDRE.filter(
      (tx) => !tx.category || tx.category === "Sem categoria" || !fixedCategoryIds.includes(getCFKey(tx))
    );

    const custosFix = pgCF.reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const custosVar = pgCV.reduce((s, tx) => s + Math.abs(tx.amount), 0);

    const margemContrib = receitaTotal - custosVar;
    const margemPct     = fmtPct(margemContrib, receitaTotal);
    const resultadoEst  = margemContrib - custosFix;
    const resultadoPct  = fmtPct(resultadoEst, receitaTotal);

    const cfByCategory = groupByCategory(pgCF);
    const cvByCategory = groupByCategory(pgCV);

    const foraItems = groupForaDRE([...recFora, ...pgFora]);

    const uncategorizedCount = [...recebimentos, ...pagamentos].filter(
      (tx) => !tx.category || tx.category === "Sem categoria"
    ).length;

    return {
      receitaTotal, custosFix, custosVar,
      margemContrib, margemPct, resultadoEst, resultadoPct,
      cfByCategory, cvByCategory, foraItems, uncategorizedCount,
    };
  }, [recebimentos, pagamentos, fixedCategoryIds]);

  const cfNotConfigured = fixedCategoryIds.length === 0;

  return (
    <div className="pb-10">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-lg font-bold text-white">Análise Gerencial</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Entenda o resultado do período com base nas categorias configuradas.
        </p>
      </div>

      {/* Avisos */}
      {uncategorizedCount > 0 && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3">
          <AlertTriangle size={14} className="shrink-0 text-amber-400" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">{uncategorizedCount} transações sem categoria.</span>{" "}
            A análise pode mudar após a revisão.
          </p>
        </div>
      )}

      {cfNotConfigured && (
        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.07] px-4 py-3">
          <Info size={14} className="shrink-0 text-sky-400" />
          <p className="text-xs text-sky-300">
            Nenhuma conta fixa configurada. Todos os custos estão sendo tratados como variáveis.{" "}
            <span className="text-sky-400">Configure na aba Pagamentos.</span>
          </p>
        </div>
      )}

      {/* Period filter */}
      <div className="mb-6">
        <PeriodFilter
          month={month}
          year={year}
          availablePeriods={availablePeriods}
          onChange={onChangePeriod}
        />
      </div>

      {/* 5 Summary cards */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        <SummaryCard label="Receita Total"          value={receitaTotal}  variant="neutral" />
        <SummaryCard label="Custos Variáveis"       value={custosVar}     variant="cost"    />
        <SummaryCard
          label="Margem de Contribuição"
          value={margemContrib}
          variant="result"
          subLabel="Margem"
          subValue={margemPct}
        />
        <SummaryCard label="Custos Fixos"           value={custosFix}     variant="cost"    />
        <SummaryCard
          label="Resultado Estimado"
          value={resultadoEst}
          variant="result"
          subLabel="Resultado"
          subValue={resultadoPct}
        />
      </div>

      {/* Demonstrativo Geral */}
      <div className="mb-6 rounded-xl border border-white/[0.07] bg-slate-800/30 px-6 py-5">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Demonstrativo Geral</p>

        <DRETotal label="Receita Total" value={receitaTotal} size="lg" />

        <div className="mt-1">
          <DREDeduction label="Custos Variáveis"       value={custosVar} />
          <DRETotal     label="Margem de Contribuição" value={margemContrib} pct={margemPct} colored />
        </div>

        <div className="mt-1">
          <DREDeduction label="Custos Fixos"           value={custosFix} />
          <DRETotal     label="Resultado Estimado"     value={resultadoEst} pct={resultadoPct} colored size="lg" />
        </div>
      </div>

      {/* Quebra por categoria */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <CategoryList
          title="Custos Fixos por Categoria"
          items={cfByCategory}
          emptyMsg="Nenhum custo fixo no período."
        />
        <CategoryList
          title="Custos Variáveis por Categoria"
          items={cvByCategory}
          emptyMsg="Nenhum custo variável no período."
        />
      </div>

      {/* Fora da análise */}
      {foraItems.length > 0 && (
        <div className="mb-6 rounded-xl border border-white/[0.05] bg-slate-800/20 px-5 py-4">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Fora da análise
          </h3>
          <div className="space-y-0">
            {foraItems.map(({ category, net }) => (
              <div key={category} className="flex items-center justify-between border-b border-white/[0.04] py-1.5 last:border-0">
                <span className="text-xs text-slate-500">{category}</span>
                <span className={`tabular-nums text-xs font-medium ${net >= 0 ? "text-slate-400" : "text-slate-500"}`}>
                  {net >= 0 ? "+" : "−"} {toCurrencyBRL(Math.abs(net))}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-center text-[11px] text-slate-600">
        Resultado estimado com base nas transações importadas e categorias configuradas.
      </p>

    </div>
  );
}
