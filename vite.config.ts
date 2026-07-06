import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      "/dweb-status": { target: "http://localhost:49737", changeOrigin: true },
      "/discover": { target: "http://localhost:49737", changeOrigin: true },
      "/register": { target: "http://localhost:49737", changeOrigin: true },
      "/ping": { target: "http://localhost:49737", changeOrigin: true },
      "/api": { target: "http://localhost:49737", changeOrigin: true },
      "/relay": { target: "http://localhost:49737", changeOrigin: true },
      "/signal": { target: "http://localhost:49737", changeOrigin: true },
      "/welcome": { target: "http://localhost:49737", changeOrigin: true },
      "/fileshare": { target: "http://localhost:49737", changeOrigin: true },
      "/service-proxy/30999": { target: "http://localhost:30999", changeOrigin: true, rewrite: (p) => p.replace(/^\/service-proxy\/\d+/, "") },
      "/service-proxy/30998": { target: "http://localhost:30998", changeOrigin: true, rewrite: (p) => p.replace(/^\/service-proxy\/\d+/, "") },
    },
  },
}));
