from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text, False
    if old not in text:
        raise SystemExit(f"Expected block not found: {label}")
    return text.replace(old, new, 1), True


def replace_between(text, start, end, new_block, label):
    i = text.find(start)
    if i < 0:
        raise SystemExit(f"Start marker not found: {label}")
    j = text.find(end, i)
    if j < 0:
        raise SystemExit(f"End marker not found: {label}")
    return text[:i] + new_block + text[j:]

# ---------- index.html ----------
p = Path("index.html")
s = p.read_text(encoding="utf-8")
old = '''    <section class="map-shell map-first" aria-label="Op shop map">\n      <div id="map"></div>\n      <div class="map-note">© OpenStreetMap contributors · tap a pin to rate or note</div>\n    </section>'''
new = '''    <section class="layer-shell" aria-label="Map layers">\n      <div class="layer-head">\n        <div><p class="eyebrow">MAP LAYERS</p><strong>What are we hunting?</strong></div>\n        <button id="allLayersBtn" type="button">Show all</button>\n      </div>\n      <div class="layer-options">\n        <label class="layer-chip opshop"><input type="checkbox" data-layer="opshop" checked><span>♻</span> Op shops</label>\n        <label class="layer-chip books"><input type="checkbox" data-layer="books"><span>▤</span> Books</label>\n        <label class="layer-chip records"><input type="checkbox" data-layer="records"><span>◉</span> Records</label>\n        <label class="layer-chip vintage"><input type="checkbox" data-layer="vintage"><span>✦</span> Vintage / second-hand</label>\n        <label class="layer-chip cafe"><input type="checkbox" data-layer="cafe"><span>☕</span> Cafés</label>\n      </div>\n      <div id="layerHint" class="layer-hint">Op shops only · combine any layers you like.</div>\n    </section>\n\n    <section class="map-shell map-first" aria-label="Op shop map">\n      <div id="map"></div>\n      <div class="map-note" id="mapNote">© OpenStreetMap contributors</div>\n    </section>'''
s, _ = replace_once(s, old, new, "index layer shell")
p.write_text(s, encoding="utf-8")

# ---------- styles.css ----------
p = Path("styles.css")
s = p.read_text(encoding="utf-8")
append = r'''

/* v1.2 discovery layers */
.layer-shell{border:1px solid var(--line);border-radius:var(--radius);background:var(--paper-2);padding:.75rem .85rem;margin:.45rem 0 .7rem;box-shadow:var(--shadow)}
.layer-head{display:flex;align-items:center;justify-content:space-between;gap:.8rem}.layer-head .eyebrow{margin-bottom:.1rem}.layer-head strong{font-size:.98rem}.layer-head button{padding:.48rem .65rem;font-size:.72rem}
.layer-options{display:flex;gap:.4rem;overflow:auto;padding:.65rem 0 .35rem;scrollbar-width:none}.layer-options::-webkit-scrollbar{display:none}
.layer-chip{display:inline-flex;align-items:center;gap:.35rem;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:.48rem .64rem;background:#eee9df;font-size:.76rem;font-weight:800;cursor:pointer}.layer-chip input{appearance:none;width:0;height:0;margin:0;border:0}.layer-chip:has(input:checked){border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}.layer-chip.opshop:has(input:checked){background:var(--acid)}.layer-chip.books:has(input:checked){background:#fff}.layer-chip.records:has(input:checked){background:#e9e4ff}.layer-chip.vintage:has(input:checked){background:#ffe7dc}.layer-chip.cafe:has(input:checked){background:#eadbc6}
.layer-chip span{font-size:.9rem}.layer-hint{font-size:.7rem;color:var(--muted);padding-top:.3rem}
.osh-pin-shell{background:transparent;border:0}.osh-pin{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;border:2px solid #171717;background:#fff;box-shadow:0 4px 10px rgba(0,0,0,.2);font-size:13px;font-weight:950}.osh-pin.opshop{background:var(--acid)}.osh-pin.books{background:#fff}.osh-pin.records{background:#e9e4ff}.osh-pin.vintage{background:#ffe7dc}.osh-pin.cafe{background:#eadbc6}
.shop-type{display:inline-flex;align-items:center;gap:.25rem;font-weight:950}
@media (max-width:600px){.layer-shell{padding:.65rem;margin:.3rem 0 .55rem}.layer-head strong{font-size:.9rem}.layer-options{margin-right:-.65rem;padding-right:.65rem}.layer-chip{font-size:.72rem;padding:.45rem .58rem}}
'''
if "/* v1.2 discovery layers */" not in s:
    s += append
