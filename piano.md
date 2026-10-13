# Piano per WebApp di Videocomunicazione

## Passo 1: Autenticazione con Supabase

1. Creare un account su Supabase e un nuovo progetto.
2. Abilitare l'autenticazione email/password nelle impostazioni del progetto.
3. (Opzionale) Configurare provider OAuth (Google, GitHub, etc.).
4. Installare il client Supabase nel progetto frontend (es. `npm install @supabase/supabase-js`).
5. Inizializzare il client Supabase con URL e chiave anonima.
6. Creare pagine di Registrazione e Login con form.
7. Implementare le funzioni di signUp, signIn, signOut utilizzando Supabase Auth.
8. Gestire lo stato dell'utente (es. con Context o store) e proteggere le route.
9. Testare il flusso di autenticazione.

## Passo 2: Videocomunicazione con Livekit

1. Creare un account su Livekit Cloud o installare Livekit Server.
2. Ottenere API Key e Secret.
3. Installare il client Livekit nel frontend (es. `npm install livekit-client`).
4. Configurare un endpoint server-side per generare i token di accesso (usando le API Key e Secret).
5. Creare una pagina per la stanza video.
6. Nel frontend, connettersi alla stanza utilizzando il token generato.
7. Gestire l'acquisizione di video/audio e la pubblicazione delle tracce.
8. Visualizzare le tracce degli altri partecipanti.
9. Implementare controlli per mutare audio/video e terminare la chiamata.
10. Testare la comunicazione video/audio tra due o più utenti.

## Note sull'integrazione

- Assicurarsi che solo gli utenti autenticati (Passo 1) possano accedere alle stanze video (Passo 2).
- Generare il token Livekit solo per utenti autenticati, passando l'ID utente Supabase come identità.
