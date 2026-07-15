import { defineConfig } from "@rsbuild/core";

export default defineConfig({
  server: {
    open: true,
    base: "/test",
  },
  html: {
    template: "./index.html"
  },
  source: {
    entry: {
      index: "./src/main.ts"
    }
  },
  output: {
    distPath: {
      root: "./build"
    }
  },
  plugins: []
});
