import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../overpass-guard.js',import.meta.url),'utf8');
const calls=[];
const nativeFetch=async(input,init)=>{
  calls.push({input,body:init.body});
  return {ok:true,status:200,json:async()=>({elements:[{id:init.body}]})};
};
const window={fetch:nativeFetch};
const sandbox={window,location:{href:'https://example.test/'},URL,setTimeout,clearTimeout,console};
vm.runInNewContext(source,sandbox);

const endpoint='https://overpass-api.de/api/interpreter';
const one=window.fetch(endpoint,{method:'POST',body:'data=records'});
await new Promise(resolve=>setTimeout(resolve,30));
const two=window.fetch(endpoint,{method:'POST',body:'data=records+cafes'});
await new Promise(resolve=>setTimeout(resolve,30));
const three=window.fetch(endpoint,{method:'POST',body:'data=records+cafes+vintage'});

const [a,b,c]=await Promise.all([one,two,three]);
const aData=await a.json(),bData=await b.json(),cData=await c.json();
// Responses a/b are created inside the vm context, so compare their data rather
// than object prototypes from two different JavaScript realms.
assert.equal(Array.isArray(aData.elements),true);
assert.equal(aData.elements.length,0,'First rapid selection should be superseded without another Overpass call');
assert.equal(Array.isArray(bData.elements),true);
assert.equal(bData.elements.length,0,'Intermediate rapid selection should be superseded without another Overpass call');
assert.equal(cData.elements[0].id,'data=records+cafes+vintage');
assert.equal(calls.length,1,'Only the settled layer selection should reach Overpass');
assert.equal(calls[0].body,'data=records+cafes+vintage');

console.log('Overpass guard passed: rapid layer changes coalesce to the final discovery request.');
