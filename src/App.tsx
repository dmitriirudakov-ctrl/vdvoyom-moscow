import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Coffee,
  Compass,
  ExternalLink,
  Footprints,
  Heart,
  History,
  Leaf,
  LockKeyhole,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { CityScene } from "./components/CityScene";
import { catalog } from "./data/catalog";
import {
  addDays,
  moscowDate,
  prettyDate,
  rubles,
  time,
  weatherAvailable,
} from "./domain/dates";
import { eligible, makePlan, replaceItem } from "./domain/engine";
import { mapUrl } from "./domain/geo";
import {
  CATEGORIES,
  emptyData,
  labels,
  type Category,
  type Data,
  type Plan,
  type Profile,
  type Settings,
} from "./domain/model";
import * as store from "./lib/store";

type Tab = "discover" | "saved" | "history" | "settings";
const nav: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: "discover", label: "Найти идею", icon: Compass },
  { id: "saved", label: "Сохранённое", icon: Bookmark },
  { id: "history", label: "Наша история", icon: History },
  { id: "settings", label: "Настройки", icon: Settings2 },
];
const initialSettings: Settings = {
  date: addDays(moscowDate(), 1),
  mode: "day",
  weather: "sunny",
  budget: 3000,
  categories: [...CATEGORIES],
  transport: 400,
  start: 630,
};
const iconFor = (c: Category) =>
  c === "cafe"
    ? Coffee
    : c === "walk" || c === "active"
      ? Footprints
      : Sparkles;
const safeMessage = (e: unknown) =>
  e instanceof Error
    ? e.message
    : "Не получилось выполнить действие. Попробуйте ещё раз.";

