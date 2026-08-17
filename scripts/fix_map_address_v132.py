from pathlib import Path
import re

app = Path('app.js')
s = app.read_text()

s = s.replace('  let map = null;\n  let markers = null;', '  let map = null;\n  let baseTiles = null;\n  let markers = null;')

old_init = '''  function init(){
    initMap();
    wireUI();
    renderProfileSelect();
    syncLayerUI();
    syncSavedUI();
    setView(activeView);
    mergeManualShops();
    loadCachedOSM();
    refreshFilters();
    render();
    refreshOSM(false).finally(async()=>{await refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))refreshCafeLayer();});
  }
'''
new_init = '''  function init(){
    wireUI();
    renderProfileSelect();
    syncLayerUI();
    syncSavedUI();
    mergeManualShops();
    loadCachedOSM();
    enrichMissingSuburbs();
    refreshFilters();
    const bootMap=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      initMap();
      setView(activeView);
      render();
      refreshOSM(false).finally(async()=>{await refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))refreshCafeLayer();});
    }));
    if(document.readyState==="complete") bootMap();
    else window.addEventListener("load",bootMap,{once:true});
  }
'''
if old_init not in s:
    raise SystemExit('init block not found')
s = s.replace(old_init,new_init)

old_map = '''  function initMap(){
    map = L.map("map",{zoomControl:true}).setView([-37.8136,144.9631],11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    if("ResizeObserver" in window){
      new ResizeObserver(()=>requestAnimationFrame(()=>map.invalidateSize(false))).observe($("map"));
    }
    window.addEventListener("orientationchange",hardResizeMap);
    window.addEventListener("resize",hardResizeMap);
    window.addEventListener("pageshow",hardResizeMap);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)hardResizeMap();});
  }
'''
new_map = '''  function initMap(){
    map = L.map("map",{zoomControl:true,trackResize:true,preferCanvas:true}).setView([-37.8136,144.9631],11);
    baseTiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      updateWhenIdle:false,
      updateWhenZooming:true,
      keepBuffer:4,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
    if("ResizeObserver" in window){
      let lastW=0,lastH=0;
      new ResizeObserver(entries=>{
        const box=entries[0]?.contentRect;if(!box)return;
        const w=Math.round(box.width),h=Math.round(box.height);
        if(Math.abs(w-lastW)>1||Math.abs(h-lastH)>1){lastW=w;lastH=h;hardResizeMap();}
      }).observe($("map"));
    }
    window.addEventListener("orientationchange",hardResizeMap);
    window.addEventListener("resize",hardResizeMap);
    window.addEventListener("pageshow",hardResizeMap);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)hardResizeMap();});
    map.whenReady(hardResizeMap);
  }
'''
if old_map not in s:
    raise SystemExit('initMap block not found')
s = s.replace(old_map,new_map)

old_resize = '''  function hardResizeMap(){
    if(!map)return;
    [0,80,220,500].forEach(ms=>setTimeout(()=>{
      map.invalidateSize({animate:false,pan:false});
      map.eachLayer(layer=>{if(typeof layer.redraw==="function") layer.redraw();});
    },ms));
  }
'''
new_resize = '''  function healMapTiles(){
    if(!map||!baseTiles)return;
    map.invalidateSize({animate:false,pan:false});
    // Leaflet normally calls this itself after a resize. Safari can miss the
    // visible tile range when a responsive container settles after startup.
    if(typeof baseTiles._update==="function") baseTiles._update();
  }
  function hardResizeMap(){
    if(!map)return;
    [0,120,360].forEach(ms=>setTimeout(healMapTiles,ms));
  }
'''
if old_resize not in s:
    raise SystemExit('hardResizeMap block not found')
s = s.replace(old_resize,new_resize)

