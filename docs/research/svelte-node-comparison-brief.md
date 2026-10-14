# Research brief — Svelte FE + Node.js BE comparison for scrum-poker (extends CR-2026-08-18-04)

- **Status:** COMPLETE (research pass for CR-2026-08-18-04, frontend arm)
- **Date:** 2026-08-18 · **Owner:** researcher · **Appetite:** S
- **Inputs:** `docs/change_requests/2026-08-18-bun-monorepo.md`, `docs/research/bun-node-monorepo-brief.md`, `docs/research/frontend-stack-brief.md`, `docs/architecture/ADR-001-realtime-transport.md` (rev 2), `docs/architecture/architecture.md`, `docs/design/ui_spec.md`, `docs/PRD.md`, `docs/constitution.md`
- **Next owner:** architect (re-evaluate ADR-001 rev 2 across CR-04 + this), then human Gate 3 re-check.

---

## TL;DR / verdict

**Recommendation: keep React + Vite + Zustand (the ADR-001 rev 2 stack).** Svelte is
technically competitive — smaller bundles, simpler reactivity, and a clean Tailwind
port — but for THIS app (a tiny internal realtime SPA with 3–15 users, S appetite,
React already ADR-locked, Zustand already in the contract, no SSR, free-tier host
sleeps anyway) the ecosystem and hiring gap is a real Phase-1 risk with no offsetting
benefit.[unverified] **Svelte+Bun is the smallest-footprint combination, but it buys nothing the
product needs and costs a full rewrite of a decided client contract.** Verdict order:
**React+Node (keep) > Svelte+Node (viable alternative) > React+Bun ≈ Svelte+Bun
(rejected: no free-tier host advantage, Bun host gap).**[unverified]

The short version of the evidence:

1. **Bundle size — Svelte wins, but it doesn't matter here.** A minimal Svelte 5 app
   ships ~2–5 KB gzipped; React 19 starts ~42 KB gzipped before state libs.[8] In
   identical production apps Svelte 5 ≈ 47 KB vs React 19 ≈ 156 KB.[8] But scrum-poker
   is a LAN/VPN internal tool (PRD; internal) where the bundle is loaded once and the
   server is a persistent realtime process — a ~100 KB difference on first load is
   invisible at 3–15 users.[1][unverified]
2. **State — Svelte's built-in runes/stores replace Zustand cleanly.** Svelte 5 docs:
   "Prior to Svelte 5, stores were the go-to solution for creating cross-component
   reactive states or extracting logic. With runes, these use cases have greatly
   diminished."[4] A `$state` object in a `.svelte.js` module is the documented
   shared-state pattern.[4][5] If we kept Zustand, it would need a wrapper to be
   usable in Svelte components.[16] So on Svelte the Zustand dependency disappears —
   a dependency-policy win, but also a rewrite of `src/store/roomStore.ts`.
3. **Tailwind — ports cleanly.** Tailwind has an official SvelteKit guide
   (`@tailwindcss/vite` plugin), and Svelte 5.16+ supports object/array `class` values
   via clsx — the idiomatic way to express the ui_spec's `data-[selected]`-style
   conditional classes.[7][6] Svelte's default scoped `<style>` is a bonus but we
   don't use it under Tailwind-only.[svelte docs, unverified inline]
