import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalog } from "../src/data/catalog";
import { addDays, moscowDate, weatherAvailable } from "../src/domain/dates";
import { eligible, makePlan, replaceItem } from "../src/domain/engine";
import { insideMkad, travelMinutes } from "../src/domain/geo";
import {
  emptyData,
  type Data,
  type Place,
  type Settings,
} from "../src/domain/model";
import { normalizeEvent, parsePrice } from "../src/domain/kudago";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-30T12:00:00+03:00"));
});
afterAll(() => vi.useRealTimers());
const base: Settings = {
  date: "2026-10-31",
  mode: "day",
  weather: "sunny",
  budget: 3000,
  categories: ["walk", "cafe", "exhibition", "active"],
  transport: 400,
  start: 630,
};
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
describe("Moscow date and weather horizon", () => {
  it("changes date at midnight in Moscow, regardless of host timezone", () => {
    expect(moscowDate(new Date("2026-10-30T21:01:00Z"))).toBe("2026-10-31");
    expect(
      weatherAvailable("2026-11-01", new Date("2026-10-30T21:01:00Z")),
    ).toBe(true);
    expect(
      weatherAvailable("2026-11-02", new Date("2026-10-30T21:01:00Z")),
    ).toBe(false);
  });
  it("handles month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
describe("Geography", () => {
  it("includes the central catalogue and rejects outside locations", () => {
    expect(catalog.every((p) => insideMkad(p.lat, p.lon))).toBe(true);
    for (const [lat, lon] of [
      [55.9, 37.95],
      [55.55, 37.3],
      [55.975, 37.413],
      [NaN, 37.6],
    ])
      expect(insideMkad(lat, lon)).toBe(false);
  });
});
describe("Plans respect constraints", () => {
  it("fits every selectable budget including meals and transport across random seeds", () => {
    for (const budget of [2000, 3000, 4000, 5000, 6000])
      for (let seed = 1; seed <= 30; seed++) {
        const plan = makePlan(
          catalog,
          { ...base, budget },
          emptyData(),
          rng(seed),
        );
        expect(plan.items.length).toBeGreaterThanOrEqual(3);
        expect(plan.items.some((i) => i.place.category === "cafe")).toBe(true);
        expect(plan.total).toBeLessThanOrEqual(budget);
        expect(plan.total).toBeGreaterThanOrEqual(budget - 1000);
        expect(plan.total).toBe(
          plan.transport +
            plan.items.reduce((s, i) => s + i.place.price! * 2, 0),
        );
        expect(new Set(plan.items.map((i) => i.place.id)).size).toBe(
          plan.items.length,
        );
        for (let i = 0; i < plan.items.length; i++) {
          const item = plan.items[i],
            prev = plan.items[i - 1];
          expect(item.start).toBeGreaterThanOrEqual(item.place.open);
          expect(item.end).toBeLessThanOrEqual(item.place.close);
          if (prev) {
            expect(item.start).toBeGreaterThanOrEqual(
              prev.end + travelMinutes(prev.place, item.place),
            );
            expect(item.travel).toBeLessThanOrEqual(45);
          }
        }
      }
  });
  it("offers indoor-only plans and rejects a too-small full-day budget", () => {
    expect(
      makePlan(
        catalog,
        { ...base, weather: "indoor" },
        emptyData(),
        rng(17),
      ).items.every((i) => i.place.indoor),
    ).toBe(true);
    expect(() =>
      makePlan(catalog, { ...base, budget: 500 }, emptyData(), rng(2)),
    ).toThrow("Не удалось собрать день");
  });
  it("does not propose unknown or starting prices as a complete budget", () => {
    for (const priceKind of ["unknown", "from"] as const)
      expect(
        eligible({ ...catalog[0], price: 0, priceKind }, base, emptyData()),
      ).toBe(false);
  });
  it("respects the lower and upper bounds for individual ideas and replacements", () => {
    const cheap = { ...catalog[0], price: 0 },
      suitable = {
        ...catalog[0],
        id: "suitable",
        price: 1400,
        priceKind: "estimate" as const,
      };
    const settings = { ...base, mode: "idea" as const, budget: 4000 };
    const plan = makePlan([cheap, suitable], settings, emptyData(), rng(2));
    expect(plan.items[0].place.id).toBe("suitable");
    expect(plan.total).toBeGreaterThanOrEqual(3000);
    expect(plan.total).toBeLessThanOrEqual(4000);
    expect(() => makePlan([cheap], settings, emptyData())).toThrow(
      "от 3000 до 4000",
    );
    expect(() =>
      replaceItem(
        plan,
        0,
        [{ ...cheap, id: "replacement" }],
        settings,
        emptyData(),
      ),
    ).toThrow("Замены");
  });
  it("varies restaurants instead of always selecting the closest branch", () => {
    const cafes = new Set<string>();
    for (let seed = 1; seed <= 80; seed++) {
      const plan = makePlan(
        catalog,
        { ...base, budget: 4000 },
        emptyData(),
        rng(seed),
      );
      cafes.add(
        plan.items.find((item) => item.place.category === "cafe")!.place.id,
      );
    }
    expect(cafes.size).toBeGreaterThanOrEqual(4);
    expect([...cafes].some((id) => !id.startsWith("grabli"))).toBe(true);
  });
  it("offers an individual idea in each selectable budget band", () => {
    for (const budget of [2000, 3000, 4000, 5000, 6000]) {
      const plan = makePlan(
        catalog,
        { ...base, budget, mode: "idea" },
        emptyData(),
        rng(8),
      );
      expect(plan.total).toBeGreaterThanOrEqual(budget - 1000);
      expect(plan.total).toBeLessThanOrEqual(budget);
    }
  });
  it("does not return blocked, prohibited, expired or unliked visited places", () => {
    const p = { ...catalog[0], price: 800, priceKind: "estimate" as const },
      plan = makePlan([p], { ...base, mode: "idea" }, emptyData());
    const data: Data = {
      saves: [],
      visits: [
        {
          id: "visit",
          plan_id: plan.id,
          payload: plan,
          created_at: "2026-10-30",
        },
      ],
      feedback: {},
    };
    expect(eligible(p, base, data)).toBe(false);
    data.feedback[p.id] = "liked";
    expect(eligible(p, base, data)).toBe(true);
    data.feedback[p.id] = "blocked";
    expect(eligible(p, base, data)).toBe(false);
    expect(eligible({ ...p, prohibited: true }, base, emptyData())).toBe(false);
    expect(eligible({ ...p, endsOn: "2026-10-29" }, base, emptyData())).toBe(
      false,
    );
    expect(() =>
      makePlan(catalog, { ...base, date: "2026-10-29" }, emptyData()),
    ).toThrow("будущую");
  });
  it("does not invent a time when exact sessions are missing", () => {
    expect(() =>
      makePlan(
        [{ ...catalog[0], sessions: [] }],
        { ...base, mode: "idea" },
        emptyData(),
      ),
    ).toThrow();
  });
  it("does not fill gaps between separate continuous exhibition periods", () => {
    const place = {
      ...catalog[0],
      availability: [
        { startsOn: "2026-10-31", endsOn: "2026-10-31" },
        { startsOn: "2026-11-02", endsOn: "2026-11-02" },
      ],
    };
    expect(eligible(place, { ...base, date: "2026-11-01" }, emptyData())).toBe(
      false,
    );
  });
  it("respects exact event sessions, not the gap between their dates", () => {
    const event: Place = {
      ...catalog[0],
      price: 800,
      priceKind: "estimate",
      sessions: ["2026-10-31T16:00:00+03:00", "2026-11-02T16:00:00+03:00"],
    };
    expect(
      makePlan([event], { ...base, mode: "idea" }, emptyData()).items[0].start,
    ).toBe(960);
    expect(() =>
      makePlan(
        [event],
        { ...base, mode: "idea", date: "2026-11-01" },
        emptyData(),
      ),
    ).toThrow();
  });
  it("keeps the other stops and validates travel when replacing one item", () => {
    const plan = makePlan(catalog, base, emptyData(), rng(3));
    const index = plan.items.length - 1,
      original = plan.items[index].place;
    const replacement = {
      ...original,
      id: "replacement",
      title: "Другая остановка",
    };
    const swapped = replaceItem(plan, index, [replacement], base, emptyData());
    expect(swapped.items.slice(0, index)).toEqual(plan.items.slice(0, index));
    expect(swapped.items[index].place.id).toBe("replacement");
    expect(swapped.total).toBeLessThanOrEqual(plan.budget);
    expect(() =>
      replaceItem(
        plan,
        index,
        [{ ...replacement, price: 10000 }],
        base,
        emptyData(),
      ),
    ).toThrow("Замены");
  });
  it("rarely repeats liked places instead of letting them dominate new suggestions", () => {
    const p = { ...catalog[0], price: 800, priceKind: "estimate" as const },
      second = { ...p, id: "new-place" },
      seen = makePlan([p], { ...base, mode: "idea" }, emptyData());
    const data: Data = {
      saves: [],
      visits: [
        { id: "v", plan_id: seen.id, payload: seen, created_at: "2026-10-30" },
      ],
      feedback: { [p.id]: "liked" },
    };
    let repeats = 0;
    const random = rng(921);
    for (let i = 0; i < 1000; i++)
      if (
        makePlan([p, second], { ...base, mode: "idea" }, data, random).items[0]
          .place.id === p.id
      )
        repeats++;
    expect(repeats).toBeGreaterThan(100);
    expect(repeats).toBeLessThan(300);
  });
});
describe("Source data is conservative", () => {
  it("separates exact, lower-bound and unknown prices", () => {
    expect(parsePrice("", false).price).toBeNull();
    expect(parsePrice("от 500 рублей", false).priceKind).toBe("from");
    expect(parsePrice("500–1000 ₽", false).priceKind).toBe("unknown");
    expect(parsePrice("1 000 ₽", false)).toEqual({
      price: 1000,
      priceKind: "exact",
    });
    expect(parsePrice("от 0 рублей", true)).toEqual({
      price: 0,
      priceKind: "free",
    });
  });
  it("rejects unsafe sources, locations, undesired activities and ambiguous sessions", () => {
    const raw = {
      id: 1,
      title: "Выставка",
      description: "Искусство",
      categories: ["exhibition"],
      site_url: "https://kudago.com/msk/event/test/",
      is_free: true,
      place: { coords: { lat: 55.75, lon: 37.62 }, address: "Москва" },
      dates: [{ start: 1793394000, end: 1793998800, is_continuous: true }],
    };
    const normalized = normalizeEvent(raw);
    expect(normalized?.source).toBe("KudaGo");
    expect(
      normalizeEvent({ ...raw, site_url: "javascript:alert(1)" }),
    ).toBeNull();
    expect(normalizeEvent({ ...raw, title: "Дегустация вина" })).toBeNull();
    expect(
      normalizeEvent({ ...raw, place: { coords: { lat: 56, lon: 38 } } }),
    ).toBeNull();
    expect(
      normalizeEvent({
        ...raw,
        dates: [{ start: 1793394000, end: 1793998800 }],
      })?.sessions,
    ).toEqual([]);
  });
});
