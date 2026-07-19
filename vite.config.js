import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Em dev, a API (contas + base de dados) corre DENTRO do servidor do Vite.
const onzeApi = () => ({
  name: "onze-api",
  configureServer: async (server) => {
    const { app } = await import("./server/app.mjs");
    server.middlewares.use(app);
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), onzeApi()],
  server: {
    watch: {
      // a base de dados (server/onze.db*) muda a cada gravação de save —
      // sem isto, o watcher dispara um reload da página em loop
      ignored: ["**/server/**", "**/dist/**"],
    },
  },
});
