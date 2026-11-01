import type { Metadata } from 'next';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'ViralCine 7 — Feature Film OS',
  description: 'Crea cortos y largometrajes con un pipeline cinematográfico modular, seguro, recuperable y progresivamente endurecido.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
