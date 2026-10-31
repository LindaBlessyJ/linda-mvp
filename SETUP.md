# PLAYVERSE MVP — Android-friendly setup

This is a starter code package, not a deployed or verified game. It uses React + Vite and Supabase Realtime Broadcast for a lightweight first multiplayer prototype.

## Important limitation before public launch

The starter uses room broadcasts and keeps the current game state in the host's browser. This is a prototype architecture: the host must remain connected, state recovery is best-effort, and simultaneous actions are not securely serialized on the server. Do not represent it as production-ready until a server-authoritative room state and access controls are added and tested. For the deadline, first verify the simple flow with two devices, then upgrade to database/RPC-backed room state if time allows.

## 1. Create Supabase project (free tier)

1. Open https://supabase.com/ in your phone browser and sign in.
2. Create a new project. Save the database password somewhere private.
3. Wait for the project to finish provisioning.
4. In Project Settings / API (or the project's Connect panel), copy the Project URL and the publishable/anon key.
5. Do not use the `service_role` secret in the browser.

This prototype does not require creating database tables yet; the room uses Realtime channels.

## 2. Put the project on GitHub

1. Open https://github.com/ and sign in.
2. Create a new repository named `playverse-mvp`.
3. For the simplest setup, upload all files from this package, including the `src` folder and `.env.example`.
4. Do not upload a real `.env` file containing keys. `.env.example` is only a template.

## 3. Deploy on Vercel

1. Open https://vercel.com/ and sign in with GitHub.
2. Choose Add New → Project and import `playverse-mvp`.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. In Environment Variables add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable/anon key
5. Deploy and open the public URL.

If the Vercel free tier or Supabase free tier is not available for your account or intended use, stop and review the service terms before paying.

## 4. Test with two devices

1. Open the public URL in browser A and enter a nickname.
2. Create a room and copy the five-character code.
3. Open the URL in browser B (or a second device), enter another nickname and the code.
4. Check that both screens show both players.
5. Pick Truth, pick Dare, skip a prompt, and advance the turn.
6. Repeat with browser refresh and a temporarily disconnected network.
7. Keep notes on failures; do not claim these tests passed unless you observed them.

## 5. Known prototype issues to resolve before claiming a fully tested release

- The room's state is held by the host browser, not persisted in a database.
- The host must stay connected for the room to function.
- Host transfer, room expiry, anti-spam/rate limiting, and robust concurrent-action handling are not implemented.
- Broadcast payloads are not server-authoritative; client messages should not be trusted for a public production game.
- The UI says no login, but a session-scoped guest ID is used locally; it is not a user account.
- Some privacy and safety controls are UX-level only and need backend validation and abuse protections.
- Realtime availability, rate limits, free-tier eligibility and hosting terms must be checked against current provider terms.

## 6. Safe prompt policy

Truth questions should not require secrets, identifying information, or disclosures about trauma, health, relationships, or other sensitive matters. Dares should be optional, non-dangerous, non-humiliating, and possible to skip without penalty.
