import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {chromium}=require("playwright");

const base=process.env.APP_URL||"http://127.0.0.1:4173/";
const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:["--disable-dev-shm-usage"]});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const errors=[];
page.on("pageerror",error=>errors.push(error.message));

await page.route("https://unpkg.com/**",route=>route.abort());
const overpassFixture={elements:[{
  type:"node",id:99001,lat:-37.798,lon:144.978,tags:{name:"E2E Community Shop",shop:"charity","addr:housenumber":"12","addr:street":"Smith Street","addr:suburb":"Fitzroy","addr:postcode":"3065",opening_hours:"Mo-Sa 10:00-17:00",website:"https://example.org/shop",wheelchair:"yes"}
}]};
await page.route("https://overpass-api.de/**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(overpassFixture)}));
await page.route("https://overpass.kumi.systems/**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({elements:[]})}));
let geocodeCall=0;
await page.route("https://nominatim.openstreetmap.org/**",route=>{
  geocodeCall+=1;const lat=-37.800-geocodeCall*.002,lon=144.900+geocodeCall*.002;
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{lat:String(lat),lon:String(lon),display_name:"Test location, Victoria"}])});
});

try{
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Browse without location"}).click();
  await page.waitForSelector("article.place-card");
  assert.equal(await page.locator(".map-fallback").count(),1,"List fallback should survive a missing map library");
  await page.waitForFunction(()=>document.querySelector("#dataFreshness")?.textContent.toLowerCase().includes("updated today"));
  assert.match(await page.locator("#dataFreshness").innerText(),/updated today/i);

  await page.locator("#placeSearch").fill("E2E Community Shop");
  assert.equal(await page.locator("article.place-card").count(),1);
  assert.match(await page.locator(".trust-badge.source").innerText(),/OpenStreetMap/i);
  await page.getByRole("button",{name:"Details",exact:true}).click();
  await page.getByText("Mo-Sa 10:00-17:00").waitFor();
  assert.equal(await page.getByRole("link",{name:"Website"}).getAttribute("href"),"https://example.org/shop");
  assert.match(await page.locator("#modalBody").innerText(),/Wheelchair accessible/);
  await page.locator("#detailReview").click();
  await page.locator("#reviewNotes").fill("Great windows and a good book shelf");
  await page.locator("#saveReview").click();

  await page.locator("#clearPlaceSearch").click();
  await page.locator('[data-detail="hours"]').click();
  assert.equal(await page.locator("article.place-card").count(),1,"Hours filter should retain the mapped listing with hours");
  await page.locator('[data-detail="all"]').click();

  const addShop=async(name,street)=>{
    await page.locator("#addShopBtn").click();
    await page.locator("#manualName").fill(name);
    await page.locator("#manualStreet").fill(street);
    await page.locator("#manualSuburb").fill("Footscray");
    await page.locator("#manualPostcode").fill("3011");
    await page.locator("#manualWebsite").fill("https://example.com/");
    await page.locator("#saveManualShop").click();
    await page.getByText(`${name} added and mapped`,{exact:false}).waitFor();
  };
  await addShop("E2E Treasure One","10 Test Street");
  await addShop("E2E Treasure Two","20 Test Street");

  const addToHop=async name=>{
    await page.locator("#placeSearch").fill(name);
    await page.getByRole("button",{name:"More actions"}).click();
    await page.getByRole("button",{name:"＋ Add to hop"}).click();
  };
  await addToHop("E2E Treasure One");
  await addToHop("E2E Treasure Two");
  await page.locator("#clearPlaceSearch").click();
  assert.equal(await page.locator("#routeCount").innerText(),"2");
  assert.equal(await page.locator("#planRouteBtn").isEnabled(),true);

  await page.locator("#planRouteBtn").click();
  await page.getByText("A very good day out.").waitFor();
  assert.equal(await page.getByRole("link",{name:"Walk this hop"}).count(),1);
  assert.equal(await page.getByRole("link",{name:"Drive this hop"}).count(),1);
  assert.equal(await page.getByRole("link",{name:"Transit to first stop"}).count(),1);
  page.once("dialog",dialog=>dialog.accept("Saturday treasure loop"));
  await page.locator("#saveHop").click();
  await page.locator("#modalClose").click();
  assert.equal(await page.locator("#savedHopCount").innerText(),"1");

  await page.locator("#clearRouteBtn").click();
  await page.locator("#savedHopsBtn").click();
  await page.getByText("Saturday treasure loop",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Load",exact:true}).click();
  assert.equal(await page.locator("#routeCount").innerText(),"2");

  // A separate profile must neither inherit additions nor lose its own additions on switch.
  page.once("dialog",dialog=>dialog.accept("Second hopper"));
  await page.locator("#newProfileBtn").click();
  await page.locator("#placeSearch").fill("E2E Treasure One");
  assert.equal(await page.locator("article.place-card").count(),0);
  await addShop("E2E Second Profile","30 Test Street");
  const ids=await page.locator("#profileSelect option").evaluateAll(options=>options.map(o=>o.value));
  await page.locator("#profileSelect").selectOption(ids[0]);
  await page.locator("#placeSearch").fill("E2E Second Profile");
  assert.equal(await page.locator("article.place-card").count(),0);
  await page.locator("#placeSearch").fill("E2E Treasure One");
  assert.equal(await page.locator("article.place-card").count(),1);

  // Reject malformed imports without changing the current profile or reloading.
  await page.locator("#settingsBtn").click();
  await page.locator("#importData").setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({profiles:{},activeProfileId:"missing"}))});
  await page.getByText("That backup file does not look valid",{exact:true}).waitFor();
  await page.locator("#modalClose").click();

  // Layer controls work with the keyboard, not just a pointer.
  await page.locator('[data-layer="books"] input').focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator('[data-layer="books"] input').isChecked(),true);
  await page.keyboard.press("Space");
  assert.equal(await page.locator('[data-layer="books"] input').isChecked(),false);

  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`No horizontal overflow at ${width}px`);
  }
  await page.setViewportSize({width:390,height:844});

  await page.reload({waitUntil:"domcontentloaded"});
  await page.locator("#placeSearch").fill("E2E Treasure One");
  await page.getByText("E2E Treasure One",{exact:true}).waitFor();
  assert.equal(await page.locator("#savedHopCount").innerText(),"1","Saved hops should survive reload");

  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload({waitUntil:"domcontentloaded"});
  await context.setOffline(true);
  await page.reload({waitUntil:"domcontentloaded"});
  await page.getByText("E2E Treasure One",{exact:true}).waitFor();
  assert.equal(await page.locator(".map-fallback").count(),1,"Offline app shell should retain usable list mode");
  assert.deepEqual(errors,[],`Unexpected page errors: ${errors.join(" | ")}`);
  console.log("V2.2 browser checks passed: details, filters, mapped additions, saved hops, persistence and offline shell.");
}finally{
  await browser.close();
}
