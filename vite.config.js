import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Served at the root of the custom domain (tlhelper.org), so no base path.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        achievements: resolve(__dirname, "achievements/index.html"),
        profile: resolve(__dirname, "profile/index.html"),
      },
    },
  },
});
