import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/frontend/setup.ts"],
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx", "tests/frontend/**/*.test.ts", "tests/frontend/**/*.test.tsx"],
  },
});
