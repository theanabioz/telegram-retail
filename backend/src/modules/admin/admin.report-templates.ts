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
    <div class="mini-stat">
      <div class="label">${escapeHtml(stat.label)}</div>
      <div class="value ${stat.tone === "danger" ? "danger" : stat.tone === "warning" ? "warning" : ""}">${escapeHtml(stat.value)}</div>
    </div>
  `;

  const renderKeyValue = (entry: { name: string; value: string }) => `
    <div class="kv"><span>${escapeHtml(entry.name)}</span><strong>${escapeHtml(entry.value)}</strong></div>
  `;

  const renderStore = (store: DailySummaryStoreReport) => `
    <section class="store-card">
      <div class="store-head">
        <div>
          <div class="store-title-row">
            <h3 class="store-name">${escapeHtml(store.storeName)}</h3>
          </div>
          <p class="store-subtitle">${escapeHtml(store.storeSubtitle)}</p>
        </div>
        <div class="store-badge">${escapeHtml(store.salesBadge)}</div>
      </div>

      <div class="store-stats">
        ${store.stats.map(renderStoreStat).join("")}
      </div>

      <div class="content-grid">
        <div>
          <table>
            <thead>
              <tr>
                <th>Показатель</th>
                <th class="align-right">Значение</th>
              </tr>
            </thead>
            <tbody>
              ${store.metricsTable
                .map(
                  (item) =>
                    `<tr><td>${escapeHtml(item.label)}</td><td class="align-right">${item.emphasized ? "<strong>" : ""}${escapeHtml(item.value)}${item.emphasized ? "</strong>" : ""}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <div>
          <div class="panel">
            <h4>Топ товары</h4>
            ${store.topProducts.length > 0 ? store.topProducts.map(renderKeyValue).join("") : '<div class="muted">Нет данных по продажам товаров.</div>'}
          </div>
          <div class="panel">
            <h4>Персонал</h4>
            ${store.sellerTotals.length > 0 ? store.sellerTotals.map(renderKeyValue).join("") : '<div class="muted">Нет данных по продавцам за выбранный период.</div>'}
          </div>
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
      --bg: #eef2f6;
      --surface: #ffffff;
      --surface-subtle: #f8fafc;
      --text: #0f172a;
      --text-soft: #475569;
      --muted: #64748b;
      --line: #dbe3ec;
      --line-strong: #c8d3df;
      --accent: #1e3a5f;
      --accent-ghost: #eaf1f8;
      --success: #166534;
      --danger: #b91c1c;
      --warning: #92400e;
      --radius: 12px;
      --radius-lg: 16px;
      --shadow-soft: 0 4px 14px rgba(15, 23, 42, 0.035);
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      min-width: 0;
    }

    @page {
      size: A4;
      margin: 14mm;
    }

    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.45;
      font-size: 14px;
      overflow-wrap: anywhere;
    }

    .page {
      width: 100%;
      max-width: 1120px;
      margin: 0 auto;
      padding: 10px;
    }

    .header,
    .stat-card,
    .store-card,
    .footer-summary {
      width: 100%;
      overflow: hidden;
    }

    .header {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: 16px;
      box-shadow: var(--shadow-soft);
      margin-bottom: 10px;
    }

    .header-top {
      display: grid;
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .brand h1 {
      margin: 0 0 8px;
      font-size: clamp(24px, 5vw, 30px);
      line-height: 1.08;
      letter-spacing: -0.03em;
      font-weight: 760;
    }

    .brand p {
      margin: 0;
      color: var(--text-soft);
      font-size: 13px;
      max-width: 760px;
    }

    .meta {
      width: 100%;
      background: var(--surface-subtle);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 12px 14px;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line);
    }

    .meta-row:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .meta-label {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .meta-value {
      font-weight: 700;
      text-align: right;
    }

    .summary-grid,
    .footer-grid,
    .store-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .summary-grid {
      margin: 10px 0 14px;
    }

    .stat-card,
    .mini-stat {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 12px;
      box-shadow: var(--shadow-soft);
    }

    .stat-label,
    .mini-stat .label,
    .footer-card .label {
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stat-value,
    .mini-stat .value,
    .footer-card .value {
      font-size: clamp(22px, 5vw, 28px);
      font-weight: 760;
      letter-spacing: -0.03em;
      line-height: 1.05;
    }

    .section-title {
      font-size: 17px;
      margin: 14px 0 8px;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 800;
    }

    .store-card {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-soft);
      margin-bottom: 10px;
      page-break-inside: avoid;
    }

    .store-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }

    .store-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .store-name {
      font-size: clamp(22px, 4.2vw, 28px);
      font-weight: 780;
      line-height: 1.05;
      margin: 0;
      letter-spacing: -0.04em;
    }

    .store-subtitle {
      margin: 4px 0 0;
      color: var(--text-soft);
      font-size: 13px;
    }

    .store-badge {
      width: fit-content;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-ghost);
      border: 1px solid #d4e0ec;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }

    .store-stats {
      padding: 12px;
      border-bottom: 1px solid var(--line);
      background: var(--surface-subtle);
    }

    .content-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      padding: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
    }

    th, td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      background: var(--surface-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td strong {
      font-weight: 800;
    }

    .align-right {
      text-align: right;
    }

    .panel {
      background: var(--surface-subtle);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 10px;
    }

    .panel h4 {
      margin: 0 0 10px;
      font-size: 12px;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .kv {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px dashed var(--line-strong);
    }

    .kv:last-child {
      border-bottom: 0;
      padding-bottom: 0;
    }

    .kv span:first-child {
      color: var(--text-soft);
    }

    .kv strong {
      text-align: right;
      flex: 0 0 auto;
    }

    .muted {
      color: var(--muted);
    }

    .danger { color: var(--danger); }
    .warning { color: var(--warning); }

    .footer-summary {
      margin-top: 12px;
      background: #13263d;
      color: white;
      border-radius: 16px;
      padding: 14px;
      page-break-inside: avoid;
    }

    .footer-summary-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      margin-bottom: 10px;
    }

    .footer-summary h2 {
      margin: 0;
      font-size: clamp(20px, 6vw, 30px);
      letter-spacing: -0.03em;
      font-weight: 760;
    }

    .footer-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      align-items: center;
      font-size: 11px;
      color: rgba(255, 255, 255, 0.72);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .footer-card {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      padding: 12px;
    }

    .totals-table-wrap {
      width: 100%;
      display: block;
      margin-top: 12px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.05);
    }

    .totals-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      background: transparent;
    }

    .totals-table th,
    .totals-table td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      color: white;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .totals-table th {
      color: rgba(255, 255, 255, 0.72);
      background: rgba(255, 255, 255, 0.04);
      font-size: 11px;
      font-weight: 800;
      text-align: left;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .totals-table th.align-right,
    .totals-table td.align-right {
      text-align: right;
    }

    @media (min-width: 768px) {
      .header-top {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
      }

      .meta {
        min-width: 280px;
        width: auto;
      }

      .summary-grid,
      .footer-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .store-stats {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }

      .content-grid {
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
      }

      .footer-summary-head {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: end;
        gap: 12px;
      }
    }

    @media print {
      body {
        background: white;
        font-size: 10px;
      }

      .page {
        padding: 0;
        max-width: none;
      }

      .header {
        padding: 12px;
        margin-bottom: 8px;
      }

      .summary-grid {
        margin: 8px 0 10px;
        gap: 8px;
      }

      .stat-card,
      .mini-stat,
      .footer-card {
        padding: 10px;
      }

      .section-title {
        margin: 10px 0 6px;
        font-size: 15px;
      }

      .store-card {
        margin-bottom: 8px;
      }

      .store-head {
        padding: 10px 12px;
      }

      .store-stats {
        padding: 10px 12px;
        gap: 8px;
      }

      .content-grid {
        gap: 8px;
        padding: 10px 12px 12px;
      }

      .panel {
        padding: 10px;
        margin-bottom: 8px;
      }

      .kv {
        padding: 5px 0;
      }

      th,
      td {
        padding: 8px 10px;
      }

      .footer-summary {
        margin-top: 8px;
        padding: 12px;
      }

      .footer-summary-head {
        margin-bottom: 8px;
      }

      .footer-grid {
        gap: 8px;
      }

      .totals-table-wrap {
        margin-top: 10px;
      }

      .header,
      .stat-card,
      .mini-stat,
      .store-card,
      .footer-summary {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-top">
        <div class="brand">
          <h1>${escapeHtml(document.title)}</h1>
          <p>${escapeHtml(document.subtitle)}</p>
        </div>

        <div class="meta">
          <div class="meta-row">
            <span class="meta-label">Дата отчета</span>
            <strong class="meta-value">${escapeHtml(document.reportDateLabel)}</strong>
          </div>
          <div class="meta-row">
            <span class="meta-label">Период</span>
            <strong class="meta-value">${escapeHtml(document.periodLabel)}</strong>
          </div>
          <div class="meta-row">
            <span class="meta-label">Сформировано</span>
            <strong class="meta-value">${escapeHtml(document.generatedAt)}</strong>
          </div>
        </div>
      </div>
    </header>

    <section class="summary-grid">
      ${document.summaryMetrics
        .map(
          (metric) => `
            <div class="stat-card">
              <div class="stat-label">${escapeHtml(metric.label)}</div>
              <div class="stat-value">${escapeHtml(metric.value)}</div>
            </div>
          `
        )
        .join("")}
    </section>

    <h2 class="section-title">Магазины</h2>
    ${document.stores.map(renderStore).join("")}

    <section class="footer-summary">
      <div class="footer-summary-head">
        <h2>Общая сводка по всем магазинам</h2>
        <div class="footer-meta">
          <span>Дата: ${escapeHtml(document.reportDateLabel)}</span>
          <span>Интервал: ${escapeHtml(document.periodLabel)}</span>
        </div>
      </div>

      <div class="footer-grid">
        ${document.footerMetrics
          .map(
            (metric) => `
              <div class="footer-card">
                <div class="label">${escapeHtml(metric.label)}</div>
                <div class="value">${escapeHtml(metric.value)}</div>
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
