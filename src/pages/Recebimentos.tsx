import { useState } from "react";
import { Plus, Bookmark } from "lucide-react";
import { TransactionStatCards } from "../components/TransactionStatCards";
import { TransactionTable } from "../components/TransactionTable";
import { PeriodFilter } from "../components/PeriodFilter";
import { ManualTransactionModal } from "../components/ManualTransactionModal";
import { CategoryRulesModal } from "../components/CategoryRulesModal";
import { INCOME_CATEGORY_GROUPS } from "../data/constants";
import { Transaction } from "../types/finance";
import { useFinancierStore } from "../store/useFinancierStore";

interface Props {
  recebimentos: Transaction[];
  onChangeCategory: (id: string, category: string, subCategory?: string) => void;
  month: number;
  year: number;
  availablePeriods: { year: number; month: number }[];
  onChangePeriod: (month: number, year: number) => void;
}

export function RecebimentosPage({
  recebimentos,
  onChangeCategory,
  month,
  year,
  availablePeriods,
  onChangePeriod
}: Props) {
  const addTransaction = useFinancierStore((s) => s.addTransaction);
  const [showModal, setShowModal] = useState(false);
  const [showRules, setShowRules] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <PeriodFilter month={month} year={year} availablePeriods={availablePeriods} onChange={onChangePeriod} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive"
          >
            <Bookmark size={13} />
            Categorias salvas
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accentPositive/30 hover:bg-accentPositive/10 hover:text-accentPositive"
          >
            <Plus size={13} />
            Nova transação
          </button>
        </div>
      </div>
      <TransactionStatCards transactions={recebimentos} type="income" />
      <TransactionTable
        transactions={recebimentos}
        categoryGroups={INCOME_CATEGORY_GROUPS}
        categoryType="income"
        onChangeCategory={onChangeCategory}
      />
      {showModal && (
        <ManualTransactionModal
          type="income"
          onConfirm={(tx) => { addTransaction(tx); setShowModal(false); }}
          onClose={() => setShowModal(false)}
        />
      )}
      {showRules && <CategoryRulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
