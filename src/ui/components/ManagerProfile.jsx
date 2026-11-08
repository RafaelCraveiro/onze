/* Perfil público de outro manager: identidade, números, troféus e plantel. */

import { useEffect, useState } from "react";
import { Btn, Section } from "./bits.jsx";
import Emblem from "./Emblem.jsx";
import { PlayerCard } from "../views/SquadView.jsx";
import { overallBase, POSITIONS } from "../../engine/constants.js";
import { apiProfile, errPt } from "../../state/api.js";
import { fmtWhen } from "../helpers.js";

const Stat = ({ label, value }) => (
  <div className="rounded-xl bg-[var(--s2)] p-2.5 text-center">
    <p className="tnum text-lg font-bold">{value}</p>
    <p className="text-[11px] text-[var(--t3)]">{label}</p>
  </div>
);

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

  return (
    <div className="flex flex-col gap-4">
      <div><Btn kind="dark" className="!py-1 text-xs" onClick={onBack}>← Voltar</Btn></div>
      {loading && <p className="py-10 text-center text-sm text-[var(--t3)]">A carregar o perfil…</p>}
      {error && <div className="rounded-2xl bg-[var(--danger-soft)] p-4 text-center text-sm text-[var(--danger)]">{error}</div>}

      {profile && (
        <>
          <section className="flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <Emblem emblem={profile.emblem} size={84} />
            <div className="min-w-0">
              <h2 className="font-display truncate text-4xl font-bold leading-none">{profile.clubName}</h2>
              <p className="mt-1 text-sm text-[var(--accent)]">Nível {profile.level}</p>
              <p className="text-xs text-[var(--t3)]">desde {fmtWhen(profile.createdAt)}</p>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Adeptos" value={profile.fans.toLocaleString("pt-PT")} />
            <Stat label="V-E-D" value={`${profile.record.wins}-${profile.record.draws}-${profile.record.losses}`} />
            <Stat label="Jogos" value={profile.record.wins + profile.record.draws + profile.record.losses} />
            <Stat label="Troféus" value={profile.trophies.length} />
          </div>
          {profile.trophies.length > 0 && (
            <Section title="Palmarés">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {profile.trophies.map((t, i) => (
                  <p key={i} className="box-cream rounded-xl px-3 py-2 text-xs font-semibold text-[var(--gold)]">{t.icon ?? "🏆"} {t.label} <span className="font-normal">· {fmtWhen(t.at)}</span></p>
                ))}
              </div>
            </Section>
          )}
          <Section title={`Plantel (${squad.length})`}>
            <div className="grid gap-1.5 md:grid-cols-2">
              {squad.map((p, i) => <PlayerCard key={i} p={p} onClick={() => onShowPlayer?.(p)} />)}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
