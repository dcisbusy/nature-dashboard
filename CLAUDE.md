# Field Notes — project reference

A personal, location-based nature dashboard for David (London, Crystal Palace area).
Single-page PWA hosted on GitHub Pages, no backend, no build step. Built collaboratively
with Claude over many sessions in claude.ai before moving to Claude Code — this file exists
so that history isn't lost in the transition.

**Read this before making changes.** Several bugs below were subtle, took real debugging
to find, and are easy to accidentally reintroduce if "simplified" or "cleaned up" without
knowing why the current code looks the way it does.

## Files in this repo

| File | Purpose |
|---|---|
| `nature-dashboard.html` | Main app — everything except the tree map |
| `trees-map.html` | Separate Leaflet.js page: all 160,870 trees on an interactive map |
| `sightings-map.html` | Separate Leaflet.js page: pannable map of recent iNaturalist sightings (last 30 days), colour-coded and filterable by taxon group, with photos in the popups. Linked from the dashboard's top-of-page sightings mini-map card. Originally also had a green/blue-spaces Overpass layer (see git history / superseded design note below) — removed as redundant with the base map and a source of slowness. |
| `perspective.html` | Separate page, two tabs: a logarithmic deep-time timeline (Big Bang → now) and a "life in weeks" grid (one box per week of an average UK male lifespan, editable birthday). Linked from the dashboard's season band ("The Long Now →"). Both static/offline-friendly — no live data fetches. |
| `sw.js` | Service worker — caches the app shell for offline/PWA use |
| `manifest.json` | PWA install config |
| `icons/icon-192.png`, `icons/icon-512.png` | App icons |
| `activities.csv` | User-editable "right now, right here" activity suggestions — **wired up and live** |
| `forage.csv` | **NOT wired up.** Forage data actually lives in a hardcoded `FORAGE` array inside `nature-dashboard.html`. This file is a leftover from an earlier draft; editing it currently does nothing. Fix this properly (parse it like `activities.csv`) if asked to make forage editable. |
| `trees-data.txt` | Compact pipe-delimited tree dataset, Lambeth/Southwark/Bromley/Croydon only |
| `trees-lookup.json` | Species/location-category/borough name lookup tables for `trees-data.txt` |

## Conventions to maintain

- **Footer version stamp**: `Last edited DATE · vX.Y · build XXXXXX` in `nature-dashboard.html`'s footer.
  Bump both the version number and generate a fresh short build ID (a truncated hash of a
  descriptive string is fine) on every meaningful change, so the user can confirm which
  build actually deployed after uploading/pushing.
- **Validate before shipping**: check JS syntax (e.g. `new Function(scriptBody)` in Node),
  cross-check every `getElementById('x')` call has a matching `id="x"` in the HTML, and
  confirm `<div>` open/close tags balance. This has caught real shipped bugs before —
  don't skip it.
- **Distances are always straight-line (haversine), never routed.** The app has no routing
  engine. Make sure any UI copy doesn't imply "walking distance."
- **Dark naturalist/field-journal aesthetic.** CSS custom properties: `--ink`, `--ink-soft`,
  `--moss`, `--lichen`, `--bone`, `--amber`, `--dusk`, `--line`. Fonts: Fraunces (display
  serif), Inter (body), Space Mono (data/mono readouts).
- **Deployment is via GitHub Pages**, static files only. No server-side code is possible.

## Bugs found and fixed — don't reintroduce these

- **CSS Grid blowout**: `.grid` MUST use `grid-template-columns: minmax(0,1fr) minmax(0,1fr)`,
  never bare `1fr 1fr`. A bare `fr` track's implicit minimum is `auto` (content-based), not
  `0` — with the swipeable carousels inside, this caused the whole page to overflow
  horizontally past the phone screen. `.card` also has `min-width:0` and `body` has
  `overflow-x:hidden` as defense-in-depth. If a future card design blows out the width
  again, check this first.
- **Overpass `out geom N` truncation**: Overpass does NOT sort by distance before applying
  a numeric cap. A low cap (originally 15) silently excluded genuinely-nearest large
  features (a real bug: Crystal Palace Park never appeared, even standing inside it,
  because ~15+ smaller decoy features got enumerated first). Fixed by raising the cap to
  200 and always ranking client-side afterward.
