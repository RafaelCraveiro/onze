/* Emblema do clube — SVG gerado a partir da config {shape, pattern, symbol, c1, c2}. */

const SHAPES = {
  escudo: "M50 4 L92 16 V52 C92 76 74 90 50 97 C26 90 8 76 8 52 V16 Z",
  redondo: "M50 4 C74 4 90 12 90 34 V56 C90 80 72 92 50 97 C28 92 10 80 10 56 V34 C10 12 26 4 50 4 Z",
  circulo: "M50 5 A45 45 0 1 1 49.9 5 Z",
  losango: "M50 3 L95 50 L50 97 L5 50 Z",
};

let uid = 0;

export default function Emblem({ emblem, size = 48, className = "" }) {
  const { shape = "escudo", pattern = "liso", symbol = "⚽", c1 = "#2563eb", c2 = "#f8fafc" } = emblem ?? {};
  const path = SHAPES[shape] ?? SHAPES.escudo;
  const id = `emb${(uid = (uid + 1) % 10000)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <clipPath id={id}>
          <path d={path} />
        </clipPath>
      </defs>
      <path d={path} fill={c1} />
      <g clipPath={`url(#${id})`}>
        {pattern === "riscas" && (
          <>
            <rect x="14" y="0" width="14" height="100" fill={c2} />
            <rect x="43" y="0" width="14" height="100" fill={c2} />
            <rect x="72" y="0" width="14" height="100" fill={c2} />
          </>
        )}
        {pattern === "metades" && <rect x="50" y="0" width="50" height="100" fill={c2} />}
        {pattern === "faixa" && <polygon points="0,72 100,22 100,50 0,100" fill={c2} />}
        {pattern === "cruz" && (
          <>
            <rect x="41" y="0" width="18" height="100" fill={c2} />
            <rect x="0" y="38" width="100" height="18" fill={c2} />
          </>
        )}
      </g>
      <path d={path} fill="none" stroke="#0f172a" strokeWidth="3" />
      <path d={path} fill="none" stroke="#f8fafc" strokeWidth="1.4" opacity="0.7" />
      <text x="50" y="60" textAnchor="middle" fontSize="34" dominantBaseline="middle">{symbol}</text>
    </svg>
  );
}
