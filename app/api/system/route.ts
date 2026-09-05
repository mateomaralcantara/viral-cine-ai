import { NextResponse } from 'next/server';
import { checkFfmpeg } from '@/lib/media/ffmpeg-check';
import { hasUsableCredential, safetyStatus } from '@/lib/engine/production-safety';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const safety = safetyStatus();
  return NextResponse.json({
    ok: true,
    system: {
      mode: safety.mode,
      externalCallsEnabled: safety.externalCallsEnabled,
      paidGenerationEnabled: safety.paidGenerationEnabled,
      safetyReason: safety.reason,
      ffmpeg: await checkFfmpeg(),
      script: hasUsableCredential('OPENAI_API_KEY'),
      images: hasUsableCredential('OPENAI_API_KEY'),
      voice: hasUsableCredential('OPENAI_API_KEY'),
      omni: hasUsableCredential('GEMINI_API_KEY'),
      veo: hasUsableCredential('GEMINI_API_KEY'),
      fal: hasUsableCredential('FAL_KEY'),
      workerRequired: true,
      dataDirectory: process.env.VIRALCINE_DATA_DIR || '.data'
    }
  });
}
