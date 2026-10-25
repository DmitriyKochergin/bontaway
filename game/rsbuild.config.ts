import { defineConfig } from "@rsbuild/core";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

export default defineConfig({
  server: {
    open: true,
    base: "/bontaway"
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
  plugins: [pluginTypeCheck()]
});
