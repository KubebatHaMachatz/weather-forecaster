# Ensemble — Design Document

> A daily forecasting game about reading uncertainty.
> React Native (Expo), no backend, powered entirely by Open-Meteo.

---

## 0. Why there is no backend

Everything the game needs is either bundled at build time, derived deterministically on-device, or fetched from Open-Meteo directly.

| Need | Server-free solution |
|---|---|
| Everyone gets the same puzzle today | Deterministic PRNG seeded on the UTC date, selecting from a station list bundled in the app |
| Trusted "what day is it" | The HTTP `Date` header on any Open-Meteo response — not the device clock |
| Instrument data | Live Open-Meteo calls (Forecast API, multi-model — §9.3) |
| Climate normals | Precomputed at build time by a script against the Archive API, shipped as JSON |
| Resolution ("what actually happened") | Archive API next day — see §9 |
| Player history, ranks, calibration | Local SQLite |
| Daily reminder | `expo-notifications` **local** scheduled notification (no push server) |
| Sharing results | Wordle-style clipboard text |

**The one thing a backend would buy us: verified leaderboards.** Without a server, a player can look up tomorrow's forecast in another app and cheat. That's fine for v1 for the same reason it's fine in Wordle — the game is single-player and self-scored, and cheating only costs you the thing you came for. Competitive multiplayer is a deliberate v2 feature that will require a server.

**Licensing caveat:** Open-Meteo's free tier needs no API key but is **explicitly non-commercial**, and the data is CC BY 4.0 with **mandatory attribution**. Monetising this app requires a paid plan and a different endpoint. See §9.6a.

**Rate-limit caveat:** limits appear to be enforced per IP, and mobile carriers NAT thousands of users behind one address. Our budget is ~2–3 calls/user/day, which keeps us safe — but this is a constraint the architecture must actively respect, not an incidental property. See §9.6.

---

## 1. Core fantasy

You are not a person who knows what the weather will be. You are a person who knows **how knowable** the weather is right now.

The atmosphere is genuinely, irreducibly uncertain. Some days it is very predictable and some days it is not, and the difference is legible if you know where to look. The game's entire skill curve is learning to see that difference — and the data it teaches you with is real.

---

## 2. The Call — one puzzle per day

Each day you receive one **Call**: a question about a real place at a real future time, resolving tomorrow.

```
        THE CALL — 27 Jul
   ┌───────────────────────────┐
   │  VALPARAÍSO, CHILE        │
   │  Tomorrow, 15:00 local    │
   │                           │
   │  What will the            │
   │  temperature be?          │
   └───────────────────────────┘
        Signal available: ●●●●●●●●●● 10
```

A Call has: a **station** (real coords, drawn from a bundled curated list), a **question**, a **resolution time**, and a **Signal budget**.

### 2.1 Question types

Not all types appear every day. Later types unlock with rank, keeping day one simple.

| # | Type | Example | Answer form |
|---|---|---|---|
| 1 | **Point temperature** | "Kyoto, Japan — tomorrow 15:00" | Distribution |
| 2 | **Daily extreme** | "Tomorrow's max in Perth, Australia" | Distribution |
| 3 | **Precipitation event** | "≥0.2 mm in Bergen, Norway between 12:00–18:00?" | Probability |
| 4 | **Gust exceedance** | "Gusts over 40 km/h in Wellington, New Zealand?" | Probability |
| 5 | **Crossing time** | "First hour Reykjavík, Iceland exceeds 5 °C" | Distribution (over hours) |
| 6 | **Head-to-head** | "Warmer at noon: Lisbon, Portugal or Athens, Greece?" | Probability |
| 7 | **Anomaly** | "Above or below the 1991–2020 normal for this date?" | Probability |
| 8 | **The Spread** ⭐ | "How much will the models disagree with each other?" | Distribution |

Type 8 is the game's signature question: you are forecasting the *forecast's own uncertainty*. It is unlike anything in any other weather app, and it is the purest expression of the theme.

### 2.2 Station naming — a hard rule

**A station is never displayed without its country.** Every surface — the Call card, results, history, share text, notifications, the Chart — renders `City, Country` (e.g. "Valparaíso, Chile"; "Bergen, Norway"). Enforced in one place: a `formatStation()` helper in `src/ui/`, and the raw `name` field is never rendered directly.

