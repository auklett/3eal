# 3EAL — Development Roadmap

## Implemented

- [x] Extract a pure shared engine with seeded deck generation, 5 colors, 218 cards, TEAL wild handling, exact nine-card partition search, room reducer, interrupt responses, and fast-check/Vitest tests.
- [x] Update official rules and the Durable Object sketch to the revised gameplay.
- [x] Define strict Zod schemas for client messages and filtered public/player views.
- [x] Implement the same-origin Worker, SQLite-backed GameRoom, WebSocket Hibernation API, automatic ping/pong, one-row persistence, and earliest-deadline alarm scheduling.
- [x] Implement role switching, host turn timer, rejoin approval and timeout, host transfer, away-turn skipping, kicking, and rematch.
- [x] Replace Firebase room listeners with `useRoom`, optimistic updates/rollback, and reconnect backoff; remove Firebase, Firestore, Pages Functions, and Google Cloud service-account config.
- [x] Retain unplayed APPEAL cards between turns so eligible players can respond to later interrupts; discard other unplayed cards at turn end.
- [x] Add Turnstile room creation and optional Cloudflare Web Analytics.
- [x] Add Workers static assets and declare the SQLite Durable Object in the first migration.
- [x] Configure GitHub Actions checks and Wrangler deployment on pushes to `main`.
- [x] Add a seeded Monte Carlo simulator for game length, first-player win rate, STEAL/APPEAL set-loss swings, and first-set speed.

## Current validation

- [x] Unit/property tests cover deck composition, deterministic IDs, TEAL sets, independent nine-card partition search, interrupt eligibility/timing, room turns, rejoin, host transfer, and view privacy.
- [x] Playwright browser test covers two players and one spectator, including absence of hands and concealed identities from spectator frames.
- [x] Simulator reports average turns/minutes to win, first-player win rate, STEAL/APPEAL set-loss swing rates, and average player turns to first set.
- [ ] Configure Cloudflare Turnstile keys and Web Analytics token in the deployment environment.
- [ ] Add repository `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets to enable production deployment.
- [ ] Manually verify layout and interactions on mobile/tablet, and run accessibility checks.

## Decisions still deferred

Do not implement these balance levers without a separate user decision and one-at-a-time simulator evidence: shared face-up draw row, draw-2-keep-1, one action per turn, an action-hand cap, fewer APPEAL cards, or reducing the number range from 7 to 5.

The configured player minimum is 2, with no explicit maximum. Starting a game still requires three Normal/TEAL cards per player from the finite deck. Spectators are unlimited.

The default 250-game simulation uses four bots and a 30-second modelled turn, yielding about 14 simulated minutes per game. With that seed/policy, average turns need 32–54 seconds each to land in the 15–25 minute target. This is a timing-model observation, not a balance change; simulator timing is configurable.
