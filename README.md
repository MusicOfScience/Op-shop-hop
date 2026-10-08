# Op-Shop-Hop

A mobile-first Victorian op-shop field guide, personal rating notebook and hop planner.

## What V2.2 does

- Finds op shops from a curated Victorian seed list plus live OpenStreetMap/Overpass discovery.
- Shows where listing information came from, when open-map data was refreshed and which places include hours, website or accessibility information.
- Caches the statewide open-map layer for seven days, with a clear manual refresh control.
- Opens map-first on mobile, with **Use my location** or **suburb / street / postcode** search.
- Filters Inner Melbourne, Greater Melbourne and Victoria; sorts by suburb, name, distance, rating or recency.
- Rates shops on a 1–10 tap scale using a per-user review form.
- Default categories: Clothes, Books, Jewellery, Knick-knacks, Music, Electrical and Vibe.
- Review categories can be Always, Ad hoc or Hidden; one-off Other categories remain specific to that review.
- Stores notes, hashtags, favourites and visit status per local profile.
- Builds multi-stop hops, approximate walking order, parking suggestions and map-app hand-off.
- Saves named hops locally and creates walking, driving and public-transport hand-offs.
- Finds nearby cafes, bookshops and record/music shops.
- Exports/imports local profile data as JSON.
- Installs as a standalone web app and keeps the core field guide available offline.

## Data and privacy

The shared shop layer combines a curated starting list with public/open geographic data. Personal reviews, notes, additions and saved hops are stored in browser localStorage; they are not uploaded by this static site. Cross-device accounts/sync would require a backend in a later version.

Map data © OpenStreetMap contributors.

## Maintenance and publishing

Run `npm test` for smoke and behavioural regression checks. Serve the app with
`python3 -m http.server 4173 --bind 127.0.0.1`, then run `npm run test:e2e` and
`npm run test:map` after installing Playwright Chromium. Browser tests use deterministic
service fixtures, including a real MapLibre renderer test.

The Pages workflow validates the app before publishing only its public assets.
Repository Settings → Pages must have GitHub Actions selected as the publishing
source. Keep the repository private; check plan eligibility if Pages is unavailable.
See [REVIEW.md](REVIEW.md) for the repair scope and remaining data/hosting limitations.
