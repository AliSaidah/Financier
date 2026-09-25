// Gera um PDF A4 a partir de um elemento DOM, com paginação consciente de blocos:
// nenhum elemento marcado com [data-pdf-block] é cortado entre páginas.

export async function generatePdfFromElement(el: HTMLElement, fileName: string): Promise<void> {
  // Traz o elemento (renderizado off-screen) para a viewport para capturar.
  const prev = {
    position: el.style.position, left: el.style.left, top: el.style.top,
    opacity: el.style.opacity, zIndex: el.style.zIndex,
  };
  el.style.position = "fixed";
  el.style.left     = "0";
  el.style.top      = "0";
  el.style.opacity  = "1";
  el.style.zIndex   = "9999";

  // Espera as fontes (Inter vem do Google Fonts, assíncrono) terminarem de
  // carregar — capturar antes disso faz o html2canvas desenhar com a fonte
  // de fallback ainda trocando, o que sai com letras deformadas/"tortas".
  try {
    await Promise.race([
      document.fonts.ready,
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* document.fonts pode não existir em ambientes muito antigos */ }

  // Dois frames para o browser pintar com os estilos corretos
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const elW = el.offsetWidth  || 794;
  const elH = el.scrollHeight || el.offsetHeight;

  const canvas = await html2canvas(el, {
    scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
    width: elW, height: elH, windowWidth: elW, scrollX: 0, scrollY: 0,
  });

  // Bordas dos blocos inquebráveis (em px de canvas), relativas ao topo do elemento
  const factor = canvas.width / elW;
  const elTop  = el.getBoundingClientRect().top;
  const blocks = Array.from(el.querySelectorAll<HTMLElement>("[data-pdf-block]")).map((b) => {
    const r = b.getBoundingClientRect();
    return { top: (r.top - elTop) * factor, bottom: (r.bottom - elTop) * factor };
  });

  // Restaura posição off-screen
  el.style.position = prev.position; el.style.left = prev.left; el.style.top = prev.top;
  el.style.opacity = prev.opacity; el.style.zIndex = prev.zIndex;

  const pdf    = new jsPDF("p", "mm", "a4");
  const pageW  = pdf.internal.pageSize.getWidth();
  const pageH  = pdf.internal.pageSize.getHeight();
  const pagePx = (canvas.width * pageH) / pageW;  // altura de 1 página A4 em px de canvas

  let y = 0;
  let firstPage = true;
  while (y < canvas.height - 1) {
    let pageBottom = Math.min(y + pagePx, canvas.height);
    for (const b of blocks) {
      // bloco começa nesta página mas termina depois dela → quebra antes do bloco
      if (b.top > y + 4 && b.top < pageBottom && b.bottom > pageBottom) {
        pageBottom = Math.min(pageBottom, b.top);
      }
    }
    // garante progresso (bloco maior que a página inteira: inevitável cortar)
    if (pageBottom <= y + 4) pageBottom = Math.min(y + pagePx, canvas.height);

    const sliceH = Math.round(pageBottom - y);
    const slice  = document.createElement("canvas");
    slice.width  = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(y), canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    }
    const sliceImgH = (sliceH * pageW) / canvas.width;
    if (!firstPage) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, pageW, sliceImgH);
    firstPage = false;
    y = pageBottom;
  }

  pdf.save(fileName);
}
