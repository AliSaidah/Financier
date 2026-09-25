import { useRef, useState } from "react";
import { AlertTriangle, Check, FileText, FileDown, Pencil, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { useFinanceiroStore } from "../../store/useFinanceiroStore";
import { Funcionario, LancamentoFuncionario } from "../../types/finance";
import { toCurrencyBRL, parseBRLInput, numberToBRLInput } from "../../lib/formatters";
import { extractHoleriteEntries, extractPdfText, fileToBase64 } from "../../utils/pdfExtractor";

type AdminTab = "funcionarios" | "holerites" | "vavr";

function currentMes(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Funcionario Modal (add + edit) ──────────────────────────────────────────

function FuncionarioModal({ existing, onClose }: { existing?: Funcionario; onClose: () => void }) {
  const { addFuncionario, updateFuncionario } = useFinanceiroStore();
  const [form, setForm] = useState({
    nome: existing?.nome ?? "",
    cargo: existing?.cargo ?? "",
    tipo: existing?.tipo ?? ("CLT" as "CLT" | "PJ"),
    admissao: existing?.admissao ?? "",
  });

  const inp = "rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-accentPositive/40";
  const lbl = "text-[11px] font-semibold uppercase tracking-wider text-slate-500";

  function handleSave() {
    if (!form.nome || !form.cargo) return;
    if (existing) {
      updateFuncionario(existing.id, form);
    } else {
      addFuncionario({ ...form, ativo: true });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-semibold text-slate-100">{existing ? "Editar Funcionário" : "Novo Funcionário"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Nome</span>
            <input className={inp} placeholder="Nome completo" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={lbl}>Cargo</span>
            <input className={inp} placeholder="Ex: Atendente, Gerente…" value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className={lbl}>Tipo</span>
              <select className={inp + " cursor-pointer"} value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as "CLT" | "PJ" }))}>
                <option value="CLT">CLT</option>
                <option value="PJ">PJ</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={lbl}>Admissão</span>
              <input type="date" className={inp} value={form.admissao} onChange={(e) => setForm((f) => ({ ...f, admissao: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Cancelar</button>
          <button onClick={handleSave} disabled={!form.nome || !form.cargo}
            className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Funcionários Tab ─────────────────────────────────────────────────────────

function FuncionariosTab() {
  const { funcionarios, updateFuncionario, removeFuncionario } = useFinanceiroStore();
  const [modal, setModal] = useState<"add" | Funcionario | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {funcionarios.length} funcionário{funcionarios.length !== 1 ? "s" : ""}
        </span>
        <button onClick={() => setModal("add")}
          className="flex items-center gap-1.5 rounded-xl bg-accentPositive/10 px-4 py-2 text-sm font-medium text-accentPositive hover:bg-accentPositive/20">
          <Plus size={14} /> Novo Funcionário
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
        {funcionarios.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-600">Nenhum funcionário cadastrado.</p>
        ) : (
          funcionarios.map((f) => (
            <div key={f.id} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-3 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{f.nome}</p>
                <p className="text-xs text-slate-500">{f.cargo}{f.admissao ? ` · desde ${f.admissao.split("-").reverse().join("/")}` : ""}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${f.tipo === "CLT" ? "bg-sky-500/10 text-sky-400" : "bg-purple-500/10 text-purple-400"}`}>{f.tipo}</span>
              <button onClick={() => updateFuncionario(f.id, { ativo: !f.ativo })}
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition ${f.ativo ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700/50 text-slate-500"}`}>
                {f.ativo ? "Ativo" : "Inativo"}
              </button>
              <button onClick={() => setModal(f)} title="Editar"
                className="shrink-0 rounded-lg p-1.5 text-slate-600 transition hover:bg-white/[0.06] hover:text-slate-300">
                <Pencil size={13} />
              </button>
              <button onClick={() => removeFuncionario(f.id)} title="Excluir"
                className="shrink-0 rounded-lg p-1.5 text-slate-700 transition hover:bg-red-500/10 hover:text-red-400">
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      {modal === "add" && <FuncionarioModal onClose={() => setModal(null)} />}
      {modal && modal !== "add" && <FuncionarioModal existing={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

// ─── Holerites Tab ────────────────────────────────────────────────────────────

interface HoleriteExtracted {
  nomeEditado: string;
  valorEditado: string;
  funcionario?: Funcionario;
  base64: string;
  fileName: string;
}

function HoleritesTab() {
  const { funcionarios, lancamentosFuncionario, addLancamentoFuncionario, updateLancamentoFuncionario } = useFinanceiroStore();
  const [mes, setMes] = useState(currentMes());
  const [step, setStep] = useState<"list" | "confirm">("list");
  const [extracted, setExtracted] = useState<HoleriteExtracted[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cltFuncionarios = funcionarios.filter((f) => f.tipo === "CLT" && f.ativo);
  const lancamentosMes = lancamentosFuncionario.filter((l) => l.mesReferencia === mes);

  async function handleFiles(files: FileList) {
    setLoading(true);
    const results: HoleriteExtracted[] = [];
    for (const file of Array.from(files)) {
      const base64 = await fileToBase64(file);
      let entries: { nome?: string; valorLiquido?: number }[] = [{}];
      try { const text = await extractPdfText(file); entries = extractHoleriteEntries(text); } catch {}
      for (const entry of entries) {
        const func = entry.nome
          ? funcionarios.find((f) => f.nome.toLowerCase().includes(entry.nome!.toLowerCase().split(" ")[0].toLowerCase()))
          : undefined;
        results.push({ nomeEditado: entry.nome ?? "", valorEditado: entry.valorLiquido?.toFixed(2).replace(".", ",") ?? "", funcionario: func, base64, fileName: file.name });
      }
    }
    setLoading(false);
    setExtracted(results);
    setStep("confirm");
  }

  function handleConfirm() {
    for (const e of extracted) {
      if (!e.funcionario) continue;
      const valor = parseFloat(e.valorEditado.replace(",", "."));
      if (isNaN(valor)) continue;
      const existing = lancamentosMes.find((l) => l.funcionarioId === e.funcionario!.id);
      if (existing) { updateLancamentoFuncionario(existing.id, { valorLiquido: valor, holeritePdfBase64: e.base64 }); }
      else { addLancamentoFuncionario({ funcionarioId: e.funcionario.id, mesReferencia: mes, valorLiquido: valor, holeritePdfBase64: e.base64 }); }
    }
    setExtracted([]); setStep("list");
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <input type="month" value={mes} onChange={(e) => { setMes(e.target.value); setStep("list"); }}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-accentPositive/40" />
        {step === "list" && (
          <button onClick={() => fileRef.current?.click()} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 py-2 text-sm text-slate-400 transition hover:border-accentPositive/30 hover:text-accentPositive disabled:opacity-40">
            <Upload size={14} /> {loading ? "Lendo PDFs…" : "Upload Holerites"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="application/pdf" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }} />
      </div>

      {step === "confirm" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
            <p className="text-sm text-amber-300">Confira os dados extraídos antes de confirmar. Edite onde necessário.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
            {extracted.map((e, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-white/[0.04] px-5 py-3 last:border-0">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 shrink-0">Funcionário:</span>
                    <select value={e.funcionario?.id ?? ""} onChange={(ev) => {
                      const func = funcionarios.find((f) => f.id === ev.target.value);
                      setExtracted((prev) => prev.map((r, j) => j === i ? { ...r, funcionario: func } : r));
                    }} className="flex-1 rounded-lg border border-white/[0.08] bg-slate-800 px-2 py-1 text-sm text-slate-200 outline-none focus:border-accentPositive/40">
                      <option value="">— Selecione —</option>
                      {cltFuncionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500">Valor Líquido</span>
                  <input value={e.valorEditado} onChange={(ev) => setExtracted((prev) => prev.map((r, j) => j === i ? { ...r, valorEditado: ev.target.value } : r))}
                    className="w-32 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-right text-sm text-slate-200 tabular-nums outline-none focus:border-accentPositive/40" />
                </div>
                {e.funcionario ? <Check size={14} className="shrink-0 text-emerald-400" /> : <AlertTriangle size={14} className="shrink-0 text-amber-400" />}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setStep("list"); setExtracted([]); }}
              className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 hover:bg-white/[0.04]">Cancelar</button>
            <button onClick={handleConfirm} disabled={!extracted.some((e) => e.funcionario)}
              className="flex-1 rounded-xl bg-accentPositive/10 py-2.5 text-sm font-medium text-accentPositive hover:bg-accentPositive/20 disabled:opacity-40 disabled:cursor-not-allowed">
              Confirmar e Gravar
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
            {cltFuncionarios.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-600">Nenhum funcionário CLT ativo.</p>
            ) : (
              cltFuncionarios.map((f) => {
                const lanc = lancamentosMes.find((l) => l.funcionarioId === f.id);
                return (
                  <div key={f.id} className="flex items-center gap-4 border-b border-white/[0.04] px-5 py-3 last:border-0">
                    <div className="flex-1"><p className="text-sm font-medium text-slate-200">{f.nome}</p><p className="text-xs text-slate-500">{f.cargo}</p></div>
                    {lanc ? (
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-sm font-semibold text-slate-200">{lanc.valorLiquido ? toCurrencyBRL(lanc.valorLiquido) : "—"}</span>
                        {lanc.holeritePdfBase64 && <span className="text-xs text-emerald-400 flex items-center gap-1"><FileText size={12} /> Holerite</span>}
                        <Check size={14} className="text-emerald-400" />
                      </div>
                    ) : <span className="text-xs text-slate-600">Não lançado</span>}
                  </div>
                );
              })
            )}
          </div>
          {funcionarios.filter((f) => f.tipo === "PJ" && f.ativo).length > 0 && (
            <div className="mt-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Funcionários PJ</p>
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
                {funcionarios.filter((f) => f.tipo === "PJ" && f.ativo).map((f) => {
                  const lanc = lancamentosMes.find((l) => l.funcionarioId === f.id);
                  return (
                    <div key={f.id} className="flex items-center gap-4 border-b border-white/[0.04] px-5 py-3 last:border-0">
                      <div className="flex-1"><p className="text-sm font-medium text-slate-200">{f.nome}</p><p className="text-xs text-slate-500">{f.cargo}</p></div>
                      <input type="text" placeholder="0,00" defaultValue={lanc?.valorLiquido?.toFixed(2).replace(".", ",") ?? ""}
                        onBlur={(e) => {
                          const valor = parseFloat(e.target.value.replace(",", "."));
                          if (isNaN(valor)) return;
                          if (lanc) { updateLancamentoFuncionario(lanc.id, { valorLiquido: valor }); }
                          else { addLancamentoFuncionario({ funcionarioId: f.id, mesReferencia: mes, valorLiquido: valor }); }
                        }}
                        className="w-32 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-right text-sm text-slate-200 tabular-nums outline-none focus:border-accentPositive/40" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── VA/VR Tab ────────────────────────────────────────────────────────────────

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function VaVrTab() {
  const { funcionarios, lancamentosFuncionario, addLancamentoFuncionario, updateLancamentoFuncionario } = useFinanceiroStore();
  const [mes, setMes] = useState(currentMes());
  const [diasUteis, setDiasUteis] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [valorDiariaStr, setValorDiariaStr] = useState("22,00");
  const [valorAlmocoStr, setValorAlmocoStr] = useState("19,90");

  const valorDiaria = parseBRLInput(valorDiariaStr) || 22;
  const valorAlmoco = parseBRLInput(valorAlmocoStr) || 19.9;

  const cltFuncionarios = funcionarios.filter((f) => f.tipo === "CLT" && f.ativo);
  const lancamentosMes = lancamentosFuncionario.filter((l) => l.mesReferencia === mes);

  function getLanc(funcId: string): LancamentoFuncionario | undefined {
    return lancamentosMes.find((l) => l.funcionarioId === funcId);
  }

  function calcVA(dias: number, almocou: number) {
    return dias * valorDiaria - almocou * valorAlmoco;
  }

  function handleAlmocou(f: Funcionario, value: string) {
    const almocou = parseInt(value) || 0;
    const dias = parseInt(diasUteis) || 0;
    const valorVA = dias > 0 ? calcVA(dias, almocou) : undefined;
    const lanc = getLanc(f.id);
    if (lanc) { updateLancamentoFuncionario(lanc.id, { vezesAlmocou: almocou, diasUteis: dias, valorVA }); }
    else { addLancamentoFuncionario({ funcionarioId: f.id, mesReferencia: mes, vezesAlmocou: almocou, diasUteis: dias, valorVA }); }
  }

  const totalVA = cltFuncionarios.reduce((sum, f) => sum + (getLanc(f.id)?.valorVA ?? 0), 0);

  function gerarRelatorio() {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const margin = 15;
    const pageW = 210;
    const pageH = 297;
    const bottomLimit = pageH - 22; // reserva espaço pro rodapé
    const contentW = pageW - 2 * margin;
    const [ano, mesNum] = mes.split("-");
    const mesLabel = `${MESES_PT[parseInt(mesNum) - 1]}/${ano}`;
    const hoje = new Date().toLocaleDateString("pt-BR");
    const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // ── Header (repetido em toda página nova) ──
    function drawPageHeader() {
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("RELATÓRIO VA / VR", margin, 12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Período: ${mesLabel}   ·   Gerado em: ${hoje}`, pageW - margin, 12, { align: "right" });
    }

    const rowH = 9;
    const cols = [
      { label: "Funcionário",   x: margin,      w: 58, align: "left"   },
      { label: "Cargo",         x: margin + 58, w: 34, align: "left"   },
      { label: "Dias\nÚteis",   x: margin + 92, w: 17, align: "center" },
      { label: "Almoços\n(qtd)",x: margin + 109,w: 17, align: "center" },
      { label: "Desconto",      x: margin + 126,w: 24, align: "right"  },
      { label: "Total VA",      x: margin + 150,w: 30, align: "right"  },
    ] as const;

    function drawTableHeader(yStart: number): number {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, yStart - 6, contentW, rowH + 1, "F");
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, yStart - 6, pageW - margin, yStart - 6);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(71, 85, 105);
      for (const col of cols) {
        const tx = col.align === "right" ? col.x + col.w : col.align === "center" ? col.x + col.w / 2 : col.x;
        doc.text(col.label, tx, yStart - 1, { align: col.align, lineHeightFactor: 1.2 });
      }
      return yStart + rowH;
    }

    // Garante espaço para a próxima linha; se não couber, abre página nova.
    // `withTableHeader` reimprime o cabeçalho da tabela (usado nas linhas de dados).
    function ensureSpace(y: number, needed: number, withTableHeader = false): number {
      if (y + needed <= bottomLimit) return y;
      doc.addPage();
      drawPageHeader();
      let ny = 28;
      if (withTableHeader) ny = drawTableHeader(ny);
      return ny;
    }

    drawPageHeader();
    let y = drawTableHeader(28);

    // ── Data rows ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    let alt = false;
    for (const f of cltFuncionarios) {
      const beforeY = y;
      y = ensureSpace(y, rowH, true);
      if (y !== beforeY) { alt = false; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); }

      const lanc = getLanc(f.id);
      const almocou = lanc?.vezesAlmocou ?? 0;
      const dias = parseInt(diasUteis) || 0;
      const va = dias > 0 ? calcVA(dias, almocou) : undefined;
      const desconto = almocou * valorAlmoco;

      if (alt) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 5.5, contentW, rowH, "F"); }
      alt = !alt;

      doc.setTextColor(30, 41, 59);
      doc.text(f.nome.length > 27 ? f.nome.slice(0, 25) + "…" : f.nome, cols[0].x, y);
      doc.text(f.cargo.length > 17 ? f.cargo.slice(0, 15) + "…" : f.cargo, cols[1].x, y);
      doc.setTextColor(71, 85, 105);
      doc.text(dias > 0 ? String(dias) : "—", cols[2].x + cols[2].w / 2, y, { align: "center" });
      doc.text(almocou > 0 ? String(almocou) : "—", cols[3].x + cols[3].w / 2, y, { align: "center" });
      doc.setTextColor(desconto > 0 ? 185 : 71, desconto > 0 ? 28 : 85, desconto > 0 ? 28 : 105);
      doc.text(desconto > 0 ? `– ${brl(desconto)}` : "—", cols[4].x + cols[4].w, y, { align: "right" });
      doc.setTextColor(va !== undefined ? 21 : 71, va !== undefined ? 128 : 85, va !== undefined ? 61 : 105);
      doc.text(va !== undefined ? brl(va) : "—", cols[5].x + cols[5].w, y, { align: "right" });
      y += rowH;
    }

    // ── Total row ──
    y = ensureSpace(y, rowH, false);
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y - 4, pageW - margin, y - 4);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 4, contentW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("TOTAL GERAL", cols[0].x, y + 1.5);
    doc.setTextColor(21, 128, 61);
    doc.text(brl(totalVA), cols[5].x + cols[5].w, y + 1.5, { align: "right" });
    y += rowH + 4;

    // ── Detalhamento por funcionário ──
    y = ensureSpace(y, 11, false);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text("Detalhamento do Cálculo", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const f of cltFuncionarios) {
      const lanc = getLanc(f.id);
      const almocou = lanc?.vezesAlmocou ?? 0;
      const dias = parseInt(diasUteis) || 0;
      if (dias === 0) continue;
      y = ensureSpace(y, 6, false);
      const va = calcVA(dias, almocou);
      const baseValor = dias * valorDiaria;
      const descValor = almocou * valorAlmoco;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(f.nome, margin, y);
      doc.setTextColor(71, 85, 105);
      const detalhe = `${dias} × ${brl(valorDiaria)} = ${brl(baseValor)} ${almocou > 0 ? `– ${almocou} × ${brl(valorAlmoco)} = ${brl(descValor)}` : ""} → ${brl(va)}`;
      doc.text(detalhe, pageW - margin, y, { align: "right" });
      y += 6;
    }

    // ── Footer (só na última página) ──
    doc.setPage(doc.getNumberOfPages());
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Fórmula: (Dias Úteis × ${brl(valorDiaria)}) − (Almoços × ${brl(valorAlmoco)})`,
      margin, pageH - 10
    );

    doc.save(`relatorio-va-vr-${mes}.pdf`);
  }

  const inp = "rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-accentPositive/40";

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={inp} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Dias úteis:</span>
          <input type="number" value={diasUteis} min={0} max={31} onChange={(e) => setDiasUteis(e.target.value)}
            className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-center text-sm text-slate-200 outline-none focus:border-accentPositive/40" />
        </div>
        {diasUteis && (
          <p className="text-xs text-slate-500">
            Base = {diasUteis} × {toCurrencyBRL(valorDiaria)} = {toCurrencyBRL(parseInt(diasUteis) * valorDiaria)}
          </p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowConfig((v) => !v)}
            title="Configurar valores"
            className={`rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] ${showConfig ? "text-accentPositive" : "hover:text-slate-300"}`}>
            <Settings2 size={15} />
          </button>
          <button onClick={gerarRelatorio} disabled={cltFuncionarios.length === 0}
            className="flex items-center gap-1.5 rounded-xl bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-400 transition hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
            <FileDown size={14} /> Gerar Relatório PDF
          </button>
        </div>
      </div>

      {/* Configurable values panel */}
      {showConfig && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Valores</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Diária (VR):</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-slate-500">R$</span>
              <input type="text" inputMode="decimal" value={valorDiariaStr}
                onChange={(e) => setValorDiariaStr(e.target.value)}
                onBlur={(e) => {
                  const n = parseBRLInput(e.target.value);
                  if (!isNaN(n)) setValorDiariaStr(numberToBRLInput(n));
                }}
                className="w-24 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-7 pr-2 text-right text-sm text-slate-200 tabular-nums outline-none focus:border-accentPositive/40" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Almoço (VA):</span>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs text-slate-500">R$</span>
              <input type="text" inputMode="decimal" value={valorAlmocoStr}
                onChange={(e) => setValorAlmocoStr(e.target.value)}
                onBlur={(e) => {
                  const n = parseBRLInput(e.target.value);
                  if (!isNaN(n)) setValorAlmocoStr(numberToBRLInput(n));
                }}
                className="w-24 rounded-lg border border-white/[0.08] bg-white/[0.04] py-1.5 pl-7 pr-2 text-right text-sm text-slate-200 tabular-nums outline-none focus:border-accentPositive/40" />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-slate-800/40">
        <div className="border-b border-white/[0.06] px-5 py-3">
          <div className="grid grid-cols-4 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Funcionário</span><span className="text-center">Almoços</span><span className="text-center">Desconto</span><span className="text-right">Total VA</span>
          </div>
        </div>
        {cltFuncionarios.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-600">Nenhum funcionário CLT ativo.</p>
        ) : (
          cltFuncionarios.map((f) => {
            const lanc = getLanc(f.id);
            const almocou = lanc?.vezesAlmocou ?? 0;
            const dias = parseInt(diasUteis) || 0;
            const valorVA = dias > 0 ? calcVA(dias, almocou) : undefined;
            return (
              <div key={f.id} className="grid grid-cols-4 items-center border-b border-white/[0.04] px-5 py-3 last:border-0">
                <div><p className="text-sm font-medium text-slate-200">{f.nome}</p><p className="text-xs text-slate-500">{f.cargo}</p></div>
                <div className="flex justify-center">
                  <input type="number" min={0} value={almocou || ""} onChange={(e) => handleAlmocou(f, e.target.value)} placeholder="0"
                    className="w-20 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-center text-sm text-slate-200 tabular-nums outline-none focus:border-accentPositive/40" />
                </div>
                <div className="text-center">
                  {almocou > 0 ? <span className="text-sm tabular-nums text-red-400/70">− {toCurrencyBRL(almocou * valorAlmoco)}</span> : <span className="text-sm text-slate-600">—</span>}
                </div>
                <div className="text-right">
                  {valorVA !== undefined ? <span className="text-sm font-semibold tabular-nums text-slate-200">{toCurrencyBRL(valorVA)}</span> : <span className="text-sm text-slate-600">—</span>}
                </div>
              </div>
            );
          })
        )}
        {cltFuncionarios.length > 0 && (
          <div className="flex items-center justify-between border-t border-white/[0.08] px-5 py-3">
            <span className="text-xs font-semibold text-slate-500">Total VA/VR do mês</span>
            <span className="tabular-nums text-sm font-bold text-white">{toCurrencyBRL(totalVA)}</span>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-600">
        Fórmula: (dias úteis × {toCurrencyBRL(valorDiaria)}) − (almoços × {toCurrencyBRL(valorAlmoco)})
      </p>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AdministracaoPage() {
  const [tab, setTab] = useState<AdminTab>("funcionarios");
  const tabs: { id: AdminTab; label: string }[] = [
    { id: "funcionarios", label: "Funcionários" },
    { id: "holerites", label: "Holerites" },
    { id: "vavr", label: "VA / VR" },
  ];

  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-white/[0.06]">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition ${tab === t.id ? "border-b-2 border-accentPositive text-accentPositive" : "text-slate-500 hover:text-slate-300"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "funcionarios" && <FuncionariosTab />}
      {tab === "holerites" && <HoleritesTab />}
      {tab === "vavr" && <VaVrTab />}
    </div>
  );
}
