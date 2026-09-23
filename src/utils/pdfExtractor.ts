import * as pdfjsLib from "pdfjs-dist";

let initialized = false;

function init() {
  if (initialized) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).href;
  initialized = true;
}

export async function extractPdfText(file: File): Promise<string> {
  init();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ")
    );
  }
  return pages.join("\n");
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function normalizeCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatCnpj(digits: string): string {
  const d = digits.replace(/\D/g, "").padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function extractNotaInfo(text: string): {
  cnpj?: string;
  numeroNota?: string;
  tipo?: "royalties" | "marketing";
} {
  const cnpjMatch = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
  const notaMatch =
    text.match(/(?:NF[Se-]*|Nota\s+Fiscal)[^\d]{0,10}(\d+)/i) ??
    text.match(/N[°o\.]\s*(\d{3,})/i);
  const lower = text.toLowerCase();
  const tipo: "royalties" | "marketing" | undefined = lower.includes("royalt")
    ? "royalties"
    : lower.includes("marketing") || lower.includes("fundo")
    ? "marketing"
    : undefined;

  return {
    cnpj: cnpjMatch ? normalizeCnpj(cnpjMatch[0]) : undefined,
    numeroNota: notaMatch?.[1],
    tipo,
  };
}

export function extractHoleriteEntries(text: string): { nome?: string; valorLiquido?: number }[] {
  // Formato: cada holerite começa com "Assinatura do Funcionário".
  // Os dois primeiros valores BRL do bloco são: [Total Descontos, Valor Líquido].
  // Nome: código "0NNN NOME EM MAIÚSCULAS" seguido de "Folha".
  // O PDF repete cada holerite 2x (via empregador + empregado) — deduplica por nome.

  const blocks = text.split(/Assinatura\s+do\s+Funcion[aá]rio/i).filter((s) => s.trim().length > 20);

  const results: { nome?: string; valorLiquido?: number }[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    // Pega os dois primeiros valores BRL do bloco
    const brlMatches = [...block.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)];
    const valorLiquido =
      brlMatches[1]
        ? parseFloat(brlMatches[1][1].replace(/\./g, "").replace(",", "."))
        : undefined;

    // Nome: código 4 dígitos + nome em maiúsculas, antes de "Folha"
    const nomeMatch = block.match(/\b0\d{3}\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇ ]{3,}?)\s+Folha/);
    const nome = nomeMatch?.[1]?.trim();

    if (!nome) continue;
    if (seen.has(nome)) continue; // pula a cópia duplicada
    seen.add(nome);

    results.push({ nome, valorLiquido });
  }

  return results.length ? results : [{}];
}
