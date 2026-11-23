import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {e02CloudConfigured} from '../lib/v7/production/e02-supabase-references';

test('isolated P04 verification cannot access Supabase even when process inherited credentials',()=>{
 const prev=process.env.VIRALCINE_TEST_OFFLINE;
 try{
  process.env.VIRALCINE_TEST_OFFLINE='true';
  assert.equal(e02CloudConfigured(),false);
 }finally{
  if(prev===undefined)delete process.env.VIRALCINE_TEST_OFFLINE;
  else process.env.VIRALCINE_TEST_OFFLINE=prev;
 }
});

test('E02 gallery is local-only, read-only and cannot submit a paid render',async()=>{
 const file=await readFile(
  new URL('../app/api/v7/films/[filmId]/scene02-gallery/route.ts',import.meta.url),'utf8');
 assert.match(file,/localOriginAllowed\(request\)/);
 assert.match(file,/getApprovedE02Image/);
 assert.match(file,/approvedE02References/);
 assert.doesNotMatch(file,/export async function POST/);
 assert.doesNotMatch(file,/image_to_video/);
});
