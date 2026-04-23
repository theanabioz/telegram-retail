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
  salesHighlightLabel: string;
  salesHighlightValue: string;
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
    <div class="metric-cell ${stat.tone === "danger" ? "metric-cell-danger" : stat.tone === "warning" ? "metric-cell-warning" : ""}">
      <div class="metric-term">${escapeHtml(stat.label)}</div>
      <div class="metric-number">${escapeHtml(stat.value)}</div>
    </div>
  `;

  const renderLedgerRow = (item: DailySummaryStoreReport["metricsTable"][number]) => `
    <tr class="${item.emphasized ? "row-emphasis" : ""}">
      <td>${escapeHtml(item.label)}</td>
      <td class="align-right">${escapeHtml(item.value)}</td>
    </tr>
  `;

  const renderListPanel = (
    title: string,
    rows: Array<{ name: string; value: string }>,
    emptyState: string
  ) => `
    <section class="panel">
      <div class="panel-title">${escapeHtml(title)}</div>
      ${
        rows.length > 0
          ? `
            <table class="list-table">
              <tbody>
                ${rows
                  .map(
                    (row) => `
                      <tr>
                        <td>${escapeHtml(row.name)}</td>
                        <td class="align-right">${escapeHtml(row.value)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          `
          : `<div class="panel-empty">${escapeHtml(emptyState)}</div>`
      }
    </section>
  `;

  const renderStore = (store: DailySummaryStoreReport) => `
    <section class="store-section">
      <div class="store-head">
        <div>
          <div class="store-eyebrow">Аналитика магазина</div>
          <h3 class="store-name">${escapeHtml(store.storeName)}</h3>
          <p class="store-subtitle">${escapeHtml(store.storeSubtitle)}</p>
        </div>

        <div class="store-highlight">
          <div class="store-highlight-label">${escapeHtml(store.salesHighlightLabel)}</div>
          <div class="store-highlight-value">${escapeHtml(store.salesHighlightValue)}</div>
        </div>
      </div>

      <div class="metric-band store-metrics">
        ${store.stats.map(renderStoreStat).join("")}
      </div>

      <div class="store-grid">
        <section class="panel">
          <div class="panel-title">Операционные показатели</div>
          <table class="ledger-table">
            <tbody>
              ${store.metricsTable.map(renderLedgerRow).join("")}
            </tbody>
          </table>
        </section>

        <div class="side-column">
          ${renderListPanel("Топ товары", store.topProducts, "За выбранный период нет продаж товаров.")}
          ${renderListPanel("Персонал", store.sellerTotals, "За выбранный период нет продавцов с продажами.")}
        </div>
      </div>
    </section>
  `;

  const storesLabel = `Магазинов в отчете: ${document.stores.length}`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(document.title)}</title>
  <style>
    :root {
      --page-bg: #f3f0ea;
      --paper: #ffffff;
      --paper-soft: #faf9f7;
      --panel: #f1f0ec;
      --panel-strong: #e7e3db;
      --line: #dfddd8;
      --line-strong: #c8c2b7;
      --text: #26221f;
      --muted: #66615a;
      --muted-strong: #4d4841;
      --accent: #223f78;
      --accent-soft: #eef5ff;
      --danger: #b24335;
      --warning: #8f5a18;
      --shadow: 0 18px 38px rgba(38, 34, 31, 0.08);
    }

    * {
      box-sizing: border-box;
      min-width: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      size: A4;
      margin: 10mm;
    }

    body {
      margin: 0;
      background: var(--page-bg);
      color: var(--text);
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
    }

    .page {
      max-width: 1040px;
      margin: 0 auto;
      padding: 18px;
    }

    .report {
      background: linear-gradient(180deg, #ffffff 0%, #fbfaf7 100%);
      border: 1px solid var(--line-strong);
      box-shadow: var(--shadow);
      padding: 28px 30px 24px;
    }

    .masthead {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
      padding-bottom: 18px;
      border-bottom: 2px solid var(--text);
    }

    .kicker {
      color: var(--accent);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .title {
      margin: 10px 0 0;
      font-size: 31px;
      line-height: 1.08;
      letter-spacing: -0.045em;
      font-weight: 800;
      color: var(--text);
    }

    .subtitle {
      margin: 12px 0 0;
      max-width: 640px;
      color: var(--muted);
      font-size: 13px;
    }

    .meta-panel {
      background: var(--paper-soft);
      border: 1px solid var(--line);
    }

    .meta-table,
    .ledger-table,
    .list-table,
    .network-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    .meta-table th,
    .meta-table td,
    .ledger-table td,
    .list-table td,
    .network-table th,
    .network-table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }

    .meta-table tr:last-child th,
    .meta-table tr:last-child td,
    .ledger-table tr:last-child td,
    .list-table tr:last-child td,
    .network-table tbody tr:last-child td {
      border-bottom: 0;
    }

    .meta-table th {
      width: 42%;
      text-align: left;
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .meta-table td {
      text-align: right;
      font-weight: 700;
      color: var(--text);
    }

    .section {
      margin-top: 22px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: end;
      gap: 16px;
      margin-bottom: 12px;
      padding: 12px 0 10px;
      border-top: 3px solid var(--accent);
      border-bottom: 1px solid var(--line);
      background: none;
    }

    .section-heading {
      display: block;
    }

    .section-title {
      margin: 0;
      display: inline-flex;
      align-items: center;
      padding: 8px 14px 9px;
      background: var(--accent);
      color: #ffffff;
      font-size: 14px;
      line-height: 1;
      letter-spacing: 0.12em;
      font-weight: 800;
      text-transform: uppercase;
    }

    .section-note {
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
      padding: 0;
      border: 0;
      background: none;
    }

    .metric-band {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--line);
      background: var(--panel);
    }

    .metric-cell {
      padding: 14px 16px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
      background: transparent;
    }

    .metric-cell:nth-child(2n) {
      border-right: 0;
    }

    .metric-cell:nth-last-child(-n + 2) {
      border-bottom: 0;
    }

    .metric-cell-danger .metric-number {
      color: var(--danger);
    }

    .metric-cell-warning .metric-number {
      color: var(--warning);
    }

    .metric-term {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .metric-number {
      margin-top: 8px;
      color: var(--text);
      font-size: 26px;
      line-height: 1;
      letter-spacing: -0.05em;
      font-weight: 800;
    }

    .store-section {
      page-break-inside: auto;
      break-inside: auto;
      padding: 16px 0 0;
      border-top: 1px solid var(--line);
    }

    .store-section:first-of-type {
      border-top: 0;
      padding-top: 0;
    }

    .store-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      align-items: end;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .store-eyebrow {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .store-name {
      margin: 8px 0 0;
      color: var(--text);
      font-size: 24px;
      line-height: 1.05;
      letter-spacing: -0.04em;
      font-weight: 800;
    }

    .store-subtitle {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    .store-highlight {
      padding-top: 10px;
      border-top: 3px solid var(--accent);
      text-align: left;
    }

    .store-highlight-label {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .store-highlight-value {
      margin-top: 8px;
      color: var(--accent);
      font-size: 28px;
      line-height: 1;
      letter-spacing: -0.05em;
      font-weight: 800;
    }

    .store-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .store-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      margin-top: 14px;
    }

    .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .panel-title {
      padding: 10px 12px;
      background: var(--paper);
      border-top: 2px solid var(--accent);
      border-bottom: 1px solid var(--line);
      color: var(--muted-strong);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .ledger-table td:first-child,
    .list-table td:first-child {
      color: var(--muted);
    }

    .ledger-table td:last-child,
    .list-table td:last-child,
    .align-right {
      text-align: right;
      font-weight: 700;
      color: var(--muted-strong);
    }

    .ledger-table .row-emphasis td:last-child {
      color: var(--accent);
      font-weight: 800;
    }

    .side-column {
      display: grid;
      gap: 14px;
    }

    .panel-empty {
      padding: 12px;
      color: var(--muted);
    }

    .empty-state {
      padding: 14px 16px;
      border: 1px dashed var(--line-strong);
      background: var(--paper-soft);
      color: var(--muted);
    }

    .network-overview {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--line);
      background: var(--panel);
      margin-bottom: 12px;
    }

    .network-stack {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .network-overview-item {
      padding: 12px 14px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .network-overview-item:nth-child(2n) {
      border-right: 0;
    }

    .network-overview-item:nth-last-child(-n + 2) {
      border-bottom: 0;
    }

    .network-overview-label {
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .network-overview-value {
      margin-top: 6px;
      color: var(--text);
      font-size: 18px;
      line-height: 1.05;
      letter-spacing: -0.03em;
      font-weight: 800;
    }

    .network-table-wrap {
      border: 1px solid var(--line);
      overflow: hidden;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .network-table th {
      background: var(--paper-soft);
      color: var(--muted);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-align: left;
    }

    .network-table td {
      color: var(--muted-strong);
    }

    .network-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .network-table .total-row td {
      background: var(--panel);
      color: var(--text);
      font-weight: 800;
    }

    @media (min-width: 800px) {
      .masthead {
        grid-template-columns: minmax(0, 1fr) 320px;
      }

      .metric-band {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      .metric-cell:nth-child(2n) {
        border-right: 1px solid var(--line);
      }

      .metric-cell:nth-child(4n) {
        border-right: 0;
      }

      .metric-cell:nth-last-child(-n + 2) {
        border-bottom: 1px solid var(--line);
      }

      .metric-cell:nth-last-child(-n + 4) {
        border-bottom: 0;
      }

      .store-head {
        grid-template-columns: minmax(0, 1fr) 240px;
      }

      .store-highlight {
        text-align: right;
      }

      .store-metrics {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .store-metrics .metric-cell:nth-child(2n) {
        border-right: 1px solid var(--line);
      }

      .store-metrics .metric-cell:nth-child(3n) {
        border-right: 0;
      }

      .store-metrics .metric-cell:nth-last-child(-n + 2) {
        border-bottom: 1px solid var(--line);
      }

      .store-metrics .metric-cell:nth-last-child(-n + 3) {
        border-bottom: 0;
      }

      .store-grid {
        grid-template-columns: minmax(0, 1.12fr) minmax(280px, 0.88fr);
      }
    }

    @media print {
      body {
        background: white;
        font-size: 10.8px;
      }

      .page {
        padding: 0;
        max-width: none;
      }

      .report {
        border: 0;
        box-shadow: none;
        padding: 18px 18px 14px;
      }

      .masthead {
        gap: 14px;
        padding-bottom: 14px;
      }

      .title {
        font-size: 25px;
      }

      .subtitle {
        font-size: 11px;
        margin-top: 8px;
      }

      .section {
        margin-top: 14px;
      }

      .section-header {
        margin-bottom: 7px;
        padding: 9px 0 7px;
        page-break-after: avoid;
        break-after: avoid-page;
      }

      .section-heading {
        display: block;
      }

      .metric-cell,
      .network-overview-item {
        padding: 9px 10px;
      }

      .metric-number {
        font-size: 20px;
      }

      .store-section {
        padding-top: 10px;
      }

      .store-name {
        font-size: 18px;
      }

      .store-highlight-value {
        font-size: 20px;
      }

      .store-grid {
        gap: 8px;
        margin-top: 8px;
      }

      .side-column {
        gap: 8px;
      }

      .store-head {
        gap: 10px;
        margin-bottom: 8px;
      }

      .meta-table th,
      .meta-table td,
      .ledger-table td,
      .list-table td,
      .network-table th,
      .network-table td {
        padding: 6px 7px;
      }

      .panel-title {
        padding: 6px 7px;
      }

      .network-overview {
        margin-bottom: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <main class="report">
      <header class="masthead">
        <div>
          <div class="kicker">Операционная отчетность</div>
          <h1 class="title">${escapeHtml(document.title)}</h1>
          <p class="subtitle">${escapeHtml(document.subtitle)}</p>
        </div>

        <aside class="meta-panel">
          <table class="meta-table">
            <tbody>
              <tr>
                <th>Дата отчета</th>
                <td>${escapeHtml(document.reportDateLabel)}</td>
              </tr>
              <tr>
                <th>Период</th>
                <td>${escapeHtml(document.periodLabel)}</td>
              </tr>
              <tr>
                <th>Сформировано</th>
                <td>${escapeHtml(document.generatedAt)}</td>
              </tr>
            </tbody>
          </table>
        </aside>
      </header>

      <section class="section">
        <div class="section-header">
          <div class="section-heading">
            <h2 class="section-title">Ключевые показатели</h2>
          </div>
          <div class="section-note">${escapeHtml(storesLabel)}</div>
        </div>

        <div class="metric-band">
          ${document.summaryMetrics
            .map(
              (metric) => `
                <article class="metric-cell">
                  <div class="metric-term">${escapeHtml(metric.label)}</div>
                  <div class="metric-number">${escapeHtml(metric.value)}</div>
                </article>
              `
            )
            .join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <div class="section-heading">
            <h2 class="section-title">Разрез по магазинам</h2>
          </div>
          <div class="section-note">${escapeHtml(document.periodLabel)}</div>
        </div>

        ${
          document.stores.length > 0
            ? document.stores.map(renderStore).join("")
            : '<div class="empty-state">За выбранный период не зафиксировано завершенных продаж и возвратов по магазинам.</div>'
        }
      </section>

      <section class="section">
        <div class="section-header">
          <div class="section-heading">
            <h2 class="section-title">Итог по сети</h2>
          </div>
          <div class="section-note">${escapeHtml(document.reportDateLabel)}</div>
        </div>

        <div class="network-stack">
          <div class="network-overview">
            ${document.footerMetrics
              .map(
                (metric) => `
                  <div class="network-overview-item">
                    <div class="network-overview-label">${escapeHtml(metric.label)}</div>
                    <div class="network-overview-value">${escapeHtml(metric.value)}</div>
                  </div>
                `
              )
              .join("")}
          </div>

          <div class="network-table-wrap">
            <table class="network-table">
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
                      <tr class="${row.isTotal ? "total-row" : ""}">
                        <td>${escapeHtml(row.storeName)}</td>
                        <td class="align-right">${escapeHtml(row.revenue)}</td>
                        <td class="align-right">${escapeHtml(row.salesCount)}</td>
                        <td class="align-right">${escapeHtml(row.averageCheck)}</td>
                        <td class="align-right">${escapeHtml(row.returns)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
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
    lines.push(`- ${store.salesHighlightLabel}: ${store.salesHighlightValue}`);
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
