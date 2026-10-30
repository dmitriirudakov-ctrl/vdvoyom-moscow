import { z } from "zod";

export const CATEGORIES = [
  "walk",
  "exhibition",
  "tour",
  "cafe",
  "active",
  "theatre",
  "workshop",
] as const;
export const labels: Record<Category, string> = {
  walk: "Прогулки",
  exhibition: "Выставки",
  tour: "Экскурсии",
  cafe: "Уютные кафе",
  active: "Активный отдых",
  theatre: "Театры",
  workshop: "Мастер-классы",
};
export type Category = (typeof CATEGORIES)[number];
const safeUrl = z
  .string()
  .url()
  .refine((s) => s.startsWith("https://"), "Нужна HTTPS-ссылка");
export const PlaceSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  address: z.string(),
  category: z.enum(CATEGORIES),
  indoor: z.boolean(),
  lat: z.number(),
  lon: z.number(),
  price: z.number().nonnegative().nullable(),
  priceKind: z.enum(["free", "exact", "estimate", "from", "unknown"]),
  duration: z.number().int().positive(),
  open: z.number().int().min(0).max(1440),
  close: z.number().int().min(0).max(1440),
  closedDays: z.array(z.number().int().min(0).max(6)),
  scheduleVerified: z.boolean(),
  source: z.string(),
  sourceUrl: safeUrl,
  checkedAt: z.string(),
  district: z.string(),
  crowded: z.boolean().default(false),
  prohibited: z.boolean().default(false),
  startsOn: z.string().optional(),
  endsOn: z.string().optional(),
  availability: z
    .array(z.object({ startsOn: z.string(), endsOn: z.string() }))
    .optional(),
  sessions: z.array(z.string()).optional(),
});
export type Place = z.infer<typeof PlaceSchema>;
export const SettingsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["idea", "day"]),
  weather: z.enum(["sunny", "indoor"]),
  budget: z.number().int().min(0).max(50000),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  transport: z.number().int().min(0).max(5000),
  start: z.number().int().min(480).max(1080),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const PlanSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  mode: z.enum(["idea", "day"]),
  items: z
    .array(
      z.object({
        place: PlaceSchema,
        start: z.number(),
        end: z.number(),
        travel: z.number(),
      }),
    )
    .min(1),
  transport: z.number().nonnegative(),
  total: z.number().nonnegative(),
  budget: z.number().nonnegative(),
  approximate: z.boolean(),
  createdAt: z.string(),
});
export type Plan = z.infer<typeof PlanSchema>;
export interface Save {
  id: string;
  owner_id: string;
  visibility: "private" | "shared";
  payload: Plan;
  created_at: string;
}
export interface Visit {
  id: string;
  plan_id: string;
  payload: Plan;
  created_at: string;
}
export type Feedback = Record<string, "liked" | "blocked">;
export interface Data {
  saves: Save[];
  visits: Visit[];
  feedback: Feedback;
}
export interface Profile {
  id: string;
  couple_id: string;
  display_name: string;
}
export const emptyData = (): Data => ({ saves: [], visits: [], feedback: {} });
