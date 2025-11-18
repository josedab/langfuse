import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false, // Set to true via CLI flag --coverage
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html"],
      reportsDirectory: "./coverage",

      include: ["src/**/*.ts"],

      exclude: [
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        "src/index.ts", // Entry point
        "src/app.ts", // Express app entry
        "src/scripts/**", // Utility scripts
      ],

      thresholds: {
        branches: 50,
        functions: 50,
        lines: 60,
        statements: 60,
      },
    },
  },
});
