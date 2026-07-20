/* Cliente da API do Onze — contas online, plantel e economia SEMPRE do servidor.
   O cliente nunca guarda dinheiro/jogadores como fonte de verdade: cada ação
   económica é um pedido ao servidor, que valida e responde com o resultado. */

const TOKEN_KEY = "onze-token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const call = async (method, url, body) => {
  const token = getToken();
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("sem-ligacao");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `erro-${res.status}`);
  return data;
};

/* ---------- conta ---------- */
export const apiRegister = (email, password, clubName, emblem) =>
  call("POST", "/api/register", { email, password, clubName, emblem });
export const apiLogin = (email, password) => call("POST", "/api/login", { email, password });
export const apiLogout = () => call("POST", "/api/logout").catch(() => {});
export const apiMe = () => call("GET", "/api/me");

/* ---------- estado (plantel + economia — autoritário no servidor) ---------- */
export const apiState = () => call("GET", "/api/state");

export const apiSetLineup = (formation, starters) => call("POST", "/api/lineup", { formation, starters });
export const apiSetStyle = (style) => call("POST", "/api/tactics", { style });

// distribuição manual de XP: sobe UM atributo de UM jogador (custa XP banked dele)
export const apiTrain = (playerId, skill) => call("POST", `/api/squad/${playerId}/train`, { skill });

export const apiBuy = (listingId) => call("POST", "/api/market/buy", { listingId });
export const apiSell = (playerId, price) => call("POST", "/api/market/sell", { playerId, price });
export const apiCancelSale = (playerId) => call("POST", "/api/market/cancel", { playerId });
export const apiRelease = (playerId) => call("POST", "/api/squad/release", { playerId });
export const apiUpgrade = (key) => call("POST", "/api/club/upgrade", { key });
export const apiBooster = (key) => call("POST", "/api/club/booster", { key });

export const apiFriendly = () => call("POST", "/api/matches/friendly");

export const API_ERROR_PT = {
  "email-invalido": "Email inválido.",
  "password-curta": "A password precisa de pelo menos 6 caracteres.",
  "clube-invalido": "O nome do clube deve ter 3 a 26 caracteres.",
  "emblema-invalido": "Escolhe um emblema.",
  "email-existe": "Já existe uma conta com este email.",
  "clube-existe": "Esse nome de clube já está ocupado — cada clube é único!",
  credenciais: "Email ou password errados.",
  "sem-ligacao": "Sem ligação ao servidor. O servidor está a correr?",
  "sem-sessao": "Sessão expirada — entra de novo.",
  "sessao-invalida": "Sessão expirada — entra de novo.",
  "mercado-bloqueado": "O mercado só abre a partir do nível 3.",
  "dinheiro-insuficiente": "Não tens dinheiro suficiente.",
  "nivel-maximo": "Já está no nível máximo.",
  "ja-ativo": "Já está ativo.",
  "atributo-invalido": "Atributo inválido.",
  "teto-atingido": "Este atributo já está no teto (25).",
  "xp-insuficiente": "Não tens XP suficiente para este jogador.",
};
export const errPt = (e) => API_ERROR_PT[e?.message] ?? `Erro inesperado (${e?.message ?? "?"}).`;
