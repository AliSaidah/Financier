import { BankId } from "../types/finance";

export const BANKS: { id: BankId; label: string }[] = [
  { id: "bb",           label: "Banco do Brasil" },
  { id: "itau",         label: "Itaú" },
  { id: "sicredi",      label: "Sicredi" },
  { id: "inter",        label: "Inter" },
  { id: "nubank",       label: "Nubank" },
];

// ─── Category types ──────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  context: "income" | "expense";
  aliases?: string[]; // normalized (sem acento) para lookup
}

// 31 categorias canônicas de despesa — IDs estáveis, nunca mudar
export const EXPENSE_CATEGORIES: Category[] = [
  { id: "alimentacao",           name: "Alimentação",           context: "expense", aliases: ["alimentacao"] },
  { id: "transporte",            name: "Transporte",            context: "expense", aliases: ["transporte"] },
  { id: "marketing",             name: "Marketing",             context: "expense", aliases: ["marketing"] },
  { id: "software-tecnologia",   name: "Software e Tecnologia", context: "expense", aliases: ["software e tecnologia", "tecnologia", "software", "sistemas", "ferramentas digitais"] },
  { id: "assinaturas",           name: "Assinaturas",           context: "expense", aliases: ["assinaturas"] },
  { id: "tarifas-bancarias",     name: "Tarifas Bancárias",     context: "expense", aliases: ["tarifas bancarias", "bancarias", "despesas bancarias", "taxa bancaria"] },
  { id: "juros-encargos",        name: "Juros e Encargos",      context: "expense", aliases: ["juros e encargos", "financeiras", "despesas financeiras"] },
  { id: "tributos",              name: "Tributos",              context: "expense", aliases: ["tributos", "tributarias", "despesas tributarias"] },
  { id: "folha-pagamento",       name: "Folha de Pagamento",    context: "expense", aliases: ["folha de pagamento", "folha pagamento"] },
  { id: "beneficios",            name: "Benefícios",            context: "expense", aliases: ["beneficios"] },
  { id: "aluguel",               name: "Aluguel",               context: "expense", aliases: ["aluguel"] },
  { id: "agua",                  name: "Água",                  context: "expense", aliases: ["agua"] },
  { id: "energia",               name: "Energia",               context: "expense", aliases: ["energia", "luz / energia", "luz/energia"] },
  { id: "gas",                   name: "Gás",                   context: "expense", aliases: ["gas"] },
  { id: "internet-telefone",     name: "Internet e Telefone",   context: "expense", aliases: ["internet e telefone"] },
  { id: "logistica",             name: "Logística",             context: "expense", aliases: ["logistica"] },
  { id: "fornecedores-insumos",  name: "Fornecedores e Insumos",context: "expense", aliases: ["fornecedores e insumos", "fornecedores", "insumos", "materia prima"] },
  { id: "operacional",           name: "Operacional",           context: "expense", aliases: ["operacional"] },
  { id: "administrativo",        name: "Administrativo",        context: "expense", aliases: ["administrativo", "administrativas", "despesas administrativas", "despesas adm", "adm"] },
  { id: "contabil-juridico",     name: "Contábil e Jurídico",   context: "expense", aliases: ["contabil e juridico", "contabil", "contabilidade", "juridico", "juridicas", "contabeis"] },
  { id: "manutencao",            name: "Manutenção",            context: "expense", aliases: ["manutencao"] },
  { id: "limpeza",               name: "Limpeza",               context: "expense", aliases: ["limpeza"] },
  { id: "seguros",               name: "Seguros",               context: "expense", aliases: ["seguros"] },
  { id: "saude-ocupacional",     name: "Saúde Ocupacional",     context: "expense", aliases: ["saude ocupacional"] },
  { id: "treinamentos",          name: "Treinamentos",          context: "expense", aliases: ["treinamentos"] },
  { id: "investimentos",         name: "Investimentos",         context: "expense", aliases: ["investimentos"] },
  { id: "transferencia-interna", name: "Transferência Interna", context: "expense", aliases: ["transferencia interna", "transferencias internas", "transferencia entre contas", "mesma titularidade"] },
  { id: "estorno-reembolso",     name: "Estorno e Reembolso",   context: "expense", aliases: ["estorno e reembolso", "estorno", "reembolso", "devolucao", "reembolsos"] },
  { id: "comercial",             name: "Comercial",             context: "expense", aliases: ["comercial"] },
  { id: "presentes",             name: "Presentes",             context: "expense", aliases: ["presentes"] },
  { id: "outros",                name: "Outros",                context: "expense", aliases: ["outros"] },
];

