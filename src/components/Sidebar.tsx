import { ArrowDownLeft, ArrowUpRight, BarChart2, Briefcase, ChevronDown, FileBarChart, History, Upload, User, Wallet } from "lucide-react";
import logo from "../assets/logo.png";
import { AppTab, BankId } from "../types/finance";
import { BANKS } from "../data/constants";
import { BankLogo } from "./BankLogo";
import { UserProfile } from "../store/useFinancierStore";

interface Props {
  activeTab: AppTab;
  selectedBank: BankId | null;
  activeUser: UserProfile | null;
  onChangeTab: (tab: AppTab) => void;
  onChangeBank: () => void;
  onOpenSettings: () => void;
}

const TABS: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: "upload",       label: "Upload",       icon: <Upload size={16} /> },
  { id: "recebimentos", label: "Recebimentos", icon: <ArrowUpRight size={16} /> },
  { id: "pagamentos",   label: "Pagamentos",   icon: <ArrowDownLeft size={16} /> },
  { id: "contas",       label: "Contas",       icon: <Wallet size={16} /> },
  { id: "resumo",       label: "Análise",      icon: <BarChart2 size={16} /> },
  { id: "historico",    label: "Histórico",    icon: <History size={16} /> },
  { id: "financeiro",   label: "Financeiro",   icon: <Briefcase size={16} /> },
  { id: "relatorios",   label: "Relatórios",   icon: <FileBarChart size={16} /> },
];

export function Sidebar({ activeTab, selectedBank, activeUser, onChangeTab, onChangeBank, onOpenSettings }: Props) {
  const selectedLabel = BANKS.find((b) => b.id === selectedBank)?.label ?? "Não selecionado";
  const tabs = TABS;

  return (
    <aside className="flex w-[230px] flex-col border-r border-white/[0.06] bg-gradient-to-b from-slate-900/70 via-[#0d1426]/80 to-[#0b1120]/90 backdrop-blur-xl">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-xl bg-accentPositive/30 blur-md" />
          <img src={logo} alt="Financier" className="relative h-9 w-9 rounded-xl ring-1 ring-white/15" />
        </div>
        <div className="leading-tight">
          <span className="block text-base font-bold tracking-tight text-white">Financier</span>
          <span className="block text-[9px] font-medium uppercase tracking-[0.08em] text-slate-500">Fechamento de caixa inteligente</span>
        </div>
      </div>

      {/* User row */}
      <div className="mx-3">
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] px-3 py-2.5 ring-1 ring-white/[0.08] transition hover:ring-white/[0.14] hover:from-white/[0.08]"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)]">
            <User size={14} />
          </div>
          <span className="flex-1 truncate text-left text-sm font-medium text-slate-200">
            {activeUser?.name ?? "Usuário"}
          </span>
          <ChevronDown size={13} className="shrink-0 text-slate-500" />
        </button>
      </div>

      {/* Spacer above nav — pushes nav to vertical center */}
      <div className="flex-1" />

      {/* Nav */}
      <nav className="space-y-0.5 px-3">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-gradient-to-r from-accentPositive/15 to-accentPositive/[0.04] text-accentPositive shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accentPositive shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
              )}
              <span className={active ? "text-accentPositive" : ""}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Spacer below nav — equal to spacer above */}
      <div className="flex-1" />

      {/* Bank card */}
      <div className="mx-3 mb-4 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-3 ring-1 ring-white/[0.08]">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Banco ativo</p>
        <div className="flex items-center gap-2.5">
          {selectedBank && <BankLogo bankId={selectedBank} size={32} radius={8} />}
          <p className="truncate text-sm font-semibold leading-tight text-slate-200">{selectedLabel}</p>
        </div>
        <button
          onClick={onChangeBank}
          className="mt-2.5 w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/[0.06] transition hover:bg-accentPositive/10 hover:text-accentPositive hover:ring-accentPositive/25"
        >
          Trocar banco
        </button>
      </div>

    </aside>
  );
}
