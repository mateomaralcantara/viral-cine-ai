import type { Metadata } from 'next';
import V7StudioHome from '@/components/V7StudioHome';

export const metadata: Metadata = {
  title: 'ViralCine 7 — Crear película',
  description: 'Cortos y largometrajes con pipeline cinematográfico modular, seguro y recuperable.'
};

export default function ViralCine7Page() {
  return <V7StudioHome />;
}
