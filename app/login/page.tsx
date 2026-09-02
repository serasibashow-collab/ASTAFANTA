"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();

    setError("");
    setLoading(true);

    const { data: user, error } = await supabase
      .from("participants")
      .select("*")
      .eq("login_name", username.trim().toLowerCase())
      .eq("password", password)
      .single();

    console.log("LOGIN RESULT:", user, error);

    if (error || !user) {
      setError("Nome o password non corretti.");
      setLoading(false);
      return;
    }

    localStorage.setItem(
      "participant",
      JSON.stringify(user)
    );

    if (user.is_admin) {
      router.replace("/admin");
    } else {
      router.replace("/auction");
    }
  }

  return (
    <main className="center-screen">
      <section className="login-card">

        <div className="eyebrow">
          LEGA 2026/27
        </div>

        <h1>Asta Fantacalcio</h1>

        <p className="muted">
          Entra con il nome assegnato e la tua password.
        </p>

        <form onSubmit={submit} className="stack-lg">

          <label>
            Nome
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="es. admin"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <div className="error-box">
              {error}
            </div>
          )}

          <button
            className="primary big"
            disabled={loading}
          >
            {loading ? "Accesso..." : "ENTRA"}
          </button>

        </form>

      </section>
    </main>
  );
}