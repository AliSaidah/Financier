import { Transaction } from "../types/finance";

/**
 * Categorias que ficam FORA dos totais de Receita, Despesa e Lucro.
 *
 * Por padrão só as transferências internas (movimentação entre contas do
 * próprio usuário — entrar dos dois lados inflaria receita E despesa).
 * O usuário pode personalizar a lista na aba Análise ("Fora da análise").
 */
export const DEFAULT_EXCLUDED_KEYS = [
  "transferencia-interna",
  // Variantes pelo lado da receita (sem categoryId, casam pelo nome)
  "Transferência entre contas",
  "Movimentação interna",
  "Transferência Interna",
];

/** Chave canônica da categoria de uma transação (id estável ou nome). */
export function txCategoryKey(tx: Transaction): string {
  return tx.categoryId ?? (tx.category || "Sem categoria");
}

// Sempre fora da análise, independente da escolha do usuário:
// rendimentos de aplicação contam apenas no saldo, nunca no resultado.
const ALWAYS_EXCLUDED = new Set(["Rendimentos"]);

export function isExcludedFromAnalysis(tx: Transaction, excluded: ReadonlySet<string>): boolean {
  if (!tx.categoryId && tx.category && ALWAYS_EXCLUDED.has(tx.category)) return true;
  if (tx.categoryId && excluded.has(tx.categoryId)) return true;
  // Sem categoryId (ex: receitas): casa pelo nome da categoria
  if (!tx.categoryId && tx.category && excluded.has(tx.category)) return true;
  return false;
}

const DEFAULT_SET = new Set(DEFAULT_EXCLUDED_KEYS);

/** Compat: exclusão padrão (só transferências internas). */
export function isTransfer(tx: Transaction): boolean {
  return isExcludedFromAnalysis(tx, DEFAULT_SET);
}

export interface PeriodSummary {
  /** Receitas totais excluindo categorias fora da análise */
  receitaTotal: number;
  /** Despesas totais excluindo categorias fora da análise */
  despesaTotal: number;
  /** receitaTotal − despesaTotal */
  saldo: number;
  /** Despesas marcadas como Custo Fixo */
  custosFix: number;
  /** Despesas não marcadas como Custo Fixo */
  custosVar: number;
  /** receitaTotal − custosVar */
  margemContrib: number;
  /** margemContrib − custosFix (= saldo quando todos os custos são calculados) */
  resultadoEst: number;
  /** recebimentos filtrados (sem categorias excluídas) */
  receitasLiquidas: Transaction[];
  /** pagamentos filtrados (sem categorias excluídas) */
  despesasLiquidas: Transaction[];
}

export function calculateSummary(
  recebimentos: Transaction[],
  pagamentos: Transaction[],
  fixedCategoryIds: string[] = [],
  excludedKeys?: string[]
): PeriodSummary {
  const excluded = new Set(excludedKeys ?? DEFAULT_EXCLUDED_KEYS);
  const receitasLiquidas = recebimentos.filter((tx) => !isExcludedFromAnalysis(tx, excluded));
  const despesasLiquidas = pagamentos.filter((tx) => !isExcludedFromAnalysis(tx, excluded));

  const receitaTotal = receitasLiquidas.reduce((s, tx) => s + tx.amount, 0);
  const despesaTotal = despesasLiquidas.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const saldo = receitaTotal - despesaTotal;

  // CF / CV breakdown
  const fixedSet = new Set(fixedCategoryIds);
  const pgCF = despesasLiquidas.filter(
    (tx) => tx.category && tx.category !== "Sem categoria" && fixedSet.has(tx.categoryId ?? tx.category)
  );
  const pgCV = despesasLiquidas.filter(
    (tx) => !tx.category || tx.category === "Sem categoria" || !fixedSet.has(tx.categoryId ?? tx.category)
  );

  const custosFix     = pgCF.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const custosVar     = pgCV.reduce((s, tx) => s + Math.abs(tx.amount), 0);
  const margemContrib = receitaTotal - custosVar;
  const resultadoEst  = margemContrib - custosFix;

  return {
    receitaTotal, despesaTotal, saldo,
    custosFix, custosVar, margemContrib, resultadoEst,
    receitasLiquidas, despesasLiquidas,
  };
}
