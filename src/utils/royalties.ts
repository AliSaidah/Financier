// Regra de cobrança das franquias: percentual sobre o apurado, com valor mínimo.
// Apurado = venda bruta − vale troca.
export const ROYALTIES_PCT = 0.06;
export const MARKETING_PCT = 0.02;
export const ROYALTIES_MIN = 1200;
export const MARKETING_MIN = 600;

export function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularCobranca(apurado: number) {
  const royaltiesPct = centavos(apurado * ROYALTIES_PCT);
  const marketingPct = centavos(apurado * MARKETING_PCT);
  return {
    royalties: Math.max(ROYALTIES_MIN, royaltiesPct),
    marketing: Math.max(MARKETING_MIN, marketingPct),
    royaltiesMinimo: royaltiesPct < ROYALTIES_MIN,
    marketingMinimo: marketingPct < MARKETING_MIN,
  };
}

export const REGRA_TEXTO = "Apurado = Venda bruta − Vale troca · Royalties 6% (mín. R$ 1.200) e Marketing 2% (mín. R$ 600) do apurado";
