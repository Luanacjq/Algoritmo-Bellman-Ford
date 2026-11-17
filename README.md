# 🕵️ Spy Game · Operação Bellman-Ford

Trabalho sobre o **Algoritmo de Bellman-Ford**: guiar um agente secreto por uma rede de esconderijos
modelada como um grafo orientado `G = (V, E)` com pesos `w : E → ℝ` (tempo/risco), inclusive negativos.

**Como abrir:** dê dois cliques em `index.html` (não precisa instalar nada).
**Testes:** `node tests/bellman-ford.test.js`

---

## 1. Modelagem

- **Vértices:** `V = {S, A, B, C, D, E}`, com origem `S`
- **Arestas (rotas):**

| Origem | Destino | Custo |
|:-:|:-:|:-:|
| S | A | 4 |
| S | B | 5 |
| A | B | −2 |
| A | C | 6 |
| B | C | 3 |
| B | D | 7 |
| C | D | 2 |

- `E` não tem arestas incidentes, então fica isolado (inalcançável).
- O problema é de **caminho mínimo de origem única**. Como há pesos negativos, Dijkstra não serve e usamos Bellman-Ford.

### Algoritmo (CLRS)

```
BELLMAN-FORD(G, w, s)
  INITIALIZE-SINGLE-SOURCE(G, s)        // d[s]=0, d[v]=∞, π[v]=NIL
  for i = 1 to |V| − 1
    for each edge (u, v) ∈ G.E
      RELAX(u, v, w)                    // se d[u]+w < d[v]: d[v]=d[u]+w, π[v]=u
  for each edge (u, v) ∈ G.E
    if v.d > u.d + w(u, v)
      return FALSE                      // ciclo negativo (armadilha)
  return TRUE
```

Complexidade: **O(|V|·|E|)**, ou seja, 6 × 7 = 42 verificações no pior caso para a rede original.

---

## 2. Experimento 1: Risco dos Esconderijos

Arestas relaxadas na ordem da tabela.

| Iteração | S | A | B | C | D | E |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Inicial | 0 | ∞ | ∞ | ∞ | ∞ | ∞ |
| 1 | 0 | 4 | **2** | **5** | **7** | ∞ |
| 2 | 0 | 4 | 2 | 5 | 7 | ∞ |

Na iteração 1, `B` cai de 5 para 2 via `A→B (−2)`, `C` cai de 10 para 5 via `B→C`, e `D` cai de 9 para 7 via `C→D`.
Na iteração 2 nada muda, então as distâncias estão estabilizadas. A verificação final não encontra ciclo negativo e o algoritmo retorna **TRUE**.

| Esconderijo | Custo mínimo | Rota |
|:-:|:-:|:--|
| S | 0 | origem |
| A | 4 | S → A |
| B | **2** | S → A → B |
| C | 5 | S → A → B → C |
| D | **7** | S → A → B → C → D |
| E | ∞ | inalcançável |

- 🟢 **Menor risco:** **B (custo 2)**. O atalho tático `A→B (−2)` torna B mais barato que A.
- 🟠 **Maior risco:** **D (custo 7)**, o mais caro entre os alcançáveis.
- ⚫ **E:** custo ∞. Não existe rota até ele.

---

## 3. Experimento 2: Detecção de Armadilhas (nova aresta D → B = −6)

| Iteração | S | A | B | C | D | E |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Inicial | 0 | ∞ | ∞ | ∞ | ∞ | ∞ |
| 1 | 0 | 4 | 1 | 5 | 7 | ∞ |
| 2 | 0 | 4 | 0 | 4 | 6 | ∞ |
| 3 | 0 | 4 | −1 | 3 | 5 | ∞ |
| 4 | 0 | 4 | −2 | 2 | 4 | ∞ |
| 5 | 0 | 4 | −3 | 1 | 3 | ∞ |

Os valores de B, C e D **nunca estabilizam**: caem 1 unidade a cada iteração.
Na verificação final (|V|-ésima passada), `B→C` ainda relaxa: `−3 + 3 = 0 < 1`. Portanto há **ciclo negativo** e o algoritmo retorna **FALSE**.

**Ciclo encontrado:** `B → C → D → B` com peso `3 + 2 + (−6) = −1`.
Cada volta reduz o custo em 1. O agente nunca encontra um "caminho mínimo", porque ele fica preso num loop temporal.

| Esconderijo | Custo | Situação |
|:-:|:-:|:--|
| S | 0 | origem |
| A | 4 | ✅ seguro (não é alcançado a partir do ciclo) |
| B | −∞ | 🔴 **armadilha** |
| C | −∞ | 🔴 **armadilha** |
| D | −∞ | 🔴 **armadilha** |
| E | ∞ | ⚫ inalcançável |

**Esconderijos que representam armadilhas: B, C e D.** Todos fazem parte do ciclo negativo ou são alcançáveis a partir dele.

---

## 4. Extras implementados (diferenciais)

1. **Execução animada passo a passo**: play/pausa, avançar, **voltar**, velocidade ajustável e atalhos de teclado. Cada relaxamento acende a rota (verde = melhorou, cinza = sem melhoria) e destaca a linha correspondente do pseudocódigo.
2. **Extração e destaque do ciclo negativo**: além de dizer *que* existe ciclo, o sistema mostra *qual* é (técnica de voltar |V| vezes pelos predecessores) e propaga o `−∞` para todos os vértices afetados.
3. **Comparativo Bellman-Ford × Dijkstra**: mostra na prática que Dijkstra devolve valores finitos **errados** no Experimento 2 (B = 2, C = 5, D = 7) e não detecta a armadilha.
4. **Despacho do agente**: o agente percorre a rota mínima no mapa com um contador de custo. Se o destino for uma armadilha, ele entra no loop e o custo despenca a cada volta.
5. **Laboratório (modo livre)**: editar pesos, criar/remover rotas e esconderijos, trocar a origem, arrastar nós e gerar redes aleatórias, com recálculo instantâneo.
6. **Parada antecipada (otimização)**: encerra quando uma iteração não altera nada (Experimento 1 termina em 2 iterações em vez de 5). Pode ser desligada para ver a versão clássica.
7. **Telemetria**: iterações executadas, verificações, relaxamentos efetivos e o limite O(|V|·|E|).
8. **Testes automatizados** em Node (`tests/bellman-ford.test.js`) validando os dois experimentos.

Ambientação: briefing com máquina de escrever, carimbo TOP SECRET, radar girando, scanlines, título com glitch, alarme visual e sonoro ao detectar armadilha, efeitos sonoros (WebAudio) e contagem regressiva para a entrega.

## 5. Estrutura

```
index.html                 interface
css/style.css              tema e animações
js/bellman-ford.js         algoritmo (Bellman-Ford, ciclo, armadilhas, Dijkstra)
js/app.js                  visualização, playback, agente, editor
tests/bellman-ford.test.js testes dos experimentos
```

Links diretos: `index.html#play` (pula o briefing), `index.html#play-m2` (Missão 2), `index.html#play-m2-end` (resultado da Missão 2).
