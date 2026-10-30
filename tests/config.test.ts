import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only helper.
import { checkPublicConfig } from "../scripts/check-public-config.mjs";

describe("Private keys cannot enter the public application build", () => {
  const url = "https://example.supabase.co";
  it("permits an explicit local demo but requires cloud settings for publication", () => {
    expect(() => checkPublicConfig({})).not.toThrow();
    expect(() => checkPublicConfig({}, true)).toThrow();
  });
  it("accepts publishable and legacy anon client keys", () => {
    expect(() =>
      checkPublicConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_123456789",
      }),
    ).not.toThrow();
    const anon = `header.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(() =>
      checkPublicConfig({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: anon,
      }),
    ).not.toThrow();
  });
  it("rejects service-role, secret keys and insecure project URLs", () => {
    const service = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    for (const key of [service, "sb_secret_example_123456789", "unexpected"])
      expect(() =>
        checkPublicConfig({
          VITE_SUPABASE_URL: url,
          VITE_SUPABASE_PUBLISHABLE_KEY: key,
        }),
      ).toThrow();
    expect(() =>
      checkPublicConfig({
        VITE_SUPABASE_URL: "http://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example_123456789",
      }),
    ).toThrow();
  });
});
