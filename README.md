# 🎧 SetForge — Gerador de Set List para DJs com IA

Plataforma para DJs criarem set lists inteligentes com integração Spotify, SoundCloud, YouTube e IA (Claude).

---

## 🗂️ Estrutura do projeto

```
setforge/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── search/route.ts          ← busca unificada (Spotify + SC + YT)
│   │   │   ├── spotify/route.ts         ← endpoints Spotify diretos
│   │   │   └── generate-setlist/route.ts ← geração com Claude IA
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                     ← página principal
│   ├── components/
│   │   ├── TrackSearch.tsx              ← busca com filtro de fontes
│   │   └── SetlistView.tsx              ← visualização do set list gerado
│   └── lib/
│       ├── types.ts                     ← todos os tipos TypeScript
│       ├── music-utils.ts               ← utilitários (BPM, Camelot Wheel)
│       ├── spotify.ts                   ← cliente Spotify API
│       ├── soundcloud.ts                ← cliente SoundCloud API
│       └── youtube.ts                   ← cliente YouTube API
├── .env.example                         ← modelo das variáveis de ambiente
├── .gitignore
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## 🚀 Como rodar localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie o arquivo de exemplo:
```bash
cp .env.example .env.local
```

Edite o `.env.local` com suas chaves (veja como obter cada uma abaixo).

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 🔑 Como obter as chaves de API

### Spotify (obrigatório)
1. Acesse [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Clique em **Create app**
3. Nome: `SetForge`, Redirect URI: `http://localhost:3000`
4. Copie o **Client ID** e **Client Secret**
5. Cole no `.env.local`:
   ```
   SPOTIFY_CLIENT_ID=seu_client_id
   SPOTIFY_CLIENT_SECRET=seu_client_secret
   ```

### Anthropic / Claude (obrigatório)
1. Acesse [console.anthropic.com](https://console.anthropic.com)
2. Vá em **API Keys** → **Create Key**
3. Cole no `.env.local`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

### SoundCloud (opcional)
1. Acesse [developers.soundcloud.com](https://developers.soundcloud.com)
2. Registre um app e obtenha o **Client ID**
3. Cole no `.env.local`:
   ```
   SOUNDCLOUD_CLIENT_ID=seu_client_id
   ```

### YouTube (opcional)
1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um projeto → Ative a **YouTube Data API v3**
3. Vá em **Credenciais** → **Criar chave de API**
4. Cole no `.env.local`:
   ```
   YOUTUBE_API_KEY=sua_chave
   ```

---

## 📦 Como subir no GitHub

```bash
# Na pasta do projeto
git init
git add .
git commit -m "feat: initial SetForge MVP"

# Crie um repositório no GitHub (github.com/new)
# Depois:
git remote add origin https://github.com/SEU_USUARIO/setforge.git
git branch -M main
git push -u origin main
```

> ⚠️ NUNCA suba o `.env.local` — ele já está no `.gitignore`.

---

## 🌐 Deploy (Vercel — recomendado)

1. Acesse [vercel.com](https://vercel.com) e conecte seu GitHub
2. Importe o repositório `setforge`
3. Em **Environment Variables**, adicione as mesmas chaves do `.env.local`
4. Clique em **Deploy** — pronto!

---

## 🗺️ Roadmap

- [x] MVP com busca Spotify
- [x] Geração de set list com IA
- [x] Busca unificada (Spotify + SoundCloud + YouTube)
- [ ] Autenticação de usuários (Clerk ou NextAuth)
- [ ] Salvar biblioteca de músicas (PostgreSQL + Prisma)
- [ ] Upload de áudio com análise automática de BPM (Essentia/librosa)
- [ ] Sistema de sugestões com validação por upload
- [ ] Plano freemium + assinaturas (Stripe)
- [ ] App mobile (React Native / Expo)

---

## 🛠️ Stack

- **Framework:** Next.js 14 (App Router)
- **Linguagem:** TypeScript
- **IA:** Claude (Anthropic SDK)
- **APIs:** Spotify, SoundCloud, YouTube Data API
- **Deploy:** Vercel
