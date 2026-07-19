import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Em dev, a API (contas + base de dados) corre DENTRO do servidor do Vite.
// O caminho fica numa variável ABSOLUTA (+ @vite-ignore) de propósito:
// - se fosse um literal relativo, o carregador de configuração do Vite
//   (esbuild) inlinava o módulo do servidor inteiro — incluindo node:sqlite —
//   dentro do bundle da CONFIG, e isso rebentava o `vite build` (que corre
//   sem --experimental-sqlite) mesmo este código nunca chegando a executar
//   em build. Só se via em Node sem node:sqlite "de fábrica" — passou
//   despercebido em local até rebentar no Render.
// - com uma variável já não é inlinado, MAS o Vite escreve a config para um
//   ficheiro temporário fora daqui (node_modules/.vite-temp/…), por isso um
//   caminho relativo deixa de apontar para o sítio certo — tem de ser
//   absoluto (a partir de process.cwd(), a raiz do projeto).
const onzeApi = () => ({
  name: "onze-api",
  configureServer: async (server) => {
    const modUrl = pathToFileURL(path.resolve(process.cwd(), "server/app.mjs")).href;
    const { app } = await import(/* @vite-ignore */ modUrl);
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
