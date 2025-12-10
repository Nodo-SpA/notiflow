import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Notiflow - Mensajería Escolar',
  description: 'Sistema de mensajería WhatsApp para colegios',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
