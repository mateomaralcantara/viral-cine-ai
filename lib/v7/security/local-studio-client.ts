// The startup script creates a single-use pairing code, NOT the admin token.
// It opens the local browser with the code in the URL fragment. A short-lived,
// HttpOnly session cookie then handles subsequent actions. No API secret is
// exposed to client JavaScript or saved in browser storage.
let pairing:Promise<void>|null=null;
export function ensureLocalStudioSession(){
 if(pairing)return pairing;
 pairing=(async()=>{
  if(typeof window==='undefined')return;
  const hash=new URLSearchParams(window.location.hash.replace(/^#/,''));
  const code=hash.get('studio-pair');
  if(!code){
   const status=await fetch('/api/v7/local-studio-pair',{
    credentials:'same-origin',cache:'no-store'
   });
   const body=await status.json() as {ok?:boolean;authenticated?:boolean};
   if(!status.ok||!body.authenticated)
    throw Error('El navegador no está enlazado. Abre ViralCine desde el iniciador de PowerShell para conectar la sesión.');
   return;
  }
  // Erase the fragment before networking (including from back button history).
  const clean=window.location.pathname+window.location.search;
  window.history.replaceState(null,'',clean);
  const res=await fetch('/api/v7/local-studio-pair',{
   method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'same-origin',cache:'no-store',
   body:JSON.stringify({pairCode:code})
  });
  const body=await res.json() as {ok?:boolean;error?:string};
  if(!res.ok||!body.ok)throw Error(body.error||'No se pudo autorizar la sesión local.');
 })().catch(e=>{pairing=null;throw e;});
 return pairing;
}
