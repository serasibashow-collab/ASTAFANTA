"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Auction, Bid, Participant, Player, Purchase, Role } from "@/lib/types";

const ROLE_LIMITS: Record<Role, number> = { P: 3, D: 8, C: 8, A: 6 };
const ROLE_NAMES: Record<Role, string> = { P: "Portieri", D: "Difensori", C: "Centrocampisti", A: "Attaccanti" };

type Props = { adminMode?: boolean };

export default function LiveAuction({ adminMode = false }: Props) {
  const [me, setMe] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [phase, setPhase] = useState<Role>("P");
  const [customBid, setCustomBid] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      window.location.href = "/login";
      return;
    }

    const [meRes, participantsRes, playersRes, purchasesRes, auctionRes, stateRes] = await Promise.all([
      supabase.from("participants").select("*").eq("id", auth.user.id).single(),
      supabase.from("participants").select("*").order("display_name"),
      supabase.from("players").select("*"),
      supabase.from("purchases").select("*").order("purchased_at", { ascending: false }),
      supabase.from("auctions").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("league_state").select("phase").eq("id", 1).single()
    ]);

    if (adminMode && !meRes.data?.is_admin) {
      window.location.href = "/auction";
      return;
    }

    setMe(meRes.data as Participant);
    setParticipants((participantsRes.data ?? []) as Participant[]);
    setPlayers((playersRes.data ?? []) as Player[]);
    setPurchases((purchasesRes.data ?? []) as Purchase[]);
    setAuction((auctionRes.data ?? null) as Auction | null);
    setPhase((stateRes.data?.phase ?? "P") as Role);

    if (auctionRes.data) {
      const { data: bidRows } = await supabase
        .from("bids")
        .select("*")
        .eq("auction_id", auctionRes.data.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setBids((bidRows ?? []) as Bid[]);
    } else {
      setBids([]);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    const channel = supabase
      .channel("fantacalcio-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_state" }, load)
      .subscribe();

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  const playerMap = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const participantMap = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);
  const currentPlayer = auction ? playerMap.get(auction.player_id) : undefined;
  const highest = auction?.highest_bidder_id ? participantMap.get(auction.highest_bidder_id) : undefined;
  const remainingMs = auction ? Math.max(0, new Date(auction.ends_at).getTime() - now) : 0;
  const expired = !!auction && remainingMs <= 0;
  const seconds = Math.ceil(remainingMs / 1000);

  const myPurchases = purchases.filter((p) => p.participant_id === me?.id);
  const myRoleCounts = myPurchases.reduce<Record<Role, number>>((acc, purchase) => {
    const role = playerMap.get(purchase.player_id)?.role;
    if (role) acc[role] += 1;
    return acc;
  }, { P: 0, D: 0, C: 0, A: 0 });
  const remainingSlots = 25 - myPurchases.length;
  const theoreticalMax = me ? Math.max(0, me.budget_remaining - Math.max(0, remainingSlots - 1)) : 0;
  const canBid = !!auction && !expired && !!me && auction.highest_bidder_id !== me.id && !!currentPlayer && myRoleCounts[currentPlayer.role] < ROLE_LIMITS[currentPlayer.role];

  async function placeBid(amount?: number) {
    setError("");
    const { error: rpcError } = await supabase.rpc("place_bid", { p_amount: amount ?? null });
    if (rpcError) setError(rpcError.message);
  }

  function customSubmit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(customBid);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Inserisci un'offerta intera valida.");
      return;
    }
    placeBid(amount);
    setCustomBid("");
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!me) return <main className="center-screen"><div className="muted">Caricamento asta...</div></main>;

  return (
    <div className="auction-shell">
      <header className="topbar">
        <div><span className="brand">ASTA LIVE</span><span className="phase-pill">{ROLE_NAMES[phase]}</span></div>
        <div className="top-actions">
          {me.is_admin && !adminMode && <a className="ghost button-link" href="/admin">Admin</a>}
          {adminMode && <a className="ghost button-link" href="/auction">Vista asta</a>}
          <button className="ghost" onClick={logout}>Esci</button>
        </div>
      </header>

      <main className="auction-grid">
        <section className="live-card">
          {!auction || !currentPlayer ? (
            <div className="empty-live"><div className="pulse-dot"/><h2>In attesa del prossimo nome</h2><p>L'admin avvierà l'asta appena viene chiamato un giocatore.</p></div>
          ) : (
            <>
              <div className="role-badge">{currentPlayer.role} · {currentPlayer.team}</div>
              <h1 className="player-name">{currentPlayer.name}</h1>
              <div className="quote-line">Quotazione {currentPlayer.quote_a ?? "–"} · FVM {currentPlayer.fvm ?? "–"}</div>
              <div className="price">{auction.current_price}<span> crediti</span></div>
              <div className="leader">{highest ? <><strong>{highest.display_name}</strong> in testa</> : "Nessuna offerta"}</div>
              <div className={`timer ${expired ? "expired" : remainingMs <= 3000 ? "danger" : ""}`}>{expired ? "00" : String(seconds).padStart(2, "0")}</div>

              {!expired ? (
                <div className="bid-zone">
                  <button className="primary bid-button" disabled={!canBid} onClick={() => placeBid()}>RILANCIA +1</button>
                  <form className="custom-bid" onSubmit={customSubmit}>
                    <input inputMode="numeric" value={customBid} onChange={(e) => setCustomBid(e.target.value)} placeholder="Offerta" />
                    <button className="secondary" disabled={!canBid}>OFFRI</button>
                  </form>
                  {auction.highest_bidder_id === me.id && <div className="success-box">Sei attualmente il miglior offerente.</div>}
                </div>
              ) : (
                <div className="expired-message">Tempo scaduto · in attesa della conferma dell'admin</div>
              )}
              {error && <div className="error-box">{error}</div>}
            </>
          )}
        </section>

        <aside className="side-column">
          <section className="panel budget-panel">
            <div className="panel-title">{me.display_name}</div>
            <div className="budget-number">{me.budget_remaining}</div>
            <div className="muted small">crediti rimasti · max teorico ora {theoreticalMax}</div>
            <div className="slots-grid">
              {(Object.keys(ROLE_LIMITS) as Role[]).map((role) => <div key={role}><b>{role}</b><span>{myRoleCounts[role]}/{ROLE_LIMITS[role]}</span></div>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Ultimi rilanci</div>
            <div className="bid-history">
              {bids.length === 0 && <div className="muted small">Ancora nessun rilancio.</div>}
              {bids.map((bid) => <div className="history-row" key={bid.id}><span>{participantMap.get(bid.bidder_id)?.display_name ?? "?"}</span><strong>{bid.amount}</strong></div>)}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">Situazione lega</div>
            <div className="league-list">
              {participants.map((p) => {
                const count = purchases.filter((x) => x.participant_id === p.id).length;
                return <div className="league-row" key={p.id}><span>{p.display_name}</span><span><b>{p.budget_remaining}</b> · {count}/25</span></div>;
              })}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
