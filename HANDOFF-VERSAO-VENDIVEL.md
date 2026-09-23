# Financier — Handoff para a versão vendível

> Documento para a Claude do outro PC. Contexto completo do projeto + a tarefa principal:
> **remover a feature "Contas a pagar/receber"** para gerar a versão comercial.
> Este PC de origem continua com a versão de teste/uso pessoal (com Contas). O PC destino
> será a **versão vendível SEM Contas**.

---

## 1. O que é o app

**Financier — "Fechamento de caixa inteligente"**. App desktop para donos de
franquias/lojas fecharem o caixa a partir de **extratos bancários OFX** brasileiros.
Fluxo: importa OFX → categoriza automaticamente → separa recebimentos/pagamentos →
analisa (CF/CV, DRE) → gera relatórios (PDF/Excel). Multiusuário (uma "empresa/loja" por
usuário) + Painel Gerencial consolidando todos.

Público-alvo comercial: contadores/gestores de franquias. Comunicação do dono em
**português brasileiro**, respostas curtas e diretas, "heurística razoável > perfeição",
testa pelo `.exe` gerado (não pelo dev server).

---

## 2. Stack

- **Tauri v2** (2.11.2) — shell desktop (Rust + WebView2)
- **React 18** + **TypeScript** + **Vite 6**
- **Tailwind CSS**
- **Zustand** com middleware `persist` (localStorage)
- **Framer Motion** (transições de página)
- **jsPDF** + **html2canvas** (relatórios PDF)
- **lucide-react** (ícones)
- Excel: **ainda não implementado** (stub — ver §10)

---

## 3. Como rodar e buildar (Windows)

```bash
npm install
npm run dev:web          # dev no browser (rápido) — mas o dono testa no .exe
npm run tauri build      # gera o instalador .exe
.\node_modules\.bin\tsc.cmd --noEmit   # type-check (rodar SEMPRE antes de buildar)
```

O comando de build usado neste projeto (PowerShell, em background):
```
Set-Location "<raiz do projeto>"; npm run tauri build
```

**Saída do instalador:**
```
src-tauri/target/release/bundle/nsis/Financier_0.1.0_x64-setup.exe
```

### ⚠️ Gotcha de build no Windows 11 — Smart App Control (SAC)
Se o build Rust falhar com `os error 4551` / "can't find crate for tauri", a causa é o
**Smart App Control** do Windows bloqueando a execução de build-scripts do Rust.
**Não altere configurações de segurança por conta própria** — oriente o dono a desativar o
SAC manualmente (Segurança do Windows → Controle Inteligente de Aplicativos). Foi o que
resolveu na máquina de origem.

Obs.: o projeto **não é um repositório git** — faça backup por cópia de pasta antes de
mudanças grandes.

---

## 4. Modelo de dados e persistência

- **localStorage key `financier-store`** (Zustand persist) — estado global: usuários, aba
  ativa, transações do usuário ativo, filtros, categorias custom, histórico, config CF/CV,
  saldo do banco, exclusões da análise **e (na versão de teste) as contas**.
- **Isolamento por usuário**: o usuário ativo fica no estado; os demais ficam em
  `localStorage["financier-data-${userId}"]`, salvos ao trocar de usuário (`switchUser`).
- **Livro-caixa contínuo**: cada upload de OFX **acumula** (não substitui). Sem modal de
  conflito. `cleanLedger` remove duplicatas herdadas de versões antigas do parser
  preservando a categorização manual.
- **Identidade da transação**: `fitId` (FITID do OFX) é a chave estável.
- **Dedup por multiset de composite** (`duplicateDetector.ts` → `mergeWithoutDuplicates`):
  a identidade é `date|amount|thirdParty` e o merge mantém a **multiplicidade** — o resultado
  tem, por composite, `max(qtd atual, qtd recebida)`. Motivo: o **FITID de alguns bancos
  (ex.: Itaú) é sintético** (`AAAAMMDD`+sequência do dia) e muda quando o extrato é rebaixado
  mais tarde, então dedup por FITID deixava passar reimportações e duplicava. Este esquema
  torna reimportar um extrato atualizado **idempotente**, preservando duplicatas legítimas
  que já vêm juntas num mesmo arquivo (importação nova → composite ainda não existe → entram
  as 2). ⚠️ `cleanLedger` (higienização no rehydrate) NÃO colapsa composites repetidos de
  propósito (não dá pra distinguir dup legítima de reimport em dados já salvos); duplicatas
  antigas já persistidas devem ser removidas na mão (botão ocultar).
