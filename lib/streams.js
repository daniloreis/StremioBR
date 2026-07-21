/**
 * streams.js — Busca e filtra streams do Torrentio
 *
 * Regras:
 *  - Qualidades aceitas: 720p → HD | 1080p → FHD | 2160p/4K → UHD
 *  - Top 1 por qualidade com mais seeders
 *  - Detecta dublado (pt-BR audio) e legendado
 *  - Anexa legenda PT-BR pré-selecionada via subtitleTracks
 */

const axios = require('axios');
const NodeCache = require('node-cache');
const { getBestSubtitle } = require('./subtitles');

const cache = new NodeCache({ stdTTL: 1800 }); // cache de 30min

// Torrentio endpoint público (sem autenticação)
const TORRENTIO_BASE = 'https://torrentio.strem.fun';

// Configuração do Torrentio: filtra por providers confiáveis, PT-BR quando disponível
// Providers: YTS (boa qualidade), RARBG (seeders altos), 1337x, TorrentGalaxy, Nyaa, ThePirateBay
const TORRENTIO_CONFIG = 'providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaa,tokyotosho,anidex|sort=seeders|qualityfilter=scr,cam,unknown|limit=50';

/**
 * Mapa de qualidade detectada → label de exibição
 */
const QUALITY_LABELS = {
  '2160p': 'UHD',
  '4K':    'UHD',
  '1080p': 'FHD',
  '720p':  'HD'
};

/**
 * Detecta a qualidade de um stream Torrentio pelo campo name/title
 */
function detectQuality(name = '', title = '') {
  const text = `${name} ${title}`.toUpperCase();
  if (/\b(2160P|4K|UHD)\b/.test(text)) return '2160p';
  if (/\b1080P\b/.test(text)) return '1080p';
  if (/\b720P\b/.test(text)) return '720p';
  return null;
}

/**
 * Extrai número de seeders do campo title do Torrentio
 * Formato: "Nome do Filme\n👤 1234\n💾 2.1 GB"
 */
function parseSeeders(title = '') {
  const m = title.match(/👤\s*(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, '')) : 0;
}

/**
 * Detecta se o torrent é dublado em Português Brasileiro
 * Palavras-chave comuns: DUAL, DUBLADO, DUB, POR, PT-BR, PORTUGUESE, BDRip.PT-BR
 */
function isDubbed(name = '', title = '') {
  const text = `${name} ${title}`.toUpperCase();
  return /\b(DUAL|DUBLADO|DUB\.?BR|PT[.\-_]?BR|PORTUGUESE|PTBR|LEG\.?DUB|AUDIO\.?PT)\b/.test(text);
}

/**
 * Monta um stream Stremio a partir de dados do Torrentio
 */
function buildStream(torrentStream, qualityKey, mode, subtitleTracks = []) {
  const label = QUALITY_LABELS[qualityKey];
  const modeLabel = mode === 'dubbed' ? '🔊 Dublado' : '💬 Legendado';
  const seeders = parseSeeders(torrentStream.title || '');

  // Extrai tamanho do arquivo do title
  const sizeMatch = (torrentStream.title || '').match(/💾\s*([\d.,]+\s*(?:GB|MB))/i);
  const sizeStr = sizeMatch ? sizeMatch[1] : '';

  // Fonte/tracker
  const sourceMatch = (torrentStream.title || '').match(/🔗\s*(.+?)(?:\n|$)/);
  const sourceStr = sourceMatch ? sourceMatch[1].trim() : '';

  const stream = {
    name: `StremioBR\n${label} • ${modeLabel}`,
    title: [
      `📡 ${seeders} seeders`,
      sizeStr ? `💾 ${sizeStr}` : '',
      sourceStr ? `🔗 ${sourceStr}` : ''
    ].filter(Boolean).join('  |  '),
    infoHash: torrentStream.infoHash,
    fileIdx: torrentStream.fileIdx !== undefined ? torrentStream.fileIdx : 0,
    sources: torrentStream.sources || [],
    behaviorHints: {
      bingeGroup: `stremiobr-${qualityKey}`,
      notWebReady: false
    }
  };

  // Adiciona legendas pré-selecionadas para modo Legendado
  if (mode === 'subtitled' && subtitleTracks.length > 0) {
    stream.subtitleTracks = subtitleTracks;
  }

  return stream;
}

/**
 * Busca streams do Torrentio para um imdbId e retorna
 * os melhores streams filtrados por qualidade + seeders
 */
async function getStreams(imdbId) {
  if (!imdbId || !imdbId.startsWith('tt')) return [];

  const cacheKey = `streams_${imdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const url = `${TORRENTIO_BASE}/${TORRENTIO_CONFIG}/stream/movie/${imdbId}.json`;
    console.log(`[Streams] Buscando: ${url}`);

    const res = await axios.get(url, { timeout: 15000 });
    const raw = res.data?.streams || [];

    if (!raw.length) {
      console.log(`[Streams] Nenhum stream encontrado para ${imdbId}`);
      return [];
    }

    // Agrupa por qualidade e modo (dublado/legendado)
    const groups = {
      '2160p': { dubbed: [], subtitled: [] },
      '1080p': { dubbed: [], subtitled: [] },
      '720p':  { dubbed: [], subtitled: [] }
    };

    for (const s of raw) {
      if (!s.infoHash) continue; // ignora streams sem hash (ex: premium)

      const quality = detectQuality(s.name, s.title);
      if (!quality || !groups[quality]) continue;

      const seeders = parseSeeders(s.title);
      const dubbed = isDubbed(s.name, s.title);

      groups[quality][dubbed ? 'dubbed' : 'subtitled'].push({ ...s, _seeders: seeders });
    }

    // Ordena cada grupo por seeders (decrescente) e pega o top 1
    const topStreams = {};
    for (const [q, modes] of Object.entries(groups)) {
      topStreams[q] = {};
      for (const [mode, list] of Object.entries(modes)) {
        if (list.length > 0) {
          list.sort((a, b) => b._seeders - a._seeders);
          topStreams[q][mode] = list[0];
        }
      }
    }

    // Busca legenda PT-BR uma vez para o filme
    let subtitleTracks = [];
    try {
      subtitleTracks = await getBestSubtitle(imdbId);
    } catch (e) {
      console.warn('[Streams] Legenda não disponível:', e.message);
    }

    // Monta lista de streams final
    // Ordem: UHD Dub, UHD Leg, FHD Dub, FHD Leg, HD Dub, HD Leg
    const orderedQualities = ['2160p', '1080p', '720p'];
    const result = [];

    for (const q of orderedQualities) {
      const { dubbed, subtitled } = topStreams[q];

      if (dubbed) {
        result.push(buildStream(dubbed, q, 'dubbed', []));
      }
      if (subtitled) {
        result.push(buildStream(subtitled, q, 'subtitled', subtitleTracks));
      }

      // Se só existe um modo para a qualidade, cria ambos apontando para o mesmo torrent
      if (!dubbed && subtitled) {
        result.push(buildStream(subtitled, q, 'dubbed', []));
      }
      if (dubbed && !subtitled) {
        result.push(buildStream(dubbed, q, 'subtitled', subtitleTracks));
      }
    }

    console.log(`[Streams] ${result.length} streams montados para ${imdbId}`);
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Streams] Erro:', err.message);
    return [];
  }
}

module.exports = { getStreams };
