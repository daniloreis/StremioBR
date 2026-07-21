# 🇧🇷 StremioBR — Addon Stremio

Addon não-oficial do Stremio com catálogo de filmes em **Português Brasileiro**, streams via Torrentio nos formatos HD/FHD/UHD e legendas PT-BR automáticas.

---

## ✨ Funcionalidades

| Recurso | Detalhe |
|---|---|
| 📂 Catálogo | Filmes com conteúdo PT-BR, ordenados por lançamento mais recente |
| 🎬 Streams | Top 1 por qualidade com **mais seeders** |
| 📺 Qualidades | `720p → HD` · `1080p → FHD` · `2160p → UHD` |
| 🔊 Dublado | Detecta automaticamente áudio PT-BR no torrent |
| 💬 Legendado | Stream com legenda PT-BR pré-selecionada |
| 📝 Legendas | OpenSubtitles — ranking por downloads + confiabilidade |
| ⚡ Cache | Catálogo (1h) · Streams (30min) · Legendas (24h) |

---

## 🚀 Instalação rápida (local)

### 1. Pré-requisitos
- Node.js 16+
- Conta no [TMDB](https://www.themoviedb.org/settings/api) (gratuita)
- Conta no [OpenSubtitles](https://www.opensubtitles.com/consumers) (opcional, para legendas)

### 2. Clone e configure
```bash
git clone <repo>
cd stremiobr

# Configure variáveis
cp .env.example .env
# Edite .env com suas chaves de API

# Instale dependências
npm install

# Inicie
npm start
```

### 3. Instale no Stremio
Abra o Stremio e acesse:
```
Addons → Community Addons → cole a URL:
http://localhost:7000/manifest.json
```

---

## 🐳 Docker

```bash
# Build
docker build -t stremiobr .

# Run
docker run -d \
  -p 7000:7000 \
  -e TMDB_API_KEY=sua_chave \
  -e OPENSUBTITLES_API_KEY=sua_chave \
  -e ADDON_URL=https://meu-dominio.com \
  --name stremiobr \
  stremiobr
```

---

## ☁️ Deploy (Railway / Render / Fly.io)

### Railway (recomendado — gratuito)
1. Crie conta em [railway.app](https://railway.app)
2. "New Project → Deploy from GitHub Repo"
3. Adicione as variáveis de ambiente no painel
4. Copie a URL gerada e use como `ADDON_URL`

### Render
1. Crie conta em [render.com](https://render.com)
2. "New → Web Service → Connect Repo"
3. Build command: `npm install`
4. Start command: `npm start`
5. Adicione as env vars no painel

---

## 🔧 Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TMDB_API_KEY` | ✅ Sim | Chave da API do TMDB |
| `OPENSUBTITLES_API_KEY` | ⚠️ Opcional | Ativa legendas PT-BR automáticas |
| `PORT` | ❌ Não | Porta do servidor (padrão: 7000) |
| `ADDON_URL` | ❌ Não | URL pública para deploy |

---

## 📡 Fontes de Dados

- **Catálogo**: [TMDB](https://www.themoviedb.org) — metadados, pôsteres, avaliações
- **Torrents**: [Torrentio](https://torrentio.strem.fun) — YTS, 1337x, ThePirateBay, TorrentGalaxy, RARBG e outros
- **Legendas**: [OpenSubtitles](https://www.opensubtitles.com) — melhor legenda PT-BR por downloads + confiabilidade

---

## 📋 Estrutura do Projeto

```
stremiobr/
├── index.js          # Servidor principal + handlers Stremio
├── lib/
│   ├── catalog.js    # Catálogo TMDB (filmes PT-BR)
│   ├── streams.js    # Streams Torrentio (filtro + ranking)
│   └── subtitles.js  # Legendas OpenSubtitles
├── package.json
├── Dockerfile
└── .env.example
```

---

## ⚙️ Como funciona a seleção de streams

```
Torrentio retorna ~50 torrents por filme
         ↓
Filtra por qualidade: 720p | 1080p | 2160p/4K
         ↓
Detecta modo: Dublado (DUAL/DUB/PT-BR no nome) | Legendado
         ↓
Ordena por seeders (decrescente)
         ↓
Seleciona TOP 1 por [qualidade × modo]
         ↓
Para streams Legendados: anexa legenda PT-BR pré-selecionada
```

**Resultado final (até 6 opções):**
- 🎬 UHD • 🔊 Dublado
- 🎬 UHD • 💬 Legendado *(legenda pré-selecionada)*
- 🎬 FHD • 🔊 Dublado
- 🎬 FHD • 💬 Legendado *(legenda pré-selecionada)*
- 🎬 HD  • 🔊 Dublado
- 🎬 HD  • 💬 Legendado *(legenda pré-selecionada)*

---

> ⚠️ **Aviso**: Este addon é para uso pessoal. Respeite as leis de direitos autorais do seu país.
