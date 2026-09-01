import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Configura NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY in .env.local");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const players = JSON.parse(fs.readFileSync(new URL("../seed/players.json", import.meta.url), "utf8"));

for (let i = 0; i < players.length; i += 200) {
  const batch = players.slice(i, i + 200).map((p) => ({ ...p, status: "available" }));
  const { error } = await supabase.from("players").upsert(batch, { onConflict: "id" });
  if (error) throw error;
  console.log(`Importati ${Math.min(i + batch.length, players.length)}/${players.length} giocatori`);
}
console.log("Listone importato correttamente.");
