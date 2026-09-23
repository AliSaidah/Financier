import { BankId, Transaction } from "../types/finance";
import { applyAutoCategorizationRules } from "../data/autoCategorizationRules";
import { resolveExpenseCategory } from "../data/categoryResolver";

function cleanMemo(memo: string): string {
  return memo.replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

// ─── OFX payment-method detection ────────────────────────────────────────────

function detectOfxPaymentMethod(memo: string, trnType: string): string {
  const m = memo.toUpperCase();

  // PIX — detecta direção
  if (/\bPIX\b/.test(m)) {
    if (/ENVIAD[AO]|SA[IÍ]DA|PGTO|PAGAMENTO/.test(m)) return "Pix Enviado";
    if (/RECEBID[AO]|ENTRADA|RECEB/.test(m))           return "Pix Recebido";
    return "Pix";
  }

  // Cartão — crédito antes de débito para evitar falso-positivo em "DEBITO AUTOMATICO"
  if (/COMPRA\s+CR[EÉ]D|CART[AÃ]O\s+CR[EÉ]D|PARCELA\s+CR[EÉ]D|CR[EÉ]DITO\s+ROTATIVO/.test(m)) return "Cartão de Crédito";
  if (/COMPRA\s+D[EÉ]B|CART[AÃ]O\s+D[EÉ]B/.test(m))                                              return "Cartão de Débito";

  // Boleto
  if (/BOLETO/.test(m)) return "Boleto";

  // TED / DOC
  if (/\bTED\b/.test(m)) return "TED";
  if (/\bDOC\b/.test(m)) return "DOC";

  // Débito automático
  if (/D[EÉ]B(ITO)?\s+AUT|D[EÉ]BITO\s+EM\s+CONTA|DEBITADO\s+AUT/.test(m)) return "Débito Automático";

  // Tarifas e encargos
  if (/TARIFA|ANUIDADE|MANUTEN[CÇ][AÃ]O\s+DE\s+CONTA|COBRAN[CÇ]A\s+DE\s+SERV/.test(m)) return "Tarifa";

  // Cheque
  if (/\bCHEQUE\b|\bCHQ\b/.test(m)) return "Cheque";

  // Dinheiro / saque
  if (/\bSAQUE\b|\bATM\b|CAIXA\s+(24H|ELET)/.test(m)) return "Dinheiro";

  // Transferência genérica
  if (/TRANSFER[EÊ]NCIA|\bTRANSF\b/.test(m)) return "Transferência";

  // Fallback: TRNTYPE do OFX
  switch (trnType.toUpperCase()) {
    case "FEE":
    case "SRVCHG":     return "Tarifa";
    case "ATM":        return "Dinheiro";
    case "CHECK":      return "Cheque";
    case "XFER":
    case "DIRECTDEP":  return "Transferência";
    case "DIRECTDEBIT":return "Débito Automático";
    case "DEP":        return "Transferência";
    default:           return "Não informado";
  }
}

function sanitizeName(raw: string): string {
  return raw
    .replace(/^pix_(?:deb|cred)\s*/i, "")              // remove "Pix_deb", "Pix_cred"
    .replace(/^cx\d+\s*/i, "")                         // remove "Cx960966" prefix
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b\s*/g, "") // formatted CNPJ XX.XXX.XXX/XXXX-XX
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b\s*/g, "") // formatted CPF XXX.XXX.XXX-XX
    .replace(/\b\d{2}\.\d{3}\.\d{3}\b\s*/g, "")       // partial CNPJ root XX.XXX.XXX
    .replace(/\b\d{11}\b\s*/g, "")                     // raw CPF (11 digits)
    .replace(/\b\d{14}\b\s*/g, "")                     // raw CNPJ (14 digits)
    .replace(/^\d{4,10}\s+/, "")                       // leading short numeric codes
    .replace(/\s+/g, " ")
    .trim();
}

