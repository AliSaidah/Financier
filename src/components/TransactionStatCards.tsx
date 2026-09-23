import { AlertTriangle, ArrowDownLeft, ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import { Transaction } from "../types/finance";
import { toCurrencyBRL } from "../lib/formatters";

interface Props {
  transactions: Transaction[];
  type: "income" | "expense";
}

export function TransactionStatCards({ transactions, type }: Props) {
  const isIncome = type === "income";

  const total = transactions.reduce(
    (s, tx) => s + (isIncome ? tx.amount : Math.abs(tx.amount)),
    0
  );

  const count = transactions.length;

  const maxTx = transactions.reduce<Transaction | null>(
    (best, tx) => {
      if (!best) return tx;
      return Math.abs(tx.amount) > Math.abs(best.amount) ? tx : best;
    },
    null
  );

  const uncategorized = transactions.filter(
    (tx) => !tx.category || tx.category === "Sem categoria"
  ).length;

  return (
    <div className="mb-5 grid grid-cols-4 gap-3">
      {/* Total */}
      <StatCard
        label={isIncome ? "Entradas" : "Total Pago"}
        value={toCurrencyBRL(total)}
        valueColor={isIncome ? "text-accentPositive" : "text-accentNegative"}
        icon={isIncome ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
        iconColor={isIncome ? "text-accentPositive/50" : "text-accentNegative/50"}
      />

      {/* Lançamentos */}
      <StatCard
        label="Lançamentos"
        value={String(count)}
        subValue={count === 1 ? "transação" : "transações"}
        valueColor="text-white"
        icon={isIncome ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        iconColor="text-slate-500"
      />

      {/* Maior transação */}
      <StatCard
        label={isIncome ? "Maior Recebimento" : "Maior Gasto"}
        value={maxTx ? toCurrencyBRL(Math.abs(maxTx.amount)) : "—"}
        subValue={maxTx?.thirdParty}
        valueColor={isIncome ? "text-accentPositive" : "text-accentNegative"}
        icon={isIncome ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        iconColor={isIncome ? "text-accentPositive/40" : "text-accentNegative/40"}
      />

      {/* Sem categoria */}
      <StatCard
        label="Sem Categoria"
        value={uncategorized === 0 ? "Tudo ok" : String(uncategorized)}
        subValue={uncategorized === 0 ? "Tudo categorizado" : uncategorized === 1 ? "transação pendente" : "transações pendentes"}
        valueColor={uncategorized === 0 ? "text-accentPositive" : "text-amber-400"}
        icon={<AlertTriangle size={16} />}
        iconColor={uncategorized === 0 ? "text-accentPositive/40" : "text-amber-400/50"}
        highlight={uncategorized > 0}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  subValue,
  valueColor,
  icon,
  iconColor,
  highlight = false,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueColor: string;
  icon: React.ReactNode;
  iconColor: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-bgSecondary p-4 ring-1 ${
        highlight
          ? "ring-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.06)]"
          : "ring-white/[0.07]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className={`mt-2 text-xl font-bold tabular-nums tracking-tight ${valueColor}`}>{value}</p>
      {subValue && (
        <p className="mt-0.5 truncate text-xs text-slate-600">{subValue}</p>
      )}
    </div>
  );
}
