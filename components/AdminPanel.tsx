"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Auction, Participant, Player, Purchase, Role } from "@/lib/types";
import LiveAuction from "@/components/LiveAuction";

const ROLE_NAMES: Record<Role, string> = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };

export default function AdminPanel() {
  const [me, setMe] = useState<Participant | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [phase, setPhase] = useState<Role>("P");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { window.location.href = "/login"; return; }
    const [meRes, plRes, parRes, purRes, aucRes, stateRes] = await Promise.all([
      supabase.from("participants").select("*").eq("id", auth.user.id).single(),
      supabase.from("players").select("*").order("name"),
      supabase.from("participants").select("*").order("display_name"),
      supabase.from("purchases").select("*").order("purchased_at", { ascending: false }),
      supabase.from("auctions").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("league_state").select("phase").eq("id", 1).single()
    ]);
    if (!meRes.data?.is_admin) { window.location.href = "/auction"; return; }
    setMe(meRes.data as Participant);
    setPlayers((plRes.data ?? []) as Player[]);
    setParticipants((parRes.data ?? []) as Participant[]);
    setPurchases((purRes.data ?? []) as Purchase[]);
    setAuction((aucRes.data ?? null) as Auction | null);
    setPhase((stateRes.data?.phase ?? "P") as Role);
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    const channel = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_state" }, load)
      .subscribe();
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, []);

  const available = useMemo(() => players.filter((p) => p.status === "available" && p.role === phase && p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 15), [players, phase, query]);
  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const currentPlayer = auction ? playerMap.get(auction.player_id) : undefined;
  const winner = auction?.highest_bidder_id ? participantMap.get(auction.highest_bidder_id) : undefined;
  const expired = auction ? new Date(auction.ends_at).getTime() <= now : false;

  async function rpc(name: string, args: Record<string, unknown> = {}) {
    setError("");
    const { error: rpcError } = await supabase.rpc(name, args);
    if (rpcError) setError(rpcError.message);
    else { setSelected(null); setQuery(""); await load(); }
  }

  async function logout() { await supabase.auth.signOut(); window.location.href = "/login"; }

  if (!me) return <main className="center-screen"><div className="muted">Caricamento pannello admin...</div></main>;

  return (
    <div className="admin-shell">
      <header className="topbar">
        <div><span className="brand">CONTROL ROOM</span><span className="phase-pill">{ROLE_NAMES[phase]}</span></div>
        <div className="top-actions"><a className="primary button-link" href="/auction">Vai all'asta</a><button className="ghost" onClick={logout}>Esci</button></div>
      </header>

      <main className="admin-grid">
        <section className="panel admin-main">
          <div className="panel-title">1. Fase dell'asta</div>
          <div className="phase-buttons">
            {(["P","D","C","A"] as Role[]).map((r) => <button key={r} className={phase === r ? "primary" : "ghost"} disabled={!!auction} onClick={() => rpc("set_phase", { p_phase: r })}>{ROLE_NAMES[r]}</button>)}
          </div>

          <div className="divider" />
          <div className="panel-title">2. Chiama un giocatore</div>
          <input className="search-input" value={query} disabled={!!auction} onChange={(e) => { setQuery(e.target.value); setSelected(null); }} placeholder={`Cerca tra i ${ROLE_NAMES[phase].toLowerCase()} disponibili...`} />
          {query && !auction && <div className="search-results">{available.map((p) => <button key={p.id} onClick={() => { setSelected(p); setQuery(p.name); }}><span><b>{p.name}</b><small>{p.team} · Qt {p.quote_a ?? "–"} · FVM {p.fvm ?? "–"}</small></span><span>{p.role}</span></button>)}</div>}
          {selected && !auction && <div className="selected-player"><div><b>{selected.name}</b><span>{selected.team} · {ROLE_NAMES[selected.role]}</span></div><button className="primary big" onClick={() => rpc("start_auction", { p_player_id: selected.id })}>AVVIA ASTA</button></div>}

          <div className="divider" />
          <div className="panel-title">3. Asta corrente</div>
          {!auction || !currentPlayer ? <div className="muted">Nessuna asta attiva.</div> : <div className="admin-auction-box">
            <div><span className="role-badge">{currentPlayer.role} · {currentPlayer.team}</span><h2>{currentPlayer.name}</h2><div className="admin-price">{auction.current_price} crediti</div><div>{winner ? `${winner.display_name} in testa` : "Nessuna offerta"}</div></div>
            {expired ? <div className="confirm-box"><div className="confirm-question">{winner ? <>{currentPlayer.name} va a <b>{winner.display_name}</b> per <b>{auction.current_price}</b>?</> : <>Nessuna offerta per {currentPlayer.name}.</>}</div>{winner && <button className="primary big" onClick={() => rpc("confirm_auction", { p_auction_id: auction.id })}>SÌ, CONFERMA</button>}<button className="secondary" onClick={() => rpc("reopen_auction", { p_auction_id: auction.id })}>NO · RIAPRI 10s</button><button className="danger-button" onClick={() => rpc("cancel_auction", { p_auction_id: auction.id })}>ANNULLA ASTA</button></div> : <div className="muted">Timer in corso. Tutti i rilanci lo riportano a 15 secondi.</div>}
          </div>}
          {error && <div className="error-box">{error}</div>}
        </section>

        <aside className="side-column">
          <section className="panel"><div className="panel-title">Ultimi acquisti</div><div className="purchase-list">{purchases.slice(0, 12).map((p) => <div className="purchase-row" key={p.id}><div><b>{playerMap.get(p.player_id)?.name ?? "?"}</b><span>{participantMap.get(p.participant_id)?.display_name ?? "?"} · {p.price}</span></div><button className="tiny danger-button" disabled={!!auction} onClick={() => rpc("undo_purchase", { p_purchase_id: p.id })}>Annulla</button></div>)}{purchases.length === 0 && <div className="muted small">Nessun acquisto.</div>}</div></section>
          <section className="panel"><div className="panel-title">Budget</div><div className="league-list">{participants.map((p) => <div className="league-row" key={p.id}><span>{p.display_name}</span><b>{p.budget_remaining}</b></div>)}</div></section>
        </aside>
      </main>
    </div>
  );
}
