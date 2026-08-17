from pathlib import Path


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing anchor: {label}")
    return text.replace(old, new, 1)

app_path = Path("app.js")
app = app_path.read_text(encoding="utf-8")

app = rep(app,
'''  const CACHE_KEY = "op-shop-hop-osm-cache-v2";''',
'''  const CACHE_KEY = "op-shop-hop-osm-cache-v3";''',
"cache version")

app = rep(app,
'''  const LAYER_KEY = "op-shop-hop-layers-v1";
  const ALL_LAYERS = ["opshop","books","records","vintage","cafe"];
  let activeCoverage = "inner";
  let activeLayers = loadLayers();
  let userLocation = null;
  let cafeRequestSerial = 0;''',
'''  const LAYER_KEY = "op-shop-hop-layers-v1";
  const VIEW_KEY = "op-shop-hop-view-v1";
  const SAVED_FILTER_KEY = "op-shop-hop-saved-filter-v1";
  const ALL_LAYERS = ["opshop","books","records","vintage","cafe"];
  let activeCoverage = "inner";
  let activeLayers = loadLayers();
  let activeView = loadView();
  let savedFilter = localStorage.getItem(SAVED_FILTER_KEY) || "all";
  let userLocation = null;
  let followWatchId = null;
  let followMode = false;
  let cafeRequestSerial = 0;
  let discoveryRequestSerial = 0;
  let lastDiscoveryCentre = null;''',
"navigation state")

app = rep(app,
'''    renderProfileSelect();
    syncLayerUI();
    mergeManualShops();''',
'''    renderProfileSelect();
    syncLayerUI();
    syncSavedUI();
    setView(activeView);
    mergeManualShops();''',
"init view state")

app = rep(app,
'''    markers = L.layerGroup().addTo(map);
  }

  function wireUI(){''',
'''    markers = L.layerGroup().addTo(map);
    if("ResizeObserver" in window){
      new ResizeObserver(()=>requestAnimationFrame(()=>map.invalidateSize(false))).observe($("map"));
    }
    window.addEventListener("orientationchange",()=>setTimeout(()=>map.invalidateSize(false),180));
  }

  function wireUI(){''',
"map resize observer")

app = rep(app,
'''    $("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeLocationSearch();}});
    document.querySelectorAll("[data-layer]").forEach(cb=>cb.addEventListener("change",async()=>{''',
'''    $("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeLocationSearch();}});
    $("followBtn").addEventListener("click",toggleFollow);
    document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>setView(btn.dataset.view)));
    document.querySelectorAll("[data-saved]").forEach(btn=>btn.addEventListener("click",()=>{
      savedFilter=btn.dataset.saved;localStorage.setItem(SAVED_FILTER_KEY,savedFilter);syncSavedUI();render();
    }));
    $("searchMapBtn").addEventListener("click",async()=>{await refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))await refreshCafeLayer();});
    document.querySelectorAll("[data-layer]").forEach(cb=>cb.addEventListener("change",async()=>{''',
"new controls wiring")

app = rep(app,
'''      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      if(layer==="cafe"&&cb.checked) await refreshCafeLayer();
    }));''',
'''      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      if(cb.checked && (layer==="books"||layer==="records")) await refreshDiscoveryLayers(true);
      if(layer==="cafe"&&cb.checked) await refreshCafeLayer();
    }));''',
"layer discovery loading")

app = rep(app,
'''      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      if(activeLayers.has("cafe")) await refreshCafeLayer();
    });
    $("syncBtn").addEventListener("click",async()=>{await refreshOSM(true);if(activeLayers.has("cafe"))await refreshCafeLayer();});''',
'''      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      await refreshDiscoveryLayers(true);
      if(activeLayers.has("cafe")) await refreshCafeLayer();
    });
    $("syncBtn").addEventListener("click",async()=>{await refreshOSM(true);await refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))await refreshCafeLayer();});''',
"all layers and sync")

app = rep(app,
'''    const query=`[out:json][timeout:50];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"="clothes"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["name"~"second.?hand|used|book market",i](area.vic);nwr["shop"="music"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="music"]["name"~"record|records|vinyl|cds",i](area.vic););out center tags;`;''',
'''    const query=`[out:json][timeout:50];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"="clothes"]["second_hand"~"^(yes|only)$"](area.vic););out center tags;`;''',
"base OSM query")

