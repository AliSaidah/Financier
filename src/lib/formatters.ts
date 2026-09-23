export const toCurrencyBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);

// ─── Input de valor (R$) — formatação pt-BR com milhar e vírgula decimal ─────

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Reconstrói o display a partir dos dígitos digitados (preenche da direita: 30000 → "300,00"). */
export function digitsToBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return fmtBRL(parseInt(digits, 10) / 100);
}

/** Converte "1.234,56" (ou número já em pt-BR) em número 1234.56. */
export function parseBRLInput(display: string): number {
  if (!display) return NaN;
  return parseFloat(display.replace(/\./g, "").replace(",", "."));
}

/** Número → display formatado "1.234,56" (para inicializar edição). */
export function numberToBRLInput(n: number): string {
  return fmtBRL(n);
}

/**
 * Divide um valor total em N parcelas exatas (em centavos), distribuindo o
 * resto de 1 centavo nas primeiras parcelas para que a soma feche o total.
 * Ex: splitParcelas(100, 3) → [33.34, 33.33, 33.33]
 */
export function splitParcelas(total: number, n: number): number[] {
  if (n <= 1) return [total];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}
