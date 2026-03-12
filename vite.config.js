import { defineConfig } from "vite";

export default defineConfig({
  base: "/qa_validation/",
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    globals: true,
  },
});
