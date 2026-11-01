import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localOriginAllowed} from '../lib/v7/security/local-studio-session';

test('Browser on 127.0.0.1 can POST when Next normalizes request URL to localhost',()=>{
 const saved=process.env.NODE_ENV;
 const savedPort=process.env.V7_STUDIO_LOCAL_PORT;
 try{
  Reflect.set(process.env,'NODE_ENV','development');
  Reflect.set(process.env,'V7_STUDIO_LOCAL_PORT','3010');
  const trusted=new Request('http://localhost:3010/api/v7/films/film-dos-toques-de-bocina-v7/runway-scene02',{
   method:'POST',
   headers:{Origin:'http://127.0.0.1:3010','Sec-Fetch-Site':'same-origin',
    'Sec-Fetch-Dest':'empty','Content-Type':'application/json'},
   body:JSON.stringify({action:'preflight',shotId:'E02-P01'})
  });
  assert.equal(localOriginAllowed(trusted),true);
  const reverse=new Request('http://127.0.0.1:3010/api/v7/films/test/scene-production',{
   method:'POST',
   headers:{Origin:'http://localhost:3010','Sec-Fetch-Site':'same-origin'}
  });
  assert.equal(localOriginAllowed(reverse),true);
  const internalProxyPort=new Request('http://localhost:3000/api/v7/films/test/scene-production',{
   method:'POST',headers:{Origin:'http://127.0.0.1:3010','Sec-Fetch-Site':'same-origin'}
  });
  assert.equal(localOriginAllowed(internalProxyPort),true);
  const cases=[
   {origin:'https://malicious.example',site:'cross-site'},
   {origin:'http://localhost:4010',site:'same-origin'},
   {origin:'http://127.0.0.1:3011',site:'same-origin'},
   {origin:'http://localhost:3010',site:'cross-site'},
   {origin:'http://not-localhost.example:3010',site:'same-origin'}
  ];
  for(const item of cases){
   const req=new Request('http://localhost:3010/api/v7/films/test/runway-scene02',{
    method:'POST',headers:{Origin:item.origin,'Sec-Fetch-Site':item.site}
   });
   assert.equal(localOriginAllowed(req),false,item.origin+'/'+item.site);
  }
 }finally{
  if(saved===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');
  else Reflect.set(process.env,'NODE_ENV',saved);
  if(savedPort===undefined)Reflect.deleteProperty(process.env,'V7_STUDIO_LOCAL_PORT');
  else Reflect.set(process.env,'V7_STUDIO_LOCAL_PORT',savedPort);
 }
});
test('E02 Runway submit and scene approvals share canonical loopback-origin validation',async()=>{
 const files=await Promise.all([
  '../app/api/v7/films/[filmId]/runway-scene02/route.ts',
  '../app/api/v7/films/[filmId]/scene-production/route.ts',
  '../lib/v7/security/local-studio-session.ts'
 ].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
 assert.ok(files[0].includes('return localOriginAllowed(request)'));
 assert.ok(files[1].includes('return localOriginAllowed(request)'));
 assert.ok(files[2].includes("source.port!==(process.env.V7_STUDIO_LOCAL_PORT||'3010')"));
 assert.ok(files[2].includes("site!=='same-origin'"));
 assert.ok(files[0].includes("runwayAdminAuthorized(request)"));
 assert.ok(files[1].includes("administrator(request)"));
});
