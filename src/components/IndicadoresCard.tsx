import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ChevronDown, HelpCircle, Percent, Receipt, Scale, X } from "lucide-react";
import { toCurrencyBRL } from "../lib/formatters";
import { InfoTip } from "./InfoTip";

interface Props {
  receitaTotal: number;
  custosVar: number;
  custosFix: number;
  margemContrib: number;
  resultadoEst: number;
  numVendas: number;
  ticketOn: boolean;
  onToggleTicket: (on: boolean) => void;
}

// ─── Linha do fluxo de cálculo ────────────────────────────────────────────────

function FlowTotal({ label, value, pct, accent }: { label: string; value: number; pct?: string; accent?: boolean }) {
  const color = accent ? (value >= 0 ? "text-emerald-400" : "text-red-400") : "text-white";
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-2.5 ring-1 ring-white/[0.05]">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        {label}
        {pct && (
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${
            accent
              ? value >= 0
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                : "bg-red-500/10 text-red-400 ring-red-500/20"
              : "bg-white/[0.06] text-slate-400 ring-white/[0.08]"
          }`}>
            {pct}
          </span>
        )}
      </span>
      <span className={`tabular-nums text-sm font-bold ${color}`}>{toCurrencyBRL(Math.abs(value))}</span>
    </div>
  );
}

function FlowDeduction({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      <span className="flex items-center gap-2 text-xs text-slate-500">
        <ArrowDown size={12} className="text-slate-600" />
        <span className="font-semibold text-red-400/70">−</span>
        {label}
      </span>
      <span className="tabular-nums text-xs font-medium text-slate-400">− {toCurrencyBRL(value)}</span>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, valueColor = "text-white", info,
}: { icon: React.ReactNode; label: string; value: string; sub: string; valueColor?: string; info?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.05]">
      <div className="flex items-center gap-1.5 text-slate-500">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
        {info && <span className="ml-auto"><InfoTip title={label}>{info}</InfoTip></span>}
      </div>
      <p className={`mt-1.5 text-lg font-bold tabular-nums tracking-tight ${valueColor}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{sub}</p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function IndicadoresCard({
  receitaTotal, custosVar, custosFix, margemContrib, resultadoEst, numVendas,
  ticketOn, onToggleTicket,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const isLucro      = resultadoEst >= 0;
  const margemLucro  = receitaTotal > 0 ? (resultadoEst / receitaTotal) * 100 : null;
  const mcRatio      = receitaTotal > 0 ? margemContrib / receitaTotal : 0;
  const mcPct        = receitaTotal > 0 ? `${(mcRatio * 100).toFixed(1)}%` : undefined;
  const lucroPct     = margemLucro !== null ? `${margemLucro.toFixed(1)}%` : undefined;

  // Ponto de equilíbrio: receita necessária para cobrir todos os custos
  const pontoEquilibrio = mcRatio > 0 ? custosFix / mcRatio : null;
  const peAtingido      = pontoEquilibrio !== null && receitaTotal >= pontoEquilibrio;

  const ticketMedio = numVendas > 0 ? receitaTotal / numVendas : null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">

      {/* ── Headline: Resultado Estimado ───────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Resultado Estimado do Período
            <InfoTip title="Resultado estimado">
              <p>É o lucro (ou prejuízo) do período:</p>
              <p className="mt-1 font-medium text-slate-200">Receita Total − Custos Variáveis − Custos Fixos</p>
              <p className="mt-2"><span className="font-medium text-slate-200">Margem de lucro</span> = Resultado ÷ Receita Total × 100. Mostra quanto sobra de cada R$ 1 recebido.</p>
            </InfoTip>
          </p>
          <div className="mt-1.5 flex items-center gap-3">
            <span className={`text-2xl font-bold tabular-nums tracking-tight ${isLucro ? "text-emerald-400" : "text-red-400"}`}>
              {isLucro ? "" : "−"}{toCurrencyBRL(Math.abs(resultadoEst))}
            </span>
            {margemLucro !== null && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${
                isLucro
                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/25"
                  : "bg-red-500/10 text-red-400 ring-red-500/25"
              }`}>
                {margemLucro.toFixed(1)}% de margem de lucro
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-300"
        >
          {expanded ? "Ocultar cálculo" : "Ver cálculo"}
          <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── Fluxo de cálculo (expansível) ──────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="flow"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 border-t border-white/[0.05] px-5 py-4">
              <FlowTotal label="Receita Total" value={receitaTotal} />
              <FlowDeduction label="Custos Variáveis" value={custosVar} />
              <FlowTotal label="Margem de Contribuição" value={margemContrib} pct={mcPct} />
              <FlowDeduction label="Custos Fixos" value={custosFix} />
              <FlowTotal label={isLucro ? "Resultado — Lucro" : "Resultado — Prejuízo"} value={resultadoEst} pct={lucroPct} accent />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 border-t border-white/[0.05] px-5 py-4">
        <KpiCard
          icon={<Percent size={12} />}
          label="Margem de Contribuição"
          value={mcPct ?? "—"}
          sub={receitaTotal > 0 ? `${toCurrencyBRL(margemContrib)} sobram para cobrir os fixos` : "Sem receita no período"}
          valueColor={margemContrib >= 0 ? "text-white" : "text-red-400"}
          info={
            <>
              <p>Quanto sobra da receita depois dos custos variáveis, para cobrir os custos fixos.</p>
              <p className="mt-1 font-medium text-slate-200">Receita Total − Custos Variáveis</p>
              <p className="mt-2">O <span className="font-medium text-slate-200">%</span> é essa margem dividida pela Receita Total.</p>
            </>
          }
        />
        <KpiCard
          icon={<Scale size={12} />}
          label="Ponto de Equilíbrio"
          value={pontoEquilibrio !== null ? toCurrencyBRL(pontoEquilibrio) : "—"}
          sub={
            pontoEquilibrio === null
              ? "Margem insuficiente para calcular"
              : peAtingido
              ? "✓ Atingido — a receita já cobre todos os custos"
              : `Faltam ${toCurrencyBRL(pontoEquilibrio - receitaTotal)} de receita para empatar`
          }
          valueColor={pontoEquilibrio === null ? "text-slate-500" : peAtingido ? "text-emerald-400" : "text-amber-400"}
          info={
            <>
              <p>Receita necessária para o resultado ficar em zero (nem lucro, nem prejuízo).</p>
              <p className="mt-1 font-medium text-slate-200">Custos Fixos ÷ (Margem de Contribuição ÷ Receita Total)</p>
              <p className="mt-2">Acima desse valor, a operação começa a dar lucro.</p>
            </>
          }
        />

        {/* Ticket médio — opcional */}
        {ticketOn ? (
          <div className="relative rounded-xl bg-white/[0.025] p-3.5 ring-1 ring-white/[0.05]">
            <button
              onClick={() => onToggleTicket(false)}
              title="Ocultar ticket médio"
              className="absolute right-2 top-2 rounded-md p-1 text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-400"
            >
              <X size={11} />
            </button>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Receipt size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Ticket Médio</span>
              <InfoTip title="Ticket médio">
                <p>Valor médio recebido por entrada no período.</p>
                <p className="mt-1 font-medium text-slate-200">Receita Total ÷ nº de recebimentos</p>
              </InfoTip>
            </div>
            <p className="mt-1.5 text-lg font-bold tabular-nums tracking-tight text-white">
              {ticketMedio !== null ? toCurrencyBRL(ticketMedio) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              {numVendas > 0 ? `${numVendas} ${numVendas === 1 ? "recebimento" : "recebimentos"} no período` : "Nenhum recebimento no período"}
            </p>
          </div>
        ) : (
          <button
            onClick={() => onToggleTicket(true)}
            className="flex flex-col items-start justify-center rounded-xl border border-dashed border-white/[0.1] p-3.5 text-left transition hover:border-accentPositive/30 hover:bg-accentPositive/[0.04]"
          >
            <div className="flex items-center gap-1.5 text-slate-500">
              <HelpCircle size={12} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Ticket Médio</span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-slate-400">Deseja calcular?</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-600">Nem todo negócio se aplica — clique para ativar.</p>
          </button>
        )}
      </div>
    </div>
  );
}
