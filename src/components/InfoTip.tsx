import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

interface Props {
  title?: string;
  children: React.ReactNode;
}

/**
 * Ícone "i" que abre um popover explicando como um cálculo é feito.
 * Renderizado via portal para não ser cortado por containers com overflow-hidden.
 */
export function InfoTip({ title, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const W = 268;
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({
      top:  r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
    });
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label="Como é calculado"
        className="inline-flex shrink-0 items-center text-slate-500 transition hover:text-accentPositive"
      >
        <Info size={12} />
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, width: W, zIndex: 9999 }}
            className="rounded-xl border border-white/[0.1] bg-slate-900 p-3.5 text-xs leading-relaxed text-slate-300 shadow-2xl shadow-black/60"
          >
            {title && (
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
            )}
            {children}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
