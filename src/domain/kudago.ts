import type { Category, Place } from "./model.ts";
import { insideMkad } from "./geo.ts";
import { moscowDate } from "./dates.ts";

const categoryMap: Record<string, Category> = {
  exhibition: "exhibition",
  tour: "tour",
  excursion: "tour",
  theater: "theatre",
  "master-classes": "workshop",
  workshop: "workshop",
  "active-recreation": "active",
};
const forbidden =
  /(?:\b(?:bar|club|alcohol|extreme)\b|(?:^|[^а-яё])бар(?:а|е|ы|ов|у|ом)?(?:$|[^а-яё])|алкогол|дегустац|винн(?:ый|ая)|пивн|ночн(?:ая|ой)\s+(?:клуб|вечерин)|экстрем|прыжк.*парашют|кальян)/i;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function parsePrice(
  raw: unknown,
  isFree: unknown,
): { price: number | null; priceKind: Place["priceKind"] } {
  if (isFree === true) return { price: 0, priceKind: "free" };
  const text = str(raw).trim().replaceAll("\u00a0", " ");
  const exact = text.match(/^(\d[\d ]*)\s*(?:₽|руб(?:\.|лей|ля|ль)?)?$/i);
  if (exact) {
    const amount = Number(exact[1].replaceAll(" ", ""));
    if (amount > 0 && amount < 100000)
      return { price: amount, priceKind: "exact" };
  }
  const from = text.match(/^от\s+(\d[\d ]*)/i);
  if (from)
    return { price: Number(from[1].replaceAll(" ", "")), priceKind: "from" };
  return { price: null, priceKind: "unknown" };
}
export function normalizeEvent(raw: unknown, now = new Date()): Place | null {
  const e = obj(raw),
    p = obj(e.place),
    coords = obj(p.coords);
  const lat = Number(coords.lat),
    lon = Number(coords.lon);
  if (!coords.lat || !coords.lon || !insideMkad(lat, lon)) return null;
  const title = str(e.title),
    categories = Array.isArray(e.categories)
      ? e.categories.filter((x): x is string => typeof x === "string")
      : [];
  const category = categories.map((c) => categoryMap[c]).find(Boolean);
  if (
    !category ||
    !title ||
    forbidden.test(
      `${title} ${str(e.description)} ${str(p.title)} ${categories.join(" ")}`,
    )
  )
    return null;
  const sourceUrl = str(e.site_url);
  try {
    const u = new URL(sourceUrl);
    if (
      u.protocol !== "https:" ||
      !(u.hostname === "kudago.com" || u.hostname.endsWith(".kudago.com"))
    )
      return null;
  } catch {
    return null;
  }
  if (typeof e.id !== "number" || !Number.isSafeInteger(e.id)) return null;
  const dates = (Array.isArray(e.dates) ? e.dates : [])
    .map(obj)
    .filter(
      (d) =>
        typeof d.start === "number" &&
        typeof d.end === "number" &&
        d.end >= d.start,
    );
  if (!dates.length) return null;
  const start = Math.min(...dates.map((d) => Number(d.start))),
    end = Math.max(...dates.map((d) => Number(d.end)));
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end * 1000 < now.getTime()
  )
    return null;
  const exactDates = dates.filter(
    (d) => d.is_continuous === false && str(d.start_time).match(/^\d\d:\d\d/),
  );
  const sessions = exactDates.map((d) =>
    new Date(Number(d.start) * 1000).toISOString(),
  );
  const durations = exactDates
    .map((d) => Math.ceil((Number(d.end) - Number(d.start)) / 60))
    .filter((n) => n > 0 && n <= 480);
  const cleaned = str(e.description)
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: `kudago-${e.id}`,
    title,
    description:
      cleaned.slice(0, 400) ||
      "Подробности и условия посещения — на странице события.",
    address: str(p.address),
    category,
    indoor: category === "exhibition" || category === "theatre",
    lat,
    lon,
    ...parsePrice(e.price, e.is_free),
    duration: durations.length ? Math.max(...durations) : 120,
    open: 660,
    close: 1320,
    closedDays: [],
    scheduleVerified: false,
    source: "KudaGo",
    sourceUrl,
    checkedAt: now.toISOString(),
    district: str(p.subway) || "Москва",
    crowded: false,
    prohibited: false,
    startsOn: moscowDate(new Date(start * 1000)),
    endsOn: moscowDate(new Date(end * 1000)),
    availability: dates.map((d) => ({
      startsOn: moscowDate(new Date(Number(d.start) * 1000)),
      endsOn: moscowDate(new Date(Number(d.end) * 1000)),
    })),
    // If the source gives exact sessions, never treat the interval between them as continuous availability.
    sessions: sessions.length
      ? sessions
      : dates.every((d) => d.is_continuous === true)
        ? undefined
        : [],
  };
}
