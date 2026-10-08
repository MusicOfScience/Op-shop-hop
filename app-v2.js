(() => {
  "use strict";

  const PROFILE_KEY = "op-shop-hop-v1";
  const PREF_KEY = "op-shop-hop-v2-prefs";
  const VIC_CACHE_KEY = "op-shop-hop-v2-vic-cache-v1";
  const LOCAL_CACHE_KEY = "op-shop-hop-v2-local-cache-v1";
  const LEGACY_LAYER_KEY = "op-shop-hop-layers-v1";
  const VIC_CACHE_TTL = 7 * 86400000;

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

  const LAYERS = ["opshop","books","records","vintage","cafe"];
  const LAYER_LABEL = {opshop:"Op shops",books:"Books",records:"Records",vintage:"Vintage / second-hand",cafe:"Cafés"};
  const LAYER_SINGULAR = {opshop:"Op shop",books:"Bookshop",records:"Record shop",vintage:"Vintage / second-hand",cafe:"Café"};
  const LAYER_GLYPH = {opshop:"♻",books:"▤",records:"◉",vintage:"✦",cafe:"☕"};
  const SCOPE_LABEL = {near:"Near me",inner:"Inner Melbourne",metro:"Melbourne",vic:"Victoria"};
  const BBOX = {
    inner:[144.83,-37.91,145.09,-37.69],
    metro:[144.42,-38.30,145.78,-37.42],
    vic:[140.95,-39.25,150.15,-33.95]
  };
  const INNER_SUBURBS = new Set(["Abbotsford","Albert Park","Alphington","Ascot Vale","Brunswick","Brunswick East","Brunswick West","Burnley","Carlton","Carlton North","Clifton Hill","Collingwood","Cremorne","Fairfield","Fitzroy","Fitzroy North","Flemington","Footscray","Hawthorn","Kensington","Kingsville","Melbourne","Moonee Ponds","North Melbourne","Northcote","Parkville","Port Melbourne","Prahran","Princes Hill","Richmond","Seddon","South Melbourne","South Yarra","St Kilda","Travancore","West Melbourne","Windsor","Yarraville"]);
  const KNOWN_REGIONAL_SEED_POSTCODES = new Set(["3450","3551","3850"]);

  const state = loadProfileState();
  const prefs = loadPrefs();
  let places = (window.OP_SHOP_SEEDS || []).map(canonicalSeed);
  let filtered = [];
  let origin = prefs.locationChoice==="search"&&validCoordinates(prefs.searchOrigin)?prefs.searchOrigin:null;
  let map = null;
  let mapReady = false;
  let followWatch = null;
  let followMode = false;
  let routeIds = new Set();
  let lastNearDiscovery = null;
  let requestSerial = 0;
  let toastTimer = null;
  let mapSearchBounds = null;
  let highlightedPlaceId = null;
  let dataSnapshot = {savedAt:null,count:0,mode:"curated"};

  const $ = id => document.getElementById(id);
  const qa = sel => [...document.querySelectorAll(sel)];
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function normalize(s){return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g," ").trim();}
  const esc = s => String(s ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  function validProfileState(x){
    const record=v=>v&&typeof v==="object"&&!Array.isArray(v);
    const strings=v=>Array.isArray(v)&&v.every(t=>typeof t==="string");
    if(!record(x)||!record(x.profiles)||typeof x.activeProfileId!=="string"||!Object.hasOwn(x.profiles,x.activeProfileId))return false;
    return Object.entries(x.profiles).every(([id,p])=>record(p)&&p.id===id&&typeof p.name==="string"&&
      (p.categories==null||Array.isArray(p.categories)&&p.categories.every(c=>record(c)&&typeof c.id==="string"&&typeof c.name==="string"&&["always","adhoc","hidden"].includes(c.mode)))&&
      (p.favourites==null||strings(p.favourites))&&
      (p.manualShops==null||Array.isArray(p.manualShops)&&p.manualShops.every(v=>record(v)&&typeof v.id==="string"&&typeof v.name==="string"&&typeof v.suburb==="string"))&&
      (p.savedHops==null||Array.isArray(p.savedHops)&&p.savedHops.every(h=>record(h)&&typeof h.id==="string"&&typeof h.name==="string"&&strings(h.placeIds)&&
        (h.places==null||Array.isArray(h.places)&&h.places.every(v=>record(v)&&typeof v.id==="string"&&typeof v.name==="string"&&LAYERS.includes(v.layer)))))&&
      (p.reviews==null||record(p.reviews)&&Object.values(p.reviews).every(r=>record(r)&&
        (r.notes==null||typeof r.notes==="string")&&(r.tags==null||strings(r.tags))&&
        (r.ratings==null||record(r.ratings)&&Object.values(r.ratings).every(n=>Number.isFinite(Number(n))&&Number(n)>=0&&Number(n)<=10))&&
        (r.customRatings==null||Array.isArray(r.customRatings)&&r.customRatings.every(c=>record(c)&&typeof c.name==="string"&&Number.isFinite(Number(c.value))&&Number(c.value)>=0&&Number(c.value)<=10)))));
  }

  function loadProfileState(){
    try{
      const x = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if(validProfileState(x)){
        Object.values(x.profiles).forEach(p=>{
          p.categories ||= clone(DEFAULT_CATEGORIES); p.reviews ||= {}; p.favourites ||= []; p.manualShops ||= []; p.savedHops ||= [];
        });
        return x;
      }
    }catch(e){}
    const id = crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}`;
    return {activeProfileId:id,profiles:{[id]:{id,name:"Guest",categories:clone(DEFAULT_CATEGORIES),reviews:{},favourites:[],manualShops:[],savedHops:[],createdAt:new Date().toISOString()}}};
  }

  function loadPrefs(){
    let p={scope:"metro",radius:5,saved:"all",detailFilter:"all",mapHidden:false,locationChoice:null,sort:"distance"};
    try{Object.assign(p,JSON.parse(localStorage.getItem(PREF_KEY))||{});}catch(e){}
    if(!Array.isArray(p.layers) || !p.layers.length){
      try{const old=JSON.parse(localStorage.getItem(LEGACY_LAYER_KEY));if(Array.isArray(old)&&old.length)p.layers=old.filter(x=>LAYERS.includes(x));}catch(e){}
    }
    if(!p.layers?.length)p.layers=["opshop"];
    p.layers=p.layers.filter(x=>LAYERS.includes(x));if(!p.layers.length)p.layers=["opshop"];
    if(!Object.hasOwn(SCOPE_LABEL,p.scope))p.scope="metro";
    if(![2,5,10,25].includes(Number(p.radius)))p.radius=5;
    if(!["all","loved","want","visited"].includes(p.saved))p.saved="all";
    if(!["all","hours","website","access"].includes(p.detailFilter))p.detailFilter="all";
    if(!["distance","distance-desc","suburb","rating","name"].includes(p.sort))p.sort="suburb";
    return p;
  }

  function writeStorage(key,value){
    try{localStorage.setItem(key,JSON.stringify(value));return true;}
    catch(e){if(key.startsWith(PROFILE_KEY)){
      let alert=$("storageStatus");if(!alert){alert=document.createElement("p");alert.id="storageStatus";alert.setAttribute("role","alert");document.querySelector(".trust-strip")?.after(alert);}
      alert.textContent="Changes could not be saved on this device. Export a backup before closing.";
    }return false;}
  }
  function saveProfiles(){return writeStorage(PROFILE_KEY,state);}
  function savePrefs(){return writeStorage(PREF_KEY,prefs);}
  function syncProfilePlaces(){
    places=places.filter(p=>!p.manual&&!p.hopSnapshot);
    profile().manualShops.forEach(s=>places.push(canonicalSeed({...s,manual:true})));
    profile().savedHops.forEach(h=>(h.places||[]).forEach(s=>{
      if(!places.some(p=>p.id===s.id))places.push({...s,hopSnapshot:true});
    }));
  }
  function profile(){return state.profiles[state.activeProfileId];}

  function canonicalSeed(s){
    const suburb=String(s.suburb||"").trim();
    return {
      id:s.id,
      name:cleanSeedName(s.name,s.operator,suburb),
      rawName:s.name||"",
      operator:s.operator||"",
      layer:"opshop",
      street:streetFromAddress(s.address,suburb),
      suburb,
      postcode:String(s.postcode||"").trim(),
      lat:numberOrNull(s.lat),lon:numberOrNull(s.lon),
      opening_hours:s.opening_hours||"",website:s.website||"",wheelchair:s.wheelchair||"",
      source:s.source||"Curated list",official:!s.manual,manual:!!s.manual,osm:!!s.osm,
      checkedAt:numberOrNull(s.checkedAt),addedAt:s.addedAt||""
    };
  }

  function cleanSeedName(raw,operator,suburb){
    raw=String(raw||operator||"").trim();
    const bits=raw.split(/\s+[—–]\s+/);
    if(bits.length<2)return raw;
    const base=bits.shift().trim(), suffix=bits.join(" — ").trim();
    if(normalize(suffix)===normalize(suburb))return base;
    const nSuffix=normalize(suffix), nSuburb=normalize(suburb);
    if(nSuburb && nSuffix.startsWith(nSuburb+" ")){
      const detail=suffix.slice(suburb.length).trim();
      return detail?`${base} · ${detail}`:base;
    }
    return `${base} · ${suffix}`;
  }

  function cleanOSMName(raw,suburb){
    raw=String(raw||"").trim();if(!raw)return raw;
    const escaped=String(suburb||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    if(escaped) raw=raw.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`,"i"),"").trim();
    return raw;
  }

  function streetFromAddress(address,suburb){
    let street=String(address||"").split(",")[0].trim();
    street=street.replace(/\bVIC\b/ig,"").replace(/\b3\d{3}\b/g,"").trim();
    if(suburb && normalize(street)===normalize(suburb))return "";
    return street;
  }
  function validCoordinates(p){return p&&typeof p.lat==="number"&&typeof p.lon==="number"&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;}
  function numberOrNull(v){if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;}
  function canonicalOrg(s){const n=normalize(s);if(/salvo|salvation army/.test(n))return"salvos";if(/vinn|vincent de paul/.test(n))return"vinnies";if(/red cross/.test(n))return"redcross";if(/sacred heart/.test(n))return"sacredheart";if(/save the children/.test(n))return"savethechildren";if(/helping hands/.test(n))return"helpinghands";if(/brotherhood/.test(n))return"brotherhood";if(/epilepsy/.test(n))return"epilepsy";if(/don bosco/.test(n))return"donbosco";if(/uniting/.test(n))return"uniting";return n;}
  function streetCore(s){return normalize(s).replace(/\bstreet\b/g,"st").replace(/\broad\b/g,"rd").replace(/\bavenue\b/g,"ave").replace(/\bparade\b/g,"pde");}
  function fuzzyName(a,b){const aa=normalize(a).split(" ").filter(x=>x.length>2);const bb=normalize(b);return aa.length>0&&aa.filter(x=>bb.includes(x)).length>=Math.min(2,aa.length);}

  function classifyTags(t,name){
    const n=normalize(`${name} ${t.brand||""} ${t.operator||""}`);
    if(t.amenity==="cafe")return "cafe";
    if(t.shop==="books")return "books";
    if(t.shop==="music"||/\brecords?\b|\bvinyl\b/.test(n))return "records";
    if(t.shop==="charity"||/\bop shop\b|salvo|salvation army|vinnies|vincent de paul|red cross|uniting|lifeline|brotherhood|sacred heart|save the children|helping hands|epilepsy|don bosco|rotary|savers/.test(n))return "opshop";
    return "vintage";
  }

  function osmPlace(el){
    const t=el.tags||{};const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;
    if(lat==null||lon==null||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)return null;
    const rawName=(t.name||t.brand||t.operator||"").trim();
    if(!rawName||/^(bookshop|second[ -]?hand shop|charity shop|op shop|cafe)$/i.test(rawName))return null;
    const suburb=t["addr:suburb"]||t["addr:place"]||t["addr:city"]||t["addr:town"]||t["addr:village"]||t["is_in:suburb"]||"";
    const street=[t["addr:housenumber"],t["addr:street"]].filter(Boolean).join(" ").trim();
    return {id:`osm-${el.type}-${el.id}`,name:cleanOSMName(rawName,suburb),rawName,operator:t.operator||t.brand||"",layer:classifyTags(t,rawName),street,suburb,postcode:t["addr:postcode"]||"",lat:Number(lat),lon:Number(lon),opening_hours:t.opening_hours||"",website:t.website||t["contact:website"]||"",wheelchair:t.wheelchair||"",source:"OpenStreetMap",official:false,osm:true,checkedAt:Date.now()};
  }

  function mergePlaces(incoming){
    incoming.filter(Boolean).forEach(o=>{
      let match=places.find(p=>p.id===o.id);
      if(!match && !o.manual){
        match=places.find(p=>{
          if(p.manual||p.layer!==o.layer)return false;
          const sameName=canonicalOrg(`${p.name} ${p.operator}`)===canonicalOrg(`${o.name} ${o.operator}`)||fuzzyName(p.name,o.name);
          if(!sameName)return false;
          if(p.street&&o.street)return streetCore(p.street)===streetCore(o.street)&&
            ((p.suburb&&o.suburb&&normalize(p.suburb)===normalize(o.suburb))||
             (p.postcode&&o.postcode&&p.postcode===o.postcode)||
             (p.lat!=null&&o.lat!=null&&haversine(p.lat,p.lon,o.lat,o.lon)<.15));
          return p.lat!=null&&o.lat!=null&&haversine(p.lat,p.lon,o.lat,o.lon)<.05;
        });
      }
      if(match){
        // Same OSM identity: refresh mutable metadata rather than keeping old hours forever.
        if(match.id===o.id&&o.osm){Object.assign(match,o);return;}
        if(match.lat==null){match.lat=o.lat;match.lon=o.lon;}
        if(!match.street&&o.street)match.street=o.street;
        if(!match.suburb&&o.suburb)match.suburb=o.suburb;
        if(!match.postcode&&o.postcode)match.postcode=o.postcode;
        if(!match.opening_hours&&o.opening_hours)match.opening_hours=o.opening_hours;
        if(!match.website&&o.website)match.website=o.website;
        if(!match.wheelchair&&o.wheelchair)match.wheelchair=o.wheelchair;
        match.osm=match.osm||o.osm;
        if(o.checkedAt)match.checkedAt=Math.max(Number(match.checkedAt||0),Number(o.checkedAt));
      }else places.push(o);
    });
  }

  function displayAddress(p){
    const bits=[p.street,p.suburb,p.postcode].filter(Boolean);
    const unique=[];bits.forEach(x=>{if(!unique.some(y=>normalize(y)===normalize(x)))unique.push(x);});
    if(p.street)return {text:unique.join(" · "),missing:false};
    if(p.suburb)return {text:`${[p.suburb,p.postcode].filter(Boolean).join(" · ")} · address not listed`,missing:true};
    return {text:"Address not listed",missing:true};
  }

  function sourceLabel(p){
    if(p.manual)return "Added by you";
    if(p.official&&p.osm)return "Curated + open map";
    if(p.official)return "Curated starting list";
    return "OpenStreetMap";
  }
  function sourceNote(p){
    if(p.manual)return "This listing belongs to your current hopper profile and is included in exported backups.";
    if(p.official&&p.osm)return "A curated listing enriched with current public OpenStreetMap details. Confirm hours before making a special trip.";
    if(p.official)return "Part of the app’s curated starting list. Live map data may add coordinates, hours and web details when available.";
    return "Discovered from community-maintained OpenStreetMap data. Details can change, so confirm important information with the venue.";
  }
  function safeUrl(value){
    if(!value)return "";
    try{const u=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return /^https?:$/.test(u.protocol)?u.href:"";}catch(e){return "";}
  }
  function dateLabel(value){
    if(!value)return "Not recorded";
    const d=new Date(Number(value)||value);if(Number.isNaN(d.getTime()))return "Not recorded";
    const days=Math.floor((Date.now()-d.getTime())/86400000);if(days<=0)return "Today";if(days===1)return "Yesterday";if(days<14)return `${days} days ago`;
    return d.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
  }
  function accessLabel(value){const n=normalize(value);if(n==="yes")return "Wheelchair accessible";if(n==="limited")return "Limited wheelchair access";if(n==="no")return "Not marked wheelchair accessible";return value?`Access: ${value}`:"Not listed";}
  function renderDataStatus(){
    const el=$("dataFreshness");if(!el)return;
    if(dataSnapshot.savedAt)el.textContent=`Open-map listings updated ${dateLabel(dataSnapshot.savedAt).toLowerCase()} · ${dataSnapshot.count} records cached`;
    else el.textContent=dataSnapshot.mode==="unavailable"?"Curated list available · live refresh unavailable":"Curated list ready · live map update pending";
    if(dataSnapshot.mode==="stale")el.textContent+=" · refresh unavailable; showing older listings";
  }

  function haversine(aLat,aLon,bLat,bLon){const R=6371,dLat=(bLat-aLat)*Math.PI/180,dLon=(bLon-aLon)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(a));}
  function distanceFromOrigin(p){return origin&&p.lat!=null?haversine(origin.lat,origin.lon,p.lat,p.lon):Infinity;}
  function distanceLabel(km){return km<1?`${Math.round(km*1000)} m`:`${km<10?km.toFixed(1):Math.round(km)} km`;}
  function insideBBox(p,b){return p.lon!=null&&p.lat!=null&&p.lon>=b[0]&&p.lon<=b[2]&&p.lat>=b[1]&&p.lat<=b[3];}
  function scopeContains(p){
    if(mapSearchBounds && p.lon!=null && p.lat!=null)return insideBBox(p,mapSearchBounds);
    if(mapSearchBounds)return false;
    if(prefs.scope==="near")return origin&&p.lat!=null&&distanceFromOrigin(p)<=Number(prefs.radius||5);
    if(prefs.scope==="inner")return insideBBox(p,BBOX.inner)||(!p.lat&&INNER_SUBURBS.has(p.suburb));
    if(prefs.scope==="metro")return insideBBox(p,BBOX.metro)||(!p.lat&&(p.official||p.manual)&&!KNOWN_REGIONAL_SEED_POSTCODES.has(String(p.postcode)));
    return true;
  }

  function initMap(){
    if(!window.maplibregl){showMapFallback("The map library did not load.");return;}
    try{
      map=new maplibregl.Map({
        container:"map",
        style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}},layers:[{id:"osm-base",type:"raster",source:"osm"}]},
        center:[144.9631,-37.8136],zoom:10.5,attributionControl:true
      });
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),"top-right");
    }catch(e){showMapFallback("The interactive map is unavailable on this device.");return;}
    map.on("error",e=>{if(!mapReady&&/webgl|context/i.test(String(e?.error?.message||e?.message||"")))showMapFallback("The interactive map is unavailable on this device.");});
    map.on("load",()=>{
      if(!map)return;
      mapReady=true;
      map.addSource("places",{type:"geojson",data:emptyGeoJSON()});
      map.addLayer({id:"places-circles",type:"circle",source:"places",paint:{
        "circle-radius":["case",["==",["get","loved"],true],9,7],
        "circle-color":["match",["get","layer"],"opshop","#d9ff43","books","#ffffff","records","#7564ff","vintage","#ffb394","cafe","#d7b98e","#ffffff"],
        "circle-stroke-color":"#171717","circle-stroke-width":2,"circle-opacity":.96
      }});
      map.addSource("user",{type:"geojson",data:emptyGeoJSON()});
      map.addLayer({id:"user-ring",type:"circle",source:"user",paint:{"circle-radius":11,"circle-color":"#171717","circle-opacity":.16,"circle-stroke-width":0}});
      map.addLayer({id:"user-dot",type:"circle",source:"user",paint:{"circle-radius":5,"circle-color":"#171717","circle-stroke-color":"#ffffff","circle-stroke-width":2}});
      map.on("mouseenter","places-circles",()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave","places-circles",()=>map.getCanvas().style.cursor="");
      map.on("click","places-circles",e=>{
        const f=e.features?.[0];if(!f)return;const p=placeById(f.properties.id);if(!p)return;
        const a=displayAddress(p);
        highlightedPlaceId=p.id;paintHighlightedCard();
        const html=`<div class="map-popup"><strong>${esc(p.name)}</strong><small>${esc(LAYER_SINGULAR[p.layer])} · ${esc(a.text)}</small><div class="map-popup-actions"><button type="button" class="primary" data-popup-details="${esc(p.id)}">Details</button><button type="button" data-popup-list="${esc(p.id)}">Show in list</button><button type="button" data-popup-directions="${esc(p.id)}">Directions</button><button type="button" data-popup-review="${esc(p.id)}">${p.layer==="opshop"?"Rate / note":"Save / note"}</button></div></div>`;
        const pop=new maplibregl.Popup({offset:12}).setLngLat([p.lon,p.lat]).setHTML(html).addTo(map);
        setTimeout(()=>{
          document.querySelector(`[data-popup-list="${cssEscape(p.id)}"]`)?.addEventListener("click",()=>focusPlaceCard(p.id,true));
          document.querySelector(`[data-popup-details="${cssEscape(p.id)}"]`)?.addEventListener("click",()=>{pop.remove();openDetails(p);});
          document.querySelector(`[data-popup-directions="${cssEscape(p.id)}"]`)?.addEventListener("click",()=>openDirections(p));
          document.querySelector(`[data-popup-review="${cssEscape(p.id)}"]`)?.addEventListener("click",()=>{pop.remove();openReview(p);});
        },0);
      });
      if(window.ResizeObserver)new ResizeObserver(()=>map?.resize()).observe($("map"));
      updateMapData();applyScopeView();
    });
  }

  function showMapFallback(message){
    mapReady=false;map=null;
    const host=$("map");host.classList.add("map-fallback");host.innerHTML=`<div><strong>Map unavailable</strong><span>${esc(message)} You can still search, browse, save and plan from the list.</span></div>`;
    $("mapCount").textContent="List mode";$("searchMapBtn").disabled=true;
    setStatus(`${message} The list is ready.`);
  }

  function emptyGeoJSON(){return {type:"FeatureCollection",features:[]};}
  function updateMapData(){
    if(!mapReady)return;
    const p=profile();
    const features=filtered.filter(x=>x.lat!=null&&x.lon!=null).map(x=>({type:"Feature",geometry:{type:"Point",coordinates:[x.lon,x.lat]},properties:{id:x.id,layer:x.layer,loved:(p.favourites||[]).includes(x.id)}}));
    map.getSource("places")?.setData({type:"FeatureCollection",features});
    const user=origin?{type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"Point",coordinates:[origin.lon,origin.lat]},properties:{}}]}:emptyGeoJSON();
    map.getSource("user")?.setData(user);
    $("mapCount").textContent=`${features.length} plotted`;
  }

  function applyScopeView(){
    if(!mapReady)return;
    if(prefs.scope==="near"&&origin){
      const pts=filtered.filter(p=>p.lat!=null).slice(0,30);
      const b=new maplibregl.LngLatBounds([origin.lon,origin.lat],[origin.lon,origin.lat]);pts.forEach(p=>b.extend([p.lon,p.lat]));
      if(pts.length)map.fitBounds(b,{padding:42,maxZoom:14,duration:0});else map.jumpTo({center:[origin.lon,origin.lat],zoom:13});
    }else{
      const b=BBOX[prefs.scope]||BBOX.metro;map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:24,duration:0});
    }
    setTimeout(()=>map.resize(),50);
  }

  function cssEscape(s){return window.CSS?.escape?CSS.escape(s):String(s).replace(/[^a-zA-Z0-9_-]/g,"\\$&");}
  function placeById(id){return places.find(p=>p.id===id);}

  async function overpass(query){
    const endpoints=["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"];
    let last;
    for(const url of endpoints){
      try{
        const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),query.includes("timeout:50")?55000:32000);
        try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:`data=${encodeURIComponent(query)}`,signal:controller.signal});
        if(!res.ok)throw new Error(`Overpass ${res.status}`);const data=await res.json();if(!Array.isArray(data.elements)||data.remark)throw new Error("Incomplete open-map response");return data;
        }finally{clearTimeout(timer);}
      }catch(e){last=e;}
    }
    throw last||new Error("Open-map service unavailable");
  }

  async function refreshVictoriaBase(force=false){
    try{
      const c=JSON.parse(localStorage.getItem(VIC_CACHE_KEY));
      if(c?.savedAt&&Array.isArray(c.places)&&c.places.every(x=>x&&typeof x.id==="string"&&typeof x.name==="string"&&LAYERS.includes(x.layer)&&validCoordinates(x))){
        const stale=Date.now()-c.savedAt>=VIC_CACHE_TTL;
        dataSnapshot={savedAt:c.savedAt,count:c.places.length,mode:stale?"stale":"cache"};
        mergePlaces(c.places);render();
        if(!force&&!stale){setStatus(`Using open-map listings updated ${dateLabel(c.savedAt).toLowerCase()}`);return;}
      }
    }catch(e){}
    setStatus("Refreshing Victoria’s op-shop and second-hand map…");
    const q='[out:json][timeout:50];area["ISO3166-2"="AU-VIC"]["boundary"="administrative"]->.vic;(nwr["shop"="charity"](area.vic);nwr["shop"="second_hand"](area.vic);nwr["shop"="clothes"]["second_hand"~"^(yes|only)$"](area.vic););out center tags;';
    try{
      const data=await overpass(q);const parsed=(data.elements||[]).map(osmPlace).filter(Boolean);const savedAt=Date.now();
      writeStorage(VIC_CACHE_KEY,{savedAt,places:parsed});dataSnapshot={savedAt,count:parsed.length,mode:"live"};mergePlaces(parsed);render();renderDataStatus();setStatus(`Victoria refreshed · ${parsed.length} mapped second-hand places`);
    }catch(e){dataSnapshot.mode=dataSnapshot.savedAt?"stale":"unavailable";renderDataStatus();setStatus("Using saved/curated shop data; the Victoria refresh is temporarily unavailable.");}
  }

  async function refreshListings(){
    const btn=$("refreshDataBtn");btn.disabled=true;btn.textContent="Refreshing…";
    try{await refreshVictoriaBase(true);if(prefs.scope==="near"&&origin)await discoverNear(true);else await discoverOverview();}
    finally{btn.disabled=false;btn.textContent="↻ Refresh";renderDataStatus();}
  }

  function localQueryParts(includeCafe=true){
    const q=[];
    if(prefs.layers.includes("opshop")||prefs.layers.includes("vintage")){q.push('["shop"="charity"]','["shop"="second_hand"]','["shop"="clothes"]["second_hand"~"^(yes|only)$"]');}
    if(prefs.layers.includes("books"))q.push('["shop"="books"]');
    if(prefs.layers.includes("records"))q.push('["shop"="music"]');
    if(includeCafe&&prefs.layers.includes("cafe"))q.push('["amenity"="cafe"]');
    return q;
  }

  async function discoverNear(force=false){
    if(!origin)return;
    if(!force&&lastNearDiscovery&&haversine(origin.lat,origin.lon,lastNearDiscovery.lat,lastNearDiscovery.lon)<1&&lastNearDiscovery.radius===prefs.radius&&lastNearDiscovery.layers===prefs.layers.slice().sort().join(","))return;
    const parts=localQueryParts(true);if(!parts.length)return;
    const serial=++requestSerial;const metres=Math.max(3000,Number(prefs.radius||5)*1000+1800);
    setStatus(`Finding ${prefs.layers.map(x=>LAYER_LABEL[x]).join(", ").toLowerCase()} near you…`);
    const body=parts.map(p=>`nwr(around:${metres},${origin.lat},${origin.lon})${p};`).join("");
    try{
      const data=await overpass(`[out:json][timeout:28];(${body});out center tags;`);if(serial!==requestSerial)return;
      mergePlaces((data.elements||[]).map(osmPlace).filter(Boolean));cacheLocalPlaces();lastNearDiscovery={lat:origin.lat,lon:origin.lon,radius:prefs.radius,layers:prefs.layers.slice().sort().join(",")};render();applyScopeView();setStatus(`Near me · ${filtered.length} places in this view`);
    }catch(e){if(serial!==requestSerial)return;setStatus("Local open-map discovery could not refresh just now; showing saved and official data.");}
  }

  function cacheLocalPlaces(){
    writeStorage(LOCAL_CACHE_KEY,{savedAt:Date.now(),places:places.filter(p=>p.osm&&!p.manual&&["books","records","cafe"].includes(p.layer)).slice(-2000)});
  }
  async function discoverOverview(){
    const parts=localQueryParts(false).filter(p=>p.includes('"books"')||p.includes('"music"'));
    if(!parts.length)return;
    const serial=++requestSerial,b=BBOX[prefs.scope]||BBOX.metro;
    setStatus("Finding bookshops and record shops in this area…");
    try{
      const data=await overpass(`[out:json][timeout:28];(${parts.map(p=>`nwr(${b[1]},${b[0]},${b[3]},${b[2]})${p};`).join("")});out center tags;`);
      if(serial!==requestSerial)return;
      mergePlaces(data.elements.map(osmPlace).filter(Boolean));cacheLocalPlaces();render();
      setStatus("Book and record listings refreshed · use a starting point for nearby cafés.");
    }catch(e){if(serial===requestSerial)setStatus("Book/record discovery is unavailable; showing cached places. Try a starting point for nearby discovery.");}
  }

  async function discoverMapArea(){
    if(!mapReady){toast("The interactive map is unavailable");return;}
    const b=map.getBounds(),z=map.getZoom();
    const includeCafe=z>=12.2;
    const parts=localQueryParts(includeCafe).filter(x=>!x.includes('shop"="charity')&&!x.includes('second_hand')&&!x.includes('shop"="clothes')||z>=10);
    if(!parts.length){mapSearchBounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];render();setStatus("Showing cached listings in this map area · zoom in to refresh local shops and cafés.");return;}
    const south=b.getSouth(),west=b.getWest(),north=b.getNorth(),east=b.getEast();
    setStatus(includeCafe?"Searching this map area…":"Searching this map area · cafés load when zoomed in…");
    const body=parts.map(p=>`nwr(${south},${west},${north},${east})${p};`).join("");
    try{const data=await overpass(`[out:json][timeout:25];(${body});out center tags;`);mergePlaces((data.elements||[]).map(osmPlace).filter(Boolean));mapSearchBounds=[west,south,east,north];cacheLocalPlaces();render();setStatus(`Map area refreshed · ${filtered.length} places in this view`);}catch(e){setStatus("Map-area discovery is temporarily unavailable; the previous results are unchanged.");}
  }

  function setStatus(s){$("scopeStatus").textContent=s;}

  function requestLocation({silent=false}={}){
    if(!navigator.geolocation){setStatus("Location is not available in this browser.");return Promise.reject(new Error("no geolocation"));}
    if(!silent)setStatus("Finding your location…");
    return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(async pos=>{
      mapSearchBounds=null;origin={lat:pos.coords.latitude,lon:pos.coords.longitude,label:"your location"};prefs.scope="near";prefs.locationChoice="use";savePrefs();syncControls();render();applyScopeView();resolve(origin);discoverNear(true);
    },err=>{setStatus(err.code===1?"Location is off. Search an address or browse Melbourne/Victoria.":"Couldn’t get a reliable location just now.");reject(err);},{enableHighAccuracy:true,timeout:12000,maximumAge:120000}));
  }

  function startFollow(){
    if(followWatch!=null){navigator.geolocation.clearWatch(followWatch);followWatch=null;followMode=false;$("followBtn").classList.remove("active");$("followBtn").textContent="Follow me";return;}
    if(!navigator.geolocation){toast("Location is not available");return;}
    followMode=true;$("followBtn").classList.add("active");$("followBtn").textContent="Stop following";
    followWatch=navigator.geolocation.watchPosition(pos=>{
      const next={lat:pos.coords.latitude,lon:pos.coords.longitude,label:"your location"};const moved=origin?haversine(origin.lat,origin.lon,next.lat,next.lon):99;mapSearchBounds=null;origin=next;prefs.scope="near";prefs.locationChoice="use";savePrefs();syncControls();render();if(moved>1.2)discoverNear(true);if(mapReady)map.easeTo({center:[origin.lon,origin.lat],duration:250});
    },()=>{navigator.geolocation.clearWatch(followWatch);followWatch=null;followMode=false;$("followBtn").classList.remove("active");$("followBtn").textContent="Follow me";toast("Live location stopped; try Use location or address search");},{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
  }

  let geocodeSerial=0;
  async function geocodeSearch(){
    const q=$("locationSearch").value.trim();if(!q)return;
    const serial=++geocodeSerial,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    setStatus(`Finding ${q}…`);
    try{
      const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&limit=1&q=${encodeURIComponent(q+", Victoria, Australia")}`,{headers:{"Accept":"application/json"},signal:controller.signal});
      if(!res.ok)throw new Error("geocode");const items=await res.json();if(serial!==geocodeSerial)return;if(!items.length||!validCoordinates({lat:Number(items[0].lat),lon:Number(items[0].lon)})){setStatus("I couldn’t find that place in Victoria.");return;}
      mapSearchBounds=null;origin={lat:Number(items[0].lat),lon:Number(items[0].lon),label:q};prefs.scope="near";prefs.locationChoice="search";prefs.searchOrigin=origin;savePrefs();syncControls();render();await discoverNear(true);applyScopeView();
    }catch(e){if(serial===geocodeSerial)setStatus("Address search is temporarily unavailable.");}finally{clearTimeout(timer);}
  }

  function filteredPlaces(){
    const p=profile();const q=normalize($("placeSearch")?.value||"");
    let arr=places.filter(x=>prefs.layers.includes(x.layer)&&scopeContains(x));
    if(prefs.saved==="loved")arr=arr.filter(x=>(p.favourites||[]).includes(x.id));
    if(prefs.saved==="want")arr=arr.filter(x=>p.reviews?.[x.id]?.status==="want");
    if(prefs.saved==="visited")arr=arr.filter(x=>p.reviews?.[x.id]?.status==="visited");
    if(prefs.detailFilter==="hours")arr=arr.filter(x=>x.opening_hours);
    if(prefs.detailFilter==="website")arr=arr.filter(x=>safeUrl(x.website));
    if(prefs.detailFilter==="access")arr=arr.filter(x=>x.wheelchair);
    if(q)arr=arr.filter(x=>normalize(`${x.name} ${x.street} ${x.suburb} ${x.postcode} ${x.operator} ${(p.reviews?.[x.id]?.tags||[]).join(" ")}`).includes(q));
    const mode=$("sortSelect")?.value||prefs.sort;
    const avg=x=>reviewAverage(p.reviews?.[x.id]);
    arr.sort((a,b)=>{
      if(mode==="distance")return distanceFromOrigin(a)-distanceFromOrigin(b);
      if(mode==="distance-desc")return distanceFromOrigin(b)-distanceFromOrigin(a);
      if(mode==="suburb")return (a.suburb||"zzz").localeCompare(b.suburb||"zzz")||a.name.localeCompare(b.name);
      if(mode==="rating")return avg(b)-avg(a)||a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    return arr;
  }

  function reviewAverage(r){if(!r?.ratings)return 0;const vals=Object.values(r.ratings).map(Number).filter(n=>n>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;}

  function render(){
    filtered=filteredPlaces();
    renderCards();updateMapData();renderRouteTray();
    $("resultsTitle").textContent=mapSearchBounds?"This map area":prefs.scope==="near"?(origin?`Near ${origin.label}`:"Near me"):SCOPE_LABEL[prefs.scope];
    const mapped=filtered.filter(p=>p.lat!=null).length;
    $("resultsMeta").textContent=`${filtered.length} ${filtered.length===1?"place":"places"}${mapped!==filtered.length?` · ${mapped} mapped`:""} · ${prefs.layers.map(x=>LAYER_LABEL[x]).join(" + ")}`;
    $("savedHopCount").textContent=profile().savedHops?.length||0;
    renderDataStatus();
  }

  function renderCards(){
    const host=$("placeList");const p=profile();
    if(!filtered.length){host.innerHTML=`<div class="empty"><strong>No places in this view.</strong><br>Try another layer, widen the radius, or choose a broader area.</div>`;return;}
    host.innerHTML=filtered.map(x=>{
      const addr=displayAddress(x),r=p.reviews?.[x.id],avg=reviewAverage(r),fav=(p.favourites||[]).includes(x.id),inHop=routeIds.has(x.id);
      const distance=prefs.scope==="near"&&origin&&x.lat!=null?`<p class="place-distance">${distanceLabel(distanceFromOrigin(x))} away</p>`:"";
      const rating=x.layer==="opshop"?(avg?`<div class="card-rating"><strong>${avg.toFixed(1)}</strong>/10 · ${Object.keys(r?.ratings||{}).length} criteria</div>`:`<div class="card-rating">Not rated yet</div>`):(r?.notes?`<div class="card-rating">Saved in your field notes</div>`:`<div class="card-rating">Noted as a ${LAYER_SINGULAR[x.layer].toLowerCase()}</div>`);
      const tags=(r?.tags||[]).slice(0,5).map(t=>`<span class="tag">${tagGlyph(t)} #${esc(t)}</span>`).join("");
      const trust=`<div class="trust-badges"><span class="trust-badge source">${x.manual?"✎":"✓"} ${esc(sourceLabel(x))}</span>${x.opening_hours?'<span class="trust-badge hours">◷ Hours listed</span>':""}${x.wheelchair?'<span class="trust-badge access">♿ Access info</span>':""}</div>`;
      return `<article class="place-card ${highlightedPlaceId===x.id?"highlighted":""}" data-place="${esc(x.id)}" data-layer="${esc(x.layer)}"><div class="card-head"><div class="card-copy"><div class="place-type">${LAYER_GLYPH[x.layer]} ${esc(LAYER_SINGULAR[x.layer])}</div><h3 class="place-name">${esc(x.name)}</h3><p class="place-address ${addr.missing?"missing":""}">${esc(addr.text)}</p>${distance}</div><button class="fav ${fav?"on":""}" data-action="fav" data-id="${esc(x.id)}" aria-label="${fav?"Remove from loved places":"Add to loved places"}" aria-pressed="${fav}">${fav?"♥":"♡"}</button></div>${trust}${rating}<div class="tags">${tags}</div><div class="card-actions"><button class="primary" data-action="details" data-id="${esc(x.id)}">Details</button><button data-action="review" data-id="${esc(x.id)}">${x.layer==="opshop"?"Rate / note":"Save / note"}</button><button data-action="directions" data-id="${esc(x.id)}">Directions</button><div class="more-wrap"><button class="icon" data-action="more" data-id="${esc(x.id)}" aria-label="More actions" aria-expanded="false">•••</button><div class="more-menu hidden" data-menu="${esc(x.id)}"><button data-action="directions" data-id="${esc(x.id)}">Directions</button><button data-action="map" data-id="${esc(x.id)}">Show on map</button><button data-action="hop" data-id="${esc(x.id)}">${inHop?"✓ Remove from hop":"＋ Add to hop"}</button><button data-action="around" data-id="${esc(x.id)}">Around here</button><button data-action="status-want" data-id="${esc(x.id)}">${r?.status==="want"?"✓ ":""}Want to go</button><button data-action="status-visited" data-id="${esc(x.id)}">${r?.status==="visited"?"✓ ":""}Visited</button></div></div></div></article>`;
    }).join("");
  }

  function tagGlyph(tag){const n=normalize(tag);if(/book|read/.test(n))return"▤";if(/record|vinyl|music/.test(n))return"◉";if(/coffee|cafe/.test(n))return"☕";if(/cloth|fashion/.test(n))return"✂";if(/art|craft/.test(n))return"✦";if(/cheap|value|bargain/.test(n))return"$";return"•";}

  function syncControls(){
    qa("[data-scope]").forEach(b=>{const active=!mapSearchBounds&&b.dataset.scope===prefs.scope;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    qa("[data-layer]").forEach(el=>{const on=prefs.layers.includes(el.dataset.layer);el.classList.toggle("active",on);const cb=el.querySelector("input");if(cb)cb.checked=on;});
    qa("[data-saved]").forEach(b=>{const active=b.dataset.saved===prefs.saved;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    qa("[data-detail]").forEach(b=>{const active=b.dataset.detail===(prefs.detailFilter||"all");b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active));});
    $("radiusWrap").classList.toggle("hidden",prefs.scope!=="near");$("radiusSelect").value=String(prefs.radius);
    document.body.classList.toggle("map-hidden",!!prefs.mapHidden);$("mapToggleBtn").textContent=prefs.mapHidden?"Show map":"Hide map";$("mapToggleBtn").setAttribute("aria-pressed",String(!prefs.mapHidden));
    if(origin){$("originLabel").textContent=prefs.scope==="near"?"Near me":"Location ready";$("originSub").textContent=origin.label==="your location"?"Using your current location":`Starting near ${origin.label}`;}
    else{$("originLabel").textContent="Choose a starting point";$("originSub").textContent=prefs.locationChoice==="browse"?"Browsing without location":"Use your location or search an address";}
    renderSortOptions();
  }

  function renderSortOptions(){
    const sel=$("sortSelect");if(!sel)return;const current=prefs.sort;
    const opts=prefs.scope==="near"?[['distance','Nearest'],['distance-desc','Furthest'],['rating','My rating'],['name','Name']]:[['suburb','Suburb'],['name','Name'],['rating','My rating']];
    if(!opts.some(o=>o[0]===current))prefs.sort=opts[0][0];
    sel.innerHTML=opts.map(([v,n])=>`<option value="${v}" ${v===prefs.sort?"selected":""}>${n}</option>`).join("");
  }

  async function changeScope(scope){
    if(scope==="near"&&!origin){
      $("locationPrompt").showModal();return;
    }
    mapSearchBounds=null;prefs.scope=scope;if(scope==="near")prefs.sort="distance";else if(prefs.sort.startsWith("distance"))prefs.sort="suburb";savePrefs();syncControls();render();applyScopeView();
    if(scope==="near")await discoverNear(false);
    else await discoverOverview();
  }

  function toggleLayer(layer){
    const set=new Set(prefs.layers);set.has(layer)?set.delete(layer):set.add(layer);if(!set.size)set.add("opshop");prefs.layers=[...set];savePrefs();syncControls();render();
    if(prefs.scope==="near"&&origin)discoverNear(true);else {setStatus(prefs.layers.includes("cafe")?"Choose a starting point for nearby cafés.":"Layers updated.");discoverOverview();}
  }

  function toggleFavourite(id){const p=profile();p.favourites ||= [];const i=p.favourites.indexOf(id);i>=0?p.favourites.splice(i,1):p.favourites.push(id);saveProfiles();render();}
  function setQuickStatus(id,status){const p=profile();p.reviews[id] ||= {ratings:{},notes:"",tags:[]};p.reviews[id].status=p.reviews[id].status===status?"":status;p.reviews[id].updatedAt=new Date().toISOString();saveProfiles();render();}
  function toggleHop(id){routeIds.has(id)?routeIds.delete(id):routeIds.add(id);render();}
  function renderRouteTray(){const tray=$("routeTray");const ps=[...routeIds].map(placeById).filter(Boolean);tray.classList.toggle("hidden",!ps.length);$("routeCount").textContent=ps.length;$("routeText").textContent=ps.length<2?"Add another stop to plan a hop":`${[...new Set(ps.map(x=>x.suburb).filter(Boolean))].slice(0,3).join(" · ")}`;$("planRouteBtn").disabled=ps.filter(x=>x.lat!=null).length<2;}

  function openReview(place){
    const p=profile();const existing=p.reviews?.[place.id]||{ratings:{},notes:"",tags:[],status:"",customRatings:[]};const draft=clone(existing);draft.ratings||={};draft.tags||=[];draft.customRatings||=[];
    const op=place.layer==="opshop";const cats=(p.categories||DEFAULT_CATEGORIES).filter(c=>c.mode!=="hidden");
    setModal(`${LAYER_GLYPH[place.layer]} ${place.name}`,()=>reviewHTML(place,draft,cats,op));
    const body=$("modalBody");
    body.addEventListener("input",e=>{if(e.target.id==="reviewNotes")draft.notes=e.target.value;});
    body.addEventListener("click",e=>{
      const rate=e.target.closest("[data-rate]");if(rate){const id=rate.dataset.rate,val=Number(rate.dataset.value);draft.ratings[id]=val;paintRating(body,id,val);return;}
      const customRate=e.target.closest("[data-custom-rate]");if(customRate){const idx=Number(customRate.dataset.customRate),val=Number(customRate.dataset.value);draft.customRatings[idx].value=val;renderReviewBody(place,draft,cats,op);return;}
      const status=e.target.closest("[data-review-status]");if(status){draft.status=draft.status===status.dataset.reviewStatus?"":status.dataset.reviewStatus;renderReviewBody(place,draft,cats,op);return;}
      if(e.target.id==="addOneOff"){const name=prompt("Name this one-off review category");if(name?.trim()){draft.customRatings.push({name:name.trim(),value:0});renderReviewBody(place,draft,cats,op);}return;}
      const promote=e.target.closest("[data-promote]");if(promote){const idx=Number(promote.dataset.promote),name=draft.customRatings[idx]?.name;if(name){p.categories.push({id:`custom-${Date.now()}`,name,mode:"adhoc"});saveProfiles();toast(`${name} added to your optional criteria`);}return;}
      if(e.target.id==="addTagBtn"){const inp=$("reviewTagInput");const t=cleanTag(inp.value);if(t&&!draft.tags.includes(t))draft.tags.push(t);inp.value="";renderReviewBody(place,draft,cats,op);return;}
      const lib=e.target.closest("[data-tag-lib]");if(lib){const t=lib.dataset.tagLib;if(!draft.tags.includes(t))draft.tags.push(t);renderReviewBody(place,draft,cats,op);return;}
      const rm=e.target.closest("[data-remove-tag]");if(rm){draft.tags=draft.tags.filter(t=>t!==rm.dataset.removeTag);renderReviewBody(place,draft,cats,op);return;}
      if(e.target.id==="saveReview"){draft.notes=$("reviewNotes")?.value??draft.notes??"";draft.updatedAt=new Date().toISOString();p.reviews[place.id]=draft;saveProfiles();$("modal").close();render();toast("Saved");return;}
      if(e.target.id==="currentReviews"&&place.lat!=null)window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name+" "+place.lat+","+place.lon)}`,"_blank","noopener");
    });
    $("modal").showModal();
  }

  function reviewHTML(place,draft,cats,op){
    const status=`<div class="review-status"><button data-review-status="want" class="${draft.status==="want"?"active":""}">Want to go</button><button data-review-status="visited" class="${draft.status==="visited"?"active":""}">Visited</button><button data-review-status="skip" class="${draft.status==="skip"?"active":""}">Skip</button></div>`;
    const ratings=op?cats.map(c=>ratingBlock(c.id,c.name,draft.ratings[c.id]||0,c.mode==="adhoc"?"optional":"")).join(""):"";
    const custom=op?(draft.customRatings||[]).map((c,i)=>customRatingBlock(c,i)).join(""):"";
    const lib=tagLibrary().slice(0,16).map(t=>`<button type="button" data-tag-lib="${esc(t)}">${tagGlyph(t)} #${esc(t)}</button>`).join("");
    return `<div class="dialog-copy">${esc(displayAddress(place).text)}</div>${status}${op?`<div>${ratings}${custom}</div><div class="dialog-actions" style="justify-content:flex-start"><button type="button" id="addOneOff">＋ One-off category</button></div>`:`<p class="dialog-copy">Field notes for ${esc(LAYER_SINGULAR[place.layer].toLowerCase())}. Ratings stay specific to op shops.</p>${place.layer==="cafe"?`<button type="button" id="currentReviews">Check current public reviews</button>`:""}`}<label class="field">Notes<textarea id="reviewNotes" placeholder="What did you notice?">${esc(draft.notes||"")}</textarea></label><label class="field">Hashtags<div class="tag-input"><input id="reviewTagInput" placeholder="ceramics, cheap-books, excellent-chaos…"><button type="button" id="addTagBtn">Add</button></div></label><div class="tags">${(draft.tags||[]).map(t=>`<button type="button" class="tag" data-remove-tag="${esc(t)}">${tagGlyph(t)} #${esc(t)} ×</button>`).join("")}</div>${lib?`<div class="tag-library">${lib}</div>`:""}<div class="dialog-actions"><button type="button" id="saveReview" class="primary">Save</button></div>`;
  }
  function renderReviewBody(place,draft,cats,op){const notes=$("reviewNotes")?.value;if(notes!=null)draft.notes=notes;$("modalBody").innerHTML=reviewHTML(place,draft,cats,op);}
  function ratingBlock(id,name,value,extra){return `<div class="rating-block"><div class="rating-top"><strong>${esc(name)}</strong><span>${value?value+"/10":extra||"tap to rate"}</span></div><div class="rating-scale" data-scale="${esc(id)}">${Array.from({length:10},(_,i)=>`<button type="button" data-rate="${esc(id)}" data-value="${i+1}" class="${i+1<=value?"on":""} ${i+1===value?"current":""}">${i+1}</button>`).join("")}</div></div>`;}
  function customRatingBlock(c,i){return `<div class="rating-block"><div class="rating-top"><strong>${esc(c.name)}</strong><span>${c.value?c.value+"/10":"one-off"} · <button type="button" data-promote="${i}" style="border:0;padding:0;background:transparent;text-decoration:underline;font-size:inherit">keep in my form</button></span></div><div class="rating-scale">${Array.from({length:10},(_,j)=>`<button type="button" data-custom-rate="${i}" data-value="${j+1}" class="${j+1<=Number(c.value||0)?"on":""} ${j+1===Number(c.value||0)?"current":""}">${j+1}</button>`).join("")}</div></div>`;}
  function paintRating(root,id,value){const scale=root.querySelector(`[data-scale="${cssEscape(id)}"]`);if(!scale)return;[...scale.children].forEach((b,i)=>{b.classList.toggle("on",i<value);b.classList.toggle("current",i===value-1);});const span=scale.previousElementSibling?.querySelector("span");if(span)span.textContent=`${value}/10`;}
  function cleanTag(s){return normalize(s).replace(/\s+/g,"-");}
  function tagLibrary(){const set=new Set();Object.values(profile().reviews||{}).forEach(r=>(r.tags||[]).forEach(t=>set.add(t)));return [...set].sort();}

  function openDetails(place){
    const addr=displayAddress(place),website=safeUrl(place.website),review=profile().reviews?.[place.id];
    const status={want:"Want to go",visited:"Visited",skip:"Skipped"}[review?.status]||"Not marked";
    const checked=place.checkedAt?dateLabel(place.checkedAt):(dataSnapshot.savedAt&&place.osm?dateLabel(dataSnapshot.savedAt):"Not recorded");
    setModal(place.name,()=>`<div class="detail-hero"><div class="place-type">${LAYER_GLYPH[place.layer]} ${esc(LAYER_SINGULAR[place.layer])}</div><h3>${esc(place.name)}</h3><div>${esc(addr.text)}</div></div><div class="detail-grid"><div class="detail-cell"><small>Listing source</small><strong>${esc(sourceLabel(place))}</strong></div><div class="detail-cell"><small>Last map check</small><strong>${esc(checked)}</strong></div><div class="detail-cell wide"><small>Opening hours</small><strong>${esc(place.opening_hours||"Not listed—confirm before travelling")}</strong></div><div class="detail-cell"><small>Accessibility</small><strong>${esc(accessLabel(place.wheelchair))}</strong></div><div class="detail-cell"><small>Your status</small><strong>${esc(status)}</strong></div>${place.operator?`<div class="detail-cell wide"><small>Operator</small><strong>${esc(place.operator)}</strong></div>`:""}</div><div class="data-note">${esc(sourceNote(place))}</div><div class="dialog-actions" style="justify-content:flex-start">${website?`<a class="button-link" href="${esc(website)}" target="_blank" rel="noopener">Website</a>`:""}<button type="button" id="detailDirections">Directions</button><button type="button" id="detailHop">${routeIds.has(place.id)?"Remove from hop":"＋ Add to hop"}</button><button type="button" id="detailReview" class="primary">${place.layer==="opshop"?"Rate / note":"Save / note"}</button></div>`);
    const body=$("modalBody");body.addEventListener("click",e=>{if(e.target.id==="detailDirections"){$("modal").close();openDirections(place);}if(e.target.id==="detailReview"){$("modal").close();openReview(place);}if(e.target.id==="detailHop"){toggleHop(place.id);e.target.textContent=routeIds.has(place.id)?"Remove from hop":"＋ Add to hop";toast(routeIds.has(place.id)?"Added to hop":"Removed from hop");}});$("modal").showModal();
  }

  function openDataGuide(){
    setModal("How listings work",()=>`<div class="detail-hero"><div class="place-type">DATA · PRIVACY · PRACTICALITY</div><h3>A field guide, not a promise.</h3><div>Useful information with its uncertainty left visible.</div></div><div class="detail-grid"><div class="detail-cell"><small>Curated listings</small><strong>A reliable starting set of Victorian op shops</strong></div><div class="detail-cell"><small>Open-map listings</small><strong>Community-maintained places, locations and details</strong></div><div class="detail-cell"><small>Refresh rhythm</small><strong>Cached for seven days unless you refresh manually</strong></div><div class="detail-cell"><small>Your additions</small><strong>Private to this browser and included in backups</strong></div></div><div class="data-note">Opening hours, accessibility and shop status can change. Op-Shop-Hop shows when map information was refreshed and encourages checking before a special journey. Your ratings, notes, loved places and saved hops stay on this device.</div><div class="dialog-actions"><button type="button" id="guideRefresh" class="primary">Refresh listings now</button></div>`);
    $("modalBody").addEventListener("click",e=>{if(e.target.id==="guideRefresh"){$("modal").close();refreshListings();}});$("modal").showModal();
  }

  function openDirections(p){const dest=p.lat!=null?`${p.lat},${p.lon}`:[p.street,p.suburb,p.postcode].filter(Boolean).join(" ");const enc=encodeURIComponent(dest||p.name);setModal(`Directions · ${p.name}`,()=>`<p class="dialog-copy">${esc(displayAddress(p).text)}</p><div class="dialog-actions" style="justify-content:flex-start"><a class="button-link primary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${enc}">Google Maps</a><a class="button-link" target="_blank" rel="noopener" href="https://maps.apple.com/?daddr=${enc}">Apple Maps</a>${p.lat!=null?`<a class="button-link" target="_blank" rel="noopener" href="https://www.waze.com/ul?ll=${p.lat}%2C${p.lon}&navigate=yes">Waze</a>`:""}</div>${p.lat!=null?`<p class="dialog-copy">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</p>`:""}`);$("modal").showModal();}

  async function openAround(p){
    if(p.lat==null){toast("This place needs map coordinates first");return;}
    setModal(`Around ${p.suburb||p.name}`,()=>'<p class="dialog-copy">Looking for cafés, books and records within walking distance…</p>');$("modal").showModal();
    const q=`[out:json][timeout:20];(nwr(around:1400,${p.lat},${p.lon})["amenity"="cafe"];nwr(around:1400,${p.lat},${p.lon})["shop"="books"];nwr(around:1400,${p.lat},${p.lon})["shop"="music"];);out center tags;`;
    try{const data=await overpass(q);const items=(data.elements||[]).map(osmPlace).filter(Boolean).sort((a,b)=>haversine(p.lat,p.lon,a.lat,a.lon)-haversine(p.lat,p.lon,b.lat,b.lon)).slice(0,18);$("modalBody").innerHTML=items.length?items.map(x=>`<div style="padding:.6rem 0;border-bottom:1px solid var(--line)"><strong>${esc(x.name)}</strong><div class="dialog-copy">${esc(LAYER_SINGULAR[x.layer])} · ${Math.round(haversine(p.lat,p.lon,x.lat,x.lon)*1000)} m</div><div style="margin-top:.3rem"><a class="button-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.name+" "+x.lat+","+x.lon)}">Reviews / map</a></div></div>`).join(""):'<p>No mapped side quests found nearby.</p>'; }catch(e){$("modalBody").innerHTML='<p>Nearby discovery is temporarily unavailable.</p>';}
  }

  function routeUrl(ordered,mode="walking"){
    const start=origin?`${origin.lat},${origin.lon}`:`${ordered[0].lat},${ordered[0].lon}`;const dest=`${ordered.at(-1).lat},${ordered.at(-1).lon}`;
    const mids=(origin?ordered.slice(0,-1):ordered.slice(1,-1)).map(x=>`${x.lat},${x.lon}`).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(start)}&destination=${encodeURIComponent(dest)}&travelmode=${mode}${mids?`&waypoints=${encodeURIComponent(mids)}`:""}`;
  }
  function routeDistance(ordered){let total=0,cur=origin;if(!cur&&ordered.length)cur=ordered[0];for(const stop of ordered){if(cur!==stop)total+=haversine(cur.lat,cur.lon,stop.lat,stop.lon);cur=stop;}return total;}
  function transitToFirstUrl(stop){const from=origin?`&origin=${encodeURIComponent(`${origin.lat},${origin.lon}`)}`:"";return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.lat},${stop.lon}`)}&travelmode=transit${from}`;}
  function hopSummary(ordered,name="Op-Shop-Hop"){
    return `${name}\n${ordered.map((x,i)=>`${i+1}. ${x.name} — ${displayAddress(x).text}`).join("\n")}\n${routeUrl(ordered,"walking")}`;
  }
  function openRoute(){
    const selected=[...routeIds].map(placeById).filter(Boolean),mapped=selected.filter(p=>p.lat!=null);if(mapped.length<2)return;
    const ordered=nearestNeighbour(mapped,origin),unmapped=selected.length-mapped.length,total=routeDistance(ordered);
    setModal("Your hop",()=>`<div class="detail-hero"><div class="place-type">${ordered.length} STOPS · ABOUT ${total.toFixed(total<10?1:0)} KM IN A STRAIGHT LINE</div><h3>A very good day out.</h3><div>We’ve arranged a suggested order using straight-line distances. You remain in charge of serendipity.</div></div><ol class="hop-list">${ordered.map(x=>`<li><strong>${esc(x.name)}</strong><div class="dialog-copy">${esc(displayAddress(x).text)}</div></li>`).join("")}</ol>${unmapped?`<div class="data-note">${unmapped} selected ${unmapped===1?"place is":"places are"} not included in routing because map coordinates are unavailable. You can still save the complete hop.</div>`:""}<div class="dialog-actions" style="justify-content:flex-start"><a class="button-link primary" target="_blank" rel="noopener" href="${routeUrl(ordered.slice(0,origin?4:5),"walking")}">Walk this hop</a><a class="button-link" target="_blank" rel="noopener" href="${routeUrl(ordered.slice(0,origin?4:5),"driving")}">Drive this hop</a><a class="button-link" target="_blank" rel="noopener" href="${transitToFirstUrl(ordered[0])}">Transit to first stop</a></div>${ordered.length>(origin?4:5)?`<div class="data-note">The map hand-off covers the first ${origin?4:5} stops to respect mobile waypoint limits. Continue with these individual legs:</div>${ordered.slice(1).map((stop,i)=>`<a class="button-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${ordered[i].lat},${ordered[i].lon}&destination=${stop.lat},${stop.lon}&travelmode=walking">${i+1} → ${i+2}: ${esc(stop.name)}</a>`).join(" ")}`:""}<div class="dialog-actions"><button type="button" id="copyHop">Copy itinerary</button><button type="button" id="saveHop" class="primary">Save this hop</button></div><p class="dialog-copy">This is not walking or driving distance; roads, crossings and barriers may lengthen the trip. Your mapping app calculates the actual route.</p>`);
    const body=$("modalBody");body.addEventListener("click",async e=>{if(e.target.id==="saveHop"){const name=prompt("Name this hop",[...new Set(selected.map(x=>x.suburb).filter(Boolean))].slice(0,2).join(" + ")||"My op-shop hop");if(!name?.trim())return;const p=profile();p.savedHops||=[];p.savedHops.push({id:`hop-${Date.now()}`,name:name.trim(),placeIds:[...routeIds],places:selected.map(x=>clone(x)),createdAt:new Date().toISOString()});saveProfiles();render();e.target.textContent="Saved ✓";e.target.disabled=true;toast("Hop saved");}if(e.target.id==="copyHop"){try{await navigator.clipboard.writeText(hopSummary(ordered));toast("Itinerary copied");}catch(err){toast("Copy is unavailable in this browser");}}});$("modal").showModal();
  }
  function nearestNeighbour(arr,start){const left=[...arr],out=[];let cur=start||left.shift();if(!start)out.push(cur);while(left.length){left.sort((a,b)=>haversine(cur.lat,cur.lon,a.lat,a.lon)-haversine(cur.lat,cur.lon,b.lat,b.lon));cur=left.shift();out.push(cur);}return out;}

  function openSavedHops(){
    const p=profile(),hops=p.savedHops||[];
    setModal("Saved hops",()=>hops.length?`<p class="dialog-copy">Load a saved itinerary back into the planner. Your saved hops stay in this browser and travel with exported backups.</p>${hops.slice().reverse().map(h=>{const valid=h.placeIds.map(placeById).filter(Boolean);return `<div class="saved-hop" data-saved-hop="${esc(h.id)}"><div><strong>${esc(h.name)}</strong><small>${valid.length} ${valid.length===1?"stop":"stops"} · saved ${esc(dateLabel(h.createdAt))}</small></div><div class="saved-hop-actions"><button type="button" data-load-hop="${esc(h.id)}">Load</button><button type="button" data-delete-hop="${esc(h.id)}" aria-label="Delete ${esc(h.name)}">×</button></div></div>`;}).join("")}`:'<div class="empty"><strong>No saved hops yet.</strong><br>Add two or more mapped places, plan the hop, then save it.</div>');
    $("modalBody").addEventListener("click",e=>{const load=e.target.closest("[data-load-hop]");if(load){const h=p.savedHops.find(x=>x.id===load.dataset.loadHop);routeIds=new Set((h?.placeIds||[]).filter(id=>placeById(id)));$("modal").close();render();toast(`${h?.name||"Hop"} loaded`);return;}const del=e.target.closest("[data-delete-hop]");if(del){p.savedHops=p.savedHops.filter(x=>x.id!==del.dataset.deleteHop);saveProfiles();$("modal").close();openSavedHops();render();toast("Saved hop removed");}});$("modal").showModal();
  }

  function focusPlaceCard(id,scroll=false){
    highlightedPlaceId=id;paintHighlightedCard();
    const card=document.querySelector(`[data-place="${cssEscape(id)}"]`);
    if(scroll&&card)card.scrollIntoView({behavior:"smooth",block:"center"});
  }
  function paintHighlightedCard(){qa("[data-place]").forEach(card=>card.classList.toggle("highlighted",card.dataset.place===highlightedPlaceId));}
  function showOnMap(place){
    if(!mapReady||place.lat==null){toast(place.lat==null?"This place needs map coordinates first":"The interactive map is unavailable");return;}
    prefs.mapHidden=false;savePrefs();syncControls();map.flyTo({center:[place.lon,place.lat],zoom:15});focusPlaceCard(place.id,false);$("map").scrollIntoView({behavior:"smooth",block:"center"});
  }

  function openAddShop(){
    setModal("Add a missing op shop",()=>`<p class="dialog-copy">Add a place to this hopper profile. It stays on this device and is included in your exported backup.</p><label class="field">Shop name<input id="manualName" autocomplete="organization" required></label><label class="field">Street address<input id="manualStreet" autocomplete="street-address"></label><div class="inline-fields"><label class="field">Suburb<input id="manualSuburb" autocomplete="address-level2" required></label><label class="field">Postcode<input id="manualPostcode" inputmode="numeric" maxlength="4" autocomplete="postal-code"></label></div><label class="field">Website (optional)<input id="manualWebsite" type="url" inputmode="url" placeholder="https://"></label><div class="dialog-actions"><button type="button" id="saveManualShop" class="primary">Add shop</button></div>`);
    $("modalBody").addEventListener("click",e=>{if(e.target.id==="saveManualShop")saveManualShop();});
    $("modal").showModal();setTimeout(()=>$("manualName")?.focus(),0);
  }
  async function saveManualShop(){
    const name=$("manualName").value.trim(),street=$("manualStreet").value.trim(),suburb=$("manualSuburb").value.trim(),postcode=$("manualPostcode").value.trim(),website=$("manualWebsite").value.trim();
    if(!name||!suburb){toast("Add a shop name and suburb");return;}
    if(postcode&&!/^3\d{3}$/.test(postcode)){toast("Use a four-digit Victorian postcode");return;}
    const entry={id:`manual-${Date.now()}`,name,address:[street,suburb,postcode].filter(Boolean).join(", "),suburb,postcode,operator:"",source:"Added by you",manual:true,website,addedAt:new Date().toISOString()};
    const p=profile();p.manualShops ||= [];p.manualShops.push(entry);saveProfiles();const local=canonicalSeed(entry);places.push(local);mapSearchBounds=null;$("modal").close();syncControls();render();toast("Shop added");
    if(street){
      setStatus(`Locating ${name} on the map…`);
      try{const q=[street,suburb,postcode,"Victoria","Australia"].filter(Boolean).join(", ");const res=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=au&limit=1&q=${encodeURIComponent(q)}`,{headers:{"Accept":"application/json"}});if(!res.ok)throw new Error("geocode");const hits=await res.json();if(hits.length){entry.lat=Number(hits[0].lat);entry.lon=Number(hits[0].lon);local.lat=entry.lat;local.lon=entry.lon;entry.checkedAt=Date.now();local.checkedAt=entry.checkedAt;saveProfiles();render();setStatus(`${name} added and mapped`);return;}}catch(e){}
      setStatus(`${name} added · map position could not be confirmed`);
    }
  }

  function openSettings(){
    const p=profile();const rows=(p.categories||DEFAULT_CATEGORIES).map((c,i)=>`<div class="category-row" data-cat="${i}"><input value="${esc(c.name)}" aria-label="Category name"><select><option value="always" ${c.mode==="always"?"selected":""}>Always</option><option value="adhoc" ${c.mode==="adhoc"?"selected":""}>Ad hoc</option><option value="hidden" ${c.mode==="hidden"?"selected":""}>Hidden</option></select><button type="button" data-delete-cat="${i}">×</button></div>`).join("");
    setModal("Your review form",()=>`<p class="dialog-copy">Always = shown in every op-shop review. Ad hoc = optional. Hidden = kept out of the way.</p><div class="category-settings" id="categoryRows">${rows}</div><div class="dialog-actions" style="justify-content:flex-start"><button type="button" id="addCategory">＋ Category</button><button type="button" id="resetCategories">Reset defaults</button></div><hr style="border:0;border-top:1px solid var(--line);margin:1rem 0"><h3>Profiles & backup</h3><div class="dialog-copy">Your notes remain on this device unless you export them.</div><div class="dialog-actions" style="justify-content:flex-start"><button type="button" id="exportData">Export JSON</button><button type="button" id="exportRecovery">Export pre-import recovery</button><label><input type="file" id="importData" accept="application/json" hidden><button type="button" id="importDataBtn">Import JSON</button></label></div><div class="dialog-actions"><button type="button" id="saveSettings" class="primary">Save settings</button></div>`);
    const body=$("modalBody");let cats=clone(p.categories||DEFAULT_CATEGORIES);
    const redraw=()=>{body.querySelector("#categoryRows").innerHTML=cats.map((c,i)=>`<div class="category-row" data-cat="${i}"><input value="${esc(c.name)}"><select><option value="always" ${c.mode==="always"?"selected":""}>Always</option><option value="adhoc" ${c.mode==="adhoc"?"selected":""}>Ad hoc</option><option value="hidden" ${c.mode==="hidden"?"selected":""}>Hidden</option></select><button type="button" data-delete-cat="${i}">×</button></div>`).join("");};
    body.addEventListener("input",e=>{const row=e.target.closest("[data-cat]");if(!row)return;const i=Number(row.dataset.cat);if(e.target.tagName==="INPUT")cats[i].name=e.target.value;if(e.target.tagName==="SELECT")cats[i].mode=e.target.value;});
    body.addEventListener("change",e=>{const row=e.target.closest("[data-cat]");if(row&&e.target.tagName==="SELECT")cats[Number(row.dataset.cat)].mode=e.target.value;});
    body.addEventListener("click",e=>{const del=e.target.closest("[data-delete-cat]");if(del){cats.splice(Number(del.dataset.deleteCat),1);redraw();return;}if(e.target.id==="addCategory"){cats.push({id:`custom-${Date.now()}`,name:"New category",mode:"adhoc"});redraw();return;}if(e.target.id==="resetCategories"){cats=clone(DEFAULT_CATEGORIES);redraw();return;}if(e.target.id==="saveSettings"){p.categories=cats.filter(c=>c.name.trim()).map(c=>({...c,name:c.name.trim()}));saveProfiles();$("modal").close();toast("Review form saved");return;}if(e.target.id==="exportData"){exportData();return;}if(e.target.id==="exportRecovery"){try{const old=JSON.parse(localStorage.getItem(PROFILE_KEY+"-before-import"));if(!validProfileState(old))throw new Error();exportData(old);}catch(err){toast("No pre-import recovery backup is available");}return;}if(e.target.id==="importDataBtn"){body.querySelector("#importData").click();return;}});
    body.querySelector("#importData").addEventListener("change",importData);$("modal").showModal();
  }

  function exportData(data=state){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`op-shop-hop-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);}
  async function importData(e){const file=e.target.files?.[0];if(!file)return;try{const x=JSON.parse(await file.text());if(!validProfileState(x))throw new Error("bad");if(!confirm("Import this backup and replace the profiles on this device? Your current data will be kept as a recovery backup."))return;if(!writeStorage(PROFILE_KEY+"-before-import",state)||!writeStorage(PROFILE_KEY,x))throw new Error("save");location.reload();}catch(err){toast("That backup file does not look valid");}}
  function newProfile(){const name=prompt("Name this hopper profile");if(!name?.trim())return;const id=crypto.randomUUID?crypto.randomUUID():`p-${Date.now()}`;state.profiles[id]={id,name:name.trim(),categories:clone(DEFAULT_CATEGORIES),reviews:{},favourites:[],manualShops:[],savedHops:[],createdAt:new Date().toISOString()};state.activeProfileId=id;saveProfiles();syncProfilePlaces();routeIds.clear();renderProfileSelect();render();}
  function renderProfileSelect(){$("profileSelect").innerHTML=Object.values(state.profiles).map(p=>`<option value="${esc(p.id)}" ${p.id===state.activeProfileId?"selected":""}>${esc(p.name)}</option>`).join("");}

  function setModal(title,bodyFn){
    $("modalTitle").textContent=title;
    const oldBody=$("modalBody"),body=oldBody.cloneNode(false);oldBody.replaceWith(body);body.innerHTML=bodyFn();
  }
  function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),1800);}

  function handleListClick(e){
    const b=e.target.closest("[data-action]");if(!b)return;const id=b.dataset.id,p=placeById(id);if(!p)return;
    const action=b.dataset.action;
    if(action==="more"){const menu=document.querySelector(`[data-menu="${cssEscape(id)}"]`);qa(".more-menu").forEach(m=>{if(m!==menu)m.classList.add("hidden")});menu?.classList.toggle("hidden");b.setAttribute("aria-expanded",String(!menu?.classList.contains("hidden")));return;}
    qa(".more-menu").forEach(m=>m.classList.add("hidden"));
    if(action==="fav")toggleFavourite(id);if(action==="details")openDetails(p);if(action==="review")openReview(p);if(action==="directions")openDirections(p);if(action==="map")showOnMap(p);if(action==="hop")toggleHop(id);if(action==="around")openAround(p);if(action==="status-want")setQuickStatus(id,"want");if(action==="status-visited")setQuickStatus(id,"visited");
  }

  function wireUI(){
    qa("[data-scope]").forEach(b=>b.addEventListener("click",()=>changeScope(b.dataset.scope)));
    qa("[data-layer]").forEach(el=>el.querySelector("input").addEventListener("change",()=>toggleLayer(el.dataset.layer)));
    qa("[data-saved]").forEach(b=>b.addEventListener("click",()=>{prefs.saved=b.dataset.saved;savePrefs();syncControls();render();}));
    qa("[data-detail]").forEach(b=>b.addEventListener("click",()=>{prefs.detailFilter=b.dataset.detail;savePrefs();syncControls();render();}));
    $("allLayersBtn").addEventListener("click",()=>{prefs.layers=prefs.layers.length===LAYERS.length?["opshop"]:[...LAYERS];savePrefs();syncControls();render();if(prefs.scope==="near")discoverNear(true);else discoverOverview();});
    $("radiusSelect").addEventListener("change",()=>{prefs.radius=Number($("radiusSelect").value);savePrefs();render();discoverNear(true);applyScopeView();});
    $("sortSelect").addEventListener("change",()=>{prefs.sort=$("sortSelect").value;savePrefs();render();});
    $("placeSearch").addEventListener("input",render);
    $("clearPlaceSearch").addEventListener("click",()=>{$("placeSearch").value="";render();$("placeSearch").focus();});
    $("locationSearchBtn").addEventListener("click",geocodeSearch);$("locationSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();geocodeSearch();}});
    $("useLocationBtn").addEventListener("click",()=>requestLocation().catch(()=>{}));$("followBtn").addEventListener("click",startFollow);
    $("mapToggleBtn").addEventListener("click",()=>{prefs.mapHidden=!prefs.mapHidden;savePrefs();syncControls();setTimeout(()=>map?.resize(),50);});
    $("searchMapBtn").addEventListener("click",discoverMapArea);
    $("placeList").addEventListener("click",handleListClick);
    $("clearRouteBtn").addEventListener("click",()=>{routeIds.clear();render();});$("planRouteBtn").addEventListener("click",openRoute);
    $("settingsBtn").addEventListener("click",openSettings);$("newProfileBtn").addEventListener("click",newProfile);$("profileSelect").addEventListener("change",e=>{state.activeProfileId=e.target.value;saveProfiles();routeIds.clear();syncProfilePlaces();render();});
    $("addShopBtn").addEventListener("click",openAddShop);
    $("savedHopsBtn").addEventListener("click",openSavedHops);$("dataGuideBtn").addEventListener("click",openDataGuide);$("refreshDataBtn").addEventListener("click",refreshListings);
    $("allowLocationBtn").addEventListener("click",()=>{$("locationPrompt").close();prefs.locationChoice="use";savePrefs();requestLocation().catch(()=>{prefs.scope="metro";savePrefs();syncControls();render();applyScopeView();});});
    $("browseWithoutBtn").addEventListener("click",()=>{$("locationPrompt").close();prefs.locationChoice="browse";prefs.scope="metro";prefs.sort="suburb";savePrefs();syncControls();render();applyScopeView();setStatus("Browsing Melbourne · search an address or use location any time.");});
    $("modalClose").addEventListener("click",()=>$("modal").close());$("modal").addEventListener("click",e=>{if(e.target===$("modal"))$("modal").close();});
    document.addEventListener("click",e=>{if(!e.target.closest(".more-wrap"))qa(".more-menu").forEach(m=>m.classList.add("hidden"));});
  }

  async function init(){
    try{const c=JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY));if(Array.isArray(c?.places))mergePlaces(c.places.filter(x=>x&&typeof x.id==="string"&&typeof x.name==="string"&&LAYERS.includes(x.layer)&&validCoordinates(x)));}catch(e){}
    syncProfilePlaces();
    wireUI();renderProfileSelect();syncControls();render();initMap();
    refreshVictoriaBase(false);
    if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});
    if(prefs.locationChoice==="use"){
      requestLocation({silent:true}).catch(()=>{if(!origin){prefs.scope="metro";savePrefs();syncControls();render();applyScopeView();}});
    }else if(origin){syncControls();render();discoverNear(false);applyScopeView();
    }else if(!prefs.locationChoice){setTimeout(()=>$("locationPrompt").showModal(),180);}else{if(prefs.scope==="near"){prefs.scope="metro";syncControls();render();}setStatus("Browsing without location.");discoverOverview();}
  }

  init();
})();
