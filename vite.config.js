import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at the root of the custom domain (tlhelper.org), so no base path.
export default defineConfig({
  plugins: [react()],
});
