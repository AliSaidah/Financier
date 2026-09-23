import { useRef, useState } from "react";
import { AlertCircle, Sparkles, User } from "lucide-react";
import { UploadZone } from "../components/UploadZone";
import { BankLogo } from "../components/BankLogo";
import { BANKS } from "../data/constants";
import { BankId } from "../types/finance";

interface Props {
  selectedBank: BankId | null;
  onBankSelect: (bank: BankId) => void;
  onFile: (file: File) => void;
  uploadError?: string | null;
  onClearError?: () => void;
  activeUserName: string;
}

function StepLabel({ step, label }: { step: string; label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accentPositive/10 text-[11px] font-bold text-accentPositive ring-1 ring-accentPositive/20">
        {step}
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
    </div>
  );
}

export function UploadPage({ selectedBank, onBankSelect, onFile, uploadError, onClearError, activeUserName }: Props) {
  const [showBankWarning, setShowBankWarning] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  function handleFile(file: File) {
    if (!selectedBank) {
      setShowBankWarning(true);
      gridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setShowBankWarning(false), 3500);
      return;
    }
    setShowBankWarning(false);
    onFile(file);
  }

  return (
    <div className="mx-auto max-w-xl pt-4">
      {/* Perfil ativo — pra não importar na loja/usuário errado */}
      <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-accentPositive/15 bg-accentPositive/[0.06] px-4 py-2.5">
        <User size={13} className="shrink-0 text-accentPositive" />
        <span className="text-xs text-slate-400">Importando para o perfil:</span>
        <span className="text-xs font-semibold text-accentPositive">{activeUserName}</span>
        <span className="ml-1 text-[11px] text-slate-600">· troque no topo da barra lateral se for outro</span>
      </div>

      {/* Hero */}
      <div className="mb-9 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accentPositive/20 bg-accentPositive/[0.08] px-3 py-1 text-[11px] font-medium text-accentPositive">
          <Sparkles size={11} />
          Importação de extrato
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">
          Comece pelo seu <span className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">extrato</span>
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
          Selecione o banco e envie o arquivo OFX — categorizamos e organizamos tudo para você.
        </p>
      </div>

      {/* Bank grid */}
      <div className="mb-7">
        <StepLabel step="01" label="Selecione o banco" />

        <div ref={gridRef} className="grid grid-cols-5 gap-2">
          {BANKS.map((bank) => {
            const active = selectedBank === bank.id;
            return (
              <button
                key={bank.id}
                onClick={() => { onBankSelect(bank.id); setShowBankWarning(false); }}
                className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-all duration-150 ${
                  active
                    ? "border-accentPositive/40 bg-accentPositive/[0.08] shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_4px_20px_rgba(16,185,129,0.12)] -translate-y-0.5"
                    : showBankWarning
                    ? "border-amber-400/40 bg-gradient-to-b from-white/[0.05] to-white/[0.02] hover:border-white/20"
                    : "border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.02] hover:-translate-y-0.5 hover:border-white/20 hover:shadow-card"
                }`}
              >
                <BankLogo bankId={bank.id} size={38} radius={10} />
                <span className={`text-[10px] font-medium leading-tight ${active ? "text-accentPositive" : "text-slate-400"}`}>
                  {bank.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Footer messages */}
        <div className="mt-2.5 h-4">
          {showBankWarning ? (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertCircle size={12} className="shrink-0" />
              Selecione um banco antes de importar o arquivo.
            </p>
          ) : (
            <p className="text-xs text-slate-600">Mais bancos serão adicionados em breve.</p>
          )}
        </div>
      </div>

      {/* Upload zone */}
      <div>
        <StepLabel step="02" label="Envie o arquivo" />
        <UploadZone onFile={handleFile} error={uploadError} onRetry={onClearError} />
      </div>
    </div>
  );
}
