import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, RGB } from 'pdf-lib';

// --- Layout constants (A4 in points) ---
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Convert a "Y from top" cursor value to pdf-lib's bottom-left Y
const fromTop = (y: number) => PAGE_H - y;

// --- Table drawing ---
type TableConfig = {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  x: number;
  cursorY: number;
  headers: string[];
  rows: string[][];
  colWidths: number[];
  headerBg: RGB;
};

// Draws a table and returns the new cursorY after the last row
function drawTable(cfg: TableConfig): number {
  const { page, font, boldFont, x, headers, rows, colWidths, headerBg } = cfg;
  const LINE_H = 12;   // height of one text line
  const V_PAD = 5;     // vertical padding top + bottom
  const H_PAD = 4;     // horizontal padding
  const HEADER_H = 20;
  const FONT_SIZE = 8;
  let cursorY = cfg.cursorY;

  // Word wrap: splits text into lines that fit within colW using actual font metrics
  const wrapCell = (text: string, colW: number): string[] => {
    const maxW = colW - H_PAD * 2;
    const result: string[] = [];
    for (const paragraph of text.split('\n')) {
      const words = paragraph.split(' ');
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (font.widthOfTextAtSize(testLine, FONT_SIZE) <= maxW) {
          currentLine = testLine;
        } else {
          if (currentLine) result.push(currentLine);
          currentLine = word; // single oversized word: render anyway
        }
      }
      if (currentLine) result.push(currentLine);
    }
    return result.length > 0 ? result : [''];
  };

  // Header row (fixed height)
  page.drawRectangle({
    x,
    y: fromTop(cursorY + HEADER_H),
    width: CONTENT_W,
    height: HEADER_H,
    color: headerBg,
  });
  let cellX = x;
  headers.forEach((h, i) => {
    page.drawText(h.toUpperCase(), {
      x: cellX + H_PAD,
      y: fromTop(cursorY + HEADER_H - 6),
      size: FONT_SIZE,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
    cellX += colWidths[i];
  });
  cursorY += HEADER_H;

  // Data rows — height driven by the tallest cell
  rows.forEach((row, rowIdx) => {
    const cellLines = row.map((cell, i) => wrapCell(cell, colWidths[i]));
    const maxLines = Math.max(1, ...cellLines.map(l => l.length));
    const rowH = maxLines * LINE_H + V_PAD * 2;

    const rowBg = rowIdx % 2 === 0 ? rgb(0.97, 0.97, 0.97) : rgb(1, 1, 1);
    page.drawRectangle({
      x,
      y: fromTop(cursorY + rowH),
      width: CONTENT_W,
      height: rowH,
      color: rowBg,
    });

    cellX = x;
    cellLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: cellX + H_PAD,
          y: fromTop(cursorY + V_PAD + (li + 1) * LINE_H),
          size: FONT_SIZE,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      });
      cellX += colWidths[i];
    });
    cursorY += rowH;
  });

  // Outer border (no fill)
  page.drawRectangle({
    x,
    y: fromTop(cursorY),
    width: CONTENT_W,
    height: cursorY - cfg.cursorY,
    borderColor: rgb(0.8, 0.8, 0.8),
    borderWidth: 0.5,
  });

  return cursorY + 6; // small gap after table
}

// Helper to add a new page and reset fonts (pdf-lib requires re-referencing on new pages)
async function addPage(doc: PDFDocument): Promise<PDFPage> {
  return doc.addPage([PAGE_W, PAGE_H]);
}

// --- Public API ---

