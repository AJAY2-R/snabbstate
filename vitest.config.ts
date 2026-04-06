import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // Match the jsxFactory/fragment settings in tsconfig.json
    jsxFactory: "jsx",
    jsxFragment: "Fragment"
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.spec.ts", "src/**/*.spec.tsx"],
    exclude: ["src/solid/**"],
    benchmark: {
      include: ["src/**/*.bench.ts"]
    },
    // Report each test name for clarity
    reporters: ["verbose"]
  }
});
