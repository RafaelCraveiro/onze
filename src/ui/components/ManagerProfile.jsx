/* Perfil PÚBLICO de outro manager — PÁGINA inteira (estilo 11x11), não modal:
   cabeçalho com o nome, caixa cinzenta com os dados, emblema grande à direita
   e a tabela do plantel por baixo. Bots não têm perfil. */

import { useEffect, useState } from "react";
import { PosBadge, Talent, Btn } from "./bits.jsx";
import Emblem from "./Emblem.jsx";
import { overallBase, POSITIONS } from "../../engine/constants.js";
import { apiProfile, errPt } from "../../state/api.js";
import { overallColor, fmtWhen } from "../helpers.js";

export default function ManagerProfilePage({ clubName, onBack, onShowPlayer }) {
  const [state, setState] = useState({ loading: true, profile: null, error: null });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, profile: null, error: null });
    apiProfile(clubName)
      .then(({ profile }) => alive && setState({ loading: false, profile, error: null }))
      .catch((e) => alive && setState({ loading: false, profile: null, error: errPt(e) }));
    return () => { alive = false; };
  }, [clubName]);

  const { loading, profile, error } = state;
  const squad = profile
    ? [...profile.squad].sort((a, b) => POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overallBase(b) - overallBase(a))
    : [];
  const games = profile ? profile.record.wins + profile.record.draws + profile.record.losses : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#3a4030]">
          Perfil <span className="mx-1 text-[#d97706]">⚽</span>
          <span className="text-[#2563eb]">{clubName}</span>
          {profile && <span className="ml-1 font-normal text-[#8a9077]">[{profile.level}]</span>}
        </h2>
        <Btn kind="dark" className="!py-1 text-xs" onClick={onBack}>← Voltar</Btn>
      </div>

      {loading && <p className="py-10 text-center text-sm text-[#9aa08e]">A carregar o perfil…</p>}
      {error && (
        <div className="rounded-lg border border-[#e8b4ae] bg-[#fdeeec] p-4 text-center text-sm text-[#c0392b]">{error}</div>
      )}

      {profile && (
        <>
          {/* caixa de dados + emblema grande, lado a lado como no 11x11 */}
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="rounded-lg bg-[#ececec] p-4">
              <table className="w-full text-sm">
                <tbody>
                  <InfoRow label="Manager" value={<b>{profile.clubName} [{profile.level}]</b>} />
                  <InfoRow label="Registado em" value={fmtWhen(profile.createdAt)} />
                  <InfoRow label="Nível" value={<b>{profile.level}</b>} />
                  <InfoRow label="Adeptos" value={profile.fans.toLocaleString("pt-PT")} />
                  <InfoRow label="Jogos" value={games} />
                  <InfoRow
                    label="Registo (V-E-D)"
                    value={<b>{profile.record.wins}-{profile.record.draws}-{profile.record.losses}</b>}
                  />
                  <InfoRow label="Taças ganhas" value={<b className="text-[#d97706]">{profile.trophies.length} 🏆</b>} />
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center rounded-lg border border-[#e0e2d2] bg-white p-4">
              <Emblem emblem={profile.emblem} size={120} />
            </div>
          </div>

          {/* palmarés */}
          <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
            <h3 className="mb-2 border-b border-[#e6e8da] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#4f7a12]">
              Palmarés ({profile.trophies.length})
            </h3>
            {profile.trophies.length === 0 ? (
              <p className="text-xs text-[#9aa08e]">Ainda sem taças conquistadas.</p>
            ) : (
              <div className="grid gap-1 sm:grid-cols-2">
                {profile.trophies.map((t, i) => (
                  <p key={i} className="box-cream rounded-md px-2 py-1.5 text-xs font-semibold text-[#a07407]">
                    {t.icon ?? "🏆"} {t.label} <span className="font-normal">· nível {t.level} · {fmtWhen(t.at)}</span>
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* plantel — tabela como a do 11x11 */}
          <div className="rounded-lg border border-[#d9dcc8] bg-white p-3 shadow-sm">
            <h3 className="mb-2 border-b border-[#e6e8da] pb-1.5 text-sm font-bold uppercase tracking-wide text-[#4f7a12]">
              Plantel ({squad.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr className="nav-green text-left text-xs text-white" style={{ textShadow: "0 1px 1px rgba(0,0,0,0.3)" }}>
                    <th className="rounded-l px-2 py-1.5">#</th>
                    <th className="px-1 py-1.5">Jogador</th>
                    <th className="px-1 py-1.5">Nat.</th>
                    <th className="px-1 py-1.5">Pos</th>
                    <th className="px-1 py-1.5 text-center">Idade</th>
                    <th className="px-1 py-1.5 text-center">Skl</th>
                    <th className="px-1 py-1.5 text-center">Golos</th>
                    <th className="rounded-r px-1 py-1.5 text-center">Tal</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((p, i) => (
                    <tr
                      key={i}
                      onClick={() => onShowPlayer?.(p)}
                      title="Ver a página do jogador"
                      className={`cursor-pointer border-b border-[#eef0e4] hover:bg-[#f9f7dd] ${i % 2 ? "bg-[#f7f8f1]" : "bg-white"}`}
                    >
                      <td className="px-2 py-1 text-xs text-[#9aa08e]">{i + 1}</td>
                      <td className="px-1 py-1 font-semibold text-[#3d7a0e] underline decoration-dotted">{p.name}</td>
                      <td className="px-1 py-1">{p.flag}</td>
                      <td className="px-1 py-1"><PosBadge pos={p.pos} /></td>
                      <td className="px-1 py-1 text-center">{p.age}</td>
                      <td className="px-1 py-1 text-center font-black" style={{ color: overallColor(overallBase(p)) }}>{overallBase(p)}</td>
                      <td className="px-1 py-1 text-center text-xs">{p.stats?.goals ?? 0}</td>
                      <td className="px-1 py-1 text-center"><Talent t={p.talent} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const InfoRow = ({ label, value }) => (
  <tr className="border-b border-[#ddd] last:border-0">
    <td className="py-1.5 pr-3 font-semibold text-[#555]">{label}</td>
    <td className="py-1.5 text-[#333]">{value}</td>
  </tr>
);
