type ReportMetric = {
  label: string;
  value: string;
};

type ReportTable = {
  title: string;
  columns: string[];
  rows: string[][];
  emptyState?: string;
};

type ReportNote = {
  title: string;
  body: string;
};

export type ReportTemplateDocument = {
  title: string;
  subtitle: string;
  scope?: string;
  generatedAt: string;
  metrics: ReportMetric[];
  tables: ReportTable[];
  notes?: ReportNote[];
};

export type DailySummaryStoreReport = {
  storeName: string;
  storeSubtitle: string;
  salesBadge: string;
  stats: Array<{
    label: string;
    value: string;
    tone?: "default" | "danger" | "warning";
  }>;
  metricsTable: Array<{
    label: string;
    value: string;
    emphasized?: boolean;
  }>;
  topProducts: Array<{
    name: string;
    value: string;
  }>;
  sellerTotals: Array<{
    name: string;
    value: string;
  }>;
};

export type DailySummaryTotalsRow = {
  storeName: string;
  revenue: string;
  salesCount: string;
  averageCheck: string;
  returns: string;
  isTotal?: boolean;
};

export type DailySummaryReportDocument = {
  title: string;
  subtitle: string;
  reportDateLabel: string;
  periodLabel: string;
  generatedAt: string;
  summaryMetrics: ReportMetric[];
  stores: DailySummaryStoreReport[];
  footerMetrics: ReportMetric[];
  totalsRows: DailySummaryTotalsRow[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMetric(metric: ReportMetric) {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(metric.label)}</div>
      <div class="metric-value">${escapeHtml(metric.value)}</div>
    </div>
  `;
}

function renderTable(table: ReportTable) {
  const body =
    table.rows.length > 0
      ? table.rows
          .map(
            (row) => `
              <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
            `
          )
          .join("")
      : `
          <tr>
            <td colspan="${table.columns.length}" class="empty-cell">${escapeHtml(table.emptyState ?? "No data")}</td>
          </tr>
        `;

  return `
    <section class="section table-section">
      <div class="section-header">
        <h2>${escapeHtml(table.title)}</h2>
      </div>
      <div class="table-shell">
        <table>
          <thead>
            <tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderNote(note: ReportNote) {
  return `
    <div class="note-card">
      <div class="note-title">${escapeHtml(note.title)}</div>
      <div class="note-body">${escapeHtml(note.body)}</div>
    </div>
  `;
}

export function renderReportHtml(document: ReportTemplateDocument) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(document.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f3f5f8;
        --surface: #ffffff;
        --surface-soft: #f7f9fc;
        --text: #152033;
        --muted: #60708a;
        --line: #dce4ef;
        --accent: #295dff;
        --accent-soft: #edf3ff;
        --shadow: 0 18px 50px rgba(18, 34, 66, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 32px;
        background: linear-gradient(180deg, #eef3fa 0%, var(--bg) 100%);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .page {
        max-width: 1040px;
        margin: 0 auto;
      }

      .hero {
        background: var(--surface);
        border: 1px solid rgba(220, 228, 239, 0.8);
        border-radius: 28px;
        padding: 28px;
        box-shadow: var(--shadow);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 18px 0 10px;
        font-size: 34px;
        line-height: 1.08;
      }

      .subtitle {
        margin: 0;
        max-width: 680px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.6;
      }

      .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 20px;
      }

      .meta-pill {
        padding: 10px 14px;
        border-radius: 16px;
        background: var(--surface-soft);
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
      }

      .layout {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        gap: 20px;
        margin-top: 20px;
      }

      .metrics-section,
      .notes-section,
      .table-section {
        background: var(--surface);
        border: 1px solid rgba(220, 228, 239, 0.8);
        border-radius: 24px;
        padding: 22px;
        box-shadow: 0 10px 30px rgba(18, 34, 66, 0.05);
      }

      .metrics-section,
      .notes-section {
        grid-column: span 12;
      }

      .table-section {
        grid-column: span 12;
      }

      .section-header h2 {
        margin: 0 0 16px;
        font-size: 18px;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
      }

      .metric-card {
        padding: 16px 18px;
        border-radius: 20px;
        background: var(--surface-soft);
      }

      .metric-label {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.4;
      }

      .metric-value {
        margin-top: 10px;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.03em;
      }

      .notes-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .note-card {
        padding: 18px;
        border-radius: 20px;
        background: var(--accent-soft);
      }

      .note-title {
        font-size: 15px;
        font-weight: 700;
      }

      .note-body {
        margin-top: 8px;
        color: #4a5d82;
        font-size: 14px;
        line-height: 1.6;
      }

      .table-shell {
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 18px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        text-align: left;
        font-size: 14px;
      }

      th {
        background: var(--surface-soft);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      tbody tr:last-child td {
        border-bottom: 0;
      }

      .empty-cell {
        text-align: center;
        color: var(--muted);
      }

      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }

        .hero,
        .metrics-section,
        .notes-section,
        .table-section {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div class="eyebrow">Telegram Retail Report</div>
        <h1>${escapeHtml(document.title)}</h1>
        <p class="subtitle">${escapeHtml(document.subtitle)}</p>
        <div class="hero-meta">
          ${document.scope ? `<div class="meta-pill">Scope: ${escapeHtml(document.scope)}</div>` : ""}
          <div class="meta-pill">Generated: ${escapeHtml(document.generatedAt)}</div>
        </div>
      </section>

      <div class="layout">
        <section class="metrics-section">
          <div class="section-header">
            <h2>Overview</h2>
          </div>
          <div class="metrics-grid">
            ${document.metrics.map(renderMetric).join("")}
          </div>
        </section>

        ${document.notes?.length
          ? `
            <section class="notes-section">
              <div class="section-header">
                <h2>Highlights</h2>
              </div>
              <div class="notes-grid">
                ${document.notes.map(renderNote).join("")}
              </div>
            </section>
          `
          : ""}

        ${document.tables.map(renderTable).join("")}
      </div>
    </main>
  </body>
</html>`;
}

export function renderReportPlainText(document: ReportTemplateDocument) {
  const lines = [document.title, document.subtitle];

  if (document.scope) {
    lines.push(`Scope: ${document.scope}`);
  }

  lines.push(`Generated: ${document.generatedAt}`, "", "Overview:");

  document.metrics.forEach((metric) => {
    lines.push(`- ${metric.label}: ${metric.value}`);
  });

  if (document.notes?.length) {
    lines.push("", "Highlights:");
    document.notes.forEach((note) => {
      lines.push(`- ${note.title}: ${note.body}`);
    });
  }

  document.tables.forEach((table) => {
    lines.push("", `${table.title}:`);
    if (table.rows.length === 0) {
      lines.push(`- ${table.emptyState ?? "No data"}`);
      return;
    }

    table.rows.forEach((row) => {
      lines.push(`- ${row.join(" / ")}`);
    });
  });

  return lines;
}

export function renderDailySummaryReportHtml(document: DailySummaryReportDocument) {
  const renderStoreStat = (stat: DailySummaryStoreReport["stats"][number]) => `
    <div class="store-stat">
      <div class="store-stat-label">${escapeHtml(stat.label)}</div>
      <div class="store-stat-value ${stat.tone === "danger" ? "tone-danger" : stat.tone === "warning" ? "tone-warning" : ""}">${escapeHtml(stat.value)}</div>
    </div>
  `;

  const renderListRow = (entry: { name: string; value: string }) => `
    <div class="list-row">
      <span>${escapeHtml(entry.name)}</span>
      <strong>${escapeHtml(entry.value)}</strong>
    </div>
  `;

  const renderStore = (store: DailySummaryStoreReport) => `
    <section class="store-card">
      <div class="store-header">
        <div>
          <h3>${escapeHtml(store.storeName)}</h3>
          <p>${escapeHtml(store.storeSubtitle)}</p>
        </div>
        <div class="store-badge">${escapeHtml(store.salesBadge)}</div>
      </div>

      <div class="store-stats-grid">
        ${store.stats.map(renderStoreStat).join("")}
      </div>

      <div class="store-layout">
        <section class="section-card">
          <div class="section-title-row">
            <h4>Основные показатели</h4>
          </div>
          <table class="compact-table">
            <tbody>
              ${store.metricsTable
                .map(
                  (item) => `
                    <tr>
                      <td>${escapeHtml(item.label)}</td>
                      <td class="align-right">${item.emphasized ? "<strong>" : ""}${escapeHtml(item.value)}${item.emphasized ? "</strong>" : ""}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>

        <div class="side-stack">
          <section class="section-card">
            <div class="section-title-row">
              <h4>Топ товары</h4>
            </div>
            <div class="list-block">
              ${store.topProducts.length > 0 ? store.topProducts.map(renderListRow).join("") : '<div class="empty-state">Нет данных по продажам товаров.</div>'}
            </div>
          </section>

          <section class="section-card">
            <div class="section-title-row">
              <h4>Персонал</h4>
            </div>
            <div class="list-block">
              ${store.sellerTotals.length > 0 ? store.sellerTotals.map(renderListRow).join("") : '<div class="empty-state">Нет данных по продавцам за выбранный период.</div>'}
            </div>
          </section>
        </div>
      </div>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root {
      --bg: #eff3f8;
      --surface: #ffffff;
      --surface-soft: #f7f9fc;
      --surface-tint: #f1f5f9;
      --ink: #172033;
      --muted: #6b778c;
      --line: #d8e0ea;
      --line-strong: #c5d0dc;
      --accent: #1f314d;
      --accent-soft: #eef3fb;
      --danger: #bb3a2f;
      --warning: #9c5c1a;
      --shadow: 0 10px 28px rgba(17, 28, 45, 0.05);
      --radius-lg: 18px;
      --radius-md: 14px;
      --radius-sm: 12px;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      min-width: 0;
    }

    @page {
      size: A4;
      margin: 12mm;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      line-height: 1.35;
      font-size: 13px;
    }

    .page {
      max-width: 1040px;
      margin: 0 auto;
      padding: 14px;
    }

    .shell {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 18px;
      box-shadow: var(--shadow);
    }

    .report-head {
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    .report-title {
      margin: 0;
      font-size: 32px;
      line-height: 1.02;
      letter-spacing: -0.04em;
      font-weight: 780;
      color: var(--accent);
    }

    .report-subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
      max-width: 620px;
    }

    .meta-card {
      background: linear-gradient(180deg, #fbfcfe 0%, #f4f7fb 100%);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: 10px 14px;
    }

    .meta-row {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 10px;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }

    .meta-row:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .meta-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .meta-value {
      text-align: right;
      font-weight: 700;
      color: var(--ink);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 14px;
    }

    .summary-card {
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 14px;
    }

    .summary-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .summary-value {
      margin-top: 8px;
      font-size: 24px;
      line-height: 1;
      letter-spacing: -0.04em;
      font-weight: 780;
      color: var(--accent);
    }

    .block-title {
      margin: 18px 0 10px;
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent);
    }

    .store-card,
    .totals-card {
      page-break-inside: avoid;
      break-inside: avoid;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 6px 18px rgba(17, 28, 45, 0.04);
    }

    .store-card + .store-card {
      margin-top: 10px;
    }

    .store-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--line);
    }

    .store-header h3 {
      margin: 0;
      font-size: 18px;
      line-height: 1.05;
      letter-spacing: -0.03em;
      color: var(--accent);
    }

    .store-header p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 13px;
    }

    .store-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      border: 1px solid #d8e3f2;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }

    .store-stats-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      padding: 12px 16px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--line);
    }

    .store-stat {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
    }

    .store-stat-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
    }

    .store-stat-value {
      margin-top: 6px;
      font-size: 18px;
      line-height: 1;
      letter-spacing: -0.03em;
      font-weight: 780;
      color: var(--ink);
    }

    .tone-danger { color: var(--danger); }
    .tone-warning { color: var(--warning); }

    .store-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      padding: 12px 16px 16px;
    }

    .section-card {
      background: var(--surface-soft);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 10px 12px;
    }

    .section-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .section-title-row h4 {
      margin: 0;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--accent);
    }

    .compact-table,
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .compact-table td,
    .totals-table th,
    .totals-table td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }

    .compact-table tr:last-child td,
    .totals-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .compact-table td:first-child {
      color: var(--muted);
    }

    .align-right {
      text-align: right;
    }

    .side-stack {
      display: grid;
      gap: 10px;
    }

    .list-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 10px;
      padding: 7px 0;
      border-bottom: 1px dashed var(--line-strong);
    }

    .list-row:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .list-row span {
      color: var(--muted);
    }

    .list-row strong {
      color: var(--ink);
    }

    .empty-state {
      color: var(--muted);
      padding: 6px 0;
    }

    .totals-card {
      margin-top: 12px;
      padding: 14px 16px 16px;
      background: linear-gradient(180deg, #23324a 0%, #1b283d 100%);
      border-color: rgba(255, 255, 255, 0.06);
      color: white;
    }

    .totals-head {
      display: grid;
      gap: 8px;
      margin-bottom: 10px;
    }

    .totals-head h3 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.03em;
      font-weight: 760;
      color: white;
    }

    .totals-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.7);
    }

    .totals-metrics {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .totals-metric {
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .totals-metric-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: rgba(255, 255, 255, 0.62);
      font-weight: 700;
    }

    .totals-metric-value {
      margin-top: 6px;
      font-size: 18px;
      line-height: 1;
      letter-spacing: -0.03em;
      font-weight: 780;
      color: white;
    }

    .totals-table-wrap {
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04);
    }

    .totals-table th,
    .totals-table td {
      border-bottom-color: rgba(255, 255, 255, 0.08);
    }

    .totals-table th {
      color: rgba(255, 255, 255, 0.72);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      text-align: left;
    }

    .totals-table td {
      color: white;
    }

    @media (min-width: 800px) {
      .report-head {
        grid-template-columns: minmax(0, 1fr) 330px;
      }

      .summary-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .store-stats-grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .store-layout {
        grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.95fr);
      }

      .totals-metrics {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }

    @media print {
      body {
        background: white;
        font-size: 11px;
      }

      .page {
        padding: 0;
        max-width: none;
      }

      .shell {
        border-radius: 0;
        border: 0;
        box-shadow: none;
        padding: 0;
      }

      .report-head {
        grid-template-columns: minmax(0, 1fr) 290px;
        gap: 10px;
      }

      .report-title {
        font-size: 24px;
      }

      .report-subtitle {
        font-size: 12px;
        margin-top: 5px;
      }

      .meta-card,
      .summary-card,
      .store-card,
      .section-card,
      .totals-card,
      .store-stat {
        box-shadow: none;
      }

      .summary-grid,
      .store-stats-grid,
      .totals-metrics {
        gap: 6px;
      }

      .summary-card,
      .section-card,
      .store-stat,
      .totals-metric {
        padding: 8px 10px;
      }

      .store-header {
        padding: 10px 12px;
      }

      .store-stats-grid {
        padding: 10px 12px;
      }

      .store-layout {
        padding: 10px 12px 12px;
        gap: 8px;
      }

      .compact-table td,
      .totals-table th,
      .totals-table td {
        padding: 7px 8px;
      }

      .list-row {
        padding: 5px 0;
      }

      .totals-card {
        margin-top: 10px;
        padding: 12px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <main class="shell">
      <section class="report-head">
        <div>
          <h1 class="report-title">${escapeHtml(document.title)}</h1>
          <p class="report-subtitle">${escapeHtml(document.subtitle)}</p>
        </div>

        <div class="meta-card">
          <div class="meta-row">
            <span class="meta-label">Дата отчета</span>
            <span class="meta-value">${escapeHtml(document.reportDateLabel)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Период</span>
            <span class="meta-value">${escapeHtml(document.periodLabel)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Сформировано</span>
            <span class="meta-value">${escapeHtml(document.generatedAt)}</span>
          </div>
        </div>
      </section>

      <section class="summary-grid">
        ${document.summaryMetrics
          .map(
            (metric) => `
              <article class="summary-card">
                <div class="summary-label">${escapeHtml(metric.label)}</div>
                <div class="summary-value">${escapeHtml(metric.value)}</div>
              </article>
            `
          )
          .join("")}
      </section>

      <div class="block-title">Магазины</div>
      ${document.stores.map(renderStore).join("")}

      <section class="totals-card">
        <div class="totals-head">
          <h3>Общая сводка по всем магазинам</h3>
          <div class="totals-meta">
            <span>Дата: ${escapeHtml(document.reportDateLabel)}</span>
            <span>Интервал: ${escapeHtml(document.periodLabel)}</span>
          </div>
        </div>

        <div class="totals-metrics">
          ${document.footerMetrics
            .map(
              (metric) => `
                <div class="totals-metric">
                  <div class="totals-metric-label">${escapeHtml(metric.label)}</div>
                  <div class="totals-metric-value">${escapeHtml(metric.value)}</div>
                </div>
              `
            )
            .join("")}
        </div>

        <div class="totals-table-wrap">
          <table class="totals-table">
            <thead>
              <tr>
                <th>Магазин</th>
                <th class="align-right">Выручка</th>
                <th class="align-right">Продаж</th>
                <th class="align-right">Средний чек</th>
                <th class="align-right">Возвраты</th>
              </tr>
            </thead>
            <tbody>
              ${document.totalsRows
                .map(
                  (row) => `
                    <tr>
                      <td>${row.isTotal ? "<strong>" : ""}${escapeHtml(row.storeName)}${row.isTotal ? "</strong>" : ""}</td>
                      <td class="align-right">${row.isTotal ? "<strong>" : ""}${escapeHtml(row.revenue)}${row.isTotal ? "</strong>" : ""}</td>
                      <td class="align-right">${row.isTotal ? "<strong>" : ""}${escapeHtml(row.salesCount)}${row.isTotal ? "</strong>" : ""}</td>
                      <td class="align-right">${row.isTotal ? "<strong>" : ""}${escapeHtml(row.averageCheck)}${row.isTotal ? "</strong>" : ""}</td>
                      <td class="align-right">${row.isTotal ? "<strong>" : ""}${escapeHtml(row.returns)}${row.isTotal ? "</strong>" : ""}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

export function renderDailySummaryReportPlainText(document: DailySummaryReportDocument) {
  const lines = [
    document.title,
    document.subtitle,
    `Дата отчета: ${document.reportDateLabel}`,
    `Период: ${document.periodLabel}`,
    `Сформировано: ${document.generatedAt}`,
    "",
    "Ключевые показатели:",
  ];

  document.summaryMetrics.forEach((metric) => {
    lines.push(`- ${metric.label}: ${metric.value}`);
  });

  document.stores.forEach((store) => {
    lines.push("", `${store.storeName} (${store.storeSubtitle})`);
    store.stats.forEach((stat) => {
      lines.push(`- ${stat.label}: ${stat.value}`);
    });
    store.metricsTable.forEach((item) => {
      lines.push(`- ${item.label}: ${item.value}`);
    });
  });

  lines.push("", "Итоги по магазинам:");
  document.totalsRows.forEach((row) => {
    lines.push(`- ${row.storeName}: ${row.revenue} / ${row.salesCount} продаж / возвраты ${row.returns}`);
  });

  return lines;
}