function extractOfxThirdParty(memo: string, nameRaw: string): string {
  const m = cleanMemo(memo);

  if (/^PIX\b/i.test(m)) {
    // Padrão BB/CEF: "PIX ENVIADO 01/01 12:00 NOME DO TERCEIRO"
    const withDateTime = m.match(/\d{2}\/\d{2}\s+\d{2}:\d{2}\s+(.+)$/i);
    if (withDateTime) return normalizeTitle(sanitizeName(withDateTime[1].trim()));
    // Padrão Itaú/Inter: "PIX ENVIADO - NOME" ou "PIX-RECEBIDO-NOME"
    const afterType = m.replace(/^PIX[\s-]*(ENVIADO|RECEBIDO|RECEB|SAIDA|ENTRADA)?[\s-]*/i, "").trim();
    if (afterType) return normalizeTitle(sanitizeName(afterType));
  }

  if (/BOLETO/i.test(m)) {
    const afterDash = m.split(/[-–]/).slice(1).join("-").trim();
    if (afterDash) return normalizeTitle(sanitizeName(afterDash));
  }

  if (/\bTED\b|\bDOC\b/i.test(m)) {
    // Padrão BB: "TED ENVIADA-BANCO ITAU-AG 0001-CC 123456-EMPRESA XYZ"
    const parts = m.split("-").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && !/^\d+$/.test(last)) return normalizeTitle(sanitizeName(last));
  }

  // NAME field é o mais confiável quando existe
  if (nameRaw) return normalizeTitle(sanitizeName(nameRaw));

  // Último recurso: tudo após o primeiro traço
  const afterDash = m.split(/[-–]/).slice(1).join("-").trim();
  return afterDash ? normalizeTitle(sanitizeName(afterDash)) : normalizeTitle(sanitizeName(m));
}

// ─── Sicredi-specific MEMO parser ────────────────────────────────────────────
// Sicredi formats:
// "RECEBIMENTO PIX-PIX_CRED[S]  CPF/CNPJ NOME"    → Pix Recebido
// "RECEBIMENTO PIX-CX{NUM}  CPF/CNPJ NOME"         → Pix Recebido
// "PAGAMENTO PIX-PIX_DEB   CPF/CNPJ NOME"          → Pix Enviado
// "PAGAMENTO PIX-CX{NUM}   CPF/CNPJ NOME"          → Pix Enviado
// "LIQUIDACAO BOLETO[-SICREDI]-{CODE} CNPJ NOME"   → Boleto
// "LIQUIDACAO BOLETO-          CNPJ NOME"           → Boleto (espaços após -)
// "DEBITO CONVENIOS-SHORTNAME ID {ID} NOME {CNPJ}" → Débito Automático
// "COMPRAS NACIONAIS-{CODE} LOJA    CIDADE  BR"    → Cartão de Débito
// "SICREDI DEBITO VISA/MASTER/ELO-{NUM}"           → Cartão de Débito
// "SICREDI CREDITO VISA/MASTER-{NUM}"              → Cartão de Crédito (estorno)
// "DEB.CTA.FATURA-{NUM}"                           → Fatura cartão
// "DEBITO ARRECADACAO-{TYPE}"                      → Arrecadação (DAS, DARF...)
// "CESTA DE RELACIONAMENTO / IOF / JUROS"          → Tarifa
// "INTEGR.CAPITAL SUBSCRITO-{NUM}"                 → Capital cooperativo

// Extrai o nome do terceiro de memos de PIX do Sicredi.
// Formato: "CPF_or_CNPJ [código_secundário_opcional] NOME [código_trailing]"
// Localiza o primeiro caractere alfabético e toma tudo a partir daí.
function extractSicrediPixName(afterPrefix: string): string {
  const nameStart = afterPrefix.search(/[A-Za-záéíóúâêîôûãõàçÁÉÍÓÚÂÊÎÔÛÃÕÀÇ]/);
  if (nameStart === -1) return normalizeTitle(sanitizeName(afterPrefix));
  const name = afterPrefix.slice(nameStart).replace(/\s+\d+\s*$/, "").trim();
  return normalizeTitle(name);
}