export const PAYMENT_METHODS = [
  "Pix Enviado",
  "Pix Recebido",
  "Pix",
  "Cartão de Crédito",
  "Cartão de Débito",
  "Boleto",
  "TED",
  "DOC",
  "Transferência",
  "Débito Automático",
  "Dinheiro",
  "Cheque",
  "Tarifa",
  "Não informado"
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CategoryGroup {
  group: string;
  items: string[];
}

export const EXPENSE_CATEGORY_GROUPS: CategoryGroup[] = [
  { group: "Alimentação",           items: ["Delivery", "Supermercado", "Restaurante", "Padaria", "Hortifruti"] },
  { group: "Transporte",            items: ["Combustível", "Pedágio", "Uber / 99", "Estacionamento", "Aluguel veículo"] },
  { group: "Marketing",             items: ["Tráfego pago", "Designer", "Social media", "Gráfica", "Influencer"] },
  { group: "Software e Tecnologia", items: ["ERP", "Hospedagem", "Domínio", "Cloud", "APIs"] },
  { group: "Assinaturas",           items: ["Netflix", "Spotify", "Adobe", "Google One", "iCloud"] },
  { group: "Tarifas Bancárias",     items: ["Tarifa Pix", "Taxa boleto", "Anuidade cartão", "Maquininha", "Cesta bancária"] },
  { group: "Juros e Encargos",      items: ["Juros", "Multas", "IOF", "Encargos", "Antecipação"] },
  { group: "Tributos",              items: ["DAS / Simples", "DARF", "ICMS", "ISS", "INSS"] },
  { group: "Folha de Pagamento",    items: ["Salários", "Pró-labore", "FGTS", "Férias", "13º salário", "Vale alimentação", "Vale transporte"] },
  { group: "Benefícios",            items: ["Plano de saúde", "Gympass"] },
  { group: "Aluguel",               items: ["Aluguel comercial", "Condomínio", "IPTU", "Imobiliária"] },
  { group: "Água",                  items: ["Conta de água"] },
  { group: "Energia",               items: ["Conta de energia"] },
  { group: "Gás",                   items: ["Botijão", "Gás canalizado"] },
  { group: "Internet e Telefone",   items: ["Internet", "Telefone fixo", "Celular corporativo"] },
  { group: "Logística",             items: ["Correios / Sedex", "Jadlog", "Loggi", "Transportadora", "Motoboy"] },
  { group: "Fornecedores e Insumos",items: ["Fornecedores", "Matéria-prima", "Atacadista", "Distribuidora", "Insumos"] },
  { group: "Operacional",           items: ["Embalagens", "Descartáveis", "Almoxarifado", "Estoque"] },
  { group: "Administrativo",        items: ["Material de escritório", "Papelaria", "Sindicato", "Certificado digital"] },
  { group: "Contábil e Jurídico",   items: ["Contador", "Advogado", "Cartório", "Registro de marca"] },
  { group: "Manutenção",            items: ["Equipamentos", "Veículos", "Predial", "Informática"] },
  { group: "Limpeza",               items: ["Produtos de limpeza", "Dedetização", "Lavanderia"] },
  { group: "Seguros",               items: ["Seguro empresarial", "Seguro veículo", "Seguro predial"] },
  { group: "Saúde Ocupacional",     items: ["PCMSO", "ASO", "Medicina do trabalho", "Exame admissional"] },
  { group: "Treinamentos",          items: ["Cursos", "Workshop", "Consultoria", "Capacitação"] },
  { group: "Investimentos",         items: ["Equipamentos", "Reformas", "Veículo empresa", "Expansão"] },
  { group: "Transferência Interna", items: ["Transferência entre contas", "Aplicação financeira", "Poupança"] },
  { group: "Estorno e Reembolso",   items: ["Estorno", "Chargeback", "Devolução", "Cancelamento"] },
  { group: "Comercial",             items: ["Comissão", "Representante", "Marketplace", "Corretagem"] },
  { group: "Presentes",             items: ["Brindes corporativos", "Presente cliente", "Floricultura"] },
  { group: "Outros",                items: ["Doação", "Despesa eventual"] },
];

export const INCOME_CATEGORY_GROUPS: CategoryGroup[] = [
  { group: "Vendas", items: ["Vendas à vista", "Vendas cartão de crédito", "Vendas cartão de débito", "Vendas PIX", "Vendas boleto", "Vendas online", "Vendas marketplace", "Vendas delivery"] },
  { group: "Serviços", items: ["Consultoria", "Manutenção", "Instalação", "Mensalidades", "Suporte técnico"] },
  { group: "Receitas Financeiras", items: ["Rendimento bancário", "Cashback", "Juros recebidos", "Aplicações"] },
  { group: "Aportes / Capital", items: ["Aporte sócio", "Capitalização", "Investimento"] },
  { group: "Transferências Internas", items: ["Transferência entre contas", "Movimentação interna"] },
  { group: "Reembolsos", items: ["Reembolso fornecedor", "Estorno", "Devolução"] },
  { group: "Empréstimos / Crédito", items: ["Empréstimo bancário", "Antecipação", "Financiamento"] },
  { group: "Outros Recebimentos", items: ["Venda de ativo", "Receita eventual", "Receita extraordinária"] }
];
