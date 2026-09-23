import { useEffect, useState } from "react";
import { X, ArrowRightLeft, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { MovScope } from "./MovimentacaoReport";

interface Props {
  defaultFrom: string; // YYYY-MM-DD
  defaultTo: string;   // YYYY-MM-DD
  onConfirm: (scope: MovScope, from: string, to: string) => void;
  onClose: () => void;
}

const FIELD =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accentPositive/40 focus:bg-white/[0.06] [color-scheme:dark]";
const LABEL = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500";

const SCOPES: { id: MovScope; label: string; icon: typeof ArrowRightLeft; color: string }[] = [
  { id: "ambos",    label: "Ambos",    icon: ArrowRightLeft, color: "text-accentPositive" },
  { id: "entradas", label: "Entradas", icon: ArrowUpRight,   color: "text-emerald-400" },
  { id: "saidas",   label: "Saídas",   icon: ArrowDownLeft,  color: "text-red-400" },
];

export function MovimentacaoModal({ defaultFrom, defaultTo, onConfirm, onClose }: Props) {
  const [scope, setScope] = useState<MovScope>("ambos");
  const [from, setFrom]   = useState(defaultFrom);
  const [to, setTo]       = useState(defaultTo);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  function handleConfirm() {
    if (!datesValid) return;
    onConfirm(scope, from, to);
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
            <ArrowRightLeft size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-white">Relatório de movimentação</h2>
            <p className="text-xs text-slate-500">Movimentação diária detalhada em PDF</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 border-t border-white/[0.06] px-6 py-5">
          {/* Tipo */}
          <div>
            <label className={LABEL}>O que incluir</label>
            <div className="grid grid-cols-3 gap-2">
              {SCOPES.map((s) => {
                const Icon = s.icon;
                const active = scope === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setScope(s.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition ${
                      active
                        ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25"
                        : "bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.07] hover:bg-white/[0.07]"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-accentPositive" : s.color} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intervalo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>De</label>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
            </div>
            <div>
              <label className={LABEL}>Até</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={FIELD} />
            </div>
          </div>
          {!datesValid && (from || to) && (
            <p className="text-[11px] text-red-400">Confira o intervalo — a data inicial deve ser anterior ou igual à final.</p>
          )}
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
            disabled={!datesValid}
            className="flex-1 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            Gerar PDF
          </button>
        </div>
      </div>
    </div>
  );
}
