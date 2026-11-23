import type { Metadata } from 'next';
import V7FeatureFilmOS from '@/components/V7FeatureFilmOS';

export const metadata: Metadata = {
  title: 'ViralCine 7 — Arquitectura',
  description: 'Arquitectura interna del Feature Film OS.'
};

export default function ViralCine7SystemPage() {
  return <V7FeatureFilmOS />;
}
