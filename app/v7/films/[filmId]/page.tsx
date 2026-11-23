import type { Metadata } from 'next';
import V7FilmWorkspace from '@/components/V7FilmWorkspace';

export const metadata: Metadata = {
  title: 'ViralCine 7 — Film Workspace'
};

type Props = { params: Promise<{ filmId: string }> };

export default async function ViralCine7FilmPage({ params }: Props) {
  const { filmId } = await params;
  return <V7FilmWorkspace filmId={filmId} />;
}