Rationale: the country *is* forecasting information — it tells you the hemisphere, the season, and roughly the climate. Hiding it doesn't make the game harder, it just makes it opaque. Sub-national qualifiers are added where a city name is ambiguous across countries (e.g. "Córdoba, Argentina" vs "Córdoba, Spain").

Where a station name is likely unfamiliar, the descriptor line carries a one-line orientation: *"Pacific coast, 120 km west of Santiago."*

---

## 3. The answer mechanic

Two input modes total. Both are one-gesture and Skia-rendered.

### 3.1 Distribution — the Bell

A temperature axis. One thumb drags the **centre**; a pinch (or a second thumb) sets the **width**. A live bell curve renders over the axis, with a running readout:

```
      ╭───╮
    ╭─╯   ╰─╮          "80% confident: 17.4 – 22.6 °C"
  ──╯       ╰──         max payout ×1.0  ·  risk: moderate
 ─┴──┴──┴──┴──┴──┴─
 10  14  18  22  26  30 °C
```

Narrow = high payout, high risk of missing entirely. Wide = safe, low ceiling. This is a real probability distribution expressed as a single tactile gesture, and it's the app's signature interaction.

### 3.2 Probability — the Dial

For binary questions, a 0–100% arc. Committing at 50% is always allowed and always scores zero net — honest ignorance is free, which is exactly right.

---

## 4. Instruments — the actual game

You start each Call with **10 Signal**. Instruments cost Signal and reveal real data. Every instrument is a genuine, distinct Open-Meteo query — none of it is flavour text.

| Instrument | Cost | Reveals | Source |
|---|---|---|---|
| **Persistence** | 1 | What the value is *today* — the naive baseline | Forecast API, current |
| **Climatology** | 1 | The 1991–2020 mean and spread for this date | Bundled JSON (built offline) |
| **Barometer** | 1 | 24 h surface-pressure trend | Forecast API, `past_days=1` |
| **One Model** | 2 | *One named national model's* answer — ECMWF, ICON, GFS, JMA, UKMO, GEM or Météo-France | Multi-model call ⭑ |
| **Another Model** | 2 | A second named model — *the disagreement is the signal* | Multi-model call ⭑ |
| **Neighbour** | 2 | Same variable at a station ~200 km upwind | Forecast API, offset coords |
| **Sounding** | 2 | Humidity / cloud-cover profile (helps on precip) | Forecast API |
| **The Consensus** | 3 | All seven models: mean, spread, and the full fan | Multi-model call ⭑ |

⭑ **All three come from a single API call.** `api.open-meteo.com/v1/forecast?models=…` returns seven
independent national models in one 340 ms, 3.5 KB response (verified — see `SPIKE.md` §2). It is fetched
once when the Call opens; buying an instrument only ungates data already on the device.

This replaced an earlier plan built on the ensemble API, which proved unusable: **every call to
`ensemble-api.open-meteo.com` returned HTTP 429** while all other endpoints worked from the same IP at
the same moment. Under carrier-grade NAT, thousands of users share an address — a core mechanic on that
endpoint would fail for entire carrier populations with no backend to proxy around it.

The replacement is better anyway. The models have **names**. "ECMWF says 12.0 °C, JMA says 14.1 °C" is
sharper game material than "member 17 says 12.0", and it's true: multi-model ensembles are standard
operational practice. The player learns which services exist and that they genuinely disagree.

**Model availability is regional** — `bom_access_global` returned null at our test station. Stations are
build-time validated for coverage, and the UI degrades to however many models actually answered.

### 4.1 Why this is a real game and not a menu

**The optimal instrument set changes with the atmospheric regime, and that regime is real.**

- Under a **blocking high**, Persistence (1 Signal) is nearly as accurate as the full Spread (3). Buying the Spread is a waste.
- In **fast zonal flow** or ahead of a front, Persistence is actively misleading and only the model consensus helps.
- In **tropical convection**, everything is bad, and the correct play is to buy little and answer wide.