export const generateEDL_PDF = async (data: any): Promise<Blob> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = await addPage(doc);
  let cursorY = 50; // from top

  // ── TITLE ──────────────────────────────────────────────────────────────────
  const title = `ÉTAT DES LIEUX : ${(data.metadata.type as string).toUpperCase()}`;
  const titleWidth = boldFont.widthOfTextAtSize(title, 18);
  page.drawText(title, {
    x: (PAGE_W - titleWidth) / 2,
    y: fromTop(cursorY + 18),
    size: 18,
    font: boldFont,
    color: rgb(0.2, 0.25, 0.35),
  });
  cursorY += 36;

  // ── INFOS GÉNÉRALES ────────────────────────────────────────────────────────
  page.drawText('INFORMATIONS GÉNÉRALES', {
    x: MARGIN,
    y: fromTop(cursorY + 12),
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.25, 0.35),
  });
  cursorY += 18;

  const bien = [
    `Adresse : ${data.metadata.adresse_bien}`,
    `Chauffage : ${data.metadata.chauffage}`,
    data.metadata.cadastre ? `Cadastre : ${data.metadata.cadastre}` : null,
    `Clés remises : ${data.metadata.cles}`,
    `Date : ${data.metadata.date}`,
  ].filter(Boolean).join('\n');

  const parties = [
    `Bailleur : ${data.metadata.bailleur.nom}`,
    `Email bailleur : ${data.metadata.bailleur.email}`,
    `Locataire : ${data.metadata.locataire.nom}`,
    `Email locataire : ${data.metadata.locataire.email}`,
  ].join('\n');

  cursorY = drawTable({
    page, font, boldFont,
    x: MARGIN,
    cursorY,
    headers: ['Informations du Bien', 'Parties'],
    rows: [[bien, parties]],
    colWidths: [CONTENT_W / 2, CONTENT_W / 2],
    headerBg: rgb(0.2, 0.25, 0.35),
  });
  cursorY += 4;

  // ── COMPTEURS ──────────────────────────────────────────────────────────────
  page.drawText('1. RELEVÉS DES COMPTEURS', {
    x: MARGIN,
    y: fromTop(cursorY + 12),
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.25, 0.35),
  });
  cursorY += 18;

  const compteurRows = data.compteurs.map((c: any) => [
    c.type,
    c.index,
    c.photo_url ? 'Photographié (preuve archivée)' : 'Vu sur place',
  ]);

  cursorY = drawTable({
    page, font, boldFont,
    x: MARGIN,
    cursorY,
    headers: ['Type', 'Index', 'Observations'],
    rows: compteurRows,
    colWidths: [CONTENT_W * 0.3, CONTENT_W * 0.2, CONTENT_W * 0.5],
    headerBg: rgb(0.14, 0.39, 0.92),
  });
  cursorY += 8;

  // ── PIÈCES ─────────────────────────────────────────────────────────────────
  for (const piece of data.pieces) {
    // Page break if needed
    if (cursorY > PAGE_H - 120) {
      page = await addPage(doc);
      cursorY = 50;
    }

    const pieceTitle = piece.photo_url
      ? `> ${(piece.nom as string).toUpperCase()} (Vue d'ensemble photographiée)`
      : `> ${(piece.nom as string).toUpperCase()}`;

    page.drawText(pieceTitle, {
      x: MARGIN,
      y: fromTop(cursorY + 12),
      size: 10,
      font: boldFont,
      color: rgb(0.2, 0.25, 0.35),
    });
    cursorY += 18;

    const elementRows = piece.elements.map((el: any) => [
      el.nom,
      el.etat,
      el.photo_url
        ? `${el.observations || 'R.A.S'} (Détail photographié)`
        : el.observations || 'R.A.S',
    ]);

    cursorY = drawTable({
      page, font, boldFont,
      x: MARGIN,
      cursorY,
      headers: ['Élément', 'État', 'Observations'],
      rows: elementRows,
      colWidths: [CONTENT_W * 0.28, CONTENT_W * 0.22, CONTENT_W * 0.5],
      headerBg: rgb(0.4, 0.45, 0.55),
    });
    cursorY += 6;
  }

  // ── SIGNATURES ─────────────────────────────────────────────────────────────
  if (cursorY > PAGE_H - 90) {
    page = await addPage(doc);
    cursorY = 50;
  }

  // Separator line
  page.drawLine({
    start: { x: MARGIN, y: fromTop(cursorY) },
    end: { x: PAGE_W - MARGIN, y: fromTop(cursorY) },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  cursorY += 14;

  const labelHalfW = CONTENT_W / 2;
  const labelB = 'Signature du Bailleur';
  const labelL = 'Signature du Locataire';
  page.drawText(labelB, {
    x: MARGIN + (labelHalfW - boldFont.widthOfTextAtSize(labelB, 9)) / 2,
    y: fromTop(cursorY + 10),
    size: 9,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText(labelL, {
    x: MARGIN + labelHalfW + (labelHalfW - boldFont.widthOfTextAtSize(labelL, 9)) / 2,
    y: fromTop(cursorY + 10),
    size: 9,
    font: boldFont,
    color: rgb(0.3, 0.3, 0.3),
  });
  cursorY += 14;

  const MAX_SIG_W = 220;
  const MAX_SIG_H = 80;
  const halfW = CONTENT_W / 2;

  if (data.signatureBailleur) {
    try {
      const b64 = data.signatureBailleur.split(',')[1];
      const sigBBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const sigBImg = await doc.embedPng(sigBBytes);
      const scale = Math.min(MAX_SIG_W / sigBImg.width, MAX_SIG_H / sigBImg.height);
      const w = sigBImg.width * scale;
      const h = sigBImg.height * scale;
      page.drawImage(sigBImg, {
        x: MARGIN + (halfW - w) / 2,
        y: fromTop(cursorY + h),
        width: w,
        height: h,
      });
    } catch { /* signature absente ou invalide */ }
  }

  if (data.signatureLocataire) {
    try {
      const b64 = data.signatureLocataire.split(',')[1];
      const sigLBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const sigLImg = await doc.embedPng(sigLBytes);
      const scale = Math.min(MAX_SIG_W / sigLImg.width, MAX_SIG_H / sigLImg.height);
      const w = sigLImg.width * scale;
      const h = sigLImg.height * scale;
      page.drawImage(sigLImg, {
        x: MARGIN + halfW + (halfW - w) / 2,
        y: fromTop(cursorY + h),
        width: w,
        height: h,
      });
    } catch { /* signature absente ou invalide */ }
  }

  // ── EXPORT ─────────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save();
  return new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
};

// ── STUB — Hash injection (étape #4 roadmap) ────────────────────────────────
// Charge le PDF généré, injecte le hash SHA-256 en pied de dernière page,
// retourne les bytes modifiés. Non branché jusqu'à l'étape #4.
export const injectHashIntoPDF = async (
  pdfBytes: Uint8Array,
  hash: string
): Promise<Uint8Array> => {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const lastPage = pages[pages.length - 1];

  lastPage.drawText(`SHA-256 : ${hash}`, {
    x: MARGIN,
    y: 20, // pied de page
    size: 7,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
};
