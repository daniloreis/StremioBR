/**
 * subtitles.js — Busca a melhor legenda PT-BR via OpenSubtitles REST API v3
 *
 * Retorna array de subtitleTracks compatível com Stremio:
 * [{ id, url, lang, label, default }]
 *
 * Critério de "melhor": maior download_count + movies_rating + fromTrusted
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 86400 }); // cache de 24h

const OSUB_BASE = 'https://api.opensubtitles.com/api/v1';
const OSUB_KEY = process.env.OPENSUBTITLES_API_KEY || '';

// User-agent obrigatório pela API do OpenSubtitles
const HEADERS = {
  'Api-Key': OSUB_KEY,
  'Content-Type': 'application/json',
  'User-Agent': 'StremioBR v1.0'
};

/**
 * Busca o melhor arquivo de legenda PT-BR para o filme
 * Retorna array de subtitleTracks (máx 3, ordenados por qualidade)
 */
async function getBestSubtitle(imdbId) {
  if (!OSUB_KEY) {
    console.warn('[Subtitles] OPENSUBTITLES_API_KEY não configurada — legendas desativadas');
    return [];
  }

  const cacheKey = `sub_${imdbId}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const cleanId = imdbId.replace('tt', '');

    // Busca legendas PT-BR (Brazilian Portuguese)
    const res = await axios.get(`${OSUB_BASE}/subtitles`, {
      headers: HEADERS,
      params: {
        imdb_id: cleanId,
        languages: 'pt-BR,pt',
        type: 'movie',
        order_by: 'download_count',
        order_direction: 'desc',
        page: 1
      },
      timeout: 10000
    });

    const subs = res.data?.data || [];
    if (!subs.length) {
      cache.set(cacheKey, []);
      return [];
    }

    // Ordena por: trusted > download_count > ratings
    const ranked = subs
      .filter(s => s.attributes?.files?.length > 0)
      .map(s => ({
        id: s.id,
        fileId: s.attributes.files[0].file_id,
        fileName: s.attributes.files[0].file_name || '',
        downloads: s.attributes.download_count || 0,
        trusted: s.attributes.from_trusted || false,
        rating: parseFloat(s.attributes.ratings || 0),
        hd: s.attributes.hd || false,
        release: s.attributes.release || '',
        // Score composto
        score: (s.attributes.from_trusted ? 1000 : 0)
              + (s.attributes.download_count || 0) * 0.001
              + parseFloat(s.attributes.ratings || 0) * 10
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (!ranked.length) {
      cache.set(cacheKey, []);
      return [];
    }

    // Obtém URLs de download para os top 3
    const tracks = [];
    for (let i = 0; i < ranked.length; i++) {
      try {
        const dlRes = await axios.post(
          `${OSUB_BASE}/download`,
          { file_id: ranked[i].fileId, sub_format: 'srt' },
          { headers: HEADERS, timeout: 8000 }
        );

        const url = dlRes.data?.link;
        if (!url) continue;

        const trustBadge = ranked[i].trusted ? ' ✓' : '';
        const label = `Português (BR)${trustBadge} — ${ranked[i].downloads.toLocaleString('pt-BR')} downloads`;

        tracks.push({
          id: `stremiobr-sub-${ranked[i].id}`,
          url,
          lang: 'por',
          label,
          default: i === 0 // melhor legenda pré-selecionada
        });
      } catch (e) {
        console.warn(`[Subtitles] Erro ao obter URL para sub ${ranked[i].id}:`, e.message);
      }
    }

    console.log(`[Subtitles] ${tracks.length} legenda(s) PT-BR encontrada(s) para ${imdbId}`);
    cache.set(cacheKey, tracks);
    return tracks;
  } catch (err) {
    console.error('[Subtitles] Erro:', err.message);
    cache.set(cacheKey, []);
    return [];
  }
}

/**
 * Handler para o resource "subtitles" do Stremio
 * Permite que o addon responda buscas de legenda direto pelo Stremio
 */
async function getSubtitleResource(imdbId) {
  const tracks = await getBestSubtitle(imdbId);
  return tracks.map(t => ({
    id: t.id,
    url: t.url,
    lang: t.lang,
    label: t.label
  }));
}

module.exports = { getBestSubtitle, getSubtitleResource };
