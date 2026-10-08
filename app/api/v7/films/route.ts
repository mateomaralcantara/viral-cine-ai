import { NextResponse } from 'next/server';
import { listV7FilmBundles } from '@/lib/v7/storage/film-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const bundles = await listV7FilmBundles();
  return NextResponse.json({
    ok: true,
    films: bundles.map((bundle) => {
      const sequences = bundle.film.acts.flatMap((act) => act.sequences);
      const scenes = sequences.flatMap((sequence) => sequence.scenes);
      const shots = scenes.flatMap((scene) => scene.shots);
      return {
        id: bundle.film.id,
        title: bundle.film.title,
        durationMinutes: bundle.film.durationMinutes,
        acts: bundle.film.acts.length,
        sequences: sequences.length,
        scenes: scenes.length,
        shots: shots.length,
        characters: bundle.film.characters.length,
        savedAt: bundle.savedAt
      };
    }),
    externalApis: false,
    apiCostUsd: 0
  });
}
