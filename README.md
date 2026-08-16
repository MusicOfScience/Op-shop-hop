# Op-Shop-Hop

A mobile-first Victorian op-shop field guide, personal rating notebook and suburb-hop planner.

## What v1 does

- discovers Victorian charity / second-hand shops from OpenStreetMap via Overpass, with a curated official-source seed list so the app is useful before live map data returns
- filters Inner Melbourne, Greater Melbourne, all Victoria, suburb and approximate app region
- gives each local browser profile separate ratings, notes, hashtags and favourites
- uses a 10-level tap scale per review category
- lets each profile set review categories to **Always**, **Ad hoc** or **Hidden**
- keeps one-off “Other” review fields attached only to that review unless a user deliberately creates a reusable category
- builds a personal hashtag library with compact visual markers
- maps shops with Leaflet + OpenStreetMap tiles
- opens Google Maps, Apple Maps or Waze for directions
- builds multi-stop “hop” plans, opens a Google Maps walking route, and can search mapped public parking near the centre of a hop
- finds nearby cafés, bookshops and record/music shops with OpenStreetMap, then provides a Google Maps search link for current public reviews
- allows missing shops to be added locally
- exports/imports a JSON backup for portability

## Privacy / multi-user model

v1 supports multiple **local profiles on one browser/device**. Personal reviews are stored in `localStorage`; nothing is written back to OpenStreetMap or a public database. JSON export/import allows backups and manual transfer between devices.

A genuinely shared cross-device multi-user service should be the next architectural step (auth + hosted database, e.g. Supabase/Postgres). The current state shape already separates profiles, reviews and public shop records so that migration is straightforward.

## Data sources

The seed list is based on current official store/location information from major Victorian operators including Salvation Army / Salvos Stores, Sacred Heart Mission, Helping Hands Mission, Save the Children and Australian Red Cross. Live discovery uses OpenStreetMap `shop=charity`, `shop=second_hand`, and selected `second_hand=yes|only` shop types.

OpenStreetMap data and map tiles require attribution. Do not add bulk/offline tile downloading. Op-Shop-Hop only loads normal interactive map tiles and performs user-facing Overpass data queries.

## GitHub Pages

This is a no-build static app. Publish the repository root from the Pages source branch. `index.html` is the entry point.
