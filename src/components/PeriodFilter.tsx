import { useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

interface AvailablePeriod {
  year: number;
  month: number; // 0-based
}

interface Props {
  month: number;       // 0-based
  year: number;
  availablePeriods: AvailablePeriod[];
  onChange: (month: number, year: number) => void;
}

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export function PeriodFilter({ month, year, availablePeriods, onChange }: Props) {
  const [open, setOpen] = useState(false);

  // Períodos com dados, mais recente primeiro
  const periods = [...availablePeriods].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month
  );

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-800/50 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/[0.15]"
      >
        <Calendar size={14} className="text-slate-500" />
        {MONTH_NAMES[month]} {year}
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-52 overflow-y-auto rounded-xl border border-white/[0.08] bg-slate-900 p-1 shadow-2xl">
            {periods.map((p, i) => {
              const selected = p.month === month && p.year === year;
              const showYearDivider = i > 0 && periods[i - 1].year !== p.year;
              return (
                <div key={`${p.year}-${p.month}`}>
                  {showYearDivider && <div className="my-1 border-t border-white/[0.06]" />}
                  <button
                    onClick={() => { onChange(p.month, p.year); setOpen(false); }}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      selected
                        ? "bg-accentPositive/15 font-semibold text-accentPositive"
                        : "text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    {MONTH_NAMES[p.month]} <span className="tabular-nums text-slate-500">{p.year}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