Learning to recognise which world you're in — from the Barometer, the station's latitude, the season — *is the skill*. And it's transferable skill about the actual atmosphere, not memorised game trivia. That's the thing that makes this worth building.

### 4.2 The Signal economy

Unspent Signal becomes a score multiplier:

```
Score = Accuracy × (1 + unspent_signal × 0.05)
```

So a perfect blind call is worth 1.5×, and buying everything caps you at 1.0×. The tension is constant and the maths is legible.

---

## 5. The Chart — the map screen

Tapping the station name on the Call card opens **the Chart**: a map showing where in the world you are forecasting. Reachable from the Call, from any past result, and from history.

### 5.1 What it renders

An **orthographic globe** — Earth as a sphere, not a flat rectangle — that spins to centre the station when opened. Around it:

- the station pin, with `City, Country` and the descriptor line
- latitude / longitude, elevation, local time and current UTC offset
- **day length today**, and whether it's lengthening or shortening

Those last items are not decoration. Latitude, elevation, coastal-vs-continental position and day length are the first four things a real forecaster looks at, and the globe makes all of them visible at a glance. The Chart is the game teaching geography as *forecasting context*.

### 5.2 It is free, and that is deliberate

The Chart costs no Signal. Geography is not a forecast — it's the standing context a forecaster already carries. Charging for it would tax players who don't happen to know where Valparaíso is, which penalises ignorance rather than rewarding skill, and the station name already gives the geography away to anyone who does know. Making it free levels that and quietly teaches the map.

### 5.3 The Chart is where instruments render

This is the part that makes the map load-bearing rather than a bolt-on. Purchased instruments **draw onto the globe**:

| Instrument | Overlay on the Chart |
|---|---|
| Neighbour | the upwind station appears, with the bearing between them |
| Barometer | isobar-style pressure trend arrow over the station |
| The Consensus | all seven models plotted as a fan, each labelled by service |
| Climatology | this date's normal band, with today marked against it |

So the Chart accumulates as you spend, and by commit time it *is* your worksheet. It becomes the app's second core screen rather than a detail page.

### 5.4 How it's built — still no API key, still offline

**No `react-native-maps`, no `expo-maps`, no tile server.** Those need a Google Maps API key on Android and pull in a heavyweight native SDK for a screen that never zooms past country level.

Instead: **Natural Earth 1:110m coastline and country polygons** (public domain, ~300 KB simplified) bundled as GeoJSON, projected orthographically and rendered as Skia paths. This gives us:

- zero API keys, zero network calls, fully functional offline
- visual consistency with the Bell and the spaghetti plot, which are already Skia
- the ability to draw game data *onto* the projection — which a tile-based map cannot do cleanly

The projection is ~40 lines of pure maths in `src/geo/`, unit-testable like everything else in the pure layer. Rotation to the station is a Reanimated shared value driving the projection origin.

---

## 6. Scoring

Proper scoring rules only — the game must never reward overconfidence.

- **Distributions:** CRPS (Continuous Ranked Probability Score), normalised to 0–100.
- **Probabilities:** Brier score, normalised to 0–100.

Then the number that actually matters, displayed alongside every result:

> **Skill vs. Climatology: +23%**
> **Skill vs. Persistence: −4%**

This is how real forecasters are evaluated. Beating climatology means you know something about *tomorrow*. Beating persistence means you know something about *change*. A player who beats climatology but loses to persistence has learned something specific and useful about their own reasoning, and the game told them without a word of tutorial text.

### 6.1 The baselines must be scored fairly — `crpsFair`, not `crpsEmpirical`

Skill scores are only meaningful if the baseline is scored honestly, and the obvious way to do it is wrong.

The standard empirical CRPS estimator is **biased upward for small ensembles**, and "small" means exactly our case — seven named models. Measured over 2 000 replicates at n = 7 against a true score of 1.214:

| Estimator | Bias at n = 7 |
|---|---|
| `crpsEmpirical` (standard) | **+0.252 — about 21% high** |
| `crpsFair` (Ferro 2014) | +0.008 — under 1% |

