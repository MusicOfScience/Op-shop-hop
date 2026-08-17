from pathlib import Path

# Focused v1.3.1 correction: mobile default is stacked map+list and Leaflet is
# aggressively re-sized after Safari viewport/layout changes.

app = Path('app.js')
s = app.read_text()
s = s.replace('const VIEW_KEY = "op-shop-hop-view-v1";', 'const VIEW_KEY = "op-shop-hop-view-v2";')
s = s.replace('return matchMedia("(max-width: 700px)").matches?"map":"split";', 'return "split";')
s = s.replace('function setView(view){activeView=["map","list","split"].includes(view)?view:"split";localStorage.setItem(VIEW_KEY,activeView);document.body.dataset.view=activeView;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===activeView));setTimeout(()=>map?.invalidateSize(false),40);}', '''function hardResizeMap(){
    if(!map)return;
    [0,80,220,500].forEach(ms=>setTimeout(()=>{
      map.invalidateSize({animate:false,pan:false});
      map.eachLayer(layer=>{if(typeof layer.redraw==="function") layer.redraw();});
    },ms));
  }
  function setView(view){activeView=["map","list","split"].includes(view)?view:"split";localStorage.setItem(VIEW_KEY,activeView);document.body.dataset.view=activeView;document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===activeView));hardResizeMap();}''')
s = s.replace('window.addEventListener("orientationchange",()=>setTimeout(()=>map.invalidateSize(false),180));', '''window.addEventListener("orientationchange",hardResizeMap);
    window.addEventListener("resize",hardResizeMap);
    window.addEventListener("pageshow",hardResizeMap);
    document.addEventListener("visibilitychange",()=>{if(!document.hidden)hardResizeMap();});''')
s = s.replace('requestAnimationFrame(()=>map.invalidateSize(false));', 'hardResizeMap();')
app.write_text(s)

html = Path('index.html')
h = html.read_text()
h = h.replace('data-view="map">Map</button>', 'data-view="map">Map only</button>')
h = h.replace('data-view="list">List</button>', 'data-view="list">List only</button>')
h = h.replace('data-view="split">Map + list</button>', 'data-view="split">Map + list</button>')
html.write_text(h)

css = Path('styles.css')
c = css.read_text()
c += '''\n\n/* v1.3.1 Safari/mobile map sizing */\n.map-shell,#map,.leaflet-container{width:100%;max-width:100%}\n#map{position:relative;display:block}\n.leaflet-map-pane,.leaflet-tile-pane,.leaflet-tile-container{will-change:transform}\n@media(max-width:700px){\n  body[data-view="split"] .map-first #map{height:48dvh;min-height:340px}\n  body[data-view="split"] .results-heading{padding-top:1rem}\n}\n'''
css.write_text(c)
