import { AlertCircle, CloudUpload, RefreshCw } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  error?: string | null;
  onRetry?: () => void;
}

export function UploadZone({ onFile, error, onRetry }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  if (error) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-red-500/40 bg-red-500/5 px-6 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
          <AlertCircle size={26} />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-300">Arquivo inválido ou não suportado</p>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
        </div>
        <button
          onClick={() => { onRetry?.(); inputRef.current?.click(); }}
          className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive"
        >
          <RefreshCw size={14} />
          Tentar outro arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".ofx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`group relative flex min-h-64 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200 ${
        dragging
          ? "border-accentPositive bg-accentPositive/10 scale-[1.01] shadow-glow-emerald"
          : "border-white/[0.12] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-accentPositive/50 hover:shadow-glow-emerald"
      }`}
    >
      {/* Glow interno sutil */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${dragging ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}>
        <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accentPositive/[0.07] blur-3xl" />
      </div>

      <div className={`relative flex flex-col items-center gap-4 transition-transform duration-200 ${dragging ? "scale-110" : "group-hover:scale-105"}`}>
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ring-1 transition-all duration-200 ${
          dragging
            ? "bg-accentPositive/20 text-accentPositive ring-accentPositive/40 shadow-[0_0_24px_rgba(16,185,129,0.3)]"
            : "bg-gradient-to-br from-white/[0.08] to-white/[0.02] text-slate-400 ring-white/[0.1] group-hover:text-accentPositive group-hover:ring-accentPositive/30"
        }`}>
          <CloudUpload size={28} />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-slate-200">
            {dragging ? "Solte o arquivo aqui" : "Arraste seu extrato aqui"}
          </p>
          <p className="mt-1.5 flex items-center justify-center gap-2 text-sm text-slate-500">
            <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 ring-1 ring-white/[0.08]">.OFX</span>
            ou clique para selecionar
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".ofx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
