# 📋 HANDOFF v4 — Snap de Barra + Descoberta de Mix Points

**Data:** 25 de setembro de 2026
**Repositório:** https://github.com/sgbrb/setforge
**Máquina:** Notebook RTX 3050 Laptop (4 GB VRAM) — Windows 11
**Stack:** Next.js 14 + TypeScript + Prisma + Neon + Flask + S-KEY + OpenRouter

---

## 🎯 CONTEXTO RÁPIDO

O SetForge é um app de DJ que:
1. Faz upload de faixas de música (upload em lote)
2. Analisa cada faixa via GPU (demucs + Librosa + S-KEY) → produz `AudioAnalysis` com `segments` (intro, inst, chorus, drop, etc)
3. Gera setlists via IA (OpenRouter) com ordem ótima + notas de mixagem
4. Calcula a **timeline de mixagem** (onde dar play na próxima, quando crossfade, quando cortar)

**Estado atual:** 100% funcional end-to-end. Upload, análise, persistência (Neon), geração de setlist, timeline com `playBAt`, matriz de compatibilidade, pastas, drag & drop, restauração após F5 — **tudo funcionando**.

**Bug resolvido recentemente:** timeline sumia após F5. Fix: `trackId` no `SetlistTrack` + fallback `t.trackId || t.id` no `/api/setlist`.

---

## 🎯 O PROBLEMA DESTA CONVERSA

O `playBAt` (ponto onde o DJ dá play na próxima faixa) está **caindo no meio de barras** ao invés de cair **no início de frases musicais limpas** (múltiplos de 4/8/16 barras).

**Exemplo concreto:**
- Faixa A: `mark-michael-dream-machine` (5A, 133 BPM, 6:23)
- Faixa B: `talismann-ufo-flute` (5A, 133 BPM, 5:24)
- O app diz: **"dê play na B aos 2:37"**
- No Rekordbox, o beat grid mostra que **2:37.2 cai no meio da barra 87** (offset +0.2s)

**Causa raiz:**
1. O algoritmo `findIntroEnd` acha o fim da intro (`2:28`), mas **não considera o beat grid real** (offset do primeiro beat detectado)
2. Arredonda pra "próxima barra" matematicamente (`148s / 1.8045s = 82.0 barras`), sem usar o grid
3. **Não faz snap pra múltiplos de 4/8/16 barras** — então cai "no meio do nada"

**O que o usuário quer:**
- Pontos de mixagem **musicalmente limpos** (início de frase de 8/16/32 barras)
- **Offset do grid visível** na UI (pra saber se o ponto bate ou não)
- Idealmente, algoritmo que **escolhe o melhor par (saída A, entrada B)** entre vários candidatos

---

## ✅ DECISÕES JÁ TOMADAS PELO USUÁRIO

### Decisão 1 — Escopo (era a pergunta "quantas barras?")

**Resposta escolhida: (E) Inteligente** — escolhe a **menor frase** que caiba depois do fim da intro, com prioridade pra múltiplos de 4 (8/16/32). DJs mixam em múltiplos de 4 barras.

**Implementação:**
```
1. Achar fim da intro/inst (ex: 2:28)
2. Calcular beat grid real (primeiro beat + BPM)
3. Achar próxima barra cheia ≥ 2:28
4. Se offset do grid > 0.05s, snap pra próxima frase de 8 barras
5. Senão, snap pra frase de 4 barras
6. Retornar o ponto + offset pro grid
```

### Decisão 2 — UI do offset (era a pergunta "como mostrar?")

**Resposta escolhida: (C)** — mostrar `2:37.20` + "barra #87.0" + **⚠️** quando offset for > 0.05s

**Formato visual:**
```
▶ Dê play na próxima faixa aos 2:37.20 da "ufo-flute"
   barra #87.0 · ⚠️ offset +0.20s do grid
   o beat principal entra em 2:28, alinhado com o crossfade
```

### Decisão 3 — Não fazer paliativo

**Resposta escolhida: NÃO** — o usuário não quer o paliativo de mostrar `2:37.20` sem snap. Vai direto pro fix completo.

---

## 🎯 O QUE PRECISA SER IMPLEMENTADO

### Peça 1 — `firstBeatSec` na análise (Python/Flask)

**Onde:** `app.py` (análise estrutural via Librosa)

**O que fazer:** o Librosa `beat.beat_track` retorna `(tempo, beats)`. Hoje o `app.py` só usa `tempo`. Precisa também salvar **o primeiro beat detectado** (`beats[0]`) como `firstBeatSec`.

**Saída esperada:** o `AudioAnalysis` que vai pro banco ganha 1 campo novo:
```json
{
  "bpm": 133,
  "key": "5A",
  "firstBeatSec": 0.15,
  "segments": [...]
}
```

**Importante:** esse `firstBeatSec` é usado pra calcular o grid real. Fórmula:
```
beat_duration = 60 / bpm
bar_duration = beat_duration * 4
barra_n_segundo(s) = (s - firstBeatSec) / bar_duration
```

### Peça 2 — Snap no `mix-timeline.ts` (TypeScript)