p.write_text(s, encoding="utf-8")

# ---------- seed-stores.js ----------
p = Path("seed-stores.js")
s = p.read_text(encoding="utf-8")
s, _ = replace_once(
    s,
    '].map((s,i)=>({...s,id:`seed-${i+1}`,lat:null,lon:null,opening_hours:"",website:"",wheelchair:"",osm:false}));',
    '].map((s,i)=>({...s,id:`seed-${i+1}`,layer:"opshop",lat:null,lon:null,opening_hours:"",website:"",wheelchair:"",osm:false}));',
    "seed layer"
)
p.write_text(s, encoding="utf-8")

# ---------- app.js ----------
p = Path("app.js")
s = p.read_text(encoding="utf-8")
s = s.replace('const CACHE_KEY = "op-shop-hop-osm-cache-v1";', 'const CACHE_KEY = "op-shop-hop-osm-cache-v2";', 1)

old = '''  let activeCoverage = "inner";\n  let userLocation = null;'''
new = '''  const LAYER_KEY = "op-shop-hop-layers-v1";\n  const ALL_LAYERS = ["opshop","books","records","vintage","cafe"];\n  let activeCoverage = "inner";\n  let activeLayers = loadLayers();\n  let userLocation = null;\n  let cafeRequestSerial = 0;'''
s, _ = replace_once(s, old, new, "layer state")

old = '''    renderProfileSelect();\n    mergeManualShops();'''
new = '''    renderProfileSelect();\n    syncLayerUI();\n    mergeManualShops();'''
s, _ = replace_once(s, old, new, "init layer ui")

old = '''    $("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeLocationSearch();}});\n    $("syncBtn").addEventListener("click",()=>refreshOSM(true));'''
new = '''    $("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeLocationSearch();}});\n    document.querySelectorAll("[data-layer]").forEach(cb=>cb.addEventListener("change",async()=>{\n      const layer=cb.dataset.layer;\n      cb.checked?activeLayers.add(layer):activeLayers.delete(layer);\n      if(!activeLayers.size){activeLayers.add("opshop");document.querySelector('[data-layer="opshop"]').checked=true;}\n      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();\n      if(layer==="cafe"&&cb.checked) await refreshCafeLayer();\n    }));\n    $("allLayersBtn").addEventListener("click",async()=>{\n      const allOn=ALL_LAYERS.every(x=>activeLayers.has(x));activeLayers=new Set(allOn?["opshop"]:ALL_LAYERS);\n      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();\n      if(activeLayers.has("cafe")) await refreshCafeLayer();\n    });\n    $("syncBtn").addEventListener("click",async()=>{await refreshOSM(true);if(activeLayers.has("cafe"))await refreshCafeLayer();});'''
s, _ = replace_once(s, old, new, "layer wiring")

# refreshOSM query + status text
s = s.replace('$("dataStatus").textContent="Looking across Victoria for charity and second-hand shops…";', '$("dataStatus").textContent="Refreshing op shops, books, records and second-hand places across Victoria…";', 1)
oldq = 'const query=`[out:json][timeout:45];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"~"^(clothes|books|furniture|variety_store|music|electronics)$"]["second_hand"~"^(yes|only)$"](area.vic););out center tags;`;'
newq = 'const query=`[out:json][timeout:50];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"="clothes"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["name"~"second.?hand|used|book market",i](area.vic);nwr["shop"="music"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="music"]["name"~"record|records|vinyl|cds",i](area.vic););out center tags;`;'
s, _ = replace_once(s, oldq, newq, "layered overpass query")