4. **SPA mode — works but has a catch.** SvelteKit with `adapter-static` +
   `fallback: '200.html'` produces a static `build/` directory (pages + assets + the
   fallback page) that a Node server can serve.[1][2] The catch: adapter-static's
   SPA mode is explicitly "large negative performance and SEO impacts", and the
   server must route unknown paths to the fallback (the built `build/` does NOT
   self-route SPA paths; that's a server config).[2][3][1] A plain Svelte + Vite SPA
   (no SvelteKit) is also viable and even simpler — no SvelteKit adapter at all — but
   then you hand-roll routing (ui_spec has only 2 routes).
5. **Ecosystem — React is 20–40x larger; no Phase-1 blocker for Svelte, but it's a
   real risk.** React weekly downloads ~115.6M, Svelte ~4.8M, Zustand ~44.5M (npm
   API, 2026-08-09/15).[13][14][15] React job postings outnumber Svelte ~20:1 in the
   US.[8] The Svelte component library ecosystem is "still growing, and not every
   library out there is ready for production."[11] For THIS app we need only buttons,
   inputs, cards, a badge — all in the ui_spec with Tailwind classes — so no component
   library is required either way; the Phase-1 blocker is not component libs but
   (a) team familiarity with Svelte 5 runes, and (b) hiring/troubleshooting depth if
   someone leaves.[unverified][9][11]
6. **Host reality (from bun-node brief) — free-tier is the real constraint, not the
   FE framework.** No lifetime-free host runs a persistent Bun/Node realtime process;
   Render Free runs both but sleeps after 15 min idle + 750 instance-hr/mo cap.[18]
   Cloudflare Workers + DO is lifetime-free but **cannot run Node/Bun** (V8 isolates,
   JS/WASM only).[19] So the Svelte-vs-React choice is orthogonal to the runtime
   choice: both FEs build to static files and both are served by whichever Node/Bun
   host we pick.[1][2][18]

**The honest fork (human decision, no forced preference):**

- **Keep React + Node (recommended, least churn):** ADR-001 rev 2 client contract
  stands; React + Vite + Zustand + Tailwind. Node 22 + `ws` on Render Free (sleep +
  750hr accepted) or pay ~$5/mo. Cost: no FE rewrite.[unverified]
- **Switch FE to Svelte (viable, if you want it):** SvelteKit adapter-static SPA (or
  plain Svelte+Vite) + Node BE. Smaller bundle, runes replace Zustand, Tailwind ports
  cleanly. Cost: rewrite the decided client contract, re-scope slices 0–6, accept
  smaller ecosystem + hiring gap.[unverified]
- **Rejected:** Svelte+Bun or React+Bun — Bun's zero-dep WS server is nice (bun-node
  brief) but there is no free-tier host where Bun is meaningfully better than Node,
  and Node + `ws` is the conservative, already-documented path.[20][18][unverified].

**Implication for ADR-001 rev 2 + constitution:** the client stack line in
constitution §Stack (line 6) and ADR-001 §Technical contract (React + Vite + TS +
Zustand) should **stay React unless the human explicitly picks Svelte**; if Svelte is
picked, ADR-001 must be re-revved with the client contract rewritten (React → Svelte,
Zustand → runes) while the `room:state` contract, event names, ack shapes, and server
state machine stay unchanged (architecture §7).[unverified] The
Tailwind-only + Akira conventions
constraint is framework-agnostic and does not change under Svelte.[7][6]

---

## 1. Svelte vs React for THIS app

### 1.1 The app shape (from PRD/architecture/ui_spec)

scrum-poker is a **thin client that mirrors server state**: the server owns the room
state machine (`voting → revealed → voting`), broadcasts a full `room:state` snapshot
after every mutation, and the client is a pure renderer of that state
(architecture §7; internal). There are exactly two routes (`/` landing, `/r/:token`
join/room) and one screen component tree (ui_spec §4–6). No SEO, no SSR, no
server-side data fetching, no public audience (PRD non-goals; internal). This is the
canonical CSR SPA case that the previous frontend brief already settled for Vite +
React.[1][internal — frontend-stack-brief].

### 1.2 Dev/build simplicity

- **SvelteKit SPA mode:** `export const ssr = false` in the root layout + `adapter-static`
  with `fallback: '200.html'` produces a static `build/` directory (prerendered pages,
  assets, and the fallback page). "You can turn a SvelteKit app into a fully
  client-rendered single-page app (SPA) by specifying a fallback page."[1] It's the
  documented SPA path but with an explicit warning: "This option has large negative
  performance and SEO impacts."[2] The fallback page must be served by the host for
  arbitrary paths (e.g. `200.html` on Surge; on our Node server, the static file
  server must route unknown paths to it).[1][3]
- **Plain Svelte + Vite:** no SvelteKit, no adapter. Vite scaffolds `svelte-ts`
  directly (`npm create vite@latest -- --template svelte-ts`), and Tailwind installs
  via the same `@tailwindcss/vite` plugin as any Vite app.[17][7] This is the 
  closest analog to the current React + Vite SPA: same build tool, same static
  output, no meta-framework. For a 2-route SPA, plain Svelte+Vite is simpler than
  SvelteKit SPA mode (no fallback config, no SvelteKit adapter) — but it drops
  SvelteKit's file-based routing for a hand-rolled router (or a tiny lib).
