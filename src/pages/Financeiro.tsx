import { useState } from "react";
import { GestaoFranquiasPage } from "./financeiro/GestaoFranquias";
import { AdministracaoPage } from "./financeiro/Administracao";

type SubTab = "franquias" | "administracao";

export function FinanceiroPage() {
  const [tab, setTab] = useState<SubTab>("franquias");

  const tabs: { id: SubTab; label: string }[] = [
    { id: "franquias", label: "Gestão Franquias" },
    { id: "administracao", label: "Administração" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-white/[0.06] px-6">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-sm font-medium transition ${
                tab === t.id ? "border-b-2 border-accentPositive text-accentPositive" : "text-slate-500 hover:text-slate-300"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {tab === "franquias" && <GestaoFranquiasPage />}
        {tab === "administracao" && <AdministracaoPage />}
      </div>
    </div>
  );
}