# osmToShop + merge helpers
start = '  function osmToShop(el){'
end = '  function mergeOSM(osmShops){'
new_block = r'''  function classifyLayer(t,name){
    const n=normalize(`${name} ${t.brand||""} ${t.operator||""}`);
    if(t.shop==="charity"||/\bop shop\b|op-shop|salvo|salvation army|vinnies|vincent de paul|red cross|uniting|lifeline|brotherhood|sacred heart|save the children|helping hands|rspca|epilepsy|don bosco|rotary|legacy|savers/.test(n)) return "opshop";
    if(t.shop==="books") return "books";
    if(t.shop==="music"||/record|vinyl|\bcds?\b/.test(n)) return "records";
    return "vintage";
  }

  function osmToShop(el){
    const t=el.tags||{}; const lat=el.lat??el.center?.lat; const lon=el.lon??el.center?.lon;
    if(lat==null||lon==null) return null;
    const name=(t.name||t.brand||t.operator||"").trim();
    if(!name||/^(bookshop|second[ -]?hand shop|charity shop|op shop)$/i.test(name)) return null;
    const suburb=t["addr:suburb"]||t["addr:place"]||t["addr:city"]||t["addr:town"]||t["addr:village"]||t["is_in:suburb"]||"";
    const parts=[t["addr:housenumber"],t["addr:street"]].filter(Boolean).join(" ");
    const address=[parts,suburb,t["addr:postcode"]].filter(Boolean).join(", ");
    return {id:`osm-${el.type}-${el.id}`,name,address,suburb,postcode:t["addr:postcode"]||"",operator:t.operator||t.brand||"",layer:classifyLayer(t,name),lat,lon,opening_hours:t.opening_hours||"",website:t.website||t["contact:website"]||"",wheelchair:t.wheelchair||"",source:"OpenStreetMap",osm:true,osmType:el.type,osmId:el.id};
  }

  function canonicalOrg(v){const n=normalize(v);if(/salvo|salvation army/.test(n))return"salvos";if(/vinn|vincent de paul/.test(n))return"vinnies";if(/red cross/.test(n))return"redcross";if(/sacred heart/.test(n))return"sacredheart";if(/save the children/.test(n))return"savethechildren";if(/helping hands/.test(n))return"helpinghands";if(/brotherhood/.test(n))return"brotherhood";return n;}
  function streetCore(v){const n=normalize(v).replace(/\bvic\b|\baustralia\b|\b\d{4}\b/g," ").replace(/\s+/g," ").trim();const m=n.match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)\s+(.+?\b(?:street|st|road|rd|avenue|ave|highway|hwy|lane|ln|drive|dr|crescent|cres|parade|pde))\b/);return m?m[0]:"";}
  function sameOrganisation(a,b){const aa=canonicalOrg(`${a.name||""} ${a.operator||""}`),bb=canonicalOrg(`${b.name||""} ${b.operator||""}`);return aa&&bb&&(aa===bb||aa.includes(bb)||bb.includes(aa));}

'''
s = replace_between(s, start, end, new_block, "osm parser")

start = '  function mergeOSM(osmShops){'
end = '  function fuzzyName(a,b){'
new_block = r'''  function mergeOSM(osmShops){
    const byKey=new Map();
    const key=s=>normalize(`${s.name}|${s.suburb}|${s.postcode}`);
    shops.forEach(s=>byKey.set(key(s),s));
    osmShops.forEach(o=>{
      let match=byKey.get(key(o));
      if(!match&&o.address){
        const oc=streetCore(o.address);
        if(oc) match=shops.find(s=>streetCore(s.address)===oc&&(sameOrganisation(s,o)||fuzzyName(s.name,o.name)));
      }
      if(!match&&o.suburb){match=shops.find(s=>s.lat==null&&s.suburb&&normalize(s.suburb)===normalize(o.suburb)&&(sameOrganisation(s,o)||fuzzyName(s.name,o.name)));}
      if(match){Object.assign(match,{layer:match.layer||o.layer||"opshop",lat:o.lat,lon:o.lon,opening_hours:o.opening_hours||match.opening_hours,website:o.website||match.website,wheelchair:o.wheelchair||match.wheelchair,osm:true,osmId:o.osmId,osmType:o.osmType});}
      else shops.push(o);
    });
  }

'''
s = replace_between(s, start, end, new_block, "merge osm")

