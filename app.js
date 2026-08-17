(() => {
  "use strict";

  const STORAGE_KEY = "op-shop-hop-v1";
  const CACHE_KEY = "op-shop-hop-osm-cache-v2";
  const DEFAULT_CATEGORIES = [
    {id:"clothes",name:"Clothes",mode:"always"},
    {id:"books",name:"Books",mode:"always"},
    {id:"jewellery",name:"Jewellery",mode:"always"},
    {id:"knick-knacks",name:"Knick-knacks",mode:"always"},
    {id:"music",name:"Music",mode:"always"},
    {id:"electrical",name:"Electrical",mode:"always"},
    {id:"vibe",name:"Vibe",mode:"always"},
    {id:"price",name:"Price / value",mode:"adhoc"},
    {id:"furniture",name:"Furniture / homewares",mode:"adhoc"},
    {id:"accessibility",name:"Accessibility",mode:"adhoc"},
    {id:"turnover",name:"Turnover / fresh stock",mode:"adhoc"}
  ];

  const REGION_CENTRES = [
    ["Greater Melbourne",-37.8136,144.9631,60],
    ["Geelong / Surf Coast",-38.1499,144.3617,70],
    ["Ballarat / Central Highlands",-37.5622,143.8503,85],
    ["Bendigo / Goldfields",-36.757,144.2794,90],
    ["Gippsland",-38.1953,146.5415,150],
    ["Hume / North East",-36.353,146.324,150],
    ["Goulburn / Murray",-36.382,145.399,120],
    ["Wimmera / Mallee",-36.711,142.199,190],
    ["Great South Coast",-38.382,142.484,140]
  ];

  const state = loadState();
  let shops = [...(window.OP_SHOP_SEEDS || [])];
  let filtered = [];
  const LAYER_KEY = "op-shop-hop-layers-v1";
  const ALL_LAYERS = ["opshop","books","records","vintage","cafe"];
  let activeCoverage = "inner";
  let activeLayers = loadLayers();
  let userLocation = null;
  let cafeRequestSerial = 0;
  let map = null;
  let markers = null;
  let routeLayer = null;
  let parkingMarker = null;
  let locationMarker = null;
  let routeIds = new Set();

  const $ = (id) => document.getElementById(id);

  function loadState(){
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if(parsed && parsed.profiles && parsed.activeProfileId) return parsed;
    } catch(e) {}
    const id = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`;
    return {activeProfileId:id, profiles:{[id]:{id,name:"Guest",categories:structuredCloneSafe(DEFAULT_CATEGORIES),reviews:{},favourites:[],manualShops:[],createdAt:new Date().toISOString()}}};
  }
  function structuredCloneSafe(x){return JSON.parse(JSON.stringify(x));}
  function saveState(){localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
  function profile(){return state.profiles[state.activeProfileId];}

  function init(){
    initMap();
    wireUI();
    renderProfileSelect();
    syncLayerUI();
    mergeManualShops();
    loadCachedOSM();
    refreshFilters();
    render();
    refreshOSM(false).finally(()=>{if(activeLayers.has("cafe"))refreshCafeLayer();});
  }

  function initMap(){
    map = L.map("map",{zoomControl:true}).setView([-37.8136,144.9631],11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
  }

  function wireUI(){
    document.querySelectorAll("[data-coverage]").forEach(btn=>btn.addEventListener("click",()=>{
      document.querySelectorAll("[data-coverage]").forEach(b=>b.classList.toggle("active",b===btn));
      activeCoverage = btn.dataset.coverage; render();
    }));
    ["searchInput","suburbSelect","regionSelect","sortSelect"].forEach(id=>$(id).addEventListener(id==="searchInput"?"input":"change",render));
    $("suburbSelect").addEventListener("change",()=>{$("hopSuburbBtn").disabled=!$("suburbSelect").value;});
    $("locateBtn").addEventListener("click", locateUser);
    $("locationSearchBtn").addEventListener("click", geocodeLocationSearch);
    $("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeLocationSearch();}});
    document.querySelectorAll("[data-layer]").forEach(cb=>cb.addEventListener("change",async()=>{
      const layer=cb.dataset.layer;
      cb.checked?activeLayers.add(layer):activeLayers.delete(layer);
      if(!activeLayers.size){activeLayers.add("opshop");document.querySelector('[data-layer="opshop"]').checked=true;}
      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      if(layer==="cafe"&&cb.checked) await refreshCafeLayer();
    }));
    $("allLayersBtn").addEventListener("click",async()=>{
      const allOn=ALL_LAYERS.every(x=>activeLayers.has(x));activeLayers=new Set(allOn?["opshop"]:ALL_LAYERS);
      localStorage.setItem(LAYER_KEY,JSON.stringify([...activeLayers]));syncLayerUI();render();
      if(activeLayers.has("cafe")) await refreshCafeLayer();
    });
    $("syncBtn").addEventListener("click",async()=>{await refreshOSM(true);if(activeLayers.has("cafe"))await refreshCafeLayer();});
    $("categoriesBtn").addEventListener("click",openCategorySettings);
    $("dataBtn").addEventListener("click",openDataSettings);
    $("newProfileBtn").addEventListener("click",()=>openProfileSetup(false));
    $("profileSelect").addEventListener("change",e=>{state.activeProfileId=e.target.value;saveState();routeIds.clear();render();});
    $("addShopBtn").addEventListener("click",openAddShop);
    $("hopSuburbBtn").addEventListener("click",addCurrentSuburbToHop);
    $("clearRouteBtn").addEventListener("click",()=>{routeIds.clear();clearRouteDrawing();renderRouteTray();render();});
    $("planRouteBtn").addEventListener("click",openRoutePlanner);
    $("modal").addEventListener("click",e=>{if(e.target===$("modal")) $("modal").close();});
  }

  function renderProfileSelect(){
    $("profileSelect").innerHTML = Object.values(state.profiles).map(p=>`<option value="${esc(p.id)}" ${p.id===state.activeProfileId?"selected":""}>${esc(p.name)}</option>`).join("");
  }

  function mergeManualShops(){
    Object.values(state.profiles).forEach(p=>{
      (p.manualShops||[]).forEach(s=>{if(!shops.some(x=>x.id===s.id)) shops.push(s);});
    });
  }

  function loadCachedOSM(){
    try{
      const cache=JSON.parse(localStorage.getItem(CACHE_KEY));
      if(cache?.shops?.length){ mergeOSM(cache.shops); $("dataStatus").textContent=`${cache.shops.length} OpenStreetMap records cached · refreshes automatically`; }
    }catch(e){}
  }

  async function refreshOSM(force){
    const cacheRaw=localStorage.getItem(CACHE_KEY);
    if(!force && cacheRaw){
      try{const c=JSON.parse(cacheRaw);if(Date.now()-c.savedAt<86400000) return;}catch(e){}
    }
    $("syncBtn").disabled=true; $("syncBtn").textContent="Refreshing…";
    $("dataStatus").textContent="Refreshing op shops, books, records and second-hand places across Victoria…";
    const query=`[out:json][timeout:50];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"="clothes"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="books"]["name"~"second.?hand|used|book market",i](area.vic);nwr["shop"="music"]["second_hand"~"^(yes|only)$"](area.vic);nwr["shop"="music"]["name"~"record|records|vinyl|cds",i](area.vic););out center tags;`;
    try{
      const json=await overpass(query);
      const parsed=(json.elements||[]).map(osmToShop).filter(Boolean);
      localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),shops:parsed}));
      mergeOSM(parsed); refreshFilters(); render();
      $("dataStatus").textContent=`Victoria refreshed · ${parsed.length} open-map shop records + ${window.OP_SHOP_SEEDS?.length||0} official seed records`;
    }catch(err){
      $("dataStatus").textContent="Open-map refresh failed; the official seed list and any cached shops are still available.";
    }finally{$("syncBtn").disabled=false;$("syncBtn").textContent="↻ Refresh Victoria";}
  }

  async function overpass(query){
    const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
    let lastErr;
    for(const url of endpoints){
      try{
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
        const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:`data=${encodeURIComponent(query)}`,signal:controller.signal});
        clearTimeout(timer);if(!res.ok) throw new Error(`Overpass ${res.status}`);return await res.json();
      }catch(e){lastErr=e;}
    }
    throw lastErr||new Error("No Overpass endpoint available");
  }

  function classifyLayer(t,name){
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

  function mergeOSM(osmShops){
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

  function fuzzyName(a,b){const aa=normalize(a).split(" ").filter(x=>x.length>2);const bb=normalize(b);return aa.filter(x=>bb.includes(x)).length>=Math.min(2,aa.length);}
  function normalize(s){return String(s||"").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();}
  function loadLayers(){try{const x=JSON.parse(localStorage.getItem(LAYER_KEY));if(Array.isArray(x)&&x.length)return new Set(x.filter(v=>ALL_LAYERS.includes(v)));}catch(e){}return new Set(["opshop"]);}
  function layerLabel(v){return ({opshop:"Op shop",books:"Books",records:"Records",vintage:"Vintage / second-hand",cafe:"Café"})[v]||"Place";}
  function layerGlyph(v){return ({opshop:"♻",books:"▤",records:"◉",vintage:"✦",cafe:"☕"})[v]||"•";}
  function syncLayerUI(){document.querySelectorAll("[data-layer]").forEach(cb=>cb.checked=activeLayers.has(cb.dataset.layer));const all=ALL_LAYERS.every(x=>activeLayers.has(x));$("allLayersBtn").textContent=all?"Op shops only":"Show all";const labels=[...activeLayers].map(layerLabel);$("layerHint").textContent=`${labels.join(" + ")} · combine any layers you like.`;}

  function refreshFilters(){
    const suburbs=[...new Set(shops.map(s=>s.suburb).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const current=$("suburbSelect").value;
    $("suburbSelect").innerHTML='<option value="">All suburbs</option>'+suburbs.map(x=>`<option ${x===current?"selected":""}>${esc(x)}</option>`).join("");
    const regions=[...new Set(shops.map(s=>regionFor(s)).filter(Boolean))].sort();
    const cr=$("regionSelect").value;
    $("regionSelect").innerHTML='<option value="">All regions</option>'+regions.map(x=>`<option ${x===cr?"selected":""}>${esc(x)}</option>`).join("");
  }

  function render(){
    const p=profile(); const q=normalize($("searchInput").value); const suburb=$("suburbSelect").value; const region=$("regionSelect").value;
    filtered=shops.filter(s=>{
      if(!activeLayers.has(s.layer||"opshop")) return false;
      if(!inCoverage(s,activeCoverage)) return false;
      if(suburb && s.suburb!==suburb) return false;
      if(region && regionFor(s)!==region) return false;
      const r=p.reviews[s.id]; const tags=(r?.tags||[]).join(" ");
      if(q && !normalize(`${s.name} ${s.address} ${s.suburb} ${s.operator} ${tags}`).includes(q)) return false;
      return true;
    });
    sortShops(filtered,$("sortSelect").value,p);
    renderCards(); renderMap(); renderRouteTray();
    const coverageName={inner:"Inner Melbourne · ≤15 km CBD",metro:"Greater Melbourne · ≤60 km CBD",vic:"Victoria"}[activeCoverage];
    const layerName=[...activeLayers].map(layerLabel).join(" + ");
    $("resultsTitle").textContent=suburb?`${suburb} · ${layerName}`:`${coverageName} · ${layerName}`;
    $("resultsCount").textContent=filtered.length;
  }

  function inCoverage(s,c){
    if(c==="vic") return true;
    if(s.lat==null||s.lon==null){
      const metroPostcode=Number(s.postcode)>=3000&&Number(s.postcode)<=3210;
      if(c==="metro") return metroPostcode;
      return ["Melbourne","Carlton","Fitzroy","Brunswick","Coburg","Northcote","Preston","Fairfield","Hawthorn","South Melbourne","Port Melbourne","Prahran","Windsor","Malvern","Airport West","Sunshine"].some(x=>normalize(x)===normalize(s.suburb));
    }
    const d=haversine(s.lat,s.lon,-37.8136,144.9631);return c==="inner"?d<=15:d<=60;
  }

  function sortShops(arr,mode,p){
    const score=s=>reviewAverage(p.reviews[s.id]);
    arr.sort((a,b)=>{
      if(mode==="name") return a.name.localeCompare(b.name);
      if(mode==="suburb") return (a.suburb||"zzz").localeCompare(b.suburb||"zzz")||a.name.localeCompare(b.name);
      if(mode==="distance") return distanceFromUser(a)-distanceFromUser(b);
      if(mode==="recent") return Date.parse(p.reviews[b.id]?.updatedAt||0)-Date.parse(p.reviews[a.id]?.updatedAt||0);
      return score(b)-score(a)||a.name.localeCompare(b.name);
    });
  }

  function renderCards(){
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

  function renderMap(){
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

  function renderRouteTray(){
    const selected=[...routeIds].map(id=>shopById(id)).filter(Boolean);
    $("routeCount").textContent=selected.length;
    $("routeSummary").textContent=selected.length?`· ${[...new Set(selected.map(s=>s.suburb).filter(Boolean))].slice(0,3).join(", ")}`:"";
    $("planRouteBtn").disabled=selected.length<2;
  }

  function toggleHop(id){routeIds.has(id)?routeIds.delete(id):routeIds.add(id);renderRouteTray();renderCards();}
  function addCurrentSuburbToHop(){const suburb=$("suburbSelect").value;if(!suburb)return;filtered.filter(s=>s.suburb===suburb).slice(0,12).forEach(s=>routeIds.add(s.id));renderRouteTray();renderCards();}
  function clearRouteDrawing(){if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}if(parkingMarker){map.removeLayer(parkingMarker);parkingMarker=null;}}

  function toggleFavourite(id){const p=profile();p.favourites=p.favourites||[];const i=p.favourites.indexOf(id);i>=0?p.favourites.splice(i,1):p.favourites.push(id);saveState();renderCards();}

  function reviewSearchUrl(shop){const q=[shop.name,shop.address||shop.suburb,"Victoria"].filter(Boolean).join(" ");return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;}

  function openDiscoveryNote(shop){
    const p=profile();const existing=p.reviews[shop.id]||{ratings:{},categoryNames:{},notes:"",tags:[],visitedAt:"",status:"want",updatedAt:""};const review=structuredCloneSafe(existing);const layer=shop.layer||"vintage";
    setModalTitle(`<p class="eyebrow">${esc(layerLabel(layer).toUpperCase())}</p><h2>${esc(shop.name)}</h2><div class="muted">${esc(shop.address||shop.suburb||"")}</div>`);
    const body=document.createElement("div");body.innerHTML=`<label class="field-label">Field note<textarea id="discoveryNotes" placeholder="Worth the detour? Great coffee? Strong vinyl wall? Weird book room?">${esc(review.notes||"")}</textarea></label><div class="modal-section"><label class="field-label">Hashtags<input id="discoveryTags" value="${esc((review.tags||[]).map(t=>`#${t}`).join(" "))}" placeholder="#coffee #vinyl #books #detour"></label></div><div class="modal-section form-grid"><label>Visited<input id="discoveryVisited" type="date" value="${esc(review.visitedAt||todayLocal())}"></label><label>Status<select id="discoveryStatus"><option value="visited" ${review.status==="visited"?"selected":""}>Visited</option><option value="want" ${review.status!=="visited"&&review.status!=="skip"?"selected":""}>Want to go</option><option value="skip" ${review.status==="skip"?"selected":""}>Skip for now</option></select></label></div><div class="modal-actions"><a target="_blank" rel="noopener" href="${reviewSearchUrl(shop)}"><button type="button">Check current reviews</button></a><button type="button" id="saveDiscovery" class="primary">Save note</button></div>`;
    $("modalBody").replaceChildren(body);body.querySelector("#saveDiscovery").addEventListener("click",()=>{review.notes=body.querySelector("#discoveryNotes").value.trim();review.tags=parseTags(body.querySelector("#discoveryTags").value);review.visitedAt=body.querySelector("#discoveryVisited").value;review.status=body.querySelector("#discoveryStatus").value;review.updatedAt=new Date().toISOString();p.reviews[shop.id]=review;saveState();$("modal").close();render();});$("modal").showModal();
  }

  function openReview(shop){
    const p=profile();const existing=p.reviews[shop.id]||{ratings:{},categoryNames:{},notes:"",tags:[],visitedAt:"",updatedAt:""};
    const review=structuredCloneSafe(existing);review.categoryNames=review.categoryNames||{};const categories=p.categories.filter(c=>c.mode==="always");
    const ratedIds=new Set(Object.keys(review.ratings||{}));
    p.categories.filter(c=>c.mode==="adhoc"&&ratedIds.has(c.id)).forEach(c=>{if(!categories.some(x=>x.id===c.id))categories.push(c);});
    ratedIds.forEach(id=>{if(!categories.some(c=>c.id===id)&&!p.categories.some(c=>c.id===id)&&review.categoryNames[id]) categories.push({id,name:review.categoryNames[id],mode:"oneoff"});});
    setModalTitle(`<p class="eyebrow">REVIEW</p><h2>${esc(shop.name)}</h2><div class="muted">${esc(shop.address||shop.suburb||"")}</div>`);
    const body=document.createElement("div");
    body.innerHTML=`<div id="reviewCategories"></div>
      <div class="modal-section"><div class="inline-row"><select id="adhocCategory"><option value="">Add an ad hoc category…</option>${p.categories.filter(c=>c.mode==="adhoc"&&!categories.some(x=>x.id===c.id)).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select><button type="button" id="addOtherReview">＋ One-off Other</button></div></div>
      <div class="modal-section"><label class="field-label">Notes<textarea id="reviewNotes" placeholder="The good rack is at the back; weird ceramics; pricing suddenly ambitious…">${esc(review.notes||"")}</textarea></label></div>
      <div class="modal-section"><label class="field-label">Hashtags<input id="reviewTags" value="${esc((review.tags||[]).map(t=>`#${t}`).join(" "))}" placeholder="#cheap #vinyl #chaos #designer"></label><div id="tagPreview" class="tag-row" style="margin-top:.5rem"></div><div class="muted" style="margin-top:.7rem">Your tag library</div><div id="tagLibrary" class="tag-row" style="margin-top:.35rem"></div></div>
      <div class="modal-section form-grid"><label>Visited<input id="visitedAt" type="date" value="${esc(review.visitedAt||todayLocal())}"></label><label>Shop status<select id="shopStatus"><option value="visited" ${review.status!=="want"&&review.status!=="skip"?"selected":""}>Visited</option><option value="want" ${review.status==="want"?"selected":""}>Want to go</option><option value="skip" ${review.status==="skip"?"selected":""}>Skip for now</option></select></label></div>
      <div class="modal-actions"><button type="button" id="deleteReview" class="danger">Delete review</button><button type="button" id="saveReview" class="primary">Save review</button></div>`;
    $("modalBody").replaceChildren(body);const rc=body.querySelector("#reviewCategories");
    const renderCategories=()=>{rc.innerHTML="";categories.forEach(c=>rc.appendChild(reviewCategoryEl(c,review)));};renderCategories();
    body.querySelector("#adhocCategory").addEventListener("change",e=>{const c=p.categories.find(x=>x.id===e.target.value);if(c){categories.push(c);renderCategories();e.target.querySelector(`option[value="${cssEsc(c.id)}"]`)?.remove();e.target.value="";}});
    body.querySelector("#addOtherReview").addEventListener("click",()=>{
      const name=prompt("Name this one-off review category");if(!name?.trim())return;const c={id:`other-${Date.now()}`,name:name.trim(),mode:"oneoff"};categories.push(c);review.categoryNames[c.id]=c.name;renderCategories();
    });
    const tagsInput=body.querySelector("#reviewTags");const preview=body.querySelector("#tagPreview");const library=body.querySelector("#tagLibrary");const showTags=()=>preview.innerHTML=parseTags(tagsInput.value).map(tagChip).join("");tagsInput.addEventListener("input",showTags);showTags();const knownTags=[...new Set(Object.values(p.reviews||{}).flatMap(r=>r.tags||[]))].sort();library.innerHTML=knownTags.length?knownTags.map(t=>`<button type="button" class="tag-chip" data-tag="${esc(t)}"><span class="tag-icon">${tagIcon(t)}</span>#${esc(t)}</button>`).join(""):`<span class="muted">Tags you use will collect here.</span>`;library.querySelectorAll("[data-tag]").forEach(btn=>btn.addEventListener("click",()=>{const tags=parseTags(tagsInput.value);if(!tags.includes(btn.dataset.tag)) tags.push(btn.dataset.tag);tagsInput.value=tags.map(t=>`#${t}`).join(" ");showTags();}));
    body.querySelector("#saveReview").addEventListener("click",()=>{
      review.notes=body.querySelector("#reviewNotes").value.trim();review.tags=parseTags(tagsInput.value);review.visitedAt=body.querySelector("#visitedAt").value;review.status=body.querySelector("#shopStatus").value;review.updatedAt=new Date().toISOString();review.categoryNames=review.categoryNames||{};categories.forEach(c=>review.categoryNames[c.id]=c.name);p.reviews[shop.id]=review;saveState();$("modal").close();render();
    });
    body.querySelector("#deleteReview").addEventListener("click",()=>{if(confirm("Delete this review from this profile?")){delete p.reviews[shop.id];saveState();$("modal").close();render();}});
    $("modal").showModal();
  }

  function reviewCategoryEl(c,review){
    const wrap=document.createElement("div");wrap.className="review-category";wrap.innerHTML=`<div class="review-category-head"><strong>${esc(c.name)}</strong><span class="muted" data-score>${review.ratings[c.id]?`${review.ratings[c.id]}/10`:"tap a level"}</span></div><div class="rating-dots"></div>`;
    const dots=wrap.querySelector(".rating-dots");
    for(let i=1;i<=10;i++){const b=document.createElement("button");b.type="button";b.className="rating-dot";b.textContent=i;b.setAttribute("aria-label",`${c.name} ${i} out of 10`);const update=()=>{const val=review.ratings[c.id]||0;b.classList.toggle("filled",i<=val);b.classList.toggle("current",i===val);};update();b.addEventListener("click",()=>{review.ratings[c.id]=i;wrap.querySelector("[data-score]").textContent=`${i}/10`;[...dots.children].forEach((x,j)=>{x.classList.toggle("filled",j<i);x.classList.toggle("current",j===i-1);});});dots.appendChild(b);}
    return wrap;
  }

  function openCategorySettings(){
    const p=profile();setModalTitle(`<p class="eyebrow">YOUR REVIEW FORM</p><h2>What deserves a score?</h2><div class="muted">Always = every review · Ad hoc = available when wanted · Hidden = out of the way.</div>`);
    const body=document.createElement("div");body.innerHTML=`<div id="catRows"></div><div class="modal-actions"><button type="button" id="resetCats">Reset defaults</button><button type="button" id="addCat">＋ Add category</button><button type="button" id="saveCats" class="primary">Save setup</button></div>`;$("modalBody").replaceChildren(body);
    let cats=structuredCloneSafe(p.categories);const rows=body.querySelector("#catRows");
    const redraw=()=>{rows.innerHTML="";cats.forEach((c,idx)=>{const row=document.createElement("div");row.className="category-row";row.innerHTML=`<input aria-label="Category name" value="${esc(c.name)}"><select aria-label="Category behaviour"><option value="always" ${c.mode==="always"?"selected":""}>Always</option><option value="adhoc" ${c.mode==="adhoc"?"selected":""}>Ad hoc</option><option value="hidden" ${c.mode==="hidden"?"selected":""}>Hidden</option></select><button class="category-delete danger" type="button">Delete</button>`;row.querySelector("input").addEventListener("input",e=>cats[idx].name=e.target.value);row.querySelector("select").addEventListener("change",e=>cats[idx].mode=e.target.value);row.querySelector("button").addEventListener("click",()=>{cats.splice(idx,1);redraw();});rows.appendChild(row);});};redraw();
    body.querySelector("#addCat").addEventListener("click",()=>{cats.push({id:`custom-${Date.now()}`,name:"New category",mode:"adhoc"});redraw();});
    body.querySelector("#resetCats").addEventListener("click",()=>{cats=structuredCloneSafe(DEFAULT_CATEGORIES);redraw();});
    body.querySelector("#saveCats").addEventListener("click",()=>{p.categories=cats.filter(c=>c.name.trim()).map(c=>({...c,name:c.name.trim()}));saveState();$("modal").close();});
    $("modal").showModal();
  }

  function openDirections(shop){
    setModalTitle(`<p class="eyebrow">DIRECTIONS</p><h2>${esc(shop.name)}</h2>`);
    const dest=shop.lat!=null?`${shop.lat},${shop.lon}`:shop.address;const encoded=encodeURIComponent(dest||shop.name);
    $("modalBody").innerHTML=`<p>${esc(shop.address||[shop.suburb,shop.postcode].filter(Boolean).join(" "))}</p><div class="inline-row"><a class="button-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${encoded}"><button type="button" class="primary">Google Maps</button></a><a target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${encoded}"><button type="button">Apple Maps</button></a>${shop.lat!=null?`<a target="_blank" rel="noopener" href="https://www.waze.com/ul?ll=${shop.lat}%2C${shop.lon}&navigate=yes"><button type="button">Waze</button></a>`:""}</div>${shop.lat!=null?`<p class="muted">${shop.lat.toFixed(5)}, ${shop.lon.toFixed(5)} · open-map coordinates</p>`:"<p class='muted'>This seed record does not yet have open-map coordinates; directions use its street address.</p>"}`;$("modal").showModal();
  }

  async function openNearby(shop){
    setModalTitle(`<p class="eyebrow">SIDE QUESTS</p><h2>Around ${esc(shop.suburb||shop.name)}</h2><div class="muted">Cafés, record/music shops and bookshops from OpenStreetMap. Review scores are deliberately not invented.</div>`);
    if(shop.lat==null){$("modalBody").innerHTML=`<p>This shop needs map coordinates before nearby discovery can run. Refresh Victoria or use its directions link.</p>`;$("modal").showModal();return;}
    $("modalBody").innerHTML='<p class="muted">Looking within 1.2 km…</p>';$("modal").showModal();
    const q=`[out:json][timeout:20];(nwr(around:1200,${shop.lat},${shop.lon})["amenity"="cafe"];nwr(around:1200,${shop.lat},${shop.lon})["shop"="books"];nwr(around:1200,${shop.lat},${shop.lon})["shop"="music"];);out center tags;`;
    try{const data=await overpass(q);const items=(data.elements||[]).map(el=>{const t=el.tags||{};const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;return {name:t.name||"Unnamed place",type:t.amenity==="cafe"?"Café":t.shop==="books"?"Bookshop":"Record / music shop",lat,lon,dist:lat!=null?haversine(shop.lat,shop.lon,lat,lon):999};}).filter(x=>x.lat!=null).sort((a,b)=>a.dist-b.dist).slice(0,15);
      $("modalBody").innerHTML=`<div class="nearby-list">${items.map(n=>`<div class="nearby-item"><div><strong>${esc(n.name)}</strong><small>${esc(n.type)} · ${Math.round(n.dist*1000)} m</small></div><div class="inline-row"><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.name+" near "+n.lat+","+n.lon)}"><button type="button">Google reviews</button></a><a target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${n.lat},${n.lon}"><button type="button">Go</button></a></div></div>`).join("")}</div><p class="muted">OpenStreetMap is used for discovery. “Google reviews” opens a search so you can judge current public ratings in the mapping app rather than Op‑Shop‑Hop copying or freezing them.</p>`;
    }catch(e){$("modalBody").innerHTML='<p>Nearby open-map lookup failed. You can still use Directions and search around the shop in your maps app.</p>';}
  }

  function openRoutePlanner(){
    const raw=[...routeIds].map(shopById).filter(s=>s?.lat!=null&&s?.lon!=null);if(raw.length<2)return;
    const ordered=nearestNeighbour(raw,userLocation);clearRouteDrawing();routeLayer=L.polyline(ordered.map(s=>[s.lat,s.lon]),{weight:4,dashArray:"7 7"}).addTo(map);map.fitBounds(routeLayer.getBounds().pad(.15));
    setModalTitle(`<p class="eyebrow">HOP PLAN</p><h2>${ordered.length} stops · approximate order</h2><div class="muted">The line is a planning aid, not street-by-street routing.</div>`);
    const origin=userLocation?`${userLocation.lat},${userLocation.lon}`:`${ordered[0].lat},${ordered[0].lon}`;const destination=`${ordered[ordered.length-1].lat},${ordered[ordered.length-1].lon}`;const waypoints=ordered.slice(1,-1).map(s=>`${s.lat},${s.lon}`).join("|");
    const g=`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=walking${waypoints?`&waypoints=${encodeURIComponent(waypoints)}`:""}`;
    $("modalBody").innerHTML=`<ol>${ordered.map(s=>`<li><strong>${esc(s.name)}</strong> <span class="muted">${esc(s.suburb||"")}</span></li>`).join("")}</ol><div class="inline-row"><a target="_blank" rel="noopener" href="${g}"><button type="button" class="primary">Open walking route in Google Maps</button></a><a target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${ordered[0].lat},${ordered[0].lon}&dirflg=w"><button type="button">Apple · first stop</button></a><a target="_blank" rel="noopener" href="https://www.waze.com/ul?ll=${ordered[0].lat}%2C${ordered[0].lon}&navigate=yes"><button type="button">Waze · drive to first stop</button></a></div><div class="modal-section"><button type="button" id="parkingBtn">P Find a sensible parking point</button><div id="parkingResult" class="muted" style="margin-top:.5rem">Uses nearby public parking mapped in OpenStreetMap and favours a central point for the selected shops.</div></div>`;
    $("modalBody").querySelector("#parkingBtn").addEventListener("click",()=>findParking(ordered));$("modal").showModal();
  }

  async function findParking(ordered){
    const centroid={lat:ordered.reduce((a,s)=>a+s.lat,0)/ordered.length,lon:ordered.reduce((a,s)=>a+s.lon,0)/ordered.length};const result=$("modalBody").querySelector("#parkingResult");result.textContent="Looking for mapped public parking…";
    const q=`[out:json][timeout:18];nwr(around:1400,${centroid.lat},${centroid.lon})["amenity"="parking"]["access"!~"^(private|no)$"];out center tags;`;
    try{const data=await overpass(q);const candidates=(data.elements||[]).map(el=>({name:el.tags?.name||"Mapped parking",lat:el.lat??el.center?.lat,lon:el.lon??el.center?.lon,access:el.tags?.access||""})).filter(x=>x.lat!=null);candidates.forEach(c=>c.score=ordered.reduce((sum,s)=>sum+haversine(c.lat,c.lon,s.lat,s.lon),0));candidates.sort((a,b)=>a.score-b.score);const best=candidates[0];if(!best){result.textContent="No public parking is mapped close enough to this hop.";return;}if(parkingMarker)map.removeLayer(parkingMarker);parkingMarker=L.marker([best.lat,best.lon]).addTo(map).bindPopup(`<strong>${esc(best.name)}</strong><br>Suggested parking search point`).openPopup();result.innerHTML=`Best mapped central candidate: <strong>${esc(best.name)}</strong>. <a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${best.lat},${best.lon}">Google</a> · <a target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${best.lat},${best.lon}">Apple</a> · <a target="_blank" rel="noopener" href="https://www.waze.com/ul?ll=${best.lat}%2C${best.lon}&navigate=yes">Waze</a>. Check restrictions/signage on arrival.`;
    }catch(e){result.textContent="Parking lookup failed; use your maps app around the first stop instead.";}
  }

  function nearestNeighbour(arr,start){const left=[...arr];const ordered=[];let current=start||left[0];if(!start){ordered.push(left.shift());current=ordered[0];}while(left.length){left.sort((a,b)=>haversine(current.lat,current.lon,a.lat,a.lon)-haversine(current.lat,current.lon,b.lat,b.lon));current=left.shift();ordered.push(current);}return ordered;}

  function openAddShop(){
    setModalTitle(`<p class="eyebrow">LOCAL ADDITION</p><h2>Add a missing shop</h2><div class="muted">Stored in this profile. Coordinates are optional; address-based directions still work.</div>`);
    $("modalBody").innerHTML=`<div class="form-grid"><label>Name<input id="newShopName"></label><label>Suburb<input id="newShopSuburb"></label><label>Address<input id="newShopAddress"></label><label>Postcode<input id="newShopPostcode" inputmode="numeric"></label><label>Latitude<input id="newShopLat" inputmode="decimal"></label><label>Longitude<input id="newShopLon" inputmode="decimal"></label></div><div class="modal-actions"><button type="button" id="saveNewShop" class="primary">Add shop</button></div>`;
    $("modalBody").querySelector("#saveNewShop").addEventListener("click",()=>{const name=$("modalBody").querySelector("#newShopName").value.trim();if(!name)return;const lat=parseFloat($("modalBody").querySelector("#newShopLat").value),lon=parseFloat($("modalBody").querySelector("#newShopLon").value);const s={id:`manual-${state.activeProfileId}-${Date.now()}`,name,suburb:$("modalBody").querySelector("#newShopSuburb").value.trim(),address:$("modalBody").querySelector("#newShopAddress").value.trim(),postcode:$("modalBody").querySelector("#newShopPostcode").value.trim(),operator:"User-added",source:"User",lat:Number.isFinite(lat)?lat:null,lon:Number.isFinite(lon)?lon:null,opening_hours:"",website:"",wheelchair:"",osm:false};profile().manualShops.push(s);shops.push(s);saveState();refreshFilters();$("modal").close();render();});
    $("modal").showModal();
  }

  function openProfileSetup(first){
    setModalTitle(`<p class="eyebrow">${first?"WELCOME":"NEW HOPPER"}</p><h2>${first?"Who is keeping these notes?":"Create another local profile"}</h2><div class="muted">Profiles separate ratings, notes, tags and favourites on this device.</div>`);
    $("modalBody").innerHTML=`<label class="field-label">Name<input id="profileName" placeholder="e.g. Noni"></label><div class="modal-actions"><button type="button" id="saveProfile" class="primary">${first?"Start hopping":"Create profile"}</button></div>`;
    $("modalBody").querySelector("#saveProfile").addEventListener("click",()=>{const name=$("modalBody").querySelector("#profileName").value.trim();if(!name)return;if(first){profile().name=name;}else{const id=crypto.randomUUID?crypto.randomUUID():`p-${Date.now()}`;state.profiles[id]={id,name,categories:structuredCloneSafe(DEFAULT_CATEGORIES),reviews:{},favourites:[],manualShops:[],createdAt:new Date().toISOString()};state.activeProfileId=id;}saveState();renderProfileSelect();$("modal").close();render();});$("modal").showModal();
  }

  function openDataSettings(){
    setModalTitle(`<p class="eyebrow">PROFILES & BACKUP</p><h2>Portable field notes</h2><div class="muted">This v1 is multi-profile on one browser. Export/import makes the data portable; shared cross-device accounts need a small backend in the next phase.</div>`);
    $("modalBody").innerHTML=`<div class="inline-row"><button type="button" id="exportBtn" class="primary">Export JSON backup</button><label><input type="file" id="importFile" accept="application/json" hidden><button type="button" id="importBtn">Import backup</button></label></div><div class="modal-section"><h3>Profiles on this device</h3>${Object.values(state.profiles).map(p=>`<div class="note-card"><strong>${esc(p.name)}</strong><div class="muted">${Object.keys(p.reviews||{}).length} reviewed shops · ${(p.favourites||[]).length} favourites</div></div>`).join("")}</div>`;
    const body=$("modalBody");body.querySelector("#exportBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`op-shop-hop-backup-${todayLocal()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});body.querySelector("#importBtn").addEventListener("click",()=>body.querySelector("#importFile").click());body.querySelector("#importFile").addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{const incoming=JSON.parse(await f.text());if(!incoming.profiles||!incoming.activeProfileId)throw new Error();localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));location.reload();}catch(err){alert("That file is not an Op-Shop-Hop backup.");}});$("modal").showModal();
  }

  function setOrigin(lat,lon,label){
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

  function locateUser(){
    if(!navigator.geolocation){alert("Location is not available in this browser.");return;}
    $("locateBtn").textContent="Locating…";
    navigator.geolocation.getCurrentPosition(pos=>{
      $("locateBtn").textContent="✓ Using my location";
      setOrigin(pos.coords.latitude,pos.coords.longitude,"your location");
    },()=>{$("locateBtn").textContent="◎ Use my location";alert("Location permission was not available. You can type a suburb, street or postcode instead.");},{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  }

  async function geocodeLocationSearch(){
    const input=$("locationSearch");const q=input.value.trim();if(!q)return;
    const btn=$("locationSearchBtn");btn.disabled=true;btn.textContent="Finding…";$("locationHint").textContent="Looking for that place…";
    try{
      const query=/victoria|\bvic\b|australia/i.test(q)?q:`${q}, Victoria, Australia`;
      const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&limit=5&addressdetails=1&q=${encodeURIComponent(query)}`;
      const res=await fetch(url,{headers:{"Accept":"application/json"}});if(!res.ok)throw new Error(`Geocoder ${res.status}`);
      const rows=await res.json();const hit=rows.find(r=>/Victoria/i.test(r.display_name||""))||rows[0];
      if(!hit){$("locationHint").textContent="Couldn’t find that place. Try a suburb plus postcode.";return;}
      const label=(hit.display_name||q).split(",").slice(0,3).join(",");setOrigin(Number(hit.lat),Number(hit.lon),label);
    }catch(e){$("locationHint").textContent="Address lookup failed just now. You can still pan the map or use your location.";}
    finally{btn.disabled=false;btn.textContent="Find";}
  }

  function osmToCafe(el){const t=el.tags||{};const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;if(lat==null||lon==null)return null;const name=(t.name||t.brand||"").trim();if(!name)return null;const suburb=t["addr:suburb"]||t["addr:place"]||t["addr:city"]||t["addr:town"]||"";const parts=[t["addr:housenumber"],t["addr:street"]].filter(Boolean).join(" ");const address=[parts,suburb,t["addr:postcode"]].filter(Boolean).join(", ");return{id:`cafe-${el.type}-${el.id}`,name,address,suburb,postcode:t["addr:postcode"]||"",operator:t.operator||t.brand||"",layer:"cafe",lat,lon,opening_hours:t.opening_hours||"",website:t.website||t["contact:website"]||"",wheelchair:t.wheelchair||"",source:"OpenStreetMap",osm:true,osmType:el.type,osmId:el.id};}

  async function refreshCafeLayer(){
    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const centre=map.getCenter();const lat=centre.lat,lon=centre.lng;$("layerHint").textContent="Finding coffee around this part of Naarm…";
    const query=`[out:json][timeout:20];nwr["amenity"="cafe"](around:3000,${lat},${lon});out center tags;`;
    try{const json=await overpass(query);if(serial!==cafeRequestSerial)return;const cafes=(json.elements||[]).map(osmToCafe).filter(Boolean);shops=shops.filter(s=>(s.layer||"opshop")!=="cafe");cafes.forEach(x=>shops.push(x));refreshFilters();syncLayerUI();render();$("layerHint").textContent=`${cafes.length} cafés around this map area · tap one to check current reviews.`;}catch(e){$("layerHint").textContent="Coffee layer couldn’t refresh just now; the other map layers are still available.";}
  }

  function regionFor(s){
    if(s.lat==null||s.lon==null){if(inCoverage(s,"metro"))return "Greater Melbourne";if(/castlemaine|epsom/i.test(s.suburb))return "Bendigo / Goldfields";if(/sale/i.test(s.suburb))return "Gippsland";return "Victoria · location pending";}
    for(const [name,lat,lon,r] of REGION_CENTRES){if(haversine(s.lat,s.lon,lat,lon)<=r)return name;}return "Regional Victoria";
  }
  function distanceFromUser(s){if(!userLocation||s.lat==null)return 99999;return haversine(userLocation.lat,userLocation.lon,s.lat,s.lon);}
  function haversine(lat1,lon1,lat2,lon2){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
  function reviewAverage(r){const vals=Object.values(r?.ratings||{}).map(Number).filter(Number.isFinite);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;}
  function parseTags(v){return [...new Set(String(v||"").split(/[\s,]+/).map(x=>x.replace(/^#+/,"").trim().toLowerCase()).filter(Boolean))].slice(0,30);}
  function tagIcon(t){const s=normalize(t);if(/book|read/.test(s))return"📚";if(/vinyl|record|music/.test(s))return"◉";if(/cloth|fashion|designer|vintage/.test(s))return"✦";if(/cheap|bargain|price/.test(s))return"$";if(/jewel/.test(s))return"◆";if(/furn|home/.test(s))return"⌂";if(/access/.test(s))return"♿";if(/chaos|weird|odd/.test(s))return"⌁";if(/good|love|fave/.test(s))return"♥";return"#";}
  function tagChip(t){return `<span class="tag-chip"><span class="tag-icon">${tagIcon(t)}</span>#${esc(t)}</span>`;}
  function shopById(id){return shops.find(s=>s.id===id);}
  function setModalTitle(html){$("modalTitle").innerHTML=html;}
  function todayLocal(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
  function cssEsc(v){return window.CSS?.escape?CSS.escape(v):String(v).replace(/[^a-zA-Z0-9_-]/g,"\\$&");}

  init();
})();
