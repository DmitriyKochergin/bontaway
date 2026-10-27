import { defineConfig } from "@rsbuild/core";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

const buildTime = process.env.BONTAWAY_BUILD_TIME ?? new Date().toISOString();

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
    },
    define: {
      __BONTAWAY_BUILD_TIME__: JSON.stringify(buildTime)
    }
  },
  performance: {
    chunkSplit: {
      strategy: "split-by-size"
    }
  },
  output: {
    legalComments: "none",
    distPath: {
      root: "./build"
    }
  },
  plugins: [pluginTypeCheck()]
});
