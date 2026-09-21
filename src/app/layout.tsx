import type { Metadata } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-sans' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'SetForge — Gerador de Set List para DJs',
  description: 'Crie set lists profissionais com IA. Integração com Spotify, SoundCloud e YouTube.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}