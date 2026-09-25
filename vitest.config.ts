import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // SEED 레시피(@seed-design/css/recipes/*.mjs)는 옆의 .css 를 import 한다.
    // Node 가 직접 실행하면 .css 를 못 읽으므로 Vite 변환 대상으로 넣는다.
    server: { deps: { inline: [/@seed-design\//] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "seed-design": path.resolve(__dirname, "./src/seed-design"),
    },
  },
});
