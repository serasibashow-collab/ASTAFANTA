"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { usernameToEmail } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: me } = await supabase
        .from("participants")
        .select("is_admin")
        .eq("id", data.session.user.id)
        .single();
      router.replace(me?.is_admin ? "/admin" : "/auction");
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password
    });

    if (authError || !data.user) {
      setError("Nome o password non corretti.");
      setLoading(false);
      return;
    }

    const { data: me } = await supabase
      .from("participants")
      .select("is_admin")
      .eq("id", data.user.id)
      .single();

    router.replace(me?.is_admin ? "/admin" : "/auction");
  }

  return (
    <main className="center-screen">
      <section className="login-card">
        <div className="eyebrow">LEGA 2026/27</div>
        <h1>Asta Fantacalcio</h1>
        <p className="muted">Entra con il nome assegnato e la tua password.</p>
        <form onSubmit={submit} className="stack-lg">
          <label>
            Nome
            <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="es. rondo" required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary big" disabled={loading}>{loading ? "Accesso..." : "ENTRA"}</button>
        </form>
      </section>
    </main>
  );
}
