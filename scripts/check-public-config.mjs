import { pathToFileURL } from "node:url";

export function checkPublicConfig(env, requireCloud = false) {
  const url = env.VITE_SUPABASE_URL || "";
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url && !key && !requireCloud) return;
  if (!url || !key)
    throw new Error(
      "Both public Supabase settings are required for publication.",
    );
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid public Supabase URL.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co"))
    throw new Error("Use an HTTPS Supabase project URL.");
  if (key.startsWith("sb_publishable_") && key.length > 25) return;
  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (payload.role === "anon" && key.split(".").length === 3) return;
  } catch {
    /* Never echo a rejected credential. */
  }
  throw new Error(
    "Only a publishable or legacy anon key belongs in client configuration. Private keys are forbidden.",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  checkPublicConfig(process.env, process.argv.includes("--require-cloud"));
}
