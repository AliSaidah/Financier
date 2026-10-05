import { useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { Check, FileSpreadsheet, Printer, X } from "lucide-react";
import { useFinanceiroStore } from "../../store/useFinanceiroStore";
import { toCurrencyBRL } from "../../lib/formatters";
import { formatCnpj } from "../../utils/pdfExtractor";
import { MARKETING_MIN, MARKETING_PCT, REGRA_TEXTO, ROYALTIES_MIN, ROYALTIES_PCT } from "../../utils/royalties";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Linha {
  cidade: string;
  razaoSocial: string;
  cnpj: string;
  base: number;
  troca: number;
  apurado: number;
  royalties: number;
  marketing: number;
  avulso: number;
  total: number;
  vencimento: string;
  notas: string;
  boleto: boolean;
  royMin: boolean;      // cobrado o mínimo porque 6% ficou abaixo
  mktMin: boolean;      // cobrado o mínimo porque 2% ficou abaixo
  abaixoMinimo: boolean; // gravado abaixo do mínimo (importado antes da regra)
}

const VALORES = ["base", "troca", "apurado", "royalties", "marketing", "avulso", "total"] as const;

// Lançamentos importados antes da v0.5.4 guardavam frações de centavo; arredonda
// por linha para que o total seja exatamente a soma do que aparece em cada linha.
const c2 = (n: number) => Math.round(n * 100) / 100;

function vencimentoDe(mes: string, dia: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = Math.min(dia, new Date(y, m, 0).getDate());
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function PlanilhaFranquiasModal({ mes, onClose }: { mes: string; onClose: () => void }) {
  const { franquias, lancamentosFranquia } = useFinanceiroStore();
  const [exportado, setExportado] = useState<string | null>(null);

  const [ano, mesNum] = mes.split("-");
  const mesLabel = `${MESES[parseInt(mesNum) - 1]}/${ano}`;
  const lancs = lancamentosFranquia.filter((l) => l.mesReferencia === mes);

  const linhas: Linha[] = franquias
    .filter((f) => lancs.some((l) => l.franquiaId === f.id))
    .map((f) => {
      const doF = lancs.filter((l) => l.franquiaId === f.id);
      const roy = doF.filter((l) => l.tipo === "royalties");
      const mkt = doF.filter((l) => l.tipo === "marketing");
      const soma = (arr: typeof doF, k: "valor" | "baseCalculo" | "valorTroca" | "valorApurado") => arr.reduce((s, l) => s + l[k], 0);
      // Base/troca/apurado vêm dos lançamentos de royalties (os de marketing repetem os mesmos valores)
      const royalties = c2(soma(roy, "valor"));
      const marketing = c2(soma(mkt, "valor"));
      const avulso = c2(soma(doF.filter((l) => l.tipo === "avulso"), "valor"));
      const notas = [...roy, ...mkt].map((l) => l.numeroNota).filter(Boolean).join(" / ");
      const apurado = c2(soma(roy, "valorApurado"));
      return {
        cidade: f.cidade,
        razaoSocial: f.razaoSocial ?? "",
        cnpj: f.cnpj,
        base: c2(soma(roy, "baseCalculo")),
        troca: c2(soma(roy, "valorTroca")),
        apurado,
        royMin: roy.length > 0 && c2(apurado * ROYALTIES_PCT) < ROYALTIES_MIN && royalties >= ROYALTIES_MIN,
        mktMin: mkt.length > 0 && c2(apurado * MARKETING_PCT) < MARKETING_MIN && marketing >= MARKETING_MIN,
        abaixoMinimo: (roy.length > 0 && royalties < ROYALTIES_MIN) || (mkt.length > 0 && marketing < MARKETING_MIN),
        royalties, marketing, avulso,
        total: c2(royalties + marketing + avulso),
        vencimento: vencimentoDe(mes, f.vencimentoBoleto),
        notas,
        boleto: [...roy, ...mkt].some((l) => !!l.boletoPdfBase64),
      };
    })
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));

  const totais = Object.fromEntries(VALORES.map((k) => [k, c2(linhas.reduce((s, l) => s + l[k], 0))])) as Record<typeof VALORES[number], number>;
  const semLancamento = franquias.length - linhas.length;
  const abaixo = linhas.filter((l) => l.abaixoMinimo);
  const temMinimo = linhas.some((l) => l.royMin || l.mktMin);
  const minTxt = (l: Linha) => [l.royMin && "Royalties", l.mktMin && "Marketing"].filter(Boolean).join(" e ");
  const geradoEm = new Date().toLocaleDateString("pt-BR");

  function exportarExcel() {
    const header = ["Franquia", "Razão social", "CNPJ", "Venda bruta", "Vale troca", "Apurado", "Royalties 6%", "Marketing 2%", "Avulsos", "Total a cobrar", "Vencimento", "Nº NF", "Boleto", "Mínimo aplicado"];
    const aoa: (string | number)[][] = [
      [`Royalties e Marketing — ${mesLabel}`],
      [`Gerado em ${geradoEm} · ${REGRA_TEXTO}`],
      header,
      ...linhas.map((l) => [l.cidade, l.razaoSocial, formatCnpj(l.cnpj), l.base, l.troca, l.apurado, l.royalties, l.marketing, l.avulso, l.total, l.vencimento, l.notas, l.boleto ? "Sim" : "Não", minTxt(l)]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Linha de total com fórmulas SOMA (o Excel recalcula se alguém editar um valor)
    const primeira = 4;
    const ultima = 3 + linhas.length;
    const linhaTotal = ultima + 1;
    const colsValor = ["D", "E", "F", "G", "H", "I", "J"];
    ws[`A${linhaTotal}`] = { t: "s", v: "TOTAL" };
    colsValor.forEach((c, i) => {
      ws[`${c}${linhaTotal}`] = { t: "n", f: `SUM(${c}${primeira}:${c}${ultima})`, v: totais[VALORES[i]] };
    });
    for (let r = primeira; r <= linhaTotal; r++) {
      for (const c of colsValor) if (ws[`${c}${r}`]) ws[`${c}${r}`].z = "#,##0.00";
    }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: linhaTotal - 1, c: header.length - 1 } });
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } }];
    ws["!cols"] = [18, 40, 20, 14, 12, 14, 14, 14, 12, 15, 12, 14, 8, 20].map((wch) => ({ wch }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Franquias");
    const nome = `royalties-marketing-${mes}.xlsx`;
    XLSX.writeFile(wb, nome);
    setExportado(nome);
  }

  const th = "whitespace-nowrap px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500";
  const tdNum = "whitespace-nowrap px-2 py-2 text-right text-[13px] tabular-nums";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm">
        <div className="flex h-full max-h-[90vh] w-full max-w-7xl flex-col rounded-2xl border border-white/[0.08] bg-slate-900 shadow-2xl">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/[0.06] px-6 py-4">
            <div className="mr-auto">
              <h2 className="font-semibold text-slate-100">Planilha de Royalties e Marketing — {mesLabel}</h2>
              <p className="text-xs text-slate-500">
                {linhas.length} franquia{linhas.length !== 1 ? "s" : ""} com lançamento
                {semLancamento > 0 ? ` · ${semLancamento} sem lançamento neste mês` : ""}
              </p>
            </div>
            {exportado && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check size={12} /> {exportado} salvo em Downloads
              </span>
            )}
            <button onClick={exportarExcel} disabled={linhas.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              <FileSpreadsheet size={14} /> Exportar Excel
            </button>
            <button onClick={() => window.print()} disabled={linhas.length === 0}
              className="flex items-center gap-1.5 rounded-xl bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-400 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40">
              <Printer size={14} /> Imprimir
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"><X size={16} /></button>
          </div>

          {abaixo.length > 0 && (
            <div className="mx-6 mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 text-sm text-amber-300">
              {abaixo.length} franquia{abaixo.length > 1 ? "s estão" : " está"} com valor abaixo do mínimo
              (royalties {toCurrencyBRL(ROYALTIES_MIN)} · marketing {toCurrencyBRL(MARKETING_MIN)}) — foram importadas antes da regra do mínimo:{" "}
              <b>{abaixo.map((l) => l.cidade).join(", ")}</b>. Importe o relatório de vendas de {mesLabel} de novo para atualizar os valores.
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {linhas.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-600">Nenhum lançamento de franquia em {mesLabel}. Importe o relatório de vendas primeiro.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="text-left">
                    <th className={th}>Franquia</th>
                    <th className={th + " text-right"}>Venda bruta</th>
                    <th className={th + " text-right"}>Vale troca</th>
                    <th className={th + " text-right"}>Apurado</th>
                    <th className={th + " text-right"}>Royalties 6%</th>
                    <th className={th + " text-right"}>Marketing 2%</th>
                    <th className={th + " text-right"}>Avulsos</th>
                    <th className={th + " text-right"}>Total a cobrar</th>
                    <th className={th}>Vencimento</th>
                    <th className={th}>Nº NF</th>
                    <th className={th + " text-center"}>Boleto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {linhas.map((l) => (
                    <tr key={l.cnpj + l.cidade} className="hover:bg-white/[0.02]">
                      <td className="px-2 py-2">
                        <p className="font-medium text-slate-200">{l.cidade}</p>
                        {l.razaoSocial && <p className="max-w-[200px] truncate text-[11px] text-slate-500" title={l.razaoSocial}>{l.razaoSocial}</p>}
                      </td>
                      <td className={tdNum + " text-slate-300"}>{toCurrencyBRL(l.base)}</td>
                      <td className={tdNum + " text-slate-400"}>{toCurrencyBRL(l.troca)}</td>
                      <td className={tdNum + " text-slate-300"}>{toCurrencyBRL(l.apurado)}</td>
                      <td className={tdNum + " font-semibold " + (l.abaixoMinimo && l.royalties < ROYALTIES_MIN ? "text-amber-400" : "text-emerald-400")}>
                        {toCurrencyBRL(l.royalties)}{l.royMin && <span className="ml-1 text-[9px] font-semibold uppercase text-amber-400">mín.</span>}
                      </td>
                      <td className={tdNum + " font-semibold " + (l.abaixoMinimo && l.marketing < MARKETING_MIN ? "text-amber-400" : "text-sky-400")}>
                        {toCurrencyBRL(l.marketing)}{l.mktMin && <span className="ml-1 text-[9px] font-semibold uppercase text-amber-400">mín.</span>}
                      </td>
                      <td className={tdNum + " text-purple-400"}>{l.avulso ? toCurrencyBRL(l.avulso) : "—"}</td>
                      <td className={tdNum + " font-bold text-white"}>{toCurrencyBRL(l.total)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-[13px] tabular-nums text-slate-400">{l.vencimento}</td>
                      <td className="px-2 py-2 text-[13px] text-slate-400">{l.notas || "—"}</td>
                      <td className="px-2 py-2 text-center">{l.boleto ? <Check size={13} className="inline text-emerald-400" /> : <span className="text-slate-600">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 border-t border-white/[0.1] bg-slate-800">
                  <tr className="font-bold">
                    <td className="px-2 py-2.5 text-xs uppercase tracking-wider text-slate-300">Total</td>
                    <td className={tdNum + " text-slate-200"}>{toCurrencyBRL(totais.base)}</td>
                    <td className={tdNum + " text-slate-300"}>{toCurrencyBRL(totais.troca)}</td>
                    <td className={tdNum + " text-slate-200"}>{toCurrencyBRL(totais.apurado)}</td>
                    <td className={tdNum + " text-emerald-400"}>{toCurrencyBRL(totais.royalties)}</td>
                    <td className={tdNum + " text-sky-400"}>{toCurrencyBRL(totais.marketing)}</td>
                    <td className={tdNum + " text-purple-400"}>{totais.avulso ? toCurrencyBRL(totais.avulso) : "—"}</td>
                    <td className={tdNum + " text-white"}>{toCurrencyBRL(totais.total)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Versão de impressão: invisível na tela, só aparece no window.print() */}
      {linhas.length > 0 && createPortal(
        <div id="franquias-print" className="print-only">
          <div className="fp-head">
            <div>
              <div className="fp-title">Royalties e Marketing — {mesLabel}</div>
              <div className="fp-sub">{REGRA_TEXTO}</div>
            </div>
            <div className="fp-sub">Gerado em {geradoEm} · {linhas.length} franquias</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Franquia</th><th>Razão social</th>
                <th className="n">Venda bruta</th><th className="n">Vale troca</th><th className="n">Apurado</th>
                <th className="n">Royalties 6%</th><th className="n">Marketing 2%</th><th className="n">Avulsos</th>
                <th className="n">Total a cobrar</th><th>Venc.</th><th>Nº NF</th><th>Boleto</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.cnpj + l.cidade}>
                  <td className="b">{l.cidade}</td><td>{l.razaoSocial}</td>
                  <td className="n">{toCurrencyBRL(l.base)}</td><td className="n">{toCurrencyBRL(l.troca)}</td><td className="n">{toCurrencyBRL(l.apurado)}</td>
                  <td className="n">{toCurrencyBRL(l.royalties)}{l.royMin ? " *" : ""}</td><td className="n">{toCurrencyBRL(l.marketing)}{l.mktMin ? " *" : ""}</td>
                  <td className="n">{l.avulso ? toCurrencyBRL(l.avulso) : "—"}</td>
                  <td className="n b">{toCurrencyBRL(l.total)}</td><td>{l.vencimento}</td><td>{l.notas || "—"}</td><td>{l.boleto ? "Sim" : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="b" colSpan={2}>TOTAL</td>
                <td className="n">{toCurrencyBRL(totais.base)}</td><td className="n">{toCurrencyBRL(totais.troca)}</td><td className="n">{toCurrencyBRL(totais.apurado)}</td>
                <td className="n">{toCurrencyBRL(totais.royalties)}</td><td className="n">{toCurrencyBRL(totais.marketing)}</td>
                <td className="n">{totais.avulso ? toCurrencyBRL(totais.avulso) : "—"}</td>
                <td className="n">{toCurrencyBRL(totais.total)}</td><td colSpan={3} />
              </tr>
            </tfoot>
          </table>
          {temMinimo && <div className="fp-sub" style={{ marginTop: "2mm" }}>* Valor mínimo aplicado (royalties R$ 1.200,00 · marketing R$ 600,00).</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
