import { useState } from "react";
import { Check } from "lucide-react";
import { EXPENSE_CATEGORIES } from "../data/constants";

// Categorias excluídas da classificação CF/CV
const EXCLUDED_IDS = new Set(["transferencia-interna", "estorno-reembolso"]);

// Pré-selecionados como CF por padrão
const DEFAULT_CF_IDS = new Set([
  "aluguel",
  "agua",
  "energia",
  "gas",
  "internet-telefone",
  "folha-pagamento",
  "beneficios",
  "seguros",
  "assinaturas",
]);

const CATEGORIES = EXPENSE_CATEGORIES.filter((c) => !EXCLUDED_IDS.has(c.id));

interface Props {
  onConfirm: (fixedIds: string[]) => void;
}

export function CfCvSetupModal({ onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_CF_IDS));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="border-b border-white/[0.06] px-6 py-5">
          <h2 className="text-base font-semibold text-white">Configurar Contas Fixas</h2>
          <p className="mt-1 text-sm text-slate-400">
            Marque as categorias que você considera <span className="font-medium text-emerald-400">Conta Fixa (CF)</span>.
            O restante será classificado como <span className="font-medium text-slate-300">Conta Variável (CV)</span>.
          </p>
        </div>

        {/* Category list */}
        <div className="max-h-72 overflow-y-auto px-3 py-3">
          {CATEGORIES.map((cat) => {
            const isChecked = selected.has(cat.id);
            return (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[0.04]"
              >
                {/* Custom checkbox */}
                <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(cat.id)}
                    className="sr-only"
                  />
                  <div
                    className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-all ${
                      isChecked
                        ? "border-emerald-500 bg-emerald-500/25 text-emerald-400"
                        : "border-slate-600 bg-slate-800/60 text-transparent"
                    }`}
                  >
                    {isChecked && <Check size={9} strokeWidth={3} />}
                  </div>
                </div>

                <span className="flex-1 text-sm text-slate-200">{cat.name}</span>

                {DEFAULT_CF_IDS.has(cat.id) && (
                  <span className="text-xs text-slate-600">sugerido</span>
                )}
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-white/[0.06] px-6 py-4">
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>{selected.size} categorias fixas selecionadas</span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set())}
                className="transition hover:text-slate-300"
              >
                Limpar
              </button>
              <button
                onClick={() => setSelected(new Set(DEFAULT_CF_IDS))}
                className="transition hover:text-slate-300"
              >
                Redefinir sugestões
              </button>
            </div>
          </div>
          <button
            onClick={() => onConfirm([...selected])}
            className="w-full rounded-xl bg-emerald-600/80 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