# insert layer helpers after normalize
old = '  function normalize(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();}\n\n  function refreshFilters(){'
new = r'''  function normalize(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();}
  function loadLayers(){try{const x=JSON.parse(localStorage.getItem(LAYER_KEY));if(Array.isArray(x)&&x.length)return new Set(x.filter(v=>ALL_LAYERS.includes(v)));}catch(e){}return new Set(["opshop"]);}
  function layerLabel(v){return ({opshop:"Op shop",books:"Books",records:"Records",vintage:"Vintage / second-hand",cafe:"Café"})[v]||"Place";}
  function layerGlyph(v){return ({opshop:"♻",books:"▤",records:"◉",vintage:"✦",cafe:"☕"})[v]||"•";}
  function syncLayerUI(){document.querySelectorAll("[data-layer]").forEach(cb=>cb.checked=activeLayers.has(cb.dataset.layer));const all=ALL_LAYERS.every(x=>activeLayers.has(x));$("allLayersBtn").textContent=all?"Op shops only":"Show all";const labels=[...activeLayers].map(layerLabel);$("layerHint").textContent=`${labels.join(" + ")} · combine any layers you like.`;}

  function refreshFilters(){'''
s, _ = replace_once(s, old, new, "layer helpers")

# render filters by layer and layer-aware title
old = '''    filtered=shops.filter(s=>{\n      if(!inCoverage(s,activeCoverage)) return false;'''
new = '''    filtered=shops.filter(s=>{\n      if(!activeLayers.has(s.layer||"opshop")) return false;\n      if(!inCoverage(s,activeCoverage)) return false;'''
s, _ = replace_once(s, old, new, "render layer filter")
old = '''    const coverageName={inner:"Inner Melbourne · ≤15 km CBD",metro:"Greater Melbourne · ≤60 km CBD",vic:"Victoria"}[activeCoverage];\n    $("resultsTitle").textContent=suburb?`${suburb} · ${coverageName}`:coverageName;'''
new = '''    const coverageName={inner:"Inner Melbourne · ≤15 km CBD",metro:"Greater Melbourne · ≤60 km CBD",vic:"Victoria"}[activeCoverage];\n    const layerName=[...activeLayers].map(layerLabel).join(" + ");\n    $("resultsTitle").textContent=suburb?`${suburb} · ${layerName}`:`${coverageName} · ${layerName}`;'''
s, _ = replace_once(s, old, new, "render title")

# renderCards wholesale
start = '  function renderCards(){'
end = '  function renderMap(){'
new_block = r'''  function renderCards(){
    const grid=$("shopGrid"); grid.innerHTML="";
    if(!filtered.length){grid.innerHTML='<div class="empty">No places match this view. Try another layer, widen the area, or add the missing shop.</div>';return;}
    const tpl=$("shopCardTemplate"); const p=profile();
    filtered.forEach(s=>{
      const layer=s.layer||"opshop";const node=tpl.content.cloneNode(true);const card=node.querySelector(".shop-card");card.dataset.id=s.id;card.dataset.layer=layer;
      node.querySelector(".shop-meta").innerHTML=`<span class="shop-type">${layerGlyph(layer)} ${esc(layerLabel(layer))}</span> · ${esc(s.suburb||regionFor(s))}${s.operator?` · ${esc(s.operator)}`:""}`;
      node.querySelector(".shop-name").textContent=s.name;
      node.querySelector(".shop-address").textContent=s.address||[s.suburb,s.postcode].filter(Boolean).join(" ")||(s.lat!=null?"Location mapped · street address not supplied":"Address incomplete in source data");
      const r=p.reviews[s.id]; const avg=reviewAverage(r);
      if(layer==="opshop") node.querySelector(".rating-line").innerHTML=avg?`<span class="score-big">${avg.toFixed(1)}</span><span class="score-label">/10 your average<br>${Object.keys(r.ratings||{}).length} categories rated</span>`:`<span class="score-big">—</span><span class="score-label">not rated yet</span>`;
      else node.querySelector(".rating-line").innerHTML=`<span class="score-big">${layerGlyph(layer)}</span><span class="score-label">${r?.notes?"saved in your field notes":layer==="cafe"?"coffee stop · check current reviews":"side-quest stop · save a note"}</span>`;
      node.querySelector(".tag-row").innerHTML=(r?.tags||[]).slice(0,5).map(tagChip).join("");
      const fav=node.querySelector(".fav-btn");fav.textContent=(p.favourites||[]).includes(s.id)?"♥":"♡";fav.classList.toggle("is-fav",(p.favourites||[]).includes(s.id));fav.addEventListener("click",()=>toggleFavourite(s.id));
      const reviewBtn=node.querySelector(".review-btn");reviewBtn.textContent=layer==="opshop"?"Rate / note":layer==="cafe"?"Coffee note / reviews":"Save / note";reviewBtn.addEventListener("click",()=>layer==="opshop"?openReview(s):openDiscoveryNote(s));
      const hop=node.querySelector(".hop-btn");hop.textContent=routeIds.has(s.id)?"✓ In hop":"＋ Hop";hop.addEventListener("click",()=>toggleHop(s.id));
      node.querySelector(".maps-btn").addEventListener("click",()=>openDirections(s));
      node.querySelector(".nearby-btn").addEventListener("click",()=>openNearby(s));
      grid.appendChild(node);
    });
  }

'''
s = replace_between(s, start, end, new_block, "render cards")

