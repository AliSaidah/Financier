import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AppTab, BankBalance, BankId, CategoryRules, Conta, HistoryEntry, Transaction } from "../types/finance";
import { resolveExpenseCategory } from "../data/categoryResolver";
import { cleanLedger } from "../utils/duplicateDetector";
import { DEFAULT_EXCLUDED_KEYS } from "../utils/summaryCalculator";
import { learnRule, buildRulesFromTransactions } from "../utils/categoryRules";

// ─── User profile ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  createdAt: string;
}

const DEFAULT_USER_ID = "default";
const DEFAULT_USER: UserProfile = {
  id: DEFAULT_USER_ID,
  name: "Principal",
  createdAt: new Date().toISOString(),
};

// Data persisted per user (saved to localStorage on user switch)
interface UserData {
  transactions: Transaction[];
  history: HistoryEntry[];
  selectedBank: BankId | null;
  fixedCategoryIds: string[];
  cfCvConfigured: boolean;
  customCategoriesIncome: string[];
  customCategoriesExpense: string[];
  customSubItemsExpense: Record<string, string[]>;
  customSubItemsIncome:  Record<string, string[]>;
  monthFilter: number;
  yearFilter: number;
  activeHistoryEntryId: string | null;
  contas: Conta[];
  bankBalance: BankBalance | null;
  excludedCategoryIds: string[];
  categoryRules: CategoryRules;
  saldoInicial: number;
}

function saveUserData(userId: string, state: UserData) {
  try { localStorage.setItem(`financier-data-${userId}`, JSON.stringify(state)); } catch {}
}

