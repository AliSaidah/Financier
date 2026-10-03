import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";
import { CheckCircle2, DownloadCloud, Loader2, RefreshCw, WifiOff, X } from "lucide-react";

const CHECK_EVENT = "financier:check-update";

type Status = "hidden" | "checking" | "uptodate" | "available" | "downloading" | "installing" | "error";

// Toast de atualização. Checa sozinho ao abrir o app (silencioso) e quando o
// usuário clica em "Verificar atualizações" na barra lateral (com feedback).
export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<Status>("hidden");

  async function runCheck(manual: boolean) {
    if (manual) setStatus("checking");
    try {
      const result = await check();
      if (result?.available) {
        setUpdate(result);
        setStatus("available");
      } else if (manual) {
        setStatus("uptodate");
        setTimeout(() => setStatus((s) => (s === "uptodate" ? "hidden" : s)), 4000);
      }
    } catch {
      if (manual) setStatus("error");
    }
  }

  useEffect(() => {
    runCheck(false);
    const onManual = () => runCheck(true);
    window.addEventListener(CHECK_EVENT, onManual);
    return () => window.removeEventListener(CHECK_EVENT, onManual);
  }, []);

  async function handleUpdate() {
    if (!update) return;
    try {
      setStatus("downloading");
      await update.downloadAndInstall();
      setStatus("installing");
      await relaunch();
    } catch {
      setStatus("error");
    }
  }

  if (status === "hidden") return null;

  const canClose = status !== "downloading" && status !== "installing" && status !== "checking";

  return (
    <div
      className="fixed bottom-6 left-[246px] flex max-w-sm items-center gap-3 rounded-xl border border-sky-500/25 bg-gradient-to-b from-slate-900 to-[#0d1426] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={{ zIndex: 10001 }}
    >
      {status === "checking" && <Loader2 size={18} className="shrink-0 animate-spin text-sky-400" />}
      {status === "uptodate" && <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />}
      {status === "error" && <WifiOff size={18} className="shrink-0 text-amber-400" />}
      {(status === "available" || status === "downloading" || status === "installing") && (
        <DownloadCloud size={18} className="shrink-0 text-sky-400" />
      )}

      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">
          {status === "checking" && "Verificando atualizações…"}
          {status === "uptodate" && "Você já está na versão mais recente"}
          {status === "error" && "Não foi possível atualizar"}
          {(status === "available" || status === "downloading" || status === "installing") &&
            `Nova versão disponível (${update?.version})`}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {status === "available" && "Seus dados não serão perdidos."}
          {status === "downloading" && "Baixando atualização…"}
          {status === "installing" && "Instalando… o app vai reiniciar"}
          {status === "error" && "Verifique a internet e tente de novo."}
        </p>
      </div>

      {status === "available" && (
        <button
          onClick={handleUpdate}
          className="ml-1 shrink-0 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/25"
        >
          Atualizar
        </button>
      )}
      {canClose && (
        <button
          onClick={() => setStatus("hidden")}
          className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// Versão atual + botão fixo para checar atualização manualmente (barra lateral)
export function VersionCheckButton() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <button
      onClick={() => window.dispatchEvent(new Event(CHECK_EVENT))}
      className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-slate-500 transition hover:bg-white/[0.04] hover:text-sky-300"
    >
      <RefreshCw size={11} />
      Verificar atualizações{version ? ` · v${version}` : ""}
    </button>
  );
}
