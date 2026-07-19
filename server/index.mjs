/* Servidor de produção do Onze: API + jogo compilado (dist/).
   Correr: npm run build && npm run server  →  http://localhost:4321 */

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");

app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const PORT = process.env.PORT ?? 4321;
app.listen(PORT, () => console.log(`Onze online em http://localhost:${PORT}`));