- **Datas**: sempre `new Date(ano, mes-1, dia)` (meia-noite local). Nunca
  `new Date("YYYY-MM-DD")` (bug de fuso UTC-3 muda o mês). `tx.date` é `"YYYY-MM-DD"`.

---

## 5. Arquitetura — arquivos-chave

```
src/
  App.tsx                        # orquestrador: routing por aba, upload, aplica regras de categoria, footer de relatórios
  types/finance.ts               # BankId, AppTab, Transaction, HistoryEntry, BankBalance, CategoryRule(s), Conta*
  store/useFinancierStore.ts     # Zustand + persist; users, ledger, categoryRules, contas*, categorias, etc.
  data/
    constants.ts                 # BANKS, EXPENSE_CATEGORIES (31 canônicas), *_CATEGORY_GROUPS, PAYMENT_METHODS
    autoCategorizationRules.ts   # CATEGORIZATION_RULES + applyAutoCategorizationRules() (regras GLOBAIS embutidas)
    categoryResolver.ts          # resolveExpenseCategory() → {id, name} canônico
  utils/
    csvParser.ts                 # parseOfxFile(buffer, bankId) — parsers por banco (nome enganoso: é OFX, não CSV)
    duplicateDetector.ts         # mergeWithoutDuplicates() (multiset), cleanLedger()
    categoryRules.ts             # (NOVO) memória de categorias por perfil: ruleKey/learnRule/applyRule/rankOptions/buildRulesFromTransactions
    summaryCalculator.ts         # calculateSummary() — receitas/despesas, CF/CV, exclusões
    blacklist.ts                 # filtra transações internas por banco
    excelExporter.ts             # STUB (alert) — Excel ainda não feito
    pdfFromElement.ts            # gera PDF A4 de um DOM com paginação por [data-pdf-block]
  components/
    Sidebar.tsx                  # abas de navegação
    TransactionTable.tsx         # tabela (categoria via portal, CF/CV, ignorar, seleção múltipla, chips de sugestão)
    CategorySelector.tsx         # dropdown de categoria (createPortal + position fixed)
    CategoryRulesModal.tsx       # (NOVO) tela "Categorias salvas": ver/fixar/excluir regras de memória
    BankLogo.tsx                 # BANK_META (logo/cor por banco)
    CfCvSetupModal.tsx           # config inicial de Conta Fixa vs Conta Variável (CF/CV) — NÃO é a feature Contas
    MovimentacaoReport.tsx       # template PDF de movimentação diária
    MovimentacaoModal.tsx        # modal: escopo (entradas/saídas/ambos) + intervalo
    ContaModal.tsx               # [FEATURE CONTAS] modal criar/editar conta (+ parcelamento)
    ContasReport.tsx             # [FEATURE CONTAS] template PDF de contas
  pages/
    Upload.tsx                   # seleção de banco + drag-drop OFX
    Recebimentos.tsx             # tabela de entradas (amount >= 0) + botão "Categorias salvas"
    Pagamentos.tsx               # tabela de saídas (amount < 0) + CF/CV + botão "Categorias salvas"
    Resumo.tsx                   # "Análise": toggle Simples (padrão) / Detalhada (DRE, CF/CV, comparativos)
    Painel.tsx                   # Painel Gerencial: consolida todos os usuários (mini-DRE, drilldowns)
    Historico.tsx                # histórico de uploads agrupado por mês
    Contas.tsx                   # [FEATURE CONTAS] contas a pagar/receber
```
`*` = itens ligados à feature **Contas**, que serão removidos (ver §11).
(Obs.: existe um `pages/Analise.tsx` legado não usado — a página ativa é `Resumo.tsx`, roteada como aba `resumo` e titulada "Análise".)

---

## 6. Bancos suportados (5)

`BankId = "bb" | "itau" | "sicredi" | "inter" | "nubank"`. Cada banco precisa estar em
**3 lugares** (além do parser):
1. `data/constants.ts` → `BANKS`
2. `components/BankLogo.tsx` → `BANK_META` (abbr, cor, domínio do favicon)
3. `pages/Historico.tsx` → `BANK_COLORS`

Parser por banco em `utils/csvParser.ts`: `parseBBMemo`, `parseItauMemo`,
`parseSicrediMemo`, `parseInterMemo(memo, name)`, `parseNubankMemo(memo)`. Roteados em
`parseOfxFile` por `bankId === "..."`.

