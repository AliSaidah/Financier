import { useRef, useState } from "react";
import { AlertTriangle, Check, Copy, FileText, Plus, Trash2, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { useFinanceiroStore } from "../../store/useFinanceiroStore";
import { Franquia, LancamentoFranquia } from "../../types/finance";
import { toCurrencyBRL } from "../../lib/formatters";
import { extractNotaInfo, extractPdfText, fileToBase64, formatCnpj, normalizeCnpj } from "../../utils/pdfExtractor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMes(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[m - 1]}/${y}`;
}

function calcVencimento(mesReferencia: string, dia: number): string {
  const [y, m] = mesReferencia.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const d = Math.min(dia, lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ─── Add Franquia Modal ───────────────────────────────────────────────────────

function AddFranquiaModal({ onClose }: { onClose: () => void }) {
  const addFranquia = useFinanceiroStore((s) => s.addFranquia);
  const [form, setForm] = useState({ cidade: "", cnpj: "", vencimentoBoleto: "", razaoSocial: "" });

  function handleSave() {
    if (!form.cidade || !form.cnpj) return;
    addFranquia({ cidade: form.cidade, cnpj: normalizeCnpj(form.cnpj), vencimentoBoleto: parseInt(form.vencimentoBoleto) || 10, razaoSocial: form.razaoSocial || undefined });
    onClose();
  }

  const inp = "rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accentPositive/40";
  const lbl = "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">Nova Franquia</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Cidade</span>
            <input className={inp} placeholder="Ex: São Paulo" value={form.cidade}
              onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>CNPJ</span>
            <input className={inp} placeholder="00.000.000/0000-00" value={form.cnpj}
              onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Razão Social</span>
            <input className={inp} placeholder="Opcional" value={form.razaoSocial}
              onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Dia vencimento boleto</span>
            <input type="number" min={1} max={31} className={inp} placeholder="10" value={form.vencimentoBoleto}
              onChange={(e) => setForm((f) => ({ ...f, vencimentoBoleto: e.target.value }))} />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={handleSave} disabled={!form.cidade || !form.cnpj}
            className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Relatório Excel ───────────────────────────────────────────────────

interface RelatorioRow {
  cnpj: string;
  franquia?: Franquia;
  baseCalculo: number;
  valorTroca: number;
  valorApurado: number;
  royalties: number;
  marketing: number;
  matched: boolean;
}

function ImportRelatorioModal({ onClose }: { onClose: () => void }) {
  const { franquias, addLancamentoFranquia } = useFinanceiroStore();
  const [mes, setMes] = useState(currentMes());
  const [rows, setRows] = useState<RelatorioRow[]>([]);
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) return;

      const headers = Object.keys(json[0]).map((h) => h.toLowerCase().trim());
      const cnpjIdx = headers.findIndex((h) => h.includes("cnpj"));
      const baseIdx = headers.findIndex((h) => h.includes("base") || h.includes("apura"));
      const trocaIdx = headers.findIndex((h) => h.includes("troca") || h.includes("desconto") || h.includes("devoluc"));

      const colKeys = Object.keys(json[0]);
      const parsed: RelatorioRow[] = json.map((row) => {
        const rawCnpj = String(cnpjIdx >= 0 ? row[colKeys[cnpjIdx]] : "");
        const cnpj = normalizeCnpj(rawCnpj);
        const base = baseIdx >= 0 ? parseFloat(String(row[colKeys[baseIdx]]).replace(",", ".")) || 0 : 0;
        const troca = trocaIdx >= 0 ? parseFloat(String(row[colKeys[trocaIdx]]).replace(",", ".")) || 0 : 0;
        const apurado = Math.max(0, base - troca);
        const franquia = franquias.find((f) => f.cnpj === cnpj);
        return {
          cnpj, franquia, baseCalculo: base, valorTroca: troca,
          valorApurado: apurado, royalties: apurado * 0.06, marketing: apurado * 0.02,
          matched: !!franquia,
        };
      }).filter((r) => r.cnpj.length >= 14);

      setRows(parsed);
      setStep("confirm");
    };
    reader.readAsArrayBuffer(file);
  }

  function handleConfirm() {
    for (const row of rows) {
      if (!row.franquia) continue;
      addLancamentoFranquia({ franquiaId: row.franquia.id, mesReferencia: mes, tipo: "royalties", baseCalculo: row.baseCalculo, valorTroca: row.valorTroca, valorApurado: row.valorApurado, valor: row.royalties });
      addLancamentoFranquia({ franquiaId: row.franquia.id, mesReferencia: mes, tipo: "marketing", baseCalculo: row.baseCalculo, valorTroca: row.valorTroca, valorApurado: row.valorApurado, valor: row.marketing });
    }
    onClose();
  }

  const unmatched = rows.filter((r) => !r.matched);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl" style={{ maxHeight: "85vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="font-semibold text-slate-100">Importar Relatório de Vendas</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Mês de referência</span>
                <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                  className="w-48 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-accentPositive/40" />
              </div>
              <button onClick={() => fileRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/[0.10] py-8 text-sm text-slate-500 transition hover:border-accentPositive/30 hover:text-accentPositive">
                <Upload size={16} /> Selecionar arquivo Excel (.xlsx)
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); }} />
            </div>
          ) : (
            <div className="space-y-3">
              {unmatched.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-sm text-amber-300">
                    {unmatched.length} CNPJ{unmatched.length > 1 ? "s" : ""} não encontrado{unmatched.length > 1 ? "s" : ""} no cadastro:{" "}
                    {unmatched.map((r) => formatCnpj(r.cnpj)).join(", ")}
                  </p>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <div className="grid grid-cols-6 border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="col-span-2">Franquia / CNPJ</span>
                  <span className="text-right">Base</span>
                  <span className="text-right">Troca</span>
                  <span className="text-right">Royalties 6%</span>
                  <span className="text-right">Marketing 2%</span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-6 items-center border-b border-white/[0.04] px-4 py-2.5 last:border-0 ${!row.matched ? "opacity-50" : ""}`}>
                    <div className="col-span-2 min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{row.franquia?.cidade ?? "—"}</p>
                      <p className="text-[11px] text-slate-600">{formatCnpj(row.cnpj)}</p>
                    </div>
                    <span className="text-right text-xs tabular-nums text-slate-400">{toCurrencyBRL(row.baseCalculo)}</span>
                    <span className="text-right text-xs tabular-nums text-slate-400">{toCurrencyBRL(row.valorTroca)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-accentPositive">{toCurrencyBRL(row.royalties)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-sky-400">{toCurrencyBRL(row.marketing)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {step === "confirm" && (
          <div className="flex shrink-0 gap-3 border-t border-white/[0.06] px-6 py-4">
            <button onClick={() => { setStep("upload"); setRows([]); }}
              className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Voltar</button>
            <button onClick={handleConfirm} disabled={!rows.some((r) => r.matched)}
              className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar e Gravar ({rows.filter((r) => r.matched).length} franquias)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Import Notas PDF ─────────────────────────────────────────────────────────

interface NotaMatch {
  fileName: string;
  cnpj?: string;
  franquia?: Franquia;
  tipo?: "royalties" | "marketing";
  numeroNota?: string;
  lancamento?: LancamentoFranquia;
  base64: string;
  ok: boolean;
}

function ImportNotasModal({ mes, onClose }: { mes: string; onClose: () => void }) {
  const { franquias, lancamentosFranquia, updateLancamentoFranquia } = useFinanceiroStore();
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const [matches, setMatches] = useState<NotaMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function processFiles(files: FileList) {
    setLoading(true);
    const result: NotaMatch[] = [];
    for (const file of Array.from(files)) {
      const base64 = await fileToBase64(file);
      let info: ReturnType<typeof extractNotaInfo> = {};
      try {
        const text = await extractPdfText(file);
        info = extractNotaInfo(text);
      } catch {}

      const franquia = info.cnpj ? franquias.find((f) => f.cnpj === info.cnpj) : undefined;
      const lancamento = franquia && info.tipo
        ? lancamentosFranquia.find((l) => l.franquiaId === franquia.id && l.mesReferencia === mes && l.tipo === info.tipo)
        : undefined;

      result.push({ fileName: file.name, cnpj: info.cnpj, franquia, tipo: info.tipo, numeroNota: info.numeroNota, lancamento, base64, ok: !!lancamento });
    }
    setLoading(false);
    setMatches(result);
    setStep("confirm");
  }

  function handleConfirm() {
    for (const m of matches) {
      if (!m.lancamento) continue;
      updateLancamentoFranquia(m.lancamento.id, { notaPdfBase64: m.base64, numeroNota: m.numeroNota });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl" style={{ maxHeight: "85vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="font-semibold text-slate-100">Importar Notas Fiscais — {mesLabel(mes)}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "upload" ? (
            <button onClick={() => fileRef.current?.click()} disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/[0.10] py-8 text-sm text-slate-500 transition hover:border-accentPositive/30 hover:text-accentPositive disabled:opacity-40">
              <Upload size={16} /> {loading ? "Lendo PDFs…" : "Selecionar PDFs das notas"}
            </button>
          ) : (
            <div className="space-y-2">
              {matches.map((m, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <FileText size={14} className={m.ok ? "text-emerald-400" : "text-slate-600"} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-slate-300">{m.fileName}</p>
                    <p className="text-xs text-slate-600">
                      {m.franquia ? `${m.franquia.cidade} · ` : "CNPJ não encontrado · "}
                      {m.tipo ?? "tipo não identificado"}
                      {m.numeroNota ? ` · NF ${m.numeroNota}` : ""}
                    </p>
                  </div>
                  {m.ok ? <Check size={14} className="shrink-0 text-emerald-400" /> : <AlertTriangle size={14} className="shrink-0 text-amber-400" />}
                </div>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) processFiles(e.target.files); }} />
        </div>
        {step === "confirm" && (
          <div className="flex shrink-0 gap-3 border-t border-white/[0.06] px-6 py-4">
            <button onClick={() => { setStep("upload"); setMatches([]); }}
              className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Voltar</button>
            <button onClick={handleConfirm} disabled={!matches.some((m) => m.ok)}
              className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar ({matches.filter((m) => m.ok).length} notas)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lancamento Row ───────────────────────────────────────────────────────────

function LancamentoRow({ lanc, franquia }: { lanc: LancamentoFranquia; franquia: Franquia }) {
  const { updateLancamentoFranquia, removeLancamentoFranquia } = useFinanceiroStore();
  const [showPdf, setShowPdf] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tipoColor = lanc.tipo === "royalties" ? "text-accentPositive" : lanc.tipo === "marketing" ? "text-sky-400" : "text-purple-400";
  const tipoLabel = lanc.tipo === "royalties" ? "Royalties" : lanc.tipo === "marketing" ? "Marketing" : "Avulso";

  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0">
        <span className={`w-20 shrink-0 text-xs font-semibold ${tipoColor}`}>{tipoLabel}</span>
        {lanc.tipo !== "avulso" && (
          <span className="text-xs tabular-nums text-slate-600">
            {toCurrencyBRL(lanc.baseCalculo)} − {toCurrencyBRL(lanc.valorTroca)} = {toCurrencyBRL(lanc.valorApurado)}
          </span>
        )}
        <span className="ml-auto text-sm font-semibold tabular-nums text-slate-200">{toCurrencyBRL(lanc.valor)}</span>
        {lanc.numeroNota && (
          <button onClick={() => navigator.clipboard.writeText(lanc.numeroNota!)}
            className="flex items-center gap-1 rounded-lg border border-white/[0.07] px-2 py-1 text-[11px] text-slate-500 hover:text-slate-200">
            <Copy size={10} /> NF {lanc.numeroNota}
          </button>
        )}
        {lanc.notaPdfBase64 && (
          <button onClick={() => setShowPdf(lanc.notaPdfBase64!)}
            className="flex items-center gap-1 rounded-lg border border-white/[0.07] px-2 py-1 text-[11px] text-emerald-400 hover:bg-emerald-400/10">
            <FileText size={10} /> Nota
          </button>
        )}
        {lanc.boletoPdfBase64 ? (
          <button onClick={() => setShowPdf(lanc.boletoPdfBase64!)}
            className="flex items-center gap-1 rounded-lg border border-white/[0.07] px-2 py-1 text-[11px] text-sky-400 hover:bg-sky-400/10">
            <FileText size={10} /> Boleto
          </button>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-dashed border-white/[0.07] px-2 py-1 text-[11px] text-slate-600 hover:text-slate-400">
            <Upload size={10} /> Boleto
          </button>
        )}
        <button onClick={() => removeLancamentoFranquia(lanc.id)} className="text-slate-700 hover:text-red-400">
          <Trash2 size={12} />
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const b64 = await fileToBase64(file);
          updateLancamentoFranquia(lanc.id, { boletoPdfBase64: b64 });
        }} />
      {showPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="relative flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl overflow-hidden bg-slate-900">
            <button onClick={() => setShowPdf(null)} className="absolute right-3 top-3 z-10 rounded-lg bg-slate-800 p-1.5 text-slate-400 hover:text-white"><X size={16} /></button>
            <iframe src={showPdf} className="flex-1 w-full" title="PDF" />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Add Avulso Modal ─────────────────────────────────────────────────────────

function AddAvulsoModal({ franquia, mes, onClose }: { franquia: Franquia; mes: string; onClose: () => void }) {
  const addLancamentoFranquia = useFinanceiroStore((s) => s.addLancamentoFranquia);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");

  function handleSave() {
    const v = parseFloat(valor.replace(",", "."));
    if (!descricao || isNaN(v)) return;
    addLancamentoFranquia({ franquiaId: franquia.id, mesReferencia: mes, tipo: "avulso", baseCalculo: v, valorTroca: 0, valorApurado: v, valor: v, descricao });
    onClose();
  }

  const inp = "rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accentPositive/40";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">Cobrança Avulsa — {franquia.cidade}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <input className={inp + " w-full"} placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <input className={inp + " w-full"} placeholder="Valor (ex: 250,00)" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={handleSave} disabled={!descricao || !valor}
            className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function GestaoFranquiasPage() {
  const { franquias, lancamentosFranquia, removeFranquia } = useFinanceiroStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mes, setMes] = useState(currentMes());
  const [showAdd, setShowAdd] = useState(false);
  const [showImportRel, setShowImportRel] = useState(false);
  const [showImportNotas, setShowImportNotas] = useState(false);
  const [avulsoFranquia, setAvulsoFranquia] = useState<Franquia | null>(null);

  const selected = franquias.find((f) => f.id === selectedId) ?? null;
  const lancamentosMes = lancamentosFranquia.filter((l) => l.mesReferencia === mes && l.franquiaId === selectedId);

  const totalMes = lancamentosFranquia
    .filter((l) => l.mesReferencia === mes)
    .reduce((s, l) => s + l.valor, 0);

  return (
    <div className="flex h-full gap-5">
      {/* Left: franchise list */}
      <div className="flex w-56 shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Franquias</span>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 rounded-lg bg-accentPositive/10 px-2 py-1 text-xs font-medium text-accentPositive hover:bg-accentPositive/20">
            <Plus size={11} /> Nova
          </button>
        </div>
        <div className="overflow-y-auto rounded-xl border border-white/[0.07] bg-slate-800/40">
          {franquias.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-600">Nenhuma franquia.</p>
          ) : (
            franquias.map((f) => (
              <button key={f.id} onClick={() => setSelectedId(f.id)}
                className={`flex w-full items-center gap-2 border-b border-white/[0.04] px-3 py-2.5 text-left last:border-0 transition ${selectedId === f.id ? "bg-accentPositive/10 text-accentPositive" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{f.cidade}</p>
                  <p className="text-[10px] text-slate-600">{formatCnpj(f.cnpj)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeFranquia(f.id); if (selectedId === f.id) setSelectedId(null); }}
                  className="shrink-0 text-slate-700 hover:text-red-400">
                  <Trash2 size={12} />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: lancamentos */}
      <div className="flex flex-1 flex-col gap-4 min-w-0">
        <div className="flex items-center gap-3">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-accentPositive/40" />
          <button onClick={() => setShowImportRel(true)}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-accentPositive/30 hover:text-accentPositive">
            <Upload size={12} /> Importar Relatório
          </button>
          {selected && (
            <>
              <button onClick={() => setShowImportNotas(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-sky-400/30 hover:text-sky-400">
                <FileText size={12} /> Importar Notas
              </button>
              <button onClick={() => setAvulsoFranquia(selected)}
                className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-purple-400/30 hover:text-purple-400">
                <Plus size={12} /> Avulso
              </button>
            </>
          )}
          <div className="ml-auto text-right">
            <p className="text-[10px] text-slate-600">Total {mesLabel(mes)}</p>
            <p className="text-sm font-bold text-slate-200 tabular-nums">{toCurrencyBRL(totalMes)}</p>
          </div>
        </div>

        {!selected ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-white/[0.07] bg-slate-800/20">
            <p className="text-sm text-slate-600">Selecione uma franquia ao lado.</p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
            <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
              <p className="text-sm font-semibold text-slate-200">{selected.cidade}</p>
              <p className="text-xs text-slate-600">Vencimento: dia {selected.vencimentoBoleto} · {formatCnpj(selected.cnpj)}</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {lancamentosMes.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-slate-600">Nenhum lançamento em {mesLabel(mes)}.</p>
              ) : (
                lancamentosMes.map((l) => <LancamentoRow key={l.id} lanc={l} franquia={selected} />)
              )}
            </div>
            {lancamentosMes.length > 0 && (
              <div className="flex items-center justify-between border-t border-white/[0.06] px-4 py-3">
                <span className="text-xs font-semibold text-slate-500">Total {mesLabel(mes)}</span>
                <span className="text-sm font-bold tabular-nums text-white">
                  {toCurrencyBRL(lancamentosMes.reduce((s, l) => s + l.valor, 0))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddFranquiaModal onClose={() => setShowAdd(false)} />}
      {showImportRel && <ImportRelatorioModal onClose={() => setShowImportRel(false)} />}
      {showImportNotas && <ImportNotasModal mes={mes} onClose={() => setShowImportNotas(false)} />}
      {avulsoFranquia && <AddAvulsoModal franquia={avulsoFranquia} mes={mes} onClose={() => setAvulsoFranquia(null)} />}
    </div>
  );
}
