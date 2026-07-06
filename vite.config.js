import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at the root of the custom domain (tlhelper.org), so no base path.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        achievements: "achievements/index.html",
        admin: "admin/index.html",
        profile: "profile/index.html",
      },
    },
  },
});
