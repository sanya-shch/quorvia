import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    globals: true,
    // CSS is empty in tests by default, even for ?raw; motion.tokens.test.ts reads two stylesheets as text.
    css: { include: [/\.css\?raw$/] },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/**/*.d.ts"],
    },
  },
});
