\# 📋 HANDOFF v4 — SetForge: do v2 ao v3



\*\*Data:\*\* 30 de setembro de 2026

\*\*Branch ativa:\*\* `v2`

\*\*Último commit:\*\* `b890dfe` — \*feat: import XML Rekordbox (9.378 faixas com rekordboxId)\*

\*\*Máquina:\*\* Notebook RTX 3050 Laptop (4 GB VRAM) — Windows 11



\---



\## 🚨 LEIA PRIMEIRO — 8 REGRAS DE OURO



\### 1. Bruno NÃO é dev



\*\*Ele:\*\*

\- Cola código que você manda

\- Roda 1 comando por vez

\- Tira print quando quebra

\- \*\*NÃO chuta\*\* — se não souber, \*\*pede `type` ou `findstr`\*\*



\*\*Você:\*\*

\- \*\*UMA mudança por vez\*\* (nunca 3 patches juntos)

\- \*\*Caminho completo\*\* do arquivo (`C:\\Users\\bruno\\setforge\\src\\...`)

\- \*\*Linha/trecho exato\*\* pra editar

\- \*\*`npx tsc --noEmit`\*\* depois de cada mudança

\- \*\*Peça output\*\* (terminal) ou \*\*print\*\* (VSCode) antes de seguir

\- \*\*NUNCA chute\*\* — se não sabe o estado do arquivo, \*\*peça `type` ou `findstr`\*\*

\- \*\*Ofereça opções (A, B, C)\*\* com prós/contras

\- \*\*Seja direto\*\* — Bruno tá cansado, quer o comando



\### 2. Estado atual (30/set/2026, 15h)



| Item | Valor |

|---|---|

| \*\*Branch\*\* | `v2` |

| \*\*Último commit\*\* | `b890dfe` |

| \*\*Faixas no Neon\*\* | \*\*9.378\*\* (todas do Rekordbox, com `rekordboxId`) |

| \*\*Faixas analisadas\*\* (`segments`) | \*\*0\*\* (import só trouxe metadados) |

| \*\*Banco Neon\*\* | \~15 MB usados (de \~500 MB no Free) |

| \*\*Driver NVIDIA\*\* | 617.14 |

| \*\*CUDA\*\* | 12.4 (PyTorch) |

| \*\*`fast-xml-parser`\*\* | ✅ Instalado |

| \*\*XML do Rekordbox\*\* | `C:\\Users\\bruno\\OneDrive\\Desktop\\rekordbox-full.xml` |

| \*\*TSP\*\* | ✅ Implementado em `src/lib/tsp.ts` (score 100/100 no teste) |



\### 3. O que JÁ funciona (v2)



| Feature | Status |

|---|---|

| Upload manual + análise GPU + S-KEY | ✅ |

| Setlist IA (OpenRouter `gpt-4o-mini`) | ✅ |

| Cadeia completa A→B→C→…→T | ✅ |

| Snap de barras (16/8/4) | ✅ |

| Score + alternativas de mix point | ✅ |

| Sugestões de substituta | ✅ |

| \*\*Export Rekordbox XML (hot cues A/B/C/D)\*\* | ✅ |

| Matriz escondida | ✅ |

| Timeline sobrevive F5 | ✅ |



\### 4. O que JÁ foi feito pro v3 (Fase 1 completa)



\- ✅ \*\*`src/lib/rekordbox-import.ts`\*\* — parser do XML do Rekordbox

\- ✅ \*\*`tonalityToCamelot()`\*\* — converte `F#m → 11A`, `Gm → 6A`

\- ✅ \*\*`src/lib/tsp.ts`\*\* — algoritmo TSP (nearest neighbor + 2-opt + or-opt)

\- ✅ \*\*`src/app/api/import-rekordbox-xml/route.ts`\*\* — rota que importa o XML

\- ✅ \*\*`rekordboxId String? @unique`\*\* no schema `Track`

\- ✅ \*\*9.378 faixas importadas\*\* com `rekordboxId` único (zero duplicata)

\- ✅ \*\*`test-tsp.mjs`\*\* — teste do TSP (score 100/100)



\### 5. O que FALTA pro v3 (Fases 2-5)



| Fase | O que | Tempo |

|---|---|---|

| \*\*2\*\* | Rota `POST /api/generate-smart-setlist` | 4h |

| \*\*3\*\* | Análise sob demanda (só das 30) | 5h |

| \*\*4\*\* | Regra "não repetir" (últimos 4 setlists) | 3h |

| \*\*5\*\* | UI nova (botão + modal) | 5h |

| \*\*6\*\* | Testes | 3h |

| \*\*TOTAL\*\* | | \*\*\~20h\*\* |