- **Distance to green/blue spaces must use nearest boundary vertex, not polygon centroid.**
  Centroid distance is wrong for large polygons — a huge close park's centroid can be
  much farther than a small distant feature's centroid, causing wrong "nearest" results.
  See `rankNearbyFeatures()` — it walks every vertex of a way's geometry and keeps the
  closest one.
- **Overpass reliability + speed**: query all 4 public mirrors (`overpass-api.de`,
  `overpass.kumi.systems`, `overpass.openstreetmap.fr`, `overpass.openstreetmap.ru`) **in
  parallel** via `Promise.any`, each bounded by its own 12s `AbortController` timeout, and
  take whichever responds first. Originally sequential (try one, wait for it to fully fail,
  try the next) — the main instance alone frequently 503s/times out under load, and
  sequential fallback meant every query paid that mirror's full timeout before even
  starting the next one. Verified live: a real query with one mirror CORS-blocked and two
  others taking 11-12s still resolved in ~3.5s via whichever mirror was actually fast that
  moment — the fix is a genuine, measured speedup for the dashboard's green/blue cards, not
  just theoretical. See `fetchOverpassMirror`/`fetchOverpass` in `nature-dashboard.html`.
- **Green/blue "3 nearest" must actively re-fetch as the user walks**, not just re-sort a
  stale set fetched once at page load. Real bug: user walked past a genuinely-nearest new
  green space 10 minutes after load and it never appeared, because the app only ever
  re-ranked the original 3 candidates. Fixed with distance/time-gated refetching (300m
  moved AND 45s elapsed minimum, to avoid hammering the API) — see `refetchGreenIfNeeded`/
  `refetchBlueIfNeeded`.
- **Trees work differently and don't need this fix**: the entire 160,870-row dataset loads
  once into memory client-side (cached by the service worker), then a spatial grid index
  (0.005° cells) gives fast nearest-lookup with no per-move network calls. This is why the
  tree card updated live from the start while green/blue initially didn't — different
  architecture, not an oversight.
- **Trees area gating is a rectangular bounding box**, not real borough polygons (no
  boundary GeoJSON available). This means it can show up just inside a neighbouring
  borough near the edges. A 1km distance sanity cutoff prevents confidently showing a
  misleadingly-distant "nearest" tree when genuinely outside coverage (verified against
  Piccadilly Circus, which correctly shows "no covered data").
- **Source data truncation**: an early upload of the London Datastore trees CSV was
  silently truncated at exactly 1,048,576 rows — Excel's hard row limit. This is a strong
  tell to watch for if the user ever re-exports/re-uploads: if a row count exactly matches
  a power of 2 near a million, suspect truncation, not genuine data absence. The current
  `trees-data.txt` was built from a complete, untruncated source file.
- **Croydon's tree coverage is genuinely sparse in the source data** (1,209 trees vs.
  50-65k for neighbouring boroughs) — not a bug, just thin underlying data.
- **iNaturalist deep-linking into the native Android app was abandoned after multiple
  failed attempts** (plain link → opened in-app browser; `intent://` → fell through to
  Play Store; path-specific links → same). Root cause: the installed PWA renders external
  links inside a plain embedded WebView, which has no OS-level app-link resolution (no
  "open in app" even on long-press — confirmed via user testing). No URL trick fixes this.
  The Web Share API (`navigator.share()`) was the one thing that reliably escaped the
  WebView, but the whole feature was later removed at the user's request anyway. **Don't
  re-attempt intent:// or path-guessing tricks for this** — it's a platform limitation,
  not a code problem.
- **GPS accuracy stuck around ±100m** is very likely Android's "Approximate location"
  permission tier (introduced Android 12), not a code bug — this caps precision regardless
  of what the page requests. Check Android/browser location settings before assuming a
  code fix is needed.
- **Firefox for Android has flaky PWA "Add to Home Screen" support.** Chrome is more
  reliable for genuine installed-app behavior with working geolocation prompts.