# renderMap wholesale
start = '  function renderMap(){'
end = '  function renderRouteTray(){'
new_block = r'''  function renderMap(){
    markers.clearLayers();
    const pts=[];
    filtered.filter(s=>s.lat!=null&&s.lon!=null).forEach(s=>{
      const layer=s.layer||"opshop";const r=profile().reviews[s.id];const avg=reviewAverage(r);
      const icon=L.divIcon({className:"osh-pin-shell",html:`<span class="osh-pin ${layer}">${layerGlyph(layer)}</span>`,iconSize:[30,30],iconAnchor:[15,15]});
      const marker=L.marker([s.lat,s.lon],{icon}).addTo(markers);
      const action=layer==="opshop"?"Rate / note":layer==="cafe"?"Coffee note / reviews":"Save / note";
      marker.bindPopup(`<div class="map-popup"><strong>${esc(s.name)}</strong><small>${esc(layerLabel(layer))}${s.suburb?` · ${esc(s.suburb)}`:""}${avg&&layer==="opshop"?` · ${avg.toFixed(1)}/10`:""}</small><button type="button" data-map-action="${esc(s.id)}">${action}</button></div>`);
      marker.on("popupopen",()=>{document.querySelector(`[data-map-action="${cssEsc(s.id)}"]`)?.addEventListener("click",()=>layer==="opshop"?openReview(s):openDiscoveryNote(s));});
      pts.push([s.lat,s.lon]);
    });
    if($("mapNote")) $("mapNote").textContent=pts.length?`${pts.length} places plotted · ${[...activeLayers].map(layerLabel).join(" + ")} · © OpenStreetMap contributors`:`No mapped places in this view · © OpenStreetMap contributors`;
    if(!userLocation){
      if(pts.length&&activeCoverage!=="vic"){const bounds=L.latLngBounds(pts);if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:13,animate:false});}
      else if(activeCoverage==="vic")map.setView([-36.9,144.4],7,{animate:false});
    }
  }

'''
s = replace_between(s, start, end, new_block, "render map")

