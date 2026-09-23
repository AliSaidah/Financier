import { useMemo } from "react";
import {
  Lightbulb, TrendingUp, TrendingDown, AlertTriangle,
  PiggyBank, Target, Coins, Tags, CheckCircle2, Building,
} from "lucide-react";
import { toCurrencyBRL } from "../lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsightCategoryStat {
  category: string;
  total: number;
  count: number;
  pct: number;
}

interface PrevEntry { label: string; value: number; }

interface Props {
  receitaTotal: number;
  despesaTotal: number;
  custosFix: number;
  resultadoEst: number;
  despesasStats: InsightCategoryStat[];
  receitasStats: InsightCategoryStat[];
  prevDespesas: PrevEntry[] | null;
  prevLabel: string | null;
  uncategorizedCount: number;
}

type Severity = "bad" | "warn" | "good" | "info";

interface Insight {
  severity: Severity;
  icon: React.ReactNode;
  title: string;
  detail: string;
}

const SEVERITY_STYLE: Record<Severity, { disc: string; icon: string }> = {
  bad:  { disc: "bg-red-500/10 ring-red-500/20",       icon: "text-red-400" },
  warn: { disc: "bg-amber-500/10 ring-amber-500/20",   icon: "text-amber-400" },
  good: { disc: "bg-emerald-500/10 ring-emerald-500/20", icon: "text-emerald-400" },
  info: { disc: "bg-sky-500/10 ring-sky-500/20",       icon: "text-sky-400" },
};

const fmtPctNum = (v: number) => `${(v * 100).toFixed(0)}%`;

// ─── Analysis engine (heurísticas locais) ─────────────────────────────────────

