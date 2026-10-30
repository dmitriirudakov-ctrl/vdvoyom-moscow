import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
// @ts-expect-error Small Node-only configuration helper has no declaration file.
import { checkPublicConfig } from "./scripts/check-public-config.mjs";

export default defineConfig(({ mode }) => {
  checkPublicConfig(loadEnv(mode, process.cwd(), "VITE_"));
  return {
    base: "./",
    plugins: [react()],
    test: { include: ["tests/**/*.test.ts"], environment: "node" },
  };
});
