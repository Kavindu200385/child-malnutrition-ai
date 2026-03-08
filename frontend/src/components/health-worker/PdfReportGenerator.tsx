import React from 'react';
import { toPng } from 'html-to-image';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Legend,
  ReferenceLine, LineChart,
} from 'recharts';
import { RiskLevel, Measurement } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildData {
  id: string;
  name: string;
  dob: string;
  gender: 'male' | 'female';
  guardianName: string;
  guardianPhone: string;
  address: string;
  riskLevel: RiskLevel;
  measurements: Measurement[];
  motherName?: string;
  guardianNic?: string;
  birthWeightKg?: number | null;
  birthHeightCm?: number | null;
  birthRiskLevel?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(r: RiskLevel | string): [number, number, number] {
  if (r === 'sam') return [220, 38, 38];
  if (r === 'mam') return [245, 158, 11];
  return [22, 163, 74];
}

function dotColor(r: string) {
  if (r === 'sam') return '#DC2626';
  if (r === 'mam') return '#F59E0B';
  return '#2563EB';
}

function fmtDate(d: string) {
  return (d || '').slice(0, 10);
}

function ageLabel(dob: string) {
  const months = Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y > 0 ? `${y} yr ${m} mo (${months} months)` : `${months} months`;
}

// ─── WHO reference data ───────────────────────────────────────────────────────

function buildWhoWFA(male: boolean) {
  const rows: { age: number; p2: number; med: number; m2: number; m3: number }[] = [];
  for (let age = 0; age <= 60; age++) {
    const gf = male ? 1.0 : 0.95;
    const med = (3.3 + age * 0.32) * gf;
    rows.push({ age, p2: med * 1.30, med, m2: med * 0.70, m3: med * 0.55 });
  }
  return rows;
}

function buildWhoHFA(male: boolean) {
  const rows: { age: number; p2: number; med: number; m2: number; m3: number }[] = [];
  for (let age = 0; age <= 60; age++) {
    const gf = male ? 1.0 : 0.98;
    // Use a single smooth formula — no discontinuity at age 24
    const med = age <= 24
      ? (49.5 + age * 2.1) * gf
      : (49.5 + 24 * 2.1 + (age - 24) * 0.95) * gf;
    rows.push({ age, p2: med * 1.08, med, m2: med * 0.92, m3: med * 0.88 });
  }
  return rows;
}

function buildWhoWFH() {
  const rows: { len: number; p2: number; med: number; m2: number; m3: number }[] = [];
  for (let len = 45; len <= 120; len++) {
    const med = 2.5 + (len - 45) * 0.13;
    rows.push({ len, p2: med * 1.35, med, m2: med * 0.70, m3: med * 0.55 });
  }
  return rows;
}

// ─── Chart gradient defs (shared) ────────────────────────────────────────────

const GradDefs = () => (
  <defs>
    <linearGradient id="pdSevere" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#DC2626" stopOpacity={0.18} />
      <stop offset="100%" stopColor="#DC2626" stopOpacity={0.06} />
    </linearGradient>
    <linearGradient id="pdMod" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#F97316" stopOpacity={0.16} />
      <stop offset="100%" stopColor="#F97316" stopOpacity={0.05} />
    </linearGradient>
    <linearGradient id="pdNorm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#86EFAC" stopOpacity={0.20} />
      <stop offset="100%" stopColor="#86EFAC" stopOpacity={0.06} />
    </linearGradient>
  </defs>
);

// ─── PDF constants & helpers ──────────────────────────────────────────────────

const PW = 210; const PH = 297; const M = 14; const CW = PW - M * 2;
const NAVY: [number, number, number] = [15, 40, 90];
const TEAL: [number, number, number] = [0, 120, 120];
const LGRAY: [number, number, number] = [245, 247, 250];
const MGRAY: [number, number, number] = [107, 114, 128];

type PDF = import('jspdf').jsPDF;

function font(pdf: PDF, sz: number, w: 'normal' | 'bold' | 'italic' = 'normal', col: [number, number, number] = [30, 30, 30]) {
  pdf.setFont('helvetica', w);
  pdf.setFontSize(sz);
  pdf.setTextColor(...col);
}

function hr(pdf: PDF, y: number, col: [number, number, number] = [210, 210, 210]) {
  pdf.setDrawColor(...col); pdf.setLineWidth(0.25);
  pdf.line(M, y, PW - M, y);
}

function secBar(pdf: PDF, y: number, title: string, col: [number, number, number] = NAVY): number {
  pdf.setFillColor(...col);
  pdf.rect(M, y, CW, 8, 'F');
  font(pdf, 9.5, 'bold', [255, 255, 255]);
  pdf.text(title, M + 3, y + 5.5);
  return y + 8 + 3;
}

function pageHeader(pdf: PDF, title: string) {
  pdf.setFillColor(...NAVY); pdf.rect(0, 0, PW, 15, 'F');
  pdf.setFillColor(...TEAL); pdf.rect(0, 15, PW, 2, 'F');
  font(pdf, 10.5, 'bold', [255, 255, 255]);
  pdf.text(title, M, 10.5);
  font(pdf, 7, 'normal', [180, 210, 255]);
  pdf.text('CMRAS', PW - M, 10.5, { align: 'right' });
}

function kv(pdf: PDF, y: number, label: string, val: string, right = false) {
  const x = right ? M + CW / 2 : M;
  font(pdf, 8.5, 'bold', [60, 60, 60]);
  pdf.text(label, x + 2, y);
  font(pdf, 8.5, 'normal', [30, 30, 30]);
  const safe = (val || '-').replace(/\u2212/g, '-');
  pdf.text(safe, x + 40, y);
}

function footer(pdf: PDF, pg: number, tot: number, name: string, id: string) {
  const y = PH - 7;
  hr(pdf, y - 3, [200, 200, 200]);
  font(pdf, 6.5, 'normal', [150, 150, 150]);
  pdf.text(
    `CMRAS Child Health Record  |  ${name}  |  ID: ${id}  |  Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    M, y
  );
  pdf.text(`Page ${pg} / ${tot}`, PW - M, y, { align: 'right' });
}

async function snap(el: HTMLElement): Promise<string | null> {
  try {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await new Promise(r => setTimeout(r, 400));
    return await toPng(el, { backgroundColor: '#ffffff', pixelRatio: 2, cacheBust: true });
  } catch (e) {
    console.warn('Chart capture failed:', e);
    return null;
  }
}

// ─── Main PDF generator ───────────────────────────────────────────────────────

export async function generateProfessionalPdf(
  child: ChildData,
  chartRefs: {
    wfa: HTMLElement | null;
    hfa0_24: HTMLElement | null;
    hfa24_60: HTMLElement | null;
    wfh: HTMLElement | null;
    zscore: HTMLElement | null;
  }
) {
  const { jsPDF } = await import('jspdf');

  // Capture all charts sequentially
  const imgs: Record<string, string | null> = {};
  for (const [k, el] of Object.entries(chartRefs)) {
    imgs[k] = el ? await snap(el) : null;
  }

  const sorted = [...child.measurements]
    .filter(m => m.weight > 0 || m.height > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const latest = sorted[sorted.length - 1] ?? null;
  const rcArr = riskColor(child.riskLevel);
  const rLabel = child.riskLevel === 'sam' ? 'SAM' : child.riskLevel === 'mam' ? 'MAM' : 'Normal';
  // 7 pages: Cover, Details, Chart1-WFA, Chart2a-HFA0-24, Chart2b-HFA24-60, Chart3+4, History
  const TOTAL = 7;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  let pg = 1;

  // ══════════════════════════════════════════
  // PAGE 1 — COVER
  // ══════════════════════════════════════════
  pdf.setFillColor(...NAVY); pdf.rect(0, 0, PW, 44, 'F');
  pdf.setFillColor(...TEAL); pdf.rect(0, 44, PW, 2.5, 'F');

  font(pdf, 8, 'normal', [180, 210, 255]);
  pdf.text('CHILD MALNUTRITION RISK ASSESSMENT SYSTEM  (CMRAS)', PW / 2, 14, { align: 'center' });
  font(pdf, 20, 'bold', [255, 255, 255]);
  pdf.text('Child Health Record', PW / 2, 28, { align: 'center' });
  font(pdf, 9.5, 'normal', [180, 210, 255]);
  pdf.text('Comprehensive Growth & Nutritional Assessment Report', PW / 2, 38, { align: 'center' });

  // Name card
  pdf.setFillColor(...LGRAY);
  pdf.roundedRect(M, 54, CW, 36, 2, 2, 'F');
  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.6);
  pdf.roundedRect(M, 54, CW, 36, 2, 2, 'S');

  font(pdf, 7, 'normal', [...MGRAY]);
  pdf.text('PATIENT NAME', M + 7, 62);
  font(pdf, 16, 'bold', [...NAVY]);
  pdf.text(child.name, M + 7, 72);
  font(pdf, 7, 'normal', [...MGRAY]);
  pdf.text('CHILD ID', M + 7, 80);
  font(pdf, 9, 'normal', [50, 50, 50]);
  pdf.text(child.id, M + 7, 86);

  // Status badge
  const bx = PW - M - 42; const by = 57;
  pdf.setFillColor(...rcArr);
  pdf.roundedRect(bx, by, 40, 22, 2, 2, 'F');
  font(pdf, 6.5, 'bold', [255, 255, 255]);
  pdf.text('CURRENT STATUS', bx + 20, by + 8, { align: 'center' });
  font(pdf, 13, 'bold', [255, 255, 255]);
  pdf.text(rLabel, bx + 20, by + 17, { align: 'center' });

  // Quick stats
  let qy = 100;
  const stats = [
    { lbl: 'Date of Birth', val: child.dob || '-' },
    { lbl: 'Age', val: child.dob ? ageLabel(child.dob) : '-' },
    { lbl: 'Gender', val: child.gender === 'male' ? 'Male' : 'Female' },
    { lbl: 'Total Visits', val: String(sorted.length) },
  ];
  const sw = CW / 4;
  stats.forEach((s, i) => {
    const sx = M + i * sw;
    pdf.setFillColor(235, 243, 255);
    pdf.roundedRect(sx, qy, sw - 2, 18, 1.5, 1.5, 'F');
    font(pdf, 6, 'normal', [...MGRAY]);
    pdf.text(s.lbl.toUpperCase(), sx + (sw - 2) / 2, qy + 6, { align: 'center' });
    font(pdf, 8.5, 'bold', [...NAVY]);
    const v = pdf.splitTextToSize(s.val, sw - 4)[0];
    pdf.text(v, sx + (sw - 2) / 2, qy + 13, { align: 'center' });
  });
  qy += 24;

  // Latest measurements strip
  if (latest) {
    font(pdf, 8.5, 'bold', [...NAVY]);
    pdf.text('Latest Measurements', M, qy);
    hr(pdf, qy + 2, [200, 220, 255]);
    qy += 8;

    const ms = [
      { lbl: 'Weight', val: `${latest.weight} kg`, sub: latest.weightForAge != null ? `WFA Z: ${latest.weightForAge.toFixed(2)}` : '' },
      { lbl: 'Height', val: `${latest.height} cm`, sub: latest.heightForAge != null ? `HFA Z: ${latest.heightForAge.toFixed(2)}` : '' },
      { lbl: 'MUAC', val: latest.muac != null ? `${latest.muac} cm` : '-', sub: '' },
      { lbl: 'Visit Date', val: fmtDate(latest.date), sub: `Age: ${latest.ageMonths} mo` },
    ];
    const mw = CW / 4;
    ms.forEach((m, i) => {
      const mx = M + i * mw;
      pdf.setFillColor(248, 251, 255);
      pdf.setDrawColor(210, 220, 240); pdf.setLineWidth(0.25);
      pdf.roundedRect(mx, qy, mw - 2, 22, 1.5, 1.5, 'FD');
      font(pdf, 6, 'normal', [...MGRAY]);
      pdf.text(m.lbl.toUpperCase(), mx + (mw - 2) / 2, qy + 6, { align: 'center' });
      font(pdf, 10, 'bold', [...NAVY]);
      pdf.text(m.val, mx + (mw - 2) / 2, qy + 13.5, { align: 'center' });
      if (m.sub) { font(pdf, 6, 'normal', [...MGRAY]); pdf.text(m.sub, mx + (mw - 2) / 2, qy + 19, { align: 'center' }); }
    });
    qy += 28;
  }

  // Table of contents
  qy += 4;
  font(pdf, 8.5, 'bold', [...NAVY]);
  pdf.text('Report Contents', M, qy);
  hr(pdf, qy + 2);
  qy += 8;

  [
    ['Page 2', 'Child Information & Demographics'],
    ['Page 3', 'WHO Chart 1 — Weight-for-Age (0–60 months)'],
    ['Page 4', 'WHO Chart 2a — Length-for-Age (0–24 months)'],
    ['Page 5', 'WHO Chart 2b — Height-for-Age (24–60 months)'],
    ['Page 6', 'WHO Chart 3 — Weight-for-Height  &  Chart 4 — Z-Score Timeline'],
    ['Page 7', 'Complete Measurement History & Clinical Summary'],
  ].forEach(([p, t]) => {
    font(pdf, 8, 'bold', [...TEAL]); pdf.text(p, M + 2, qy);
    font(pdf, 8, 'normal', [50, 50, 50]); pdf.text(t, M + 20, qy);
    qy += 6;
  });

  // Confidentiality notice
  const ny = PH - 30;
  pdf.setFillColor(255, 251, 235);
  pdf.setDrawColor(250, 180, 30); pdf.setLineWidth(0.3);
  pdf.rect(M, ny, CW, 16, 'FD');
  font(pdf, 7, 'bold', [146, 64, 14]);
  pdf.text('CONFIDENTIAL MEDICAL RECORD', M + 4, ny + 6);
  font(pdf, 6.5, 'normal', [120, 60, 0]);
  pdf.text('This report is intended for authorised health professionals only. Handle in accordance with data protection regulations.', M + 4, ny + 11.5);
  pdf.text(`Generated by CMRAS on ${new Date().toLocaleString('en-GB')}`, M + 4, ny + 15);

  footer(pdf, pg, TOTAL, child.name, child.id);

  // ══════════════════════════════════════════
  // PAGE 2 — CHILD DETAILS
  // ══════════════════════════════════════════
  pdf.addPage(); pg++;
  pageHeader(pdf, 'Child Information & Demographics');

  let y = 24;

  // Personal info
  y = secBar(pdf, y, '  PERSONAL INFORMATION');
  pdf.setFillColor(249, 251, 255); pdf.rect(M, y, CW, 46, 'F');
  kv(pdf, y + 8, 'Full Name:', child.name);
  kv(pdf, y + 8, 'Child ID:', child.id, true);
  kv(pdf, y + 17, 'Date of Birth:', child.dob || '-');
  kv(pdf, y + 17, 'Age:', child.dob ? ageLabel(child.dob) : '-', true);
  kv(pdf, y + 26, 'Gender:', child.gender === 'male' ? 'Male' : 'Female');
  kv(pdf, y + 26, 'Current Risk:', rLabel, true);
  kv(pdf, y + 35, 'Total Visits:', String(sorted.length));
  kv(pdf, y + 35, 'Last Visit:', fmtDate(latest?.date || '-'), true);
  kv(pdf, y + 44, 'Address:', pdf.splitTextToSize(child.address || '-', CW / 2 - 42)[0]);
  y += 50;

  // Guardian info
  y = secBar(pdf, y, '  GUARDIAN / FAMILY INFORMATION');
  pdf.setFillColor(249, 251, 255); pdf.rect(M, y, CW, 32, 'F');
  kv(pdf, y + 9, 'Guardian Name:', child.guardianName || '-');
  kv(pdf, y + 9, 'Mother Name:', child.motherName || '-', true);
  kv(pdf, y + 18, 'Guardian Phone:', child.guardianPhone || '-');
  kv(pdf, y + 18, 'Guardian NIC:', child.guardianNic || '-', true);
  kv(pdf, y + 27, 'Address:', pdf.splitTextToSize(child.address || '-', CW - 44)[0]);
  y += 36;

  // Birth info
  y = secBar(pdf, y, '  BIRTH INFORMATION');
  pdf.setFillColor(249, 251, 255); pdf.rect(M, y, CW, 24, 'F');
  kv(pdf, y + 9, 'Birth Weight:', child.birthWeightKg != null ? `${child.birthWeightKg} kg` : '-');
  kv(pdf, y + 9, 'Birth Height:', child.birthHeightCm != null ? `${child.birthHeightCm} cm` : '-', true);
  kv(pdf, y + 18, 'Birth Risk Level:', child.birthRiskLevel || '-');
  y += 28;

  // Nutritional status assessment
  y = secBar(pdf, y, '  CURRENT NUTRITIONAL STATUS ASSESSMENT');
  const statusSectionH = 62;
  pdf.setFillColor(249, 251, 255); pdf.rect(M, y, CW, statusSectionH, 'F');

  // ── Row 1: 4 equal boxes across the full width ──
  // Box 0 = Status badge, Box 1-3 = Z-score boxes
  const BOX_GAP = 3;            // gap between each box
  const NUM_BOXES = 4;
  const boxW = (CW - BOX_GAP * (NUM_BOXES - 1)) / NUM_BOXES; // ~44.25 mm each
  const boxY = y + 5;
  const boxH = 22;

  // Box 0 — Nutritional Status badge
  pdf.setFillColor(...rcArr);
  pdf.roundedRect(M, boxY, boxW, boxH, 2, 2, 'F');
  font(pdf, 6, 'bold', [255, 255, 255]);
  pdf.text('NUTRITIONAL STATUS', M + boxW / 2, boxY + 8, { align: 'center' });
  font(pdf, 11, 'bold', [255, 255, 255]);
  pdf.text(rLabel, M + boxW / 2, boxY + 17, { align: 'center' });

  // Boxes 1-3 — Z-score boxes
  const zss = [
    { lbl: 'Weight-for-Age Z',    val: latest?.weightForAge },
    { lbl: 'Height-for-Age Z',    val: latest?.heightForAge },
    { lbl: 'Weight-for-Height Z', val: latest?.weightForHeight },
  ];
  zss.forEach((z, i) => {
    const zx = M + (i + 1) * (boxW + BOX_GAP);
    const low = z.val != null && z.val < -2;
    pdf.setFillColor(low ? 255 : 235, low ? 242 : 250, low ? 242 : 235);
    pdf.setDrawColor(...(low ? [220, 38, 38] : [34, 197, 94]) as [number, number, number]);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(zx, boxY, boxW, boxH, 2, 2, 'FD');
    font(pdf, 6, 'normal', [...MGRAY]);
    pdf.text(z.lbl, zx + boxW / 2, boxY + 7, { align: 'center' });
    font(pdf, 12, 'bold', low ? [220, 38, 38] : [22, 163, 74]);
    pdf.text(z.val != null ? z.val.toFixed(2) : '-', zx + boxW / 2, boxY + 17, { align: 'center' });
  });

  // ── Row 2: WHO thresholds ──
  const ty = y + 33;
  font(pdf, 7.5, 'bold', [...NAVY]);
  pdf.text('WHO Classification Thresholds:', M + 2, ty);
  const threshW = CW / 3;
  [
    { lbl: 'SAM (Severe Acute Malnutrition)',    sub: '< -3 SD',       col: [220, 38, 38]  as [number, number, number] },
    { lbl: 'MAM (Moderate Acute Malnutrition)',  sub: '-3 to -2 SD',   col: [245, 158, 11] as [number, number, number] },
    { lbl: 'Normal',                             sub: '-2 to +2 SD',   col: [22, 163, 74]  as [number, number, number] },
  ].forEach((t, i) => {
    const tx = M + i * threshW;
    pdf.setFillColor(...t.col); pdf.circle(tx + 4, ty + 11, 2.5, 'F');
    font(pdf, 7, 'bold',   [40, 40, 40]); pdf.text(t.lbl, tx + 10, ty + 9);
    font(pdf, 7, 'normal', [...MGRAY]);   pdf.text(t.sub, tx + 10, ty + 15);
  });
  y += statusSectionH + 4;

  footer(pdf, pg, TOTAL, child.name, child.id);

  // ══════════════════════════════════════════
  // Helper: full-page single chart — preserve aspect ratio, centre vertically
  // ══════════════════════════════════════════
  const addFullChartPage = (
    title: string,
    subtitle: string,
    imgKey: string,
    barColor: [number, number, number],
    guideText: string,
    guideText2: string
  ) => {
    pdf.addPage(); pg++;
    pageHeader(pdf, 'WHO Growth Charts');

    let cy = 24;
    cy = secBar(pdf, cy, `  ${title}`, barColor);
    font(pdf, 7.5, 'italic', [...MGRAY]);
    pdf.text(subtitle, M + 3, cy + 1.5); cy += 8;

    // Available vertical space (above the note box)
    const NOTE_Y = PH - 20;
    const NOTE_H = 11;
    const availH = NOTE_Y - cy - 2;   // 2 mm gap above note box

    const img = imgs[imgKey];
    if (img) {
      // ── Determine natural pixel dimensions from the captured PNG ──
      // The hidden chart div is CW_PX wide, chart is CH_PX_TALL tall
      // but the wrapper adds padding (20px top + 16px bottom + title ~30px)
      // so we use the exact pixel constants to get the true aspect ratio.
      const CHART_WRAP_W = CW_PX;                         // full wrapper width in px
      const CHART_WRAP_H = CH_PX_TALL + 20 + 16 + 30;    // chart + top/bottom padding + title
      const nativeRatio = CHART_WRAP_W / CHART_WRAP_H;   // width / height

      // Scale to fit CW wide, then check if height fits
      let drawW = CW;
      let drawH = drawW / nativeRatio;

      if (drawH > availH) {
        // Too tall — constrain by height instead
        drawH = availH;
        drawW = drawH * nativeRatio;
      }

      // Centre horizontally and vertically in the available area
      const imgX = M + (CW - drawW) / 2;
      const imgY = cy + (availH - drawH) / 2;

      pdf.addImage(img, 'PNG', imgX, imgY, drawW, drawH);
    } else {
      pdf.setFillColor(248, 248, 248); pdf.rect(M, cy, CW, availH, 'F');
      font(pdf, 9, 'italic', [...MGRAY]);
      pdf.text('Chart image not available', PW / 2, cy + availH / 2, { align: 'center' });
    }

    // Note box
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(210, 210, 210); pdf.setLineWidth(0.25);
    pdf.rect(M, NOTE_Y, CW, NOTE_H, 'FD');
    font(pdf, 6.5, 'bold',   [...NAVY]); pdf.text('Note: ', M + 3, NOTE_Y + 4.5);
    font(pdf, 6.5, 'normal', [50, 50, 50]); pdf.text(guideText, M + 14, NOTE_Y + 4.5);
    font(pdf, 6.5, 'normal', [...MGRAY]);   pdf.text(guideText2, M + 3,  NOTE_Y + 9);

    footer(pdf, pg, TOTAL, child.name, child.id);
  };

  // ══════════════════════════════════════════
  // PAGE 3 — Chart 1: Weight-for-Age
  // ══════════════════════════════════════════
  addFullChartPage(
    'CHART 1 — Weight-for-Age  (Birth to 5 Years)',
    `${child.gender === 'male' ? 'Boys' : 'Girls'} — WHO reference curves. Coloured dots = child measurements (Blue=Normal, Orange=MAM, Red=SAM)`,
    'wfa',
    [30, 80, 160],
    'Red zone = SAM (< -3 SD)  |  Orange zone = MAM (-3 to -2 SD)  |  Green zone = Normal (> -2 SD)',
    'Based on WHO Child Growth Standards (2006). Reference curves are approximate values.'
  );

  // ══════════════════════════════════════════
  // PAGE 4 — Chart 2a: Length-for-Age 0-24
  // ══════════════════════════════════════════
  addFullChartPage(
    'CHART 2a — Length-for-Age  (0 to 24 months)',
    `${child.gender === 'male' ? 'Boys' : 'Girls'} — Recumbent length (lying). Stunting indicator for infants and toddlers.`,
    'hfa0_24',
    [30, 120, 80],
    'Stunting = HFA < -2 SD  |  Severe stunting = HFA < -3 SD  |  Coloured dots = child visits at each age',
    'Recumbent (lying) length measured for children under 2 years. WHO Child Growth Standards (2006).'
  );

  // ══════════════════════════════════════════
  // PAGE 5 — Chart 2b: Height-for-Age 24-60
  // ══════════════════════════════════════════
  addFullChartPage(
    'CHART 2b — Height-for-Age  (24 to 60 months)',
    `${child.gender === 'male' ? 'Boys' : 'Girls'} — Standing height. Stunting indicator for children aged 2–5 years.`,
    'hfa24_60',
    [20, 100, 60],
    'Stunting = HFA < -2 SD  |  Severe stunting = HFA < -3 SD  |  Coloured dots = child visits at each age',
    'Standing height measured from age 2 years onwards. WHO Child Growth Standards (2006).'
  );

  // ══════════════════════════════════════════
  // PAGE 6 — Chart 3 (WFH) + Chart 4 (Z-Score) stacked
  // ══════════════════════════════════════════
  pdf.addPage(); pg++;
  pageHeader(pdf, 'WHO Growth Charts');

  let p6y = 24;
  // Each chart gets roughly half the usable area, minus headers and footer
  const usable6 = PH - p6y - 20; // 20mm for footer
  const half6 = (usable6 - 30) / 2; // 30mm for two sec-bars + subtitles + gap

  // Chart 3
  p6y = secBar(pdf, p6y, '  CHART 3 — Weight-for-Length / Weight-for-Height', [90, 40, 160]);
  font(pdf, 7, 'italic', [...MGRAY]);
  pdf.text('Acute wasting indicator — most sensitive to recent nutritional changes', M + 3, p6y + 1); p6y += 6;
  if (imgs.wfh) {
    const CHART_WRAP_W = CW_PX;
    const CHART_WRAP_H = CH_PX_TALL + 20 + 16 + 30;
    const nativeRatio = CHART_WRAP_W / CHART_WRAP_H;

    let drawW = CW;
    let drawH = drawW / nativeRatio;

    if (drawH > half6) {
      drawH = half6;
      drawW = drawH * nativeRatio;
    }

    const imgX = M + (CW - drawW) / 2;
    const imgY = p6y + (half6 - drawH) / 2;

    pdf.addImage(imgs.wfh, 'PNG', imgX, imgY, drawW, drawH);
  } else {
    pdf.setFillColor(248, 248, 248); pdf.rect(M, p6y, CW, half6, 'F');
    font(pdf, 8, 'italic', [...MGRAY]);
    pdf.text('Chart 3 not available', PW / 2, p6y + half6 / 2, { align: 'center' });
  }
  p6y += half6 + 4;

  // Chart 4
  p6y = secBar(pdf, p6y, '  CHART 4 — Z-Score Trend Timeline', [140, 90, 10]);
  font(pdf, 7, 'italic', [...MGRAY]);
  pdf.text('All three Z-scores plotted over time — tracks growth trajectory', M + 3, p6y + 1); p6y += 6;
  if (imgs.zscore) {
    const CHART_WRAP_W = CW_PX;
    const CHART_WRAP_H = CH_PX_TALL + 20 + 16 + 30;
    const nativeRatio = CHART_WRAP_W / CHART_WRAP_H;

    let drawW = CW;
    let drawH = drawW / nativeRatio;

    if (drawH > half6) {
      drawH = half6;
      drawW = drawH * nativeRatio;
    }

    const imgX = M + (CW - drawW) / 2;
    const imgY = p6y + (half6 - drawH) / 2;

    pdf.addImage(imgs.zscore, 'PNG', imgX, imgY, drawW, drawH);
  } else {
    pdf.setFillColor(248, 248, 248); pdf.rect(M, p6y, CW, half6, 'F');
    font(pdf, 8, 'italic', [...MGRAY]);
    pdf.text('Chart 4 not available', PW / 2, p6y + half6 / 2, { align: 'center' });
  }

  const g6y = PH - 18;
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(210, 210, 210); pdf.setLineWidth(0.25);
  pdf.rect(M, g6y, CW, 9, 'FD');
  font(pdf, 6.5, 'bold', [...NAVY]); pdf.text('Key: ', M + 3, g6y + 4.5);
  font(pdf, 6.5, 'normal', [50, 50, 50]);
  pdf.text('WFA=Weight-for-Age Z  |  HFA=Height-for-Age Z  |  WFH=Weight-for-Height Z  |  -2 SD = MAM  |  -3 SD = SAM', M + 14, g6y + 4.5);
  font(pdf, 6.5, 'normal', [...MGRAY]);
  pdf.text('Improving trend = Z-scores moving towards 0.  Declining = Z-scores moving further below -2.', M + 3, g6y + 8);

  footer(pdf, pg, TOTAL, child.name, child.id);

  // ══════════════════════════════════════════
  // PAGE 7 — MEASUREMENT HISTORY + SUMMARY
  // ══════════════════════════════════════════
  pdf.addPage(); pg++;
  pageHeader(pdf, 'Measurement History & Clinical Summary');

  let p7y = 24;

  // Z-Score summary table
  p7y = secBar(pdf, p7y, '  COMPLETE VISIT HISTORY & Z-SCORES');
  const zCols = ['Date', 'Age', 'Weight (kg)', 'Height (cm)', 'MUAC (cm)', 'WFA Z', 'HFA Z', 'WFH Z', 'Status'];
  const zColW = [24, 13, 22, 22, 20, 16, 16, 16, 13] as const;

  // Header row
  pdf.setFillColor(225, 232, 248); pdf.rect(M, p7y, CW, 7, 'F');
  let cx = M;
  zCols.forEach((c, i) => {
    font(pdf, 6.5, 'bold', [...NAVY]);
    pdf.text(c, cx + 1.5, p7y + 5);
    cx += zColW[i];
  });
  p7y += 7.5;

  // How many rows fit (reserve 75mm for clinical summary + footer)
  const maxZRows = Math.floor((PH - p7y - 78) / 6.5);
  const displayRows = sorted.slice(-maxZRows).reverse();

  displayRows.forEach((m, ri) => {
    if (ri % 2 === 0) { pdf.setFillColor(248, 250, 252); pdf.rect(M, p7y - 1, CW, 6.5, 'F'); }
    cx = M;
    const vals = [
      fmtDate(m.date),
      `${m.ageMonths}m`,
      m.weight > 0 ? m.weight.toFixed(1) : '-',
      m.height > 0 ? m.height.toFixed(1) : '-',
      m.muac != null ? m.muac.toFixed(1) : '-',
      m.weightForAge != null ? m.weightForAge.toFixed(2) : '-',
      m.heightForAge != null ? m.heightForAge.toFixed(2) : '-',
      m.weightForHeight != null ? m.weightForHeight.toFixed(2) : '-',
      m.riskLevel.toUpperCase(),
    ];
    vals.forEach((v, i) => {
      const isStatus = i === 8;
      const statusCol: [number, number, number] = m.riskLevel === 'sam' ? [220, 38, 38] : m.riskLevel === 'mam' ? [180, 110, 0] : [22, 120, 60];
      font(pdf, 6, isStatus ? 'bold' : 'normal', isStatus ? statusCol : [40, 40, 40]);
      const txt = pdf.splitTextToSize(v, zColW[i] - 2)[0] ?? '';
      pdf.text(txt, cx + 1.5, p7y + 4.5);
      cx += zColW[i];
    });
    p7y += 6.5;
  });

  if (sorted.length > maxZRows) {
    font(pdf, 6.5, 'italic', [...MGRAY]);
    pdf.text(`... ${sorted.length - maxZRows} earlier record(s) not shown`, M + 2, p7y + 4);
    p7y += 7;
  }
  p7y += 5;

  // Clinical summary
  p7y = secBar(pdf, p7y, '  CLINICAL SUMMARY & RECOMMENDATIONS');
  const prev2 = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const delta = prev2 && latest ? (latest.weightForAge ?? 0) - (prev2.weightForAge ?? 0) : 0;
  const trend = delta > 0.3 ? 'Improving' : delta < -0.3 ? 'Declining' : 'Stable';
  const tCol: [number, number, number] = trend === 'Improving' ? [22, 163, 74] : trend === 'Declining' ? [220, 38, 38] : [180, 110, 0];

  const summaryH = PH - p7y - 44;
  pdf.setFillColor(249, 251, 255); pdf.setDrawColor(200, 215, 240); pdf.setLineWidth(0.25);
  pdf.rect(M, p7y, CW, summaryH, 'FD');

  const kvSm = (label: string, val: string, col?: [number, number, number]) => {
    font(pdf, 8, 'bold', [...NAVY]); pdf.text(label, M + 4, p7y);
    font(pdf, 8, col ? 'bold' : 'normal', col ?? [40, 40, 40]); pdf.text(val, M + 50, p7y);
    p7y += 8;
  };
  p7y += 8;
  kvSm('Growth Trajectory:', trend, tCol);
  kvSm('Total Clinic Visits:', String(sorted.length));
  kvSm('Latest Visit Date:', fmtDate(latest?.date || '-'));
  kvSm('Current Status:', rLabel, rcArr);

  // Recommendation box
  const rec = child.riskLevel === 'sam'
    ? 'URGENT: Refer immediately for therapeutic feeding programme. Daily monitoring required. Notify MOH officer and arrange hospital admission if necessary.'
    : child.riskLevel === 'mam'
      ? 'MODERATE RISK: Enrol in supplementary feeding programme. Increase monitoring to bi-weekly. Provide nutrition counselling to guardian/mother.'
      : 'NORMAL: Continue routine monthly monitoring. Maintain balanced diet and breastfeeding if applicable. Next scheduled visit in 1 month.';

  const recCol: [number, number, number] = child.riskLevel === 'sam' ? [220, 38, 38] : child.riskLevel === 'mam' ? [180, 100, 0] : [22, 120, 60];
  const recBg: [number, number, number] = child.riskLevel === 'sam' ? [255, 242, 242] : child.riskLevel === 'mam' ? [255, 250, 235] : [240, 255, 245];
  pdf.setFillColor(...recBg);
  pdf.setDrawColor(...recCol); pdf.setLineWidth(0.5);
  pdf.rect(M + 3, p7y, CW - 6, 24, 'FD');
  font(pdf, 7.5, 'bold', recCol);
  pdf.text('Recommended Action:', M + 6, p7y + 7);
  font(pdf, 7.5, 'normal', [40, 40, 40]);
  const recLines = pdf.splitTextToSize(rec, CW - 16);
  recLines.forEach((line: string, li: number) => pdf.text(line, M + 6, p7y + 14 + li * 5.5));

  // Signature block
  const sigY = PH - 36;
  hr(pdf, sigY - 2, [200, 200, 200]);
  font(pdf, 6.5, 'italic', [...MGRAY]);
  pdf.text('This is a system-generated report. All data must be verified by a qualified clinician before decision-making.', M, sigY + 1);
  ['Health Worker / PHM', 'MOH Officer', 'Reviewed By'].forEach((lbl, i) => {
    const sx = M + i * 62;
    pdf.setDrawColor(160, 160, 160); pdf.setLineWidth(0.3);
    pdf.line(sx, sigY + 18, sx + 56, sigY + 18);
    font(pdf, 6.5, 'normal', [...MGRAY]);
    pdf.text(lbl, sx, sigY + 22);
    pdf.text('Signature & Date', sx, sigY + 27);
  });

  footer(pdf, pg, TOTAL, child.name, child.id);

  // Save
  const safe = String(child.name || 'child').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '_');
  pdf.save(`CMRAS_Report_${safe}_${child.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Hidden charts (captured for PDF) ────────────────────────────────────────

interface HiddenChartsProps {
  measurements: Measurement[];
  gender: 'male' | 'female';
  refs: {
    wfa: React.RefObject<HTMLDivElement | null>;
    hfa0_24: React.RefObject<HTMLDivElement | null>;
    hfa24_60: React.RefObject<HTMLDivElement | null>;
    wfh: React.RefObject<HTMLDivElement | null>;
    zscore: React.RefObject<HTMLDivElement | null>;
  };
}

// Wide canvas with tall height for maximum chart clarity in the PDF
const CW_PX = 960;
const CH_PX_TALL = 600;
// Wrapper padding (px): top=20, bottom=16, title≈34 → total wrapper height
const WRAP_PAD_H = 20 + 16 + 34;

export function HiddenPdfCharts({ measurements, gender, refs }: HiddenChartsProps) {
  const male = gender === 'male';
  const sorted = [...measurements]
    .filter(m => m.weight > 0 || m.height > 0)
    .sort((a, b) => a.ageMonths - b.ageMonths);

  const whoWFA  = buildWhoWFA(male);
  const whoHFA  = buildWhoHFA(male);
  const whoWFH  = buildWhoWFH();

  // ── Child measurement series merged with WHO reference data ──────────────
  // We attach child values as extra keys on each WHO row so Recharts can draw
  // a connected line (with dots) on the same axis as the reference curves.

  // WFA: merge child weight onto WHO age rows
  const childWfaByAge = new Map(
    sorted.filter(m => m.weight > 0).map(m => [m.ageMonths, { w: m.weight, risk: m.riskLevel }])
  );
  const wfaData = whoWFA.map(row => ({
    ...row,
    childW: childWfaByAge.get(row.age)?.w ?? null,
    childRisk: childWfaByAge.get(row.age)?.risk ?? null,
  }));

  // HFA 0-24: merge child height onto WHO age rows
  const childHfaByAge = new Map(
    sorted.filter(m => m.height > 0).map(m => [m.ageMonths, { h: m.height, risk: m.riskLevel }])
  );
  const hfa0_24Data = whoHFA.filter(d => d.age <= 24).map(row => ({
    ...row,
    childH: childHfaByAge.get(row.age)?.h ?? null,
    childRisk: childHfaByAge.get(row.age)?.risk ?? null,
  }));
  const hfa24_60Data = whoHFA.filter(d => d.age >= 24).map(row => ({
    ...row,
    childH: childHfaByAge.get(row.age)?.h ?? null,
    childRisk: childHfaByAge.get(row.age)?.risk ?? null,
  }));

  // WFH: merge child weight onto WHO height (len) rows
  const childWfhByLen = new Map(
    sorted.filter(m => m.height > 0 && m.weight > 0)
          .map(m => [Math.round(m.height), { w: m.weight, risk: m.riskLevel }])
  );
  const wfhData = whoWFH.map(row => ({
    ...row,
    childW: childWfhByLen.get(row.len)?.w ?? null,
    childRisk: childWfhByLen.get(row.len)?.risk ?? null,
  }));

  // Z-score chart: deduplicate by age
  const zByAge = new Map<number, { age: number; wfa: number | null; hfa: number | null; wfh: number | null }>();
  sorted.forEach(m => {
    zByAge.set(m.ageMonths, {
      age: m.ageMonths,
      wfa: m.weightForAge ?? null,
      hfa: m.heightForAge ?? null,
      wfh: m.weightForHeight ?? null,
    });
  });
  const zData = Array.from(zByAge.values()).sort((a, b) => a.age - b.age);

  // ── Custom dot renderer: colour each dot by its risk level ───────────────
  const RiskDot = (props: { cx?: number; cy?: number; payload?: { childRisk?: string } }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || payload?.childRisk == null) return null;
    const fill = dotColor(payload.childRisk);
    return <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#fff" strokeWidth={2} />;
  };

  // Hidden container: render off-screen (not 0×0) so SVG paints fully
  const clipContainer: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: '-9999px',
    pointerEvents: 'none',
    zIndex: -1,
  };

  const chartWrap: React.CSSProperties = {
    width: `${CW_PX}px`,
    backgroundColor: '#ffffff',
    padding: '20px 24px 16px',
    fontFamily: 'Arial, sans-serif',
  };

  const titleStyle = (color: string): React.CSSProperties => ({
    fontSize: 15,
    fontWeight: 700,
    color,
    marginBottom: 10,
    letterSpacing: '0.01em',
  });

  const commonMargin = { top: 20, right: 50, left: 60, bottom: 60 };

  return (
    <div style={clipContainer}>

      {/* ── Chart 1: Weight-for-Age ── */}
      <div ref={refs.wfa} style={chartWrap}>
        <div style={titleStyle('#1e3a6e')}>
          Chart 1: Weight-for-Age — {gender === 'male' ? 'Boys' : 'Girls'} (0–60 months)
        </div>
        <ComposedChart width={CW_PX - 48} height={CH_PX_TALL} data={wfaData} margin={commonMargin}>
          <GradDefs />
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <Area type="monotone" dataKey="m3" fill="url(#pdSevere)" stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="m2" fill="url(#pdMod)"    stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="p2" fill="url(#pdNorm)"   stroke="none" isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p2"  stroke="#10B981" strokeWidth={2}   dot={false} name="+2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="med" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" isAnimationActive={false} />
          <Line type="monotone" dataKey="m2"  stroke="#F59E0B" strokeWidth={2}   dot={false} name="-2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="m3"  stroke="#DC2626" strokeWidth={2}   dot={false} name="-3 SD"  isAnimationActive={false} />
          {/* Child growth line — connected dots coloured by risk */}
          <Line
            type="monotone" dataKey="childW"
            stroke="#1d4ed8" strokeWidth={2.5}
            dot={<RiskDot />}
            activeDot={false}
            connectNulls
            name="Child measurements"
            isAnimationActive={false}
          />
          <XAxis dataKey="age" label={{ value: 'Age (months)', position: 'insideBottom', offset: -18, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48, 54, 60]} />
          <YAxis label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        </ComposedChart>
      </div>

      {/* ── Chart 2a: Length-for-Age 0-24 ── */}
      <div ref={refs.hfa0_24} style={chartWrap}>
        <div style={titleStyle('#166534')}>
          Chart 2a: Length-for-Age — {gender === 'male' ? 'Boys' : 'Girls'} (0–24 months)
        </div>
        <ComposedChart width={CW_PX - 48} height={CH_PX_TALL} data={hfa0_24Data} margin={commonMargin}>
          <GradDefs />
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <Area type="monotone" dataKey="m3" fill="url(#pdSevere)" stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="m2" fill="url(#pdMod)"    stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="p2" fill="url(#pdNorm)"   stroke="none" isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p2"  stroke="#10B981" strokeWidth={2}   dot={false} name="+2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="med" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" isAnimationActive={false} />
          <Line type="monotone" dataKey="m2"  stroke="#F59E0B" strokeWidth={2}   dot={false} name="-2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="m3"  stroke="#DC2626" strokeWidth={2}   dot={false} name="-3 SD"  isAnimationActive={false} />
          <Line
            type="monotone" dataKey="childH"
            stroke="#1d4ed8" strokeWidth={2.5}
            dot={<RiskDot />}
            activeDot={false}
            connectNulls
            name="Child measurements"
            isAnimationActive={false}
          />
          <XAxis dataKey="age" label={{ value: 'Age (months)', position: 'insideBottom', offset: -18, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} ticks={[0, 3, 6, 9, 12, 15, 18, 21, 24]} />
          <YAxis label={{ value: 'Length (cm)', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} domain={[40, 'auto']} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        </ComposedChart>
      </div>

      {/* ── Chart 2b: Height-for-Age 24-60 ── */}
      <div ref={refs.hfa24_60} style={chartWrap}>
        <div style={titleStyle('#166534')}>
          Chart 2b: Height-for-Age — {gender === 'male' ? 'Boys' : 'Girls'} (24–60 months)
        </div>
        <ComposedChart width={CW_PX - 48} height={CH_PX_TALL} data={hfa24_60Data} margin={commonMargin}>
          <GradDefs />
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <Area type="monotone" dataKey="m3" fill="url(#pdSevere)" stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="m2" fill="url(#pdMod)"    stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="p2" fill="url(#pdNorm)"   stroke="none" isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p2"  stroke="#10B981" strokeWidth={2}   dot={false} name="+2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="med" stroke="#059669" strokeWidth={2.5} dot={false} name="Median" isAnimationActive={false} />
          <Line type="monotone" dataKey="m2"  stroke="#F59E0B" strokeWidth={2}   dot={false} name="-2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="m3"  stroke="#DC2626" strokeWidth={2}   dot={false} name="-3 SD"  isAnimationActive={false} />
          <Line
            type="monotone" dataKey="childH"
            stroke="#1d4ed8" strokeWidth={2.5}
            dot={<RiskDot />}
            activeDot={false}
            connectNulls
            name="Child measurements"
            isAnimationActive={false}
          />
          <XAxis dataKey="age" label={{ value: 'Age (months)', position: 'insideBottom', offset: -18, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} ticks={[24, 30, 36, 42, 48, 54, 60]} />
          <YAxis label={{ value: 'Height (cm)', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} domain={[75, 'auto']} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        </ComposedChart>
      </div>

      {/* ── Chart 3: Weight-for-Height ── */}
      <div ref={refs.wfh} style={chartWrap}>
        <div style={titleStyle('#5b21b6')}>
          Chart 3: Weight-for-Length / Weight-for-Height
        </div>
        <ComposedChart width={CW_PX - 48} height={CH_PX_TALL} data={wfhData} margin={commonMargin}>
          <GradDefs />
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <Area type="monotone" dataKey="m3" fill="url(#pdSevere)" stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="m2" fill="url(#pdMod)"    stroke="none" isAnimationActive={false} legendType="none" />
          <Area type="monotone" dataKey="p2" fill="url(#pdNorm)"   stroke="none" isAnimationActive={false} legendType="none" />
          <Line type="monotone" dataKey="p2"  stroke="#A855F7" strokeWidth={2}   dot={false} name="+2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="med" stroke="#7C3AED" strokeWidth={2.5} dot={false} name="Median" isAnimationActive={false} />
          <Line type="monotone" dataKey="m2"  stroke="#F59E0B" strokeWidth={2}   dot={false} name="-2 SD"  isAnimationActive={false} />
          <Line type="monotone" dataKey="m3"  stroke="#DC2626" strokeWidth={2}   dot={false} name="-3 SD"  isAnimationActive={false} />
          <Line
            type="monotone" dataKey="childW"
            stroke="#1d4ed8" strokeWidth={2.5}
            dot={<RiskDot />}
            activeDot={false}
            connectNulls
            name="Child measurements"
            isAnimationActive={false}
          />
          <XAxis dataKey="len" type="number" domain={[45, 120]} label={{ value: 'Length / Height (cm)', position: 'insideBottom', offset: -18, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} ticks={[45, 55, 65, 75, 85, 95, 105, 115, 120]} />
          <YAxis label={{ value: 'Weight (kg)', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        </ComposedChart>
      </div>

      {/* ── Chart 4: Z-Score Timeline ── */}
      <div ref={refs.zscore} style={chartWrap}>
        <div style={titleStyle('#92400e')}>
          Chart 4: Z-Score Trend Timeline
        </div>
        <LineChart width={CW_PX - 48} height={CH_PX_TALL} data={zData} margin={commonMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="age"
            type="number"
            domain={['dataMin', 'dataMax']}
            label={{ value: 'Age (months)', position: 'insideBottom', offset: -18, style: { fontSize: 14, fontWeight: 600 } }}
            tick={{ fontSize: 12 }}
            tickCount={8}
          />
          <YAxis domain={[-4, 3]} label={{ value: 'Z-Score', angle: -90, position: 'insideLeft', offset: 14, style: { fontSize: 14, fontWeight: 600 } }} tick={{ fontSize: 12 }} ticks={[-4, -3, -2, -1, 0, 1, 2, 3]} />
          <ReferenceLine y={-3} stroke="#DC2626" strokeWidth={2} strokeDasharray="6 3" label={{ value: '-3 SD (SAM)', fill: '#DC2626', fontSize: 12, fontWeight: 600 }} />
          <ReferenceLine y={-2} stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" label={{ value: '-2 SD (MAM)', fill: '#F59E0B', fontSize: 12, fontWeight: 600 }} />
          <ReferenceLine y={0}  stroke="#059669" strokeWidth={1.5} label={{ value: 'Median', fill: '#059669', fontSize: 12 }} />
          <Line type="monotone" dataKey="wfa" stroke="#2563EB" strokeWidth={3} dot={{ r: 7, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }} name="Weight-for-Age Z"    connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="hfa" stroke="#10B981" strokeWidth={3} dot={{ r: 7, fill: '#10B981', stroke: '#fff', strokeWidth: 2 }} name="Height-for-Age Z"   connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="wfh" stroke="#9333EA" strokeWidth={3} dot={{ r: 7, fill: '#9333EA', stroke: '#fff', strokeWidth: 2 }} name="Weight-for-Height Z" connectNulls isAnimationActive={false} />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 12 }} />
        </LineChart>
      </div>

    </div>
  );
}