# discovery note before openReview
marker = '  function openReview(shop){'
insert = r'''  function reviewSearchUrl(shop){const q=[shop.name,shop.address||shop.suburb,"Victoria"].filter(Boolean).join(" ");return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;}

  function openDiscoveryNote(shop){
    const p=profile();const existing=p.reviews[shop.id]||{ratings:{},categoryNames:{},notes:"",tags:[],visitedAt:"",status:"want",updatedAt:""};const review=structuredCloneSafe(existing);const layer=shop.layer||"vintage";
    setModalTitle(`<p class="eyebrow">${esc(layerLabel(layer).toUpperCase())}</p><h2>${esc(shop.name)}</h2><div class="muted">${esc(shop.address||shop.suburb||"")}</div>`);
    const body=document.createElement("div");body.innerHTML=`<label class="field-label">Field note<textarea id="discoveryNotes" placeholder="Worth the detour? Great coffee? Strong vinyl wall? Weird book room?">${esc(review.notes||"")}</textarea></label><div class="modal-section"><label class="field-label">Hashtags<input id="discoveryTags" value="${esc((review.tags||[]).map(t=>`#${t}`).join(" "))}" placeholder="#coffee #vinyl #books #detour"></label></div><div class="modal-section form-grid"><label>Visited<input id="discoveryVisited" type="date" value="${esc(review.visitedAt||todayLocal())}"></label><label>Status<select id="discoveryStatus"><option value="visited" ${review.status==="visited"?"selected":""}>Visited</option><option value="want" ${review.status!=="visited"&&review.status!=="skip"?"selected":""}>Want to go</option><option value="skip" ${review.status==="skip"?"selected":""}>Skip for now</option></select></label></div><div class="modal-actions"><a target="_blank" rel="noopener" href="${reviewSearchUrl(shop)}"><button type="button">Check current reviews</button></a><button type="button" id="saveDiscovery" class="primary">Save note</button></div>`;
    $("modalBody").replaceChildren(body);body.querySelector("#saveDiscovery").addEventListener("click",()=>{review.notes=body.querySelector("#discoveryNotes").value.trim();review.tags=parseTags(body.querySelector("#discoveryTags").value);review.visitedAt=body.querySelector("#discoveryVisited").value;review.status=body.querySelector("#discoveryStatus").value;review.updatedAt=new Date().toISOString();p.reviews[shop.id]=review;saveState();$("modal").close();render();});$("modal").showModal();
  }

'''
if insert not in s:
    i=s.find(marker)
    if i<0: raise SystemExit("openReview marker missing")
    s=s[:i]+insert+s[i:]

# cafe helpers before regionFor
marker = '  function regionFor(s){'
insert = r'''  function osmToCafe(el){const t=el.tags||{};const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;if(lat==null||lon==null)return null;const name=(t.name||t.brand||"").trim();if(!name)return null;const suburb=t["addr:suburb"]||t["addr:place"]||t["addr:city"]||t["addr:town"]||"";const parts=[t["addr:housenumber"],t["addr:street"]].filter(Boolean).join(" ");const address=[parts,suburb,t["addr:postcode"]].filter(Boolean).join(", ");return{id:`cafe-${el.type}-${el.id}`,name,address,suburb,postcode:t["addr:postcode"]||"",operator:t.operator||t.brand||"",layer:"cafe",lat,lon,opening_hours:t.opening_hours||"",website:t.website||t["contact:website"]||"",wheelchair:t.wheelchair||"",source:"OpenStreetMap",osm:true,osmType:el.type,osmId:el.id};}

  async function refreshCafeLayer(){
    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const c=userLocation?{lat:userLocation.lat,lng:userLocation.lon}:map.getCenter();$("layerHint").textContent="Finding coffee around this part of Naarm…";
    const query=`[out:json][timeout:20];nwr["amenity"="cafe"](around:3000,${c.lat},${c.lng});out center tags;`;
    try{const json=await overpass(query);if(serial!==cafeRequestSerial)return;const cafes=(json.elements||[]).map(osmToCafe).filter(Boolean);shops=shops.filter(s=>(s.layer||"opshop")!=="cafe");cafes.forEach(x=>shops.push(x));refreshFilters();syncLayerUI();render();$("layerHint").textContent=`${cafes.length} cafés around this map area · tap one to check current reviews.`;}catch(e){$("layerHint").textContent="Coffee layer couldn’t refresh just now; the other map layers are still available.";}
  }

'''
if insert not in s:
    i=s.find(marker)
    if i<0: raise SystemExit("regionFor marker missing")
    s=s[:i]+insert+s[i:]

# setOrigin: refresh cafes after re-centre
old = '''    render();\n    map.setView([lat,lon],14,{animate:false});\n  }'''
new = '''    render();\n    map.setView([lat,lon],14,{animate:false});\n    if(activeLayers.has("cafe")) refreshCafeLayer();\n  }'''
s, _ = replace_once(s, old, new, "cafe after origin")

p.write_text(s, encoding="utf-8")
print("Op-Shop-Hop v1.2 layer patch applied")
