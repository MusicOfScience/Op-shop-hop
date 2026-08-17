from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
old='''    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const c=userLocation?{lat:userLocation.lat,lng:userLocation.lon}:map.getCenter();$("layerHint").textContent="Finding coffee around this part of Naarm…";\n    const query=`[out:json][timeout:20];nwr["amenity"="cafe"](around:3000,${c.lat},${c.lng});out center tags;`;'''
new='''    if(!activeLayers.has("cafe"))return;const serial=++cafeRequestSerial;const centre=map.getCenter();const lat=userLocation?userLocation.lat:centre.lat;const lon=userLocation?userLocation.lon:centre.lng;$("layerHint").textContent="Finding coffee around this part of Naarm…";\n    const query=`[out:json][timeout:20];nwr["amenity"="cafe"](around:3000,${lat},${lon});out center tags;`;'''
if new in s:
    print('already fixed')
elif old in s:
    p.write_text(s.replace(old,new,1),encoding='utf-8')
    print('fixed cafe origin longitude')
else:
    raise SystemExit('Expected cafe origin block not found')