Scoring the model consensus with the standard estimator would make the models look ~21% worse than they are, quietly handing players skill they hadn't earned and telling them they beat the consensus when they hadn't. `crpsFair` divides the spread term by `n(n−1)` instead of `n²`, estimating what the ensemble's *underlying distribution* would score rather than what this particular seven-member draw happened to score.

**Rule: any ensemble-derived baseline is scored with `crpsFair`.** The player's own Bell forecast is a stated distribution, not a sample, so it uses the Gaussian closed form and is unaffected.

This was caught by a convergence test during implementation, not by design — see `src/scoring/crps.test.ts`.

---

## 7. Progression

- **Rank** — Amateur Observer → Station Keeper → Analyst → Forecaster → Chief Forecaster. Driven by rolling 30-day mean skill score, so it can go down.
- **Instrument unlocks** — start with Persistence, Climatology, Barometer. The rest unlock with rank.
- **Streak** — days *called*, not days correct. Showing up is the habit we're reinforcing.
- **Regime badges** — "Five straight calls in a convective regime."

### 7.1 The Calibration Curve — the sleeper feature

A personal reliability diagram, updated every resolution:

```
 observed
   100% ┤                    ╭─
        │              ╭─────╯      ideal ╌╌╌
    50% ┤        ╭─────╯
        │  ╭─────╯
     0% ┼──╯
        0%      50%      100%   your stated confidence

   "When you say 70%, it happens 52% of the time.
    You are overconfident in the 60–80% band."
```

Nothing else on either app store will tell a person this about themselves. It is a genuine instrument of self-knowledge wearing a game costume, and it is the reason someone still opens this app in month six.

---

## 8. Session shape

**~90 seconds a day, in two beats.**

1. **Resolution** (on first open after the resolution time). Animated reveal: the truth drops onto your stated bell curve. Score, skill-vs-baselines, calibration curve nudges. This is the payoff and it must feel great.
2. **Today's Call.** Read, buy instruments, commit. Locked until tomorrow.

Optional third beat: an evening **nowcast** — a free, unscored peek at how tomorrow is trending. Pure retention hook, zero stakes.

Local notification at a user-chosen time: *"Valparaíso has resolved."*

### 8.1 Cold start — non-negotiable

A brand-new player must not have to wait 24 hours to find out whether this game is fun. **First launch runs a bundled historical Call that resolves immediately** — real archived data from a real past day, played and resolved inside 60 seconds, including the reveal animation and the skill-vs-climatology line. Only then do they place their first live Call.

---

## 9. Data architecture

### 9.1 Endpoints

| Purpose | Endpoint |
|---|---|
| Instruments, multi-model, nowcast | `https://api.open-meteo.com/v1/forecast` |
| **Resolution (truth)** | `https://archive-api.open-meteo.com/v1/archive` |
| Build-time climatology | `https://archive-api.open-meteo.com/v1/archive` |
| ~~Ensemble members~~ | ~~`ensemble-api.open-meteo.com`~~ — **not used**, see `SPIKE.md` §2 |

The Chart uses **no endpoint at all** — its geometry is bundled, and station elevation arrives free in the Forecast API response's `elevation` field.

### 9.2 Resolution truth source

The Archive API's default `best_match` blends **ECMWF IFS (updated every 6 h, no delay)** with ERA5/ERA5-Land for older data. ERA5 alone has a 5-day lag, which would be fatal — but IFS fills the recent gap, so **next-day resolution works.** Confirmed against Open-Meteo's docs.

The Archive API is the single canonical oracle. Instruments come from forecast endpoints; truth *always* comes from the archive. Never mix.

### 9.2a Resolution timing — a hard invariant

The archive refuses future dates outright (HTTP 400), so truth can never be a forecast in disguise. **But** a request for *today* comes back fully populated even for hours that haven't happened yet, filled from IFS forecast rather than analysis.

> **Invariant:** only resolve a Call whose target date is **strictly in the past in the station's own local timezone.** Never resolve against "today".

This lives in `src/scoring/` as a pure predicate, and is covered by tests with an injected clock across the UTC+14 and UTC−11 edges, where station-local "today" differs from UTC by a full day.

### 9.3 The multi-model call

