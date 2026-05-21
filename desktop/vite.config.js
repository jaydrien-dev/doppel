import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load .env from desktop/ (where the file actually lives)
  const env = loadEnv(mode, path.resolve(__dirname), "VITE_");

  return {
    root: "src/renderer",
    define: {
      "import.meta.env.VITE_OPENAI_API_KEY": JSON.stringify(env.VITE_OPENAI_API_KEY ?? ""),
      "import.meta.env.VITE_FASTAPI_URL":    JSON.stringify(env.VITE_FASTAPI_URL    ?? "http://localhost:8000"),
    },
    build: {
      outDir: path.resolve(__dirname, "dist/renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main:     path.resolve(__dirname, "src/renderer/index.html"),
          pill:     path.resolve(__dirname, "src/renderer/pill.html"),
          response: path.resolve(__dirname, "src/renderer/response.html"),
        },
      },
    },
    plugins: [react()],
    server: { port: 5173 },
  };
});
