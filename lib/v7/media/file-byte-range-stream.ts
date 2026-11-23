import type { FileHandle } from 'node:fs/promises';

/**
 * Byte-range reader with explicit backpressure and cancellation support.
 *
 * Browsers routinely cancel an in-progress video range while seeking. Using
 * Node Readable.toWeb(createReadStream()) in a Next.js route can race with that
 * cancellation, yielding ERR_INVALID_STATE: Controller is already closed.
 * Only pull when the consumer requests bytes, and never enqueue/close after
 * a cancellation.
 */
export function createFileByteRangeStream(
  handle: FileHandle,
  start: number,
  end: number,
  chunkSize = 256 * 1024
): ReadableStream<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end < start ||
      !Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > 1024 * 1024) {
    throw new Error('Parámetros de lectura de video inválidos.');
  }

  let offset = start;
  let stopped = false;
  let closing: Promise<void> | undefined;

  function release(): Promise<void> {
    if (!closing) {
      closing = handle.close().catch(() => {
        // The client already disconnected. Do not throw an unhandled error.
      });
    }
    return closing;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (stopped) return;

      const remaining = end - offset + 1;
      if (remaining <= 0) {
        stopped = true;
        try { controller.close(); } catch { /* The response was cancelled. */ }
        await release();
        return;
      }

      const buffer = Buffer.allocUnsafe(Math.min(remaining, chunkSize));
      try {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);

        // A cancelled browser seek can finish while the asynchronous file read
        // is still pending. Never touch the controller after cancellation.
        if (stopped) return;

        if (bytesRead === 0) {
          stopped = true;
          try { controller.error(new Error('El video se acortó durante la lectura.')); }
          catch { /* The response was already closed. */ }
          await release();
          return;
        }

        offset += bytesRead;
        try {
          // Own the outgoing buffer: no Node buffer pool sharing with the consumer.
          controller.enqueue(Uint8Array.from(buffer.subarray(0, bytesRead)));
          if (offset > end) {
            stopped = true;
            try { controller.close(); } catch { /* Client already closed. */ }
            await release();
          }
        } catch {
          // Browser abandoned this range in the middle of an enqueue.
          stopped = true;
          await release();
        }
      } catch (error) {
        if (!stopped) {
          stopped = true;
          try { controller.error(error); } catch { /* Client already closed. */ }
        }
        await release();
      }
    },

    async cancel() {
      stopped = true;
      await release();
    }
  }, { highWaterMark: 1 });
}

/** Handles the three common browser range formats: start-end, start-, -suffix. */
export function parseVideoByteRange(value: string, size: number) {
  if (!Number.isSafeInteger(size) || size <= 0) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return undefined;

  let start: number;
  let end: number;

  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return undefined;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start < 0 || end < start || start >= size) return undefined;

  return { start, end: Math.min(end, size - 1) };
}
