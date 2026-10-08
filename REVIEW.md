# App review — 8 October 2026

Reviewed upstream main `40886eff56e7fdf5cdc41a714d6a35db97eda87b` and the established V2 brief. The public GitHub Pages URL returned “There isn't a GitHub Pages site here” during direct browser inspection.

## Repairs in 2.2.1

- Reload each profile's personal listings on profile creation/switch. Remove other profiles' listings and clear the current hop; existing profile/review identifiers are preserved.
- Stop merging branches solely because they share a suburb or street name. Require matching identity and corroborating address/geographic evidence; retain real seed/OpenStreetMap joins and update metadata for the same OSM identity.
- Keep expired statewide discovery caches available during refresh and network failure. Distinguish unavailable/stale/live freshness. Cache local book/record/café discoveries; retain complete place snapshots inside newly saved itineraries.
- Discover books and records in overview/list mode without requiring WebGL. Cafés remain bounded to nearby/map discovery.
- Validate backup profiles, reviews, ratings, categories, additions and hops before replacement. Keep and provide an export of the pre-import recovery backup. Surface a persistent warning if device storage rejects personal writes.
- Retain a searched starting point across reloads. Validate coordinates, handle stale address responses, clear network timers, stop failed live following, and render controls after live position updates.
- Support keyboard/assistive-technology checkbox changes, label dialogs, enlarge mobile touch targets, avoid iOS text-input zoom, and reduce introductory space.
- Label itinerary distances as straight-line estimates. Bound mobile Google Maps waypoint hand-offs and provide individual continuation legs for longer itineraries.
- Limit service-worker cache deletion to Op-Shop-Hop caches. Prefer an offline shell to an HTTP-error navigation response. Bump cache/asset versions together.
- Add behavioural regression tests, mobile/profile/backup/keyboard checks, and a real MapLibre renderer test. Add a validation-gated Pages publishing workflow that packages only public app assets.

## Verification

Local smoke and behavioural regression tests passed. Browser binaries cannot be downloaded in this execution environment, so browser journeys must pass in GitHub CI before release. Map tests use the real MapLibre library and deterministic discovery/tile fixtures; they do not prove third-party service availability. Live endpoint and iOS-device testing remain distinct from fixture browser checks.

## Remaining limitations

The 48 curated starting records have no bundled map coordinates and are not a newly verified store census. A network refresh is still needed to map seed listings unless previous discovery is cached. Discovery depends on third-party Overpass/Nominatim availability; listing timestamps indicate retrieval, not independently verified opening hours or operating status. Personal data remains device-local; cross-device sync is outside this repair. A Google Maps hand-off is not a computed accessible walking route.

GitHub Pages configuration could not be read or changed through the available GitHub connection. The repository is private and its previous public endpoint is absent. The publishing workflow requires Pages to be enabled with GitHub Actions as the source; private-repository Pages availability also depends on the owner's GitHub plan. Do not change repository visibility to fix hosting.
