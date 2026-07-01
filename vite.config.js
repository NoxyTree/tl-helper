import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project page lives under /tl-helper/ on GitHub Pages; keep local dev at root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/tl-helper/" : "/",
  plugins: [react()],
}));
