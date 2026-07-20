/* Hook único: conta online (email + password), estado do clube (plantel +
   economia) e taças — TUDO autoritário no servidor. O cliente nunca decide
   dinheiro, jogadores ou resultados: só mostra o que o servidor devolve e
   pede ações (comprar, vender, construir, registar equipa…). Formação/tática/
   foco de treino são otimistas no ecrã (resposta instantânea) mas sempre
   sincronizadas para o servidor logo a seguir. */

import { useEffect, useRef, useState } from "react";
import { autoPickXI } from "../engine/team.js";
import { buildTimeline } from "../engine/timeline.js";
import {
  getToken, setToken, apiRegister, apiLogin, apiLogout, apiState,
  apiSetLineup, apiSetStyle, apiTrain,
  apiBuy, apiSell, apiCancelSale, apiRelease, apiUpgrade, apiBooster, apiFriendly,
  errPt,
} from "./api.js";
import { fetchCups, enrollCupApi, registerTeamApi, cupErrPt } from "./cupsRemote.js";

export const useGame = () => {
  const [game, setGame] = useState(null);
  const [auth, setAuth] = useState({ status: "loading", error: null, busy: false });
  const [notice, setNotice] = useState(null);
  const gameRef = useRef(null);
  gameRef.current = game;

  const flash = (text, kind = "info") => setNotice({ text, kind, at: Date.now() });

  /* ---------- arranque: sessão guardada? ---------- */
  useEffect(() => {
    const token = getToken();
    if (!token) { setAuth({ status: "anon", error: null, busy: false }); return; }
    (async () => {
      try {
        const { game: g } = await apiState();
        setGame({ ...g, cups: [], live: null });
        setAuth({ status: "authed", error: null, busy: false });
      } catch (e) {
        if (e.message === "sem-sessao" || e.message === "sessao-invalida") {
          setToken(null);
          setAuth({ status: "anon", error: null, busy: false });
        } else {
          setAuth({ status: "anon", error: errPt(e), busy: false });
        }
      }
    })();
  }, []);

  /* ---------- refresco a partir do servidor ---------- */
  const refreshState = async () => {
    try {
      const { game: fresh } = await apiState();
      setGame((g) => (g ? { ...g, ...fresh, cups: g.cups, live: g.live } : g));
    } catch { /* silencioso — o próximo poll tenta de novo */ }
  };
  const refreshCups = async () => {
    try {
      const cups = await fetchCups();
      setGame((g) => (g ? { ...g, cups } : g));
    } catch { /* silencioso */ }
  };

  /* polling: economia/plantel a cada 12s, taças a cada 8s — pausados durante um jogo ao vivo */
  useEffect(() => {
    if (auth.status !== "authed") return;
    refreshState();
    refreshCups();
    const s = setInterval(() => { if (!gameRef.current?.live) refreshState(); }, 12000);
    const c = setInterval(() => { if (!gameRef.current?.live) refreshCups(); }, 8000);
    return () => { clearInterval(s); clearInterval(c); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  /* edição otimista (formação/tática/treino): muda no ecrã já, sincroniza a seguir */
  const mutateLocal = (fn, push) =>
    setGame((g) => {
      if (!g) return g;
      const copy = structuredClone(g);
      fn(copy);
      push?.(copy)?.catch(() => {});
      return copy;
    });

  /* ações económicas: esperam o servidor confirmar e trazem o estado fresco */
  const runEconomic = async (fn) => {
    try {
      await fn();
      await refreshState();
    } catch (e) {
      flash(errPt(e), "erro");
    }
  };

  const actions = {
    /* ---------- Conta online ---------- */
    register: async ({ email, password, clubName, emblem }) => {
      setAuth((a) => ({ ...a, busy: true, error: null }));
      try {
        const { token, game: g } = await apiRegister(email, password, clubName, emblem);
        setToken(token);
        setGame({ ...g, cups: [], live: null });
        setAuth({ status: "authed", error: null, busy: false });
        return true;
      } catch (e) {
        setAuth({ status: "anon", error: errPt(e), busy: false });
        return false;
      }
    },
    login: async ({ email, password }) => {
      setAuth((a) => ({ ...a, busy: true, error: null }));
      try {
        const { token, game: g } = await apiLogin(email, password);
        setToken(token);
        setGame({ ...g, cups: [], live: null });
        setAuth({ status: "authed", error: null, busy: false });
        return true;
      } catch (e) {
        setAuth({ status: "anon", error: errPt(e), busy: false });
        return false;
      }
    },
    logout: () => {
      apiLogout();
      setToken(null);
      setGame(null);
      setAuth({ status: "anon", error: null, busy: false });
    },

    /* ---------- Tática / treino (otimista) ---------- */
    setFormation: (formation) =>
      mutateLocal(
        (g) => { g.lineup.formation = formation; g.lineup.starters = autoPickXI(g.players, formation); },
        (g) => apiSetLineup(g.lineup.formation, g.lineup.starters)
      ),
    setStyle: (style) =>
      mutateLocal((g) => { g.tacticStyle = style; }, (g) => apiSetStyle(g.tacticStyle)),
    autoXI: () =>
      mutateLocal(
        (g) => { g.lineup.starters = autoPickXI(g.players, g.lineup.formation); },
        (g) => apiSetLineup(g.lineup.formation, g.lineup.starters)
      ),
    swapStarter: (slotIdx, playerId) =>
      mutateLocal(
        (g) => {
          const cur = [...g.lineup.starters];
          const existing = cur.indexOf(playerId);
          if (existing >= 0) [cur[existing], cur[slotIdx]] = [cur[slotIdx], cur[existing]];
          else cur[slotIdx] = playerId;
          g.lineup.starters = cur;
        },
        (g) => apiSetLineup(g.lineup.formation, g.lineup.starters)
      ),

    /* ---------- Jogos ---------- */
    startMatch: async (kind) => {
      if (kind !== "amigavel" || gameRef.current?.live) return;
      let out;
      try { out = await apiFriendly(); }
      catch (e) { flash(errPt(e), "erro"); return; }
      setGame((g) => (g ? {
        ...g,
        live: {
          kind: "amigavel", isHome: out.isHome, userSide: out.isHome ? "H" : "A",
          opp: out.opp, result: out.result, timeline: buildTimeline(out.result),
        },
      } : g));
      refreshState(); // a economia já foi aplicada no servidor — só traz os números frescos
    },

    registerAndPlay: async (cupId) => {
      if (gameRef.current?.live) return;
      let out;
      try { out = await registerTeamApi(cupId); }
      catch (e) { flash(cupErrPt(e), "erro"); refreshCups(); return; }
      if (out.resolved) {
        setGame((g) => (g ? {
          ...g,
          live: {
            kind: "taca", isHome: out.isHome, userSide: out.isHome ? "H" : "A",
            opp: { team: out.opp.team, user: out.opp.team, emblem: out.opp.emblem, level: out.opp.level },
            result: out.result, timeline: buildTimeline(out.result),
          },
        } : g));
        refreshState();
      } else {
        flash("Equipa enviada ✓ — à espera do adversário. O jogo faz-se assim que ele registar (ou ao fim da janela).", "ok");
        refreshCups();
      }
    },

    finishMatch: () => {
      setGame((g) => (g ? { ...g, live: null } : g));
      refreshState();
    },

    /* ---------- Mercado ---------- */
    buyPlayer: (listingId) => runEconomic(() => apiBuy(listingId)),
    listForSale: (playerId, price) => runEconomic(() => apiSell(playerId, price)),
    cancelSale: (playerId) => runEconomic(() => apiCancelSale(playerId)),
    releasePlayer: (playerId) => runEconomic(() => apiRelease(playerId)),

    /* ---------- Taças (servidor) ---------- */
    enrollCup: async (cupId) => {
      try {
        await enrollCupApi(cupId);
        flash("Inscrição confirmada ✓", "ok");
        await Promise.all([refreshState(), refreshCups()]);
      } catch (e) {
        flash(cupErrPt(e), "erro");
        refreshCups();
      }
    },

    /* ---------- Clube ---------- */
    upgradeBuilding: (key) => runEconomic(() => apiUpgrade(key)),
    buyBooster: (key) => runEconomic(() => apiBooster(key)),

    /* ---------- Evolução: distribuição manual de XP ---------- */
    trainSkill: (playerId, skill) => runEconomic(() => apiTrain(playerId, skill)),

    dismissNotice: () => setNotice(null),
  };

  return { game, actions, auth, notice };
};
