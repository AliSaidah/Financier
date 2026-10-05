import { useRef, useState } from "react";
import { AlertTriangle, Check, Copy, FileSpreadsheet, FileText, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { PlanilhaFranquiasModal } from "./PlanilhaFranquias";
import { calcularCobranca, centavos, MARKETING_MIN, ROYALTIES_MIN } from "../../utils/royalties";
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

// Valores do Excel podem vir como número ou como texto "R$ 1.234,56"
function parseValor(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Normaliza razão social para comparação: sem acento, pontuação e sufixos societários
function normalizeNome(s: string): string {
  return semAcento(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltda|limitada|me|epp|eireli|sa|s a|cia)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Franquia Modal (nova + editar) ───────────────────────────────────────────

function FranquiaModal({ existing, onClose }: { existing?: Franquia; onClose: () => void }) {
  const { addFranquia, updateFranquia } = useFinanceiroStore();
  const [form, setForm] = useState({
    cidade: existing?.cidade ?? "",
    cnpj: existing ? formatCnpj(existing.cnpj) : "",
    vencimentoBoleto: existing ? String(existing.vencimentoBoleto) : "",
    razaoSocial: existing?.razaoSocial ?? "",
  });

  function handleSave() {
    if (!form.cidade || !form.cnpj) return;
    const data = {
      cidade: form.cidade.trim(),
      cnpj: normalizeCnpj(form.cnpj),
      vencimentoBoleto: parseInt(form.vencimentoBoleto) || 10,
      razaoSocial: form.razaoSocial.trim() || undefined,
    };
    if (existing) updateFranquia(existing.id, data);
    else addFranquia(data);
    onClose();
  }

  const inp = "rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accentPositive/40";
  const lbl = "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">{existing ? "Editar Franquia" : "Nova Franquia"}</h2>
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
            <input className={inp} placeholder="Como aparece no relatório de vendas" value={form.razaoSocial}
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
  razaoSocial: string;
  franquia?: Franquia;
  via?: "cnpj" | "razao" | "cidade" | "manual";
  baseCalculo: number;
  valorTroca: number;
  valorApurado: number;
  royalties: number;
  marketing: number;
  royaltiesMinimo: boolean;
  marketingMinimo: boolean;
}

// CNPJ → razão social cadastrada → cidade contida no nome (último recurso, revisar)
function findFranquia(franquias: Franquia[], cnpj: string, razao: string): { franquia?: Franquia; via?: "cnpj" | "razao" | "cidade" } {
  if (cnpj.length >= 14) {
    const f = franquias.find((x) => x.cnpj === cnpj);
    if (f) return { franquia: f, via: "cnpj" };
  }
  const n = normalizeNome(razao);
  if (!n) return {};
  const comRazao = franquias.filter((x) => x.razaoSocial && normalizeNome(x.razaoSocial).length >= 4);
  const exata = comRazao.find((x) => normalizeNome(x.razaoSocial!) === n);
  if (exata) return { franquia: exata, via: "razao" };
  const parciais = comRazao.filter((x) => {
    const fn = normalizeNome(x.razaoSocial!);
    return fn.includes(n) || n.includes(fn);
  });
  if (parciais.length === 1) return { franquia: parciais[0], via: "razao" };
  // Ex.: "SANTO SANTO SANTO ARARAQUARA - SP" → franquia de Araraquara
  const palavras = ` ${n} `;
  const porCidade = franquias.filter((x) => {
    const c = normalizeNome(x.cidade);
    return c.length >= 4 && palavras.includes(` ${c} `);
  });
  if (porCidade.length === 1) return { franquia: porCidade[0], via: "cidade" };
  return {};
}

const CHAVES_BASE = ["base", "apura", "venda", "bruta", "faturamento", "receita"];
const CHAVES_TROCA = ["troca", "desconto", "devoluc"];

function ImportRelatorioModal({ onClose }: { onClose: () => void }) {
  const { franquias, lancamentosFranquia, addLancamentoFranquia, updateLancamentoFranquia, removeLancamentoFranquia, updateFranquia } = useFinanceiroStore();
  const [mes, setMes] = useState(currentMes());
  const [rows, setRows] = useState<RelatorioRow[]>([]);
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setErro(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!json.length) return;

      const colKeys = Object.keys(json[0]);
      const headers = colKeys.map((h) => semAcento(h).trim());
      const cnpjIdx = headers.findIndex((h) => h.includes("cnpj"));
      const trocaIdx = headers.findIndex((h) => CHAVES_TROCA.some((k) => h.includes(k)));
      const baseIdx = headers.findIndex((h, i) => i !== trocaIdx && CHAVES_BASE.some((k) => h.includes(k)));
      if (baseIdx < 0) {
        setErro(`Não encontrei a coluna de vendas na planilha. Colunas encontradas: ${colKeys.map((k) => `"${k}"`).join(", ")}. O título da coluna de vendas precisa conter "Venda", "Base" ou "Faturamento".`);
        return;
      }
      let razaoIdx = headers.findIndex((h) => h.includes("razao") || h.includes("social"));
      if (razaoIdx < 0) razaoIdx = headers.findIndex((h) => ["nome", "empresa", "franquia", "cliente", "loja"].some((k) => h.includes(k)));
      if (razaoIdx < 0) {
        // Coluna dos nomes sem título: usa a que tem mais texto (não-numérico)
        let melhor = 0;
        colKeys.forEach((k, i) => {
          if (i === baseIdx || i === trocaIdx || i === cnpjIdx) return;
          const textos = json.filter((r) => typeof r[k] === "string" && /[a-zA-ZÀ-ÿ]/.test(r[k] as string)).length;
          if (textos > melhor) { melhor = textos; razaoIdx = i; }
        });
      }

      const parsed: RelatorioRow[] = json.map((row) => {
        const cnpj = normalizeCnpj(String(cnpjIdx >= 0 ? row[colKeys[cnpjIdx]] : ""));
        const razaoSocial = razaoIdx >= 0 ? String(row[colKeys[razaoIdx]]).trim() : "";
        const base = baseIdx >= 0 ? parseValor(row[colKeys[baseIdx]]) : 0;
        const troca = trocaIdx >= 0 ? parseValor(row[colKeys[trocaIdx]]) : 0;
        const apurado = centavos(Math.max(0, base - troca));
        const { franquia, via } = findFranquia(franquias, cnpj, razaoSocial);
        return {
          cnpj, razaoSocial, franquia, via, baseCalculo: base, valorTroca: troca,
          valorApurado: apurado, ...calcularCobranca(apurado),
        };
      }).filter((r) => (r.cnpj.length >= 14 || r.razaoSocial) && !/^(total|soma|subtotal)/i.test(r.razaoSocial));

      if (parsed.length === 0) {
        setErro(`Não encontrei nenhuma linha de franquia na planilha. Colunas encontradas: ${colKeys.map((k) => `"${k.startsWith("__EMPTY") ? "(sem título)" : k}"`).join(", ")}.`);
        return;
      }
      setRows(parsed);
      setStep("confirm");
    };
    reader.readAsArrayBuffer(file);
  }

  function setRowFranquia(i: number, franquiaId: string) {
    const f = franquias.find((x) => x.id === franquiaId);
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, franquia: f, via: f ? "manual" : undefined } : r)));
  }

  // Reimportar o mesmo mês atualiza os valores em vez de duplicar lançamentos.
  // Notas e boletos já anexados são mantidos (inclusive os que estavam em duplicatas antigas).
  function handleConfirm() {
    for (const row of rows) {
      if (!row.franquia) continue;
      const dados = { baseCalculo: row.baseCalculo, valorTroca: row.valorTroca, valorApurado: row.valorApurado };
      for (const [tipo, valor] of [["royalties", row.royalties], ["marketing", row.marketing]] as const) {
        const existentes = useFinanceiroStore.getState().lancamentosFranquia
          .filter((l) => l.franquiaId === row.franquia!.id && l.mesReferencia === mes && l.tipo === tipo);
        if (existentes.length === 0) {
          addLancamentoFranquia({ franquiaId: row.franquia.id, mesReferencia: mes, tipo, ...dados, valor });
          continue;
        }
        const [manter, ...duplicatas] = existentes;
        const anexos = {
          numeroNota: manter.numeroNota ?? duplicatas.find((d) => d.numeroNota)?.numeroNota,
          notaPdfBase64: manter.notaPdfBase64 ?? duplicatas.find((d) => d.notaPdfBase64)?.notaPdfBase64,
          boletoPdfBase64: manter.boletoPdfBase64 ?? duplicatas.find((d) => d.boletoPdfBase64)?.boletoPdfBase64,
        };
        updateLancamentoFranquia(manter.id, { ...dados, valor, ...anexos });
        duplicatas.forEach((d) => removeLancamentoFranquia(d.id));
      }
      // Aprende a razão social: no próximo mês essa franquia já é reconhecida sozinha
      if (row.razaoSocial && !row.franquia.razaoSocial) {
        updateFranquia(row.franquia.id, { razaoSocial: row.razaoSocial });
      }
    }
    onClose();
  }

  const unmatched = rows.filter((r) => !r.franquia);
  const jaLancadas = new Set(
    rows.filter((r) => r.franquia && lancamentosFranquia.some((l) =>
      l.franquiaId === r.franquia!.id && l.mesReferencia === mes && l.tipo !== "avulso")).map((r) => r.franquia!.id),
  ).size;
  const comMinimo = rows.filter((r) => r.franquia && (r.royaltiesMinimo || r.marketingMinimo)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl" style={{ maxHeight: "85vh" }}>
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
              {erro && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-400" />
                  <p className="text-sm text-red-300">{erro}</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) processFile(e.target.files[0]); e.target.value = ""; }} />
            </div>
          ) : (
            <div className="space-y-3">
              {unmatched.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-sm text-amber-300">
                    {unmatched.length} linha{unmatched.length > 1 ? "s" : ""} sem franquia identificada — escolha na lista abaixo.
                    A razão social fica salva na franquia e no próximo mês ela é reconhecida sozinha.
                  </p>
                </div>
              )}
              {jaLancadas > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-sky-400" />
                  <p className="text-sm text-sky-300">
                    {jaLancadas} franquia{jaLancadas > 1 ? "s já têm" : " já tem"} royalties/marketing em {mesLabel(mes)}.
                    Os valores serão <b>atualizados</b> (sem duplicar); notas e boletos anexados são mantidos.
                  </p>
                </div>
              )}
              {comMinimo > 0 && (
                <p className="px-1 text-xs text-slate-500">
                  <span className="font-semibold text-amber-400">mín.</span> = percentual ficou abaixo do mínimo
                  (royalties {toCurrencyBRL(ROYALTIES_MIN)} · marketing {toCurrencyBRL(MARKETING_MIN)}) e foi cobrado o mínimo — {comMinimo} franquia{comMinimo > 1 ? "s" : ""}.
                </p>
              )}
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                <div className="grid grid-cols-7 border-b border-white/[0.06] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <span className="col-span-3">No relatório → Franquia</span>
                  <span className="text-right">Base</span>
                  <span className="text-right">Troca</span>
                  <span className="text-right">Royalties 6%<br /><span className="normal-case tracking-normal text-slate-600">mín. 1.200</span></span>
                  <span className="text-right">Marketing 2%<br /><span className="normal-case tracking-normal text-slate-600">mín. 600</span></span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className={`grid grid-cols-7 items-center gap-2 border-b border-white/[0.04] px-4 py-2.5 last:border-0 ${!row.franquia ? "bg-amber-500/[0.03]" : ""}`}>
                    <div className="col-span-3 min-w-0 space-y-1">
                      <p className="truncate text-xs text-slate-400" title={row.razaoSocial}>
                        {row.razaoSocial || "—"}{row.cnpj.length >= 14 ? ` · ${formatCnpj(row.cnpj)}` : ""}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <select value={row.franquia?.id ?? ""} onChange={(e) => setRowFranquia(i, e.target.value)}
                          className={`min-w-0 flex-1 rounded-lg border bg-slate-800 px-2 py-1 text-xs outline-none focus:border-accentPositive/40 ${row.franquia ? "border-white/[0.08] text-slate-200" : "border-amber-500/30 text-amber-300"}`}>
                          <option value="">— Não importar —</option>
                          {franquias.map((f) => (
                            <option key={f.id} value={f.id}>{f.cidade}{f.razaoSocial ? ` — ${f.razaoSocial}` : ""}</option>
                          ))}
                        </select>
                        {row.via && (
                          <span
                            title={row.via === "cidade" ? "Reconhecida pela cidade no nome — confira se está certa" : undefined}
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${row.via === "cidade" ? "bg-amber-500/10 text-amber-400" : "bg-white/[0.05] text-slate-500"}`}>
                            {row.via === "cnpj" ? "CNPJ" : row.via === "razao" ? "Razão" : row.via === "cidade" ? "Cidade ?" : "Manual"}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-right text-xs tabular-nums text-slate-400">{toCurrencyBRL(row.baseCalculo)}</span>
                    <span className="text-right text-xs tabular-nums text-slate-400">{toCurrencyBRL(row.valorTroca)}</span>
                    <span className="text-right text-sm font-semibold tabular-nums text-accentPositive">
                      {toCurrencyBRL(row.royalties)}
                      {row.royaltiesMinimo && <span className="block text-[9px] font-semibold uppercase text-amber-400">mín.</span>}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-sky-400">
                      {toCurrencyBRL(row.marketing)}
                      {row.marketingMinimo && <span className="block text-[9px] font-semibold uppercase text-amber-400">mín.</span>}
                    </span>
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
            <button onClick={handleConfirm} disabled={!rows.some((r) => r.franquia)}
              className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar e Gravar ({rows.filter((r) => r.franquia).length} franquias)
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
  const [editing, setEditing] = useState<Franquia | null>(null);
  const [deleting, setDeleting] = useState<Franquia | null>(null);
  const [showImportRel, setShowImportRel] = useState(false);
  const [showPlanilha, setShowPlanilha] = useState(false);
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
              <div key={f.id} role="button" tabIndex={0} onClick={() => setSelectedId(f.id)}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedId(f.id); }}
                className={`group flex w-full cursor-pointer items-center gap-2 border-b border-white/[0.04] px-3 py-2.5 text-left last:border-0 transition ${selectedId === f.id ? "bg-accentPositive/10 text-accentPositive" : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"}`}>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{f.cidade}</p>
                  {f.razaoSocial && <p className="truncate text-[10px] text-slate-500" title={f.razaoSocial}>{f.razaoSocial}</p>}
                  <p className="text-[10px] text-slate-600">{formatCnpj(f.cnpj)}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setEditing(f); }} title="Editar"
                  className="shrink-0 rounded p-1 text-slate-600 opacity-60 transition hover:bg-white/[0.06] hover:text-slate-200 group-hover:opacity-100">
                  <Pencil size={11} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setDeleting(f); }} title="Excluir"
                  className="shrink-0 rounded p-1 text-slate-700 opacity-60 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100">
                  <Trash2 size={11} />
                </button>
              </div>
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
          <button onClick={() => setShowPlanilha(true)}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-slate-400 transition hover:border-emerald-400/30 hover:text-emerald-400">
            <FileSpreadsheet size={12} /> Planilha do mês
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
              <p className="text-xs text-slate-600">
                {selected.razaoSocial ? `${selected.razaoSocial} · ` : ""}Vencimento: dia {selected.vencimentoBoleto} · {formatCnpj(selected.cnpj)}
              </p>
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

      {showAdd && <FranquiaModal onClose={() => setShowAdd(false)} />}
      {editing && <FranquiaModal existing={editing} onClose={() => setEditing(null)} />}
      {deleting && (() => {
        const qtd = lancamentosFranquia.filter((l) => l.franquiaId === deleting.id).length;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
              <div className="mb-2 flex items-center gap-2 text-red-400">
                <Trash2 size={16} />
                <h2 className="font-semibold">Excluir {deleting.cidade}?</h2>
              </div>
              <p className="text-sm text-slate-400">
                {qtd > 0
                  ? `Isso também apaga ${qtd} lançamento${qtd > 1 ? "s" : ""} dessa franquia (royalties, marketing, avulsos, notas e boletos anexados). Não dá para desfazer.`
                  : "A franquia não tem lançamentos. Não dá para desfazer."}
              </p>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDeleting(null)}
                  className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Cancelar</button>
                <button onClick={() => { removeFranquia(deleting.id); if (selectedId === deleting.id) setSelectedId(null); setDeleting(null); }}
                  className="flex-1 rounded-xl bg-red-500/15 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/25">
                  Excluir
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {showImportRel && <ImportRelatorioModal onClose={() => setShowImportRel(false)} />}
      {showPlanilha && <PlanilhaFranquiasModal mes={mes} onClose={() => setShowPlanilha(false)} />}
      {showImportNotas && <ImportNotasModal mes={mes} onClose={() => setShowImportNotas(false)} />}
      {avulsoFranquia && <AddAvulsoModal franquia={avulsoFranquia} mes={mes} onClose={() => setAvulsoFranquia(null)} />}
    </div>
  );
}
