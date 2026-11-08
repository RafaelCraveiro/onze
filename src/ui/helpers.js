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

export const talentColor = (t) =>
  t >= 85 ? "#d58bff" : t >= 75 ? "#f5b83d" : t >= 65 ? "#5fe08c" : t >= 55 ? "#aeb9c5" : "#8795a4";

export const ratingColor = (r) =>
  r >= 8 ? "#5fe08c" : r >= 7 ? "#b6f23a" : r >= 6 ? "#f5b83d" : "#ff6b6f";

export const overallColor = (o) =>
  o >= 85 ? "#d58bff" : o >= 72 ? "#5fe08c" : o >= 60 ? "#b6f23a" : o >= 45 ? "#f5b83d" : "#8795a4";

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