\### 6. Decisões tomadas (NÃO MUDAR)



\#### Fase 2 — TSP

\- \*\*Algoritmo:\*\* TSP aproximado (nearest neighbor + 2-opt + or-opt)

\- \*\*Já tá em `src/lib/tsp.ts`\*\*

\- \*\*Score 100/100\*\* no teste com 9.378 faixas

\- \*\*Tempo:\*\* \~1,3s



\#### Fase 3 — Análise sob demanda

\- \*\*Só as 30 escolhidas\*\* são analisadas pela GPU

\- \*\*NÃO analisar as 9.378\*\* (levaria 17 dias)

\- \*\*\~150s por faixa\*\* → 30 faixas = \~75 min

\- \*\*Fila persistente\*\* no banco (retoma se o PC reiniciar)



\#### Fase 4 — Regra "não repetir"

\- \*\*Exclui\*\* faixas usadas nos \*\*últimos 4 setlists\*\*

\- \*\*Query:\*\* `JOIN` com `SetlistTrack` dos últimos 4 setlists do usuário

\- \*\*Depois de 4 setlists\*\*, a faixa fica disponível de novo



\#### Fase 5 — UI

\- \*\*Botão `📥 importar XML`\*\* no header

\- \*\*Botão `✦ gerar setlist inteligente`\*\* no painel de música

\- \*\*Modal\*\* com filtros (BPM, Camelot, duração do set)

\- \*\*Progresso\*\* visível (`12/30 analisadas`)



\### 7. Schema — detalhes importantes



```prisma

model Track {

&#x20; id            String   @id @default(cuid())

&#x20; userId        String

&#x20; folderId      String?

&#x20; title         String

&#x20; artist        String   @default("")

&#x20; bpm           Int      @default(0)

&#x20; key           String   @default("")   // Camelot (8A, 4B)

&#x20; energy        Int      @default(7)

&#x20; durationSec   Float    @default(0)

&#x20; firstBeatSec  Float    @default(0)

&#x20; segments      Json?                   // análise GPU (Fase 3)

&#x20; fileHash      String?

&#x20; rekordboxId   String?  @unique        // 🆕 TrackID do Rekordbox

&#x20; // ...

}

```



\*\*⚠️ Importante:\*\*

\- \*\*`bpm` é `Int`\*\* (trunca float do XML)

\- \*\*`key` é Camelot\*\* (`8A`) — já convertido pelo `tonalityToCamelot`

\- \*\*`segments` é `null`\*\* nas 9.378 (análise GPU vem na Fase 3)

\- \*\*`firstBeatSec` é `0`\*\* (a gente ignora `<TEMPO>` do XML)



\### 8. Comandos pra subir



```cmd

cd C:\\Users\\bruno\\setforge

start.bat

```



\*\*Antes de `prisma generate`:\*\*

```cmd

taskkill /F /IM node.exe

taskkill /F /IM python.exe

timeout /t 3

npx prisma generate

```



\### 9. Máquina — particularidades



| Item | Valor |

|---|---|

| \*\*FFmpeg\*\* | `C:\\ffmpeg\\ffmpeg-n7.1.1-...-shared-7.1\\bin` (shared) |

| \*\*Python principal\*\* | 3.12.9 (`.venv`) |

| \*\*Python S-KEY\*\* | 3.11 (`.venv-skey`) |

| \*\*`TORCHAUDIO\_USE\_BACKEND=soundfile`\*\* | Obrigatório |

| \*\*`HF\_HUB\_DISABLE\_SYMLINKS=1`\*\* | Obrigatório |

| \*\*`HF\_HUB\_DISABLE\_XET=1`\*\* | Obrigatório |

| \*\*`ANALYZE\_LOCK`\*\* | Serializa análises |

| \*\*`multiprocess=False`\*\* | Evita órfãos |

| \*\*`demucs\_overlap=0.25`\*\* | \~40% mais rápido |

| \*\*`NEXT\_PUBLIC\_SETFORGE\_EXPORT\_PATH`\*\* | `C:\\Users\\bruno\\SetForge-Export` (`.env.local`) |



\---



\## 🎯 PRÓXIMO PASSO — FASE 2



\### \*\*Criar `POST /api/generate-smart-setlist`\*\*



\*\*Requisitos:\*\*



1\. \*\*Auth:\*\* `getServerSession(authOptions)` (copiar padrão do `list-subfolders/route.ts`)

2\. \*\*Input:\*\* filtros opcionais do usuário

&#x20;  ```typescript

&#x20;  {

&#x20;    bpmTarget?: number      // ex: 124

&#x20;    bpmRange?: number       // ex: 10 (aceita 124 ± 10)

