import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateFromRunwayDryRun,
  estimateVertexVideoCandidates,
  rankSafeVideoCandidates
} from '@/lib/engine/safe-provider-compare-v6';

test('Vertex Veo 3.1 Lite 8s 720p estima US$0.24', () => {
  const candidates = estimateVertexVideoCandidates(8, '720p');
  const lite = candidates.find(
    (item) => item.model === 'veo-3.1-lite-generate-001'
  );

  assert.equal(lite?.estimatedUsd, 0.24);
});

test('Runway dry run 24 créditos equivale a US$0.24', () => {
  const item = candidateFromRunwayDryRun({
    model: 'grok_imagine_1_5_lite',
    credits: 24,
    durationSeconds: 8,
    resolution: '720p'
  });

  assert.equal(item.estimatedUsd, 0.24);
});

test('Safe provider comparator bloquea candidatos sobre US$0.50', () => {
  const runway = candidateFromRunwayDryRun({
    model: 'grok_imagine_1_5_lite',
    credits: 24,
    durationSeconds: 8,
    resolution: '720p'
  });
  const vertex = estimateVertexVideoCandidates(8, '720p');
  const result = rankSafeVideoCandidates(
    [runway, ...vertex],
    0.50
  );

  assert.equal(result.eligible.length, 2);
  assert.equal(result.rejected.length, 2);
  assert.equal(result.winner?.estimatedUsd, 0.24);
});
