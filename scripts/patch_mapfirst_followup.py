from pathlib import Path
p=Path('app.js')
s=p.read_text(encoding='utf-8')
changes=[
('''    render();\n    if(profile().name === "Guest") openProfileSetup(true);\n    refreshOSM(false);''','''    render();\n    refreshOSM(false);'''),
('''    $("locationHint").textContent=label?`Starting near ${label}`:"Starting from your location";\n    $("sortSelect").value="distance";\n    render();''','''    $("locationHint").textContent=label?`Starting near ${label}`:"Starting from your location";\n    const cbdDistance=haversine(lat,lon,-37.8136,144.9631);\n    activeCoverage=cbdDistance<=15?"inner":cbdDistance<=60?"metro":"vic";\n    document.querySelectorAll("[data-coverage]").forEach(btn=>btn.classList.toggle("active",btn.dataset.coverage===activeCoverage));\n    $("sortSelect").value="distance";\n    render();''')]
changed=False
for old,new in changes:
    if new in s: continue
    if old not in s: raise SystemExit('Expected block not found; refusing partial patch')
    s=s.replace(old,new,1); changed=True
if changed:
    p.write_text(s,encoding='utf-8')
    print('map-first follow-up applied')
else:
    print('already applied')
