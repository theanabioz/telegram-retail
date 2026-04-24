import { env } from "../config.js";

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedDateTimeParts(date: Date, timeZone = env.APP_TIME_ZONE): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone = env.APP_TIME_ZONE) {
  const parts = getZonedDateTimeParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return zonedAsUtc - date.getTime();
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timeZone = env.APP_TIME_ZONE) {
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let utcMs = localAsUtc - getTimeZoneOffsetMs(new Date(localAsUtc), timeZone);

  // Re-run once to handle offset changes around DST boundaries.
  utcMs = localAsUtc - getTimeZoneOffsetMs(new Date(utcMs), timeZone);

  return new Date(utcMs);
}

function addLocalDays(parts: Pick<ZonedDateTimeParts, "year" | "month" | "day">, days: number) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export function getBusinessDayRange(now = new Date(), timeZone = env.APP_TIME_ZONE) {
  const today = getZonedDateTimeParts(now, timeZone);
  const tomorrow = addLocalDays(today, 1);
  const start = zonedDateTimeToUtc({ ...today, hour: 0, minute: 0, second: 0 }, timeZone);
  const nextStart = zonedDateTimeToUtc({ ...tomorrow, hour: 0, minute: 0, second: 0 }, timeZone);

  return {
    dateFrom: start.toISOString(),
    dateTo: new Date(nextStart.getTime() - 1).toISOString(),
  };
}

export function getBusinessDateInput(now = new Date(), timeZone = env.APP_TIME_ZONE) {
  const today = getZonedDateTimeParts(now, timeZone);
  return `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
}

export function getRecentBusinessDateInputs(days: number, now = new Date(), timeZone = env.APP_TIME_ZONE) {
  const today = getZonedDateTimeParts(now, timeZone);
  return Array.from({ length: days }, (_, index) => {
    const day = addLocalDays(today, index - days + 1);
    return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
  });
}

export function getBusinessPeriodStarts(now = new Date(), timeZone = env.APP_TIME_ZONE) {
  const today = getZonedDateTimeParts(now, timeZone);
  const todayLocalDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const weekday = todayLocalDate.getUTCDay();
  const weekStartDate = addLocalDays(today, weekday === 0 ? -6 : 1 - weekday);
  const monthStartDate = { year: today.year, month: today.month, day: 1 };

  return {
    todayStartIso: zonedDateTimeToUtc({ ...today, hour: 0, minute: 0, second: 0 }, timeZone).toISOString(),
    weekStartIso: zonedDateTimeToUtc({ ...weekStartDate, hour: 0, minute: 0, second: 0 }, timeZone).toISOString(),
    monthStartIso: zonedDateTimeToUtc({ ...monthStartDate, hour: 0, minute: 0, second: 0 }, timeZone).toISOString(),
  };
}

export function getBusinessHour(value: string, timeZone = env.APP_TIME_ZONE) {
  return getZonedDateTimeParts(new Date(value), timeZone).hour;
}