&#x20;    camelotStrict?: boolean // se true, só Camelot compatível (score >= 85)

&#x20;    setSize?: number        // default: 30

&#x20;  }

&#x20;  ```

3\. \*\*Lê as 9.378 faixas do Neon\*\* (só as que têm `bpm > 0`)

4\. \*\*Exclui\*\* as usadas nos últimos 4 setlists (regra do Bruno)

5\. \*\*Aplica filtros:\*\*

&#x20;  - BPM: `|track.bpm - bpmTarget| <= bpmRange`

&#x20;  - Camelot: se `camelotStrict`, só aceita score >= 85

6\. \*\*Roda o TSP\*\* (`src/lib/tsp.ts`)

7\. \*\*Retorna:\*\* 30 faixas ordenadas + score médio + estatísticas

8\. \*\*NÃO faz análise GPU\*\*



\### \*\*Performance crítica\*\*



\*\*9.378 × 9.378 comparações = 88M\*\* → \*\*inviável em tempo real\*\*.



\*\*Solução (do `test-tsp.mjs`):\*\*

\- \*\*Pré-filtro por BPM\*\* → reduz pra \~7.178 (com `bpm=124, range=10`)

\- \*\*Multi-start (100 sementes)\*\* + \*\*2-opt\*\* + \*\*or-opt\*\*

\- \*\*\~1,3s\*\* com 7.178 candidatas



\*\*Se passar dos 2s, reduzir pra 50 sementes.\*\*



\### \*\*Onde ver o padrão das rotas\*\*



\*\*Copiar de:\*\* `C:\\Users\\bruno\\setforge\\src\\app\\api\\list-subfolders\\route.ts`



```typescript

import { NextRequest, NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'

// ...

import { prisma } from '@/lib/prisma'



export async function POST(req: NextRequest) {

&#x20; try {

&#x20;   const session = await getServerSession(authOptions)

&#x20;   if (!session?.user?.id) {

&#x20;     return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

&#x20;   }

&#x20;   // ...

&#x20;   return NextResponse.json({ ... })

&#x20; } catch (error) {

&#x20;   console.error('\[api/generate-smart-setlist] Erro:', error)

&#x20;   const message = error instanceof Error ? error.message : 'Erro desconhecido'

&#x20;   return NextResponse.json(

&#x20;     { error: `Erro: ${message}` },

&#x20;     { status: 500 }

&#x20;   )

&#x20; }

}

```



\---



\## 🎯 ONDE PARAMOS (fim da sessão de 30/set)



\*\*Tudo commitado e sincronizado:\*\*

\- `b890dfe` — \*feat: import XML Rekordbox (9.378 faixas com rekordboxId)\*



\*\*O Bruno tem:\*\*

\- 9.378 faixas no Neon (com `rekordboxId`)

\- TSP funcionando (`test-tsp.mjs`)

\- `import-rekordbox-xml` rodando

\- Export Rekordbox (hot cues) da v2



\*\*O Bruno quer:\*\*

\- Rota `generate-smart-setlist` (Fase 2)

\- Análise sob demanda (Fase 3)

\- Regra "não repetir" (Fase 4)

\- UI nova (Fase 5)



\---



\## 🎯 PRIMEIRA MENSAGEM PRO NOVO CHAT



\*\*Cola isso:\*\*



> \*"Estou continuando o SetForge. Handoff v4 abaixo.\*

>

> \*Estado: Fase 1 completa (9.378 faixas importadas do Rekordbox). Falta a Fase 2 (rota `generate-smart-setlist`).\*

>

> \*Sou DJ (não dev): uma mudança por vez, caminho completo do arquivo, e me peça output/print a cada passo.\*

>

> \*Lê TUDO antes de começar, principalmente as 8 regras de ouro.\*

>

> \*Começar por: Fase 2 — rota `POST /api/generate-smart-setlist`."\*



\---



\## 🎯 CHECKLIST ANTES DE ABRIR O NOVO CHAT



\- \[ ] `git status` limpo (ou commit pendente salvo)

\- \[ ] Branch `v2`

\- \[ ] Último commit: `b890dfe`

\- \[ ] 9.378 faixas no Neon (com `rekordboxId`)

\- \[ ] `fast-xml-parser` instalado

\- \[ ] XML em `C:\\Users\\bruno\\OneDrive\\Desktop\\rekordbox-full.xml`

\- \[ ] TSP testado (`test-tsp.mjs`)

\- \[ ] Driver 617.14 + CUDA 12.4

\- \[ ] \*\*Output do `list-subfolders/route.ts` em mãos\*\* (padrão pra copiar)



\---



\*\*Fim do handoff v4.\*\* 🎧

