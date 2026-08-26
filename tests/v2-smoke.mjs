import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../app-v2.js",import.meta.url),"utf8");
const seedsSource=readFileSync(new URL("../seed-stores.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../styles-v2.css",import.meta.url),"utf8");
const manifestSource=readFileSync(new URL("../manifest.webmanifest",import.meta.url),"utf8");
const serviceWorker=readFileSync(new URL("../sw.js",import.meta.url),"utf8");

new vm.Script(app,{filename:"app-v2.js"});
new vm.Script(serviceWorker,{filename:"sw.js"});
const manifest=JSON.parse(manifestSource);

const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,"HTML ids must be unique");

for(const id of ["map","placeList","searchMapBtn","addShopBtn","modal","locationPrompt","routeTray","dataFreshness","refreshDataBtn","dataGuideBtn","savedHopsBtn"]){
  assert(ids.includes(id),`Missing required UI element #${id}`);
}

const sandbox={window:{}};
vm.runInNewContext(seedsSource,sandbox,{filename:"seed-stores.js"});
const seeds=sandbox.window.OP_SHOP_SEEDS;
assert(Array.isArray(seeds)&&seeds.length>=40,"The official fallback list must be substantial");
assert.equal(new Set(seeds.map(seed=>seed.id)).size,seeds.length,"Seed ids must be unique");
assert(seeds.every(seed=>seed.name&&seed.suburb&&seed.postcode),"Every seed needs a name, suburb and postcode");

assert(app.includes("syncControls();render();initMap();"),"The list must render before optional map startup");
assert(app.includes("showMapFallback"),"WebGL/map failure must have a list-mode fallback");
assert(app.includes('if(v==null||v==="")return null'),"Missing coordinates must never be coerced to 0,0");
assert(app.includes("mapSearchBounds=[west,south,east,north]"),"Search-this-map must constrain the visible result area");
assert(app.includes('data-popup-list'),"Map popups must link back to the result list");
assert(app.includes("openAddShop"),"The missing-shop journey must remain wired");
assert(app.includes("oldBody.cloneNode(false)"),"Each modal opening must discard stale event handlers");
assert(app.includes("VIC_CACHE_TTL = 7 * 86400000"),"Statewide map data must use the deliberate seven-day refresh rhythm");
assert(app.includes("openDetails"),"Place details must remain available from the result list");
assert(app.includes("sourceLabel"),"Listing provenance must remain visible");
assert(app.includes("detailFilter"),"Useful-detail filters must remain wired");
assert(app.includes("openSavedHops"),"Saved itineraries must remain available");
assert(app.includes("serviceWorker.register"),"Offline app support must remain registered");
assert(styles.includes("prefers-reduced-motion"),"Reduced-motion preferences must be respected");
assert.equal(manifest.display,"standalone","The installable app must open standalone");
assert(serviceWorker.includes("op-shop-hop-v2.2.0"),"The offline cache version must match the release");

console.log(`V2.2 smoke checks passed: ${seeds.length} fallback shops, ${ids.length} unique UI ids, installable offline shell.`);