- **Claude.ai's own artifact preview sandbox blocks/limits real network fetches and
  geolocation** — this is why the app needed to be deployed to real GitHub Pages hosting
  rather than tested inside Claude's own chat interface.
- **Android Chrome's forced/auto dark theme can invert light-coloured UI elements**, and
  `<meta name="color-scheme" content="dark">` (present on every page) is **not sufficient
  to stop it on its own** — confirmed by the user still seeing a fully-black moon icon
  after that fix shipped. The icon was originally a plain CSS circle
  (`background:var(--bone)`) with an inset `box-shadow` carving the crescent; that
  combination of a flat light background-color + shadow is exactly the kind of surface
  Android's heuristic targets for inversion, color-scheme meta tag or not. Fixed properly
  by rebuilding the icon as genuine SVG vector content: a `<mask>` with a movable
  `<circle>` cutout, so the "shadow" is a hole punched in the lit disc (letting the dark
  page background show through) rather than a colour Android can reinterpret. Vector
  fills/masks are far less likely to be touched by this heuristic than a flat coloured
  surface — if another light-coloured element is ever added, prefer SVG over a plain
  CSS background for exactly this reason, don't assume the meta tag alone covers it.

## Dashboard top-of-page layout

- **Order**: header (title only) → sightings mini-map card → sky band (time of day) →
  season band (time of year) → the 2-col card grid. `#locLine` (captured place name/coords)
  now lives in the **footer**, not overlaid on any card — it started in the header, moved
  to the mini-map card, then moved again to the footer per the user's request to make it
  more discreet. Still the same element id throughout, just relocated; the load/geolocation
  JS that sets its text has never needed to change.
- **Sightings mini-map card**: no heading, full-width/edge-to-edge, structured identically
  to the sky band (same fixed 92px height, no card padding, `border-radius`/`overflow:hidden`
  directly on the `<a>` itself) rather than as a padded card containing an inset map. A real
  OSM tile (`a.tile.openstreetmap.org/{z}/{x}/{y}.png`, zoom 14) shown as a plain `<img>`,
  not a Leaflet instance — one image request instead of pulling in the whole Leaflet library
  just for a decorative preview on the main dashboard, which the user specifically wants
  kept fast. The "you are here" dot is fixed at dead-centre via CSS (`top:50%;left:50%`),
  not computed to the user's exact sub-tile pixel: `object-fit:cover` crops this square tile
  to fill a wide/short box, and precisely centring an arbitrary point within that crop needs
  a multi-tile mosaic to guarantee the point never lands outside the visible slice. This is
  a preview, not a precise instrument — tapping the card opens `sightings-map.html` (real,
  precise, interactive) for that. No caption text on the card itself now (see above).
- **Season band**: `.season-visual` (the coloured band, 44px) and `.season-text` (a plain
  two-line text block below it) are now **separate elements**, not one overlaid onto the
  other. Originally both captions were absolute-positioned text overlaid directly on the
  gradient (left-aligned season/day info, right-aligned "The Long Now →" link) — on a
  narrow phone the left caption's text could run long enough to collide with the right one,
  since both shared one row with no width constraint. Moving the text into its own row below
  the gradient, stacked as two literal separate lines (`display:flex;flex-direction:column`),
  makes overlap structurally impossible regardless of text length, and also freed the
  gradient area from needing `text-shadow` legibility tricks since text no longer sits on
  top of it. The gradient itself is now **one continuous `linear-gradient` across the whole
  band** with each season's colour at its quarter's midpoint (12.5%/37.5%/62.5%/87.5%)
  rather than four separately-painted quarters — CSS interpolates smoothly through the
  25%/50%/75% boundaries this way, instead of each quarter's gradient hitting its own hard
  edge at the seam (the previous look, which the user found "too sharply defined"). Four
  fixed-order quarters (Spring/Summer/Autumn/Winter, left to right) still exist as
  positioning containers for the label text and the marker's `left:%` reference frame, they
  just no longer carry their own background. Equinox/solstice dates are fixed calendar-day
  approximations (Mar 20 / Jun 21 / Sep 22 / Dec 21), good to within about a day — same
  "acknowledged simple approximation" tolerance already used by `moonPhase()`, not tied to
  any API. Bottom line 1: season/day/countdown (`"Summer, day 67 · 27d to autumn equinox"`).
  Bottom line 2: a static, always-visible "The Long Now →" label (not dynamic content) —
  moved here from a link at the bottom of the page per an earlier request; the whole band
  is one `<a>`.
