/**
 * StremioBR — Addon Stremio
 * Catálogo de filmes em Português Brasileiro
 * Streams HD/FHD/UHD via Torrentio | Legendas PT-BR via OpenSubtitles
 *
 * Variáveis de ambiente necessárias:
 *   TMDB_API_KEY          — chave TMDB (obrigatório)
 *   OPENSUBTITLES_API_KEY — chave OpenSubtitles (opcional, ativa legendas)
 *   PORT                  — porta do servidor (padrão: 7000)
 *   ADDON_URL             — URL pública do addon (ex: https://meu-addon.com)
 */

require('dotenv').config(); // carrega .env se existir

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getMovieCatalog, getMovieMeta } = require('./lib/catalog');
const { getStreams }                     = require('./lib/streams');
const { getSubtitleResource }           = require('./lib/subtitles');

const PORT     = parseInt(process.env.PORT || '7000', 10);
const BASE_URL = process.env.ADDON_URL || `http://localhost:${PORT}`;

// ─────────────────────────────────────────────
// MANIFEST
// ─────────────────────────────────────────────
const manifest = {
  id: 'community.stremiobr',
  version: '1.0.0',
  name: 'StremioBR',
  description:
    '🇧🇷 Filmes em Português Brasileiro com torrents HD (720p), FHD (1080p) e UHD (4K). ' +
    'Top 1 por qualidade com mais seeders. Dublado e Legendado. ' +
    'Melhor legenda PT-BR pré-selecionada automaticamente.',
  logo:       'https://i.imgur.com/7YvfBEL.png',
  background: 'https://i.imgur.com/z4FTHDP.jpg',

  resources: ['catalog', 'meta', 'stream', 'subtitles'],
  types:     ['movie'],
  idPrefixes: ['tt'],

  catalogs: [
    {
      type: 'movie',
      id:   'stremiobr-lancamentos',
      name: '🇧🇷 StremioBR — Lançamentos',
      extra: [
        { name: 'skip',   isRequired: false },
        { name: 'search', isRequired: false },
        { name: 'genre',  isRequired: false,
          options: [
            'Ação','Aventura','Animação','Comédia','Crime',
            'Drama','Família','Fantasia','Terror','Mistério',
            'Romance','Ficção Científica','Thriller','Guerra'
          ]
        }
      ]
    }
  ],

  behaviorHints: {
    adult: false,
    p2p:   true
  }
};

// ─────────────────────────────────────────────
// BUILDER
// ─────────────────────────────────────────────
const builder = new addonBuilder(manifest);

// ── CATALOG ──────────────────────────────────
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  if (type !== 'movie' || id !== 'stremiobr-lancamentos') {
    return { metas: [] };
  }

  const skip   = parseInt(extra?.skip  || '0', 10);
  const genre  = extra?.genre  || null;
  const search = extra?.search || null;

  console.log(`[Catalog] skip=${skip} genre=${genre} search=${search}`);

  try {
    const metas = await getMovieCatalog(skip, genre, search);
    return { metas };
  } catch (err) {
    console.error('[Catalog] Erro:', err.message);
    return { metas: [] };
  }
});

// ── META ─────────────────────────────────────
builder.defineMetaHandler(async ({ type, id }) => {
  if (type !== 'movie' || !id.startsWith('tt')) {
    return { meta: null };
  }

  try {
    const meta = await getMovieMeta(id);
    return { meta: meta || null };
  } catch (err) {
    console.error('[Meta] Erro:', err.message);
    return { meta: null };
  }
});

// ── STREAM ───────────────────────────────────
builder.defineStreamHandler(async ({ type, id }) => {
  if (type !== 'movie' || !id.startsWith('tt')) {
    return { streams: [] };
  }

  console.log(`[Stream] Buscando streams para: ${id}`);

  try {
    const streams = await getStreams(id);
    return { streams };
  } catch (err) {
    console.error('[Stream] Erro:', err.message);
    return { streams: [] };
  }
});

// ── SUBTITLES ────────────────────────────────
builder.defineSubtitlesHandler(async ({ type, id }) => {
  if (type !== 'movie' || !id.startsWith('tt')) {
    return { subtitles: [] };
  }

  console.log(`[Subtitles] Buscando legendas para: ${id}`);

  try {
    const subtitles = await getSubtitleResource(id);
    return { subtitles };
  } catch (err) {
    console.error('[Subtitles] Erro:', err.message);
    return { subtitles: [] };
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const addonInterface = builder.getInterface();

serveHTTP(addonInterface, {
  port: PORT,
  static: '/public'
});

console.log(`
╔══════════════════════════════════════════════╗
║           StremioBR Addon — ON LINE          ║
╠══════════════════════════════════════════════╣
║  🌐 URL do addon:                            ║
║  ${(BASE_URL + '/manifest.json').padEnd(44)} ║
║                                              ║
║  📺 Para instalar no Stremio:               ║
║  Cole a URL acima em:                        ║
║  Stremio → Addons → + Community Addons       ║
╚══════════════════════════════════════════════╝
`);