- **React + Vite (current):** already scaffolded in ADR-001; Vite SPA is the settled
  path. Frontend brief: Vite is "un-opinionated" and lets you pick libraries
  (Zustand, React Router); learning curve "gentler" than Next.js SSR.[frontend-brief;
  internal][3][unverified] of that brief]

### 1.3 Bundle size

The strongest Svelte selling point is measurable: "In the js-framework-benchmark
suite, Svelte 5 consistently produces the smallest bundles of any mainstream
framework. A minimal Svelte application ships approximately 2–5 KB of gzipped
JavaScript, while an equivalent React 19 application starts at around 42 KB
gzipped."[8] Identical production apps: Svelte 5 ≈ 47 KB, React 19 ≈ 156 KB.[8]
Angular Minds: React baseline ~45 KB gzipped "before any of your own code runs",
while "a small Svelte app can start in single-digit kilobytes."[9] Prismic agrees:
"In most cases, Svelte generates smaller JavaScript bundles than React thanks to
Svelte's compiler."[10]

**Why it does not move the needle here:** the bundle is loaded once per client on an
internal LAN/VPN tool; the realtime server is a persistent process; first-load TTI is
not a product metric (PRD success metrics are adoption, ritual integrity, and green
tests — internal). [unverified]. The
svelte-vs-react experts' caveat also applies: Svelte's advantage shows up "on a
mid-range Android over a patchy connection" — our users are internal desktop
browsers.[9]

### 1.4 Learning curve for the team

- **Svelte 5** is generally rated easier to learn: "Svelte is easier to write and
  learn."[10] "Writing Svelte feels like using plain HTML, CSS, and JavaScript. No
  virtual DOM or boilerplate-heavy code. JavaScript developers can pick up most of
  Svelte in a day."[11] Learning curve: "Low (close to vanilla JS/HTML)" vs React
  "Moderate (hooks, JSX, ecosystem choices)".[8]
- **But Svelte 5 introduced runes**, which is a real (if small) new concept: runes
  are "symbols that influence the Svelte compiler" — `$state`, `$derived`, `$effect`,
  `$props`.[21] Runes "can be used in .svelte.js and .svelte.ts modules" and provide
  "universal reactivity" outside components.[5] The team already knows React; the
  ADR/architecture/tasks are written in React terms (Zustand, JSX). Switching means
  re-learning idioms mid-project, not starting greenfield.[unverified]

### 1.5 Realtime integration and state: Svelte stores/runes vs Zustand

The current client state contract is `src/store/roomStore.ts` (Zustand) mirroring
`room:state` broadcasts (architecture §8). On Svelte:

- **Built-in stores replace Zustand for the room mirror.** "Prior to Svelte 5,
  stores were the go-to solution for creating cross-component reactive states or
  extracting logic. With runes, these use cases have greatly diminished."[4] The
  documented shared-state pattern: create a `$state` object in a `.svelte.js` module
  and import it where needed.[4][5]
- **If we kept Zustand**, it works but requires a wrapper: zustand stores have a
  `subscribe` method but are "not natively compatible with Svelte" — you must wrap
  them in `readable()` to use `$store` in components.[16] That's extra code for no
  benefit; on Svelte the natural choice is runes/stores, not Zustand.
- **The realtime layer is framework-agnostic.** `transport.ts` (WS connect +
  backoff reconnect), `protocol.ts` (envelope + ack matching), and `roomChannel.ts`
  (subscribe `room:state` → store) are ~150 lines of plain TS; they only need the
  store layer swapped (Zustand → `$state`/writable) on Svelte.[architecture §8;
  internal][unverified]. The server-side `room:state` contract,
  event names, ack shapes, error codes are unchanged (architecture §7).[unverified]

### 1.6 SvelteKit SPA mode vs plain Svelte + Vite vs React + Vite — summary

