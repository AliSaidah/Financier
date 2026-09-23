import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { DownloadCloud, X } from "lucide-react";

export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<"idle" | "downloading" | "installing" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    check()
      .then((result) => { if (result?.available) setUpdate(result); })
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

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

  return (
    <div
      className="fixed bottom-6 left-6 flex items-center gap-3 rounded-xl border border-sky-500/25 bg-gradient-to-b from-slate-900 to-[#0d1426] px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={{ zIndex: 10001 }}
    >
      <DownloadCloud size={18} className="shrink-0 text-sky-400" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">Nova versão disponível ({update.version})</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {status === "downloading" && "Baixando atualização…"}
          {status === "installing" && "Instalando… o app vai reiniciar"}
          {status === "error" && "Falha ao atualizar. Tente novamente mais tarde."}
          {status === "idle" && "Seus dados não serão perdidos."}
        </p>
      </div>
      {status === "idle" && (
        <button
          onClick={handleUpdate}
          className="ml-1 shrink-0 rounded-lg bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-300 transition hover:bg-sky-500/25"
        >
          Atualizar
        </button>
      )}
      {status === "idle" && (
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