app = rep(app,
'''  function classifyLayer(t,name){''',
'''  async function refreshDiscoveryLayers(force=false){
    if(!activeLayers.has("books")&&!activeLayers.has("records")) return;
    const centre=userLocation?{lat:userLocation.lat,lng:userLocation.lon}:map.getCenter();
    if(!force&&lastDiscoveryCentre&&haversine(centre.lat,centre.lng,lastDiscoveryCentre.lat,lastDiscoveryCentre.lon)<2)return;
    const serial=++discoveryRequestSerial;
    $("layerHint").textContent="Finding bookshops and record shops around this map…";
    const query=`[out:json][timeout:25];(nwr["shop"="books"](around:25000,${centre.lat},${centre.lng});nwr["shop"="music"](around:25000,${centre.lat},${centre.lng}););out center tags;`;
    try{
      const json=await overpass(query);if(serial!==discoveryRequestSerial)return;
      const incoming=(json.elements||[]).map(osmToShop).filter(x=>x&&(x.layer==="books"||x.layer==="records"));
      shops=shops.filter(s=>!s.discoveryLocal);
      incoming.forEach(x=>{x.discoveryLocal=true;});
      mergeOSM(incoming);lastDiscoveryCentre={lat:centre.lat,lon:centre.lng};refreshFilters();render();
      $("layerHint").textContent=`${incoming.filter(x=>x.layer==="books").length} bookshops · ${incoming.filter(x=>x.layer==="records").length} record/music shops around this map. Pan or change the start, then Search this map.`;
    }catch(e){
      $("layerHint").textContent="Local book/record discovery could not refresh just now. Op shops and cached places are still available.";
    }
  }

  function classifyLayer(t,name){''',
"local discovery loader")

app = rep(app,
'''  function syncLayerUI(){document.querySelectorAll("[data-layer]").forEach(cb=>cb.checked=activeLayers.has(cb.dataset.layer));const all=ALL_LAYERS.every(x=>activeLayers.has(x));$("allLayersBtn").textContent=all?"Op shops only":"Show all";const labels=[...activeLayers].map(layerLabel);$("layerHint").textContent=`${labels.join(" + ")} · combine any layers you like.`;}

  function refreshFilters(){''',
'''  function syncLayerUI(){document.querySelectorAll("[data-layer]").forEach(cb=>cb.checked=activeLayers.has(cb.dataset.layer));const all=ALL_LAYERS.every(x=>activeLayers.has(x));$("allLayersBtn").textContent=all?"Op shops only":"Show all";const labels=[...activeLayers].map(layerLabel);$("layerHint").textContent=`${labels.join(" + ")} · combine any layers you like.`;}
  function loadView(){const saved=localStorage.getItem(VIEW_KEY);if(["map","list","split"].includes(saved))return saved;return matchMedia("(max-width: 700px)").matches?"map":"split";}
  function setView(view){activeView=["map","list","split"].includes(view)?view:"split";localStorage.setItem(VIEW_KEY,activeView);document.body.dataset.view=activeView;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===activeView));setTimeout(()=>map?.invalidateSize(false),40);}
  function syncSavedUI(){document.querySelectorAll("[data-saved]").forEach(b=>b.classList.toggle("active",b.dataset.saved===savedFilter));}
  function passesSavedFilter(s,p){if(savedFilter==="all")return true;if(savedFilter==="loved")return (p.favourites||[]).includes(s.id);const status=p.reviews?.[s.id]?.status;return savedFilter==="want"?status==="want":savedFilter==="visited"?status==="visited":true;}
  function distanceLabel(km){return km<1?`${Math.round(km*1000)} m`:`${km<10?km.toFixed(1):Math.round(km)} km`;}

  function refreshFilters(){''',
"view and saved helpers")

