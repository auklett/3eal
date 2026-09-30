# 3EAL

## Local gameplay

Install dependencies with `npm ci`. For the complete Pages Functions path, run the Firebase Auth and Firestore emulators on ports 9099 and 8080 with the same project ID configured in `.env.local` and `.dev.vars` (for this app, `eal-5d762`), copy `.dev.vars.example` to `.dev.vars`, provide the usual Firebase web config in the ignored `.env.local`, then run `npm run pages:dev`. The Pages dev build connects the browser and trusted API to the emulators; `npm run dev` runs only the Vite frontend.

Start the emulators from `game/` with `npx firebase-tools emulators:start --project eal-5d762 --only auth,firestore`. Without `--project`, the Firebase CLI can select `demo-no-project`; tokens issued for that project will be rejected by the app.

## Cloudflare Pages configuration

Build output is `dist`; Pages Functions are in `functions/`. Configure the existing public `VITE_FIREBASE_*` web settings and `FIREBASE_PROJECT_ID` as Pages build/runtime variables. Add `FIREBASE_SERVICE_ACCOUNT` as a **secret** binding containing the JSON for a dedicated service account with only the Firestore data-access role (`roles/datastore.user`). Never put this credential in source, a `VITE_*` variable, or a Pages build variable. Firebase ID tokens are verified against Google's public signing certificates.

The browser can read a room's lobby metadata and only its own sanitized `rooms/{roomCode}/views/{uid}` document. The authoritative deck, all hands, and concealed card identities live in `rooms/{roomCode}/private/state`; client rules deny access and deny every client write. The API uses Firestore REST transactions for game and lobby mutations.

`firestore.rules` is wired into `firebase.json` for emulator testing. Production rules and Cloudflare Pages are not deployed by this project configuration.