```
GET api.open-meteo.com/v1/forecast
  ?latitude=…&longitude=…&hourly=temperature_2m
  &models=ecmwf_ifs025,icon_seamless,gfs_seamless,gem_seamless,
          meteofrance_seamless,jma_seamless,ukmo_seamless
```

Returns one series per model, keyed `<variable>_<model>` — verified live at 340 ms / 3.5 KB for seven models. Fetched **once** when the Call opens and cached immutably; the One Model / Another Model / Consensus instruments are pure client-side reveals over that single payload.

Any model may return `null` for a given station (regional coverage gaps). Zod parsing treats every series as nullable, and the station list is build-time validated so no Call ships with fewer than five responding models.

### 9.4 Build-time climatology

`scripts/build-climatology.ts` walks the bundled station list, pulls 1991–2020 daily normals from the Archive API, and emits `assets/climatology.json`. Run once, committed to the repo.

Measured cost: **~2.9 s and 298 KB per station**, so ~15 minutes and ~87 MB raw for 300 stations. The script must run **sequentially with throttling** — parallel bursts risk the same 429 that killed the ensemble endpoint.

Naive reduction to per-day mean + sd lands at ~1.3 MB bundled, which is more app weight than we want. Two standard reductions, either of which gets it under 400 KB:

- store scaled `int16` rather than float text (~4× smaller)
- collapse 366 daily values into 73 **pentads** (5-day means) — smoother than daily normals and standard climatological practice anyway

Consequences: the Climatology instrument is **instant and works offline**, question type 7 (Anomaly) is possible at all, and the skill-vs-climatology baseline is free at runtime. This is a build step, not a server.

### 9.5 Station list

`assets/stations.json` — ~300 curated world locations. Per station: `name`, **`country`** (required, never null — see §2.2), optional `admin1` for disambiguation, `lat`/`lon`, `timezone`, an evocative one-line descriptor that orients the player geographically, and a climate-regime tag used to bias question selection toward interesting weather.

### 9.6 Call budget — and why it must stay tiny

**~2–3 calls per user per day**, all cached immutably (a past forecast never changes):

1. one multi-model call when the Call opens (serves three instruments)
2. one archive call at resolution
3. at most one extra for Neighbour / Sounding

This is not merely comfortable — it's load-bearing. Open-Meteo's limits (600/min, 5 000/hour, 10 000/day) appear to be enforced **per IP**, and mobile carriers put thousands of subscribers behind a handful of NAT addresses. A chattier client would trip shared limits for entire carrier populations, and with no backend there is nothing to proxy around it. **Keeping the daily budget in single digits is a hard architectural constraint, not an optimisation.**

### 9.6a Licensing and attribution ⚠️

The free tier **explicitly prohibits commercial use** — monetising this app requires a paid plan and a different endpoint. Separately, the underlying data is **CC BY 4.0, and attribution is mandatory on every tier.**

v1 therefore ships an attribution screen crediting Open-Meteo and the contributing national services (ECMWF, DWD, NOAA, Météo-France, JMA, UK Met Office, ECCC). This is a licence obligation, not a nicety — and it doubles as flavour, since those are exactly the models the instruments name.

### 9.7 Offline

Calls commit locally. If the device is offline at resolution time, resolution happens on next launch — the Archive API serves arbitrary past dates, so nothing is ever lost.

---

## 10. Fairness without a server

- **Same puzzle for everyone:** `xoshiro128(hash("2026-07-27"))` → station + question type + Signal budget. Pure function of the date.
- **Trusted clock:** read the `Date` response header from any Open-Meteo call. Device-clock tampering does nothing.
- **Immutable commits:** the answer is written to SQLite with the trusted timestamp *before* any resolution data is reachable, and cannot be edited.

---

## 11. Technical stack

Expo (latest SDK), React Native New Architecture, TypeScript `strict`.

