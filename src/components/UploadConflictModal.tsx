import { motion } from "framer-motion";
import { AlertCircle, User } from "lucide-react";

interface Props {
  onReplace: () => void;
  onAppend: () => void;
  onCancel: () => void;
  userName: string;
  existingCount: number;
  newCount: number;
}

export function UploadConflictModal({ onReplace, onAppend, onCancel, userName, existingCount, newCount }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl shadow-black/50"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15">
            <AlertCircle size={18} className="text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Já existem dados neste perfil</h3>
            <p className="text-xs text-slate-400">Escolha como tratar o novo extrato.</p>
          </div>
        </div>

        {/* Contexto: perfil + contagens */}
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
          <User size={13} className="shrink-0 text-accentPositive" />
          <span className="text-xs text-slate-300">
            Perfil <span className="font-semibold text-accentPositive">{userName}</span> tem{" "}
            <span className="font-semibold text-white">{existingCount}</span> transações · o novo extrato traz{" "}
            <span className="font-semibold text-white">{newCount}</span>.
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={onAppend}
            className="w-full rounded-xl bg-accentPositive px-4 py-2.5 text-left text-sm font-semibold text-slate-950 transition hover:brightness-110"
          >
            Adicionar ao existente
            <span className="block text-[11px] font-normal text-slate-900/70">Junta os dois — use para meses/extratos do mesmo perfil. Duplicatas são ignoradas.</span>
          </button>
          <button
            onClick={onReplace}
            className="w-full rounded-xl border border-white/[0.08] bg-slate-800 px-4 py-2.5 text-left text-sm text-slate-200 transition hover:bg-slate-700"
          >
            Substituir tudo
            <span className="block text-[11px] text-slate-500">Remove os atuais e usa só este extrato.</span>
          </button>
          <button
            onClick={onCancel}
            className="w-full rounded-xl px-4 py-2 text-sm text-slate-500 transition hover:text-slate-300"
          >
            Cancelar
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-amber-400/80">
          É de outra loja? Cancele e troque o perfil antes de importar.
        </p>
      </motion.div>
    </div>
  );
}
