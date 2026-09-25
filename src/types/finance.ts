export type BankId =
  | "bb"
  | "itau"
  | "sicredi"
  | "inter"
  | "nubank";

export type AppTab = "upload" | "recebimentos" | "pagamentos" | "contas" | "resumo" | "painel" | "historico" | "financeiro" | "relatorios";

// ─── Gestão Franquias ─────────────────────────────────────────────────────────

export interface Franquia {
  id: string;
  cidade: string;
  cnpj: string;
  vencimentoBoleto: number; // dia do mês
  razaoSocial?: string;
  createdAt: string;
}

export interface LancamentoFranquia {
  id: string;
  franquiaId: string;
  mesReferencia: string; // YYYY-MM
  tipo: "royalties" | "marketing" | "avulso";
  baseCalculo: number;
  valorTroca: number;
  valorApurado: number;
  valor: number;
  descricao?: string;
  numeroNota?: string;
  notaPdfBase64?: string;
  boletoPdfBase64?: string;
  createdAt: string;
}

// ─── Administração ────────────────────────────────────────────────────────────

export interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  tipo: "CLT" | "PJ";
  admissao: string;
  ativo: boolean;
}

export interface LancamentoFuncionario {
  id: string;
  funcionarioId: string;
  mesReferencia: string; // YYYY-MM
  valorLiquido?: number;
  holeritePdfBase64?: string;
  diasUteis?: number;
  vezesAlmocou?: number;
  valorVA?: number;
  createdAt: string;
}

export interface Conta {
  id: string;
  descricao: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  tipo: "pagar" | "receber";
  category?: string;  // display name
  status: "aberto" | "quitado";
  recorrencia: "unico" | "mensal-fixo" | "mensal-variavel";
  createdAt: string;
}

export interface BankBalance {
  amount: number;
  dateAsOf: string;   // YYYY-MM-DD (DTASOF do OFX)
  bankLabel: string;
}

export interface HistoryEntry {
  id: string;
  bankId: BankId;
  bankLabel: string;
  transactions: Transaction[];
  dateFrom: string;   // YYYY-MM-DD
  dateTo: string;     // YYYY-MM-DD
  uploadedAt: string; // ISO timestamp
}

export interface Transaction {
  id: string;
  fitId?: string;            // FITID do OFX — identidade única e estável da transação no banco
  date: string;
  amount: number;
  paymentMethod: string;
  thirdParty: string;
  category: string;
  ignored?: boolean;
  flagged?: boolean;
  flagReason?: string;
  autoCategorized?: boolean; // true = categoria aplicada automaticamente por regra
  fromMemory?: boolean;      // true = categoria lembrada de categorização manual anterior do mesmo terceiro
  memoryConflict?: string[]; // terceiro já categorizado de formas diferentes — requer escolha manual
  manual?: boolean;          // true = inserida manualmente pelo usuário
  categoryId?: string;       // ID canônico da categoria (slug estável)
  subCategory?: string;      // Subcategoria selecionada pelo usuário (ex: "Delivery", "Combustível")
}

// ─── Memória de categorias (regras aprendidas por perfil) ──────────────────────
// Persistida por usuário; sobrevive a limpar dados / apagar histórico.

export interface CategoryRuleOption {
  category: string;
  categoryId?: string;
  subCategory?: string;
  count: number;       // quantas vezes esse terceiro foi categorizado assim
  amountSum: number;   // soma de |amount| (média = amountSum / count → usada pra ranquear sugestão por valor)
}

export interface CategoryRule {
  thirdParty: string;                          // último nome visto (display)
  direction: "in" | "out";                     // entrada/saída
  options: Record<string, CategoryRuleOption>; // por nome canônico de categoria
  pinned?: string;                             // categoria fixada (aplica sozinha, sem perguntar)
  updatedAt: string;
}

// chave = `${direction}|${thirdParty.trim().toLowerCase()}`
export type CategoryRules = Record<string, CategoryRule>;

