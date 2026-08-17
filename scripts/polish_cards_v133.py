from pathlib import Path

app_path = Path('app.js')
css_path = Path('styles.css')
app = app_path.read_text()
css = css_path.read_text()

old_display = '''  function displayAddress(s){
    const suburb=s.suburb||suburbFromAddress(s);const postcode=postcodeFor(s);
    let street=String(s.address||"").split(",")[0].trim();
    street=street.replace(/\\bVIC\\b/ig,"").replace(/\\b3\\d{3}\\b/g,"").replace(/\\s{2,}/g," ").trim();
    if(!street&&s.lat!=null)street="Mapped location";
    const parts=[street,suburb,postcode].filter(Boolean);
    const unique=[];parts.forEach(x=>{if(!unique.some(y=>normalize(y)===normalize(x)))unique.push(x);});
    return unique.join(" · ")||"Address incomplete in source data";
  }
'''
new_display = '''  function displayAddress(s){
    const suburb=s.suburb||suburbFromAddress(s);const postcode=postcodeFor(s);
    let street=String(s.address||"").split(",")[0].trim();
    street=street.replace(/\\bVIC\\b/ig,"").replace(/\\b3\\d{3}\\b/g,"").replace(/\\s{2,}/g," ").trim();
    if(suburb&&normalize(street)===normalize(suburb))street="";
    const parts=[street,suburb,postcode].filter(Boolean);
    const unique=[];parts.forEach(x=>{if(!unique.some(y=>normalize(y)===normalize(x)))unique.push(x);});
    if(street)return unique.join(" · ");
    const place=[suburb,postcode].filter(Boolean);
    return place.length?`${place.join(" · ")} · street address unavailable`:"Street address unavailable";
  }

  function cleanDisplayName(s){
    const raw=String(s.name||"").trim();
    const suburb=String(s.suburb||"").trim();
    if(!suburb)return raw;
    const escaped=suburb.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&");
    const cleaned=raw.replace(new RegExp(`\\s*[—–-]\\s*${escaped}\\s*$`,"i"),"").trim();
    return cleaned||raw;
  }
'''
if old_display not in app:
    raise SystemExit('displayAddress block not found')
app = app.replace(old_display, new_display, 1)

old_meta = '''      node.querySelector(".shop-meta").innerHTML=`<span class="shop-type">${layerGlyph(layer)} ${esc(layerLabel(layer))}</span> · ${esc(s.suburb||regionFor(s))}${s.operator?` · ${esc(s.operator)}`:""}`;
      node.querySelector(".shop-name").textContent=s.name;
'''
new_meta = '''      node.querySelector(".shop-meta").innerHTML=`<span class="shop-type">${layerGlyph(layer)} ${esc(layerLabel(layer))}</span>`;
      node.querySelector(".shop-name").textContent=cleanDisplayName(s);
'''
if old_meta not in app:
    raise SystemExit('card meta block not found')
app = app.replace(old_meta, new_meta, 1)

old_rating = '''      if(layer==="opshop") node.querySelector(".rating-line").innerHTML=avg?`<span class="score-big">${avg.toFixed(1)}</span><span class="score-label">/10 your average<br>${Object.keys(r.ratings||{}).length} categories rated</span>`:`<span class="score-big">—</span><span class="score-label">not rated yet</span>`;
'''
new_rating = '''      if(layer==="opshop") node.querySelector(".rating-line").innerHTML=avg?`<span class="score-big">${avg.toFixed(1)}</span><span class="score-label">/10 your average<br>${Object.keys(r.ratings||{}).length} categories rated</span>`:`<span class="rating-empty">Not rated yet</span>`;
'''
if old_rating not in app:
    raise SystemExit('rating block not found')
app = app.replace(old_rating, new_rating, 1)

old_popup = '''      marker.bindPopup(`<div class="map-popup"><strong>${esc(s.name)}</strong><small>${esc(layerLabel(layer))}${s.suburb?` · ${esc(s.suburb)}`:""}${avg&&layer==="opshop"?` · ${avg.toFixed(1)}/10`:""}</small><button type="button" data-map-action="${esc(s.id)}">${action}</button></div>`);
'''
new_popup = '''      marker.bindPopup(`<div class="map-popup"><strong>${esc(cleanDisplayName(s))}</strong><small>${esc(layerLabel(layer))}${s.suburb?` · ${esc(s.suburb)}`:""}${avg&&layer==="opshop"?` · ${avg.toFixed(1)}/10`:""}</small><button type="button" data-map-action="${esc(s.id)}">${action}</button></div>`);
'''
if old_popup not in app:
    raise SystemExit('popup block not found')
app = app.replace(old_popup, new_popup, 1)

css += '''

/* v1.3.3 quieter mobile card hierarchy */
.shop-card{min-height:0;gap:.62rem;padding:.9rem}
.shop-card-top{align-items:flex-start}
.shop-name{margin:.14rem 0 .2rem;font-size:1.22rem;line-height:1.02}
.shop-meta{font-size:.62rem;letter-spacing:.07em}
.shop-address{font-size:.8rem;line-height:1.3}
.shop-distance{margin:.14rem 0 0;font-size:.7rem;font-weight:780}
.rating-line{margin-top:.04rem;min-height:0}
.rating-empty{font-size:.72rem;color:var(--muted);font-weight:750}
.tag-row{min-height:0}
.tag-row:empty{display:none}
.card-actions{margin-top:.08rem}

@media(max-width:700px){
  .view-toolbar{position:relative;top:auto;z-index:auto;padding:.38rem .42rem;gap:.36rem;background:var(--paper-2);backdrop-filter:none}
  .shop-grid{gap:.55rem}
  .shop-card{padding:.82rem;gap:.5rem;border-radius:15px}
  .shop-name{font-size:1.14rem;line-height:1.03}
  .shop-meta{font-size:.59rem;letter-spacing:.065em}
  .shop-address{font-size:.77rem}
  .shop-distance{font-size:.67rem;margin-top:.1rem}
  .fav-btn{font-size:1.22rem}
  .rating-line{margin:.02rem 0}
  .score-big{font-size:1.25rem}
  .rating-empty{font-size:.7rem}
  .card-actions{gap:.27rem}
  .card-actions button{padding:.5rem .44rem;font-size:.7rem}
}
'''

app_path.write_text(app)
css_path.write_text(css)
