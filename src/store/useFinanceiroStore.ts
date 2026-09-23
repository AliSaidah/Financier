import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Franquia, LancamentoFranquia, Funcionario, LancamentoFuncionario } from "../types/finance";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface FinanceiroState {
  franquias: Franquia[];
  lancamentosFranquia: LancamentoFranquia[];
  funcionarios: Funcionario[];
  lancamentosFuncionario: LancamentoFuncionario[];

  addFranquia: (f: Omit<Franquia, "id" | "createdAt">) => void;
  updateFranquia: (id: string, patch: Partial<Franquia>) => void;
  removeFranquia: (id: string) => void;

  addLancamentoFranquia: (l: Omit<LancamentoFranquia, "id" | "createdAt">) => string;
  updateLancamentoFranquia: (id: string, patch: Partial<LancamentoFranquia>) => void;
  removeLancamentoFranquia: (id: string) => void;

  addFuncionario: (f: Omit<Funcionario, "id">) => void;
  updateFuncionario: (id: string, patch: Partial<Funcionario>) => void;
  removeFuncionario: (id: string) => void;

  addLancamentoFuncionario: (l: Omit<LancamentoFuncionario, "id" | "createdAt">) => void;
  updateLancamentoFuncionario: (id: string, patch: Partial<LancamentoFuncionario>) => void;
  removeLancamentoFuncionario: (id: string) => void;
}

export const useFinanceiroStore = create<FinanceiroState>()(
  persist(
    (set) => ({
      franquias: [],
      lancamentosFranquia: [],
      funcionarios: [],
      lancamentosFuncionario: [],

      addFranquia: (f) =>
        set((s) => ({ franquias: [...s.franquias, { ...f, id: uid(), createdAt: new Date().toISOString() }] })),
      updateFranquia: (id, patch) =>
        set((s) => ({ franquias: s.franquias.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFranquia: (id) =>
        set((s) => ({
          franquias: s.franquias.filter((f) => f.id !== id),
          lancamentosFranquia: s.lancamentosFranquia.filter((l) => l.franquiaId !== id),
        })),

      addLancamentoFranquia: (l) => {
        const id = uid();
        set((s) => ({ lancamentosFranquia: [...s.lancamentosFranquia, { ...l, id, createdAt: new Date().toISOString() }] }));
        return id;
      },
      updateLancamentoFranquia: (id, patch) =>
        set((s) => ({ lancamentosFranquia: s.lancamentosFranquia.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      removeLancamentoFranquia: (id) =>
        set((s) => ({ lancamentosFranquia: s.lancamentosFranquia.filter((l) => l.id !== id) })),

      addFuncionario: (f) =>
        set((s) => ({ funcionarios: [...s.funcionarios, { ...f, id: uid() }] })),
      updateFuncionario: (id, patch) =>
        set((s) => ({ funcionarios: s.funcionarios.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      removeFuncionario: (id) =>
        set((s) => ({
          funcionarios: s.funcionarios.filter((f) => f.id !== id),
          lancamentosFuncionario: s.lancamentosFuncionario.filter((l) => l.funcionarioId !== id),
        })),

      addLancamentoFuncionario: (l) =>
        set((s) => ({ lancamentosFuncionario: [...s.lancamentosFuncionario, { ...l, id: uid(), createdAt: new Date().toISOString() }] })),
      updateLancamentoFuncionario: (id, patch) =>
        set((s) => ({ lancamentosFuncionario: s.lancamentosFuncionario.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      removeLancamentoFuncionario: (id) =>
        set((s) => ({ lancamentosFuncionario: s.lancamentosFuncionario.filter((l) => l.id !== id) })),
    }),
    { name: "financeiro-store" }
  )
);
