import type { Timeline } from '@/lib/v7/domain/timeline';
import { timelineDurationSeconds } from '@/lib/v7/editor/timeline-engine';

export type MasterPlan = {
  timelineId: string;
  durationSeconds: number;
  frameRate: number;
  width: number;
  height: number;
  videoTrackCount: number;
  audioTrackCount: number;
  subtitleTrackCount: number;
  formats: Array<'mp4' | 'srt' | 'webvtt' | 'otio-json'>;
};

export function buildMasterPlan(timeline: Timeline): MasterPlan {
  const audioTypes = new Set(['dialogue', 'adr', 'ambience', 'foley', 'sfx', 'music']);
  return {
    timelineId: timeline.id,
    durationSeconds: timelineDurationSeconds(timeline),
    frameRate: timeline.frameRate,
    width: timeline.width,
    height: timeline.height,
    videoTrackCount: timeline.tracks.filter((track) => track.type === 'video').length,
    audioTrackCount: timeline.tracks.filter((track) => audioTypes.has(track.type)).length,
    subtitleTrackCount: timeline.tracks.filter((track) => track.type === 'subtitle').length,
    formats: ['mp4', 'srt', 'webvtt', 'otio-json']
  };
}