| Dimension | React + Vite (current) | SvelteKit SPA (adapter-static fallback) | Plain Svelte + Vite |
|---|---|---|---|
| Static build to dist | Yes (Vite `dist/`)[17] | Yes (`build/` = pages + assets + fallback)[2] | Yes (Vite `dist/`)[17] |
| Routing | React Router (chosen)[frontend-brief] | SvelteKit file-based routing[1] | hand-rolled or a tiny router |
| SPA-mode warning | none | "large negative performance and SEO impacts"[2] | none |
| Store | Zustand (ADR-001)[internal] | runes/`$state` (built-in)[4][5] | runes/`$state` (built-in)[4][5] |
| Extra framework layer | none | SvelteKit + adapter-static[1][2] | none |
| Bundle (minimal app) | ~42 KB gzipped baseline[8] | ~2–5 KB gzipped[8] | ~2–5 KB gzipped[8] |
| Ecosystem | React ~115.6M wk downloads[14] | Svelte ~4.8M wk[13] | Svelte ~4.8M wk[13] |

---

## 2. Does the ui_spec (Tailwind-only, no .css) port cleanly to Svelte?

**Yes — cleanly, with two Svelte-specific idioms.**

1. **Tailwind works in Svelte exactly as in React.** Official Tailwind SvelteKit
   guide: install `tailwindcss` + `@tailwindcss/vite`, add the plugin to
   `vite.config.ts` (alongside `sveltekit()`), and import the CSS once in the root
   layout.[7] For plain Svelte+Vite, the same Vite plugin works without the SvelteKit
   plugin.[7][unverified].
2. **The ui_spec's conditional classes (`data-[selected=true]:...`, `hover:`, etc.)
   map to Svelte's class object/array syntax.** "Since Svelte 5.16, class can be an
   object or array, and is converted to a string using clsx."[6] "we can set multiple
   classes simultaneously with a single condition, which is particularly useful if
   you're using things like Tailwind."[6] The ui_spec's `FibonacciCard` selected
   state, seat state classes, and variant tables all become `class={{...}}` or
   `class={[base, cond && extra]}` — no inline `style=`, no `.css`.[6][ui_spec §6.4]
   The older `class:` directive (`class:selected={isSelected}`) also exists and
   remains the pre-5.16 idiom.[6]
3. **Svelte's scoped `<style>` is a non-issue under Tailwind-only.** Svelte scopes
   component CSS by default ("CSS inside a `<style>` block will be scoped to that
   component"), but the constitution bans `.css`/`<style>` anyway; Tailwind classes
   in the markup are global utilities and are not scoped away.[svelte docs; internal
   constitution] The `test/tailwind-only.test.ts` static scan stays valid on Svelte —
   it scans for `.css`/`.less`/inline `style=` and Svelte files have none of those if
   the builder follows the spec.[internal — tasks.md slice 6].
4. **Akira conventions (constitution) are framework-agnostic.** They are Tailwind
   tokens/class conventions; nothing about them depends on React. No change under
   Svelte.[internal — constitution §Style].

**Port notes for the ui_spec (if Svelte is chosen):**
- `class:` directive → `class={{ condition: value }}` or `class={[cond && '...']}`
  (Svelte 5.16+; clsx semantics)[6].
- `v-if`/`v-for` (Vue-flavored pseudo-code in ui_spec) → `{#if}`/`{#each}` Svelte
  blocks[1][svelte docs].
- The static `test/tailwind-only.test.ts` scan needs only to include `.svelte` files
  in its glob (it already scans the repo; Svelte files are plain text, so the scan
  works unchanged).[internal — tasks.md].
- Svelte's `class` attribute with falsy values historically stringifies `false`; use
  `class={cond && '...'}` (undefined/null omit the attribute) — avoid `class={false}`.[6]

---

## 3. Monorepo shape with Svelte FE + Node BE

The bun-node brief already fixed the monorepo shape; Svelte slots into `apps/web`
unchanged:

```
scrum-poker/
├── package.json            # "workspaces": ["apps/*", "packages/*"]
├── apps/
│   ├── web/                # SvelteKit SPA (adapter-static fallback) OR plain Svelte+Vite
│   │   └── build/          # static output: index/fallback + assets (Vite or adapter-static)
│   └── server/             # Node 22 + ws (or Bun.serve): serves build/ + /ws upgrade
│       └── index.ts
└── packages/
    ├── protocol/           # {id,type,payload} envelope + types (shared client/server)
    └── room/               # room state machine (pure TS, runtime-agnostic)
```

- **Both Svelte flavors build to a static `dist`/`build` directory.** Plain
  Svelte+Vite → Vite `dist/` (same as React+Vite today).[17] SvelteKit
  adapter-static → `build/` = "prerendered pages" + "static assets (the contents of
  static, plus client-side JS and CSS generated by SvelteKit)".[2]
