import { useState } from "react";
import { jsPDF } from "jspdf";
import {
  BarChart2, Wallet, ArrowRightLeft, Building2, Users, Layers, FileDown, ChevronRight,
} from "lucide-react";
import { useFinanceiroStore } from "../store/useFinanceiroStore";
import { toCurrencyBRL } from "../lib/formatters";
import { AppTab } from "../types/finance";

const MESES_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function currentMes(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Card de navegação para relatórios já existentes em outras telas ──────────

function ReportLinkCard({
  icon, title, description, cta, onClick,
}: { icon: React.ReactNode; title: string; description: string; cta: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-white/[0.08] bg-bgSecondary p-5 text-left transition hover:border-accentPositive/30 hover:bg-white/[0.03]"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accentPositive/10 text-accentPositive ring-1 ring-accentPositive/20">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      <span className="flex items-center gap-1 text-xs font-medium text-accentPositive opacity-80 transition group-hover:opacity-100">
        {cta} <ChevronRight size={13} />
      </span>
    </button>
  );
}

// ─── Relatório Consolidado da Franqueadora (PDF) ──────────────────────────────

function gerarConsolidado(mes: string, franquiaRows: {
  nome: string; royalties: number; marketing: number; avulso: number; total: number;
}[], totalFranquias: number, totalFolha: number, totalVA: number) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 15, pageW = 210, pageH = 297, contentW = pageW - 2 * margin;
  const bottomLimit = pageH - 22;
  const [ano, mesNum] = mes.split("-");
  const mesLabel = `${MESES_PT[parseInt(mesNum) - 1]}/${ano}`;
  const hoje = new Date().toLocaleDateString("pt-BR");
  const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const totalPessoal = totalFolha + totalVA;
  const resultado = totalFranquias - totalPessoal;

  function drawPageHeader() {
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 18, "F");
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("RELATÓRIO CONSOLIDADO DA FRANQUEADORA", margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Período: ${mesLabel}   ·   Gerado em: ${hoje}`, pageW - margin, 12, { align: "right" });
  }

  function ensureSpace(y: number, needed: number): number {
    if (y + needed <= bottomLimit) return y;
    doc.addPage();
    drawPageHeader();
    return 28;
  }

  function sectionTitle(y: number, label: string): number {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(label, margin, y);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, y + 2.5, pageW - margin, y + 2.5);
    return y + 10;
  }

  function kpiRow(y: number, items: { label: string; value: string; color: [number, number, number] }[]): number {
    const w = contentW / items.length;
    for (let i = 0; i < items.length; i++) {
      const x = margin + i * w;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, w - 4, 22, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(items[i].label.toUpperCase(), x + 4, y + 7);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...items[i].color);
      doc.text(items[i].value, x + 4, y + 16);
    }
    return y + 28;
  }

  drawPageHeader();
  let y = 28;

  // ── Resumo executivo ──
  y = sectionTitle(y, "Resumo Executivo");
  y = kpiRow(y, [
    { label: "Recebido das Franquias", value: brl(totalFranquias), color: [15, 23, 42] },
    { label: "Custo com Pessoal", value: brl(totalPessoal), color: [239, 68, 68] },
    { label: resultado >= 0 ? "Resultado — Superávit" : "Resultado — Déficit", value: brl(Math.abs(resultado)), color: resultado >= 0 ? [16, 185, 129] : [239, 68, 68] },
  ]);
  y += 4;

  // ── Franquias ──
  y = ensureSpace(y, 20);
  y = sectionTitle(y, "Franquias — Royalties & Marketing");
  if (franquiaRows.length === 0) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text("Nenhum lançamento de franquia neste período.", margin, y);
    y += 8;
  } else {
    const cols = [
      { label: "Franquia",   x: margin,       w: 66, align: "left"  },
      { label: "Royalties",  x: margin + 66,  w: 32, align: "right" },
      { label: "Marketing",  x: margin + 98,  w: 32, align: "right" },
      { label: "Avulso",     x: margin + 130, w: 26, align: "right" },
      { label: "Total",      x: margin + 156, w: 24, align: "right" },
    ] as const;
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 5, contentW, 8, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(71, 85, 105);
    for (const c of cols) doc.text(c.label, c.align === "right" ? c.x + c.w : c.x, y, { align: c.align });
    y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    let alt = false;
    for (const r of franquiaRows) {
      y = ensureSpace(y, 8);
      if (alt) { doc.setFillColor(248, 250, 252); doc.rect(margin, y - 5, contentW, 8, "F"); }
      alt = !alt;
      doc.setTextColor(30, 41, 59);
      doc.text(r.nome, cols[0].x, y);
      doc.setTextColor(71, 85, 105);
      doc.text(brl(r.royalties), cols[1].x + cols[1].w, y, { align: "right" });
      doc.text(brl(r.marketing), cols[2].x + cols[2].w, y, { align: "right" });
      doc.text(r.avulso > 0 ? brl(r.avulso) : "—", cols[3].x + cols[3].w, y, { align: "right" });
      doc.setFont("helvetica", "bold"); doc.setTextColor(21, 128, 61);
      doc.text(brl(r.total), cols[4].x + cols[4].w, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 8;
    }
    y = ensureSpace(y, 9);
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y - 4, pageW - margin, y - 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30, 41, 59);
    doc.text("TOTAL FRANQUIAS", cols[0].x, y + 1);
    doc.setTextColor(21, 128, 61);
    doc.text(brl(totalFranquias), cols[4].x + cols[4].w, y + 1, { align: "right" });
    y += 14;
  }

  // ── Pessoal ──
  y = ensureSpace(y, 40);
  y = sectionTitle(y, "Pessoal — Folha & VA/VR");
  y = kpiRow(y, [
    { label: "Total Folha (Líquido)", value: brl(totalFolha), color: [15, 23, 42] },
    { label: "Total VA/VR", value: brl(totalVA), color: [15, 23, 42] },
    { label: "Total Pessoal", value: brl(totalPessoal), color: [239, 68, 68] },
  ]);

  // ── Footer ──
  doc.setPage(doc.getNumberOfPages());
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Resultado = Recebido das Franquias − (Folha + VA/VR)", margin, pageH - 10);

  doc.save(`relatorio-consolidado-${mes}.pdf`);
}

// ─── Página principal ──────────────────────────────────────────────────────────

export function CentralRelatoriosPage({ onNavigate }: { onNavigate: (tab: AppTab) => void }) {
  const { franquias, lancamentosFranquia, lancamentosFuncionario } = useFinanceiroStore();
  const [mes, setMes] = useState(currentMes());

  const lancsMes = lancamentosFranquia.filter((l) => l.mesReferencia === mes);
  const franquiaRows = franquias
    .filter((f) => lancsMes.some((l) => l.franquiaId === f.id))
    .map((f) => {
      const rows = lancsMes.filter((l) => l.franquiaId === f.id);
      const royalties = rows.filter((r) => r.tipo === "royalties").reduce((s, r) => s + r.valor, 0);
      const marketing = rows.filter((r) => r.tipo === "marketing").reduce((s, r) => s + r.valor, 0);
      const avulso = rows.filter((r) => r.tipo === "avulso").reduce((s, r) => s + r.valor, 0);
      return { nome: f.cidade, royalties, marketing, avulso, total: royalties + marketing + avulso };
    });
  const totalFranquias = franquiaRows.reduce((s, r) => s + r.total, 0);

  const funcMes = lancamentosFuncionario.filter((l) => l.mesReferencia === mes);
  const totalFolha = funcMes.reduce((s, l) => s + (l.valorLiquido ?? 0), 0);
  const totalVA = funcMes.reduce((s, l) => s + (l.valorVA ?? 0), 0);
  const totalPessoal = totalFolha + totalVA;
  const resultado = totalFranquias - totalPessoal;

  const [ano, mesNum] = mes.split("-");
  const mesLabel = `${MESES_PT[parseInt(mesNum) - 1] ?? ""} ${ano}`;

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accentPositive/10 text-accentPositive ring-1 ring-accentPositive/20">
          <Layers size={17} />
        </div>
        <div>
          <h2 className="text-base font-bold tracking-tight text-white">Central de Relatórios</h2>
          <p className="text-xs text-slate-500">Todos os relatórios do Financier, em um só lugar</p>
        </div>
      </div>

      {/* Acesso rápido aos relatórios existentes */}
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Relatórios por tela</p>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReportLinkCard
          icon={<BarChart2 size={17} />}
          title="Relatório Gerencial Mensal"
          description="DRE do mês, indicadores e despesas/receitas por categoria, em PDF."
          cta="Abrir Análise"
          onClick={() => onNavigate("resumo")}
        />
        <ReportLinkCard
          icon={<Layers size={17} />}
          title="Evolução do Resultado"
          description="Comparativo de lucro × prejuízo entre meses ou trimestres, em PDF."
          cta="Abrir Painel Gerencial"
          onClick={() => onNavigate("painel")}
        />
        <ReportLinkCard
          icon={<Wallet size={17} />}
          title="Contas a Pagar/Receber"
          description="Situação de contas por perfil e relatório consolidado entre lojas."
          cta="Abrir Contas"
          onClick={() => onNavigate("contas")}
        />
        <ReportLinkCard
          icon={<ArrowRightLeft size={17} />}
          title="Movimentação Diária"
          description="Entradas e saídas dia a dia num intervalo — disponível no rodapé da tela."
          cta="Abrir Recebimentos"
          onClick={() => onNavigate("recebimentos")}
        />
        <ReportLinkCard
          icon={<Building2 size={17} />}
          title="Franquias — Royalties & Marketing"
          description="Lançamentos por franquia, notas fiscais e boletos do mês."
          cta="Abrir Gestão Franquias"
          onClick={() => onNavigate("financeiro")}
        />
        <ReportLinkCard
          icon={<Users size={17} />}
          title="Funcionários — VA/VR & Holerites"
          description="Cálculo de VA/VR configurável e relatório em PDF por funcionário."
          cta="Abrir Administração"
          onClick={() => onNavigate("financeiro")}
        />
      </div>

      {/* Relatório Consolidado da Franqueadora */}
      <div className="overflow-hidden rounded-2xl border border-accentPositive/20 bg-gradient-to-b from-accentPositive/[0.06] to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
          <div>
            <p className="text-sm font-bold text-white">Relatório Consolidado da Franqueadora</p>
            <p className="text-xs text-slate-500">Franquias + Pessoal num único PDF para a diretoria · {mesLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-slate-200 outline-none focus:border-accentPositive/40" />
            <button
              onClick={() => gerarConsolidado(mes, franquiaRows, totalFranquias, totalFolha, totalVA)}
              className="flex items-center gap-1.5 rounded-xl bg-accentPositive/10 px-4 py-2 text-sm font-medium text-accentPositive transition hover:bg-accentPositive/20"
            >
              <FileDown size={14} /> Gerar Relatório PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-3">
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Recebido das Franquias</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-white">{toCurrencyBRL(totalFranquias)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Custo com Pessoal</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-red-400">{toCurrencyBRL(totalPessoal)}</p>
            <p className="mt-0.5 text-[10px] text-slate-600">Folha {toCurrencyBRL(totalFolha)} + VA/VR {toCurrencyBRL(totalVA)}</p>
          </div>
          <div className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {resultado >= 0 ? "Resultado — Superávit" : "Resultado — Déficit"}
            </p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${resultado >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {toCurrencyBRL(Math.abs(resultado))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
