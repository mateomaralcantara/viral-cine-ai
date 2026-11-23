import type { Timeline } from '@/lib/v7/domain/timeline';

export function exportTimelineAsOtioJson(timeline: Timeline) {
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name: timeline.name,
    global_start_time: null,
    metadata: {
      viralcine: {
        filmId: timeline.filmId,
        frameRate: timeline.frameRate,
        width: timeline.width,
        height: timeline.height
      }
    },
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      children: timeline.tracks.map((track) => ({
        OTIO_SCHEMA: 'Track.1',
        name: track.name,
        kind: track.type === 'video' || track.type === 'title' ? 'Video' : 'Audio',
        metadata: { viralcineTrackType: track.type },
        children: track.clips.map((clip) => ({
          OTIO_SCHEMA: 'Clip.2',
          name: clip.id,
          metadata: {
            assetId: clip.assetId,
            shotId: clip.shotId,
            takeId: clip.takeId,
            timelineStartSeconds: clip.timelineStartSeconds
          },
          source_range: {
            OTIO_SCHEMA: 'TimeRange.1',
            start_time: {
              OTIO_SCHEMA: 'RationalTime.1',
              value: clip.sourceStartSeconds * timeline.frameRate,
              rate: timeline.frameRate
            },
            duration: {
              OTIO_SCHEMA: 'RationalTime.1',
              value: clip.sourceDurationSeconds * timeline.frameRate,
              rate: timeline.frameRate
            }
          }
        }))
      }))
    }
  };
}
