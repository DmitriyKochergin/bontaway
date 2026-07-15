import { defineConfig } from "@rsbuild/core";

// biome-ignore suppressions/unused: Rsbuild requires a default-exported config.
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
      index: "./src/index.tsx"
    }
  },
  output: {
    distPath: {
      root: "./build"
    }
  },
  plugins: []
});
