import { useEffect, useRef, useState } from "react";
import { X, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Conta } from "../types/finance";
import { CategorySelector } from "./CategorySelector";
import { EXPENSE_CATEGORY_GROUPS, INCOME_CATEGORY_GROUPS } from "../data/constants";
import { digitsToBRLInput, parseBRLInput, numberToBRLInput, toCurrencyBRL, splitParcelas } from "../lib/formatters";

interface Props {
  existingConta?: Conta;
  defaultTipo?: "pagar" | "receber";
  onConfirm: (data: Omit<Conta, "id" | "createdAt">, parcelas?: number) => void;
  onClose: () => void;
}

const FIELD =
  "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-accentPositive/40 focus:bg-white/[0.06]";

const LABEL = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500";

// Faixa de vencimento aceita — evita datas absurdas tipo ano 0112
const VENC_MIN = "2000-01-01";
const VENC_MAX = "2099-12-31";

export function vencimentoValido(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return v >= VENC_MIN && v <= VENC_MAX;
}


export function ContaModal({ existingConta, defaultTipo, onConfirm, onClose }: Props) {
  const isEdit = !!existingConta;

  const [descricao,   setDescricao]   = useState(existingConta?.descricao  ?? "");
  const [valor,       setValor]       = useState(existingConta ? numberToBRLInput(existingConta.valor) : "");
  const [vencimento,  setVencimento]  = useState(existingConta?.vencimento ?? "");
  const [tipo,        setTipo]        = useState<"pagar" | "receber">(existingConta?.tipo ?? defaultTipo ?? "pagar");
  const [category,    setCategory]    = useState(existingConta?.category   ?? "");
  const [status,      setStatus]      = useState<"aberto" | "quitado">(existingConta?.status ?? "aberto");
  const [recorrencia, setRecorrencia] = useState<"unico" | "mensal-fixo" | "mensal-variavel">(existingConta?.recorrencia ?? "unico");
  const [parcelado,   setParcelado]   = useState(false);
  const [parcelas,    setParcelas]    = useState("2");
  const [modoParcela, setModoParcela] = useState<"parcela" | "total">("parcela");

  const descRef = useRef<HTMLInputElement>(null);
  const isPagar = tipo === "pagar";
  const nParcelas = Math.min(99, Math.max(2, parseInt(parcelas, 10) || 2));
  const usaParcelamento = !isEdit && parcelado;
  // Valor total: se o usuário digita o valor da parcela, multiplica pela qtd
  const valorTotalParcelado = parseBRLInput(valor) * (modoParcela === "parcela" ? nParcelas : 1);

  useEffect(() => {
    setTimeout(() => descRef.current?.focus(), 50);
  }, []);

  // Esc fecha o modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Quando tipo muda, limpar categoria (grupos são diferentes)
  function handleTipoChange(newTipo: "pagar" | "receber") {
    setTipo(newTipo);
    setCategory("");
  }

  function handleSubmit() {
    const v = parseBRLInput(valor);
    if (!descricao.trim() || isNaN(v) || v <= 0 || !vencimentoValido(vencimento)) return;
    // Total enviado sempre é o valor total; se digitou por parcela, multiplica pela qtd
    const valorFinal = usaParcelamento ? valorTotalParcelado : v;
    onConfirm(
      {
        descricao: descricao.trim(),
        valor: valorFinal,
        vencimento,
        tipo,
        category: category || undefined,
        status,
        // parcelamento é sempre pontual (cada parcela é "unico")
        recorrencia: usaParcelamento ? "unico" : recorrencia,
      },
      usaParcelamento ? nParcelas : undefined,
    );
  }

  const groups = isPagar ? EXPENSE_CATEGORY_GROUPS : INCOME_CATEGORY_GROUPS;
  const categoryType = isPagar ? "expense" : "income";

  const vencInvalido = vencimento !== "" && !vencimentoValido(vencimento);
  const isValid = descricao.trim() && parseBRLInput(valor) > 0 && vencimentoValido(vencimento);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-slate-900 to-[#0d1426] shadow-2xl">

        {/* Faixa de acento por tipo */}
        <div className={`h-1 w-full ${isPagar ? "bg-gradient-to-r from-red-500/80 via-red-500/30 to-transparent" : "bg-gradient-to-r from-emerald-500/80 via-emerald-500/30 to-transparent"}`} />

        {/* Header */}
        <div className="flex items-center gap-3 px-6 pb-4 pt-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
            isPagar
              ? "bg-red-500/10 text-red-400 ring-red-500/20"
              : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
          }`}>
            {isPagar ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-white">
              {isEdit ? "Editar conta" : "Nova conta"}
            </h2>
            <p className={`text-xs font-medium ${isPagar ? "text-red-400/80" : "text-emerald-400/80"}`}>
              {isPagar ? "Conta a pagar" : "Conta a receber"}
            </p>
          </div>

          {/* Toggle de tipo compacto */}
          <div className="flex shrink-0 rounded-lg bg-white/[0.05] p-0.5 ring-1 ring-white/[0.08]">
            {(["pagar", "receber"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTipoChange(t)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  tipo === t
                    ? t === "pagar"
                      ? "bg-red-500/20 text-red-300"
                      : "bg-emerald-500/20 text-emerald-300"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t === "pagar" ? "Pagar" : "Receber"}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 border-t border-white/[0.06] px-6 py-5">

          {/* Descrição */}
          <div>
            <label className={LABEL}>Descrição</label>
            <input
              ref={descRef}
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={isPagar ? "Ex: Aluguel, Fornecedor X..." : "Ex: Cliente Y, Mensalidade..."}
              className={FIELD}
            />
          </div>

          {/* Valor + Vencimento */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>
                {usaParcelamento ? (modoParcela === "parcela" ? "Valor da parcela" : "Valor total") : "Valor"}
              </label>
              <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 transition focus-within:border-accentPositive/40 focus-within:bg-white/[0.06]">
                <span className="text-sm font-medium text-slate-500">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => setValor(digitsToBRLInput(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder="0,00"
                  className="w-full bg-transparent text-sm font-semibold tabular-nums text-white placeholder-slate-600 outline-none"
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Vencimento</label>
              <input
                type="date"
                value={vencimento}
                min={VENC_MIN}
                max={VENC_MAX}
                onChange={(e) => setVencimento(e.target.value)}
                className={`${FIELD} [color-scheme:dark] ${vencInvalido ? "!border-red-500/50" : ""}`}
              />
              {vencInvalido && (
                <p className="mt-1 text-[11px] text-red-400">Data inválida — confira o ano.</p>
              )}
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className={LABEL}>Categoria <span className="font-normal normal-case tracking-normal text-slate-600">· opcional</span></label>
            <div className="flex items-center gap-2">
              <CategorySelector
                value={category}
                groups={groups}
                categoryType={categoryType}
                onSelect={(val) => setCategory(val)}
              />
              {category && (
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:text-slate-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Recorrência — oculta quando a conta é parcelada */}
          {!(!isEdit && parcelado) && (
            <div>
              <label className={LABEL}>Recorrência</label>
              <div className="grid grid-cols-3 gap-2">
                {(["unico", "mensal-fixo", "mensal-variavel"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRecorrencia(r)}
                    className={`rounded-xl py-2 text-xs font-medium transition ${
                      recorrencia === r
                        ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25"
                        : "bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.07] hover:bg-white/[0.07]"
                    }`}
                  >
                    {r === "unico" ? "Único" : r === "mensal-fixo" ? "Mensal fixo" : "Mensal variável"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Parcelamento (só ao criar nova conta) */}
          {!isEdit && (
            <div>
              <div className="flex items-center justify-between">
                <label className={`${LABEL} mb-0`}>Parcelar conta</label>
                <button
                  type="button"
                  onClick={() => setParcelado((p) => !p)}
                  role="switch"
                  aria-checked={parcelado}
                  className={`relative h-5 w-9 shrink-0 rounded-full transition ${parcelado ? "bg-accentPositive" : "bg-white/[0.12]"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${parcelado ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </div>

              {parcelado && (
                <div className="mt-3 space-y-3 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/[0.06]">
                  {/* Modo: valor digitado é da parcela ou o total */}
                  <div>
                    <label className="mb-1.5 block text-[10px] font-medium text-slate-500">O valor digitado acima é…</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["parcela", "total"] as const).map((mo) => (
                        <button
                          key={mo}
                          type="button"
                          onClick={() => setModoParcela(mo)}
                          className={`rounded-lg py-1.5 text-xs font-medium transition ${
                            modoParcela === mo
                              ? "bg-accentPositive/15 text-accentPositive ring-1 ring-accentPositive/25"
                              : "bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.07] hover:bg-white/[0.07]"
                          }`}
                        >
                          {mo === "parcela" ? "Valor da parcela" : "Valor total"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Nº de parcelas */}
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-slate-400">Nº de parcelas</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onBlur={() => setParcelas(String(nParcelas))}
                      className="w-16 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-center text-sm font-semibold tabular-nums text-white outline-none transition focus:border-accentPositive/40"
                    />
                    <span className="text-xs text-slate-500">de 2 a 99</span>
                  </div>

                  {/* Preview */}
                  {parseBRLInput(valor) > 0 && (() => {
                    const vals = splitParcelas(valorTotalParcelado, nParcelas);
                    const iguais = vals.every((x) => x === vals[0]);
                    return (
                      <p className="text-xs text-slate-300">
                        <span className="font-semibold text-accentPositive">
                          {nParcelas}x de {toCurrencyBRL(vals[0])}
                        </span>
                        {!iguais && (
                          <span className="text-slate-500"> (última: {toCurrencyBRL(vals[vals.length - 1])})</span>
                        )}
                        <span className="text-slate-500"> · total {toCurrencyBRL(valorTotalParcelado)} · uma por mês</span>
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Status (só no edit) */}
          {isEdit && (
            <div>
              <label className={LABEL}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                {(["aberto", "quitado"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`rounded-xl py-2 text-sm font-medium transition ${
                      status === s
                        ? s === "quitado"
                          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                        : "bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.07] hover:bg-white/[0.07]"
                    }`}
                  >
                    {s === "aberto" ? "Em aberto" : "Quitado"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 border-t border-white/[0.06] bg-white/[0.015] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/[0.08] py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(16,185,129,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {isEdit ? "Salvar alterações" : !isEdit && parcelado ? `Adicionar ${nParcelas} parcelas` : "Adicionar conta"}
          </button>
        </div>
      </div>
    </div>
  );
}
