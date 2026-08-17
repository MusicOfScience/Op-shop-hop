from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old='''    refreshOSM(false).finally(()=>{if(activeLayers.has("cafe"))refreshCafeLayer();});'''
new='''    refreshOSM(false).finally(async()=>{await refreshDiscoveryLayers(true);if(activeLayers.has("cafe"))refreshCafeLayer();});'''
if old not in s: raise SystemExit('missing init refresh anchor')
s=s.replace(old,new,1)
old2='''  function toggleFavourite(id){const p=profile();p.favourites=p.favourites||[];const i=p.favourites.indexOf(id);i>=0?p.favourites.splice(i,1):p.favourites.push(id);saveState();renderCards();}'''
new2='''  function toggleFavourite(id){const p=profile();p.favourites=p.favourites||[];const i=p.favourites.indexOf(id);i>=0?p.favourites.splice(i,1):p.favourites.push(id);saveState();render();}'''
if old2 not in s: raise SystemExit('missing favourite anchor')
s=s.replace(old2,new2,1)
p.write_text(s,encoding='utf-8')
print('v1.3 final behaviour fixes applied')