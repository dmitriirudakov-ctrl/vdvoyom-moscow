import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { normalizeEvent } from "../../../src/domain/kudago.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const expected = Deno.env.get("IMPORT_SECRET");
  const provided = request.headers.get("x-import-secret") ?? "";
  if (!expected || !provided || provided.length !== expected.length)
    return json({ error: "Unauthorized" }, 401);
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (difference) return json({ error: "Unauthorized" }, 401);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const now = new Date(),
    records = [];
  try {
    let url: string | null =
      "https://kudago.com/public-api/v1.4/events/?" +
      new URLSearchParams({
        location: "msk",
        actual_since: String(Math.floor(now.getTime() / 1000)),
        actual_until: String(Math.floor(now.getTime() / 1000) + 45 * 86400),
        fields:
          "id,title,description,place,dates,price,is_free,categories,site_url",
        expand: "place,dates",
        text_format: "text",
        page_size: "100",
        categories: "exhibition,tour,theater,master-classes",
      });
    let page = 0;
    while (url && page < 8) {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "kudago.com" ||
        !u.pathname.startsWith("/public-api/v1.4/events/")
      )
        throw new Error("Unexpected source URL");
      const response: Response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
      const body: unknown = await response.json();
      if (
        body === null ||
        typeof body !== "object" ||
        !("results" in body) ||
        !Array.isArray(body.results)
      )
        throw new Error("Invalid source response");
      const pageData = body as { results: unknown[]; next?: unknown };
      for (const raw of pageData.results) {
        const place = normalizeEvent(raw, now);
        if (place && place.sessions?.length !== 0)
          records.push({
            id: place.id,
            payload: place,
            updated_at: now.toISOString(),
          });
      }
      url = typeof pageData.next === "string" ? pageData.next : null;
      page++;
    }
    // Incomplete pagination is a failed import; never publish a partial snapshot as a complete daily update.
    if (url) throw new Error("Source page limit reached");
    // Publish a complete snapshot, also removing cancelled/unlisted events.
    const { data: imported, error: publishError } = await client.rpc(
      "replace_event_catalog",
      {
        records: [
          ...new Map(records.map((record) => [record.id, record])).values(),
        ],
      },
    );
    if (publishError) throw publishError;
    return json({ imported });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";
    // Store only the short failure category. No request headers, keys or response bodies.
    await client
      .from("import_runs")
      .insert({ status: "error", imported: 0, message: message.slice(0, 180) });
    return json({ error: "Import failed; previous catalogue retained" }, 502);
  }
});
