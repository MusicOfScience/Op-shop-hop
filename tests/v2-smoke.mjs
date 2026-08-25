import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const app=readFileSync(new URL("../app-v2.js",import.meta.url),"utf8");
const seedsSource=readFileSync(new URL("../seed-stores.js",import.meta.url),"utf8");

new vm.Script(app,{filename:"app-v2.js"});

const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,"HTML ids must be unique");

for(const id of ["map","placeList","searchMapBtn","addShopBtn","modal","locationPrompt","routeTray"]){
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

console.log(`V2 smoke checks passed: ${seeds.length} fallback shops, ${ids.length} unique UI ids.`);