- **Manual location entry** (`manualLocToggle`/`manualLocBlock`) moved from just below the
  header to just above the footer, and restyled as a small muted underlined text button
  rather than a `.mini-btn` pill — deliberately de-emphasised ("discreet") since it's a
  fallback path most visits never need, not a primary action.

## Live compass system

Three independent target-bearing variables — `greenTargetBearing`, `blueTargetBearing`,
`treeTargetBearing` — all share one global `deviceHeading`/`compassActive` state, updated
via a single `handleOrientation()` listener. The #2/#3 list rows (green and blue spaces)
use a generic small-compass component: render with a `data-bearing="123.4"` attribute, and
`updateMiniCompasses()` sweeps all of them on every orientation change — this avoids
maintaining parallel bearing arrays per card.

**Live compass is default-on** for Android/most browsers (auto-attaches on page load, no
permission needed). **iOS requires an explicit user tap** to grant motion/orientation
permission (`DeviceOrientationEvent.requestPermission()`) — this is a platform security
requirement, not a design choice, so the "Enable live compass" button only appears there.

## Data sources (all free, all verified working — don't swap without reason)

| Source | Used for | Notes |
|---|---|---|
| Open-Meteo | Weather + hourly forecast | Free, keyless |
| Overpass API (OSM) | Green/blue spaces | Multi-mirror, see bugs above |
| iNaturalist API | Species sightings, species counts | Free, keyless. Sighting radius auto-expands 2km→5km→10km→20km if fewer than 3 distinct species found |
| Wikipedia REST API | Tree/bird/forage photos | `en.wikipedia.org/api/rest_v1/page/summary/{title}` |
| Woodland Trust | Tree info links | All 24 tree slugs individually verified against their real A-Z index — high confidence |
| RSPB | Bird info links | URL pattern confirmed (`rspb.org.uk/birds-and-wildlife/{slug}`), but a few slugs (long-tailed-tit, mistle-thrush, jackdaw, possibly others) were inferred, not individually verified — fix if any 404 |
| Plants For A Future (PFAF) | Forage info links | Predictable URL pattern: `pfaf.org/user/Plant.aspx?LatinName=...` |
| sunrisesunset.io | Moonrise/moonset | Free, keyless, CORS-enabled. Fetches **both today's and tomorrow's** data specifically to resolve moon-up/down status correctly across midnight |
| BigDataCloud | Reverse geocoding (place name) | Free, keyless |
| ipwho.is | IP-based location fallback | Free, keyless, city-level accuracy only |
| London Datastore | Public Realm Trees dataset | OGL v3 licensed. Filtered to 4 boroughs (160,870 of ~1.14M London-wide) |

**Investigated, no free API found, never built:**
- Tree Equity Score UK — no public API discoverable
- Constellations/planets — no free live API exists. If revisited: moonrise/moonset is
  already solved via sunrisesunset.io. Constellations are feasible via fixed RA/Dec +
  standard spherical trigonometry (low risk). Planets need low-precision orbital elements
  (Meeus/Schlyter-style method) — meaningfully more error-prone; sanity-check output
  against known current planet positions before trusting it.

## Geolocation fallback chain (`nature-dashboard.html` only)

1. Browser GPS, 3.5s timeout
2. IP-based location via ipwho.is (no permission needed, city-level only)
3. Manual lat/lng entry box (hidden by default behind a toggle button)

`trees-map.html` just uses browser geolocation directly (no fallback chain) — it's a
secondary page opened deliberately, so a permission prompt there is expected.

## "Of the week" features (Tree/Bird/Forage)

- Rotate **weekly, on Mondays** — via `weekIndex()`, verified against the real calendar.
- Each shows **3 species**, not 1, picked deterministically via a seeded PRNG (mulberry32)
  keyed by `weekIndex + offset` (offset 0 for trees, +3 birds, +6 forage, so they don't
  all reseed identically the same week).