app = rep(app,
'''      if(!activeLayers.has(s.layer||"opshop")) return false;
      if(!inCoverage(s,activeCoverage)) return false;''',
'''      if(!activeLayers.has(s.layer||"opshop")) return false;
      if(!passesSavedFilter(s,p)) return false;
      if(!inCoverage(s,activeCoverage)) return false;''',
"saved filter in render")

app = rep(app,
'''      if(mode==="distance") return distanceFromUser(a)-distanceFromUser(b);
      if(mode==="recent") return Date.parse(p.reviews[b.id]?.updatedAt||0)-Date.parse(p.reviews[a.id]?.updatedAt||0);''',
'''      if(mode==="distance") return distanceFromUser(a)-distanceFromUser(b);
      if(mode==="distance-desc") return distanceFromUser(b)-distanceFromUser(a);
      if(mode==="recent") return Date.parse(p.reviews[b.id]?.updatedAt||0)-Date.parse(p.reviews[a.id]?.updatedAt||0);''',
"farthest sort")

app = rep(app,
'''      node.querySelector(".shop-address").textContent=s.address||[s.suburb,s.postcode].filter(Boolean).join(" ")||(s.lat!=null?"Location mapped · street address not supplied":"Address incomplete in source data");
      const r=p.reviews[s.id]; const avg=reviewAverage(r);''',
'''      node.querySelector(".shop-address").textContent=s.address||[s.suburb,s.postcode].filter(Boolean).join(" ")||(s.lat!=null?"Location mapped · street address not supplied":"Address incomplete in source data");
      const distanceEl=node.querySelector(".shop-distance");
      if(userLocation&&s.lat!=null){distanceEl.textContent=`${distanceLabel(distanceFromUser(s))} from ${userLocation.label||"start"}`;}else{distanceEl.hidden=true;}
      const r=p.reviews[s.id]; const avg=reviewAverage(r);''',
"card distance")

app = rep(app,
'''    if(!userLocation){
      if(pts.length&&activeCoverage!=="vic"){const bounds=L.latLngBounds(pts);if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:13,animate:false});}
      else if(activeCoverage==="vic")map.setView([-36.9,144.4],7,{animate:false});
    }
  }''',
'''    if(userLocation){
      if(followMode){map.setView([userLocation.lat,userLocation.lon],15,{animate:false});}
      else{
        const nearest=filtered.filter(s=>s.lat!=null&&s.lon!=null).sort((a,b)=>distanceFromUser(a)-distanceFromUser(b)).slice(0,25);
        const frame=[[userLocation.lat,userLocation.lon],...nearest.map(s=>[s.lat,s.lon])];const bounds=L.latLngBounds(frame);if(bounds.isValid())map.fitBounds(bounds.pad(.10),{maxZoom:14,animate:false});
      }
    }else if(pts.length&&activeCoverage!=="vic"){
      const bounds=L.latLngBounds(pts);if(bounds.isValid())map.fitBounds(bounds.pad(.08),{maxZoom:13,animate:false});
    }else if(activeCoverage==="vic")map.setView([-36.9,144.4],7,{animate:false});
    requestAnimationFrame(()=>map.invalidateSize(false));
  }''',
"map framing")

old_origin = '''  function setOrigin(lat,lon,label){
    userLocation={lat,lon,label};
    if(locationMarker) map.removeLayer(locationMarker);
    locationMarker=L.circleMarker([lat,lon],{radius:8,weight:3,fillOpacity:.85}).addTo(map).bindPopup(`<strong>${esc(label||"Starting point")}</strong>`);
    map.setView([lat,lon],14,{animate:false});
    $("locationHint").textContent=label?`Starting near ${label}`:"Starting from your location";
    const cbdDistance=haversine(lat,lon,-37.8136,144.9631);
    activeCoverage=cbdDistance<=15?"inner":cbdDistance<=60?"metro":"vic";
    document.querySelectorAll("[data-coverage]").forEach(btn=>btn.classList.toggle("active",btn.dataset.coverage===activeCoverage));
    $("sortSelect").value="distance";
    render();
    map.setView([lat,lon],14,{animate:false});
    if(activeLayers.has("cafe")) refreshCafeLayer();
  }
'''
new_origin = '''  function setOrigin(lat,lon,label,opts={}){
    userLocation={lat,lon,label};
    if(locationMarker) map.removeLayer(locationMarker);
    locationMarker=L.circleMarker([lat,lon],{radius:9,weight:3,fillOpacity:.88}).addTo(map).bindPopup(`<strong>${esc(label||"Starting point")}</strong>`);
    $("locationHint").textContent=followMode?"Following your live location · distances update as you move":label?`Starting near ${label}`:"Starting from your location";
    const cbdDistance=haversine(lat,lon,-37.8136,144.9631);
    activeCoverage=cbdDistance<=15?"inner":cbdDistance<=60?"metro":"vic";
    document.querySelectorAll("[data-coverage]").forEach(btn=>btn.classList.toggle("active",btn.dataset.coverage===activeCoverage));
    $("sortSelect").value="distance";
    render();
    if(!opts.quiet){refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))refreshCafeLayer();}
  }
'''
app = rep(app, old_origin, new_origin, "origin behaviour")