**Regras do parser OFX:**
- Auto-detecta encoding (UTF-8 BOM, CHARSET header, senão tenta UTF-8 estrito → fallback
  Windows-1252).
- `sanitizeName` + `normalizeTitle` limpam CPF/CNPJ, prefixos, cidade/"BRA" (Inter põe
  "LOJA   CIDADE BRA" no NAME, separado por 2+ espaços).
- Nubank **não tem `<NAME>`** — tudo vem no `<MEMO>` em formato fixo.
- `LEDGERBAL` é lido como saldo do banco (`bankBalance`).
- Rendimentos de aplicação → categoria fixa `"Rendimentos"` (sempre fora da análise,
  conta só no saldo).

---

## 7. Categorização automática (importante)

Roda **apenas para despesas** (`amount < 0`) em `parseOfxFile`; receitas só ganham
`"Rendimentos"` quando o MEMO casa `/rendiment/i`.

- `data/autoCategorizationRules.ts`: `CATEGORIZATION_RULES` (centenas de regras
  `{ keyword, category, excludeIf[], priority: 1|2|3 }`). `applyAutoCategorizationRules(thirdParty)`
  retorna o nome/alias da categoria ou `null`. Ordena por prioridade ASC, depois keyword
  mais longa primeiro. `excludeIf` bloqueia se algum termo aparecer no texto.
- **Matching de prefixo** (ajuste recente): regras **prioridade ≤ 2 com keyword de ≥5
  letras** casam a keyword como **prefixo** de palavra maior — cobre nomes colados/plurais
  reais de extrato ("AutoPostoJardim", "IFOODCOM", "Supermercados", "Batatas"). Regras
  prioridade 3 ou keywords curtas mantêm **fronteira estrita** (evita "gas"→gastronomia,
  "oi"→oiapoque). Há um `STRICT_PREFIX_DENYLIST = {claro, shell, graal}` que força fronteira
  estrita mesmo qualificando (senão "Montes Claros" viraria Internet, etc.).
- `data/categoryResolver.ts`: `resolveExpenseCategory(text)` mapeia nome/ID/alias → categoria
  canônica `{ id, name }` (via `EXPENSE_CATEGORIES`).

**Pendências combinadas de categorização** (não feito ainda): melhorar de forma geral;
possivelmente rodar auto-cat também para receitas. Fica para depois.

---

## 8. CF/CV, análise e memória de categoria

- **CF/CV** (Conta Fixa / Conta Variável): `fixedCategoryIds` no store marca quais
  categorias são fixas. `CfCvSetupModal` faz a config inicial. `summaryCalculator.ts`
  calcula. ⚠️ **CF/CV NÃO é a feature "Contas" — não confundir na remoção.**
- **Análise (aba Resumo, titulada "Análise") — Simples vs Detalhada** (toggle no topo,
  abre na **Simples** por padrão):
  - **Simples**: 3 cartões (Recebeu / Gastou / Sobrou no mês) + "no que mais gastou" e
    "de onde veio" (rankings clicáveis). Feito pro cliente leigo ("onde vejo quanto gastei").
  - **Detalhada**: o conteúdo antigo — "Saldo Previsto" (entradas − saídas de TODO o
    livro-caixa, acumulado, começa do zero no 1º extrato), mini-DRE, CF/CV clicável,
    comparativos, "Fora da análise" (`excludedCategoryIds`, `ALWAYS_EXCLUDED = {Rendimentos}`).
