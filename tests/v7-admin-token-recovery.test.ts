import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Token store is Windows user encrypted and recoverable without copying from a terminal',async()=>{
 const s=await readFile(new URL('../scripts/V7-ADMIN-TOKEN.ps1',import.meta.url),'utf8');
 assert.match(s,/ConvertFrom-SecureString/);
 assert.match(s,/ConvertTo-SecureString/);
 assert.match(s,/ViralCineV7/);
 assert.match(s,/admin-token\.dpapi/);
 assert.match(s,/Mode -eq "Get"/);
 assert.match(s,/Set-Clipboard/);
 assert.match(s,/ZeroFreeBSTR/);
});
