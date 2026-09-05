import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { NextResponse } from 'next/server';
import { assetAbsolutePath } from '@/lib/storage/project-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ projectId: string; assetPath: string[] }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId, assetPath } = await context.params;
    const relative = assetPath.join('/');
    const absolute = assetAbsolutePath(projectId, relative);
    const body = await readFile(absolute);
    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType(absolute),
        'Content-Disposition': relative.endsWith('pelicula-final.mp4') ? 'attachment; filename="pelicula-final.mp4"' : 'inline',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch {
    return new NextResponse('Recurso no encontrado', { status: 404 });
  }
}

function contentType(filePath: string) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.srt') return 'application/x-subrip; charset=utf-8';
  return 'application/octet-stream';
}
