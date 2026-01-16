# FRNDPLAY – Party Queue Prototype (Supabase + Socket.IO + iOS)

This repo is a working prototype of a **shared music queue**:
- iOS app authenticates with Supabase
- iOS opens a Socket.IO connection to the Node server
- Server verifies the user via Supabase JWT
- Server stores rooms/queue/playback in Supabase Postgres

## 1) Supabase setup (one-time)

1. Create a Supabase project.
2. Open **SQL Editor** and run the schema:
   - `supabase/schema.sql`
3. Authentication:
   - Enable **Email** sign-in
   - For testing, you can turn off email confirmation or confirm the user you create
4. Grab API values:
   - Supabase Dashboard → Project Settings → API
   - Copy:
     - **Project URL** → `SUPABASE_URL`
     - **anon/publishable key** → `SUPABASE_PUBLISHABLE_KEY` (server) and `supabaseAnonKey` (iOS)
     - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (server only)

## 2) Run the backend on Windows (VS Code)

Open VS Code terminal:

```bat
cd server
npm install
copy .env.example .env
```

Edit `server/.env` and fill in:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Start the server:

```bat
npm start
```

Verify:
- Open `http://localhost:4000/health` → should return `{ "ok": true }`

### If you see “EADDRINUSE”
Port 4000 is already in use.
- Stop the other server with **Ctrl+C** in the other terminal, OR
- Change `PORT=4001` in `.env` and restart.

## 3) Smoke test the socket (optional)

1) Create a user in Supabase Auth (or sign up in the iOS app).

2) Get a fresh JWT:

```bat
cd server
node get-token.js you@example.com yourPassword
```

3) Set env var and run test:

**PowerShell**
```powershell
$env:ACCESS_TOKEN="<paste token>"; node test-socket.js
```

**CMD**
```bat
set ACCESS_TOKEN=<paste token> && node test-socket.js
```

Expected output:
- ✅ Connected
- ROOM_CREATE response ok: true

## 4) iOS app setup

1) Open `ios/partyQueueSpotify/Config.swift`
2) Fill in:
- `supabaseURL`
- `supabaseAnonKey`
- `serverURL`

> **Server URL notes**
> - iOS Simulator can use `http://localhost:4000`
> - A real iPhone cannot. Use your computer’s LAN IP, e.g. `http://192.168.1.23:4000`

3) Build/run in Xcode.

## How socket auth works (important)
- The iOS client sends the JWT as a connect param (`accessToken=...`)
- The server accepts the token from:
  - `handshake.auth.accessToken` (JS clients)
  - `handshake.query.accessToken` (Swift Socket.IO client)

## Repo safety
- **Do not commit `server/.env`** (it contains secrets)
- `server/.env.example` is safe to share

