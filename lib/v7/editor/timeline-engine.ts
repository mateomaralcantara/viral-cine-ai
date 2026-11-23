import { randomUUID } from 'node:crypto';
import { TimelineSchema, type Timeline, type TimelineClip, type Track } from '@/lib/v7/domain/timeline';

export function createTimeline(input: {
  filmId: string;
  name?: string;
  frameRate?: number;
  width?: number;
  height?: number;
}): Timeline {
  return TimelineSchema.parse({
    id: randomUUID(),
    filmId: input.filmId,
    name: input.name || 'cut-v001',
    frameRate: input.frameRate || 24,
    width: input.width || 1920,
    height: input.height || 1080,
    tracks: [],
    transitions: [],
    metadata: { otioCompatibleModel: true }
  });
}

export function addTrack(timeline: Timeline, track: Track): Timeline {
  if (timeline.tracks.some((item) => item.id === track.id)) throw new Error('Track duplicado: ' + track.id);
  return TimelineSchema.parse({ ...timeline, tracks: [...timeline.tracks, structuredClone(track)] });
}

export function addClip(timeline: Timeline, trackId: string, clip: TimelineClip): Timeline {
  if (!timeline.tracks.some((track) => track.id === trackId)) throw new Error('Track inexistente: ' + trackId);
  const tracks = timeline.tracks.map((track) =>
    track.id === trackId ? { ...track, clips: [...track.clips, structuredClone(clip)] } : track
  );
  return TimelineSchema.parse({ ...timeline, tracks });
}

export function timelineDurationSeconds(timeline: Timeline) {
  return Math.max(0, ...timeline.tracks.flatMap((track) =>
    track.clips.map((clip) => clip.timelineStartSeconds + clip.timelineDurationSeconds)
  ));
}
