import { useEffect, useState } from "react";
import { X, FileDown } from "lucide-react";

export interface ContasReportConfig {
  perfil: "este" | "todos";
  scope: "pagar" | "receber" | "ambas";
  status: "aberto" | "quitado" | "todas";
  periodo: "mes" | "data" | "intervalo";
  data?: string;   // YYYY-MM-DD (periodo === "data")
  from?: string;   // periodo === "intervalo"
  to?: string;
}

interface Props {
  monthLabel: string;          // ex: "Julho 2026"
  hasMultipleProfiles: boolean;
  defaultDate: string;         // YYYY-MM-DD
  defaultFrom: string;
  defaultTo: string;
  onConfirm: (cfg: ContasReportConfig) => void;
  onClose: () => void;
}

const LABEL = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500";
const FIELD =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-accentPositive/40 [color-scheme:dark]";

function Seg<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`rounded-xl py-2 text-xs font-semibold transition ${
            value === o.id
              ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25"
              : "bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.07] hover:bg-white/[0.07]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ContasReportModal({
  monthLabel, hasMultipleProfiles, defaultDate, defaultFrom, defaultTo, onConfirm, onClose,
}: Props) {
  const [perfil, setPerfil]   = useState<ContasReportConfig["perfil"]>("este");
  const [scope, setScope]     = useState<ContasReportConfig["scope"]>("ambas");
  const [status, setStatus]   = useState<ContasReportConfig["status"]>("aberto");
  const [periodo, setPeriodo] = useState<ContasReportConfig["periodo"]>("mes");
  const [data, setData]       = useState(defaultDate);
  const [from, setFrom]       = useState(defaultFrom);
  const [to, setTo]           = useState(defaultTo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const intervaloValido = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const valido = periodo === "mes" || (periodo === "data" && dataValida) || (periodo === "intervalo" && intervaloValido);

  function handleConfirm() {
    if (!valido) return;
    onConfirm({
      perfil, scope, status, periodo,
      data:  periodo === "data" ? data : undefined,
      from:  periodo === "intervalo" ? from : undefined,
      to:    periodo === "intervalo" ? to : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900 to-[#0d1426] shadow-2xl">
        <div className="h-1 w-full bg-gradient-to-r from-accentPositive/80 via-accentPositive/30 to-transparent" />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pb-4 pt-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accentPositive/10 text-accentPositive ring-1 ring-accentPositive/20">
            <FileDown size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-white">Gerar relatório de contas</h2>
            <p className="text-xs text-slate-500">Monte o recorte antes de gerar o PDF</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 border-t border-white/[0.06] px-6 py-5">
          {hasMultipleProfiles && (
            <div>
              <label className={LABEL}>Perfil</label>
              <Seg value={perfil} onChange={setPerfil} options={[
                { id: "este",  label: "Este perfil" },
                { id: "todos", label: "Todos os perfis" },
              ]} />
            </div>
          )}

          <div>
            <label className={LABEL}>Tipo</label>
            <Seg value={scope} onChange={setScope} options={[
              { id: "ambas",   label: "Ambos" },
              { id: "pagar",   label: "A pagar" },
              { id: "receber", label: "A receber" },
            ]} />
          </div>

          <div>
            <label className={LABEL}>Status</label>
            <Seg value={status} onChange={setStatus} options={[
              { id: "aberto",  label: "Em aberto" },
              { id: "quitado", label: "Quitadas" },
              { id: "todas",   label: "Todas" },
            ]} />
          </div>

          <div>
            <label className={LABEL}>Período (vencimento)</label>
            <Seg value={periodo} onChange={setPeriodo} options={[
              { id: "mes",       label: "Mês inteiro" },
              { id: "data",      label: "Data" },
              { id: "intervalo", label: "Intervalo" },
            ]} />

            {periodo === "mes" && (
              <p className="mt-2 text-xs text-slate-500">Todas com vencimento em <span className="font-medium text-slate-300">{monthLabel}</span>.</p>
            )}
            {periodo === "data" && (
              <div className="mt-3">
                <label className={LABEL}>Vence no dia</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={FIELD} />
              </div>
            )}
            {periodo === "intervalo" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>De</label>
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
                </div>
                <div>
                  <label className={LABEL}>Até</label>
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={FIELD} />
                </div>
              </div>
            )}
            {!valido && (
              <p className="mt-2 text-[11px] text-red-400">Confira as datas do período.</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.015] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!valido}
            className="flex-1 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            Gerar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
