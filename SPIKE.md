# API Spike — findings

Run 2026-07-26 against live Open-Meteo. Scripts were throwaway; this is the record.
Purpose: validate the assumptions the no-backend architecture rests on, before writing app code.

---

## Summary

| # | Assumption | Verdict |
|---|---|---|
| 1 | Trusted clock from HTTP `Date` header | ✅ confirmed |
| 2 | Ensemble API usable as the core mechanic | ❌ **failed — design changed** |
| 3 | Archive resolves yesterday, worldwide | ✅ confirmed, better than expected |
| 4 | Archive can't leak future data | ✅ confirmed, with one timing caveat |
| 5 | `elevation`, `past_days`, sounding vars | ✅ confirmed |
| 6 | Build-time climatology is feasible | ✅ confirmed, with a size caveat |
| 7 | Free tier is non-commercial | ⚠️ confirmed — attribution is mandatory |

---

## 1. Trusted clock ✅

```
Date: Sun, 26 Jul 2026 07:39:41 GMT   (device skew: 1s)
```

Every response carries it. The device clock is never needed, so clock-tampering is a non-issue. Plan stands.

---

## 2. Ensemble API — failed ❌ (the important one)

**Every call to `ensemble-api.open-meteo.com` returned HTTP 429**, from the very first request of the session:

```json
{"error":true,"reason":"Daily API request limit exceeded. Please try again tomorrow."}
```

Not one ensemble call succeeded. Meanwhile, at the same instant from the same IP, `api.open-meteo.com`, `archive-api.open-meteo.com` and `air-quality-api.open-meteo.com` all returned 200. Minimal requests (one variable, one day, one model) failed identically, so request size is not the cause.

**Interpretation:** the ensemble subdomain carries its own, far tighter daily quota, enforced per IP, and this network's had already been consumed. That is a serious problem for a client-side app: **mobile carriers put thousands of subscribers behind a handful of NAT addresses.** A design whose core mechanic requires the ensemble endpoint would fail for whole carrier populations at once, unpredictably, with no recourse — and no backend to proxy around it.

### The replacement — better than the original

A single call to the ordinary forecast API with `models=` returns **seven independent national weather models at once**:

```
status 200   339ms   3.5 KB

temperature_2m_ecmwf_ifs025           t+24h = 12.0
temperature_2m_icon_seamless          t+24h = 13.3
temperature_2m_gfs_seamless           t+24h = 13.8
temperature_2m_gem_seamless           t+24h = 12.6
temperature_2m_meteofrance_seamless   t+24h = 13.7
temperature_2m_jma_seamless           t+24h = 14.1
temperature_2m_ukmo_seamless          t+24h = 13.8
temperature_2m_bom_access_global      t+24h = null    ← nulls happen, handle them

cross-model mean 13.33 °C    sd 0.70 °C   (n=7)
```

This is a genuine multi-model ensemble — a real, standard technique in operational forecasting — and for our purposes it beats the member ensemble on every axis:

- **One call**, 340 ms, 3.5 KB, on the endpoint that actually works reliably
- **The models have names.** "ECMWF says 12.0, JMA says 14.1" is far better game material than "member 17 says 12.0". It teaches something true about the world.
- Cuts the app's whole daily budget to **~2–3 calls per user**, which makes the per-IP limit a non-issue even under carrier NAT
- Field naming confirmed: `<variable>_<model>`

**Nulls are real** — `bom_access_global` returned null for this location. Model availability is regional. The station list must be validated at build time for model coverage, and the UI must degrade gracefully.

The ensemble API is demoted to an optional enhancement, used only if a call happens to succeed. Nothing depends on it.

---

## 3. Archive resolution ✅ (better than expected)

Yesterday resolved fully at **every longitude tested**, including the Pacific and the Arctic:

```
Valparaíso, Chile          2026-07-25: 24/24 hours
Reykjavík, Iceland         2026-07-25: 24/24 hours
Wellington, New Zealand    2026-07-25: 24/24 hours
Ulaanbaatar, Mongolia      2026-07-25: 24/24 hours
Nuuk, Greenland            2026-07-25: 24/24 hours
Suva, Fiji                 2026-07-25: 24/24 hours
```

Back-days 0, 1, 2, 3 and 5 all returned 24/24. The ERA5 five-day lag is fully masked by ECMWF IFS, exactly as documented. Next-day resolution works.

Archive and forecast APIs agree **exactly** for past hours (`13.4, 13.5, 13.3, 13.7` from both), confirming a shared underlying analysis. The archive is the right canonical oracle.

---

## 4. Truth integrity ✅ — with a timing rule

The archive hard-refuses future dates:

```
2026-07-27 → HTTP 400  "start_date is out of allowed range from 1940-01-01 to 2026-07-26"
```

So truth can never be contaminated by a future forecast. **But** a request for *today* returned 24/24 non-null at 07:40 UTC — i.e. hours that had not yet happened were already populated, from IFS forecast rather than analysis.

> **Rule:** only ever resolve a Call whose target date is **strictly in the past in the station's own local timezone**. Never resolve against "today".

This is now a hard invariant in the resolution logic, and it needs a unit test with a fake clock covering the UTC+14 / UTC−11 edges, where "today" differs from UTC by a full day.

---

## 5. Forecast API details ✅

```
elevation: 56 m
timezone: America/Santiago (GMT-4), utc_offset -14400s
past_days=1 → 72 hours, surface_pressure non-null 72/72
relative_humidity_2m ✓   cloud_cover ✓
```

Elevation comes free in every response — no extra call for the Chart. Barometer and Sounding instruments are both viable as specified.

---

## 6. Climatology build ✅ with a size caveat

One station, 30 years of daily normals (1991–2020):

```
10,958 days · 298 KB · 2,885 ms
```

Extrapolated to 300 stations: **~15 minutes of fetching, ~87 MB raw**, reduced to roughly **1.3 MB bundled** as per-day mean + sd.

1.3 MB is more app weight than I'd like. Two easy reductions, to decide at build time:

- store as scaled `int16` rather than float text (~4× smaller)
- reduce 366 daily values to 73 pentads (5-day means), which is standard climatological practice anyway and is smoother than daily normals

Either gets it comfortably under 400 KB. The build script must also throttle — 300 sequential 3-second requests is fine, parallel bursts risk the same 429.

---

## 7. Licensing ⚠️

Confirmed from the pricing page:

- Free tier: **600/min, 5,000/hour, 10,000/day, 300,000/month**
- Requests over 10 variables or 2 weeks count as fractional multiple calls
- **The free tier explicitly prohibits commercial use.** Monetising requires a paid plan and a different endpoint.
- The underlying data is **CC BY 4.0 — attribution is mandatory**, including on paid plans.

**Action:** an attribution line crediting Open-Meteo and the source weather services must appear in the app (about screen at minimum). This is a licence obligation, not a nicety.

---

## Consequences for DESIGN.md

1. Instruments rebuilt around **named models** instead of anonymous ensemble members (§4).
2. A single multi-model call at Call-open serves three instruments; reveal is client-side gating of already-fetched data. Daily budget drops to ~2–3 calls/user.
3. Ensemble API demoted to optional enhancement; nothing depends on it.
4. Resolution invariant: target date must be strictly past in **station-local** time.
5. Station list must be build-time validated for per-model coverage; nulls handled in UI.
6. Attribution screen is a v1 requirement.