function parseSicrediMemo(memo: string): { thirdParty: string; paymentMethod: string } {
  const m = memo.trim();

  if (/^RECEBIMENTO PIX/i.test(m)) {
    const afterPrefix = m.replace(/^RECEBIMENTO PIX-(?:PIX_CRE[DS]?|CX\w+)\s*/i, "").trim();
    return { thirdParty: extractSicrediPixName(afterPrefix) || "Não informado", paymentMethod: "Pix Recebido" };
  }

  if (/^PAGAMENTO PIX/i.test(m)) {
    const afterPrefix = m.replace(/^PAGAMENTO PIX-(?:PIX_DEB|CX\w+)\s*/i, "").trim();
    return { thirdParty: extractSicrediPixName(afterPrefix) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  if (/^LIQUIDACAO BOLETO/i.test(m)) {
    // Suporta: "-SICREDI-{CODE}" e "-          CNPJ" (espaços antes do CNPJ)
    const afterCode = m.replace(/^LIQUIDACAO BOLETO(?:\s+SICREDI)?-\s*\S+\s*/i, "").trim();
    const name = extractSicrediPixName(afterCode) || normalizeTitle(sanitizeName(afterCode));
    return { thirdParty: name || "Não informado", paymentMethod: "Boleto" };
  }

  // "LIQ.COBRANCA SIMPLES-COB000003" — liquidação de boletos emitidos (recebimento)
  if (/^LIQ\.?\s?COBRANCA/i.test(m))
    return { thirdParty: "Boletos Recebidos", paymentMethod: "Boleto" };

  // "RECEB. COB HIBRIDA (I)-PIXCOBRAN {CNPJ}{NOME}" — boleto híbrido pago via Pix
  if (/^RECEB\.?\s?COB\s?HIBRIDA/i.test(m)) {
    const afterPrefix = m.replace(/^RECEB\.?\s?COB\s?HIBRIDA[^-]*-\s*(?:PIXCOBRAN)?\s*/i, "").trim();
    return { thirdParty: extractSicrediPixName(afterPrefix) || "Boletos Recebidos", paymentMethod: "Pix Recebido" };
  }

  // "TARIFA SERV.COBR.TITULOS-..." / "TARIFA BAIXA DE TITULOS-..."
  if (/^TARIFA/i.test(m))
    return { thirdParty: "Sicredi Tarifas", paymentMethod: "Tarifa" };

  if (/^DEBITO CONVENIOS/i.test(m)) {
    const shortName = m.replace(/^DEBITO CONVENIOS-/i, "").split(/\s+/)[0] ?? "";
    return { thirdParty: normalizeTitle(shortName) || "Débito Automático", paymentMethod: "Débito Automático" };
  }

  if (/^COMPRAS NACIONAIS/i.test(m)) {
    const afterCode = m.replace(/^COMPRAS NACIONAIS-\S+\s*/i, "").trim();
    const storeName = afterCode.replace(/\s{2,}.+$/, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(storeName)) || "Não informado", paymentMethod: "Cartão de Débito" };
  }

  if (/^SICREDI CREDITO/i.test(m))
    return { thirdParty: "Sicredi Cartão", paymentMethod: "Cartão de Crédito" };

  if (/^SICREDI DEBITO/i.test(m))
    return { thirdParty: "Sicredi Cartão", paymentMethod: "Cartão de Débito" };

  if (/^DEB\.CTA\.FATURA/i.test(m))
    return { thirdParty: "Fatura Sicredi", paymentMethod: "Débito Automático" };

  if (/^DEBITO ARRECADACAO/i.test(m)) {
    const taxName = m.replace(/^DEBITO ARRECADACAO-/i, "").split(/[\s-]/)[0] ?? "";
    return { thirdParty: normalizeTitle(taxName) || "Arrecadação", paymentMethod: "Boleto" };
  }

  if (/^CESTA DE RELACIONAMENTO|^IOF|^JUROS UTILIZ/i.test(m))
    return { thirdParty: "Sicredi Tarifas", paymentMethod: "Tarifa" };

  if (/^DEP DINHEIRO/i.test(m))
    return { thirdParty: "Depósito em Dinheiro", paymentMethod: "Dinheiro" };

  if (/^INTEGR\.CAPITAL\s+SUBSCRITO/i.test(m))
    return { thirdParty: "Sicredi Capital", paymentMethod: "Transferência" };

  const afterDash = m.split("-").slice(1).join("-").trim();
  return {
    thirdParty: afterDash ? normalizeTitle(sanitizeName(afterDash)) : normalizeTitle(sanitizeName(m)),
    paymentMethod: "Não informado",
  };
}

// ─── Itaú-specific MEMO parser ────────────────────────────────────────────────
// Itaú has no <NAME> field. MEMO is truncated (~20 chars) with trailing "DD MM":
// "PIX TRANSF WISSAM 30 04"     → PIX (direction = TRNTYPE)
// "PIX QRS UBER DO BRA30 04"    → PIX via QR code (always debit)
// "PAY ServF 30 04"              → card/payment
// "DEV PIX GEOVANNA RE06 05"    → PIX devolution (debit)
// "APLICACAO COFRINHOS"          → investment application
// "RESGATE CDB Cofrinhos"        → investment redemption

// Extrai o nome completo em memos do formato novo: o trecho antes do token
// "DD/MM" é um alias truncado; o nome completo vem depois dele.
// "SANTO S05/06 SANTO S S F LTDA 44.479..." → "SANTO S S F LTDA 44.479..."
function itauAfterDateToken(rest: string): string {
  const match = rest.match(/\d{2}\/\d{2}\s+(.+)$/);
  return (match ? match[1] : rest).trim();
}

function parseItauMemo(memo: string, trnType: string): { thirdParty: string; paymentMethod: string } {
  const m = memo.trim();
  // Strip trailing date "DD MM" (may be attached without space before DD)
  const withoutDate = m.replace(/\s*\d{2}\s+\d{2}\s*$/, "").trim();
  const isCredit = trnType.toUpperCase() === "CREDIT";

  // ── Formato novo (memo completo, com nome inteiro + CPF/CNPJ) ───────────
  // "PIX RECEBIDO {ALIAS}{DD/MM} {NOME COMPLETO} {CPF/CNPJ}"
  if (/^PIX RECEBIDO/i.test(m)) {
    const name = itauAfterDateToken(m.replace(/^PIX RECEBIDO\s*/i, ""));
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Pix Recebido" };
  }

  // "PIX ENVIADO {NOME COMPLETO} {CPF/CNPJ}"
  if (/^PIX ENVIADO/i.test(m)) {
    const name = itauAfterDateToken(m.replace(/^PIX ENVIADO\s*/i, ""));
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  // "PIX DEVOLVIDO {ALIAS}{DD/MM} {NOME COMPLETO} {CPF/CNPJ}" — devolução
  if (/^PIX DEVOLVIDO/i.test(m)) {
    const name = itauAfterDateToken(m.replace(/^PIX DEVOLVIDO\s*/i, ""));
    return {
      thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado",
      paymentMethod: isCredit ? "Pix Recebido" : "Pix Enviado",
    };
  }

  // "PAGAMENTOS PIX QR-CODE {NOME COMPLETO} {CNPJ}"
  if (/^PAGAMENTOS?\s+PIX\s+QR-?CODE/i.test(m)) {
    const name = m.replace(/^PAGAMENTOS?\s+PIX\s+QR-?CODE\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  // "BOLETOS RECEBIDOS  DD/MMS" — cobranças recebidas agrupadas do dia
  if (/^BOLETOS RECEBIDOS/i.test(m)) {
    return { thirdParty: "Boletos Recebidos", paymentMethod: "Boleto" };
  }

  // "RENDIMENTOS REND PAGO APLIC AUT MAIS" — rendimento da aplicação automática
  if (/^RENDIMENTOS/i.test(m)) {
    return { thirdParty: "Rendimentos de Aplicação", paymentMethod: "Transferência" };
  }

  // "BOLETO PAGO {ALIAS 12 chars} {NOME COMPLETO} {CNPJ}"
  if (/^BOLETO PAGO/i.test(m)) {
    const rest = m.replace(/^BOLETO PAGO\s*/i, "");
    // alias truncado tem largura fixa de 12 caracteres seguido de espaço
    const full = rest.length > 13 && rest[12] === " " ? rest.slice(13) : rest;
    return { thirdParty: normalizeTitle(sanitizeName(full)) || "Não informado", paymentMethod: "Boleto" };
  }

  // ── Formato antigo (memo truncado ~20 chars com "DD MM" no final) ───────
  if (/^PIX TRANSF/i.test(withoutDate)) {
    const name = withoutDate.replace(/^PIX TRANSF\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: isCredit ? "Pix Recebido" : "Pix Enviado" };
  }

  if (/^PIX QRS?/i.test(withoutDate)) {
    const name = withoutDate.replace(/^PIX QRS?\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  if (/^DEV PIX/i.test(withoutDate)) {
    const name = withoutDate.replace(/^DEV PIX\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  if (/^PAY\s/i.test(withoutDate)) {
    const name = withoutDate.replace(/^PAY\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Cartão de Débito" };
  }

  if (/^APLICA/i.test(withoutDate)) {
    const name = withoutDate.replace(/^APLICA[CÇ][AÃ]O\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Aplicação", paymentMethod: "Transferência" };
  }

  if (/^RESGATE/i.test(withoutDate)) {
    const name = withoutDate.replace(/^RESGATE\s*/i, "").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Resgate", paymentMethod: "Transferência" };
  }

  return {
    thirdParty: normalizeTitle(sanitizeName(withoutDate)) || "Não informado",
    paymentMethod: "Não informado",
  };
}

// ─── BB-specific MEMO parser ──────────────────────────────────────────────────
// BB MEMO formats:
// "PIX - RECEBIDO - DD/MM HH:MM [CNPJ/CPF] NOME"
// "PIX - ENVIADO - DD/MM HH:MM NOME"
// "PIX-ENVIO DEVOLVIDO - DD/MM HH:MM NOME"
// "PAGAMENTO DE BOLETO - NOME"
// "TAR[IFA] ... - TAR. AGRUPADAS - OCORRENCIA DD/MM/YYYY"
// "COBRANÇA COM REGISTRO [QRCODE]" / "CBR COM REGISTRO QRCODE"

function parseBBMemo(memo: string): { thirdParty: string; paymentMethod: string } {
  const m = memo.trim();

  // PIX Recebido
  if (/^PIX\s*-\s*RECEBIDO/i.test(m)) {
    const afterDt = m.replace(/^PIX\s*-\s*RECEBIDO\s*-\s*\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/i, "");
    return { thirdParty: normalizeTitle(sanitizeName(afterDt)) || "Não informado", paymentMethod: "Pix Recebido" };
  }

  // PIX Enviado
  if (/^PIX\s*-\s*ENVIADO/i.test(m)) {
    const afterDt = m.replace(/^PIX\s*-\s*ENVIADO\s*-\s*\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/i, "");
    return { thirdParty: normalizeTitle(sanitizeName(afterDt)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  // PIX Devolvido (é uma entrada)
  if (/^PIX[\s-]+ENVIO\s+DEVOLVIDO/i.test(m)) {
    const afterDt = m.replace(/^PIX[\s-]+ENVIO\s+DEVOLVIDO\s*-\s*\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/i, "");
    return { thirdParty: normalizeTitle(sanitizeName(afterDt)) || "Não informado", paymentMethod: "Pix Recebido" };
  }

  // PIX Agendado (executado) — débito
  if (/^PIX\s*-\s*AGENDAMENTO/i.test(m)) {
    const afterDt = m.replace(/^PIX\s*-\s*AGENDAMENTO\s*-\s*\d{2}\/\d{2}\s+\d{2}:\d{2}\s*/i, "");
    return { thirdParty: normalizeTitle(sanitizeName(afterDt)) || "Não informado", paymentMethod: "Pix Enviado" };
  }

  // "PGTO CONTA ÁGUA - SEMAE..." / "PAGTO CONTA TELEFONE - CLARO S.A." — convênios
  if (/^PA?GTO\s+CONTA/i.test(m)) {
    const name = m.split(" - ").slice(1).join(" - ").trim();
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Conta de Consumo", paymentMethod: "Boleto" };
  }

  // "PAGTO CARTÃO CRÉDITO - EMPRESARIAL VISA" — pagamento de fatura do cartão
  if (/^PA?GTO\s+CART/i.test(m)) {
    const name = m.split(" - ").slice(1).join(" - ").trim();
    const titled = normalizeTitle(sanitizeName(name));
    return { thirdParty: titled ? `Fatura Cartão ${titled}` : "Fatura Cartão", paymentMethod: "Débito Automático" };
  }

  // "SEG CRÉD PROTEG EMPRESA - BB SEGURO CRED PROT EMPR" — seguro de crédito
  if (/^SEG\s+CR/i.test(m)) {
    return { thirdParty: "BB Seguro Crédito Protegido", paymentMethod: "Débito Automático" };
  }

  // Boleto
  if (/^PAGAMENTO DE BOLETO/i.test(m)) {
    const name = m.split(" - ")[1]?.trim() ?? "";
    return { thirdParty: normalizeTitle(sanitizeName(name)) || "Não informado", paymentMethod: "Boleto" };
  }

  // Tarifas bancárias
  if (/^TARIFA|^TAR[\s.]/i.test(m)) {
    return { thirdParty: "BB Tarifas", paymentMethod: "Tarifa" };
  }

  // Cobranças recebidas (boletos emitidos pelo cliente)
  // Cobre "COBRANÇA COM REGISTRO", "CBR COM REGISTRO" e o memo curto "COBRANÇA"
  if (/COBRAN.{0,2}A\s+COM\s+REGISTRO|CBR\s+COM\s+REGISTRO|^COBRAN.{1,2}A\s*$/i.test(m)) {
    return { thirdParty: "Cobrança Bancária", paymentMethod: "Boleto" };
  }

  // Fallback
  const afterDash = m.split(/\s+-\s+/).slice(1).join(" - ").trim();
  return {
    thirdParty: afterDash ? normalizeTitle(sanitizeName(afterDash)) : normalizeTitle(sanitizeName(m)),
    paymentMethod: "Não informado",
  };
}

// ─── Inter-specific MEMO parser ───────────────────────────────────────────────
// Inter tem <NAME> limpo (Title Case). MEMO define o tipo:
// "Pix enviado: \"Cp :XXXX-Nome\""            → Pix Enviado
// "Pix recebido: \"Cp :XXXX-Nome\""           → Pix Recebido
// "Pix enviado devolvido: \"...\""            → devolução (entra como crédito)
// "Compra no debito: \"No estabelecimento LOJA   CIDADE BRA\"" → Cartão de Débito
// "Boleto de cobranca recebido: \"112/...\""  → Boleto (recebido)
// "Pagamento efetuado: \"NOME\""              → pagamento de convênio/boleto
// "SIMPLES NACIONAL" / tributos               → usa o NAME

function parseInterMemo(memo: string, name: string): { thirdParty: string; paymentMethod: string } {
  const m = memo.trim();
  const clean = (s: string) => normalizeTitle(sanitizeName(s));

  if (/^Pix\s+recebido/i.test(m) || /^Pix\s+enviado\s+devolvido/i.test(m))
    return { thirdParty: clean(name) || "Não informado", paymentMethod: "Pix Recebido" };

  if (/^Pix\s+enviado/i.test(m))
    return { thirdParty: clean(name) || "Não informado", paymentMethod: "Pix Enviado" };

  if (/^Compra\s+no\s+d[eé]bito/i.test(m)) {
    // NAME vem como "LOJA          CIDADE BRA" (cidade após 2+ espaços)
    const store = name.replace(/\s{2,}.+$/, "").replace(/\s+BRA\s*$/i, "").trim();
    return { thirdParty: clean(store) || "Não informado", paymentMethod: "Cartão de Débito" };
  }

  if (/^Compra\s+no\s+cr[eé]dito/i.test(m)) {
    const store = name.replace(/\s{2,}.+$/, "").replace(/\s+BRA\s*$/i, "").trim();
    return { thirdParty: clean(store) || "Não informado", paymentMethod: "Cartão de Crédito" };
  }

  if (/^Boleto\s+de\s+cobran/i.test(m))
    return { thirdParty: clean(name) || "Boletos Recebidos", paymentMethod: "Boleto" };

  if (/^Pagamento\s+efetuado/i.test(m))
    return { thirdParty: clean(name) || "Não informado", paymentMethod: "Boleto" };

  // Fallback (SIMPLES NACIONAL, DARF, etc.) — usa o NAME
  return {
    thirdParty: name ? clean(name) : clean(m),
    paymentMethod: "Não informado",
  };
}

// ─── Nubank-specific MEMO parser ─────────────────────────────────────────────
// Nubank não tem <NAME> — tudo vem no <MEMO> em formato fixo:
// "Transferência recebida/enviada pelo Pix - NOME - CPF/CNPJ - BANCO Agência: X Conta: Y"
// "Compra no débito/crédito - ESTABELECIMENTO"

function parseNubankMemo(memo: string): { thirdParty: string; paymentMethod: string } {
  const m = memo.trim();

  // Divide em " - " para isolar o nome (sempre índice 1)
  const parts = m.split(" - ");
  const rawName = parts[1]?.trim() ?? "";

  // Limpa nomes de cartão no formato "LOJA*Detalhes 00"
  const cleanName = (s: string) =>
    normalizeTitle(sanitizeName(s.replace(/\s*\*.*$/, "").trim()));

  if (/^Transferência recebida pelo Pix/i.test(m))
    return { thirdParty: cleanName(rawName) || "Não informado", paymentMethod: "Pix Recebido" };

  if (/^Transferência enviada pelo Pix/i.test(m))
    return { thirdParty: cleanName(rawName) || "Não informado", paymentMethod: "Pix Enviado" };

  if (/^Compra no débito/i.test(m))
    return { thirdParty: cleanName(rawName) || "Não informado", paymentMethod: "Cartão de Débito" };

  if (/^Compra no crédito/i.test(m))
    return { thirdParty: cleanName(rawName) || "Não informado", paymentMethod: "Cartão de Crédito" };

  if (/^Pagamento de fatura/i.test(m))
    return { thirdParty: "Fatura Nubank", paymentMethod: "Débito Automático" };

  // Fallback — usa o que vier após o primeiro " - "
  return {
    thirdParty: rawName ? cleanName(rawName) : normalizeTitle(sanitizeName(m)),
    paymentMethod: "Não informado",
  };
}

// ─── OFX Parser ──────────────────────────────────────────────────────────────

function decodeOfxBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // UTF-8 BOM (EF BB BF)
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  // Declaração explícita no header OFX (primeiros 512 bytes)
  const peek = new TextDecoder("latin1").decode(buffer.slice(0, 512));
  if (/CHARSET\s*:\s*UTF-8|ENCODING\s*:\s*UTF-8/i.test(peek)) {
    return new TextDecoder("utf-8").decode(buffer);
  }
  if (/CHARSET\s*:\s*1252|CHARSET\s*:\s*WINDOWS/i.test(peek)) {
    return new TextDecoder("windows-1252").decode(buffer);
  }

  // Sem declaração: tenta UTF-8 estrito — bytes inválidos indicam Windows-1252
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function extractOfxField(block: string, tag: string): string {
  // Handles XML format: <TAG>value</TAG>
  const xml = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)<\\/${tag}>`, "i"));
  if (xml) return xml[1].trim();
  // Handles SGML format: <TAG>value\n (no closing tag)
  const sgml = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return sgml ? sgml[1].trim() : "";
}

function parseOfxDate(raw: string): string {
  // OFX date: YYYYMMDD[HHMMSS][.XXX][+/-HH:MM]
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseOfxAmount(raw: string): number {
  // OFX amounts use period as decimal separator (e.g. -1500.00)
  const cleaned = raw.replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractOfxBlocks(ofxText: string): string[] {
  // Try XML-style OFX first (has closing </STMTTRN> tags)
  const xmlBlocks = ofxText.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi);
  if (xmlBlocks?.length) return xmlBlocks;

  // SGML-style OFX: no closing tags — split on <STMTTRN> and cut before next block marker
  const parts = ofxText.split(/<STMTTRN>/i);
  return parts.slice(1).map((part) => {
    const end = part.search(/<\/STMTTRNLIST>|<\/BANKMSGSRSV1>|<STMTTRN>/i);
    return end >= 0 ? part.slice(0, end) : part;
  });
}

// Extrai o saldo contábil da conta (LEDGERBAL) — o número que bate com o banco.
export function extractOfxBalance(buffer: ArrayBuffer): { amount: number; dateAsOf: string } | null {
  const text = decodeOfxBuffer(buffer);
  // Isola o bloco LEDGERBAL (evita pegar AVAILBAL ou valores de transação)
  const ledgerMatch = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>)/i);
  const block = ledgerMatch ? ledgerMatch[1] : text;
  const balRaw = extractOfxField(block, "BALAMT");
  if (!balRaw) return null;
  const dtRaw = extractOfxField(block, "DTASOF");
  return { amount: parseOfxAmount(balRaw), dateAsOf: dtRaw ? parseOfxDate(dtRaw) : "" };
}

const BB_FLAG_TERMS = ["bb giro", "pronampe", "seg cred"];

export function parseOfxFile(buffer: ArrayBuffer, bankId?: BankId | null): Transaction[] {
  const ofxText = decodeOfxBuffer(buffer);
  const blocks = extractOfxBlocks(ofxText);
  const flagTerms = bankId === "bb" ? BB_FLAG_TERMS : [];

  return blocks.map((block, idx) => {
    const dtPosted = extractOfxField(block, "DTPOSTED");
    const trnAmtRaw = extractOfxField(block, "TRNAMT");
    const trnType = extractOfxField(block, "TRNTYPE");
    const nameRaw = extractOfxField(block, "NAME");
    const memoRaw = extractOfxField(block, "MEMO");
    const fitId = extractOfxField(block, "FITID");

    const amount = parseOfxAmount(trnAmtRaw);

    const { thirdParty, paymentMethod } =
      bankId === "bb"      ? parseBBMemo(memoRaw) :
      bankId === "itau"    ? parseItauMemo(memoRaw, trnType) :
      bankId === "sicredi" ? parseSicrediMemo(memoRaw) :
      bankId === "inter"   ? parseInterMemo(memoRaw, nameRaw) :
      bankId === "nubank"  ? parseNubankMemo(memoRaw) :
      {
        thirdParty:    extractOfxThirdParty(memoRaw, nameRaw) || "Não informado",
        paymentMethod: detectOfxPaymentMethod(memoRaw, trnType),
      };

    // Remove acentos antes de comparar ("SEG CRÉD" deve casar com "seg cred")
    const normalizedMemo = memoRaw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const foundFlag = flagTerms.find((term) => normalizedMemo.includes(term));

    // Se a forma de pagamento for "Tarifa" (detectada do MEMO/TRNTYPE), categorizar diretamente
    // como Tarifas Bancárias sem depender do thirdParty limpo (que pode ter sido simplificado demais)
    const autoCategory = amount < 0
      ? (paymentMethod === "Tarifa" ? "Tarifas Bancárias" : applyAutoCategorizationRules(thirdParty))
      // Receita: rendimentos de aplicação ganham categoria fixa "Rendimentos"
      // (sempre fora da análise — contam apenas no saldo)
      : (/rendiment/i.test(memoRaw) ? "Rendimentos" : null);
    const resolved = amount < 0 && autoCategory ? resolveExpenseCategory(autoCategory) : null;

    return {
      id: `${Date.now()}-ofx-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      fitId: fitId || undefined,
      date: parseOfxDate(dtPosted),
      amount,
      paymentMethod,
      thirdParty,
      category:        resolved?.name ?? autoCategory ?? "Sem categoria",
      categoryId:      resolved?.id,
      autoCategorized: autoCategory !== null,
      flagged:         Boolean(foundFlag),
      flagReason:      foundFlag ? `Revisar transação (${foundFlag.toUpperCase()})` : undefined
    };
  });
}