- **The Node server serves the built SPA the same way it would serve a React SPA.**
  adapter-node is a standalone Node server alternative, but for one-server deploy the
  simplest is: Node http + `ws` upgrade + static middleware serving the Svelte build
  dir. For SvelteKit SPA mode, the static middleware must route non-asset paths to
  the fallback file (`200.html`) — same as any SPA host config.[1][3] For plain
  Svelte+Vite, the static middleware serves `dist/` and the server routes `/r/:token`
  to `index.html` (or uses history-fallback) — identical to the React+Vite case.[17][unverified].
- **Packages are untouched.** `packages/protocol` and `packages/room` are pure TS,
  runtime- and framework-agnostic; the Svelte client imports the same
  `{id,type,payload}` envelope types as the React client would.[bun-node brief;
  architecture §7][internal].

**One-server deploy confirmation:** yes — Svelte (either flavor) builds to static
files the Node server serves on one port with the WS endpoint, satisfying the
"monorepo, one server" constraint identically to React+Vite.[1][2][17][unverified].

---

## 4. Team / ecosystem reality

- **Ecosystem size (measured):** npm weekly downloads (2026-08-09/15): React
  ~115,573,856; Svelte ~4,787,259; Zustand ~44,452,534.[14][13][15] Tech-insider:
  "React's package ecosystem is roughly 40 times larger" than Svelte's.[8] Angular
  Minds: "The ecosystem is in a different league... for a niche requirement you may
  find yourself wrapping a vanilla library where a React team would just install a
  package."[9]
- **Satisfaction:** State of JS 2024 ranks Svelte at the top in "overall positive
  opinions" — "Svelte usage is increasing at a steady pace, while it continues to
  top the rankings in terms of overall positive opinions."[12] This is a real
  signal for developer experience, but it does not offset ecosystem/hiring
  breadth.[unverified]
- **Hiring:** "React dominates the front-end job market... LinkedIn and Indeed
  listings for React developers outnumber Svelte positions by approximately 20:1 in
  the United States."[8] "The React talent pool is vast... React is the safer bet
  purely on availability."[9]
- **Component libraries:** Svelte's ecosystem "is still growing, and not every
  library out there is ready for production."[11] shadcn-svelte, Skeleton, Melt UI,
  Bits UI, Flowbite-Svelte exist and are Tailwind-compatible, but none is required
  for Phase 1: the ui_spec is only buttons, inputs, badges, cards — all expressible
  with Tailwind classes (constitution bans third-party UI kits anyway).[11][7][ui_spec; internal]
- **Is there a Phase-1 blocker?** For component libs: no — the constitution bans
  them and the ui_spec doesn't need any. For docs/learning: no — Svelte has official
  docs and the runes concept is documented.[5][21] For hiring/troubleshooting: **a
  mild risk, not a blocker** for a 6-slice S project, but real if the solo maintainer
  leaves or a future Phase-2 grows the app.[8][9][unverified] For the Tailwind-only + Akira
  conventions: **no change** — they're framework-agnostic.[7][internal constitution].

---

## 5. Recommendation — one clear verdict

### 5.1 Verdict order (with the free-tier host reality)

| Option | FE | BE | Free-tier host reality | Verdict |
|---|---|---|---|---|
| **React + Node (current ADR)** | React+Vite+Zustand | Node 22 + `ws` | Render Free (sleep+750hr) or pay ~$5/mo[18] | **RECOMMENDED (keep)** |
| **Svelte + Node** | SvelteKit SPA or plain Svelte+Vite | Node 22 + `ws` | Same as above[18] | Viable alternative if you want Svelte |
| React + Bun | React+Vite | Bun.serve (zero-dep WS) | Same hosts; Bun has no free-tier edge over Node[18][20][unverified] | Rejected (no free-tier win) |
| Svelte + Bun | SvelteKit SPA or plain Svelte | Bun.serve | Same hosts[18] | Rejected (smallest bundle, but no product need; max rewrite) |

