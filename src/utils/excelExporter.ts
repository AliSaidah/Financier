import { Transaction } from "../types/finance";

// Stub temporário — será reescrito com SheetJS
export async function exportTransactionsExcel(
  _allTransactions: Transaction[],
  _currentMonth: number,
  _currentYear: number,
  _fixedCategoryIds: string[] = []
) {
  alert("Export Excel será implementado em breve.");
}
