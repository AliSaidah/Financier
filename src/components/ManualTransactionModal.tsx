import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PAYMENT_METHODS, INCOME_CATEGORY_GROUPS, EXPENSE_CATEGORY_GROUPS } from "../data/constants";
import { Transaction } from "../types/finance";
import { CategorySelector } from "./CategorySelector";
import { digitsToBRLInput, parseBRLInput } from "../lib/formatters";

interface Props {
  type: "income" | "expense";
  onConfirm: (tx: Transaction) => void;
  onClose: () => void;
}

export function ManualTransactionModal({ type, onConfirm, onClose }: Props) {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [date, setDate]                 = useState(defaultDate);
  const [valueStr, setValueStr]         = useState("");
  const [thirdParty, setThirdParty]     = useState("");
  const [paymentMethod, setPaymentMethod] = useState(
    type === "income" ? "Pix Recebido" : "Pix Enviado"
  );
  const [category, setCategory]         = useState("");
  const [error, setError]               = useState("");

  const categoryGroups = type === "income" ? INCOME_CATEGORY_GROUPS : EXPENSE_CATEGORY_GROUPS;

  function handleConfirm() {
    const raw = parseBRLInput(valueStr);
    if (!date)               return setError("Informe a data.");
    if (isNaN(raw) || raw <= 0) return setError("Informe um valor válido.");
    if (!thirdParty.trim())  return setError("Informe o terceiro.");

    const amount = type === "expense" ? -Math.abs(raw) : Math.abs(raw);

    const tx: Transaction = {
      id:            `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      amount,
      paymentMethod,
      thirdParty:    thirdParty.trim(),
      category:      category || "Sem categoria",
      manual:        true,
      autoCategorized: false,
    };
    onConfirm(tx);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Nova transação — {type === "income" ? "Entrada" : "Saída"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300">
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Date */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-accentPositive/40"
            />
          </div>

          {/* Value */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Valor (R$)</label>
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-2 transition focus-within:border-accentPositive/40">
              <span className="text-sm text-slate-500">R$</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={valueStr}
                onChange={(e) => { setValueStr(digitsToBRLInput(e.target.value)); setError(""); }}
                className="w-full bg-transparent text-sm tabular-nums text-slate-200 placeholder-slate-600 outline-none"
              />
            </div>
          </div>

          {/* Third party */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Terceiro / Descrição</label>
            <input
              type="text"
              placeholder="Nome ou estabelecimento"
              value={thirdParty}
              onChange={(e) => { setThirdParty(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-accentPositive/40"
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Forma de pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-slate-800/60 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-accentPositive/40"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Categoria</label>
            <div className="flex items-center gap-2">
              <CategorySelector
                value={category}
                groups={categoryGroups}
                categoryType={type}
                onSelect={setCategory}
              />
              {category && <span className="text-xs text-slate-400">{category}</span>}
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] py-2 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-accentPositive py-2 text-sm font-semibold text-slate-900 transition hover:brightness-110"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