**Why React+Node wins for THIS app:**
1. **It's already decided and documented.** ADR-001 rev 2, architecture §8, tasks
   slices 0–6, and the constitution §Stack all assume React+Vite+Zustand. Reverting
   to Svelte means a full client rewrite, re-scoped slices, and an ADR rev — with no
   product-visible gain (3–15 users, internal LAN/VPN, no SEO, no public
   audience).[PRD; internal][1][unverified]
2. **The bundle gap doesn't matter here.** Svelte's ~2–5 KB vs React's ~42 KB
   baseline is real but irrelevant for a tool whose users are internal and whose
   server already must stay awake for WS.[8][9][unverified].
3. **The ecosystem/hiring gap is the only real risk, and React avoids it.**[8][9]
4. **Zustand is already in the contract** and is the right store for React; Svelte's
   runes would replace it but that's a rewrite, not a win.[4][5][16][internal]
5. **The runtime/host decision is orthogonal** — the bun-node brief already settled
   Node + `ws` as the conservative path, and Svelte neither helps nor hurts
   there.[18][20][unverified].

**The one honest reason to pick Svelte:** you personally want to build this in
Svelte (learning, enjoyment, future Svelte work). That's a legitimate human call,
and the technical cost is bounded — Svelte+Node is a fully viable stack for this
app. But it is not the evidence-backed default; it's a preference.[unverified]

### 5.2 If the human picks Svelte — what changes

- **Constitution §Stack line 6:** "Frontend: React + Vite (SPA, no SSR) + TypeScript"
  → "Frontend: Svelte 5 (SPA, no SSR) + Vite (plain Svelte, or SvelteKit
  adapter-static fallback) + TypeScript." Tailwind-only stays; the `data-[selected]`
  and conditional-class patterns use Svelte's clsx-style `class={...}` object/array
  syntax.[7][6]
- **Constitution §Stack line 9 (State):** "Zustand for client room state" → "Svelte
  runes/`$state` (built-in) — no Zustand" (or "Svelte writable stores" if the team
  prefers the store contract).[4][5]
- **ADR-001 rev 2:** the client contract must be re-revved: React+Vite+Zustand →
  Svelte+Vite+runes; `room:state` contract, event names, ack shapes, and `room.ts`
  state machine unchanged (architecture §7).[internal]
- **ui_spec port notes (§2 above)** — mostly mechanical class syntax changes, no
  layout/design change.[6][ui_spec]
- **tasks.md slices 0–6** need client-stack terminology swapped (Zustand → runes,
  JSX → Svelte markup); server slices unchanged.[internal — tasks.md]

---

## 6. Open questions for architect / human gate

1. **FE framework fork:** keep React+Vite+Zustand (recommended) or switch to Svelte
   (viable)? This is the single decision this brief resolves.
2. **If Svelte: SvelteKit SPA mode vs plain Svelte+Vite?** Recommended: plain
   Svelte+Vite for a 2-route SPA (no SvelteKit adapter/fallback complexity); SvelteKit
   SPA mode only if you expect more routes/filesystem routing later.[1][17]
3. **Runtime/host fork (from bun-node brief):** Node on Render Free (accept
   sleep/750hr) vs pay ~$5/mo vs stay Cloudflare DO (TS-only, no Node/Bun) — the FE
   choice doesn't change this; it stays the human gate decision.[18][19]

---

## Sources

[1] https://svelte.dev/docs/kit/single-page-apps — SvelteKit SPA mode docs
    > "First, disable SSR for the pages you don’t want to prerender. These pages will be served via the fallback page"
    > "You can turn a SvelteKit app into a fully client-rendered single-page app (SPA) by specifying a fallback page"
[2] https://svelte.dev/docs/kit/adapter-static — SvelteKit adapter-static docs
    > "To create a single page app (SPA) you must specify the name of the fallback page to be generated by SvelteKit, which is used as the entry point for URLs that have not been prerendered."
    > "This option has large negative performance and SEO impacts."
[3] https://svelte.dev/docs/kit/adapter-node — SvelteKit adapter-node docs
    > "To generate a standalone Node server, use adapter-node"
