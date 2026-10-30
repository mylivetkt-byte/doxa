import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import cmgLogoUrl from "@/assets/cmg-logo-header.jpeg";

let _logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (_logoDataUrl) return _logoDataUrl;
  try {
    const res = await fetch(cmgLogoUrl);
    const blob = await res.blob();
    _logoDataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return _logoDataUrl;
  } catch {
    return null;
  }
}
import type { IsoMinisterioTemplate } from "./isoMinisterioTemplates";
import { isEstacionTextoPorDefecto } from "./isoMinisterioTemplates";

export interface IsoPdfEvento {
  id: string;
  fecha: string; // YYYY-MM-DD
  titulo: string;
  hora: string | null;
}

/**
 * Genera el PDF con el formato ISO del ministerio.
 * - Encabezado + sub-encabezado (Mes/Ministerio/Líder) repetidos en cada hoja.
 * - Pie de página fijo con el bloque Firma / Nombre / Cargo en cada hoja.
 * - Celda "Responsabilidades" con ajuste automático de texto sin invadir la fila siguiente.
 */
export async function exportIsoMinisterioPdf(params: {
  template: IsoMinisterioTemplate;
  mes: string;
  liderNombre: string;
  eventos: IsoPdfEvento[];
  /** Mapa evento_id -> Map(estacionNombre normalizada -> nombre persona asignada). */
  asignacionesPorEvento: Map<string, Map<string, string>>;
  /** Mapa evento_id -> texto uniforme (opcional, libre). */
  uniformePorEvento?: Map<string, string>;
  /** Mapa evento_id -> texto observación (opcional). */
  observacionPorEvento?: Map<string, string>;
  /** Mapa evento_id -> Map(estacionNombre normalizada -> texto libre) para estaciones tipo "texto". */
  textoEstacionPorEvento?: Map<string, Map<string, string>>;
}) {
  const {
    template,
    mes,
    liderNombre,
    eventos,
    asignacionesPorEvento,
    uniformePorEvento,
    observacionPorEvento,
    textoEstacionPorEvento,
  } = params;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const FONT = "helvetica";
  doc.setFont(FONT, "normal");

  const logoDataUrl = await getLogoDataUrl();

  const headerH = 18;
  const logoW = 46;
  const metaLabelW = 20;
  const metaValueW = 30;
  const metaW = metaLabelW + metaValueW;

  const drawHeader = (topY: number) => {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, topY, logoW, headerH);
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, "JPEG", margin + 2, topY + 2, logoW - 4, headerH - 4, undefined, "FAST");
      } catch {}
    } else {
      doc.setFontSize(10);
      doc.setFont(FONT, "bold");
      doc.text("CMG", margin + logoW / 2, topY + 8, { align: "center" });
      doc.setFontSize(7);
      doc.setFont(FONT, "normal");
      doc.text("CENTRO MUNDIAL", margin + logoW / 2, topY + 11, { align: "center" });
      doc.text("DE GLORIA", margin + logoW / 2, topY + 14, { align: "center" });
    }
    const titleX = margin + logoW;
    const titleW = pageWidth - margin * 2 - logoW - metaW;
    doc.rect(titleX, topY, titleW, headerH);
    doc.setFontSize(12);
    doc.setFont(FONT, "bold");
    doc.text(template.titulo, titleX + titleW / 2, topY + headerH / 2 + 1, { align: "center" });

    const metaX = titleX + titleW;
    const rowH = headerH / 3;
    doc.setFontSize(9);
    const metas: [string, string][] = [
      ["Código:", template.codigo],
      ["Versión:", template.version],
      ["Fecha:", template.fechaVigencia],
    ];
    metas.forEach(([k, v], i) => {
      const yy = topY + rowH * i;
      doc.rect(metaX, yy, metaLabelW, rowH);
      doc.rect(metaX + metaLabelW, yy, metaValueW, rowH);
      doc.setFont(FONT, "bold");
      doc.text(k, metaX + 1.8, yy + rowH / 2 + 1.2);
      doc.setFont(FONT, "normal");
      doc.text(v, metaX + metaLabelW + 1.8, yy + rowH / 2 + 1.2);
    });
  };

  // ===== Sub-encabezado MES/MINISTERIO/LÍDER =====
  const contentW = pageWidth - margin * 2;
  const rowH1 = 7;
  const labelW = 34; // ancho fijo para labels — evita que "Responsabilidades:" invada la celda de la derecha
  const infoRowsH = rowH1 * 3;

  const drawInfoRows = (topY: number) => {
    doc.setFontSize(10);
    const draw = (lbl: string, val: string, y: number) => {
      doc.rect(margin, y, labelW, rowH1);
      doc.setFont(FONT, "bold");
      doc.text(lbl, margin + 1.8, y + rowH1 / 2 + 1.2);
      doc.rect(margin + labelW, y, contentW - labelW, rowH1);
      doc.setFont(FONT, "normal");
      const t = doc.splitTextToSize(val || "—", contentW - labelW - 3)[0];
      doc.text(t, margin + labelW + 1.8, y + rowH1 / 2 + 1.2);
    };
    draw("MES:", mes.toUpperCase(), topY);
    draw("MINISTERIO:", template.nombreMinisterio, topY + rowH1);
    draw("LÍDER:", liderNombre, topY + rowH1 * 2);
  };

  // ===== Pie de página FIJO: Firmas + paginación =====
  const firmasRowH = 6.5;
  const firmasRows = 4; // encabezado + Firma + Nombre + Cargo
  const firmasBlockH = firmasRowH * firmasRows;
  const paginacionH = 6;
  const bottomReserve = firmasBlockH + paginacionH; // espacio bajo el contenido para el pie

  const drawFooter = (pageNum: number, totalPages: number) => {
    const firmY = pageHeight - margin - firmasBlockH - (paginacionH - 2);
    const firmLabelW = metaLabelW;
    const firmDataW = (contentW - firmLabelW) / 3;
    const firmRows: string[][] = [
      ["", "Elaborado por:", "Revisado por:", "Autorizado por:"],
      ["Firma", "", "", ""],
      [
        "Nombre",
        template.firmas.elaboradoPor.nombre,
        template.firmas.revisadoPor.nombre,
        template.firmas.autorizadoPor.nombre,
      ],
      [
        "Cargo",
        template.firmas.elaboradoPor.cargo,
        template.firmas.revisadoPor.cargo,
        template.firmas.autorizadoPor.cargo,
      ],
    ];
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.setFontSize(8);
    firmRows.forEach((row, ri) => {
      const yRow = firmY + firmasRowH * ri;
      row.forEach((cell, ci) => {
        const x = ci === 0 ? margin : margin + firmLabelW + firmDataW * (ci - 1);
        const w = ci === 0 ? firmLabelW : firmDataW;
        doc.rect(x, yRow, w, firmasRowH);
        doc.setFont(FONT, ri === 0 || ci === 0 ? "bold" : "normal");
        const t = doc.splitTextToSize(cell || "", w - 3)[0] || "";
        doc.text(t, x + 1.8, yRow + firmasRowH / 2 + 1.2);
      });
    });
    // paginación
    doc.setFontSize(8);
    doc.setFont(FONT, "italic");
    doc.text(`${template.codigo} · v${template.version}`, margin, pageHeight - margin + 4);
    doc.text(
      `Pág ${pageNum}/${totalPages}`,
      pageWidth - margin,
      pageHeight - margin + 4,
      { align: "right" }
    );
  };

  // ===== Página 1: encabezado + info =====
  drawHeader(margin);
  drawInfoRows(margin + headerH);
  let y = margin + headerH + infoRowsH;

  // ===== Tabla =====
  const head = [["FECHA", ...template.estaciones.map((e) => e.toUpperCase()), "UNIFORME", "OBSERVACIÓN"]];
  const body = eventos.map((ev) => {
    const fechaTxt = formatFechaLarga(ev.fecha) + (ev.hora ? ` ${ev.hora}` : "");
    const asigs = asignacionesPorEvento.get(ev.id) || new Map();
    const textos = textoEstacionPorEvento?.get(ev.id) || new Map<string, string>();
    const row = [fechaTxt];
    template.estaciones.forEach((est) => {
      const key = normKey(est);
      const isTexto =
        (template.estacionesTexto || []).some((e) => normKey(e) === key) ||
        isEstacionTextoPorDefecto(est);
      const textoVal = textos.get(key) || "";
      const asigVal = asigs.get(key) || "";
      row.push(isTexto ? textoVal : (asigVal || textoVal));
    });
    row.push(uniformePorEvento?.get(ev.id) || "");
    row.push(observacionPorEvento?.get(ev.id) || "");
    return row;
  });

  if (body.length === 0) {
    body.push(["Sin eventos programados", ...template.estaciones.map(() => ""), "", ""]);
  }

  // Anchos fijos: FECHA fija + resto repartido en partes iguales entre las demás columnas
  const numColsTotal = 1 + template.estaciones.length + 2;
  const fechaColW = 38;
  const restColW = (contentW - fechaColW) / (numColsTotal - 1);
  const fixedColumnStyles: Record<number, { cellWidth: number }> = { 0: { cellWidth: fechaColW } };
  for (let i = 1; i < numColsTotal; i++) fixedColumnStyles[i] = { cellWidth: restColW };

  autoTable(doc, {
    startY: y,
    head,
    body,
    tableWidth: contentW,
    styles: {
      font: FONT,
      fontSize: 8,
      cellPadding: 1.5,
      valign: "middle",
      halign: "left",
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      overflow: "linebreak",
    },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold", halign: "left" },
    columnStyles: fixedColumnStyles,
    margin: {
      left: margin,
      right: margin,
      top: margin + headerH + infoRowsH + 2,
      bottom: margin + bottomReserve + 2,
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        drawHeader(margin);
        drawInfoRows(margin + headerH);
      }
    },
  });

  let afterY = (doc as any).lastAutoTable.finalY;

  // ===== Cálculo de altura para Importante y Responsabilidades =====
  doc.setFontSize(9);
  const innerW = contentW - labelW - 4;
  const lineH = 3.8;
  const cellPadY = 2.2;
  const importanteLines = template.importante
    ? doc.splitTextToSize(template.importante, innerW)
    : [];
  const importanteH = template.importante
    ? Math.max(rowH1, importanteLines.length * lineH + cellPadY * 2)
    : 0;
  const respLines = doc.splitTextToSize(template.responsabilidades, innerW);
  const respH = Math.max(rowH1, respLines.length * lineH + cellPadY * 2);

  // Filas vacías para completar la página (sin invadir el pie fijo)
  const emptyRowH = 7;
  const numCols = 1 + template.estaciones.length + 2;
  const colWidths: number[] = [38];
  const restW = (contentW - 38) / (numCols - 1);
  for (let i = 1; i < numCols; i++) colWidths.push(restW);

  const availableForEmpty =
    pageHeight - margin - bottomReserve - afterY - importanteH - respH;
  if (availableForEmpty > emptyRowH) {
    const numEmpty = Math.floor(availableForEmpty / emptyRowH);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    for (let r = 0; r < numEmpty; r++) {
      let x = margin;
      for (let c = 0; c < numCols; c++) {
        doc.rect(x, afterY, colWidths[c], emptyRowH);
        x += colWidths[c];
      }
      afterY += emptyRowH;
    }
  }

  const ensureSpace = (needed: number) => {
    if (afterY + needed > pageHeight - margin - bottomReserve - 2) {
      doc.addPage();
      drawHeader(margin);
      drawInfoRows(margin + headerH);
      afterY = margin + headerH + infoRowsH + 2;
    }
  };

  const drawLabelCell = (label: string, lines: string[], h: number) => {
    ensureSpace(h);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.rect(margin, afterY, labelW, h);
    doc.setFontSize(9);
    doc.setFont(FONT, "bold");
    doc.text(label, margin + 1.8, afterY + cellPadY + lineH - 0.5);
    doc.rect(margin + labelW, afterY, contentW - labelW, h);
    doc.setFont(FONT, "normal");
    lines.forEach((ln, i) => {
      doc.text(ln, margin + labelW + 2, afterY + cellPadY + lineH * (i + 1) - 0.5);
    });
    afterY += h;
  };

  if (template.importante) drawLabelCell("Importante:", importanteLines, importanteH);
  drawLabelCell("Responsabilidades:", respLines, respH);

  // ===== Pie de página (firmas + paginación) en TODAS las páginas =====
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(i, pages);
  }

  const fname = `${template.codigo}-${template.nombreMinisterio.replace(/\s+/g, "_")}-${mes}.pdf`;
  doc.save(fname);
}


/** clave normalizada para comparar nombres de estación con nombres de cargo. */
export function normKey(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFechaLarga(fechaISO: string): string {
  try {
    const d = new Date(fechaISO + "T12:00:00");
    return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  } catch {
    return fechaISO;
  }
}
