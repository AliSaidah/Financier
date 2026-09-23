import { CategoryRule, CategoryRules, Transaction } from "../types/finance";

// Chave da regra: sentido (entrada/saída) + nome do terceiro normalizado.
export function ruleKey(tx: Pick<Transaction, "amount" | "thirdParty">): string {
  return `${tx.amount < 0 ? "out" : "in"}|${tx.thirdParty.trim().toLowerCase()}`;
}

// Aprende (write-through): registra que este terceiro foi categorizado assim.
// Retorna um NOVO objeto de regras (imutável).
export function learnRule(
  rules: CategoryRules,
  tx: Pick<Transaction, "amount" | "thirdParty">,
  category: string,
  categoryId?: string,
  subCategory?: string,
): CategoryRules {
  const name = tx.thirdParty.trim();
  if (!name || !category || category === "Sem categoria") return rules;

  const key = ruleKey(tx);
  const prev = rules[key];
  const options = { ...(prev?.options ?? {}) };
  const opt = options[category];
  options[category] = {
    category,
    categoryId,
    subCategory,
    count: (opt?.count ?? 0) + 1,
    amountSum: (opt?.amountSum ?? 0) + Math.abs(tx.amount),
  };

  return {
    ...rules,
    [key]: {
      thirdParty: name,
      direction: tx.amount < 0 ? "out" : "in",
      options,
      pinned: prev?.pinned,
      updatedAt: new Date().toISOString(),
    },
  };
}

// Ordena as opções de uma regra para SUGESTÃO: mais próxima do valor da transação
// primeiro (média histórica da categoria), desempate por frequência.
export function rankOptions(rule: CategoryRule, amount: number): string[] {
  const target = Math.abs(amount);
  return Object.keys(rule.options).sort((a, b) => {
    const oa = rule.options[a], ob = rule.options[b];
    const da = Math.abs(target - oa.amountSum / oa.count);
    const db = Math.abs(target - ob.amountSum / ob.count);
    if (da !== db) return da - db;
    return ob.count - oa.count;
  });
}

// Aplica as regras a uma transação recém-importada.
//  - fixada          → aplica sozinha
//  - 1 opção         → aplica sozinha (fromMemory)
//  - várias opções   → deixa "Sem categoria" + memoryConflict ranqueado (sugestão)
//  - sem regra       → devolve a transação intacta (mantém o que o parser fez)
export function applyRule(rules: CategoryRules, tx: Transaction): Transaction {
  const rule = rules[ruleKey(tx)];
  if (!rule) return tx;

  if (rule.pinned && rule.options[rule.pinned]) {
    const o = rule.options[rule.pinned];
    return {
      ...tx,
      category: o.category,
      categoryId: o.categoryId,
      subCategory: o.subCategory,
      autoCategorized: true,
      fromMemory: true,
      memoryConflict: undefined,
    };
  }

  const names = Object.keys(rule.options);
  if (names.length === 1) {
    const o = rule.options[names[0]];
    return {
      ...tx,
      category: o.category,
      categoryId: o.categoryId,
      subCategory: o.subCategory,
      autoCategorized: true,
      fromMemory: true,
      memoryConflict: undefined,
    };
  }

  return {
    ...tx,
    category: "Sem categoria",
    categoryId: undefined,
    subCategory: undefined,
    autoCategorized: false,
    fromMemory: false,
    memoryConflict: rankOptions(rule, tx.amount),
  };
}

// Semeia regras a partir de transações já categorizadas manualmente (migração:
// usuários antigos têm categorização no ledger/histórico mas ainda sem regras).
export function buildRulesFromTransactions(txsGroups: Transaction[][]): CategoryRules {
  let rules: CategoryRules = {};
  for (const txs of txsGroups) {
    for (const tx of txs) {
      if (tx.autoCategorized) continue;               // só aprende de categorização manual
      if (!tx.thirdParty.trim()) continue;
      if (!tx.category || tx.category === "Sem categoria") continue;
      rules = learnRule(rules, tx, tx.category, tx.categoryId, tx.subCategory);
    }
  }
  return rules;
}