**Onde:** `src/lib/mix-timeline.ts`

**O que fazer:**

1. **Nova função `snapToBar(sec, analysis, targetBars = 8)`**:
   - Recebe um segundo e o `AudioAnalysis` (com `firstBeatSec` e `bpm`)
   - Calcula `bar_offset = (sec - firstBeatSec) / bar_duration`
   - Arredonda pra cima pro **próximo múltiplo de `targetBars`**
   - Retorna `{ snappedSec, barNumber, offsetFromGrid }`

2. **Atualizar `findIntroEnd` (ou equivalente)** pra usar `snapToBar`:
   - Em vez de retornar `introEnd + arredondamento matemático`, retorna `snapToBar(introEnd, analysis, 8)`
   - Se `offsetFromGrid > 0.05s`, tenta `snapToBar(..., 16)` e escolhe o que ficar mais próximo

3. **Nova função `discoverMixPoints`** (a conversa de antes — a parte "global"):
   - Recebe `(trackA, trackB, analysisA, analysisB, durationA, durationB, startOffsetA)`
   - Lista **todos** os pontos candidatos:
     - Saída da A: fim de chorus, fim de drop, fim de breakdown, início do outro
     - Entrada da B: fim do intro, início de cada drop, início de cada chorus
   - Para cada par, calcula score (Camelot + BPM + energia + estrutura + **snap limpo**)
   - Retorna o par de maior score + top 3 alternativas

4. **Atualizar `calculateMixTimeline`** pra:
   - Receber `startOffsetA` (onde a faixa A começa no set — default 0)
   - Deslocar **todos os tempos da A** por esse offset
   - Chamar `discoverMixPoints` e usar o melhor par
   - Devolver `score`, `reasons` e `alternatives` no objeto

### Peça 3 — UI no `SetlistView.tsx`

**Onde:** `src/components/SetlistView.tsx`

**O que fazer:**

1. **Mostrar `playBAt` com décimos** (`2:37.20` em vez de `2:37`)
2. **Mostrar número da barra** (`barra #87.0`)
3. **⚠️ quando offset > 0.05s**
4. **Colapsar as 3 instruções atuais** atrás de um "ver detalhes" (opcional, se quiser)
5. **Mostrar alternativas** (top 3) num painel colapsável com botão "mudar mix point" (se decidir implementar)

---

## 📁 ARQUIVOS-CHAVE

| Arquivo | O que faz |
|---|---|
| **`app.py`** | Flask + análise estrutural (Librosa). **Precisa adicionar `firstBeatSec`** |
| `src/lib/mix-timeline.ts` | `AudioAnalysis`, `calculateMixTimeline`, `findIntroEnd`, `playBAt`. **Coração das mudanças** |
| `src/lib/optimal-order.ts` | `computeOptimalOrder`, `scoreOrder`, `buildCompatibilityMatrix` |
| `src/lib/harmonic-utils.ts` | BPM + Camelot + `getTransitionScore` |
| `src/components/SetlistView.tsx` | Setlist + timeline + matriz + alerta. **UI das mudanças** |
| `src/app/page.tsx` | Página principal — orquestra tudo |
| `src/app/api/tracks/route.ts` | CRUD de faixas (retorna `segments`) |
| `src/app/api/setlist/route.ts` | GET com `?folderId=` (fix recente) |
| `src/app/api/generate-setlist/route.ts` | OpenRouter + Prisma (fix recente: `trackId`) |
| `prisma/schema.prisma` | Schema com `folderId` em Setlist + `trackId` em SetlistTrack |

---

## ⚠️ ESTADO DO GIT — VERIFICAR ANTES DE COMEÇAR

Rodar no começo da próxima conversa:

```cmd
cd C:\Users\bruno\setforge
git status
git log --oneline -5
```

**Último commit esperado:** `fix: preservar trackId no SetlistTrack (timeline sobrevive ao F5)` ou similar.

Se tiver mudanças não commitadas, **commitar primeiro**:

```cmd
git add .
git commit -m "feat: setlist por pasta + trackId preserva timeline após F5"
git push origin main
```

---

## 🔑 PREFERÊNCIAS DE COMUNICAÇÃO

- **Idioma:** português brasileiro
- **Formato:** passo a passo numerado, código pronto pra copiar
- **Sempre dizer o caminho completo** do arquivo
- **Verificar onde** está cada coisa antes de editar
- **Testar em etapas pequenas**
- **Usuário cansado** — ir direto ao ponto, sem rodeios
- **Não fingir que sabe** — se precisar ver o log, pedir o log. **Não chutar.**
- **Usuário gosta de opções (A, B, C)** — sempre oferecer escolhas com prós/contras
- **Se o usuário pedir "o arquivo completo"**, mandar o **arquivo inteiro** (não snippet)

---

## ⚙️ PARTICULARIDADES DA MÁQUINA

