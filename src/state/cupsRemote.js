/* Cliente das taças multi-jogador (servidor autoritário). */

import { call } from "./api.js";

export const fetchCups = () => call("GET", "/api/cups").then((d) => d.cups);
export const enrollCupApi = (cupId) => call("POST", `/api/cups/${cupId}/enroll`);
export const registerTeamApi = (cupId) => call("POST", `/api/cups/${cupId}/register`);
export const fetchMatch = (cupId, round) => call("GET", `/api/cups/${cupId}/match/${round}`);

export const CUP_ERROR_PT = {
  "ja-noutra-taca": "Já estás inscrito numa taça — termina-a primeiro.",
  "nivel-errado": "Essa taça não é do teu nível.",
  "taca-cheia": "A taça está cheia.",
  "inscricoes-fechadas": "As inscrições dessa taça já fecharam.",
  "ja-inscrito": "Já estás inscrito nessa taça.",
  "janela-fechada": "A janela de registo desta ronda fechou.",
  "ainda-nao-abriu": "O registo desta ronda ainda não abriu.",
  "sem-jogo": "Não tens jogo nesta taça agora.",
  "dinheiro-insuficiente": "Não tens dinheiro suficiente para a inscrição.",
  "sem-ligacao": "Sem ligação ao servidor.",
};
export const cupErrPt = (e) => CUP_ERROR_PT[e?.message] ?? `Erro (${e?.message ?? "?"}).`;
