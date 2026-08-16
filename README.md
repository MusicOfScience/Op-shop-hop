# Op-Shop-Hop

A mobile-first Victorian op-shop field guide, personal rating notebook and hop planner.

## What v1 does

- Finds op shops from a verified Victorian seed list plus live OpenStreetMap/Overpass discovery.
- Opens map-first on mobile, with **Use my location** or **suburb / street / postcode** search.
- Filters Inner Melbourne, Greater Melbourne and Victoria; sorts by suburb, name, distance, rating or recency.
- Rates shops on a 1–10 tap scale using a per-user review form.
- Default categories: Clothes, Books, Jewellery, Knick-knacks, Music, Electrical and Vibe.
- Review categories can be Always, Ad hoc or Hidden; one-off Other categories remain specific to that review.
- Stores notes, hashtags, favourites and visit status per local profile.
- Builds multi-stop hops, approximate walking order, parking suggestions and map-app hand-off.
- Finds nearby cafes, bookshops and record/music shops.
- Exports/imports local profile data as JSON.

## Data and privacy

The shared shop layer is public/open geographic data. Personal reviews and notes are stored in browser localStorage in v1; they are not uploaded by this static site. Cross-device accounts/sync would require a backend in a later version.

Map data © OpenStreetMap contributors.
