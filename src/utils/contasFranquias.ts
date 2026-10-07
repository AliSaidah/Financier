import { Conta, ContasDestinoFranquias, Franquia, LancamentoFranquia } from "../types/finance";

const MESES_ABR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const ROTULO: Record<LancamentoFranquia["tipo"], { descricao: string; categoria: string }> = {
  royalties: { descricao: "Royalties", categoria: "Royalties" },
  marketing: { descricao: "Fundo de Marketing", categoria: "Fundo de Marketing" },
  avulso:    { descricao: "Cobrança avulsa", categoria: "Cobrança avulsa" },
};

export const PREFIXO_CONTA_FRANQUIA = "franq:";

function vencimentoISO(mes: string, dia: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = Math.min(dia, new Date(y, m, 0).getDate());
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Contas a receber de um usuário, derivadas dos lançamentos de Franquias.
// Não são gravadas em Contas: são recalculadas a cada exibição, então reimportar
// ou corrigir um lançamento em Franquias reflete aqui automaticamente.
export function contasReceberFranquias(
  userId: string,
  destino: ContasDestinoFranquias,
  franquias: Franquia[],
  lancamentos: LancamentoFranquia[],
): Conta[] {
  const tipos = (["royalties", "marketing", "avulso"] as const).filter((t) => destino[t] === userId);
  if (tipos.length === 0) return [];
  const porId = new Map(franquias.map((f) => [f.id, f]));

  return lancamentos
    .filter((l) => tipos.includes(l.tipo) && porId.has(l.franquiaId))
    .map((l) => {
      const f = porId.get(l.franquiaId)!;
      const [y, m] = l.mesReferencia.split("-").map(Number);
      const rot = ROTULO[l.tipo];
      const detalhe = l.tipo === "avulso" && l.descricao ? ` (${l.descricao})` : "";
      return {
        id: PREFIXO_CONTA_FRANQUIA + l.id,
        descricao: `${rot.descricao} · ${f.cidade}${detalhe} · ${MESES_ABR[m - 1]}/${y}`,
        valor: l.valor,
        vencimento: vencimentoISO(l.mesReferencia, f.vencimentoBoleto),
        tipo: "receber" as const,
        category: rot.categoria,
        status: l.recebido ? ("quitado" as const) : ("aberto" as const),
        recorrencia: "unico" as const,
        createdAt: l.createdAt,
        origem: "franquia" as const,
        lancamentoFranquiaId: l.id,
      };
    });
}
