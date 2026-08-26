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
| `sightings-map.html` | Separate Leaflet.js page: pannable map of recent iNaturalist sightings (last 30 days), colour-coded and filterable by taxon group. Linked from the dashboard's species card. Originally also had a green/blue-spaces Overpass layer (see git history / superseded design note below) — removed as redundant with the base map and a source of slowness. |
| `perspective.html` | Separate page, two tabs: a logarithmic deep-time timeline (Big Bang → now) and a "cosmic address" view of Earth's position in the galaxy with real distance figures. Linked from the dashboard below the activity card ("Zoom out: the long now"). Both static/offline-friendly — no live data fetches. |
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
- **Overpass reliability**: rotate across multiple public mirrors (`overpass-api.de`,
  `overpass.kumi.systems`, `overpass.openstreetmap.fr`, `overpass.openstreetmap.ru`) with
  try/catch fallback — the main instance alone frequently 503s under load.
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
- **Android Chrome's forced/auto dark theme can invert light-coloured UI elements** on
  pages that never declare a colour scheme — real bug found via the moon phase icon
  (a light `--bone`-coloured disc) rendering fully dark for a user on Android's system dark
  mode, even though this app is always dark-themed regardless of system setting. Fixed by
  declaring `<meta name="color-scheme" content="dark">` plus CSS `:root{color-scheme:dark;}`
  in every page, telling the browser this page is intentionally dark and shouldn't be
  auto-inverted. Any future light-coloured element (anything not already using the dark
  palette) is at risk of the same bug on Android if a page is ever added without this meta
  tag — check for it first if a color looks wrong specifically on Android.

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

Cache-first (offline-capable): `nature-dashboard.html`, `trees-map.html`, `manifest.json`,
icons, `trees-data.txt`, `trees-lookup.json`.

Always-network (never cached): `activities.csv` (meant to be edited often), and every live
data API host (Open-Meteo, Overpass, iNaturalist, ipwho.is, BigDataCloud, sunrisesunset.io).

**Bump `CACHE_NAME` in `sw.js` (currently `field-notes-shell-v3`) whenever `SHELL_FILES`
changes**, or returning users will keep serving a stale cached shell.

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
  listed in `sw.js`'s cache-first `SHELL_FILES`):
  - **Deep time**: a vertical timeline of ~20 milestones from the Big Bang to now,
    positioned on a **logarithmic** scale of years-ago (`(maxLog - log10(yearsAgo)) /
    (maxLog - minLog)`) — a linear scale would make everything except "now" invisible,
    since all of recorded human history is a vanishingly small fraction of 13.8 billion
    years. The "now" marker is a special fixed endpoint outside the log math (log10(0) is
    undefined), not part of `DEEP_TIME_EVENTS`. Dates are standard textbook/scientific
    consensus figures (Big Bang ~13.8bya, Earth ~4.5bya, Cambrian explosion ~540mya,
    K-Pg extinction ~66mya, *Homo sapiens* ~300kya, agriculture ~12kya, etc.) — not tied to
    any API, so update `DEEP_TIME_EVENTS` directly in the file if a figure is revised.
  - **Our place in the galaxy**: a "cosmic address" nested-rings diagram (Earth → Solar
    System → local stellar neighbourhood → Milky Way/Orion Spur) explicitly labelled
    "illustrative, not to scale" — the real distances span ~30 orders of magnitude and
    genuinely cannot be drawn as one honest picture. Paired with a stat grid of real
    figures: Moon (~384,400km average — its orbit is elliptical, so this is a mean, not a
    live distance), Sun (1 AU), nearest star (Proxima Centauri, 4.25ly), galactic centre
    (~26,000ly, from the Orion Spur), and Andromeda (2.5 million ly, the most distant
    naked-eye object). No live "current" Earth-Moon/Earth-Sun distance is computed — there
    was no free API source for this already in the project, and the point of this page is
    perspective/awe, not precision navigation; the average figures are clearly labelled as
    such.
- User asked for two different "sense of scale" visualisations (deep time vs. galactic
  position) and to ship both so they could pick a favourite — hence one page with a tab
  switcher rather than guessing which to build. If one view is later dropped, the other's
  code is self-contained (its own `render*()` function) and easy to lift out on its own.

## Open items / explicitly deferred

- **Constellations/planets card**: researched, not built (see Data sources above).
- **`forage.csv` is dead weight** — not wired up. Fix properly if asked to make forage
  editable the way `activities.csv` is.
- **Tree map performance fixes** (icon caching + batching) were just built and not yet
  confirmed fixed on a real device.
- **A few RSPB bird slugs are unverified guesses** — fix individually if reported broken,
  don't re-guess the whole set.