- Swipeable via CSS `scroll-snap` carousels with dot indicators — see `renderSwipePanels()`.
- Forage specifically attempts genuine location-matching first (iNaturalist
  `species_counts`, `taxon_id=47126` for Plantae, 10km radius, filtered by current month)
  before falling back to "in season generally," then the full list — the UI honestly
  labels which source was actually used.
- Bird sound playback was deliberately **not** built via Xeno-canto (unreliable CORS
  support, v3 requires a key) — and was later removed entirely anyway per user request
  (RSPB click-through was judged sufficient).

## activities.csv schema

Columns: `id,title,body,phase,weather,min_temp,max_temp,needs_greenspace,needs_species,min_moon_illum,max_moon_illum,requires_moon_up`

- `phase`: `Dawn`/`Day`/`Dusk`/`Night`/`Any`
- `weather`: `rain`/`clear`/`any`
- `requires_moon_up`: `yes`/`no`/blank — gates on the moon's *actual* current up/down
  status (from sunrisesunset.io), not just phase illumination percentage
- Template placeholders in `title`/`body`: `{greenspace_name}`, `{greenspace_distance}`,
  `{species_name}`, `{species_sci}`, `{moon_name}`, `{moon_illum}`
- This file is fetched fresh on every load (excluded from service worker caching)
  specifically so edits show up immediately — don't add it to `SHELL_FILES` in `sw.js`.

## Service worker caching strategy

Cache-first (offline-capable): `nature-dashboard.html`, `trees-map.html`,
`sightings-map.html`, `perspective.html`, `manifest.json`, icons, `trees-data.txt`,
`trees-lookup.json`.

Always-network (never cached): `activities.csv` (meant to be edited often), and every live
data API host (Open-Meteo, Overpass, iNaturalist, ipwho.is, BigDataCloud, sunrisesunset.io).

**Bump `CACHE_NAME` in `sw.js` whenever `SHELL_FILES` changes, or whenever any cached
page's content changes meaningfully** (not just the file list) — the cache-first fetch
handler never refreshes an already-cached entry on its own, so without a bump a returning
user just keeps getting the stale version forever, pushed fix or not. This has been the
standing practice all session; check the current value in `sw.js` rather than trusting any
number written here, since it's bumped on nearly every commit.

