# Implementation Plan — Video Conferencing Web Application

**Stack:** React (frontend) · Supabase (authentication) · LiveKit (video)

This plan is split into exactly two phases. Phase 1 must be functional before Phase 2
begins, because every LiveKit token request must be tied to an authenticated user.

---

## Phase 1 — Authentication with Supabase

### 1.1 Project scaffolding
1. Create the React app (e.g. Vite + React, TypeScript recommended).
2. Install dependencies: `@supabase/supabase-js`, `react-router-dom`.
3. Set up the folder structure: `src/pages`, `src/components`, `src/lib`, `src/hooks`.

### 1.2 Supabase project setup
1. Create a project in the Supabase dashboard.
2. Collect the project URL and the **anon public** key.
3. Store them in a local `.env` file as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`, and add `.env` to `.gitignore`.
4. Enable the desired auth providers in the Supabase dashboard
   (at minimum Email/Password; optionally Google/GitHub OAuth).

### 1.3 Supabase client
1. Create `src/lib/supabase.ts` that initialises a single Supabase client
   instance from the environment variables and exports it.
2. Never import the service-role key into the frontend.

### 1.4 Auth state management
1. Create an `AuthContext` (`src/lib/AuthContext.tsx`) exposing:
   `user`, `session`, `loading`, `signIn`, `signUp`, `signOut`.
2. On mount, call `supabase.auth.getSession()` to hydrate the initial state.
3. Subscribe to `supabase.auth.onAuthStateChange()` to keep the state in sync
   across tabs and token refreshes, and unsubscribe on unmount.
4. Wrap the app in the provider.
5. Add a `useAuth()` hook for convenient consumption.

### 1.5 UI screens
1. **SignUp page**: email + password form, calls `signUp`, shows the
   "check your email" confirmation state.
2. **Login page**: email + password form, calls `signInWithPassword`,
   plus a "password reset" link that calls `resetPasswordForEmail`.
3. **Reset password page**: handles the recovery link and calls `updateUser`.
4. **Dashboard page**: shows the logged-in user's email and a sign-out button.

### 1.6 Route protection
1. Create a `<ProtectedRoute>` component that redirects unauthenticated users
   to `/login` and renders a loading state while auth is initialising.
2. Create a `<PublicOnlyRoute>` for `/login` and `/signup` that redirects
   already-authenticated users to the dashboard.
3. Configure the routes: `/login`, `/signup`, `/reset-password`,
   `/` (protected dashboard), and `/room/:roomId` (protected, used in Phase 2).

### 1.7 Data model and security
1. In Supabase, create a `profiles` table (`id` referencing `auth.users`,
   `display_name`, `avatar_url`).
2. Add a trigger to auto-insert a profile row on new user signup.
3. Enable Row Level Security on all tables and add policies so a user can only
   read/update their own rows.
4. Optionally create a `rooms` table (`id`, `name`, `created_by`, `created_at`)
   so users can list and join persistent rooms.

### 1.8 Verification of Phase 1
1. Sign up with a new email and confirm the account.
2. Log in, refresh the page, and confirm the session persists.
3. Confirm protected routes redirect when logged out.
4. Sign out and confirm all session state is cleared.
5. Confirm RLS blocks access to another user's rows.

---

## Phase 2 — Video Communication with LiveKit

### 2.1 LiveKit project setup
1. Create a LiveKit Cloud project (or self-host LiveKit).
2. Collect the LiveKit **API key**, **API secret**, and **WebSocket URL**.
3. Keep the API key and secret **server-side only**; never expose them
   to the browser.

### 2.2 Token issuing endpoint
1. Create a Supabase Edge Function (`supabase/functions/livekit-token`) that:
   - verifies the caller's Supabase JWT from the `Authorization` header,
   - validates that the requested `roomName` is allowed,
   - generates a LiveKit access token using `livekit-server-sdk`, with
     `identity` = Supabase user id, `name` = display name, and room grants
     (`roomJoin: true`, `canPublish: true`, `canSubscribe: true`),
   - returns `{ token, wsUrl }`.
2. Store the LiveKit secrets as Supabase Edge Function secrets
   (`supabase secrets set ...`).
3. Test the function locally with `supabase functions serve`.

### 2.3 Join flow (Microsoft Teams-like, two steps)
Implement a two-step join: navigating to a room shows a pre-join screen, and
the user only enters the meeting after an explicit confirmation. The concrete
flow is:

1. **Click "Partecipa" on the dashboard.** The dashboard lists the available
   rooms (room ID input, a generated room ID, or a pick from the persistent
   `rooms` table) and shows an explicit **"Partecipa" (Join)** button for the
   room selected by the user. The button is the user's first interaction and
   the intended gesture that will later unlock media capture.
2. **Navigate to `/room/:roomId` and update the browser URL.** Clicking
   "Partecipa" calls `navigate('/room/<roomId>')` so the URL becomes, e.g.,
   `/room/123`. The route param is the single source of truth for the active
   room, so a refresh or a shared/bookmarked link re-opens the same room. At
   this point **nothing is connected to LiveKit yet** — no token request, no
   media publish, no subscription.
3. **Show a pre-join screen.** The `/room/:roomId` page renders a pre-join
   (lobby) screen instead of the live call. It loads the user's display name,
   previews the local camera (a muted, local-only preview) and shows the
   current device settings, without connecting to the room.
4. **The user configures camera and microphone.** On the pre-join screen the
   user can toggle camera/mic on or off and pick camera, microphone, and
   speaker devices (see §2.4). Changes only affect the local preview.
5. **The user clicks "Partecipa ora".** This button is the explicit gesture
   that actually joins the meeting. It is separate from the dashboard
   "Partecipa" button on purpose, mirroring the Teams "join now" step.
6. **Only after "Partecipa ora", connect to LiveKit and start audio/video.**
   On that click the app requests the token from the Edge Function, renders
   `<LiveKitRoom connect>` with `audio`/`video` enabled according to the
   pre-join choices, and begins audio/video communication. If the token
   request fails or the media permission is denied, stay on the pre-join
   screen and show a clear error instead of entering the room.

State machine for the room page (suggested): `idle` → `prejoin` (after route
load) → `connecting` (after "Partecipa ora") → `connected` → `disconnected`
(leave, navigate back to the dashboard).

### 2.4 Pre-join screen (device configuration)
1. Install: `livekit-client`, `@livekit/components-react`,
   `@livekit/components-styles`.
2. Build the pre-join UI, reusing LiveKit's pre-join/device-selection
   components where possible:
   - a local camera preview (muted, not published),
   - a camera on/off toggle and a microphone on/off toggle,
   - camera, microphone, and speaker device pickers,
   - a display name / join-as label (prefilled from the Supabase profile),
   - a primary **"Partecipa ora"** button and a "Cancel"/back action that
     returns to the dashboard.
3. Keep the local preview device-only: do **not** create a room connection or
   request a token while the user is still on the pre-join screen.

### 2.5 Frontend LiveKit integration (connect after "Partecipa ora")
1. Build a `useLiveKitToken(roomId)` hook that calls the Edge Function with the
   current Supabase session token and returns the token + `wsUrl` (with error
   and loading states). It must only run **after** the "Partecipa ora" click.
2. On "Partecipa ora", for the room in the route param (`/room/:roomId`):
   - fetch the token,
   - render `<LiveKitRoom token={token} serverUrl={wsUrl} connect
     audio={micEnabled} video={camEnabled}>`,
   - render the standard `<VideoConference />` layout from
     `@livekit/components-react`, which renders one tile per participant and
     therefore supports **multi-participant video conferencing** out of the box,
   - show a clear error screen if the token request fails or the URL is missing,
   - handle `onDisconnected` by navigating back to the dashboard.
3. Import the LiveKit component styles.

### 2.6 Room controls and UX
1. Keep the room list / "join room" form on the dashboard (enter a room ID,
   generate a new one, or pick from the persistent `rooms` table) that feeds
   the "Partecipa" button described in §2.3.
2. Ensure the dashboard **"Partecipa"** button only navigates to
   `/room/<roomId>` (URL update) and never connects to LiveKit itself; the
   actual join happens later via **"Partecipa ora"** on the pre-join screen.
3. Add in-room controls for: mic mute/unmute, camera on/off,
   **screen sharing** (toggle `setScreenShareEnabled(true/false)` and show who
   is sharing), and leave room.
4. Show participant tiles with names and active-speaker highlighting, covering
   the **multi-participant** case: one tile per remote participant, correct
   handling of participants joining/leaving, and mute indicators.
5. Add an in-room chat panel using LiveKit data channels (optional but useful).

### 2.7 Permissions, autoplay, and robustness
1. Require an **explicit user interaction to start audio/video**. Do not try to
   publish camera/microphone (or start remote audio playback) automatically on
   page load: modern browsers enforce autoplay policies and will block or mute
   unrequested media without a user gesture. Use the **"Partecipa ora"** click
   (and the earlier "Partecipa" click) as the gesture that connects the room
   and starts `setCameraEnabled` / `setMicrophoneEnabled`.
2. Request browser camera/microphone permissions and show a friendly message
   when they are denied; keep the user on the pre-join screen so they can fix
   device settings and retry.
3. Handle **autoplay restrictions** for incoming remote audio: if the browser
   blocks playback, show an "Enable audio / Click to unmute" prompt and start
   playback on the next user gesture. Track this locally and clear the prompt
   once playback succeeds.
4. Handle reconnection and network interruption states.
5. Handle the "room does not exist yet" case — LiveKit creates a room on the
   first join, so the first participant becomes the room creator.
6. Add a basic loading skeleton while connecting (after "Partecipa ora").

### 2.8 Verification of Phase 2
1. Log in with two different users in two browsers.
2. From the dashboard, click **"Partecipa"** and confirm the URL changes to
   `/room/<roomId>` and that the **pre-join screen** appears with a local
   camera preview — and that **no** LiveKit connection/token request happens yet.
3. Confirm that clicking **"Partecipa ora"** is what connects the room and
   starts audio/video, and that audio/video do **not** start before it.
4. Join the same room ID from both browsers and confirm audio/video flow in
   both directions (multi-participant).
5. Confirm an unauthenticated user cannot obtain a token.
6. Confirm a user cannot join a room they are not permitted to join.
7. Test screen share, mute, leave/rejoin, and the autoplay "enable audio" prompt.

---

## Cross-cutting concerns
- **Environment variables:** Supabase URL + anon key in the frontend;
  LiveKit key/secret only in Edge Function secrets.
- **Error handling:** consistent user-facing errors for auth, token, and
  media-permission failures (shown on the pre-join screen before joining).
- **Deployment:** build the React app (Vercel/Netlify), deploy Edge Functions
  via the Supabase CLI, and configure CORS/allowed origins.
- **Testing:** unit test the auth context and token hook; do a manual
  two-browser end-to-end call test that exercises the two-step join flow.