- **Memória de categoria (NOVO — regras persistidas por perfil)** — `utils/categoryRules.ts`
  + store `categoryRules: CategoryRules`. Substitui a memória antiga (que era derivada do
  histórico e sumia ao limpar dados):
  - **Write-through**: `updateTransactionCategory` chama `learnRule` → grava
    `terceiro → {categoria, count, amountSum}` na chave `${direction}|${thirdParty.lower}`.
    **Persiste** (partialize + por-usuário) — sobrevive a limpar dados / apagar histórico.
  - **No upload** (`App.tsx` usa `applyRule`): terceiro com **1 categoria** → aplica sozinho
    (`fromMemory`); **fixado** (`pinned`) → aplica a fixada; **várias categorias** → deixa
    "Sem categoria" + `memoryConflict` **ranqueado por proximidade de valor** (`rankOptions`).
  - **Sugestões clicáveis** na `TransactionTable` (chips âmbar a partir de `memoryConflict`).
  - **Tela "Categorias salvas"** (`CategoryRulesModal`, botão em Recebimentos/Pagamentos):
    ver/fixar/excluir regras. Ações no store: `setCategoryRulePinned`, `deleteCategoryRule`.
  - **Migração/seed**: `buildRulesFromTransactions` semeia regras da categorização manual já
    existente (roda no `onRehydrateStorage`/`applyUserData` quando `categoryRules` vazio) —
    só aprende de `autoCategorized === false` (não memoriza as regras globais embutidas).
  - **Decisão de design**: as regras são **por perfil** (não compartilhadas entre os perfis
    do mesmo sistema) — evita colisão de nome e conflito cruzado. As regras GLOBAIS embutidas
    (`autoCategorizationRules.ts`) é que dão o baseline compartilhado. (Compartilhar como
    "pool de sugestão" entre perfis foi discutido e ficou para depois.)

---

## 9. Sistema de relatórios PDF

- `utils/pdfFromElement.ts` → `generatePdfFromElement(el, fileName)`: traz um DOM
  renderizado off-screen para a viewport, captura com html2canvas (scale 2, fundo branco),
  fatia em páginas A4 **sem cortar** elementos marcados com `[data-pdf-block]`.
- Templates são componentes off-screen via `createPortal` (`ContasReport`,
  `MovimentacaoReport`), acionados por um `ref` + 2× `requestAnimationFrame` antes de
  capturar.
- **Relatório de movimentação diária (NOVO)**: botão footer "Gerar relatório" (em
  Recebimentos/Pagamentos/Análise) abre dropdown → **Planilha Excel** ou **Relatório de
  movimentação**. O de movimentação abre `MovimentacaoModal` (escopo entradas/saídas/ambos
  + intervalo De/Até, padrão = 1ª e última data do livro-caixa) e gera PDF agrupado por dia
  com totais diários e resumo do período. Usa o livro-caixa inteiro filtrado pelo intervalo
  (não fica preso ao mês).

---

## 10. Estado atual / pendências conhecidas

- **Excel export é um STUB** (`utils/excelExporter.ts` só dá `alert`). Crítico para vender —
  precisa implementar (ex.: SheetJS/ExcelJS) OU esconder a opção Excel do dropdown na versão
  vendível até estar pronto.
- **Tabela de Recebimentos "tremendo"** (flicker) — bug de UI reportado, ainda não
  investigado. Suspeita: `.sort()` mutando array de props em render, ou jitter de
  virtualização. Vale checar `TransactionTable.tsx`.
- **Migração para SQLite** — desejada no futuro (extratos/regras/categorias separados),
  adiada.
- Categorização automática: melhoria geral pendente (ver §7).
- **Saldo inicial configurável** — combinado com o dono, EM ANDAMENTO. O "Saldo Previsto"
  hoje soma entradas − saídas de todo o livro-caixa mas **começa do zero no 1º extrato** (não
  inclui o que já havia na conta antes). Adicionar um campo de saldo inicial por perfil para
  bater exatamente com o extrato do banco.
- **Compartilhar memória de categoria como "pool de sugestão" entre perfis** — discutido,
  adiado (dono vai pensar). Hoje as regras são por perfil.

### Já resolvido hoje (2026-07-14) — para referência
- **Duplicação por reimport** (FITID sintético do Itaú/Inter/BB) → dedup virou multiset por
  composite (ver §4). Idempotente ao rebaixar extrato atualizado.
- **Categorização** de vários terceiros reais (ifood/autoposto/supermercados/salgaderia/
  batata/bolos/serv festa/financiamento) via matching de prefixo + regras novas (ver §7).
- **Nubank** readicionado (5 bancos). **Parcelamento** na aba Contas (some com a remoção de
  Contas). **Relatório de movimentação** (§9). **Análise Simples/Detalhada** e **memória de
  categoria persistente** (§8).

---

## 11. ⭐ TAREFA PRINCIPAL: remover a feature "Contas a pagar/receber"

A versão vendível é **idêntica à atual, MENOS a aba Contas e tudo relacionado**.

### 11.1 O que é "Contas"
Aba onde o usuário cadastra manualmente contas a pagar/receber, com vencimento, status
(aberto/quitado), recorrência mensal, **parcelamento**, e gera relatório PDF. Estado
próprio no store (global, não é por-usuário).

