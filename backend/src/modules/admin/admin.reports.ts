import { getBusinessDayRange } from "../../lib/business-time.js";
import { maybeOne, queryDb } from "../../lib/db.js";
import { HttpError } from "../../lib/http-error.js";
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

type ReportRequestInput = {
  adminUserId: string;
  type: "daily_summary" | "store" | "seller" | "schedule";
  date?: string;
  dateFrom?: string;
  dateTo?: string;
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

function buildDateRange(input: Pick<ReportRequestInput, "date" | "dateFrom" | "dateTo">): ReportRange {
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
      dateTo: endRange.dateTo,
    };
  }

  return buildDayRange(input.date);
}

function buildScheduleRange(input: Pick<ReportRequestInput, "period" | "periodAnchorDate" | "dateFrom" | "dateTo">): ReportRange {
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

function buildSalesLines(input: {
  title: string;
  range: ReportRange;
  data: Awaited<ReturnType<typeof loadSalesReportData>>;
  scope?: string;
}) {
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

  return [
    input.title,
    `Period: ${input.range.label}`,
    input.scope ? `Scope: ${input.scope}` : null,
    "",
    `Completed sales: ${salesSummary.completedCount}`,
    `Revenue: ${formatMoney(salesSummary.revenue)}`,
    `Cash: ${salesSummary.cashCount} / ${formatMoney(salesSummary.cashRevenue)}`,
    `Card: ${salesSummary.cardCount} / ${formatMoney(salesSummary.cardRevenue)}`,
    `Returns: ${input.data.returns.length} / ${formatMoney(returnsTotal)}`,
    `Returned units: ${returnedUnits}`,
    "",
    "Stores:",
    ...[...byStore.entries()].map(([storeId, total]) => `- ${storeMap.get(storeId) ?? "Unknown store"}: ${formatMoney(total)}`),
    "",
    "Sellers:",
    ...[...bySeller.entries()].map(([sellerId, total]) => `- ${userMap.get(sellerId) ?? "Unknown seller"}: ${formatMoney(total)}`),
    "",
    "Top products:",
    ...[...topProducts.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, 8)
      .map((item) => `- ${item.name}: ${item.quantity} pcs / ${formatMoney(item.total)}`),
  ].filter((line): line is string => line !== null);
}

async function buildScheduleLines(range: ReportRange) {
  const [shifts, stores, users] = await Promise.all([loadShiftRows(range), listAdminStores(), listAdminUsers()]);
  const storeMap = new Map(stores.map((store) => [store.id, store.name]));
  const userMap = new Map(users.map((user) => [user.id, user.full_name]));

  return [
    "Work Schedule Report",
    `Period: ${range.label}`,
    "",
    `Shifts: ${shifts.length}`,
    "",
    ...shifts.map((shift) => {
      const started = new Date(shift.started_at).toISOString().slice(0, 16).replace("T", " ");
      const ended = shift.ended_at ? new Date(shift.ended_at).toISOString().slice(0, 16).replace("T", " ") : "open";
      const totalSeconds = shift.ended_at
        ? Math.max(0, Math.floor((new Date(shift.ended_at).getTime() - new Date(shift.started_at).getTime()) / 1000))
        : 0;
      const workedSeconds = Math.max(0, totalSeconds - Number(shift.paused_total_seconds));
      return `${userMap.get(shift.user_id) ?? "Unknown seller"} / ${storeMap.get(shift.store_id) ?? "Unknown store"} / ${started} - ${ended} / ${formatDuration(workedSeconds)}`;
    }),
  ];
}

async function resolveReport(input: ReportRequestInput) {
  if (input.type === "schedule") {
    const range = buildScheduleRange(input);
    return {
      title: "Work Schedule Report",
      filename: `schedule-${input.period ?? "week"}-${range.label.replaceAll(" ", "")}.pdf`,
      lines: await buildScheduleLines(range),
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

  const title =
    input.type === "daily_summary"
      ? "Daily Summary Report"
      : input.type === "store"
        ? "Store Report"
        : "Seller Report";

  return {
    title,
    filename: `${input.type}-${range.label}.pdf`,
    lines: buildSalesLines({
      title,
      range,
      data,
      scope: storeName ?? sellerName,
    }),
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
  const pdf = createSimplePdf(report.lines);

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
