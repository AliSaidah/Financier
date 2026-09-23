import { Trash2, Tags } from "lucide-react";
import { useState } from "react";

interface Props {
  title: string;
  onClearAll?: () => void;
  onClearCategories?: () => void;
}

export function Header({ title, onClearAll, onClearCategories }: Props) {
  const [menuOpen, setMenuOpen]   = useState(false);
  const [confirming, setConfirming] = useState<"all" | "categories" | null>(null);

  function handleConfirm() {
    if (confirming === "all") onClearAll?.();
    if (confirming === "categories") onClearCategories?.();
    setConfirming(null);
    setMenuOpen(false);
  }

  function handleCancel() {
    setConfirming(null);
    setMenuOpen(false);
  }

  const showButton = onClearAll || onClearCategories;

  return (
    <header className="flex w-full items-center justify-between">
      <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>

      {showButton && !menuOpen && !confirming && (
        <button
          onClick={() => setMenuOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2 text-sm text-slate-400 transition-all duration-150 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 size={14} />
          Limpar dados
        </button>
      )}

      {showButton && menuOpen && !confirming && (
        <div className="flex items-center gap-2">
          {onClearCategories && (
            <button
              onClick={() => setConfirming("categories")}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-400 transition hover:bg-amber-500/20"
            >
              <Tags size={14} />
              Limpar categorias
            </button>
          )}
          {onClearAll && (
            <button
              onClick={() => setConfirming("all")}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <Trash2 size={14} />
              Limpar tudo
            </button>
          )}
          <button
            onClick={() => setMenuOpen(false)}
            className="rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
          >
            Cancelar
          </button>
        </div>
      )}

      {confirming && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">
            {confirming === "all" ? "Apagar todos os dados?" : "Remover categorias desta aba?"}
          </span>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <Trash2 size={14} />
            Confirmar
          </button>
          <button
            onClick={handleCancel}
            className="rounded-xl border border-white/10 bg-slate-800/80 px-4 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200"
          >
            Cancelar
          </button>
        </div>
      )}
    </header>
  );
}
