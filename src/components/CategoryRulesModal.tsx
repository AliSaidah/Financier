import { useMemo, useState } from "react";
import { X, Search, Pin, PinOff, Trash2, ArrowUpRight, ArrowDownLeft, Bookmark } from "lucide-react";
import { useFinancierStore } from "../store/useFinancierStore";
import { CategoryBadge } from "./CategoryBadge";
import { toCurrencyBRL } from "../lib/formatters";

interface Props {
  onClose: () => void;
}

export function CategoryRulesModal({ onClose }: Props) {
  const categoryRules         = useFinancierStore((s) => s.categoryRules);
  const setCategoryRulePinned = useFinancierStore((s) => s.setCategoryRulePinned);
  const deleteCategoryRule    = useFinancierStore((s) => s.deleteCategoryRule);

  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.entries(categoryRules)
      .filter(([, r]) => !q || r.thirdParty.toLowerCase().includes(q))
      .sort((a, b) => a[1].thirdParty.localeCompare(b[1].thirdParty, "pt-BR"));
  }, [categoryRules, query]);

  const total = Object.keys(categoryRules).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900 to-[#0d1426] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accentPositive/10 text-accentPositive ring-1 ring-accentPositive/20">
            <Bookmark size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-white">Categorias salvas</h2>
            <p className="text-xs text-slate-500">
              {total === 0 ? "Nenhuma regra ainda" : `${total} ${total === 1 ? "terceiro memorizado" : "terceiros memorizados"}`} · fixe uma categoria para aplicar sempre
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Busca */}
        {total > 0 && (
          <div className="border-b border-white/[0.06] px-6 py-3">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar terceiro…"
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accentPositive/40"
              />
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {total === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-300">Você ainda não categorizou nada manualmente</p>
              <p className="mt-1 text-xs text-slate-500">
                Ao categorizar um terceiro, ele fica salvo aqui e volta sozinho nos próximos extratos — mesmo que você limpe os dados.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">Nenhum terceiro encontrado.</p>
          ) : (
            rows.map(([key, rule]) => {
              const options = Object.values(rule.options).sort((a, b) => b.count - a.count);
              const isMulti = options.length > 1;
              return (
                <div key={key} className="mb-1.5 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.05]">
                  {/* Linha do terceiro */}
                  <div className="flex items-center gap-2">
                    <span
                      title={rule.direction === "out" ? "Saída" : "Entrada"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                        rule.direction === "out" ? "bg-red-500/15 text-red-400" : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {rule.direction === "out" ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{rule.thirdParty}</span>
                    {rule.pinned ? (
                      <span className="shrink-0 rounded-md bg-accentPositive/15 px-2 py-0.5 text-[10px] font-semibold text-accentPositive">sempre</span>
                    ) : isMulti ? (
                      <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">pergunta</span>
                    ) : (
                      <span className="shrink-0 rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-slate-400">automático</span>
                    )}
                    <button
                      onClick={() => deleteCategoryRule(key)}
                      title="Excluir regra"
                      className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Opções conhecidas — clique para fixar/desfixar */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {options.map((o) => {
                      const pinned = rule.pinned === o.category;
                      const avg = o.amountSum / o.count;
                      return (
                        <button
                          key={o.category}
                          onClick={() => setCategoryRulePinned(key, pinned ? null : o.category)}
                          title={pinned ? "Desfixar" : `Fixar "${o.category}" para sempre`}
                          className={`group flex items-center gap-1.5 rounded-lg px-2 py-1 text-left ring-1 transition ${
                            pinned
                              ? "bg-accentPositive/15 ring-accentPositive/30"
                              : "bg-white/[0.03] ring-white/[0.06] hover:ring-white/[0.15]"
                          }`}
                        >
                          {pinned ? <Pin size={11} className="shrink-0 text-accentPositive" /> : <PinOff size={11} className="shrink-0 text-slate-600 group-hover:text-slate-400" />}
                          <CategoryBadge category={o.category} />
                          <span className="text-[10px] tabular-nums text-slate-500">
                            {o.count}× · ~{toCurrencyBRL(avg)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {isMulti && !rule.pinned && (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Categorizado de formas diferentes — no próximo extrato ele sugere a mais próxima do valor. Fixe uma para parar de perguntar.
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-6 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