function buildAnalysis({
  receitaTotal, despesaTotal, custosFix, resultadoEst,
  despesasStats, receitasStats, prevDespesas, prevLabel, uncategorizedCount,
}: Props): { score: number; insights: Insight[] } {
  const insights: Insight[] = [];
  let score = 50;

  const resultRatio = receitaTotal > 0 ? resultadoEst / receitaTotal : 0;
  const fixRatio    = receitaTotal > 0 ? custosFix / receitaTotal : 0;
  const prevTotal   = prevDespesas ? prevDespesas.reduce((s, e) => s + e.value, 0) : 0;
  const momChange   = prevTotal > 0 ? (despesaTotal - prevTotal) / prevTotal : null;
  const topDespesa  = despesasStats[0];
  const topReceita  = receitasStats[0];

  // 1. Resultado do mês
  if (receitaTotal > 0 || despesaTotal > 0) {
    if (resultadoEst < 0) {
      score -= 20;
      insights.push({
        severity: "bad",
        icon: <TrendingDown size={15} />,
        title: `Mês fechou no vermelho: −${toCurrencyBRL(Math.abs(resultadoEst))}`,
        detail: "Sugestão: comece cortando os custos variáveis — eles respondem mais rápido que os fixos.",
      });
    } else if (resultRatio >= 0.2) {
      score += 25;
      insights.push({
        severity: "good",
        icon: <PiggyBank size={15} />,
        title: `Sobraram ${fmtPctNum(resultRatio)} da receita (${toCurrencyBRL(resultadoEst)})`,
        detail: "Sugestão: destine parte desse valor para reserva de emergência ou investimento.",
      });
    } else if (resultRatio >= 0.1) {
      score += 18;
    } else {
      score += 8;
      insights.push({
        severity: "warn",
        icon: <Target size={15} />,
        title: `Margem apertada: só ${fmtPctNum(Math.max(resultRatio, 0))} da receita sobrou`,
        detail: "Sugestão: busque uma folga de pelo menos 10% para absorver imprevistos.",
      });
    }
  }

  // 2. Variação vs mês anterior
  if (momChange !== null && prevLabel) {
    if (momChange > 0.15) {
      score -= 8;
      insights.push({
        severity: "warn",
        icon: <TrendingUp size={15} />,
        title: `Gastos subiram ${fmtPctNum(momChange)} em relação a ${prevLabel}`,
        detail: "Sugestão: revise as categorias que mais cresceram para entender o que mudou.",
      });
    } else if (momChange < -0.1) {
      score += 8;
      insights.push({
        severity: "good",
        icon: <TrendingDown size={15} />,
        title: `Gastos caíram ${fmtPctNum(Math.abs(momChange))} em relação a ${prevLabel}`,
        detail: "Bom sinal — mantenha o ritmo e acompanhe se a redução se sustenta.",
      });
    }
  }

  // 3. Categoria que mais cresceu vs mês anterior
  if (prevDespesas && prevDespesas.length > 0 && despesaTotal > 0) {
    const prevMap = new Map(prevDespesas.map((e) => [e.label, e.value]));
    let growthCat: { category: string; delta: number; pctOfTotal: number } | null = null;
    for (const s of despesasStats) {
      const before = prevMap.get(s.category) ?? 0;
      const delta  = s.total - before;
      if (before > 0 && delta / before > 0.3 && delta / despesaTotal > 0.05) {
        if (!growthCat || delta > growthCat.delta) {
          growthCat = { category: s.category, delta, pctOfTotal: delta / despesaTotal };
        }
      }
    }
    if (growthCat) {
      insights.push({
        severity: "warn",
        icon: <AlertTriangle size={15} />,
        title: `${growthCat.category} cresceu ${toCurrencyBRL(growthCat.delta)} vs ${prevLabel}`,
        detail: "Sugestão: defina um teto mensal para essa categoria e acompanhe de perto.",
      });
    }
  }

  // 4. Custos fixos comprometendo a receita
  if (receitaTotal > 0 && custosFix > 0) {
    if (fixRatio > 0.5) {
      score -= 10;
      insights.push({
        severity: fixRatio > 0.7 ? "bad" : "warn",
        icon: <Building size={15} />,
        title: `Custos fixos comprometem ${fmtPctNum(fixRatio)} da receita`,
        detail: "Sugestão: renegocie contratos, assinaturas e aluguel — fixos altos engessam o caixa.",
      });
    } else if (fixRatio < 0.4) {
      score += 8;
    }
  }

  // 5. Concentração de gastos
  if (topDespesa && topDespesa.pct > 35 && despesasStats.length > 1) {
    if (topDespesa.pct > 50) score -= 6;
    insights.push({
      severity: "info",
      icon: <Target size={15} />,
      title: `${topDespesa.category} concentra ${topDespesa.pct.toFixed(0)}% dos gastos`,
      detail: "Sugestão: é o ponto de maior alavanca — qualquer redução aqui tem impacto grande no resultado.",
    });
  } else if (topDespesa && topDespesa.pct < 30) {
    score += 6;
  }

  // 6. Gastos formiguinha (frequentes e pequenos)
  const formiga = despesasStats.find((s) => s.count >= 8 && s.total / s.count <= 60 && s.total / Math.max(despesaTotal, 1) > 0.03);
  if (formiga) {
    insights.push({
      severity: "info",
      icon: <Coins size={15} />,
      title: `${formiga.count} pequenos gastos em ${formiga.category} somaram ${toCurrencyBRL(formiga.total)}`,
      detail: "Sugestão: gastos formiguinha passam despercebidos — some-os no mês e veja se valem a pena.",
    });
  }

  // 7. Dependência de uma fonte de receita
  if (topReceita && topReceita.pct > 80 && receitasStats.length > 1) {
    insights.push({
      severity: "info",
      icon: <TrendingUp size={15} />,
      title: `${topReceita.pct.toFixed(0)}% das receitas vêm de ${topReceita.category}`,
      detail: "Sugestão: diversificar fontes de receita reduz o risco de meses fracos.",
    });
  }

  // 8. Transações sem categoria
  if (uncategorizedCount > 0) {
    score -= 5;
    insights.push({
      severity: "info",
      icon: <Tags size={15} />,
      title: `${uncategorizedCount} ${uncategorizedCount === 1 ? "transação" : "transações"} sem categoria`,
      detail: "Sugestão: categorize tudo para que esta análise fique mais precisa.",
    });
  } else if (despesaTotal > 0) {
    score += 5;
  }

  // Tudo certo e nada a apontar
  if (insights.length === 0 && (receitaTotal > 0 || despesaTotal > 0)) {
    insights.push({
      severity: "good",
      icon: <CheckCircle2 size={15} />,
      title: "Mês equilibrado, sem pontos de atenção",
      detail: "Continue acompanhando — consistência é o que constrói resultado.",
    });
  }

  // bad → warn → good → info, mantém no máx. 5
  const order: Record<Severity, number> = { bad: 0, warn: 1, good: 2, info: 3 };
  insights.sort((a, b) => order[a.severity] - order[b.severity]);

  return { score: Math.max(2, Math.min(98, Math.round(score))), insights: insights.slice(0, 5) };
}

