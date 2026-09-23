import { EXPENSE_CATEGORIES } from "./constants";

// ─── Normalizador (igual ao do autoCategorizationRules) ───────────────────────

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, "")
    .trim();
}

// ─── Lookup construído uma vez no módulo ──────────────────────────────────────
// Aceita: nome canônico (com ou sem acento), ID, qualquer alias normalizado

const lookup = new Map<string, { id: string; name: string }>();

for (const cat of EXPENSE_CATEGORIES) {
  const entry = { id: cat.id, name: cat.name };
  lookup.set(normalizeText(cat.name), entry); // "alimentação" → entry
  lookup.set(cat.id, entry);                  // "alimentacao"  → entry (ID já sem acento)
  if (cat.aliases) {
    for (const alias of cat.aliases) {
      lookup.set(normalizeText(alias), entry);
    }
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Resolve qualquer texto de categoria de despesa (nome canônico, ID ou alias)
 * para { id, name } canônico. Retorna null se não encontrar.
 */
export function resolveExpenseCategory(text: string): { id: string; name: string } | null {
  if (!text) return null;
  return lookup.get(normalizeText(text)) ?? null;
}

/**
 * Dado o nome de um grupo canônico (ex: "Alimentação"), retorna o ID estável.
 * Aceita nomes com ou sem acento.
 */
export function getExpenseCategoryId(groupName: string): string | undefined {
  return lookup.get(normalizeText(groupName))?.id;
}
