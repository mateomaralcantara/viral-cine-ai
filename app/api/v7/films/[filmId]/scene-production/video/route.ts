import { open, stat } from 'node:fs/promises';
import path from 'node:path';
import { readV7FilmBundle, v7FilmRoot } from '@/lib/v7/storage/film-store';
import { readSceneApprovalBoard } from '@/lib/v7/production/scene-approval-board';
import { createFileByteRangeStream, parseVideoByteRange } from '@/lib/v7/media/file-byte-range-stream';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{filmId:string}>};
async function serve(request:Request,context:Context,head:boolean){
  if(process.env.NODE_ENV!=='development')return new Response(null,{status:403});
  const url=new URL(request.url);
  if(!['localhost','127.0.0.1','::1'].includes(url.hostname)||
      (request.headers.get('origin')&&request.headers.get('origin')!==url.origin))return new Response(null,{status:403});
  const id=url.searchParams.get('shotId');
  const sceneId=url.searchParams.get('sceneId');
  if((Boolean(id)===Boolean(sceneId))||(id&&id.length>240)||(sceneId&&sceneId.length>240))
    return new Response(null,{status:400});
  try{
    const {filmId}=await context.params;
    const bundle=await readV7FilmBundle(filmId);
    const board=await readSceneApprovalBoard(bundle.film);
    const scene=sceneId?board.scenes.find(s=>s.id===sceneId):null;
    const shot=id?board.scenes.flatMap(s=>s.shots).find(s=>s.id===id):null;
    if(sceneId&&(!scene||!scene.assembled))return new Response(null,{status:404});
    if(id&&(!shot||!shot.hasVideo))return new Response(null,{status:404});
    const filename=scene?'scene-cut.mp4':shot!.label+'-veo-candidato.mp4';
    const file=scene
      ?path.join(v7FilmRoot(filmId),'scenes',scene.label.toLowerCase(),filename)
      :path.join(v7FilmRoot(filmId),shot!.label.toLowerCase(),filename);
    const metadata=await stat(file);
    if(!metadata.isFile()||metadata.size<10000)return new Response(null,{status:404});
    const requested=request.headers.get('range');
    const range=requested===null?null:parseVideoByteRange(requested,metadata.size);
    const headers:Record<string,string>={
      'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="'+filename+'"'
    };
    if(requested!==null&&!range)return new Response(null,{status:416,headers:{...headers,
      'Content-Range':'bytes */'+metadata.size}});
    const start=range?.start??0,end=range?.end??metadata.size-1;
    headers['Content-Length']=String(end-start+1);
    if(range)headers['Content-Range']='bytes '+start+'-'+end+'/'+metadata.size;
    const status=range?206:200;
    if(head)return new Response(null,{status,headers});
    const fileHandle=await open(file,'r');
    return new Response(createFileByteRangeStream(fileHandle,start,end),{status,headers});
  }catch{return new Response(null,{status:404});}
}
export async function GET(request:Request,context:Context){return serve(request,context,false);}
export async function HEAD(request:Request,context:Context){return serve(request,context,true);}