### 11.2 Arquivos para DELETAR por completo
- `src/pages/Contas.tsx`
- `src/components/ContaModal.tsx`
- `src/components/ContasReport.tsx`
- `src/components/ContasReportConsolidado.tsx` (relatório de contas consolidado de todos os perfis)
- `src/components/ContasReportModal.tsx` (modal de configuração do relatório de contas: perfil/tipo/status/período)

### 11.3 Arquivos para EDITAR (remover trechos)

**`src/types/finance.ts`**
- Remover a `interface Conta { ... }` inteira.
- No `AppTab`, remover `"contas"` da união:
  `"upload" | "recebimentos" | "pagamentos" | "resumo" | "painel" | "historico"`.

**`src/store/useFinancierStore.ts`**
- No import (linha ~3): tirar `Conta` de `{ AppTab, BankBalance, BankId, Conta, HistoryEntry, Transaction }`.
- Remover do **estado**: o campo `contas: Conta[]` (aparece na interface do store e como
  `contas: []` na inicialização).
- Remover as **4 actions**: `addConta`, `updateConta`, `deleteConta`, `toggleContaQuitado`
  (assinaturas na interface + implementações).
- Remover o método **`getAllUsersContas`** (interface + implementação) — usado só pelo
  relatório consolidado de contas.
- Remover `contas: state.contas` do **`partialize`** (e `contas` do `UserData` /
  `saveUserData` / `applyUserData` se quiser limpeza total — opcional, não quebra nada).
- Se `clearData` (ou qualquer migração/rehydrate) mencionar `contas`, remover essa
  referência também.

**`src/App.tsx`**
- Remover `import { ContasPage } from "./pages/Contas";`
- Remover o bloco de rota `{activeTab === "contas" && (<motion.div ...><ContasPage /></motion.div>)}`.
- Remover `contas: "Contas"` de `currentTitle`.
- Nos 3 guards que têm `&& activeTab !== "contas"` (top bar `onClearAll`/`onClearCategories`
  e o footer de relatórios), **tirar o `&& activeTab !== "contas"`** — senão o TS acusa
  comparação sem overlap (o literal não existe mais no tipo).

**`src/components/Sidebar.tsx`**
- Remover a entrada da aba: `{ id: "contas", label: "Contas", icon: <Wallet size={16} /> }`.
- Se `Wallet` não for usado em mais nada no arquivo, remover o import dele.

**`src/lib/formatters.ts`** (opcional)
- `splitParcelas` só era usado pelo `ContaModal` (parcelamento). Pode remover como limpeza.
  `addMonthsISO` vivia dentro de `Contas.tsx` (já some com o arquivo).

### 11.4 ⚠️ O que NÃO mexer (falsos positivos com a palavra "conta")
Estes usam "Conta" mas **não** são a feature Contas — **manter intactos**:
- `CfCvSetupModal.tsx` e `TransactionTable.tsx`: "Conta Fixa (CF)" / "Conta Variável (CV)"
  → é o sistema **CF/CV**.
- `data/constants.ts`: subitens "Conta de água", "Conta de energia" → categorias.
- `utils/csvParser.ts`: label "Conta de Consumo" → parser.
- Textos de parser tipo "... Conta: Y" em comentários.

### 11.5 Verificação
1. `.\node_modules\.bin\tsc.cmd --noEmit` → **zero erros** (pega imports órfãos, `"contas"`
   residual, comparações sem overlap).
2. `npm run tauri build` → gera o `.exe`.
3. Abrir o app: a aba **Contas some da sidebar**, navegação funciona, nenhuma referência
   quebrada. localStorage antigo com `contas` é inofensivo (o campo some do partialize e é
   ignorado).

---

## 12. Convenções e preferências do dono

- Responder em **português brasileiro**, curto e direto.
- Testar no **`.exe`** (`npm run tauri build`), não no dev web.
- **Nunca** `new Date("YYYY-MM-DD")` — usar `new Date(ano, mes-1, dia)`.
- Formatação de dinheiro sempre via `lib/formatters.ts` (`toCurrencyBRL`, `digitsToBRLInput`,
  `parseBRLInput`, `numberToBRLInput`) — inputs formatam centavos-da-direita.
- Dropdowns dentro de tabelas: `createPortal` + `getBoundingClientRect` + `position: fixed`.
- Antes de features grandes: backup (cópia de pasta — não há git) e atualizar este handoff.
- Não alterar configurações de segurança do Windows por conta própria (ver SAC, §3).