| Item | Valor |
|---|---|
| **FFmpeg** | `C:\ffmpeg\ffmpeg-n7.1.1-...-shared-7.1\bin` (shared build) |
| **Python principal** | 3.12.9 (`.venv`) |
| **Python S-KEY** | 3.11 (`.venv-skey`) |
| **Node.js** | v24.21.0 |
| **torch** | 2.6.0+cu124 |
| **GPU** | RTX 3050 Laptop, 4 GB VRAM |
| **`ANALYZE_LOCK`** | Serializa análises no `app.py` |
| **`multiprocess=False`** | Evita processos filhos órfãos |
| **`TORCHAUDIO_USE_BACKEND=soundfile`** | Obrigatório |
| **`HF_HUB_DISABLE_SYMLINKS=1`** | Obrigatório |
| **`HF_HUB_DISABLE_XET=1`** | Obrigatório |
| **`demucs_fp16=True`** | ~2x mais rápido |
| **`demucs_overlap=0.25`** | ~40% mais rápido |

### Comandos pra subir

```cmd
cd C:\Users\bruno\setforge
start.bat
```

Ou manual:
```cmd
REM Terminal 1
.venv\Scripts\activate
python run_server.py

REM Terminal 2
npm run dev
```

### Antes de `prisma generate`

**Matar processos** (senão dá `EPERM: operation not permitted`):

```cmd
taskkill /F /IM node.exe
taskkill /F /IM python.exe
taskkill /F /IM pythonw.exe
timeout /t 3
npx prisma generate
```

---

## 🎯 PLANO DE IMPLEMENTAÇÃO (ORDEM)

### Fase 1 — `firstBeatSec` na análise

1. Abrir `app.py`
2. Achar onde o Librosa `beat_track` é chamado
3. Salvar `beats[0]` (primeiro beat) como `firstBeatSec`
4. Adicionar `firstBeatSec` no dict do `AudioAnalysis` que vai pro banco
5. **Atenção:** análises antigas não têm `firstBeatSec`. Tratar como `firstBeatSec = 0` no frontend (fallback)

### Fase 2 — `snapToBar` no `mix-timeline.ts`

1. Adicionar função `snapToBar(sec, analysis, targetBars)`
2. Adicionar função `barNumberAt(sec, analysis)`
3. Adicionar função `offsetFromGrid(sec, analysis)`
4. Atualizar `findIntroEnd` pra usar `snapToBar`

### Fase 3 — `discoverMixPoints`

1. Adicionar tipo `MixPointCandidate`
2. Adicionar função `discoverMixPoints` com score
3. Integrar no `calculateMixTimeline`
4. Adicionar `startOffsetA` como parâmetro

### Fase 4 — UI no `SetlistView.tsx`

1. Mostrar `playBAt` com décimos
2. Mostrar barra + offset
3. Adicionar ⚠️ se offset > 0.05s
4. (Opcional) painel de alternativas

### Fase 5 — Cadeia sequencial no `SetlistView.tsx`

1. Iterar `setlist.setlist` acumulando `currentOffset`
2. Passar `currentOffset` pra `calculateMixTimeline`
3. Atualizar `currentOffset` = `playBAtSec + crossfadeDurationSec` da transição atual

---

## 🎯 PRIMEIRA MENSAGEM SUGERIDA PRA NOVA CONVERSA

> "Estou continuando o SetForge. Handoff v4 abaixo. Quero implementar o snap de barras + descoberta de mix points. Já decidi:
>
> - **Escopo:** (E) Inteligente — menor frase que caiba depois do fim da intro, prioridade pra múltiplos de 4 (8/16/32)
> - **UI:** (C) — mostrar `2:37.20` + barra #87.0 + ⚠️ se offset > 0.05s
> - **Não** quero paliativo — vai direto pro fix completo
>
> Começa por: **[escolher: Fase 1 / Fase 2 / Fase 3 / Fase 4 / Fase 5]**"

---

## ⚠️ AVISOS IMPORTANTES

1. **Não esquecer o `firstBeatSec` nas análises antigas** — tratar como 0 (fallback). Senão o app quebra com faixas já analisadas.

2. **O `startOffsetA`** (offset acumulado da cadeia) precisa ser calculado **em série** no `SetlistView`, não em paralelo. Cada transição herda o offset da anterior.

3. **Não modificar o `findIntroEnd` diretamente** — criar `snapToBar` **em paralelo**, e só depois integrar. Assim dá pra reverter se der ruim.

4. **Testar com faixas reais** (dream-machine → ufo-flute). Comparar o `playBAt` novo com o antigo e ver se ficou musicalmente melhor.

5. **O modelo OpenRouter atual** é `nex-agi/nex-n2.5-mini:free` (grátis, expira 25/set/2026). **Depois** trocar pra `openai/gpt-4o-mini` (usuário já colocou $10 de crédito).

---

## 📌 PRÓXIMAS FEATURES (depois dessa)

1. **Player integrado** — preview das faixas antes de tocar
2. **Exportar PDF** — setlist pro celular
3. **Análise preditiva** — sugerir próximas faixas por similaridade
4. **`cueIn`/`cueOut`** — cortar intro/outro sem afetar análise
5. **Editar transição manualmente** — mudar `playBAt`/`crossfade` na UI
6. **Multi-usuário** — compartilhar setlists

---

**Fim do handoff v4.** 🎧