import { env } from "../../config.js";
import { getBusinessDateInput, getBusinessDayRange } from "../../lib/business-time.js";
import { maybeOne, queryDb } from "../../lib/db.js";
import { HttpError } from "../../lib/http-error.js";
import { createPdfFromHtml } from "../../lib/report-pdf.js";
import { createSimplePdf } from "../../lib/simple-pdf.js";
import { sendTelegramDocument } from "../../lib/telegram-api.js";
import {
  listAdminReturnItems,
  listAdminReturns,
  listAdminSaleItems,
  listAdminSales,
  listAdminStores,
  listAdminUsers,
} from "./admin.repository.js";
import {
  renderDailySummaryReportHtml,
  renderDailySummaryReportPlainText,
  renderReportHtml,
  renderReportPlainText,
  type DailySummaryReportDocument,
  type ReportTemplateDocument,
} from "./admin.report-templates.js";

type ReportRequestInput = {
  adminUserId: string;
  type: "daily_summary" | "store" | "seller" | "schedule";
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  rangeMode?: "to_date" | "full_days";
  storeId?: string;
  sellerId?: string;
  period?: "week" | "month";
  periodAnchorDate?: string;
};

type ReportRange = {
  label: string;
  dateFrom: string;
  dateTo: string;
};

type ShiftReportRow = {
  id: string;
  user_id: string;
  store_id: string;
  status: "active" | "paused" | "closed";
  started_at: string;
  ended_at: string | null;
  paused_total_seconds: number | string;
};

function formatDateInput(date = new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpError(400, "Report date must use YYYY-MM-DD format");
  }

  return date;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function monthEnd(date: string) {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function buildDayRange(date?: string): ReportRange {
  const normalizedDate = formatDateInput(date);
  const range = getBusinessDayRange(new Date(`${normalizedDate}T12:00:00.000Z`));

  return {
    label: normalizedDate,
    ...range,
  };
}

function buildDateRange(input: Pick<ReportRequestInput, "date" | "dateFrom" | "dateTo" | "rangeMode">): ReportRange {
  if (input.dateFrom || input.dateTo) {
    if (!input.dateFrom || !input.dateTo) {
      throw new HttpError(400, "Report date range requires dateFrom and dateTo");
    }

    const from = formatDateInput(input.dateFrom);
    const to = formatDateInput(input.dateTo);
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const startRange = buildDayRange(start);
    const endRange = buildDayRange(end);

    return {
      label: start === end ? start : `${start} - ${end}`,
      dateFrom: startRange.dateFrom,
      dateTo:
        input.rangeMode === "to_date" && end === getBusinessDateInput()
          ? new Date().toISOString()
          : endRange.dateTo,
    };
  }

  const dayRange = buildDayRange(input.date);

  return {
    ...dayRange,
    dateTo:
      input.rangeMode === "to_date" && formatDateInput(input.date) === getBusinessDateInput()
        ? new Date().toISOString()
        : dayRange.dateTo,
  };
}

function buildScheduleRange(input: Pick<ReportRequestInput, "period" | "periodAnchorDate" | "dateFrom" | "dateTo" | "rangeMode">): ReportRange {
  if (input.dateFrom || input.dateTo) {
    return buildDateRange(input);
  }

  const anchor = formatDateInput(input.periodAnchorDate);

  if (input.period === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const end = monthEnd(anchor);
    const startRange = buildDayRange(start);
    const endRange = buildDayRange(end);

    return {
      label: `${start.slice(0, 7)}`,
      dateFrom: startRange.dateFrom,
      dateTo: endRange.dateTo,
    };
  }

  const anchorDate = new Date(`${anchor}T12:00:00.000Z`);
  const weekday = anchorDate.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(anchor, mondayOffset);
  const end = addDays(start, 6);
  const startRange = buildDayRange(start);
  const endRange = buildDayRange(end);

  return {
    label: `${start} - ${end}`,
    dateFrom: startRange.dateFrom,
    dateTo: endRange.dateTo,
  };
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} EUR`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDisplayDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: env.APP_TIME_ZONE,
  }).format(date);
}

function formatFilenameDate(value: string) {
  return formatDisplayDate(value).replaceAll("/", ".");
}

function formatDateTime(value: string) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function formatDisplayDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: env.APP_TIME_ZONE,
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h ${rest}m`;
}