export default function App() {
  const [tab, setTab] = useState<Tab>("discover"),
    [settings, setSettings] = useState(initialSettings);
  const [profile, setProfile] = useState<Profile | null>(
    store.cloud ? null : store.DEMO_PROFILES[0],
  );
  const [authReady, setAuthReady] = useState(!store.cloud),
    [data, setData] = useState<Data>(emptyData);
  const [places, setPlaces] = useState(catalog),
    [catalogStatus, setCatalogStatus] = useState(
      "Постоянные места · афиша ещё не подключена",
    );
  const [plan, setPlan] = useState<Plan | null>(null),
    [modal, setModal] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [more, setMore] = useState(false);
  const [savedFilter, setSavedFilter] = useState<"all" | "private" | "shared">(
    "all",
  );
  const dialog = useRef<HTMLDialogElement>(null),
    resultRef = useRef<HTMLDivElement>(null);
  const dataRevision = useRef(0);
  const activeUser = useRef(profile?.id);
  activeUser.current = profile?.id;
  const visible = profile ? store.visibleSaves(data.saves, profile.id) : [];
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  useEffect(() => {
    if (!store.cloud) return;
    const client = store.cloud;
    let active = true,
      revision = 0;
    const syncAuth = async () => {
      const n = ++revision;
      setProfile(null);
      setData(emptyData());
      setPlan(null);
      setModal(null);
      try {
        const {
          data: { session },
        } = await client.auth.getSession();
        if (session) {
          const p = await store.loadProfile();
          if (active && n === revision) setProfile(p);
        }
      } catch (e) {
        if (active) setError(safeMessage(e));
      } finally {
        if (active) setAuthReady(true);
      }
    };
    void syncAuth();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") void syncAuth();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!profile) return;
    let active = true,
      inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const revision = ++dataRevision.current;
      try {
        const d = await store.readData();
        if (active && revision === dataRevision.current) setData(d);
      } catch (e) {
        if (active) setError(safeMessage(e));
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20000);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }, [profile?.id]);
  useEffect(() => {
    if (!profile || !store.cloud) return;
    let active = true;
    store
      .loadCatalog()
      .then((r) => {
        if (!active) return;
        const all = new Map(catalog.map((p) => [p.id, p]));
        r.places.forEach((p) => all.set(p.id, p));
        setPlaces([...all.values()]);
        setCatalogStatus(
          r.error ||
            (r.updatedAt
              ? `Афиша обновлена ${prettyDate(moscowDate(new Date(r.updatedAt)))}`
              : "Афиша ещё не загружена"),
        );
      })
      .catch(() => {
        if (active)
          setCatalogStatus("Афиша недоступна · доступны постоянные места");
      });
    return () => {
      active = false;
    };
  }, [profile?.id]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal && dialog.current?.open) dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    const onStorage = () => {
      if (!store.cloud)
        try {
          setData(store.localRead());
        } catch (e) {
          setError(safeMessage(e));
        }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function act(action: () => Promise<void>, message: string) {
    if (busy) return;
    const identity = profile?.id;
    setBusy(true);
    setError("");
    try {
      await action();
      const revision = ++dataRevision.current;
      const fresh = await store.readData();
      if (
        activeUser.current === identity &&
        revision === dataRevision.current
      ) {
        setData(fresh);
        setNotice(message);
      }
    } catch (e) {
      if (activeUser.current === identity) setError(safeMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function generate() {
    setError("");
    try {
      setPlan(makePlan(places, settings, data));
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        50,
      );
    } catch (e) {
      setPlan(null);
      setError(safeMessage(e));
    }
  }
  function swap(index: number) {
    if (!plan) return;
    setError("");
    try {
      setPlan(replaceItem(plan, index, places, settings, data));
      setNotice("Нашли другой вариант");
    } catch (e) {
      setError(safeMessage(e));
    }
  }
  async function logout() {
    setError("");
    try {
      await store.signOut();
      setData(emptyData());
      setPlan(null);
      setModal(null);
      setProfile(null);
    } catch (e) {
      setError(safeMessage(e));
    }
  }
  function exportData() {
    // Export only records visible to this account, including in the deliberately unprotected demo.
    const blob = new Blob(
      [JSON.stringify({ ...data, saves: visible }, null, 2)],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = href;
    a.download = `vdvoyom-${moscowDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  const likes = Object.entries(data.feedback).filter(
    ([, v]) => v === "liked",
  ).length;

  if (!authReady)
    return (
      <main className="fatal">
        <div className="brand">
          <Heart />
          Вдвоём<span>МОСКВА</span>
        </div>
        <p>Открываем ваши выходные…</p>
      </main>
    );
  if (!profile) return <Login onError={setError} error={error} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("discover");
          }}
        >
          <span className="brand-mark">
            <Heart size={21} />
          </span>
          <span>
            Вдвоём<small>МОСКВА</small>
          </span>
        </a>
        <div className="side-caption">ВАШЕ МАЛЕНЬКОЕ ПРИКЛЮЧЕНИЕ</div>
        <nav aria-label="Основная навигация">
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "nav-item active" : "nav-item"}
              onClick={() => {
                setTab(id);
                setError("");
                window.scrollTo({ top: 0 });
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "saved" && visible.length > 0 && (
                <small>{visible.length}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <Leaf size={22} />
          <p>
            Лучшие дни —<br />
            те, что вы проводите
            <br />
            <em>вместе.</em>
          </p>
          <span>Без спешки. В своём ритме.</span>
        </div>
        <div className="account">
          <div className="avatar">{profile.display_name[0]}</div>
          <div>
            <strong>{profile.display_name}</strong>
            <small>
              {store.cloud ? "Пространство для двоих" : "Локальный прототип"}
            </small>
          </div>
          {store.cloud && (
            <button
              className="icon-button"
              aria-label="Выйти"
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span className="mobile-brand">
            <Heart size={18} />
            Вдвоём
          </span>
          <span className="location">
            <MapPin size={15} /> Москва, в пределах МКАД
          </span>
          <span className="top-tag">
            <Users size={15} /> Только для вас двоих
          </span>
          {store.cloud && (
            <button className="secondary" onClick={() => void logout()}>
              <LogOut size={16} /> Выйти
            </button>
          )}
        </header>
        {!store.cloud && (
          <div className="demo-banner">
            <span>
              <span className="demo-dot" /> Прототип · данные хранятся только в
              этом браузере
            </span>
            <button onClick={() => setTab("settings")}>
              Подробнее <ArrowRight size={13} />
            </button>
          </div>
        )}
        {error && (
          <div className="error-message" role="alert">
            <span>{error}</span>
            <button aria-label="Закрыть сообщение" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}

        {tab === "discover" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> ГОРОД БОЛЬШОЙ. ВЫХОДНЫЕ — ВАШИ.
                </div>
                <h1>
                  Давайте куда-нибудь
                  <br />
                  <em>вдвоём.</em>
                </h1>
                <p>
                  Знакомые улицы, новые впечатления и время
                  <br className="desktop-break" /> друг для друга. Найдём ваш
                  следующий план?
                </p>
                <div className="hero-tags">
                  <span>
                    <Leaf size={14} /> С учётом ваших интересов
                  </span>
                  <span>
                    <Wallet size={14} /> В вашем бюджете
                  </span>
                </div>
              </div>
              <CityScene />
            </section>
            <section
              className="generator panel"
              aria-labelledby="generator-title"
            >
              <div className="section-top">
                <div>
                  <div className="eyebrow">НАСТРОИМ ВАШ ВЫХОДНОЙ</div>
                  <h2 id="generator-title">Чего хочется сегодня?</h2>
                </div>
                <SlidersHorizontal size={22} className="muted" />
              </div>
              <div
                className="mode-tabs"
                role="group"
                aria-label="Формат подборки"
              >
                <button
                  className={settings.mode === "day" ? "selected" : ""}
                  aria-pressed={settings.mode === "day"}
                  onClick={() => update("mode", "day")}
                >
                  <Navigation size={18} />
                  План на день<span>Всё складывается в маршрут</span>
                </button>
                <button
                  className={settings.mode === "idea" ? "selected" : ""}
                  aria-pressed={settings.mode === "idea"}
                  onClick={() => update("mode", "idea")}
                >
                  <Sparkles size={18} />
                  Одна идея<span>Маленький повод выбраться</span>
                </button>
              </div>
              <div className="fields-grid">
                <label className="field">
                  <span>
                    <CalendarDays size={16} /> Когда?
                  </span>
                  <input
                    type="date"
                    value={settings.date}
                    min={moscowDate()}
                    onChange={(e) => {
                      if (e.target.value) update("date", e.target.value);
                    }}
                  />
                  <small>{prettyDate(settings.date)}</small>
                </label>
                <div className="field">
                  <span>
                    <Wallet size={16} /> Бюджет на двоих
                  </span>
                  <div className="budget-buttons">
                    {[2000, 3000, 4000, 5000, 6000].map((b) => (
                      <button
                        key={b}
                        className={settings.budget === b ? "selected" : ""}
                        aria-pressed={settings.budget === b}
                        onClick={() => update("budget", b)}
                      >
                        {rubles(b)}
                      </button>
                    ))}
                  </div>
                  <small>
                    Ищем варианты от {rubles(settings.budget - 1000)} до{" "}
                    {rubles(settings.budget)} на двоих, включая резерв на
                    транспорт{settings.mode === "day" ? " и еду" : ""}. Цены
                    могут измениться.
                  </small>
                </div>
              </div>
              <fieldset className="weather-field">
                <legend>Как планируем погоду?</legend>
                <div className="weather-options">
                  <button
                    className={
                      settings.weather === "sunny"
                        ? "weather selected"
                        : "weather"
                    }
                    onClick={() => update("weather", "sunny")}
                    aria-pressed={settings.weather === "sunny"}
                  >
                    <Sun size={18} />
                    <span>
                      Хорошая погода<small>Можно гулять</small>
                    </span>
                    {settings.weather === "sunny" && <Check size={16} />}
                  </button>
                  <button
                    className={
                      settings.weather === "indoor"
                        ? "weather selected"
                        : "weather"
                    }
                    onClick={() => update("weather", "indoor")}
                    aria-pressed={settings.weather === "indoor"}
                  >
                    <Coffee size={18} />
                    <span>
                      В помещении<small>Уютно в любую погоду</small>
                    </span>
                    {settings.weather === "indoor" && <Check size={16} />}
                  </button>
                </div>
                <div className="forecast-note">
                  <a
                    href="https://yandex.ru/pogoda/moscow"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Проверить в Яндекс Погоде <ExternalLink size={11} />
                  </a>
                  <span>
                    {weatherAvailable(settings.date)
                      ? "Автоучёт пока недоступен: подключение Яндекса не подтверждено"
                      : "Автопрогноз возможен только на сегодня и завтра"}
                  </span>
                </div>
              </fieldset>
              <button
                className="more-button"
                aria-expanded={more}
                onClick={() => setMore((v) => !v)}
              >
                <Settings2 size={16} /> Интересы и детали{" "}
                <ChevronRight size={15} className={more ? "turned" : ""} />
              </button>
              {more && (
                <div className="details-fields">
                  <fieldset>
                    <legend>Что включить в подборку</legend>
                    <div className="chips">
                      {CATEGORIES.map((c) => (
                        <button
                          key={c}
                          aria-pressed={settings.categories.includes(c)}
                          className={
                            settings.categories.includes(c)
                              ? "chip selected"
                              : "chip"
                          }
                          onClick={() => {
                            if (
                              settings.categories.includes(c) &&
                              settings.categories.length === 1
                            ) {
                              setNotice("Оставьте хотя бы одну категорию");
                              return;
                            }
                            update(
                              "categories",
                              settings.categories.includes(c)
                                ? settings.categories.filter((x) => x !== c)
                                : [...settings.categories, c],
                            );
                          }}
                        >
                          {settings.categories.includes(c) && (
                            <Check size={13} />
                          )}{" "}
                          {labels[c]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mini-fields">
                    <label>
                      Резерв на транспорт, на двоих
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        step="50"
                        value={settings.transport}
                        onChange={(e) =>
                          update(
                            "transport",
                            Math.min(5000, Math.max(0, Number(e.target.value))),
                          )
                        }
                      />
                    </label>
                    <label>
                      Старт от «Партизанской»
                      <select
                        value={settings.start}
                        onChange={(e) =>
                          update("start", Number(e.target.value))
                        }
                      >
                        {[540, 600, 630, 660, 720].map((t) => (
                          <option key={t} value={t}>
                            {time(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="hint">
                    Сумма транспорта — ваш резерв, а не расчёт тарифа. Экстрим,
                    бары и ночные вечеринки исключены.
                  </p>
                </div>
              )}
              <div className="generate-footer">
                <span>
                  <MapPin size={15} /> Старт — м. Партизанская
                </span>
                <button className="primary generate" onClick={generate}>
                  <Sparkles size={17} />
                  {plan
                    ? "Подобрать ещё"
                    : settings.mode === "day"
                      ? "Собрать наш день"
                      : "Найти нашу идею"}
                  <ArrowRight size={18} />
                </button>
              </div>
            </section>
            <div ref={resultRef} className="results-anchor">
              {plan && (
                <section className="result-section">
                  <div className="section-top">
                    <div>
                      <div className="eyebrow">ПУСТЬ ЭТО БУДЕТ ВАШ ДЕНЬ</div>
                      <h2>
                        {plan.mode === "day"
                          ? "У нас есть план"
                          : "Как вам такая идея?"}
                      </h2>
                    </div>
                    <span className="pill">
                      <Users size={13} /> На двоих
                    </span>
                  </div>
                  <PlanView plan={plan} onSwap={swap} />
                  <div className="plan-actions">
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        data.saves.some(
                          (s) =>
                            s.payload.id === plan.id &&
                            s.owner_id === profile.id,
                        )
                      }
                      onClick={() =>
                        void act(
                          () => store.savePlan(plan, profile, data),
                          "Сохранено лично. Партнёр пока не видит этот план.",
                        )
                      }
                    >
                      <Bookmark size={17} />
                      {data.saves.some(
                        (s) =>
                          s.payload.id === plan.id && s.owner_id === profile.id,
                      )
                        ? "Сохранено"
                        : "Сохранить для сюрприза"}
                    </button>
                    <button
                      className="secondary"
                      disabled={
                        busy || data.visits.some((v) => v.plan_id === plan.id)
                      }
                      onClick={() =>
                        void act(
                          () => store.markVisited(plan, profile, data),
                          "День добавлен в вашу общую историю",
                        )
                      }
                    >
                      <Check size={17} />
                      Мы сходили
                    </button>
                  </div>
                  <p className="hint">
                    <LockKeyhole size={13} /> Поделиться сохранением можно во
                    вкладке «Сохранённое».
                  </p>
                </section>
              )}
            </div>
            {!plan && (
              <section className="inspiration">
                <div className="section-top">
                  <div>
                    <div className="eyebrow">
                      ЧУТЬ МЕНЬШЕ ПЛАНОВ. ЧУТЬ БОЛЬШЕ ВПЕЧАТЛЕНИЙ.
                    </div>
                    <h2>Москва, которая вам понравится</h2>
                  </div>
                  <span className="text-small">Начните с маленького</span>
                </div>
                <div className="inspiration-grid">
                  {[catalog[0], catalog[8], catalog[4]].map((p, i) => (
                    <button
                      className={`inspiration-card art-${i}`}
                      key={p.id}
                      onClick={() => {
                        setSettings((s) => ({
                          ...s,
                          mode: "idea",
                          weather: p.indoor ? "indoor" : "sunny",
                          categories: [p.category],
                        }));
                        setNotice(
                          `Выбрали «${labels[p.category]}». Нажмите «Найти нашу идею».`,
                        );
                        document
                          .getElementById("generator-title")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                    >
                      <div className="card-art">
                        {i === 0 ? (
                          <Leaf size={42} strokeWidth={1} />
                        ) : i === 1 ? (
                          <Sparkles size={42} strokeWidth={1} />
                        ) : (
                          <Footprints size={42} strokeWidth={1} />
                        )}
                        <span className="art-circle" />
                        <span className="art-line" />
                      </div>
                      <div className="inspiration-copy">
                        <small>{labels[p.category]}</small>
                        <strong>
                          {i === 0
                            ? "Там, где тише"
                            : i === 1
                              ? "За новыми впечатлениями"
                              : "По любимым переулкам"}
                        </strong>
                        <span>
                          {i === 0
                            ? "Парки, аллеи и разговоры"
                            : i === 1
                              ? "Искусство, которое сближает"
                              : "У города столько историй"}
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <div className="catalog-status">
              <span className="status-dot" />
              {catalogStatus}
              <span>·</span>
              {places.filter((p) => eligible(p, settings, data)).length}{" "}
              подходящих мест
            </div>
          </>
        )}

        {tab === "saved" && (
          <section className="inner-page">
            <PageHeading
              eyebrow="МАЛЕНЬКИЕ СЕКРЕТЫ И ОБЩИЕ ПЛАНЫ"
              title="На потом. Или на сюрприз."
              description="Личные идеи видите только вы. Поделитесь, когда захотите раскрыть план."
            />
            <div className="filter-tabs">
              {(["all", "private", "shared"] as const).map((f, i) => (
                <button
                  key={f}
                  className={savedFilter === f ? "selected" : ""}
                  onClick={() => setSavedFilter(f)}
                >
                  {["Все", "Личные", "Общие"][i]}
                </button>
              ))}
            </div>
            <div className="saved-grid">
              {visible
                .filter(
                  (s) => savedFilter === "all" || s.visibility === savedFilter,
                )
                .map((s) => (
                  <article className="saved-card panel" key={s.id}>
                    <div className="card-heading">
                      <span
                        className={
                          s.visibility === "private" ? "pill" : "pill shared"
                        }
                      >
                        {s.visibility === "private" ? (
                          <LockKeyhole size={12} />
                        ) : (
                          <Users size={12} />
                        )}{" "}
                        {s.visibility === "private"
                          ? "Только для вас"
                          : "Для вас двоих"}
                      </span>
                      {(s.owner_id === profile.id ||
                        s.visibility === "shared") && (
                        <button
                          className="secondary"
                          disabled={busy}
                          aria-label={`Удалить сохранение ${s.payload.title}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                s.visibility === "shared"
                                  ? "Удалить общий план у обоих? История посещений останется."
                                  : "Удалить это сохранение? История посещений останется.",
                              )
                            )
                              void act(
                                () => store.deleteSave(s.id, data),
                                "Сохранение удалено",
                              );
                          }}
                        >
                          <Trash2 size={16} /> Удалить
                        </button>
                      )}
                    </div>
                    <span className="date-label">
                      {prettyDate(s.payload.date)}
                    </span>
                    <h3>{s.payload.title}</h3>
                    <p>
                      {s.payload.items.map((i) => i.place.title).join(" → ")}
                    </p>
                    <div className="card-meta">
                      <span>≈ {rubles(s.payload.total)}</span>
                      <span>
                        {s.payload.items.length === 1
                          ? "Одна идея"
                          : `${s.payload.items.length} остановки`}
                      </span>
                    </div>
                    <button
                      className="card-open"
                      onClick={() => setModal(s.payload)}
                    >
                      Открыть план <ArrowRight size={16} />
                    </button>
                    {s.visibility === "private" &&
                      s.owner_id === profile.id && (
                        <button
                          className="share-button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => store.shareSave(s, data),
                              "План теперь виден вам обоим",
                            )
                          }
                        >
                          <Share2 size={15} />
                          Поделиться с партнёром
                        </button>
                      )}
                  </article>
                ))}
            </div>
            {visible.filter(
              (s) => savedFilter === "all" || s.visibility === savedFilter,
            ).length === 0 && (
              <Empty
                icon={<Bookmark />}
                title="Здесь будет ваше «а давай…»"
                text="Подберите идею и сохраните её. Всё начнётся с маленького секрета."
                onClick={() => setTab("discover")}
                action="Найти первую идею"
              />
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="inner-page">
            <PageHeading
              eyebrow="ВАШИ ОБЩИЕ ВОСПОМИНАНИЯ"
              title="Помните, как было здорово?"
              description="Здесь только то, что вы отметили кнопкой «Мы сходили». Лайкните места, в которые хочется вернуться."
            />
            <div className="history-stats">
              <div>
                <strong>{data.visits.length}</strong>
                <span>совместных выходов</span>
              </div>
              <div>
                <strong>{likes}</strong>
                <span>любимых мест</span>
              </div>
              <div>
                <Heart size={26} />
                <span>одна общая история</span>
              </div>
            </div>
            {data.visits.map((v) => (
              <article className="history-card panel" key={v.id}>
                <div className="history-date">
                  <CalendarDays size={17} />
                  {prettyDate(moscowDate(new Date(v.created_at)))}
                </div>
                <button
                  className="history-title"
                  onClick={() => setModal(v.payload)}
                >
                  <h3>{v.payload.title}</h3>
                  <ArrowRight size={18} />
                </button>
                {v.payload.items.map((i) => (
                  <div className="history-place" key={i.place.id}>
                    <div>
                      <strong>{i.place.title}</strong>
                      <span>{labels[i.place.category]}</span>
                    </div>
                    <button
                      className={
                        data.feedback[i.place.id] === "liked"
                          ? "like-button liked"
                          : "like-button"
                      }
                      aria-pressed={data.feedback[i.place.id] === "liked"}
                      aria-label={`Любимое место: ${i.place.title}`}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            store.setFeedback(
                              i.place.id,
                              data.feedback[i.place.id] === "liked"
                                ? null
                                : "liked",
                              profile,
                              data,
                            ),
                          data.feedback[i.place.id] === "liked"
                            ? "Лайк снят"
                            : "Будем иногда предлагать вернуться",
                        )
                      }
                    >
                      <Heart
                        size={19}
                        fill={
                          data.feedback[i.place.id] === "liked"
                            ? "currentColor"
                            : "none"
                        }
                      />
                      <span>
                        {data.feedback[i.place.id] === "liked"
                          ? "Хотим вернуться"
                          : "Понравилось"}
                      </span>
                    </button>
                  </div>
                ))}
              </article>
            ))}
            {data.visits.length === 0 && (
              <Empty
                icon={<Heart />}
                title="Первая история ещё впереди"
                text="Когда выберетесь вместе, нажмите «Мы сходили» в плане. Он появится здесь у вас обоих."
                action="Придумать выходной"
                onClick={() => setTab("discover")}
              />
            )}
          </section>
        )}

        {tab === "settings" && (
          <section className="inner-page settings-page">
            <PageHeading
              eyebrow="ВАШЕ ПРОСТРАНСТВО"
              title="Всё по-вашему."
              description="То, что делает эти выходные именно вашими."
            />
            <section className="panel settings-panel">
              <h2>
                <Users size={21} /> Ваш аккаунт
              </h2>
              <p>
                Сейчас: <strong>{profile.display_name}</strong>
              </p>
              {!store.cloud ? (
                <>
                  <div className="info-box">
                    <CircleHelp size={20} />
                    <p>
                      Это демонстрационный режим на одном устройстве.
                      Переключение ролей показывает сценарий, но не защищает
                      локальные данные. Не сохраняйте здесь личную информацию.
                      Синхронизация между телефонами появится после подключения
                      Supabase.
                    </p>
                  </div>
                  <div className="role-buttons">
                    {store.DEMO_PROFILES.map((p) => (
                      <button
                        key={p.id}
                        className={
                          profile.id === p.id
                            ? "secondary selected"
                            : "secondary"
                        }
                        onClick={() => {
                          setData(emptyData());
                          setPlan(null);
                          setModal(null);
                          setProfile(p);
                          setNotice(`Демо: роль «${p.display_name}»`);
                        }}
                      >
                        {p.display_name}
                        {profile.id === p.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">
                    Закрытая регистрация. Для восстановления пароля обратитесь к
                    владельцу проекта.
                  </p>
                  <button className="secondary" onClick={() => void logout()}>
                    <LogOut size={16} /> Выйти из профиля
                  </button>
                </>
              )}
            </section>
            <section className="panel settings-panel">
              <h2>
                <Leaf size={21} /> Ваш ритм
              </h2>
              <dl className="preferences-list">
                <div>
                  <dt>Отправная точка</dt>
                  <dd>м. Партизанская</dd>
                </div>
                <div>
                  <dt>География</dt>
                  <dd>Москва в пределах МКАД</dd>
                </div>
                <div>
                  <dt>Обычный бюджет</dt>
                  <dd>2000–3000 ₽ на двоих за день</dd>
                </div>
                <div>
                  <dt>Особенный день</dt>
                  <dd>До 6000 ₽ на двоих, по выбору</dd>
                </div>
                <div>
                  <dt>Исключено</dt>
                  <dd>Бары, ночные тусовки, экстрим</dd>
                </div>
                <div>
                  <dt>Предпочтения</dt>
                  <dd>Без алкоголя и курения, активность и простая еда</dd>
                </div>
              </dl>
              <p className="hint">
                Категории, время старта и резерв на транспорт меняются перед
                подбором.
              </p>
            </section>
            <section className="panel settings-panel">
              <h2>
                <ShieldCheck size={21} /> Места, которые не предлагать
              </h2>
              <p>Исключение действует для вас обоих.</p>
              <div className="block-selector">
                <select
                  id="block-place"
                  defaultValue=""
                  aria-label="Место для исключения"
                >
                  <option value="" disabled>
                    Выберите место
                  </option>
                  {places
                    .filter((p) => data.feedback[p.id] !== "blocked")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    const select = document.getElementById(
                      "block-place",
                    ) as HTMLSelectElement;
                    if (select.value)
                      void act(
                        () =>
                          store.setFeedback(
                            select.value,
                            "blocked",
                            profile,
                            data,
                          ),
                        "Место исключено из подбора",
                      );
                  }}
                >
                  Исключить
                </button>
              </div>
              {Object.entries(data.feedback)
                .filter(([, v]) => v === "blocked")
                .map(([id]) => (
                  <div className="blocked-row" key={id}>
                    <span>{places.find((p) => p.id === id)?.title || id}</span>
                    <button
                      disabled={busy}
                      className="text-button"
                      onClick={() =>
                        void act(
                          () => store.setFeedback(id, null, profile, data),
                          "Место снова участвует в подборе",
                        )
                      }
                    >
                      Вернуть
                    </button>
                  </div>
                ))}
            </section>
            <section className="panel settings-panel">
              <h2>
                <ArrowDownToLine size={21} /> Ваши данные
              </h2>
              <p>Скачайте историю, оценки и доступные вам сохранения в JSON.</p>
              <button className="secondary" onClick={exportData}>
                <ArrowDownToLine size={16} />
                Экспортировать данные
              </button>
            </section>
            <section className="panel settings-panel">
              <h2>
                <Bookmark size={21} /> Значок на iPhone
              </h2>
              <p>
                Откройте приложение в Safari → «Поделиться» → «На экран
                “Домой”». После публикации оно будет открываться по собственному
                значку.
              </p>
            </section>
          </section>
        )}
        <footer className="footer">
          <span>
            <Heart size={13} /> Вдвоём. И этого достаточно.
          </span>
          <span>Москва · маленькие открытия</span>
        </footer>
      </main>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {nav.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      <dialog
        ref={dialog}
        className="plan-dialog"
        onClose={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        {modal && (
          <>
            <div className="dialog-top">
              <span className="eyebrow">ВАШ ПЛАН</span>
              <button
                className="icon-button"
                autoFocus
                aria-label="Закрыть план"
                onClick={() => setModal(null)}
              >
                <X />
              </button>
            </div>
            <h2>{modal.title}</h2>
            <PlanView plan={modal} />
            <button
              className="primary"
              disabled={busy || data.visits.some((v) => v.plan_id === modal.id)}
              onClick={() =>
                void act(
                  () => store.markVisited(modal, profile, data),
                  "День добавлен в общую историю",
                )
              }
            >
              <Check size={17} />
              {data.visits.some((v) => v.plan_id === modal.id)
                ? "Уже в истории"
                : "Мы сходили"}
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}

function PlanView({
  plan,
  onSwap,
}: {
  plan: Plan;
  onSwap?: (i: number) => void;
}) {
  return (
    <>
      <div className="plan-summary">
        <span>
          <CalendarDays size={16} />
          {prettyDate(plan.date)}
        </span>
        <strong>
          {plan.approximate ? "≈ " : ""}
          {rubles(plan.total)}
          <small>на двоих</small>
        </strong>
      </div>
      <div className="timeline">
        {plan.items.map((item, i) => {
          const Icon = iconFor(item.place.category);
          return (
            <article className="timeline-item" key={item.place.id}>
              <div className="timeline-marker">
                <span>{i + 1}</span>
                {i < plan.items.length - 1 && <i />}
              </div>
              <div className="timeline-content panel">
                <div className="timeline-top">
                  <span>
                    <Icon size={14} />
                    {labels[item.place.category]}
                  </span>
                  <span>
                    {time(item.start)} — {time(item.end)}
                  </span>
                </div>
                <h3>{item.place.title}</h3>
                <p>{item.place.description}</p>
                <div className="place-details">
                  <span>
                    <MapPin size={13} />
                    {item.place.district}
                  </span>
                  <span>
                    {item.place.priceKind === "free"
                      ? "Бесплатно"
                      : item.place.category === "cafe"
                        ? `Заложено ${rubles(item.place.price!)} / чел.`
                        : `${item.place.priceKind === "exact" ? "" : "≈ "}${rubles(item.place.price!)} / чел.`}
                  </span>
                  {item.place.crowded && <span>Бывает людно</span>}
                </div>
                <div className="item-actions">
                  <a
                    href={item.place.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.place.source === "KudaGo"
                      ? "Подробнее на KudaGo"
                      : "Проверить детали"}{" "}
                    <ExternalLink size={12} />
                  </a>
                  <a
                    href={mapUrl([item.place], false)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    На карте <MapPin size={12} />
                  </a>
                  {onSwap && (
                    <button
                      aria-label={`Заменить: ${item.place.title}`}
                      onClick={() => onSwap(i)}
                    >
                      <RefreshCw size={13} />
                      Заменить
                    </button>
                  )}
                </div>
              </div>
              <div className="travel-note">
                <Footprints size={12} />
                {i === 0 ? "От «Партизанской»" : "Переход / переезд"} ≈{" "}
                {item.travel} мин.
              </div>
            </article>
          );
        })}
      </div>
      <div className="budget-summary">
        <div>
          <span>Еда и занятия, на двоих</span>
          <strong>{rubles(plan.total - plan.transport)}</strong>
        </div>
        <div>
          <span>Ваш резерв на транспорт</span>
          <strong>{rubles(plan.transport)}</strong>
        </div>
        <div className="budget-total">
          <span>Всего ориентировочно</span>
          <strong>{rubles(plan.total)}</strong>
        </div>
      </div>
      <a
        className="map-button"
        href={mapUrl(plan.items.map((i) => i.place))}
        target="_blank"
        rel="noreferrer"
      >
        <Navigation size={17} />
        Маршрут в Яндекс Картах
        <ExternalLink size={15} />
      </a>
      <p className="plan-disclaimer">
        <CircleHelp size={14} /> Цены, длительность и дорога — ориентиры.
        Проверьте часы работы, сеансы, регистрацию и меню по ссылкам перед
        поездкой. Билеты не забронированы.
      </p>
    </>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  onClick,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
  action: string;
}) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onClick}>
        {action}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
function Login({
  onError,
  error,
}: {
  onError: (s: string) => void;
  error: string;
}) {
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    onError("");
    const f = new FormData(e.currentTarget);
    try {
      await store.login(String(f.get("login")), String(f.get("password")));
    } catch (e) {
      onError(safeMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand">
          <Heart />
          Вдвоём
        </div>
        <h1>
          Город большой.
          <br />
          <em>Выходные — ваши.</em>
        </h1>
        <CityScene />
        <p>Ваше маленькое пространство для больших и маленьких приключений.</p>
      </section>
      <section className="login-form">
        <div className="eyebrow">РАДЫ ВАС ВИДЕТЬ</div>
        <h2>Снова вместе.</h2>
        <p>Войдите в ваше пространство для двоих.</p>
        <form onSubmit={(e) => void submit(e)}>
          <label>
            Логин
            <input
              name="login"
              autoComplete="username"
              autoCapitalize="none"
              required
              placeholder="Ваш логин"
            />
          </label>
          <label>
            Пароль
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Ваш пароль"
            />
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={pending}>
            {pending ? "Входим…" : "Войти"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="hint">
          <LockKeyhole size={14} /> Аккаунты создаёт владелец приложения.
          Регистрация закрыта.
        </p>
      </section>
    </main>
  );
}
