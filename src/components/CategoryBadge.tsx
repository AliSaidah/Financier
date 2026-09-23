interface Props {
  category: string;
}

const COLOR_MAP: Record<string, string> = {
  "Alimentação":          "bg-blue-500/15 text-blue-300 ring-blue-500/20",
  "Transporte":           "bg-purple-500/15 text-purple-300 ring-purple-500/20",
  "Saúde":                "bg-green-500/15 text-green-300 ring-green-500/20",
  "Tecnologia":           "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
  "Marketing":            "bg-pink-500/15 text-pink-300 ring-pink-500/20",
  "Financeiras":          "bg-amber-500/15 text-amber-300 ring-amber-500/20",
  "Bancárias":            "bg-orange-500/15 text-orange-300 ring-orange-500/20",
  "Folha de pagamento":   "bg-indigo-500/15 text-indigo-300 ring-indigo-500/20",
  "Administrativas":      "bg-slate-500/15 text-slate-300 ring-slate-500/20",
  "Operacional":          "bg-teal-500/15 text-teal-300 ring-teal-500/20",
  "Logística":            "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  "Tributárias":          "bg-red-500/15 text-red-300 ring-red-500/20",
  "Jurídicas":            "bg-rose-500/15 text-rose-300 ring-rose-500/20",
  "Treinamentos":         "bg-sky-500/15 text-sky-300 ring-sky-500/20",
  "Assinaturas":          "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/20",
  "Benefícios":           "bg-lime-500/15 text-lime-300 ring-lime-500/20",
  "Vendas":               "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  "Serviços":             "bg-teal-500/15 text-teal-300 ring-teal-500/20",
  "Receitas Financeiras": "bg-green-500/15 text-green-300 ring-green-500/20",
  "Aportes / Capital":    "bg-blue-500/15 text-blue-300 ring-blue-500/20",
  "Reembolsos":           "bg-amber-500/15 text-amber-300 ring-amber-500/20",
  "Sem categoria":        "bg-white/5 text-slate-500 ring-white/10",
};

// Fallback palette for unlisted categories
const FALLBACK = [
  "bg-blue-500/15 text-blue-300 ring-blue-500/20",
  "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  "bg-teal-500/15 text-teal-300 ring-teal-500/20",
  "bg-rose-500/15 text-rose-300 ring-rose-500/20",
  "bg-amber-500/15 text-amber-300 ring-amber-500/20",
];

function hashColor(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export function CategoryBadge({ category }: Props) {
  const cls = COLOR_MAP[category] ?? hashColor(category);
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>
      {category}
    </span>
  );
}