function loadUserData(userId: string): Partial<UserData> {
  try {
    const raw = localStorage.getItem(`financier-data-${userId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ─── Migration ────────────────────────────────────────────────────────────────

function migrateTransaction(tx: Transaction): Transaction {
  if (tx.categoryId) return tx;
  const resolved = resolveExpenseCategory(tx.category);
  if (!resolved) return tx;
  return { ...tx, category: resolved.name, categoryId: resolved.id };
}

function migrateUserData(data: Partial<UserData>): Partial<UserData> {
  const now = new Date();
  return {
    ...data,
    transactions: (data.transactions ?? []).map(migrateTransaction),
    history: (data.history ?? []).map((e) => ({
      ...e,
      transactions: e.transactions.map(migrateTransaction),
    })),
    monthFilter: data.monthFilter ?? now.getMonth(),
    yearFilter: data.yearFilter ?? now.getFullYear(),
    contas: (data.contas ?? []).map((c) => ({
      ...c,
      // migra formato antigo "mensal" → "mensal-fixo"
      recorrencia: (c.recorrencia as string) === "mensal" ? "mensal-fixo" : c.recorrencia,
    })),
  };
}

function applyUserData(data: Partial<UserData>) {
  const now = new Date();
  const migrated = migrateUserData(data);
  const history = migrated.history ?? [];
  const ledger = cleanLedger(migrated.transactions ?? []);
  // Regras de categoria: se o perfil ainda não tem (usuário antigo), semeia a
  // partir da categorização manual já existente no ledger + histórico.
  const categoryRules = migrated.categoryRules
    ?? buildRulesFromTransactions([ledger, ...history.map((e) => e.transactions)]);
  return {
    // Higieniza o ledger (remove cópias antigas duplicadas de parsers anteriores)
    transactions: ledger,
    history,
    categoryRules,
    saldoInicial: migrated.saldoInicial ?? 0,
    selectedBank: migrated.selectedBank ?? null,
    fixedCategoryIds: migrated.fixedCategoryIds ?? [],
    cfCvConfigured: migrated.cfCvConfigured ?? false,
    customCategoriesIncome: migrated.customCategoriesIncome ?? [],
    customCategoriesExpense: migrated.customCategoriesExpense ?? [],
    customSubItemsExpense: migrated.customSubItemsExpense ?? {},
    customSubItemsIncome:  migrated.customSubItemsIncome  ?? {},
    monthFilter: migrated.monthFilter ?? now.getMonth(),
    yearFilter: migrated.yearFilter ?? now.getFullYear(),
    activeHistoryEntryId: migrated.activeHistoryEntryId ?? null,
    contas: migrated.contas ?? [],
    bankBalance: migrated.bankBalance ?? null,
    excludedCategoryIds: migrated.excludedCategoryIds ?? [...DEFAULT_EXCLUDED_KEYS],
  };
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface FinancierState {
  // Users
  users: UserProfile[];
  activeUserId: string;
  addUser: (name: string) => void;
  removeUser: (id: string) => void;
  renameUser: (id: string, name: string) => void;
  switchUser: (id: string) => void;
  getAllUsersData: () => {
    id: string; name: string; transactions: Transaction[];
    fixedCategoryIds: string[]; excludedCategoryIds: string[]; bankBalance: BankBalance | null;
  }[];
  getAllUsersContas: () => { id: string; name: string; contas: Conta[] }[];

  // App
  activeTab: AppTab;
  selectedBank: BankId | null;
  monthFilter: number;
  yearFilter: number;
  transactions: Transaction[];
  customCategoriesIncome:  string[];
  customCategoriesExpense: string[];
  customSubItemsExpense: Record<string, string[]>;
  customSubItemsIncome:  Record<string, string[]>;
  history: HistoryEntry[];
  activeHistoryEntryId: string | null;
  bankBalance: BankBalance | null;
  excludedCategoryIds: string[];
  categoryRules: CategoryRules;
  setCategoryRulePinned: (key: string, category: string | null) => void;
  deleteCategoryRule: (key: string) => void;
  saldoInicial: number;
  setSaldoInicial: (n: number) => void;
  setActiveTab: (tab: AppTab) => void;
  setSelectedBank: (bank: BankId | null) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setActiveHistoryEntryId: (id: string | null) => void;
  setBankBalance: (b: BankBalance | null) => void;
  setExcludedCategories: (keys: string[]) => void;
  clearData: () => void;
  clearCategoriesForIds: (ids: string[]) => void;
  updateTransactionCategory: (id: string, category: string, subCategory?: string) => void;
  updateTransactionPaymentMethod: (id: string, paymentMethod: string) => void;
  toggleTransactionIgnored: (id: string) => void;
  setPeriod: (month: number, year: number) => void;
  addCustomCategory: (category: string, type: "income" | "expense") => void;
  removeCustomCategory: (category: string, type: "income" | "expense") => void;
  addCustomSubItem: (key: string, item: string, type: "income" | "expense") => void;
  removeCustomSubItem: (key: string, item: string, type: "income" | "expense") => void;
  addTransaction: (tx: Transaction) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  removeHistoryEntry: (id: string) => void;
  fixedCategoryIds: string[];
  cfCvConfigured: boolean;
  setFixedCategories: (ids: string[]) => void;
  toggleFixedCategory: (id: string) => void;

  // Contas a pagar/receber
  contas: Conta[];
  addConta: (conta: Omit<Conta, "id" | "createdAt">) => void;
  updateConta: (id: string, patch: Partial<Omit<Conta, "id" | "createdAt">>) => void;
  deleteConta: (id: string) => void;
  toggleContaQuitado: (id: string) => void;
}

const today = new Date();

export const useFinancierStore = create<FinancierState>()(
  persist(
    (set, get) => ({
      // ── Users ──────────────────────────────────────────────────────────────
      users: [DEFAULT_USER],
      activeUserId: DEFAULT_USER_ID,

      addUser: (name) => set((state) => {
        const trimmed = name.trim();
        if (!trimmed) return {};
        const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return { users: [...state.users, { id, name: trimmed, createdAt: new Date().toISOString() }] };
      }),

      removeUser: (id) => set((state) => {
        if (state.users.length <= 1) return {};
        const newUsers = state.users.filter((u) => u.id !== id);
        try { localStorage.removeItem(`financier-data-${id}`); } catch {}

        if (state.activeUserId !== id) return { users: newUsers };

        // Active user removed — switch to first remaining
        const next = newUsers[0];
        const data = loadUserData(next.id);
        return {
          users: newUsers,
          activeUserId: next.id,
          activeTab: "upload" as AppTab,
          ...applyUserData(data),
        };
      }),

      renameUser: (id, name) => set((state) => ({
        users: state.users.map((u) => u.id === id ? { ...u, name: name.trim() } : u),
      })),

      switchUser: (id) => {
        const state = get();
        if (id === state.activeUserId) return;

        // Save current user's data
        saveUserData(state.activeUserId, {
          transactions: state.transactions,
          history: state.history,
          selectedBank: state.selectedBank,
          fixedCategoryIds: state.fixedCategoryIds,
          cfCvConfigured: state.cfCvConfigured,
          customCategoriesIncome: state.customCategoriesIncome,
          customCategoriesExpense: state.customCategoriesExpense,
          customSubItemsExpense: state.customSubItemsExpense,
          customSubItemsIncome:  state.customSubItemsIncome,
          monthFilter: state.monthFilter,
          yearFilter: state.yearFilter,
          activeHistoryEntryId: state.activeHistoryEntryId,
          contas: state.contas,
          bankBalance: state.bankBalance,
          excludedCategoryIds: state.excludedCategoryIds,
          categoryRules: state.categoryRules,
          saldoInicial: state.saldoInicial,
        });

        const data = loadUserData(id);
        set({ activeUserId: id, activeTab: "upload", ...applyUserData(data) });
      },

      // Agrega dados de TODOS os perfis: usuário ativo vem do estado vivo,
      // os demais do localStorage. Usado pelo Painel Gerencial.
      getAllUsersData: () => {
        const state = get();
        return state.users.map((u) => {
          if (u.id === state.activeUserId) {
            // ativo: state.transactions já é o ledger consolidado
            return {
              id: u.id, name: u.name, transactions: state.transactions,
              fixedCategoryIds: state.fixedCategoryIds,
              excludedCategoryIds: state.excludedCategoryIds,
              bankBalance: state.bankBalance,
            };
          }
          const data = migrateUserData(loadUserData(u.id));
          // outros: ledger persistido do usuário, higienizado
          const ledger = cleanLedger(data.transactions ?? []);
          return {
            id: u.id, name: u.name, transactions: ledger,
            fixedCategoryIds: data.fixedCategoryIds ?? [],
            excludedCategoryIds: data.excludedCategoryIds ?? [...DEFAULT_EXCLUDED_KEYS],
            bankBalance: data.bankBalance ?? null,
          };
        });
      },

      // Contas de TODOS os perfis (ativo do estado vivo, demais do localStorage).
      // Usado pelo relatório consolidado de contas.
      getAllUsersContas: () => {
        const state = get();
        return state.users.map((u) => {
          if (u.id === state.activeUserId) {
            return { id: u.id, name: u.name, contas: state.contas };
          }
          const data = migrateUserData(loadUserData(u.id));
          return { id: u.id, name: u.name, contas: data.contas ?? [] };
        });
      },

      // ── App state ──────────────────────────────────────────────────────────
      activeTab: "upload",
      selectedBank: null,
      monthFilter: today.getMonth(),
      yearFilter: today.getFullYear(),
      transactions: [],
      customCategoriesIncome:  [],
      customCategoriesExpense: [],
      customSubItemsExpense: {},
      customSubItemsIncome:  {},
      history: [],
      activeHistoryEntryId: null,
      fixedCategoryIds: [],
      cfCvConfigured: false,
      bankBalance: null,
      excludedCategoryIds: [...DEFAULT_EXCLUDED_KEYS],
      categoryRules: {},
      saldoInicial: 0,
      setSaldoInicial: (n) => set({ saldoInicial: Number.isFinite(n) ? n : 0 }),

      setCategoryRulePinned: (key, category) =>
        set((state) => {
          const rule = state.categoryRules[key];
          if (!rule) return {};
          return {
            categoryRules: {
              ...state.categoryRules,
              [key]: { ...rule, pinned: category ?? undefined, updatedAt: new Date().toISOString() },
            },
          };
        }),

      deleteCategoryRule: (key) =>
        set((state) => {
          if (!state.categoryRules[key]) return {};
          const next = { ...state.categoryRules };
          delete next[key];
          return { categoryRules: next };
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),
      setSelectedBank: (bank) => set({ selectedBank: bank }),
      setTransactions: (transactions) => set({ transactions }),
      setActiveHistoryEntryId: (id) => set({ activeHistoryEntryId: id }),
      // Guarda o saldo mais recente (por DTASOF). Extratos mais antigos não
      // sobrescrevem um saldo mais novo.
      setBankBalance: (b) => set((state) => {
        if (!b) return { bankBalance: null };
        if (state.bankBalance && state.bankBalance.dateAsOf > b.dateAsOf) return {};
        return { bankBalance: b };
      }),
      setExcludedCategories: (keys) => set({ excludedCategoryIds: keys }),
      // "Limpar tudo": zera o ledger mas PRESERVA o histórico — é dele que a
      // memória de categorias aprende, então reimportar recategoriza sozinho.
      clearData: () =>
        set({
          transactions: [],
          activeHistoryEntryId: null,
          bankBalance: null,
          monthFilter: today.getMonth(),
          yearFilter: today.getFullYear(),
        }),

      clearCategoriesForIds: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          const reset = (tx: Transaction): Transaction =>
            idSet.has(tx.id)
              ? { ...tx, category: "Sem categoria", categoryId: undefined, subCategory: undefined, autoCategorized: false, fromMemory: false, memoryConflict: undefined }
              : tx;
          return {
            transactions: state.transactions.map(reset),
            history: state.history.map((e) => ({ ...e, transactions: e.transactions.map(reset) })),
          };
        }),

      updateTransactionCategory: (id, category, subCategory?) =>
        set((state) => {
          const resolved = resolveExpenseCategory(category);
          const canonicalName = resolved?.name ?? category;
          const categoryId    = resolved?.id;
          const patch: Record<string, unknown> = { category: canonicalName, categoryId, autoCategorized: false, fromMemory: false, memoryConflict: undefined };
          if (subCategory !== undefined) patch.subCategory = subCategory;
          const transactions = state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ...patch } : tx
          );
          const history = state.activeHistoryEntryId
            ? state.history.map((e) =>
                e.id === state.activeHistoryEntryId
                  ? { ...e, transactions: e.transactions.map((tx) => tx.id === id ? { ...tx, ...patch } : tx) }
                  : e
              )
            : state.history;

          // Memória de categorias (write-through): aprende terceiro → categoria.
          const target = state.transactions.find((tx) => tx.id === id);
          const categoryRules = target
            ? learnRule(state.categoryRules, target, canonicalName, categoryId, subCategory)
            : state.categoryRules;

          return { transactions, history, categoryRules };
        }),

      updateTransactionPaymentMethod: (id, paymentMethod) =>
        set((state) => {
          const transactions = state.transactions.map((tx) =>
            tx.id === id ? { ...tx, paymentMethod } : tx
          );
          const history = state.activeHistoryEntryId
            ? state.history.map((e) =>
                e.id === state.activeHistoryEntryId
                  ? { ...e, transactions: e.transactions.map((tx) => tx.id === id ? { ...tx, paymentMethod } : tx) }
                  : e
              )
            : state.history;
          return { transactions, history };
        }),

      toggleTransactionIgnored: (id) =>
        set((state) => {
          const transactions = state.transactions.map((tx) =>
            tx.id === id ? { ...tx, ignored: !tx.ignored } : tx
          );
          const history = state.activeHistoryEntryId
            ? state.history.map((e) =>
                e.id === state.activeHistoryEntryId
                  ? { ...e, transactions: e.transactions.map((tx) => tx.id === id ? { ...tx, ignored: !tx.ignored } : tx) }
                  : e
              )
            : state.history;
          return { transactions, history };
        }),

      setPeriod: (month, year) => set({ monthFilter: month, yearFilter: year }),

      addCustomCategory: (category, type) =>
        set((state) => {
          const key = type === "income" ? "customCategoriesIncome" : "customCategoriesExpense";
          return state[key].includes(category) ? {} : { [key]: [...state[key], category] };
        }),

      removeCustomCategory: (category, type) =>
        set((state) => {
          const key = type === "income" ? "customCategoriesIncome" : "customCategoriesExpense";
          return { [key]: state[key].filter((c) => c !== category) };
        }),

      addCustomSubItem: (key, item, type) =>
        set((state) => {
          const field = type === "income" ? "customSubItemsIncome" : "customSubItemsExpense";
          const existing = state[field][key] ?? [];
          if (existing.includes(item)) return {};
          return { [field]: { ...state[field], [key]: [...existing, item] } };
        }),

      removeCustomSubItem: (key, item, type) =>
        set((state) => {
          const field = type === "income" ? "customSubItemsIncome" : "customSubItemsExpense";
          const existing = state[field][key] ?? [];
          return { [field]: { ...state[field], [key]: existing.filter((i) => i !== item) } };
        }),

      addTransaction: (tx) => {
        const resolved = resolveExpenseCategory(tx.category);
        const fullTx = resolved ? { ...tx, category: resolved.name, categoryId: resolved.id } : tx;
        set((state) => ({
          transactions: [fullTx, ...state.transactions],
          history: state.activeHistoryEntryId
            ? state.history.map((e) =>
                e.id === state.activeHistoryEntryId
                  ? { ...e, transactions: [fullTx, ...e.transactions] }
                  : e
              )
            : state.history,
        }));
      },

      addHistoryEntry: (entry) =>
        set((state) => ({
          history: [entry, ...state.history],
          activeHistoryEntryId: entry.id,
        })),

      removeHistoryEntry: (id) =>
        set((state) => ({
          history: state.history.filter((e) => e.id !== id),
          activeHistoryEntryId: state.activeHistoryEntryId === id ? null : state.activeHistoryEntryId,
        })),

      setFixedCategories: (ids) => set({ fixedCategoryIds: ids, cfCvConfigured: true }),
      toggleFixedCategory: (id) =>
        set((state) => ({
          fixedCategoryIds: state.fixedCategoryIds.includes(id)
            ? state.fixedCategoryIds.filter((x) => x !== id)
            : [...state.fixedCategoryIds, id],
        })),

      // ── Contas a pagar/receber ─────────────────────────────────────────────
      contas: [],

      addConta: (data) =>
        set((state) => ({
          contas: [
            ...state.contas,
            {
              ...data,
              id: `conta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      updateConta: (id, patch) =>
        set((state) => ({
          contas: state.contas.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteConta: (id) =>
        set((state) => ({ contas: state.contas.filter((c) => c.id !== id) })),

      toggleContaQuitado: (id) =>
        set((state) => {
          const conta = state.contas.find((c) => c.id === id);
          if (!conta) return {};

          const newStatus: "aberto" | "quitado" = conta.status === "aberto" ? "quitado" : "aberto";
          let newContas = state.contas.map((c) =>
            c.id === id ? { ...c, status: newStatus } : c
          );

          // Ao quitar uma conta mensal, cria a próxima ocorrência (+1 mês)
          const isMensal = conta.recorrencia === "mensal-fixo" || conta.recorrencia === "mensal-variavel";
          if (newStatus === "quitado" && isMensal) {
            const parts = conta.vencimento.split("-").map(Number);
            // new Date(year, month, day) — passando month como 1-indexed cria next month (month 0-indexed)
            const nextDate = new Date(parts[0], parts[1], parts[2]);
            const nextVenc = [
              nextDate.getFullYear(),
              String(nextDate.getMonth() + 1).padStart(2, "0"),
              String(nextDate.getDate()).padStart(2, "0"),
            ].join("-");
            // Só cria se ainda não existe uma conta aberta igual no próximo mês
            const alreadyExists = newContas.some(
              (c) => c.descricao === conta.descricao && c.vencimento === nextVenc && c.status === "aberto"
            );
            if (!alreadyExists) {
              newContas = [
                ...newContas,
                {
                  ...conta,
                  id: `conta-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  status: "aberto" as const,
                  vencimento: nextVenc,
                  createdAt: new Date().toISOString(),
                  // variável: próximo mês criado com valor 0 para o usuário preencher
                  valor: conta.recorrencia === "mensal-variavel" ? 0 : conta.valor,
                },
              ];
            }
          }

          return { contas: newContas };
        }),
    }),
    {
      name: "financier-store",
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migrate transactions
        state.transactions = state.transactions.map(migrateTransaction);
        state.history = state.history.map((entry) => ({
          ...entry,
          transactions: entry.transactions.map(migrateTransaction),
        }));
        // Higieniza o ledger: remove duplicatas herdadas de versões antigas
        // dos parsers (mesma transação com nome diferente / sem FITID)
        state.transactions = cleanLedger(state.transactions);
        // Migração: campo novo de exclusões da análise
        if (!state.excludedCategoryIds) state.excludedCategoryIds = [...DEFAULT_EXCLUDED_KEYS];
        // Migrate users — ensure at least one exists
        if (!state.users || state.users.length === 0) {
          state.users = [DEFAULT_USER];
          state.activeUserId = DEFAULT_USER_ID;
        }
        // Migrate removed "analise" tab → "resumo"
        if ((state.activeTab as string) === "analise") {
          state.activeTab = "resumo";
        }
        // Memória de categorias: semeia a partir da categorização manual já
        // existente se o perfil ainda não tem regras (migração de usuário antigo).
        if (!state.categoryRules || Object.keys(state.categoryRules).length === 0) {
          state.categoryRules = buildRulesFromTransactions([
            state.transactions,
            ...state.history.map((e) => e.transactions),
          ]);
        }
      },
      partialize: (state) => ({
        users:                 state.users,
        activeUserId:          state.activeUserId,
        activeTab:             state.activeTab,
        transactions:          state.transactions,
        selectedBank:          state.selectedBank,
        monthFilter:           state.monthFilter,
        yearFilter:            state.yearFilter,
        customCategoriesIncome:  state.customCategoriesIncome,
        customCategoriesExpense: state.customCategoriesExpense,
        customSubItemsExpense:   state.customSubItemsExpense,
        customSubItemsIncome:    state.customSubItemsIncome,
        history:               state.history,
        activeHistoryEntryId:  state.activeHistoryEntryId,
        fixedCategoryIds:      state.fixedCategoryIds,
        cfCvConfigured:        state.cfCvConfigured,
        contas:                state.contas,
        bankBalance:           state.bankBalance,
        excludedCategoryIds:   state.excludedCategoryIds,
        categoryRules:         state.categoryRules,
        saldoInicial:          state.saldoInicial,
      }),
    }
  )
);
