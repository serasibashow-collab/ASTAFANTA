import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY in .env.local");

const configUrl = new URL("../seed/participants.json", import.meta.url);
if (!fs.existsSync(configUrl)) throw new Error("Copia seed/participants.example.json in seed/participants.json e inserisci i 10 partecipanti.");

const participants = JSON.parse(fs.readFileSync(configUrl, "utf8"));
if (participants.length !== 10) throw new Error("Devono esserci esattamente 10 partecipanti.");
if (participants.filter((p) => p.is_admin).length !== 1) throw new Error("Deve esserci esattamente un admin.");

const normalize = (s) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]/g, "");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existingPage, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
const byEmail = new Map(existingPage.users.map((u) => [u.email, u]));

for (const p of participants) {
  const loginName = normalize(p.username);
  const email = `${loginName}@fantacalcio.local`;
  let user = byEmail.get(email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password: p.password, email_confirm: true, user_metadata: { display_name: p.display_name } });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { password: p.password, user_metadata: { display_name: p.display_name } });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabase.from("participants").upsert({
    id: user.id,
    display_name: p.display_name,
    login_name: loginName,
    is_admin: Boolean(p.is_admin),
    budget_remaining: 500
  }, { onConflict: "id" });
  if (profileError) throw profileError;
  console.log(`Configurato: ${p.display_name}${p.is_admin ? " (admin)" : ""}`);
}
console.log("10 utenti configurati.");