**"Update available" banner**: every page registers the service worker (idempotent — safe
to call from all four even though only `nature-dashboard.html` used to) and listens for
`registration.addEventListener('updatefound', ...)`. When the new worker reaches `installed`
*and* `navigator.serviceWorker.controller` is already set (i.e. this is a genuine update,
not the page's very first-ever SW install), a small fixed banner appears prompting a
reload. This exists because a pushed update alone changes nothing for an already-open
tab or a PWA that isn't reopened often — `skipWaiting()`/`clients.claim()` in `sw.js` mean
the new worker takes over network requests immediately, but the already-loaded HTML/JS in
the tab is still the old version until an actual reload happens, and there was previously
no way for a person to know that had happened. `showUpdateBanner()` is duplicated per page
(project convention, no shared JS module) rather than factored out.

## Tree map (`trees-map.html`) specifics

- Leaflet 1.9.4 + **Supercluster 8.0.1** (both pinned to exact versions), loaded from
  unpkg CDN — **not** cached by the service worker, so this page requires an internet
  connection (unlike the rest of the app, which degrades to cached data offline).
- Originally used Leaflet.markercluster, which builds its cluster tree from every single
  marker up front regardless of viewport — fine up to tens of thousands of points but the
  dominant cost of the ~20s load at 160k+. Replaced with Supercluster: it builds a spatial
  index once (fast — just spatial math, no DOM/marker objects) and only constructs Leaflet
  markers for what's actually in the current viewport, recomputed via
  `index.getClusters(bbox, zoom)` on every `moveend`. Clustering stays accurate at every
  zoom level since the index always covers all 160k trees — panning doesn't lose data.
- Only **4 shared icon objects** exist (one per location category: Highways/Parks/
  Housing/Other) — reused across all 160,870 markers via `ICON_CACHE`. Originally created
  one icon per tree, which was a major performance bug.
- Parsing runs in **async batches of 8,000 via `requestAnimationFrame`**, not one blocking
  synchronous loop — extracts only lat/lon/category into the Supercluster index plus a
  parallel `treeRows` array (for lazy popup lookup by index); no Leaflet Marker/Popup
  objects are constructed until a point is actually visible. Note: browsers pause
  `requestAnimationFrame` for backgrounded/non-visible tabs (standard battery-saving
  behaviour), so if this page is ever opened in a background tab, loading will genuinely
  pause until the user actually looks at it, then resume from where it left off — this is
  expected, not a bug, and matches what the loading bar honestly shows.
- Accepts `?lat=&lng=` URL params (passed from the dashboard's "View all trees on map"
  link) to center immediately, rather than waiting for its own possibly-slower GPS fix.
- Real GLA tree IDs are shown (`uniqueid` column from the source data) — the source's own
  documentation notes these are for mapping purposes only, not linked to any external
  borough management system.
- **Two Leaflet gotchas fixed here** (both apply equally to `sightings-map.html`, see its
  section below for the full writeup): `map.invalidateSize()` on `whenReady` +
  `visibilitychange` (container-size-at-construction bug), and `{ animate: false }` on
  every *programmatic* `setView()` call that runs automatically on load — e.g. the
  `?lat=&lng=` recenter above and the geolocation-fallback recenter in `initUserLocation()`
  (NOT the cluster-click-to-zoom call, which is user-triggered and fine to animate).

## Sightings map (`sightings-map.html`) specifics

- **Originally called `spaces-map.html`** and also had a green/blue-spaces Overpass layer
  (parks/water queried live per-viewport, same multi-mirror setup as the dashboard's
  green/blue cards). Removed at the user's request: it was slow (live Overpass queries
  with multi-mirror fallback can take a while when the primary mirror times out — the same
  latency the dashboard's own green/blue cards already have, see Data sources below) and
  largely redundant with what the OSM base tiles already show for parks/water. If asked to
  bring it back, the Overpass query/rendering code is in git history (see the commit that
  introduced `spaces-map.html` and the one that later renamed/simplified it to
  `sightings-map.html`) — don't rebuild it from scratch.
- Now purely an iNaturalist sightings map: bbox-scoped observation search
  (`swlat/swlng/nelat/nelng`), last 30 days, `verifiable=true`, capped at `per_page=200`
  (a city centre can exceed that in a month — deliberate cap to avoid flooding the map, not
  a bug if a dense area hits it). No clustering needed at that scale (unlike the tree map,
  which needs it at 160k points).
- **Filterable by taxon** via the `iconic_taxa[]` API param (dropdown: Plants/Fungi/Birds/
  Mammals/Insects/Reptiles/Amphibians/Molluscs, or "All"). Markers are also colour-coded by
  the same `ICONIC_COLORS` map regardless of filter state, so "All" still reads sensibly at
  a glance — see the legend. Changing the filter forces a refetch even if the viewport
  hasn't moved (`lastFetchedBounds = null`).
- **Popups include a photo** (`o.photos[0].url` with `square` swapped for `medium`, falling
  back to `o.taxon.default_photo.medium_url`) alongside name/species/date and a link to the
  observation on iNaturalist — same photo-URL pattern already used in
  `nature-dashboard.html`'s species card.
- **Zoom-gated** below zoom 13 (`MIN_ZOOM_SIGHTINGS`) and refetch-avoided via padded bounds
  (`bounds.pad(0.5)`) — a `moveend` only triggers a new fetch once you've panned/zoomed
  outside the last-fetched padded area, so small pans reuse the same data instead of
  hammering the API on every drag. Shows a "zoom in further" hint instead of querying below
  the floor; does **not** clear already-loaded data when you zoom back out.
- Layer is rebuilt from scratch (`clearLayers()` + repopulate) on every successful fetch
  rather than diffed against the previous set — same "cheap enough, not worth the
  complexity" tradeoff already used by the tree map's cluster layer.
- **Leaflet gotcha**: `L.map()` measures its container's pixel size at construction time.
  If the tab isn't actually visible/composited at that exact moment (backgrounded tab, PWA
  restored from background), Leaflet can cache a `0x0` size — every `getBounds()` call
  after that returns a degenerate box (`south === north`, `west === east`), which silently
  breaks every bbox-based fetch on the page with no error thrown. Confirmed by direct
  `getBoundingClientRect()`/`getBounds()` inspection while building this page. Fixed with
  `map.invalidateSize()` called once on `map.whenReady()` and again on every
  `visibilitychange` back to visible. Applied to `trees-map.html` too since it has the
  identical construction pattern.