app = rep(app,
'''  function locateUser(){
    if(!navigator.geolocation){alert("Location is not available in this browser.");return;}
    $("locateBtn").textContent="Locating…";
    navigator.geolocation.getCurrentPosition(pos=>{
      $("locateBtn").textContent="✓ Using my location";
      setOrigin(pos.coords.latitude,pos.coords.longitude,"your location");
    },()=>{$("locateBtn").textContent="◎ Use my location";alert("Location permission was not available. You can type a suburb, street or postcode instead.");},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }

  async function geocodeLocationSearch(){''',
'''  function locateUser(){
    if(!navigator.geolocation){alert("Location is not available in this browser.");return;}
    if(followMode)stopFollow();
    $("locateBtn").textContent="Locating…";
    navigator.geolocation.getCurrentPosition(pos=>{
      $("locateBtn").textContent="✓ Using my location";
      setOrigin(pos.coords.latitude,pos.coords.longitude,"your location");
    },()=>{$("locateBtn").textContent="◎ Use my location";alert("Location permission was not available. You can type a suburb, street or postcode instead.");},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }

  function toggleFollow(){followMode?stopFollow():startFollow();}
  function startFollow(){
    if(!navigator.geolocation){alert("Live location is not available in this browser.");return;}
    followMode=true;$("followBtn").classList.add("active");$("followBtn").textContent="● Following me";
    followWatchId=navigator.geolocation.watchPosition(pos=>{
      const lat=pos.coords.latitude,lon=pos.coords.longitude;const moved=userLocation?haversine(userLocation.lat,userLocation.lon,lat,lon):999;
      setOrigin(lat,lon,"your live location",{quiet:true});
      if(moved>.8&&activeLayers.has("cafe"))refreshCafeLayer();
      if(moved>2&&(activeLayers.has("books")||activeLayers.has("records")))refreshDiscoveryLayers(true);
    },()=>{stopFollow();alert("Live location permission was lost. You can still use a fixed starting point.");},{enableHighAccuracy:true,timeout:15000,maximumAge:10000});
  }
  function stopFollow(){if(followWatchId!=null)navigator.geolocation.clearWatch(followWatchId);followWatchId=null;followMode=false;$("followBtn").classList.remove("active");$("followBtn").textContent="● Follow me live";if(userLocation)$("locationHint").textContent=`Start fixed near ${userLocation.label||"your last location"}`;render();}

  async function geocodeLocationSearch(){''',
"live follow")

app = rep(app,
'''    const input=$("locationSearch");const q=input.value.trim();if(!q)return;
    const btn=$("locationSearchBtn");''',
'''    const input=$("locationSearch");const q=input.value.trim();if(!q)return;
    if(followMode)stopFollow();
    const btn=$("locationSearchBtn");''',
"address stops follow")

app_path.write_text(app, encoding="utf-8")

index_path = Path("index.html")
html = index_path.read_text(encoding="utf-8")
html = rep(html,
'''      <div class="locator-controls">
        <button id="locateBtn" class="primary" type="button">◎ Use my location</button>
        <div class="address-search">''',
'''      <div class="locator-controls">
        <button id="locateBtn" class="primary" type="button">◎ Use my location</button>
        <button id="followBtn" type="button">● Follow me live</button>
        <div class="address-search">''',
"follow button")

