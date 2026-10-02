import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "node_modules/pyodide/pyodide.asm.mjs",
          dest: "assets/pyodide",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pyodide/pyodide.asm.wasm",
          dest: "assets/pyodide",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pyodide/python_stdlib.zip",
          dest: "assets/pyodide",
          rename: { stripBase: true },
        },
        {
          src: "node_modules/pyodide/pyodide-lock.json",
          dest: "assets/pyodide",
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ["pyodide"],
  },
});
