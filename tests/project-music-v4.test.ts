import test from 'node:test';
import assert from 'node:assert/strict';
import { shotTimelineOffsetSeconds } from '@/lib/engine/project-music-v4';
import type { FilmProject } from '@/lib/domain/schemas';

const project = {
  id: 'p',
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
  status: 'planned',
  input: {
    title: 'Prueba',
    premise: 'Premisa suficientemente larga para pruebas automatizadas.',
    durationMinutes: 5,
    genre: 'Drama',
    audience: 'General',
    visualStyle: 'Cinematográfico',
    language: 'es',
    aspectRatio: '16:9',
    budgetUsd: 20,
    burnSubtitles: false,
    generateMusic: true
  },
  plan: {
    logline: '',
    synopsis: '',
    creativeDirection: '',
    musicPrompt: 'instrumental',
    characters: [{
      id: 'c1',
      name: 'A',
      role: 'lead',
      age: 30,
      appearance: '',
      wardrobe: '',
      personality: '',
      voiceInstructions: '',
      voiceProvider: 'elevenlabs',
      imagePrompt: ''
    }],
    scenes: [
      {
        id: 's1',
        order: 1,
        act: 1,
        title: 'S1',
        durationSeconds: 12,
        summary: '',
        narration: '',
        dialogue: '',
        dialogueTurns: [],
        visualPrompt: '',
        negativePrompt: '',
        camera: '',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: [],
        shots: [
          {
            id: 'a',
            order: 1,
            title: 'A',
            durationSeconds: 4,
            visualPrompt: '',
            camera: '',
            spokenText: '',
            dialogueLines: [],
            mode: 'video',
            characterIds: [],
            status: 'pending'
          },
          {
            id: 'b',
            order: 2,
            title: 'B',
            durationSeconds: 8,
            visualPrompt: '',
            camera: '',
            spokenText: '',
            dialogueLines: [],
            mode: 'video',
            characterIds: [],
            status: 'pending'
          }
        ],
        status: 'pending'
      },
      {
        id: 's2',
        order: 2,
        act: 1,
        title: 'S2',
        durationSeconds: 6,
        summary: '',
        narration: '',
        dialogue: '',
        dialogueTurns: [],
        visualPrompt: '',
        negativePrompt: '',
        camera: '',
        soundDesign: '',
        transition: '',
        mode: 'ai-video',
        characterIds: [],
        shots: [{
          id: 'c',
          order: 1,
          title: 'C',
          durationSeconds: 6,
          visualPrompt: '',
          camera: '',
          spokenText: '',
          dialogueLines: [],
          mode: 'video',
          characterIds: [],
          status: 'pending'
        }],
        status: 'pending'
      }
    ]
  },
  progress: {
    phase: 'planned',
    percent: 0,
    message: '',
    updatedAt: '2026-10-04T00:00:00.000Z'
  },
  productionLog: []
} satisfies FilmProject;

test('calcula offset musical continuo por orden de tomas', () => {
  assert.equal(shotTimelineOffsetSeconds(project, 's1', 'a'), 0);
  assert.equal(shotTimelineOffsetSeconds(project, 's1', 'b'), 4);
  assert.equal(shotTimelineOffsetSeconds(project, 's2', 'c'), 12);
});
