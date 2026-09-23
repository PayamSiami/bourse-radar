/**
 * Bourse Radar — Shared Codal monthly-report extraction (standalone, importable by scripts).
 *
 * Pure helpers that parse the embedded `var datasource = {...}` from a Codal
 * monthly-activity report HTML into a structured object. Same algorithm as
 * src/scrapers/codal.ts#extractMonthlyReport, but in dependency-free ESM so
 * script runners (scripts/ingest.mjs, repair tooling) can import it without a
 * TypeScript toolchain.
 *
 * Column layout (verified on Codal خودرو 1405/05/31 report, 1167 cells):
 *   col1  شرح (label)          | col26 تولید/فروش
 *   col3   تعداد (YTD تا ماه قبل)   | col6  مبلغ
 *   col7-9 اصلاحات
 *   col10/11 qty | col12/13 مبلغ (YTD اصلاح شده)
 *   col14/15 qty | col16/17 مبلغ (دوره یک ماهه) ← monthly sales amount (میلیون ریال)
 *   col18/19 qty | col20/21 مبلغ (YTD تا ماه جاری)
 *   col22/23 qty | col24/25 مبلغ (YTD سال قبل)
 *   col26 وضعیت
 *  rowCode: 4=product, 5=جمع فروش داخلی, 8=جمع فروش صادراتی, 11=درآمد خدمات,
 *           14=برگشت, 15=تخفیقات, 16=جمع کل
 */

/** Convert Persian/Arabic-Indic digits (۰-۹, ٠-٩) to ASCII digits. */
export function toAsciiDigits(s) {
  if (typeof s !== "string") return s;
  return s.replace(/[\u06F0-\u06F9]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x06F0 + 48))
          .replace(/[\u0660-\u0669]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 48));
}

/** Simplified Jalali→Gregorian date for a report title "۱۴۰۵/۰۵/۳۱". */
export function jalaliToGregorian(jy, jm, jd) {
  const gy = jy + 621;
  const monthDays = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  const leapDays  = [0, 31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 30];
  let jDayOfYear = 0;
  for (let m = 1; m < jm; m++) jDayOfYear += (jy % 4 === 3 ? leapDays : monthDays)[m];
  jDayOfYear += jd;
  const gDayOfYear = jDayOfYear + 79;
  const gMonthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (gy % 4 === 0) gMonthLengths[1] = 29;
  let gMonth = 1, remaining = gDayOfYear;
  while (remaining > gMonthLengths[gMonth - 1] && gMonth < 12) {
    remaining -= gMonthLengths[gMonth - 1]; gMonth++;
  }
  return new Date(gy, gMonth - 1, remaining);
}

/** Extract period-end date from a Codal report title: "منتهی به ۱۴۰۵/۰۵/۳۱" → Date. */
export function extractPeriodEnd(title) {
  const clean = toAsciiDigits(title);
  const m = clean.match(/منتهی\s+به\s+(\d{4})\/(\d{2})\/(\d{2})/);
  if (!m) return null;
  const jy = parseInt(m[1]), jm = parseInt(m[2]), jd = parseInt(m[3]);
  return jalaliToGregorian(jy, jm, jd);
}

