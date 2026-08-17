from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old='''    render();\n    refreshOSM(false);\n  }'''
new='''    render();\n    refreshOSM(false).finally(()=>{if(activeLayers.has("cafe"))refreshCafeLayer();});\n  }'''
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('init block not found')
old2='''    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const centre=map.getCenter();const lat=userLocation?userLocation.lat:centre.lat;const lon=userLocation?userLocation.lon:centre.lng;$("layerHint").textContent="Finding coffee around this part of Naarm…";'''
new2='''    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const centre=map.getCenter();const lat=centre.lat,lon=centre.lng;$("layerHint").textContent="Finding coffee around this part of Naarm…";'''
if old2 in s:
    s=s.replace(old2,new2,1)
elif new2 not in s:
    raise SystemExit('cafe centre block not found')
p.write_text(s,encoding='utf-8')
print('final layer lifecycle fixes applied')