html = rep(html,
'''    <section class="map-shell map-first" aria-label="Op shop map">''',
'''    <section class="view-toolbar" aria-label="View and saved places">
      <div class="view-switch" role="group" aria-label="View">
        <button type="button" data-view="map">Map</button>
        <button type="button" data-view="list">List</button>
        <button type="button" data-view="split">Map + list</button>
      </div>
      <div class="saved-switch" role="group" aria-label="My saved map">
        <span>My map</span>
        <button type="button" data-saved="all" class="active">All</button>
        <button type="button" data-saved="loved">♥ Loved</button>
        <button type="button" data-saved="want">Want to go</button>
        <button type="button" data-saved="visited">Visited</button>
      </div>
      <button id="searchMapBtn" class="quiet-btn" type="button">↻ Search this map</button>
    </section>

    <section class="map-shell map-first" aria-label="Op shop map">''',
"view toolbar")

html = rep(html,
'''            <option value="distance">Distance from me</option>
            <option value="recent">Recently reviewed</option>''',
'''            <option value="distance">Nearest to start</option>
            <option value="distance-desc">Furthest from start</option>
            <option value="recent">Recently reviewed</option>''',
"distance sorts")

html = rep(html,
'''      <div><p class="eyebrow">SHOPS</p><h2 id="resultsTitle">Inner Melbourne</h2></div>''',
'''      <div><p class="eyebrow">PLACES</p><h2 id="resultsTitle">Inner Melbourne</h2></div>''',
"places heading")

html = rep(html,
'''          <p class="shop-address"></p>
        </div>''',
'''          <p class="shop-address"></p>
          <p class="shop-distance"></p>
        </div>''',
"distance template")
index_path.write_text(html, encoding="utf-8")

styles_path = Path("styles.css")
css = styles_path.read_text(encoding="utf-8")
css += r'''

/* v1.3 field navigation */
#map{width:100%}
.locator-controls{grid-template-columns:auto auto 1fr}
#followBtn.active{background:var(--acid);border-color:var(--ink)}
.view-toolbar{display:flex;align-items:center;justify-content:space-between;gap:.55rem;flex-wrap:wrap;margin:.45rem 0 .55rem;padding:.55rem .65rem;border:1px solid var(--line);border-radius:14px;background:var(--paper-2)}
.view-switch,.saved-switch{display:flex;align-items:center;gap:.28rem;overflow:auto;scrollbar-width:none}.view-switch::-webkit-scrollbar,.saved-switch::-webkit-scrollbar{display:none}.saved-switch span{font-size:.68rem;font-weight:900;color:var(--muted);white-space:nowrap;margin-right:.15rem}.view-switch button,.saved-switch button{padding:.45rem .58rem;font-size:.72rem;white-space:nowrap}.view-switch button.active,.saved-switch button.active{background:var(--acid);border-color:var(--ink)}
.shop-distance{margin:.28rem 0 0;font-size:.72rem;font-weight:800;color:var(--ink)}
body[data-view="list"] .map-shell{display:none}
body[data-view="map"] .filters-shell,body[data-view="map"] .results-heading,body[data-view="map"] .shop-grid{display:none}
body[data-view="map"] .map-first #map{height:min(68dvh,760px);min-height:440px}
@media(max-width:700px){
  .locator-controls{grid-template-columns:1fr 1fr}.locator-controls .address-search{grid-column:1/-1}.locator-controls>.primary,#followBtn{width:100%;font-size:.82rem;padding:.78rem .55rem}
  .view-toolbar{position:sticky;top:53px;z-index:790;padding:.42rem;background:rgba(251,248,241,.96);backdrop-filter:blur(14px)}.view-switch{order:1}.saved-switch{order:3;width:100%}#searchMapBtn{order:2;margin-left:auto}
  body[data-view="map"] .map-first{margin:.45rem 0}.map-first #map{height:58dvh;min-height:390px}
  body[data-view="list"] .layer-shell{margin-bottom:.35rem}
}
'''
styles_path.write_text(css, encoding="utf-8")
print("v1.3 navigation patch applied")