- **Second Leaflet gotcha, found while chasing the first**: `map.setView(latlng, zoom)`
  defaults to an *animated* zoom/pan transition (`zoomAnimated` is `true` by default), which
  only completes — and only updates `map.getZoom()`/`getCenter()` — once its CSS
  transition/rAF-driven animation actually finishes. If that animation starts before the
  tab is genuinely compositing frames, it can stall indefinitely: `getZoom()` keeps
  reporting the *old* zoom forever, silently leaving the map centred on the wrong place with
  no error. This directly broke the `?lat=&lng=` auto-recenter on load. Confirmed directly:
  the exact same `setView()` call left the map stuck at the default view every time, but
  `map.setView(latlng, zoom, { animate: false })` applied instantly and reliably every
  time. Fixed on every *automatic* `setView()` call in both map pages (the `?lat=&lng=`
  recenter and the geolocation-fallback recenter) — left animated only on the
  cluster-click-to-zoom handler in `trees-map.html`, which is user-triggered and therefore
  never at risk of firing before the tab is visible.

## Perspective page (`perspective.html`) specifics

- Two tabs, both pure client-side rendering with no live data (fully offline-friendly,
  listed in `sw.js`'s cache-first `SHELL_FILES`).
- **Deep time**: a vertical timeline of ~20 milestones from the Big Bang to now, positioned
  on a **logarithmic** scale of years-ago (`(maxLog - log10(yearsAgo)) / (maxLog - minLog)`)
  — a linear scale would make everything except "now" invisible, since all of recorded
  human history is a vanishingly small fraction of 13.8 billion years. Dates are standard
  textbook/scientific consensus figures (Big Bang ~13.8bya, Earth ~4.5bya, Cambrian
  explosion ~540mya, K-Pg extinction ~66mya, *Homo sapiens* ~300kya, agriculture ~12kya,
  etc.) — not tied to any API, so update `DEEP_TIME_EVENTS` directly if a figure is revised.
  - **Overlap fix**: pure log-scale positions left several of the earliest, closely-spaced
    events (13.8bya vs 13.6bya; 4.6bya vs 4.5bya) with virtually the same vertical position
    — their multi-line labels overlapped badly regardless of alternating left/right sides,
    a real bug caught from a user screenshot, not visible from reading the code. Diagnosed
    by measuring actual rendered `top` positions directly, not by re-deriving the CSS math.
    Fixed with a **minimum-gap enforcement pass**: positions are computed in pixels against
    a fixed `TIMELINE_IDEAL_HEIGHT`, then walked top-to-bottom pushing any position closer
    than `TIMELINE_MIN_GAP` (92px) to the previous one down just enough to clear it. Dots
    and labels share one adjusted position (not decoupled with a leader line) — a
    deliberate simplification acknowledged in the on-page outro text, since it only
    measurably affects the already-tightest cluster and the far more important "human
    history is a sliver at the very end" effect is unaffected (those events already have
    generous natural spacing). The container's height is set from JS
    (`el.style.height`), not fixed in CSS, since the real height depends on how much
    gap-enforcement pushing was needed.
  - **Two more real bugs, both from a user screenshot, neither caught by prior verification**:
    (1) `.tl-event.left .tl-dot{ left:calc(46% + 14px); }` used the SAME number (46%) that
    the label box's own `width` is set to, but in a completely different reference frame —
    a `left` percentage on an absolutely-positioned child is relative to the *parent's*
    (the label box's) width, not the timeline's, so `46%` landed the dot roughly a third of
    the way into the box instead of at its right edge. Fixed to `left:calc(100% + 14px)` —
    100% of the box's own width reaches its edge, then +14px reaches the centre line, same
    as the (already-correct) right-side rule. Verified by measuring every dot's rendered
    centre against the centre line directly: all 20 now land within 1px of it, versus the
    original bug where they sat mid-text. (2) The very first event sits at raw position 0,
    but `.tl-event`'s `transform:translateY(-50%)` centres its box ON that position, so
    roughly half the box's own height was extending upward past the timeline container's
    top edge and into the tab bar above it — worst for the Big Bang entry specifically,
    since it's one of the taller two-line labels. Fixed with a flat `TIMELINE_TOP_OFFSET`
    (45px) added to every position. Both bugs are a reminder that this timeline's positions
    were never actually screenshotted/eyeballed by a human until this round — measuring
    `top` values or gaps (as the min-gap fix's own verification did) doesn't catch a
    percentage-reference-frame bug or a translateY-vs-container-edge bug, since both are
    about pixels *within* an element's own box, not its position relative to siblings.
- **Life in weeks**: a grid of one box per week of an average UK lifespan — **male (79
  years) by default, female (83 years) via a toggle**, both commonly-cited ONS
  life-expectancy-at-birth figures, explicitly captioned as population averages, not a
  prediction for any one life. One row per year, editable birthday (`<input type="date">`,
  defaults to 1982-06-24). ~4,100 boxes generated via a single template-string `innerHTML`
  write, not per-box DOM calls — cheap even at this count (compare trees-map's 160k
  markers). The current week gets its own highlighted class distinct from "already lived"
  vs "not yet lived". Originally built as a galactic "cosmic address" view instead (nested
  rings + real distance stats for Moon/Sun/nearest star/galactic centre/Andromeda) —
  replaced at the user's request; if revisited, that code is in git history (the commit
  that introduced `perspective.html`).
  - **Format/idea credited to Tim Urban's "Your Life in Weeks" on Wait But Why**
    (waitbutwhy.com/2014/05/life-weeks.html), linked in the on-page outro at the user's
    request. This is the well-known origin of the "one box per week of a life" visualisation
    generally, worth keeping the credit if this section is ever restructured.
  - **A user report that "only about a third of boxes look lit up in August" could not be
    reproduced.** Checked directly: `.weeks-row-boxes` genuinely renders exactly 52
    `.week-box` children per row at both mobile (375px) and desktop widths, with no
    horizontal overflow/clipping (`scrollWidth === clientWidth` in both cases) — so the
    user's own alternative theory ("maybe boxes are cut off, not 52 per line") didn't hold
    up under inspection either. The percentage for the default birthday (24 June 1982) on a
    given day computed correctly (e.g. 55.9% / age 44.2 on 26 Aug 2026) — nowhere near "a
    third," and there's no calendar-year or financial-year logic anywhere in `renderWeeks()`
    to explain that guess (it's purely `(now - birthdate) / msPerWeek`, unrelated to which
    month it currently is). Applied a defensive `min-width:0` +
    `grid-template-columns:repeat(52, minmax(0,1fr))` anyway (the same overflow-guard
    category as the dashboard's original `.card{min-width:0}` fix), and added an explicit
    age figure to the caption (e.g. "You're 44.2 years old") specifically so a viewer can
    immediately sanity-check the birthdate math against their own known age. If this is
    still reported after that ships, get the *actual* birthdate/sex toggle state and
    ideally a screenshot from the person seeing it — the discrepancy could not be found by
    inspecting the code or a live render with the default inputs.

## Open items / explicitly deferred

- **Constellations/planets card**: researched, not built (see Data sources above).
- **`forage.csv` is dead weight** — not wired up. Fix properly if asked to make forage
  editable the way `activities.csv` is.
- **Tree map performance fixes** (icon caching + batching) were just built and not yet
  confirmed fixed on a real device.
- **A few RSPB bird slugs are unverified guesses** — fix individually if reported broken,
  don't re-guess the whole set.
