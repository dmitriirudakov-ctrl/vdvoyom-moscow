import type { Data, Place, Plan, Settings } from "./model";
import { insideMkad, ORIGIN, travelMinutes } from "./geo";
import { moscowDate } from "./dates";

export class SelectionError extends Error {}
export function eligible(place: Place, settings: Settings, data: Data) {
  const visited = data.visits.some((v) =>
    v.payload.items.some((i) => i.place.id === place.id),
  );
  const weekday = new Date(`${settings.date}T12:00:00+03:00`).getUTCDay();
  return (
    insideMkad(place.lat, place.lon) &&
    !place.prohibited &&
    settings.categories.includes(place.category) &&
    data.feedback[place.id] !== "blocked" &&
    (!visited || data.feedback[place.id] === "liked") &&
    (settings.weather !== "indoor" || place.indoor) &&
    !place.closedDays.includes(weekday) &&
    (!place.startsOn || place.startsOn <= settings.date) &&
    (!place.endsOn || place.endsOn >= settings.date) &&
    (!place.availability ||
      place.availability.some(
        (w) => w.startsOn <= settings.date && w.endsOn >= settings.date,
      )) &&
    (!place.sessions ||
      place.sessions.some((s) => moscowDate(new Date(s)) === settings.date)) &&
    place.price !== null &&
    place.priceKind !== "unknown" &&
    place.priceKind !== "from" &&
    place.price * 2 + settings.transport <= settings.budget
  );
}
function placeAt(place: Place, earliest: number, date: string): number | null {
  const start = Math.max(earliest, place.open);
  if (place.sessions) {
    const sessions = place.sessions.map((s) => ({
      date: moscowDate(new Date(s)),
      min: new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Moscow",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(s)),
    }));
    const options = sessions
      .filter((s) => s.date === date)
      .map((s) => Number(s.min.slice(0, 2)) * 60 + Number(s.min.slice(3, 5)))
      .filter((t) => t >= start && t + place.duration <= place.close);
    return options.length ? Math.min(...options) : null;
  }
  return start + place.duration <= Math.min(place.close, 22 * 60)
    ? start
    : null;
}
function ranked(places: Place[], data: Data, random: () => number) {
  const visited = new Set(
    data.visits.flatMap((v) => v.payload.items.map((i) => i.place.id)),
  );
  // Weighted sampling without replacement: liked revisits get a quarter of a new place's weight.
  return places
    .map((p) => ({
      p,
      key: -Math.log(Math.max(random(), 1e-9)) / (visited.has(p.id) ? 0.25 : 1),
    }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.p);
}
export function makePlan(
  places: Place[],
  settings: Settings,
  data: Data,
  random = Math.random,
): Plan {
  if (settings.date < moscowDate())
    throw new SelectionError("Выберите сегодняшнюю или будущую дату.");
  const candidates = ranked(
    places.filter((p) => eligible(p, settings, data)),
    data,
    random,
  );
  const id = crypto.randomUUID(),
    items: Plan["items"] = [];
  const add = (p: Place) => {
    const last = items.at(-1),
      travel = travelMinutes(last?.place ?? ORIGIN, p);
    const start = placeAt(
      p,
      (last?.end ?? settings.start) + travel,
      settings.date,
    );
    if (start === null) return false;
    if (
      settings.transport +
        items.reduce((a, i) => a + i.place.price! * 2, 0) +
        p.price! * 2 >
      settings.budget
    )
      return false;
    items.push({ place: p, start, end: start + p.duration, travel });
    return true;
  };
  if (settings.mode === "idea") {
    for (const p of candidates) if (add(p)) break;
  } else {
    // Choose a meal first: a full-day plan must include food in its actual estimate.
    const meals = candidates.filter((p) => p.category === "cafe");
    const activities = candidates.filter((p) => p.category !== "cafe");
    for (const anchor of activities) {
      items.length = 0;
      if (!add(anchor)) continue;
      const meal = [...meals]
        .sort((a, b) => travelMinutes(anchor, a) - travelMinutes(anchor, b))
        .find(
          (p) =>
            travelMinutes(anchor, p) <= 45 &&
            settings.transport + (anchor.price! + p.price!) * 2 <=
              settings.budget &&
            placeAt(
              p,
              items[0].end + travelMinutes(anchor, p),
              settings.date,
            ) !== null,
        );
      if (!meal) continue;
      add(meal);
      const remaining = activities
        .filter((p) => p.id !== anchor.id)
        .sort((a, b) => travelMinutes(meal, a) - travelMinutes(meal, b));
      for (const p of remaining)
        if (travelMinutes(meal, p) <= 45 && add(p)) break;
      if (items.length >= 3) break;
    }
    if (items.length < 3)
      throw new SelectionError(
        "Не хватает мест для целого дня с едой в выбранных условиях. Попробуйте добавить категории, выбрать хорошую погоду или изменить бюджет.",
      );
  }
  if (!items.length)
    throw new SelectionError(
      "Подходящих идей пока нет. Измените категории, бюджет или погодные условия.",
    );
  const approximate =
    items.some(
      (i) => i.place.priceKind === "estimate" || !i.place.scheduleVerified,
    ) || settings.transport > 0;
  return {
    id,
    date: settings.date,
    mode: settings.mode,
    title:
      settings.mode === "idea"
        ? items[0].place.title
        : "Маленькие открытия Москвы",
    items,
    transport: settings.transport,
    total:
      settings.transport + items.reduce((a, i) => a + i.place.price! * 2, 0),
    budget: settings.budget,
    approximate,
    createdAt: new Date().toISOString(),
  };
}
export function replaceItem(
  plan: Plan,
  index: number,
  places: Place[],
  settings: Settings,
  data: Data,
  random = Math.random,
): Plan {
  if (index < 0 || index >= plan.items.length)
    throw new SelectionError("Пункт плана не найден.");
  const original = plan.items[index];
  const candidates = ranked(
    places.filter(
      (p) =>
        eligible(
          p,
          { ...settings, date: plan.date, budget: plan.budget },
          data,
        ) &&
        p.category === original.place.category &&
        !plan.items.some((i) => i.place.id === p.id),
    ),
    data,
    random,
  );
  for (const p of candidates) {
    const previous = plan.items[index - 1],
      next = plan.items[index + 1];
    const travel = travelMinutes(previous?.place ?? ORIGIN, p);
    const start = placeAt(
      p,
      Math.max(original.start, (previous?.end ?? settings.start) + travel),
      plan.date,
    );
    const total = plan.total - original.place.price! * 2 + p.price! * 2;
    if (
      start === null ||
      total > plan.budget ||
      (previous && travel > 45) ||
      (next && travelMinutes(p, next.place) > 45) ||
      (next && start + p.duration + travelMinutes(p, next.place) > next.start)
    )
      continue;
    const items = plan.items.map((i) => ({ ...i }));
    items[index] = { place: p, start, end: start + p.duration, travel };
    if (next) items[index + 1].travel = travelMinutes(p, next.place);
    return {
      ...plan,
      id: crypto.randomUUID(),
      items,
      total,
      approximate:
        plan.approximate || p.priceKind === "estimate" || !p.scheduleVerified,
    };
  }
  throw new SelectionError(
    "Замены, которая сохранит остальные пункты, время и бюджет, пока нет. Можно собрать новый план.",
  );
}
