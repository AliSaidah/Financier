import { History, Trash2, FolderOpen } from "lucide-react";
import { HistoryEntry, BankId } from "../types/finance";
import { BANKS } from "../data/constants";

interface Props {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function monthKey(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "0000-00";
}

function monthLabel(key: string): string {
  const [y, mo] = key.split("-");
  const idx = (+mo) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${y}` : "Sem data";
}

function formatUploadedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " às "
    + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const BANK_COLORS: Record<BankId, string> = {
  bb:           "bg-amber-500/15 text-amber-400 ring-amber-500/20",
  itau:         "bg-orange-500/15 text-orange-400 ring-orange-500/20",
  sicredi:      "bg-green-600/15 text-green-400 ring-green-600/20",
  inter:        "bg-orange-500/15 text-orange-400 ring-orange-500/20",
  nubank:       "bg-purple-500/15 text-purple-400 ring-purple-500/20",
};

export function HistoricoPage({ history, onLoad, onDelete }: Props) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-2xl bg-accentPositive/10 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.07] to-white/[0.02] ring-1 ring-white/[0.1]">
            <History size={28} className="text-slate-400" />
          </div>
        </div>
        <p className="text-base font-semibold text-slate-300">Nenhum extrato importado ainda</p>
        <p className="mt-1 text-sm text-slate-500">
          Faça o upload de um arquivo OFX para ele aparecer aqui.
        </p>
      </div>
    );
  }

  // Agrupa por mês do período do extrato (dateFrom), mais recente primeiro
  const sorted = [...history].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom));
  const groups: { key: string; entries: HistoryEntry[] }[] = [];
  for (const entry of sorted) {
    const key = monthKey(entry.dateFrom);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }

  return (
    <div>
      <p className="mb-4 text-xs text-slate-500">
        {history.length} {history.length === 1 ? "extrato salvo" : "extratos salvos"} · clique para carregar
      </p>

      <div className="space-y-6">
        {groups.map((group) => {
          const monthTotal = group.entries.reduce((s, e) => s + (e.transactions.length - e.transactions.filter((t) => t.ignored).length), 0);
          return (
            <div key={group.key}>
              {/* Cabeçalho do mês */}
              <div className="mb-2 flex items-center gap-3">
                <h3 className="text-sm font-bold tracking-tight text-slate-200">{monthLabel(group.key)}</h3>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {group.entries.length} {group.entries.length === 1 ? "extrato" : "extratos"} · {monthTotal} transações
                </span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>

              <div className="space-y-3">
                {group.entries.map((entry) => {
                  const colorClass = BANK_COLORS[entry.bankId] ?? "bg-slate-500/15 text-slate-300 ring-slate-500/20";
                  const ignoredCount = entry.transactions.filter((t) => t.ignored).length;
                  const activeCount  = entry.transactions.length - ignoredCount;

                  return (
                    <div
                      key={entry.id}
                      className="group flex items-center gap-4 rounded-xl bg-bgSecondary px-5 py-4 ring-1 ring-white/[0.07] transition hover:ring-white/[0.14]"
                    >
                      {/* Bank badge */}
                      <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${colorClass}`}>
                        {entry.bankLabel}
                      </span>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {entry.bankLabel} de {formatDate(entry.dateFrom)} até {formatDate(entry.dateTo)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {activeCount} transações · importado em {formatUploadedAt(entry.uploadedAt)}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => onLoad(entry)}
                          title="Carregar extrato"
                          className="flex items-center gap-1.5 rounded-lg bg-accentPositive/10 px-3 py-1.5 text-xs font-medium text-accentPositive transition hover:bg-accentPositive/20"
                        >
                          <FolderOpen size={13} />
                          Carregar
                        </button>
                        <button
                          onClick={() => onDelete(entry.id)}
                          title="Remover do histórico"
                          className="rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
