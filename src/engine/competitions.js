/* Progressão dos managers simulados. (Não há liga — só taças, em realtime.js.) */

export const YOU = "you";

/* XP dos bots: vitória +3, empate +1 — o mundo evolui como o jogador. */
export const botXp = (h, a, [gh, ga]) => {
  const give = (b, xp) => {
    if (!b) return;
    b.xp += xp;
    let need = 9 + (b.level - 1) * 6;
    while (b.xp >= need && b.level < 30) {
      b.xp -= need; b.level++; b.str += 4;
      need = 9 + (b.level - 1) * 6;
    }
    if (gh !== ga) b.wins += xp === 3 ? 1 : 0;
  };
  if (gh > ga) give(h, 3);
  else if (ga > gh) give(a, 3);
  else { give(h, 1); give(a, 1); }
};
