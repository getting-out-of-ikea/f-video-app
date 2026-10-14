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

### 2.3 Frontend LiveKit integration
1. Install: `livekit-client`, `@livekit/components-react`,
   `@livekit/components-styles`.
2. Build a `useLiveKitToken(roomId)` hook that calls the Edge Function with the
   current Supabase session token and returns the token + `wsUrl` (with error
   and loading states).
3. Create the room page (`/room/:roomId`):
   - read `roomId` from the route param so the URL is the single source of
     truth for the active room and a refresh or shared link re-joins it,
   - fetch the token,
   - render `<LiveKitRoom token={token} serverUrl={wsUrl} connect>`,
   - render the standard `<VideoConference />` layout from
     `@livekit/components-react`, which renders one tile per participant and
     therefore supports **multi-participant video conferencing** out of the box,
   - show a clear error screen if the token request fails or the URL is missing,
   - handle `onDisconnected` by navigating back to the dashboard.
4. Import the LiveKit component styles.

### 2.4 Room controls and UX
1. Add a room list / "join room" form on the dashboard (enter a room ID,
   generate a new one, or pick from the persistent `rooms` table).
2. Add an explicit **"Partecipa" (Join)** button for the selected room. On
   click it must:
   - navigate to `/room/<roomId>` so the URL is updated and the room becomes
     shareable/bookmarkable (e.g. `/room/123`),
   - let the room page pick the room up from the route param, so both the
     local user and anyone opening the same link end up in the same room.
3. Require an **explicit user interaction to start audio/video**. Do not try to
   publish camera/microphone (or start audio playback) automatically on page
   load: modern browsers enforce autoplay policies and will block or mute
   unrequested media without a user gesture. Use the "Partecipa" click — or a
   dedicated "Start camera & microphone" button in the pre-join screen — as the
   gesture that connects the room and calls
   `localParticipant.setCameraEnabled(true)` /
   `localParticipant.setMicrophoneEnabled(true)`. Surface a clear message if
   the user has not yet granted permission or interacted.
4. Add pre-join device selection: camera, microphone, and speaker pickers
   using the LiveKit device-selection components.
5. Add controls for: mic mute/unmute, camera on/off, **screen sharing**
   (toggle `setScreenShareEnabled(true/false)` and show who is sharing), and
   leave room.
6. Show participant tiles with names and active-speaker highlighting, covering
   the **multi-participant** case: one tile per remote participant, correct
   handling of participants joining/leaving, and mute indicators.
7. Add an in-room chat panel using LiveKit data channels (optional but useful).

### 2.5 Permissions and robustness
1. Request browser camera/microphone permissions and show a friendly message
   when they are denied.
2. Handle reconnection and network interruption states.
3. Handle the "room does not exist yet" case — LiveKit creates a room on the
   first join, so the first participant becomes the room creator.
4. Add a basic loading skeleton while connecting.

### 2.6 Verification of Phase 2
1. Log in with two different users in two browsers.
2. Join the same room ID from both and confirm audio/video flow in both directions.
3. Confirm an unauthenticated user cannot obtain a token.
4. Confirm a user cannot join a room they are not permitted to join.
5. Test screen share, mute, and leave/rejoin.

---

## Cross-cutting concerns
- **Environment variables:** Supabase URL + anon key in the frontend;
  LiveKit key/secret only in Edge Function secrets.
- **Error handling:** consistent user-facing errors for auth, token, and
  media-permission failures.
- **Deployment:** build the React app (Vercel/Netlify), deploy Edge Functions
  via the Supabase CLI, and configure CORS/allowed origins.
- **Testing:** unit test the auth context and token hook; do a manual
  two-browser end-to-end call test.
