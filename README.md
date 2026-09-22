# 🎧 SetForge — Gerador de Set List para DJs

**Crie set lists profissionais em segundos — com harmonia, BPM e mixagem calculados por IA.**

O SetForge é uma ferramenta para DJs que querem montar sets coerentes sem perder horas quebrando a cabeça com Camelot, BPM e estrutura das faixas. Você sobe suas músicas, escolhe o tipo de evento e a vibe da pista — a IA monta a sequência pra você, com **timeline de mixagem** (quando soltar cada faixa, quando fazer o crossfade, quando desligar a anterior).

---

## 🎯 O que o SetForge faz

| Recurso | O que significa na prática |
|---|---|
| **Análise de BPM** | O BPM é detectado automaticamente quando você sobe o MP3 — sem precisar de software externo |
| **Análise estrutural** | A IA identifica intro, verse, chorus, drop, breakdown e outro de cada faixa |
| **Harmonia Camelot** | As faixas são organizadas pela tonalidade compatível, pra mixagem suave |
| **Curva de energia** | Você escolhe se o set aquece devagar, mantém alta, ou faz pico no meio |
| **Timeline de mixagem** | Instruções exatas: *"solte a próxima faixa em 1:45"*, *"crossfade de 32 barras"* |
| **Set list salvo** | Cada set gerado fica salvo na sua conta (banco de dados na nuvem) |

---

## 🚀 Como usar — passo a passo

### 1. Criar conta

Acesse o site e faça login (ou crie uma conta). É rápido — só e-mail e senha.

### 2. Subir suas músicas

Na seção **"biblioteca de músicas"**:

1. Clique em **"selecione arquivos de áudio"**
2. Escolha **um ou vários MP3** de uma vez (pode selecionar 10, 20 — o SetForge processa em fila)
3. Espere a análise — cada faixa mostra:
   - **`✓ BPM detectado: XXX`** — o BPM local (leva ~5s)
   - **`✓ estrutura detectada`** — a análise estrutural via IA (leva 1-3 min por faixa, com GPU)

**Dica:** enquanto uma faixa é analisada, as próximas ficam **"na fila"**. Você pode clicar em **`✕ cancelar`** a qualquer momento se quiser parar.

**O que é analisado em cada faixa:**
- BPM (batidas por minuto)
- Tonalidade (Camelot)
- Estrutura (intro / verse / chorus / drop / breakdown / outro)
- Duração

### 3. Configurar o set

Na seção **"configuração do set"**, escolha:

| Campo | Exemplo |
|---|---|
| **Onde você vai tocar?** | Balada eletrônica, Casamento, Festival, Bar/Lounge... |
| **Quanto tempo de set?** | 1 hora, 2 horas, 4 horas, 5+ horas |
| **Como a pista deve reagir?** | Aquecer devagar / Manter alta / Pico no meio / Montanha-russa |
| **Quem vai estar na pista?** (opcional) | "Público jovem 20-30 anos, fãs de house" |

### 4. Montar o set list

Depois de ter **3+ faixas analisadas** (com `✓ estrutura`):

1. Clique em **"✦ montar setlist"**
2. Espere ~30s (a IA está pensando)
3. O set list aparece com:
   - **Análise do set** — texto explicando a lógica da sequência
   - **Sequência de faixas** — na ordem que você deve tocar
   - **Timeline de mixagem** — quando soltar cada faixa, crossfade, etc.
   - **Dica de DJ** — sugestão específica pro seu set
   - **Momento de pico** — qual faixa é o clímax

### 5. Ler a timeline de mixagem

Clique em uma **transição** entre duas faixas pra expandir. Você vai ver:

```
▶ Solte a próxima faixa: 1:45       ← quando começar a tocar a faixa B
⟷ Crossfade: 1:45 → 2:30            ← duração do crossfade
■ Desligue a anterior: 2:30         ← quando parar a faixa A
```

E uma **barra colorida** mostrando visualmente onde cada coisa acontece.

**Confiança da timeline:**
- **✓ verde** — alta (estrutura clara)
- **⚠ amarelo** — média (estrutura parcial)
- **! vermelho** — baixa (estrutura confusa — verifique antes de tocar)

---

## 🎼 Como o SetForge pensa (a mágica por trás)

Você não precisa saber isso pra usar, mas ajuda a entender as decisões:

