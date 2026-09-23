import { BankId, Transaction } from "../types/finance";

// "rendimento" saiu da blacklist: rendimentos agora entram no ledger para o
// saldo bater com o banco (ficam fora da análise via categoria "Rendimentos")
const BASE_BLACKLIST = ["iof", "saldo do dia"];

const BANK_BLACKLIST: Partial<Record<BankId, string[]>> = {
  bb: [
    "transferência entre contas",
    "aplicação automática",
    "resgate automático",
    "saldo anterior",
    "bb rende",
    "resgate bb cdb di",
    "resgate bb cdb",
    "s a l d o",
    "rende facil",
    "rende fácil"
  ],
};

export function applyBlacklist(transactions: Transaction[], bank: BankId): Transaction[] {
  const terms = [...BASE_BLACKLIST, ...(BANK_BLACKLIST[bank] ?? [])].map((t) => t.toLowerCase());
  return transactions.filter((tx) => {
    const source = `${tx.thirdParty} ${tx.paymentMethod}`.toLowerCase();
    return !terms.some((term) => source.includes(term));
  });
}
