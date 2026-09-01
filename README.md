# Asta Fantacalcio Live — V1

Web app real-time per la vostra lega a 10 partecipanti: **500 crediti**, rose **3P / 8D / 8C / 6A** e fasi **P → D → C → A**.

## Stato attuale

Il progetto Supabase è già collegato e il database contiene il listone completo fornito dall'utente:

- 525 giocatori attivi;
- 63 P / 187 D / 187 C / 88 A;
- foglio `Ceduti` escluso;
- Malen verificato come `ID 5585 · Roma · A`.

Sono già predisposti questi 10 account di test nel file `seed/participants.json`:

| Login | Nome mostrato | Password temporanea | Admin |
|---|---|---|---|
| admin | Admin | Admin26! | sì |
| rondo | Rondo | Rondo26! | no |
| guest3 | Guest 3 | Guest3-26! | no |
| guest4 | Guest 4 | Guest4-26! | no |
| guest5 | Guest 5 | Guest5-26! | no |
| guest6 | Guest 6 | Guest6-26! | no |
| guest7 | Guest 7 | Guest7-26! | no |
| guest8 | Guest 8 | Guest8-26! | no |
| guest9 | Guest 9 | Guest9-26! | no |
| guest10 | Guest 10 | Guest10-26! | no |

> Queste password sono solo per la prova. Prima dell'asta vera vanno sostituite.

## Cosa è implementato

- login con nome + password;
- un solo admin, che può anche partecipare all'asta;
- fase corrente gestita dall'admin;
- ricerca del giocatore dal listone;
- una sola asta attiva alla volta;
- timer server-side da 10 secondi;
- ogni rilancio valido resetta il timer a 10 secondi;
- `+1` oppure offerta diretta;
- offerte concorrenti serializzate nel database;
- impossibile rilanciare su sé stessi;
- controllo automatico degli slot P/D/C/A;
- controllo del budget minimo necessario per completare la rosa;
- conferma manuale dopo lo zero: “Giocatore a X per Y crediti?”;
- riapertura per altri 10 secondi o annullamento;
- rosa e budget aggiornati dopo la conferma;
- storico rilanci;
- possibilità admin di annullare un acquisto e ripristinare crediti/giocatore;
- aggiornamenti Supabase Realtime per i dispositivi collegati.

## Come vedere l'anteprima funzionante

### 1. Installa Node.js

Serve una versione moderna di Node.js (consigliato Node 22 o successiva).

### 2. Inserisci SOLO sul tuo PC la Secret key Supabase

Il file `.env.local` contiene già URL del progetto e Publishable key. Manca volutamente la **Secret key**, che non deve essere condivisa né messa nel browser.

Nel dashboard Supabase del progetto apri **Settings → API Keys**, copia la **Secret key** e in `.env.local` sostituisci:

```env
# SUPABASE_SECRET_KEY=incolla_qui_la_secret_key_dal_dashboard_supabase
```

con:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

Non inviare questa chiave in chat e non caricarla su GitHub.

### 3. Installa e crea i 10 utenti Auth

Apri il terminale nella cartella del progetto ed esegui:

```bash
npm install
npm run setup:users
npm run dev
```

Il listone è già presente nel database remoto, quindi per questa anteprima **non è necessario** eseguire `npm run seed:players`.

### 4. Apri il sito

Vai su:

`http://localhost:3000`

Accedi per esempio con:

```text
Nome: admin
Password: Admin26!
```

In un altro browser/incognito puoi entrare con:

```text
Nome: rondo
Password: Rondo26!
```

Per simulare più persone usa finestre in incognito, browser diversi oppure altri telefoni/PC sulla stessa rete dopo aver avviato Next.js rendendolo raggiungibile in LAN.

## Primo test consigliato

1. Entra come `admin` e come `rondo` in due sessioni separate.
2. L'admin resta nella fase Portieri e seleziona un portiere.
3. Avvia l'asta.
4. Rondo preme `+1`; verifica che l'offerta e il timer si aggiornino su entrambe le schermate.
5. Fai un'offerta dall'altro account e verifica il reset a 10 secondi.
6. Attendi `00:00`: i rilanci devono bloccarsi.
7. L'admin conferma l'assegnazione e controlla budget e rosa.

## Regola budget

Ogni partecipante parte da 500 crediti. Il server impedisce un'offerta che non lasci almeno **1 credito per ogni giocatore ancora obbligatorio**.

Esempio: 30 crediti rimasti e 4 giocatori ancora da comprare → offerta massima 27.

## Pubblicazione futura su Vercel

Per il sito pubblico serviranno soltanto le variabili browser-safe:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

La `SUPABASE_SECRET_KEY` serve esclusivamente agli script amministrativi locali e **non va inserita in Vercel** per il normale funzionamento dell'asta.

## File principali

- `app/` — pagine Next.js;
- `components/` — UI asta/admin;
- `lib/` — Supabase, autenticazione e tipi;
- `supabase/schema.sql` — schema e funzioni database;
- `seed/players.json` — 525 giocatori dal foglio `Tutti`;
- `seed/participants.json` — i 10 accessi di test;
- `scripts/create-users.mjs` — crea/aggiorna i 10 utenti Auth;
- `scripts/seed-players.mjs` — reimport del listone se necessario;
- `ACCESSI_TEST.txt` — credenziali temporanee rapide.