function summarizeSales(input: Awaited<ReturnType<typeof listAdminSales>>) {
  const completed = input.filter((sale) => sale.status === "completed");
  const cash = completed.filter((sale) => sale.payment_method === "cash");
  const card = completed.filter((sale) => sale.payment_method === "card");

  return {
    completedCount: completed.length,
    revenue: completed.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
    cashCount: cash.length,
    cashRevenue: cash.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
    cardCount: card.length,
    cardRevenue: card.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
  };
}

function formatGeneratedAt() {
  return formatDateTime(new Date().toISOString());
}

function formatGeneratedAtDisplay() {
  return formatDisplayDateTime(new Date().toISOString());
}

function buildPeriodLabel(range: ReportRange) {
  return `${formatDisplayDateTime(range.dateFrom)} – ${formatDisplayDateTime(range.dateTo)}`;
}

function buildReportFilename(title: string, rangeLabel: string) {
  const dateLabel = rangeLabel.includes(" - ")
    ? `${formatFilenameDate(rangeLabel.slice(0, 10))} - ${formatFilenameDate(rangeLabel.slice(-10))}`
    : formatFilenameDate(rangeLabel);
  return `${title} ${dateLabel}.pdf`;
}

function formatBestHourLabel(hour: number | null) {
  if (hour === null) {
    return "Нет данных";
  }

  const nextHour = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00–${String(nextHour).padStart(2, "0")}:00`;
}

function pluralizeSellers(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} продавец за день`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} продавца за день`;
  }
  return `${count} продавцов за день`;
}

async function loadSalesReportData(range: ReportRange, filters: { storeId?: string; sellerId?: string }) {
  const [sales, returns, stores, users] = await Promise.all([
    listAdminSales(4000, { ...filters, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    listAdminReturns(4000, { ...filters, dateFrom: range.dateFrom, dateTo: range.dateTo }),
    listAdminStores(),
    listAdminUsers(),
  ]);
  const [saleItems, returnItems] = await Promise.all([
    listAdminSaleItems(sales.map((sale) => sale.id)),
    listAdminReturnItems(returns.map((entry) => entry.id)),
  ]);

  return { sales, returns, stores, users, saleItems, returnItems };
}

async function loadShiftRows(range: ReportRange) {
  const result = await queryDb<ShiftReportRow>(
    `select id, user_id, store_id, status, started_at, ended_at, paused_total_seconds
     from public.shifts
     where started_at >= $1
       and started_at <= $2
     order by started_at asc`,
    [range.dateFrom, range.dateTo]
  );

  return result.rows.map((row) => ({
    ...row,
    paused_total_seconds: Number(row.paused_total_seconds),
  }));
}

function buildDailySummaryReportDocument(range: ReportRange, data: Awaited<ReturnType<typeof loadSalesReportData>>): DailySummaryReportDocument {
  const completedSales = data.sales.filter((sale) => sale.status === "completed");
  const salesSummary = summarizeSales(data.sales);
  const returnsTotal = data.returns.reduce((sum, entry) => sum + Number(entry.total_amount), 0);
  const soldUnits = data.saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const discountTotal = completedSales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);

  const storesById = new Map(data.stores.map((store) => [store.id, store]));
  const usersById = new Map(data.users.map((user) => [user.id, user]));
  const saleById = new Map(data.sales.map((sale) => [sale.id, sale]));
  const storeSales = new Map<string, typeof completedSales>();
  const storeReturns = new Map<string, typeof data.returns>();
  const storeSaleItems = new Map<string, typeof data.saleItems>();

  completedSales.forEach((sale) => {
    const bucket = storeSales.get(sale.store_id) ?? [];
    bucket.push(sale);
    storeSales.set(sale.store_id, bucket);
  });

  data.returns.forEach((entry) => {
    const bucket = storeReturns.get(entry.store_id) ?? [];
    bucket.push(entry);
    storeReturns.set(entry.store_id, bucket);
  });

  data.saleItems.forEach((item) => {
    const sale = saleById.get(item.sale_id);
    if (!sale || sale.status !== "completed") {
      return;
    }
    const bucket = storeSaleItems.get(sale.store_id) ?? [];
    bucket.push(item);
    storeSaleItems.set(sale.store_id, bucket);
  });

  const rankedStores = [...data.stores]
    .map((store) => {
      const sales = storeSales.get(store.id) ?? [];
      const returns = storeReturns.get(store.id) ?? [];
      const saleItems = storeSaleItems.get(store.id) ?? [];
      const revenue = sales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
      const cashRevenue = sales
        .filter((sale) => sale.payment_method === "cash")
        .reduce((sum, sale) => sum + Number(sale.total_amount), 0);
      const cardRevenue = sales
        .filter((sale) => sale.payment_method === "card")
        .reduce((sum, sale) => sum + Number(sale.total_amount), 0);
      const returnsAmount = returns.reduce((sum, entry) => sum + Number(entry.total_amount), 0);
      const discounts = sales.reduce((sum, sale) => sum + Number(sale.discount_amount), 0);
      const grossRevenue = sales.reduce((sum, sale) => sum + Number(sale.subtotal_amount), 0);
      const itemsSold = saleItems.reduce((sum, item) => sum + Number(item.quantity), 0);
      const uniqueSellerIds = new Set(sales.map((sale) => sale.seller_id));
      const avgCheck = sales.length > 0 ? revenue / sales.length : 0;

      const productLeaders = [...saleItems].reduce<Map<string, { name: string; quantity: number }>>((map, item) => {
        const current = map.get(item.product_id) ?? { name: item.product_name_snapshot, quantity: 0 };
        current.quantity += Number(item.quantity);
        map.set(item.product_id, current);
        return map;
      }, new Map());

      const sellerLeaders = sales.reduce<Map<string, number>>((map, sale) => {
        map.set(sale.seller_id, (map.get(sale.seller_id) ?? 0) + Number(sale.total_amount));
        return map;
      }, new Map());

      const hours = sales.reduce<Map<number, number>>((map, sale) => {
        const hour = new Date(sale.created_at).getUTCHours();
        map.set(hour, (map.get(hour) ?? 0) + 1);
        return map;
      }, new Map());

      const bestHourEntry =
        [...hours.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] ?? null;

      return {
        store,
        revenue,
        salesCount: sales.length,
        avgCheck,
        cashRevenue,
        cardRevenue,
        returnsAmount,
        discounts,
        grossRevenue,
        itemsSold,
        sellersPerDay: uniqueSellerIds.size,
        bestHour: bestHourEntry?.[0] ?? null,
        topProducts: [...productLeaders.values()]
          .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name))
          .slice(0, 3)
          .map((item) => ({ name: item.name, value: `${item.quantity} шт` })),
        sellerTotals: [...sellerLeaders.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 4)
          .map(([sellerId, total]) => ({
            name: usersById.get(sellerId)?.full_name ?? "Неизвестный продавец",
            value: formatCurrency(total),
          })),
      };
    })
    .filter((entry) => entry.salesCount > 0 || entry.returnsAmount > 0)
    .sort((left, right) => right.revenue - left.revenue || left.store.name.localeCompare(right.store.name));

  return {
    title: range.label.includes(" - ") ? "Сводный отчет за период" : "Сводный отчет за торговый день",
    subtitle: range.label.includes(" - ")
      ? "Сводка по магазинам, продажам, возвратам, среднему чеку и ключевым итогам за выбранный период."
      : "Сводка по магазинам, продажам, возвратам, среднему чеку и ключевым итогам за торговый день.",
    reportDateLabel: range.label.includes(" - ")
      ? `${formatDisplayDate(range.label.slice(0, 10))} – ${formatDisplayDate(range.label.slice(-10))}`
      : formatDisplayDate(range.label),
    periodLabel: buildPeriodLabel(range),
    generatedAt: formatGeneratedAtDisplay(),
    summaryMetrics: [
      { label: "Общая выручка", value: formatCurrency(salesSummary.revenue) },
      { label: "Всего продаж", value: String(salesSummary.completedCount) },
      { label: "Средний чек", value: formatCurrency(salesSummary.completedCount > 0 ? salesSummary.revenue / salesSummary.completedCount : 0) },
      { label: "Возвраты", value: formatCurrency(returnsTotal) },
    ],
    stores: rankedStores.map((entry) => ({
      storeName: entry.store.name,
      storeSubtitle: `${entry.store.address ?? "Адрес не указан"} · ${pluralizeSellers(entry.sellersPerDay)}`,
      salesBadge: `${range.label.includes(" - ") ? "Выручка за период" : "Выручка за день"}: ${formatCurrency(entry.revenue)}`,
      stats: [
        { label: "Продаж", value: String(entry.salesCount) },
        { label: "Средний чек", value: formatCurrency(entry.avgCheck) },
        { label: "Наличные", value: formatCurrency(entry.cashRevenue) },
        { label: "Карта", value: formatCurrency(entry.cardRevenue) },
        { label: "Возвраты", value: formatCurrency(entry.returnsAmount), tone: "danger" },
        { label: "Скидки", value: formatCurrency(entry.discounts), tone: "warning" },
      ],
      metricsTable: [
        { label: "Выручка до скидок", value: formatCurrency(entry.grossRevenue), emphasized: true },
        { label: "Скидки", value: formatCurrency(entry.discounts) },
        { label: "Возвраты", value: formatCurrency(entry.returnsAmount) },
        { label: "Продано товаров", value: String(entry.itemsSold) },
        { label: "Лучший час продаж", value: formatBestHourLabel(entry.bestHour) },
      ],
      topProducts: entry.topProducts,
      sellerTotals: entry.sellerTotals,
    })),
    footerMetrics: [
      { label: "Итоговая выручка", value: formatCurrency(salesSummary.revenue) },
      { label: "Всего продаж", value: String(salesSummary.completedCount) },
      { label: "Средний чек", value: formatCurrency(salesSummary.completedCount > 0 ? salesSummary.revenue / salesSummary.completedCount : 0) },
      { label: "Продано товаров", value: String(soldUnits) },
    ],
    totalsRows: [
      ...rankedStores.map((entry) => ({
        storeName: entry.store.name,
        revenue: formatCurrency(entry.revenue),
        salesCount: String(entry.salesCount),
        averageCheck: formatCurrency(entry.avgCheck),
        returns: formatCurrency(entry.returnsAmount),
      })),
      {
        storeName: "Итого",
        revenue: formatCurrency(salesSummary.revenue),
        salesCount: String(salesSummary.completedCount),
        averageCheck: formatCurrency(salesSummary.completedCount > 0 ? salesSummary.revenue / salesSummary.completedCount : 0),
        returns: formatCurrency(returnsTotal),
        isTotal: true,
      },
    ],
  };
}

function buildSalesReportDocument(input: {
  title: string;
  subtitle: string;
  range: ReportRange;
  data: Awaited<ReturnType<typeof loadSalesReportData>>;
  scope?: string;
}): ReportTemplateDocument {
  const salesSummary = summarizeSales(input.data.sales);
  const returnedUnits = input.data.returnItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const returnsTotal = input.data.returns.reduce((sum, entry) => sum + Number(entry.total_amount), 0);

  const storeMap = new Map(input.data.stores.map((store) => [store.id, store.name]));
  const userMap = new Map(input.data.users.map((user) => [user.id, user.full_name]));
  const byStore = new Map<string, number>();
  const bySeller = new Map<string, number>();

  input.data.sales
    .filter((sale) => sale.status === "completed")
    .forEach((sale) => {
      byStore.set(sale.store_id, (byStore.get(sale.store_id) ?? 0) + Number(sale.total_amount));
      bySeller.set(sale.seller_id, (bySeller.get(sale.seller_id) ?? 0) + Number(sale.total_amount));
    });

  const topProducts = [...input.data.saleItems]
    .reduce<Map<string, { name: string; quantity: number; total: number }>>((map, item) => {
      const current = map.get(item.product_id) ?? { name: item.product_name_snapshot, quantity: 0, total: 0 };
      current.quantity += Number(item.quantity);
      current.total += Number(item.line_total);
      map.set(item.product_id, current);
      return map;
    }, new Map());

  return {
    title: input.title,
    subtitle: `${input.subtitle} Period: ${input.range.label}.`,
    scope: input.scope,
    generatedAt: formatGeneratedAt(),
    metrics: [
      { label: "Completed sales", value: String(salesSummary.completedCount) },
      { label: "Revenue", value: formatMoney(salesSummary.revenue) },
      { label: "Cash", value: `${salesSummary.cashCount} / ${formatMoney(salesSummary.cashRevenue)}` },
      { label: "Card", value: `${salesSummary.cardCount} / ${formatMoney(salesSummary.cardRevenue)}` },
      { label: "Returns", value: `${input.data.returns.length} / ${formatMoney(returnsTotal)}` },
      { label: "Returned units", value: String(returnedUnits) },
    ],
    notes: [
      {
        title: "Range",
        body: `Business range ${input.range.dateFrom} to ${input.range.dateTo}.`,
      },
      {
        title: "Coverage",
        body: input.scope
          ? `The report is filtered to ${input.scope}.`
          : "The report aggregates all stores, sellers, and completed operations in the selected period.",
      },
    ],
    tables: [
      {
        title: "Revenue by Store",
        columns: ["Store", "Revenue"],
        rows: [...byStore.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([storeId, total]) => [storeMap.get(storeId) ?? "Unknown store", formatMoney(total)]),
        emptyState: "No completed sales in this period.",
      },
      {
        title: "Revenue by Seller",
        columns: ["Seller", "Revenue"],
        rows: [...bySeller.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([sellerId, total]) => [userMap.get(sellerId) ?? "Unknown seller", formatMoney(total)]),
        emptyState: "No seller revenue for this period.",
      },
      {
        title: "Top Products",
        columns: ["Product", "Units", "Revenue"],
        rows: [...topProducts.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, 8)
      .map((item) => [item.name, `${item.quantity} pcs`, formatMoney(item.total)]),
        emptyState: "No product sales for this period.",
      },
    ],
  };
}

async function buildScheduleReportDocument(range: ReportRange): Promise<ReportTemplateDocument> {
  const [shifts, stores, users] = await Promise.all([loadShiftRows(range), listAdminStores(), listAdminUsers()]);
  const storeMap = new Map(stores.map((store) => [store.id, store.name]));
  const userMap = new Map(users.map((user) => [user.id, user.full_name]));

  const rows = shifts.map((shift) => {
      const started = new Date(shift.started_at).toISOString().slice(0, 16).replace("T", " ");
      const ended = shift.ended_at ? new Date(shift.ended_at).toISOString().slice(0, 16).replace("T", " ") : "open";
      const totalSeconds = shift.ended_at
        ? Math.max(0, Math.floor((new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 1000))
        : 0;
      const workedSeconds = Math.max(0, totalSeconds - Number(shift.paused_total_seconds));
      return [
        userMap.get(shift.user_id) ?? "Unknown seller",
        storeMap.get(shift.store_id) ?? "Unknown store",
        started,
        ended,
        formatDuration(workedSeconds),
      ];
    });

  return {
    title: "Work Schedule Report",
    subtitle: `Shift coverage for period ${range.label}.`,
    generatedAt: formatGeneratedAt(),
    metrics: [
      { label: "Period", value: range.label },
      { label: "Shifts", value: String(shifts.length) },
      { label: "Open shifts", value: String(shifts.filter((shift) => !shift.ended_at).length) },
    ],
    notes: [
      {
        title: "Business window",
        body: `Included shifts started between ${range.dateFrom} and ${range.dateTo}.`,
      },
    ],
    tables: [
      {
        title: "Shift Details",
        columns: ["Seller", "Store", "Started", "Ended", "Worked"],
        rows,
        emptyState: "No shifts found for this period.",
      },
    ],
  };
}

async function resolveReport(input: ReportRequestInput) {
  if (input.type === "schedule") {
    const range = buildScheduleRange(input);
    const document = await buildScheduleReportDocument(range);
    return {
      title: document.title,
      filename: buildReportFilename("График работы", range.label),
      html: renderReportHtml(document),
      lines: renderReportPlainText(document),
    };
  }

  const range = buildDateRange(input);
  const stores = await listAdminStores();
  const users = await listAdminUsers();

  if (input.type === "store" && !stores.some((store) => store.id === input.storeId)) {
    throw new HttpError(404, "Store not found");
  }

  if (input.type === "seller" && !users.some((user) => user.id === input.sellerId && user.role === "seller")) {
    throw new HttpError(404, "Seller not found");
  }

  const storeName = stores.find((store) => store.id === input.storeId)?.name;
  const sellerName = users.find((user) => user.id === input.sellerId)?.full_name;
  const data = await loadSalesReportData(range, {
    storeId: input.type === "store" ? input.storeId : undefined,
    sellerId: input.type === "seller" ? input.sellerId : undefined,
  });

  if (input.type === "daily_summary") {
    const document = buildDailySummaryReportDocument(range, data);
    return {
      title: "Daily Summary Report",
      filename: buildReportFilename("Сводный отчет", range.label),
      html: renderDailySummaryReportHtml(document),
      lines: renderDailySummaryReportPlainText(document),
    };
  }

  const title =
    input.type === "store"
        ? "Store Report"
        : "Seller Report";
  const subtitle =
    input.type === "store"
        ? "Performance breakdown for the selected store."
        : "Performance breakdown for the selected seller.";
  const document = buildSalesReportDocument({
    title,
    subtitle,
    range,
    data,
    scope: storeName ?? sellerName,
  });

  return {
    title: document.title,
    filename: buildReportFilename(input.type === "store" ? "Отчет по магазину" : "Отчет по продавцу", range.label),
    html: renderReportHtml(document),
    lines: renderReportPlainText(document),
  };
}

export async function requestAdminReport(input: ReportRequestInput) {
  const admin = await maybeOne<{ telegram_id: number; full_name: string }>(
    `select telegram_id, full_name
     from public.users
     where id = $1
       and role = 'admin'
       and is_active = true`,
    [input.adminUserId]
  );

  if (!admin) {
    throw new HttpError(404, "Admin user not found");
  }

  const report = await resolveReport(input);
  const pdf = (await createPdfFromHtml(report.html)) ?? createSimplePdf(report.lines);

  await sendTelegramDocument({
    chatId: admin.telegram_id,
    filename: report.filename,
    content: pdf,
    caption: `${report.title} is ready.`,
  });

  return {
    ok: true,
    message: "Report was sent to Telegram",
  };
}
