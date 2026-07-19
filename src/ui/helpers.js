/* Helpers de apresentação. */

export const fmtMoney = (v) => `${Math.round(v).toLocaleString("pt-PT")}€`;

// timestamp → "17:35" (hoje) ou "16.07 17:35"
export const fmtWhen = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hm;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
};

export const talentStars = (t) => "★".repeat(t);

export const talentColor = (t) =>
  t >= 8 ? "#b026c9" : t >= 7 ? "#dd9a06" : t >= 5 ? "#3d8c0e" : t >= 3 ? "#6b7261" : "#9aa08e";

export const ratingColor = (r) =>
  r >= 8 ? "#3d8c0e" : r >= 7 ? "#71a412" : r >= 6 ? "#c98d09" : "#c0392b";

// escala pensada para o Skl total (soma das 8 sub-habilidades, ~45-250)
export const overallColor = (o) =>
  o >= 140 ? "#b026c9" : o >= 100 ? "#3d8c0e" : o >= 75 ? "#71a412" : o >= 55 ? "#c98d09" : "#8a9077";

// contraste simples entre duas cores hex (para kits não se confundirem)
export const colorsClash = (a, b) => {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  try {
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 160;
  } catch {
    return false;
  }
};