[4] https://svelte.dev/docs/svelte/stores — Svelte stores docs
    > "Prior to Svelte 5, stores were the go-to solution for creating cross-component reactive states or extracting logic. With runes, these use cases have greatly diminished."
    > "when creating shared state, you can create a"
[5] https://svelte.dev/docs/svelte/state — Svelte $state docs
    > "You can use runes outside the top level of components and even place them into JavaScript or TypeScript files (using a .svelte.js or .svelte.ts file ending)"
[6] https://svelte.dev/docs/svelte/class — Svelte class directive docs
    > "we can set multiple classes simultaneously with a single condition, which is particularly useful if you’re using things like Tailwind."
    > "The class: directive Prior to Svelte 5.16, the class: directive was the most convenient way to set classes on elements conditionally."
[7] https://tailwindcss.com/docs/installation/framework-guides/sveltekit — Tailwind SvelteKit install guide
    > "Add the @tailwindcss/vite plugin to your Vite configuration."
    > "npm install tailwindcss @tailwindcss/vite"
[8] https://tech-insider.org/svelte-vs-react-2026-2 — Tech-insider Svelte vs React 2026
    > "Svelte compiles your code away at build time, producing surgical DOM updates with zero runtime overhead."
    > "In the js-framework-benchmark suite, Svelte 5 consistently produces the smallest bundles of any mainstream framework. A minimal Svelte application ships approximately 2–5 KB of gzipped JavaScript, while an equivalent React 19 application starts at around 42 KB gzipped"
    > "The ecosystem comparison is where React’s maturity advantage becomes undeniable."
    > "React’s package ecosystem is roughly 40 times larger."
[9] https://www.angularminds.com/blog/svelte-vs-react — Angular Minds Svelte vs React
    > "The React talent pool is vast. If you need to staff a team of ten next quarter, or you are handing the codebase to a client's in-house developers later, React is the safer bet purely on availability."
    > "Svelte is the better tool when performance and a lean codebase are the priority"
[10] https://prismic.io/blog/svelte-vs-react — Prismic Svelte vs React
    > "Svelte is easier to write and learn."
    > "In most cases, Svelte generates smaller JavaScript bundles than React thanks to Svelte’s compiler."
[11] https://svar.dev/blog/how-to-choose-svelte-library — SVAR choosing Svelte library
    > "Svelte’s ecosystem is still growing, and not every library out there is ready for production."
[12] https://2024.stateofjs.com/en-US/libraries/front-end-frameworks — State of JS 2024 front-end frameworks
    > "Svelte usage is increasing at a steady pace, while it continues to top the rankings in terms of overall positive opinions."
[13] https://api.npmjs.org/downloads/point/last-week/svelte — npm downloads svelte (API)
    > ""downloads": 4787259, "start": "2026-08-09", "end": "2026-08-15", "package": "svelte""
[14] https://api.npmjs.org/downloads/point/last-week/react — npm downloads react (API)
    > ""downloads": 115573856, "start": "2026-08-09", "end": "2026-08-15", "package": "react""
[15] https://api.npmjs.org/downloads/point/last-week/zustand — npm downloads zustand (API)
    > ""downloads": 44452534, "start": "2026-08-09", "end": "2026-08-15", "package": "zustand""
[16] https://jfranciscosousa.com/blog/using-zustand-with-svelte — Using zustand with Svelte
    > "These Svelte stores are more than good enough! I’ve shipped production apps that used this to great effect."
[17] https://vite.dev/guide — Vite guide (templates)
    > "npm create vite@latest"
    > "npm create vite"
[18] https://render.com/docs/free — Render free docs
    > "Render spins down a Free web service that goes 15 minutes without receiving any inbound traffic. This includes both HTTP requests and WebSocket messages from existing connections."
    > "Render grants 750 Free instance hours to each workspace per calendar month"
[19] https://developers.cloudflare.com/workers/reference/security-model — Cloudflare Workers security model
    > "Workers does not allow our customers to upload native-code binaries to run on the Cloudflare network — only JavaScript and WebAssembly."
[20] https://nodejs.org/learn/getting-started/websocket — Node.js WebSocket docs
    > "Node.js v22 does not provide a built-in native WebSocket server implementation."
[21] https://svelte.dev/blog/runes — Svelte runes announcement blog
    > "Runes are symbols that influence the Svelte compiler."
