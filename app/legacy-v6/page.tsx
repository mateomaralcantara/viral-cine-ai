import type { Metadata } from 'next';
import StudioApp from '@/components/StudioApp';

export const metadata: Metadata = {
  title: 'ViralCine 6 — Legacy',
  description: 'Interfaz legacy preservada únicamente como respaldo técnico.'
};

export default function LegacyV6Page() {
  return <StudioApp />;
}