needle = '  function distanceLabel(km){return km<1?`${Math.round(km*1000)} m`:`${km<10?km.toFixed(1):Math.round(km)} km`;}\n\n'
insert = r'''  function distanceLabel(km){return km<1?`${Math.round(km*1000)} m`:`${km<10?km.toFixed(1):Math.round(km)} km`;}

  function postcodeFor(s){
    if(s.postcode)return String(s.postcode);
    const m=String(s.address||"").match(/\b(3\d{3})\b/);return m?m[1]:"";
  }
  function suburbFromAddress(s){
    const bits=String(s.address||"").split(",").map(x=>x.trim()).filter(Boolean);
    if(bits.length<2)return "";
    for(const raw of bits.slice(1)){
      const cleaned=raw.replace(/\bVIC\b/ig,"").replace(/\b3\d{3}\b/g,"").trim();
      if(/[A-Za-z]{3}/.test(cleaned))return cleaned;
    }
    return "";
  }
  function enrichMissingSuburbs(){
    shops.forEach(s=>{
      if(!s.postcode){const p=postcodeFor(s);if(p)s.postcode=p;}
      if(!s.suburb){const a=suburbFromAddress(s);if(a){s.suburb=a;s.suburbInferred=true;}}
    });
    const byPost=new Map();
    shops.filter(s=>s.postcode&&s.suburb).forEach(s=>{
      const p=String(s.postcode);const counts=byPost.get(p)||new Map();
      counts.set(s.suburb,(counts.get(s.suburb)||0)+1);byPost.set(p,counts);
    });
    shops.filter(s=>!s.suburb&&s.postcode).forEach(s=>{
      const counts=byPost.get(String(s.postcode));if(!counts)return;
      const ranked=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
      const total=ranked.reduce((n,x)=>n+x[1],0);
      if(ranked[0]&&(ranked.length===1||ranked[0][1]/total>=0.72)){s.suburb=ranked[0][0];s.suburbInferred=true;}
    });
    const known=shops.filter(s=>s.suburb&&s.lat!=null&&s.lon!=null);
    shops.filter(s=>!s.suburb&&s.lat!=null&&s.lon!=null).forEach(s=>{
      let candidates=known;
      if(s.postcode){const same=known.filter(k=>String(k.postcode||"")===String(s.postcode));if(same.length)candidates=same;}
      let best=null,bestD=Infinity;
      candidates.forEach(k=>{if(k.id===s.id)return;const d=haversine(s.lat,s.lon,k.lat,k.lon);if(d<bestD){bestD=d;best=k;}});
      const limit=s.postcode?2.2:0.9;
      if(best&&bestD<=limit){s.suburb=best.suburb;s.suburbInferred=true;}
    });
  }
  function displayAddress(s){
    const suburb=s.suburb||suburbFromAddress(s);const postcode=postcodeFor(s);
    let street=String(s.address||"").split(",")[0].trim();
    street=street.replace(/\bVIC\b/ig,"").replace(/\b3\d{3}\b/g,"").replace(/\s{2,}/g," ").trim();
    if(!street&&s.lat!=null)street="Mapped location";
    const parts=[street,suburb,postcode].filter(Boolean);
    const unique=[];parts.forEach(x=>{if(!unique.some(y=>normalize(y)===normalize(x)))unique.push(x);});
    return unique.join(" · ")||"Address incomplete in source data";
  }

'''
if needle not in s:
    raise SystemExit('distanceLabel needle not found')
s = s.replace(needle,insert)

s = s.replace('mergeOSM(parsed); refreshFilters(); render();', 'mergeOSM(parsed); enrichMissingSuburbs(); refreshFilters(); render();')
s = s.replace('mergeOSM(incoming);lastDiscoveryCentre=', 'mergeOSM(incoming);enrichMissingSuburbs();lastDiscoveryCentre=')

old_card = '      node.querySelector(".shop-meta").innerHTML=`<span class="shop-type">${layerGlyph(layer)} ${esc(layerLabel(layer))}</span> · ${esc(s.suburb||regionFor(s))}${s.operator?` · ${esc(s.operator)}`:""}`;\n      node.querySelector(".shop-name").textContent=s.name;\n      node.querySelector(".shop-address").textContent=s.address||[s.suburb,s.postcode].filter(Boolean).join(" ")||(s.lat!=null?"Location mapped · street address not supplied":"Address incomplete in source data");'
new_card = '      node.querySelector(".shop-meta").innerHTML=`<span class="shop-type">${layerGlyph(layer)} ${esc(layerLabel(layer))}</span> · ${esc(s.suburb||regionFor(s))}${s.operator?` · ${esc(s.operator)}`:""}`;\n      node.querySelector(".shop-name").textContent=s.name;\n      node.querySelector(".shop-address").textContent=displayAddress(s);'
if old_card not in s:
    raise SystemExit('card address block not found')
s = s.replace(old_card,new_card)

# A normal result render should move/zoom the map, not launch several delayed
# full-layer redraws. Tile healing is reserved for actual layout changes.
s = s.replace('    hardResizeMap();\n  }\n\n  function renderRouteTray(){', '    requestAnimationFrame(healMapTiles);\n  }\n\n  function renderRouteTray(){')

app.write_text(s)

css=Path('styles.css')
c=css.read_text()
c=c.replace('.leaflet-map-pane,.leaflet-tile-pane,.leaflet-tile-container{will-change:transform}\n','')
c += '''\n\n/* v1.3.2 stable Safari tile viewport + scannable addresses */\n.map-shell{isolation:isolate}\n#map.leaflet-container{width:100%;height:100%;min-width:0;overflow:hidden}\n.shop-address{font-variant-numeric:tabular-nums;line-height:1.35}\n'''
css.write_text(c)
