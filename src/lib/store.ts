import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  emptyData,
  PlanSchema,
  PlaceSchema,
  type Data,
  type Plan,
  type Profile,
  type Place,
  type Save,
  type Visit,
} from "../domain/model";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
export const DEMO_PROFILES: Profile[] = [
  { id: "demo-a", couple_id: "demo-couple", display_name: "Я" },
  { id: "demo-b", couple_id: "demo-couple", display_name: "Партнёр" },
];
const STORAGE = "vdvoyom.demo.v1";
const saveSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  visibility: z.enum(["private", "shared"]),
  payload: PlanSchema,
  created_at: z.string(),
});
const visitSchema = z.object({
  id: z.string(),
  plan_id: z.string(),
  payload: PlanSchema,
  created_at: z.string(),
});
const dataSchema = z.object({
  saves: z.array(saveSchema),
  visits: z.array(visitSchema),
  feedback: z.record(z.string(), z.enum(["liked", "blocked"])),
});
export function localRead(): Data {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) return emptyData();
  const result = dataSchema.safeParse(JSON.parse(raw));
  if (!result.success)
    throw new Error(
      "Локальное сохранение повреждено. Экспортируйте данные в настройках перед сбросом.",
    );
  return result.data;
}
export const localWrite = (data: Data) =>
  localStorage.setItem(STORAGE, JSON.stringify(data));
export const visibleSaves = (saves: Save[], userId: string) =>
  saves.filter((s) => s.owner_id === userId || s.visibility === "shared");
export async function login(login: string, password: string) {
  if (!cloud) return;
  const alias = login.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(alias))
    throw new Error("Логин: 2–40 латинских букв, цифр, точек или дефисов.");
  const { error } = await cloud.auth.signInWithPassword({
    email: `${alias}@${import.meta.env.VITE_AUTH_EMAIL_DOMAIN || "weekend.invalid"}`,
    password,
  });
  if (error)
    throw new Error("Не удалось войти. Проверьте логин, пароль и подключение.");
}
function checked<T>(r: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null) throw new Error("Нет данных от сервера");
  return r.data;
}
export async function loadProfile(): Promise<Profile> {
  if (!cloud) return DEMO_PROFILES[0];
  const {
    data: { user },
    error,
  } = await cloud.auth.getUser();
  if (error || !user) throw new Error("Сеанс завершён. Войдите снова.");
  return checked(
    await cloud
      .from("profiles")
      .select("id,couple_id,display_name")
      .eq("id", user.id)
      .single(),
  ) as Profile;
}
export async function readData(): Promise<Data> {
  if (!cloud) return localRead();
  const [s, v, f] = await Promise.all([
    cloud
      .from("saves")
      .select("id,owner_id,visibility,payload,created_at")
      .order("created_at", { ascending: false }),
    cloud
      .from("visits")
      .select("id,plan_id,payload,created_at")
      .order("created_at", { ascending: false }),
    cloud.from("place_feedback").select("place_id,value"),
  ]);
  return dataSchema.parse({
    saves: checked(s),
    visits: checked(v),
    feedback: Object.fromEntries(checked(f).map((x) => [x.place_id, x.value])),
  });
}
export async function loadCatalog(): Promise<{
  places: Place[];
  updatedAt: string | null;
  error: string | null;
}> {
  if (!cloud) return { places: [], updatedAt: null, error: null };
  const [catalog, runs] = await Promise.all([
    cloud.from("catalog").select("payload"),
    cloud
      .from("import_runs")
      .select("finished_at,status")
      .order("finished_at", { ascending: false })
      .limit(1),
  ]);
  const rows = checked(catalog);
  const results = rows.map((x) => PlaceSchema.safeParse(x.payload));
  const invalid = results.filter((r) => !r.success).length;
  const last = checked(runs)[0];
  return {
    places: results.flatMap((r) => (r.success ? [r.data] : [])),
    updatedAt: last?.finished_at ?? null,
    error:
      last?.status === "error"
        ? "Последнее обновление афиши не удалось."
        : invalid
          ? "Часть данных афиши не прошла проверку."
          : null,
  };
}
export async function savePlan(
  plan: Plan,
  profile: Profile,
  data: Data,
): Promise<void> {
  const record: Save = {
    id: crypto.randomUUID(),
    owner_id: profile.id,
    visibility: "private",
    payload: plan,
    created_at: new Date().toISOString(),
  };
  if (!cloud) {
    localWrite({ ...data, saves: [record, ...data.saves] });
    return;
  }
  const { error } = await cloud
    .from("saves")
    .insert({ ...record, couple_id: profile.couple_id });
  if (error) throw error;
}
export async function shareSave(save: Save, data: Data) {
  if (!cloud) {
    localWrite({
      ...data,
      saves: data.saves.map((s) =>
        s.id === save.id ? { ...s, visibility: "shared" } : s,
      ),
    });
    return;
  }
  const { error } = await cloud
    .from("saves")
    .update({ visibility: "shared" })
    .eq("id", save.id);
  if (error) throw error;
}
export async function deleteSave(id: string, data: Data) {
  if (!cloud) {
    localWrite({ ...data, saves: data.saves.filter((s) => s.id !== id) });
    return;
  }
  const { error } = await cloud.from("saves").delete().eq("id", id);
  if (error) throw error;
}
export async function markVisited(plan: Plan, profile: Profile, data: Data) {
  if (data.visits.some((v) => v.plan_id === plan.id)) return;
  const record: Visit = {
    id: crypto.randomUUID(),
    plan_id: plan.id,
    payload: plan,
    created_at: new Date().toISOString(),
  };
  if (!cloud) {
    localWrite({ ...data, visits: [record, ...data.visits] });
    return;
  }
  const { error } = await cloud
    .from("visits")
    .insert({ ...record, couple_id: profile.couple_id, author_id: profile.id });
  if (error) throw error;
}
export async function setFeedback(
  placeId: string,
  value: "liked" | "blocked" | null,
  profile: Profile,
  data: Data,
) {
  if (!cloud) {
    const feedback = { ...data.feedback };
    if (value) feedback[placeId] = value;
    else delete feedback[placeId];
    localWrite({ ...data, feedback });
    return;
  }
  const result = value
    ? await cloud
        .from("place_feedback")
        .upsert(
          { couple_id: profile.couple_id, place_id: placeId, value },
          { onConflict: "couple_id,place_id" },
        )
    : await cloud
        .from("place_feedback")
        .delete()
        .eq("couple_id", profile.couple_id)
        .eq("place_id", placeId);
  if (result.error) throw result.error;
}
export async function signOut() {
  if (cloud) {
    const { error } = await cloud.auth.signOut();
    if (error) throw error;
  }
}