| Concern | Choice |
|---|---|
| Components | **gluestack-ui** — restrained, accessible primitives; no custom design system |
| Navigation | `expo-router`, typed routes (~6 screens) |
| Server state | TanStack Query + MMKV persister; keys are `(endpoint, coords, date)` and cache forever |
| Game state | Zustand, thin repository layer over `expo-sqlite` |
| Animation | Reanimated 4 + Gesture Handler (the Bell, globe rotation) |
| Graphics | Skia — bell curve, spaghetti plot, reliability diagram, **the globe** |
| Maps | **none** — bundled Natural Earth GeoJSON + own orthographic projection (§5.4) |
| Notifications | `expo-notifications`, local scheduling only |
| Validation | Zod schemas on every Open-Meteo response |
| Testing | Vitest for pure modules, RNTL for components, Maestro for the daily-loop flow |
| HTTP in tests | MSW, replaying fixtures captured from the spike — no live calls in CI |

### 11.0 Method: test-first, always

Development is **strictly TDD**. For every module: write the failing test, watch it fail, then implement to green. No implementation lands before its test.

This is why the architecture is shaped the way it is. The scientific core — scoring, calibration, puzzle generation, projection, the resolution-timing invariant — is pure TypeScript with no React Native imports, so it runs in milliseconds under Vitest with no simulator and no network. The parts that are hardest to get right are the parts that are cheapest to test.

Three testing rules that matter here:

- **Time is injected, never ambient.** Every function that needs "now" takes a clock. The station-local resolution invariant (§9.2a) is untestable otherwise, and it's the one place a bug silently corrupts scores.
- **Network is fixtures.** Real Open-Meteo responses were captured during the spike and are replayed via MSW. CI never touches the network — no flakes, no quota burn.
- **Scoring rules get property tests.** CRPS and Brier are proper scoring rules, meaning a truthful forecast must score no worse in expectation than any dishonest one. That's a property, not an example, and it's asserted as one. If it ever breaks, the game rewards lying — the single worst bug this app could have.

### 11.1 UI direction

Simple and calm, not flashy. gluestack-ui primitives, a small type scale, generous whitespace, a limited palette. Motion is reserved for the one moment that earns it — the resolution reveal, when truth drops onto your stated curve. Everything else is still.

The Skia surfaces (the Bell, the globe, the model fan, the reliability diagram) are the only custom-drawn elements, and they're line-art rather than ornament.

### 11.2 Module layout

```
src/
  api/          Open-Meteo clients + Zod schemas   (network only)
  puzzle/       deterministic daily Call generation (PURE)
  scoring/      CRPS, Brier, skill scores          (PURE)
  calibration/  reliability-diagram binning        (PURE)
  geo/          orthographic projection, bearings,
                day length, station formatting     (PURE)
  game/         Zustand stores, SQLite repositories
  ui/           screens + Skia components
scripts/
  build-climatology.ts
  build-worldmap.ts        simplifies Natural Earth → world.geo.json
assets/
  stations.json  climatology.json  world.geo.json  tutorial-call.json
```

`puzzle/`, `scoring/`, `calibration/` and `geo/` import nothing from React Native. They are plain TypeScript, exhaustively unit-tested, and are where all the game's correctness lives. Everything scientific is verifiable on CI in milliseconds.

---

## 12. Scope

**v1 ships:** question types 1–4, the eight instruments of §4, the Bell and the Dial, **the Chart with the Neighbour / Barometer / Climatology overlays**, CRPS/Brier scoring, skill-vs-baselines, calibration curve, ranks, streaks, tutorial Call, local notifications, share text, **attribution screen** (§9.6a).

**Deliberately deferred:** question types 5–8, the Consensus overlay on the Chart, regime badges, nowcast beat, accounts, leaderboards, any server.

**Ruled out:** the ensemble API (§4, `SPIKE.md` §2) and any native map SDK (§5.4).

---

## 13. Decisions (resolved)

1. **Units** — ✅ device locale default, with a manual override in settings. Scoring is always computed in metric internally; units are a display concern only.
2. **Location permission** — ✅ never requested, not in v1 and not later. The game is global by design and doesn't need it. Clean privacy story: the app asks for nothing.
3. **Difficulty** — ✅ identical for every player, for comparability and shareability. Rank changes which *instruments* you have, never which station you get.
4. **Missed days** — ✅ streak breaks, rolling skill score unaffected. Absence is punished lightly.
5. **Station naming** — ✅ always `City, Country`, everywhere, enforced centrally (§2.2).
6. **The Chart** — ✅ free, always available, and doubles as the render surface for purchased instruments (§5).
