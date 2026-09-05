import { NextResponse } from 'next/server';
import { checkFfmpeg } from '@/lib/media/ffmpeg-check';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const mode = process.env.PRODUCTION_MODE === 'real' ? 'real' : 'demo';
  return NextResponse.json({
    ok: true,
    system: {
      mode,
      ffmpeg: await checkFfmpeg(),
      script: Boolean(process.env.OPENAI_API_KEY),
      images: Boolean(process.env.OPENAI_API_KEY),
      voice: Boolean(process.env.OPENAI_API_KEY),
      omni: Boolean(process.env.GEMINI_API_KEY),
      veo: Boolean(process.env.GEMINI_API_KEY),
      fal: Boolean(process.env.FAL_KEY),
      workerRequired: true,
      dataDirectory: process.env.VIRALCINE_DATA_DIR || '.data'
    }
  });
}