// ─── Gauge ────────────────────────────────────────────────────────────────────

function scoreMeta(score: number): { color: string; label: string } {
  if (score >= 70) return { color: "#10b981", label: "Saudável" };
  if (score >= 40) return { color: "#f59e0b", label: "Atenção" };
  return { color: "#ef4444", label: "Crítico" };
}

function Gauge({ score }: { score: number }) {
  const { color, label } = scoreMeta(score);
  const ARC_LEN = Math.PI * 65; // semicírculo r=65
  const filled  = (score / 100) * ARC_LEN;

  return (
    <div className="flex flex-col items-center">
      <svg width={170} height={100} viewBox="0 0 160 90">
        <path
          d="M 15 82 A 65 65 0 0 1 145 82"
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={11} strokeLinecap="round"
        />
        <path
          d="M 15 82 A 65 65 0 0 1 145 82"
          fill="none" stroke={color} strokeWidth={11} strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC_LEN}`}
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.3s ease", filter: `drop-shadow(0 0 6px ${color}55)` }}
        />
        <text x={80} y={68} textAnchor="middle" fill="#f1f5f9" fontSize={26} fontWeight={700} fontFamily="Inter, Arial, sans-serif">
          {score}
        </text>
        <text x={80} y={84} textAnchor="middle" fill="#64748b" fontSize={9} fontFamily="Inter, Arial, sans-serif" letterSpacing="0.1em">
          / 100
        </text>
      </svg>
      <span
        className="mt-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1"
        style={{ color, backgroundColor: `${color}1a`, borderColor: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}33` }}
      >
        {label}
      </span>
      <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-600">
        Saúde financeira<br />do período
      </p>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function InsightsCard(props: Props) {
  const { score, insights } = useMemo(() => buildAnalysis(props), [props]);
  const isEmpty = props.receitaTotal === 0 && props.despesaTotal === 0;

  return (
    <div className="mt-5 overflow-hidden rounded-xl bg-bgSecondary ring-1 ring-white/[0.07]">
      <div className="flex items-center gap-2.5 border-b border-white/[0.05] px-5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-400/10 text-amber-400 ring-1 ring-amber-400/20">
          <Lightbulb size={13} />
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Análise Inteligente</p>
        <span className="ml-auto text-[10px] text-slate-600">sugestões baseadas no seu mês</span>
      </div>

      {isEmpty ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma transação no período para analisar.</p>
      ) : (
        <div className="flex items-start gap-6 p-5">
          {/* Gauge */}
          <div className="shrink-0 pt-1">
            <Gauge score={score} />
          </div>

          {/* Insights */}
          <div className="min-w-0 flex-1 space-y-2.5">
            {insights.map((insight, i) => {
              const st = SEVERITY_STYLE[insight.severity];
              return (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-white/[0.025] px-3.5 py-3 ring-1 ring-white/[0.05]">
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${st.disc} ${st.icon}`}>
                    {insight.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug text-slate-200">{insight.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{insight.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
