/**
 * Shared PDF report builder – PDHS-style professional template.
 * Used by MOH, RDHS, and PDHS roles so all consolidated reports share the same look.
 */

export interface SharedChildRow {
  child_id?: string | number;
  name?: string;
  gender?: string;
  age_months?: number | null;
  risk_level?: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  muac_cm?: number | null;
  last_visit_date?: string | null;
}

export interface SharedAreaSection {
  title: string;
  /** 'primary' = dark-blue district bar, 'secondary' = light-blue MOH bar */
  headerLevel: 'primary' | 'secondary';
  summary?: {
    total: number;
    normal: number;
    mam: number;
    sam: number;
    escalations: number;
  };
  children?: SharedChildRow[];
  subsections?: SharedAreaSection[];
}

export interface SharedReportData {
  roleTitle: string;
  areaName: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  summary: {
    total_children: number;
    normal: number;
    mam: number;
    sam: number;
    escalations: number;
  };
  sections: SharedAreaSection[];
}

/** Build a professional PDHS-style PDF from any role's data. Returns a jsPDF instance. */
export async function buildSharedReportPdf(data: SharedReportData) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });

  const M = 15;
  const PW = 297;
  const PH = 210;
  const CW = PW - 2 * M;
  const ROW_H = 6.5;
  const HEADER_H = 18;

  let y = 0;

  const drawPageHeader = () => {
    pdf.setFillColor(21, 63, 142);
    pdf.rect(0, 0, PW, HEADER_H, 'F');
    pdf.setFillColor(37, 99, 235);
    pdf.rect(0, HEADER_H - 3, PW, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text(data.roleTitle, M, 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(`Generated: ${new Date().toLocaleString('en-GB')}`, PW - M, 12, { align: 'right' });
  };

  const newPage = () => {
    pdf.addPage();
    drawPageHeader();
    return HEADER_H + 4;
  };

  const ensureY = (needed: number) => {
    if (y + needed > PH - 12) y = newPage();
  };

  // Column layout (landscape A4, 267 mm content)
  const COL = {
    no: M,
    id: M + 7,
    name: M + 35,
    gender: M + 79,
    age: M + 91,
    risk: M + 103,
    wt: M + 121,
    ht: M + 139,
    muac: M + 157,
    visit: M + 175,
  };

  // ── PAGE 1 ──────────────────────────────────────────────────────────────
  drawPageHeader();
  y = HEADER_H + 6;

  // Area + period block
  pdf.setDrawColor(220, 230, 245);
  pdf.setFillColor(248, 250, 255);
  pdf.roundedRect(M, y, CW, 18, 2, 2, 'FD');
  pdf.setTextColor(21, 63, 142);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text(data.areaName || 'Area', M + 5, y + 7);
  pdf.setTextColor(70, 90, 130);
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Period: ${data.periodLabel}`, M + 5, y + 13);
  pdf.text(`${data.startDate} to ${data.endDate}`, M + 60, y + 13);
  y += 24;

  // Summary boxes
  const s = data.summary;
  const summaryBoxes: { label: string; val: number; bg: [number, number, number]; fg: [number, number, number] }[] = [
    { label: 'Total Children', val: s.total_children ?? 0, bg: [235, 245, 255], fg: [21, 63, 142] },
    { label: 'Normal',         val: s.normal ?? 0,         bg: [220, 252, 231], fg: [22, 101, 52] },
    { label: 'MAM',            val: s.mam ?? 0,            bg: [254, 243, 199], fg: [146, 64, 14] },
    { label: 'SAM',            val: s.sam ?? 0,            bg: [254, 226, 226], fg: [153, 27, 27] },
    { label: 'Escalations',    val: s.escalations ?? 0,    bg: [243, 232, 255], fg: [109, 40, 217] },
  ];
  const boxW = (CW - 4 * 3) / 5;
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(60, 60, 80);
  pdf.text('SUMMARY', M, y - 2);
  summaryBoxes.forEach((b, i) => {
    const bx = M + i * (boxW + 3);
    pdf.setFillColor(...b.bg);
    pdf.setDrawColor(...b.bg);
    pdf.roundedRect(bx, y, boxW, 16, 1.5, 1.5, 'FD');
    pdf.setTextColor(...b.fg);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(b.label, bx + boxW / 2, y + 5.5, { align: 'center' });
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(b.val), bx + boxW / 2, y + 13, { align: 'center' });
  });
  y += 22;

  pdf.setDrawColor(200, 215, 235);
  pdf.line(M, y, PW - M, y);
  y += 5;

  // ── Render sections (supports 1 or 2 levels of nesting) ────────────────
  const renderChildrenTable = (children: SharedChildRow[]) => {
    if (children.length === 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.setTextColor(140, 140, 140);
      pdf.text('No children registered in this area.', M + 6, y + 4);
      y += 7;
      return;
    }

    ensureY(10);
    pdf.setFillColor(37, 99, 235);
    pdf.rect(M + 2, y, CW - 4, 7, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(6.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('#',          COL.no     + 1, y + 5);
    pdf.text('Child ID',   COL.id     + 1, y + 5);
    pdf.text('Name',       COL.name   + 1, y + 5);
    pdf.text('Gender',     COL.gender + 1, y + 5);
    pdf.text('Age (m)',    COL.age    + 1, y + 5);
    pdf.text('Risk',       COL.risk   + 1, y + 5);
    pdf.text('Wt (kg)',    COL.wt     + 1, y + 5);
    pdf.text('Ht (cm)',    COL.ht     + 1, y + 5);
    pdf.text('MUAC (cm)',  COL.muac   + 1, y + 5);
    pdf.text('Last Visit', COL.visit  + 1, y + 5);
    y += 8;

    children.forEach((ch, idx) => {
      ensureY(ROW_H + 1);
      if (idx % 2 === 0) {
        pdf.setFillColor(245, 249, 255);
        pdf.rect(M + 2, y - 1, CW - 4, ROW_H + 0.5, 'F');
      }
      pdf.setDrawColor(220, 230, 245);
      pdf.line(M + 2, y + ROW_H - 0.5, PW - M - 2, y + ROW_H - 0.5);

      const risk = (ch.risk_level || '').toUpperCase();
      const riskBg: Record<string, [number, number, number]> = {
        SAM: [254, 202, 202], MAM: [254, 240, 138], NORMAL: [187, 247, 208],
      };
      const riskFg: Record<string, [number, number, number]> = {
        SAM: [185, 28, 28], MAM: [161, 98, 7], NORMAL: [21, 128, 61],
      };
      const rbg = riskBg[risk] || [229, 231, 235];
      const rfg = riskFg[risk] || [75, 85, 99];
      pdf.setFillColor(...rbg);
      pdf.roundedRect(COL.risk, y - 0.5, 15, ROW_H - 0.5, 1, 1, 'F');
      pdf.setTextColor(...rfg);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      pdf.text(risk || '—', COL.risk + 7.5, y + 3.5, { align: 'center' });

      pdf.setTextColor(40, 50, 65);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      pdf.text(String(idx + 1), COL.no + 1, y + 4);
      pdf.text(String(ch.child_id || '—').slice(0, 15), COL.id + 1, y + 4);
      pdf.text(String(ch.name || '—').slice(0, 26), COL.name + 1, y + 4);
      pdf.text(String(ch.gender || '—').slice(0, 6), COL.gender + 1, y + 4);
      pdf.text(ch.age_months != null ? `${ch.age_months}` : '—', COL.age + 1, y + 4);
      pdf.text(ch.weight_kg != null ? String(ch.weight_kg) : '—', COL.wt + 1, y + 4);
      pdf.text(ch.height_cm != null ? String(ch.height_cm) : '—', COL.ht + 1, y + 4);
      pdf.text(ch.muac_cm != null ? String(ch.muac_cm) : '—', COL.muac + 1, y + 4);
      pdf.text(ch.last_visit_date ? String(ch.last_visit_date) : '—', COL.visit + 1, y + 4);
      y += ROW_H + 0.5;
    });
    y += 5;
  };

  const renderSection = (sec: SharedAreaSection) => {
    if (sec.headerLevel === 'primary') {
      // Dark blue district-style header
      ensureY(22);
      const ds = sec.summary;
      pdf.setFillColor(21, 63, 142);
      pdf.roundedRect(M, y, CW, 11, 1.5, 1.5, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(sec.title, M + 4, y + 7.5);
      if (ds) {
        pdf.setFontSize(7.5);
        pdf.setFont('helvetica', 'normal');
        pdf.text(
          `Children: ${ds.total}   Normal: ${ds.normal}   MAM: ${ds.mam}   SAM: ${ds.sam}   Escalations: ${ds.escalations}`,
          PW - M - 4, y + 7.5, { align: 'right' },
        );
      }
      y += 13;
      // Render subsections (secondary level) or direct children
      if (sec.subsections && sec.subsections.length > 0) {
        sec.subsections.forEach(renderSection);
      } else if (sec.children) {
        renderChildrenTable(sec.children);
      }
      y += 4;
    } else {
      // Light-blue MOH-style sub-header
      ensureY(16);
      const ms = sec.summary;
      pdf.setFillColor(219, 234, 254);
      pdf.setDrawColor(147, 197, 253);
      pdf.roundedRect(M + 2, y, CW - 4, 9, 1, 1, 'FD');
      pdf.setTextColor(30, 58, 138);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.text(sec.title, M + 6, y + 6.5);
      if (ms) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.text(
          `Total: ${ms.total}   Normal: ${ms.normal}   MAM: ${ms.mam}   SAM: ${ms.sam}   Escalations: ${ms.escalations}`,
          PW - M - 6, y + 6.5, { align: 'right' },
        );
      }
      y += 11;
      if (sec.subsections && sec.subsections.length > 0) {
        sec.subsections.forEach(renderSection);
      } else if (sec.children) {
        renderChildrenTable(sec.children);
      }
    }
  };

  data.sections.forEach(renderSection);

  // ── Footer with page numbers ──────────────────────────────────────────
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFillColor(245, 248, 255);
    pdf.rect(0, PH - 10, PW, 10, 'F');
    pdf.setDrawColor(200, 215, 235);
    pdf.line(0, PH - 10, PW, PH - 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 120, 160);
    pdf.text(`${data.roleTitle} – Confidential`, M, PH - 4);
    pdf.text(`Page ${i} of ${totalPages}`, PW - M, PH - 4, { align: 'right' });
  }

  return pdf;
}