### BPM
O SetForge organiza as faixas dentro de **±6 BPM** de diferença entre uma e outra. Transições maiores que ±10 BPM aparecem com alerta.

### Harmonia (Camelot Wheel)
Cada faixa recebe um **código Camelot** (ex: `8A`, `9B`). Faixas com códigos **adjacentes ou iguais** são harmonicamente compatíveis — a mixagem fica suave, sem choque de tonalidade.

### Estrutura
A IA identifica onde cada faixa tem **intro**, **drop**, **breakdown**, etc. Isso permite calcular:
- **Quando entrar** com a próxima faixa (fim do intro da B)
- **Quando sair** da faixa atual (início do outro da A)
- **Duração do crossfade** (baseado no espaço disponível)

### Frases musicais
A timeline alinha os pontos de mixagem em **múltiplos de 16 ou 32 barras** — pra que a transição caia em "phrase boundaries" naturais da música eletrônica.

---

## 💡 Dicas de uso

1. **Suba faixas com qualidade** — MP3 320kbps ou WAV. Arquivos muito comprimidos confundem a análise.
2. **Analise antes do evento** — a análise leva 1-3 min por faixa. Faça isso com antecedência.
3. **Use o botão "limpar biblioteca"** entre sets diferentes — evita misturar faixas de contextos diferentes.
4. **Confie nos alertas** — se a timeline mostrar `! vermelho`, ouça a transição antes de usar ao vivo.
5. **A IA não substitui seu ouvido** — use a timeline como **ponto de partida**, não como regra absoluta.

---

## ❓ Perguntas frequentes

**O SetForge funciona sem internet?**
Não. Ele precisa de internet pra gerar set list (a IA roda na nuvem) e pra salvar seus sets.

**Posso usar minhas músicas compradas no Beatport / iTunes?**
Sim — qualquer arquivo MP3, WAV, OGG ou FLAC.

**O SetForge armazena minhas músicas?**
Não. Os arquivos são analisados e **deletados** logo depois. Só os **dados da análise** (BPM, tonalidade, estrutura) ficam salvos na sua conta.

**Posso exportar o set list?**
Ainda não — mas está no roadmap. Por enquanto, você pode copiar as instruções manualmente.

**Quanto tempo leva pra analisar 10 faixas?**
Depende do seu computador. Com placa de vídeo (GPU), ~1-2 min por faixa. Sem GPU, ~3-5 min por faixa.

**Funciona no celular?**
A interface funciona, mas o upload e a análise são pesados — recomendamos usar no computador.

---

## 🎧 Fluxo típico de um DJ

```
1. Chega em casa com 30 músicas novas
2. Sobe todas no SetForge (leva ~30 min pra analisar tudo)
3. Vê que 25 têm estrutura clara, 5 têm `! vermelho` (vai ouvir essas antes)
4. Configura: "Casamento, 4 horas, aquecer devagar"
5. Clica em "montar setlist"
6. Revisa a sequência, ajusta o que não gostou
7. Salva o set list
8. No dia do evento, abre o SetForge no notebook e segue a timeline
```

---

## 🆘 Problemas comuns

**"A análise está travada há muito tempo"**
- Verifique se a barra de progresso está se mexendo
- Se estiver parada há +5 min, clique em **`✕ cancelar`** e tente de novo
- Faixas muito longas (>10 min) demoram mais

**"A timeline mostra `análise de mixagem disponível após upload`"**
- Isso aparece quando uma das faixas **não tem análise estrutural**
- Verifique se **todas** as faixas do set têm `✓ estrutura` na biblioteca
- Se faltar, suba a faixa de novo

**"O BPM está errado"**
- O BPM é detectado localmente. Faixas com batida fraca ou muito ruído podem confundir
- Você pode adicionar o BPM manualmente depois (em breve)

---

## 📞 Suporte

Encontrou um bug ou tem uma sugestão? Abra uma issue no GitHub:
**https://github.com/sgbrb/setforge/issues**

---

## 📜 Licença

Projeto pessoal. Não distribuir sem autorização.

---

**Feito para DJs que querem mais tempo tocando e menos tempo planejando.** 🎧

---

## 📋 Nota técnica (pra quem for mexer no código)

Esse README é **voltado pro usuário DJ**. Se você é **desenvolvedor** e quer entender a arquitetura técnica (Next.js, Prisma, FastAPI, `all-in-one-infer`, etc.), o `HANDOFF.md` no repositório tem toda a informação técnica.