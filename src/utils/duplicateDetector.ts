import { Transaction } from "../types/finance";

// Identidade composta (fallback): mesma data + valor + terceiro.
function composite(tx: Transaction): string {
  return `${tx.date}|${tx.amount}|${tx.thirdParty}`;
}

// Dedup por identidade composta (data|valor|terceiro) mantendo a MULTIPLICIDADE.
//
// Por que não usar o FITID como identidade: em alguns extratos (ex.: Itaú) o FITID
// é sintético (AAAAMMDD + sequência do dia). Ao rebaixar o mesmo extrato mais tarde,
// o mesmo lançamento ganha uma sequência diferente → FITID diferente. Dedup por FITID
// deixa passar essas reimportações e duplica.
//
// A regra: o resultado tem, para cada composite, max(qtd atual, qtd recebida). Assim:
//  - Reimportar um extrato (mesmo/atualizado) é idempotente — cada ocorrência já
//    presente "consome" uma ocorrência recebida, o resto (lançamentos novos) entra.
//  - Duplicatas LEGÍTIMAS que já vêm juntas num mesmo arquivo são preservadas: numa
//    importação nova o ledger ainda não tem aquele composite, então as 2 entram.
export function mergeWithoutDuplicates(
  current: Transaction[],
  incoming: Transaction[]
): { merged: Transaction[]; ignoredCount: number } {
  // Quantas ocorrências de cada composite já existem no ledger.
  const budget = new Map<string, number>();
  for (const tx of current) {
    const c = composite(tx);
    budget.set(c, (budget.get(c) ?? 0) + 1);
  }

  const used = new Map<string, number>();
  let ignoredCount = 0;
  const filtered: Transaction[] = [];
  for (const tx of incoming) {
    const c = composite(tx);
    const cap = budget.get(c) ?? 0;
    const u = used.get(c) ?? 0;
    if (u < cap) {
      // Já existe uma contraparte no ledger para esta ocorrência → reimportação.
      used.set(c, u + 1);
      ignoredCount += 1;
      continue;
    }
    filtered.push(tx);
  }
  return { merged: [...current, ...filtered], ignoredCount };
}

// Higienização do ledger: remove duplicatas que entraram por versões antigas
// dos parsers (mesma transação com nome de terceiro diferente e sem FITID).
// Regras:
//  1. FITID repetido → mantém a primeira ocorrência.
//  2. date|amount|thirdParty repetido → mantém a primeira.
//  3. Transação SEM fitId (não manual) com uma contraparte COM fitId no mesmo
//     dia e valor → é a cópia do parser antigo: descarta, transferindo a
//     categorização manual para a contraparte se ela estiver sem categoria.
export function cleanLedger(txs: Transaction[]): Transaction[] {
  const fitByDateAmount = new Map<string, Transaction>();
  for (const tx of txs) {
    if (tx.fitId) {
      const k = `${tx.date}|${tx.amount}`;
      if (!fitByDateAmount.has(k)) fitByDateAmount.set(k, tx);
    }
  }

  const seenFit = new Set<string>();
  const seenComp = new Set<string>();
  const out: Transaction[] = [];

  for (const tx of txs) {
    const comp = composite(tx);
    if (tx.fitId) {
      if (seenFit.has(tx.fitId)) continue;
      seenFit.add(tx.fitId);
      seenComp.add(comp);
      out.push(tx);
      continue;
    }
    if (seenComp.has(comp)) continue;
    const counterpart = !tx.manual ? fitByDateAmount.get(`${tx.date}|${tx.amount}`) : undefined;
    if (counterpart) {
      // Preserva a categorização manual feita na cópia antiga
      const hadManualCategory = tx.category && tx.category !== "Sem categoria" && !tx.autoCategorized;
      const counterpartSem   = !counterpart.category || counterpart.category === "Sem categoria";
      if (hadManualCategory && counterpartSem) {
        counterpart.category        = tx.category;
        counterpart.categoryId      = tx.categoryId;
        counterpart.subCategory     = tx.subCategory;
        counterpart.autoCategorized = false;
      }
      continue; // descarta a cópia antiga
    }
    seenComp.add(comp);
    out.push(tx);
  }
  return out;
}
