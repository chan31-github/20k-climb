# The Lantau Project

A single-user training-plan app for 16 weeks, 3 races and about 20,000 metres of climbing,
17 August – 6 December 2026. Static HTML, CSS and vanilla JavaScript modules — no build
step, no dependencies, no backend.

**Live:** https://chan31-github.github.io/20k-climb/

---

## What it does

| Tab | What's there |
|---|---|
| **Week** | Today's sessions, one tap to tick, tap the row to log duration / distance / climb / HR / RPE / notes. Prev–next arrows reach every week. |
| **Plan** | All 16 weeks under their phase headings, races inline. |
| **Bank** | Running metres total, milestones to 20,000 m, metres-per-week chart, achievements. |
| **Races** | Countdowns, pacing tables, and actual splits with deltas from race day onward. |
| **Ref** | The protocols — ankle, gut, poles, nutrition, commute, strength, rowing, triage. |

Settings live behind the status chip in the top right.

Everything works offline after the first load, and can be added to the iOS home screen
(Share → Add to Home Screen) to run full-screen.

---

## Editing the plan

All plan content is in **[`data/plan.json`](data/plan.json)**. Nothing about the plan is
hardcoded in the app. Edit that file on github.com — the pencil icon, phone or laptop —
commit to `main`, and the change is live in about a minute.

A few rules the file relies on:

- Sessions have a **`day` name** (`Mon`…`Sun`), not a date. The real date comes from the
  week's `startDate` plus the day offset, so you can move a session within its week by
  changing one word.
- Every session needs a **unique `id`**. The log is keyed by it — renaming an id orphans
  whatever you already logged against it, so don't rename ids for sessions you've done.
- `type` drives the icon: `grind`, `shuffle`, `drop`, `long`, `ankle`, `strength`, `row`,
  `race`, `rest`.
- `critical: true` shows a "Key session" tag. `isRecovery` / `isPeak` badge the week.
- **Which metrics a session asks for follows its `type`** (see `js/fields.js`) — an Ankle
  Church session asks for the balance progression, not distance and climb. To change it for
  one session, give it a `"fields"` array, e.g.
  `"fields": ["durationMin", "balance", "notes"]`. Available keys: `durationMin`,
  `distanceKm`, `gainM`, `avgHr`, `reps`, `exercises`, `rpe`, `balance`, `hopStick`,
  `notes`.
- Prose fields (`note`, `detail`, `bodyMd`, `notesMd`) take simple markdown: `**bold**`,
  `*italic*`, `-` lists, `1.` lists, `###` headings, pipe tables, links.

If you break the JSON the app will say so instead of loading — paste it into any JSON
validator, fix the stray comma, push again.

**Note on caching:** the app caches itself for offline use, so a plan edit appears on the
*next* launch after your device has fetched it. To force it immediately: Settings →
**Update from GitHub**.

If you ever change the **app code** rather than the plan, bump `VERSION` in `sw.js`
(`lantau-v4` → `lantau-v5`). A cache-first service worker keeps serving the copy it
installed until that string changes. `data/plan.json` is deliberately exempt — it
revalidates on its own, so plan edits never need a bump.

---

## Your log

Ticks and metrics live in this browser's `localStorage` under `lantau-log-v1`. They
survive closing the browser and going offline. They do **not** move between devices on
their own — for that, either use export/import or set up sync.

### Export / import

Settings → **Export JSON** downloads `trail-log-YYYY-MM-DD.json`. **Import JSON** takes it
back, replacing what's on that device. Worth doing occasionally regardless of sync.

### Sync between iPhone and Mac (optional)

Sync uses a second, **private** repo holding one `log.json`, read and written through the
GitHub API. The app is fully usable without it — this is an enhancement, never a
precondition.

**One-time setup:**

1. Create a **private** repo, e.g. `20k-climb-log`. Add a file `log.json` containing:

   ```json
   {"schemaVersion":1,"entries":{},"achievements":{}}
   ```

2. Create a token: GitHub → Settings → Developer settings → Personal access tokens →
   **Fine-grained tokens**.
   - Repository access: **Only select repositories** → `20k-climb-log` and nothing else
   - Permissions: **Contents → Read and write**. Nothing else
   - Expiry: past **6 December 2026**

3. In the app: status chip → Settings → fill in owner, repo, path, paste the token →
   **Save & sync now**. Repeat on each device.

**How it behaves:**

- Reads local cache and renders instantly. The network is never on the critical path.
- Writes save locally first, then push to GitHub after a ~3 second pause so a burst of
  edits becomes one commit.
- Merging is **per session, not per file**: two devices editing different sessions merge
  cleanly. Only the same session edited on both devices before syncing can conflict, and
  there the **more recent write wins** — the older edit to that one session is lost.
- Offline writes are queued in `localStorage` and pushed on reconnect. Nothing is lost by
  logging a session on a trail with no signal.
- The chip shows Local / Synced / Saving / Offline / Sync error.

**The token.** It sits in `localStorage` on your own devices. That is a deliberate
trade-off: its blast radius is write access to one private repo of training logs, and it
is revocable in one click. Settings → **Remove token from this device** clears it locally;
GitHub → Settings → Developer settings → Fine-grained tokens → Revoke kills it everywhere.
The token is never committed, never in `plan.json`, never logged to the console.

---

## Deploying

GitHub Pages, from `main`, root folder — Settings → Pages → Source: *Deploy from a branch*,
Branch: `main` / `/ (root)`. `.nojekyll` at the root keeps Jekyll's hands off it.

There is no build step. What's in the repo is what's served.

---

## The ankle diagrams

`js/views/reference.js` looks for `assets/ankle-1.svg` … `ankle-4.svg` and shows them under
The Ankle Protocol. Drop those four files in and they appear; until then the slots sit
empty. No code change needed.

---

## Layout

```
index.html          app shell
manifest.json       PWA manifest (home-screen install)
sw.js               service worker — offline cache
css/app.css         all styles, custom properties, dark + light
data/plan.json      THE PLAN — edit this
js/app.js           router and startup
js/store.js         the log: localStorage, schema version, merge rules
js/sync.js          optional GitHub sync
js/model.js         everything derived from plan + log
js/dates.js         Hong Kong dates, week/day resolution
js/md.js            tiny markdown renderer
js/dom.js           small DOM helpers
js/fields.js        which metrics each session type asks for
js/theme.js         dark/light
js/views/*.js       one file per tab
icons/              app icons
```

Local preview: `python3 -m http.server 4173`, then http://localhost:4173.
