import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { toCurrencyBRL } from "../lib/formatters";

interface Props {
  totalRecebido: number;
  totalGasto: number;
  hideSaldo?: boolean;
}

export function SummaryCards({ totalRecebido, totalGasto, hideSaldo = false }: Props) {
  const saldo = totalRecebido - totalGasto;
  return (
    <div className={`mb-5 grid gap-3 ${hideSaldo ? "grid-cols-2" : "grid-cols-3"}`}>
      <Card
        label="Entradas"
        value={toCurrencyBRL(totalRecebido)}
        accent="text-accentPositive"
        icon={<ArrowUpRight size={hideSaldo ? 22 : 18} />}
        glow="shadow-[0_0_24px_rgba(16,185,129,0.07)]"
        large={hideSaldo}
      />
      <Card
        label="Saídas"
        value={toCurrencyBRL(totalGasto)}
        accent="text-accentNegative"
        icon={<ArrowDownLeft size={hideSaldo ? 22 : 18} />}
        glow="shadow-[0_0_24px_rgba(255,107,107,0.07)]"
        large={hideSaldo}
      />
      {!hideSaldo && (
        <Card
          label="Saldo Final"
          value={toCurrencyBRL(saldo)}
          accent={saldo >= 0 ? "text-accentPositive" : "text-accentNegative"}
          icon={<Wallet size={18} />}
          glow={saldo >= 0 ? "shadow-[0_0_24px_rgba(16,185,129,0.07)]" : "shadow-[0_0_24px_rgba(255,107,107,0.07)]"}
        />
      )}
    </div>
  );
}

function Card({
  label, value, accent, icon, glow, large = false,
}: {
  label: string; value: string; accent: string; icon: React.ReactNode; glow: string; large?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-bgSecondary ring-1 ring-white/[0.07] ${glow} ${large ? "p-6" : "p-4"}`}>
      <div className="flex items-center justify-between">
        <p className={`font-medium uppercase tracking-wider text-slate-500 ${large ? "text-sm" : "text-xs"}`}>{label}</p>
        <span className={`${accent} opacity-60`}>{icon}</span>
      </div>
      <p className={`font-bold tracking-tight ${accent} ${large ? "mt-4 text-4xl" : "mt-3 text-2xl"}`}>{value}</p>
    </div>
  );
}