/** Extract all cell objects for a given metaTableCode using brace-counting. */
export function extractCellsForTable(html, metaTableCode) {
  const cellArrRe = /"cells":\[/g;
  let m;
  while ((m = cellArrRe.exec(html)) !== null) {
    const peek = html.slice(m.index + 9, m.index + 300);
    const metaMatch = peek.match(/"metaTableCode":(\d+)/);
    if (!metaMatch || parseInt(metaMatch[1]) !== metaTableCode) continue;

    const region = html.slice(m.index + 9);
    const cells = []; let idx = 0;
    while (true) {
      const p = region.indexOf('{"metaTableId":', idx);
      if (p === -1) break;
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = p; i < region.length && i < p + 50000; i++) {
        const ch = region[i];
        if (esc) { esc = false; continue; }
        if (ch === "\\") { if (inStr) esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      if (end > p) {
        try {
          const obj = JSON.parse(region.slice(p, end));
          if (obj && typeof obj === "object" && obj.metaTableId !== undefined) cells.push(obj);
        } catch { }
      }
      idx = end > p ? end : p + 1;
    }
    if (cells.length > 0) return cells;
  }
  return null;
}

/** Extract monthly sales total (million Rial) from a Codal report HTML. */
export function extractMonthlySales(html) {
  const cells = extractCellsForTable(html, 1197);
  if (!cells || cells.length === 0) return null;

  const domesticLabel = cells.find(c => c.value === "جمع فروش داخلی");
  const exportLabel = cells.find(c => c.value === "جمع فروش صادراتی");

  let domestic = null, exported = null;
  if (domesticLabel) {
    const c = cells.find(x => x.rowCode === domesticLabel.rowCode && x.columnCode === 17 && /^\d+$/.test(x.value || ""));
    if (c) domestic = parseInt(c.value, 10);
  }
  if (exportLabel) {
    const c = cells.find(x => x.rowCode === exportLabel.rowCode && x.columnCode === 17 && /^\d+$/.test(x.value || ""));
    if (c) exported = parseInt(c.value, 10);
  }

  if (domestic != null && exported != null) return domestic + exported;
  if (domestic != null) return domestic;
  if (exported != null) return exported;

  // Fallback: sum col-17 non-zero product rows (rowCode 4)
  const col17 = cells
    .filter(c => c.columnCode === 17 && c.rowCode === 4 && /^\d+$/.test(c.value || "") && parseInt(c.value, 10) > 0)
    .map(c => parseInt(c.value, 10));
  if (col17.length > 0) return col17.reduce((a, b) => a + b, 0);

  return null;
}

/** Build a structured monthly financial report from a Codal report HTML.
 *  `title` is the Codal letter Title (contains "منتهی به ۱۴۰۵/۰۵/۳۱") used to
 *  derive periodEnd. Pass a title with a parseable Jalali date, or null to skip
 *  periodEnd extraction (caller may set periodEnd afterwards). */
export function extractMonthlyReport(html, title) {
  const cells = extractCellsForTable(html, 1197);
  if (!cells || cells.length === 0) return null;

  const num = (rc, col) => {
    const c = cells.find(x => x.rowCode === rc && x.columnCode === col);
    if (!c || !c.value || !/^-?\d+$/.test(c.value)) return null;
    return parseInt(c.value, 10);
  };
  const label = (rc) =>
    (cells.find(x => x.rowCode === rc && x.columnCode === 1)?.value || "").trim() ||
    (cells.find(x => x.rowCode === rc && x.columnCode === 26)?.value || "").trim();
  const toRow = (rc) => {
    if (!cells.some(x => x.rowCode === rc)) return null;
    return {
      rowCode: rc, label: label(rc),
      qtyPeriod: num(rc, 14), valuePeriod: num(rc, 17),
      qtyYtd: num(rc, 18), valueYtd: num(rc, 21),
      qtyPriorYtd: num(rc, 22), valuePriorYtd: num(rc, 25),
      rowTypeName: (cells.find(x => x.rowCode === rc)?.rowTypeName) || "",
    };
  };

  // Product rows grouped by rowSequence
  const goods = [];
  const seqs = new Set();
  for (const c of cells) if (c.rowCode === 4 && c.rowSequence !== undefined) seqs.add(c.rowSequence);
  for (const seq of seqs) {
    const rc2 = cells.filter(x => x.rowCode === 4 && x.rowSequence === seq);
    if (!rc2.length) continue;
    const g = (c) => { const x = rc2.find(y => y.columnCode === c); return x && x.value ? (/^-?\d+$/.test(x.value) ? parseInt(x.value, 10) : null) : null; };
    goods.push({
      rowCode: 4,
      label: (rc2.find(x => x.columnCode === 26)?.value || rc2.find(x => x.columnCode === 1)?.value || "").trim(),
      qtyPeriod: g(14), valuePeriod: g(17), qtyYtd: g(18), valueYtd: g(21),
      qtyPriorYtd: g(22), valuePriorYtd: g(25),
      rowTypeName: rc2[0]?.rowTypeName || "",
    });
  }

  const totals = [];
  for (const rc of [5, 8, 11, 14, 15, 16]) { const r = toRow(rc); if (r) totals.push(r); }
  const totalRow = totals.find(t => t.rowCode === 16);
  const domRow = totals.find(t => t.rowCode === 5);
  const expRow = totals.find(t => t.rowCode === 8);

  const jalali = title ? extractPeriodEnd(title) : null;
  let periodEnd = null;
  if (jalali) periodEnd = `${jalali.getFullYear()}-${String(jalali.getMonth() + 1).padStart(2, "0")}-${String(jalali.getDate()).padStart(2, "0")}`;
  return {
    periodEnd, goods, totals,
    monthlySalesTotal: extractMonthlySales(html),
    ytdSalesTotal: totalRow?.valueYtd ?? null,
    priorYtdSalesTotal: totalRow?.valuePriorYtd ?? null,
    domesticMonthly: domRow?.valuePeriod ?? null,
    exportMonthly: expRow?.valuePeriod ?? null,
  };
}
