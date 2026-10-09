import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileByteRangeStream, parseVideoByteRange } from '../lib/v7/media/file-byte-range-stream';

test('MP4 video ranges cover standard seeks, suffix seeks and HTTP 416 inputs', () => {
  assert.deepEqual(parseVideoByteRange('bytes=100-199', 1000), { start: 100, end: 199 });
  assert.deepEqual(parseVideoByteRange('bytes=100-', 1000), { start: 100, end: 999 });
  assert.deepEqual(parseVideoByteRange('bytes=-50', 1000), { start: 950, end: 999 });
  assert.deepEqual(parseVideoByteRange('bytes=0-99999', 1000), { start: 0, end: 999 });
  assert.equal(parseVideoByteRange('bytes=1000-', 1000), undefined);
  assert.equal(parseVideoByteRange('bytes=400-200', 1000), undefined);
  assert.equal(parseVideoByteRange('bytes=0-10,11-20', 1000), undefined);
  assert.equal(parseVideoByteRange('bytes=-0', 1000), undefined);
  assert.equal(parseVideoByteRange('bytes=-', 1000), undefined);
  assert.equal(parseVideoByteRange('bytes=999999999999999999-', 1000), undefined);
});

test('streamed HTTP video range contains exactly the requested bytes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vc-v7-range-'));
  const file = path.join(dir, 'sample.mp4');
  const source = Buffer.alloc(710_019);
  for (let i = 0; i < source.length; i++) source[i] = i % 251;
  try {
    await writeFile(file, source);
    const handle = await open(file, 'r');
    const stream = createFileByteRangeStream(handle, 77, 501_032, 64 * 1024);
    const copied = Buffer.from(await new Response(stream).arrayBuffer());
    assert.equal(copied.length, 501_032 - 77 + 1);
    assert.deepEqual(copied, source.subarray(77, 501_033));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('browser seeking can cancel an in-flight MP4 range without controller errors', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'vc-v7-seek-'));
  const file = path.join(dir, 'seek.mp4');
  try {
    await writeFile(file, Buffer.alloc(3 * 1024 * 1024, 7));
    const handle = await open(file, 'r');
    const reader = createFileByteRangeStream(handle, 0, 3 * 1024 * 1024 - 1).getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    assert.ok(first.value && first.value.length > 0);
    await reader.cancel('seek to new position');
    await reader.cancel('repeated cancellation');
    // No second read nor enqueue may be performed against a closed stream.
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
