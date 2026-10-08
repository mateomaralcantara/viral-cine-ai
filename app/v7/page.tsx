import type { Metadata } from 'next';
import V7FeatureFilmOS from '@/components/V7FeatureFilmOS';

export const metadata: Metadata = {
  title: 'ViralCine 7 — Feature Film OS',
  description: 'Arquitectura de largometraje, continuidad, Voice DNA, jobs, QA, timeline y versionado.'
};

export default function ViralCine7Page() {
  return <V7FeatureFilmOS />;
}
