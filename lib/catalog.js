/**
 * catalog.js — Busca catálogo de filmes no TMDB
 * Ordenado por data de lançamento (mais recentes primeiro)
 * Idioma: Português Brasileiro
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600 }); // cache de 1h
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BG = 'https://image.tmdb.org/t/p/w1280';

/**
 * Converte resultado TMDB para formato Stremio
 */
function tmdbToStremio(movie) {
  return {
    id: `tt${String(movie.imdb_id || '').replace('tt', '')}`.replace('tt', 'tt'),
    type: 'movie',
    name: movie.title || movie.original_title,
    poster: movie.poster_path ? `${TMDB_IMG}${movie.poster_path}` : null,
    background: movie.backdrop_path ? `${TMDB_BG}${movie.backdrop_path}` : null,
    description: movie.overview || '',
    releaseInfo: movie.release_date ? movie.release_date.substring(0, 4) : '',
    imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : null,
    genres: (movie.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean),
    runtime: movie.runtime ? `${movie.runtime} min` : null,
    links: [],
    behaviorHints: { defaultVideoId: null }
  };
}

// Mapa de gêneros TMDB
const GENRE_MAP = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia',
  80: 'Crime', 99: 'Documentário', 18: 'Drama', 10751: 'Família',
  14: 'Fantasia', 36: 'História', 27: 'Terror', 10402: 'Música',
  9648: 'Mistério', 10749: 'Romance', 878: 'Ficção Científica',
  10770: 'Telefilme', 53: 'Thriller', 10752: 'Guerra', 37: 'Faroeste'
};

/**
 * Busca filmes populares/recentes com conteúdo PT-BR
 * Estratégia: discover ordenado por release_date desc + filtro de tradução PT-BR
 */
async function getMovieCatalog(skip = 0, genre = null, search = null) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error('TMDB_API_KEY não configurada');

  const page = Math.floor(skip / 20) + 1;
  const cacheKey = `catalog_${page}_${genre || 'all'}_${search || 'none'}`;

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    let movies = [];

    if (search) {
      // Busca por termo
      const res = await axios.get(`${TMDB_BASE}/search/movie`, {
        params: {
          api_key: apiKey,
          query: search,
          language: 'pt-BR',
          page,
          include_adult: false
        }
      });
      movies = res.data.results || [];
    } else {
      // Catálogo: filmes com tradução PT-BR, ordenados por lançamento
      const params = {
        api_key: apiKey,
        language: 'pt-BR',
        sort_by: 'release_date.desc',
        page,
        include_adult: false,
        include_video: false,
        'vote_count.gte': 10,
        'release_date.lte': new Date().toISOString().split('T')[0],
        with_original_language: 'en|pt' // inglês e português (maior cobertura)
      };
      if (genre) params.with_genres = genre;

      const res = await axios.get(`${TMDB_BASE}/discover/movie`, { params });
      movies = res.data.results || [];
    }

    // Busca IMDB ID para cada filme (necessário para streams)
    const enriched = await Promise.allSettled(
      movies.slice(0, 20).map(m => enrichWithImdbId(m, apiKey))
    );

    const result = enriched
      .filter(r => r.status === 'fulfilled' && r.value && r.value.id && r.value.id !== 'tt')
      .map(r => r.value);

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('[Catalog] Erro ao buscar catálogo:', err.message);
    return [];
  }
}

/**
 * Adiciona IMDB ID ao filme via TMDB external_ids
 */
async function enrichWithImdbId(movie, apiKey) {
  const cacheKey = `imdb_${movie.id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const [details, extIds] = await Promise.all([
      axios.get(`${TMDB_BASE}/movie/${movie.id}`, {
        params: { api_key: apiKey, language: 'pt-BR' }
      }),
      axios.get(`${TMDB_BASE}/movie/${movie.id}/external_ids`, {
        params: { api_key: apiKey }
      })
    ]);

    const imdbId = extIds.data.imdb_id;
    if (!imdbId) return null;

    const enriched = tmdbToStremio({ ...details.data, imdb_id: imdbId });
    cache.set(cacheKey, enriched);
    return enriched;
  } catch {
    return null;
  }
}

/**
 * Busca metadados completos de um filme específico
 */
async function getMovieMeta(imdbId) {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `meta_${imdbId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Busca pelo IMDB ID no TMDB
    const findRes = await axios.get(`${TMDB_BASE}/find/${imdbId}`, {
      params: { api_key: apiKey, external_source: 'imdb_id', language: 'pt-BR' }
    });

    const tmdbMovie = (findRes.data.movie_results || [])[0];
    if (!tmdbMovie) return null;

    const [details, extIds, credits] = await Promise.all([
      axios.get(`${TMDB_BASE}/movie/${tmdbMovie.id}`, {
        params: { api_key: apiKey, language: 'pt-BR' }
      }),
      axios.get(`${TMDB_BASE}/movie/${tmdbMovie.id}/external_ids`, {
        params: { api_key: apiKey }
      }),
      axios.get(`${TMDB_BASE}/movie/${tmdbMovie.id}/credits`, {
        params: { api_key: apiKey, language: 'pt-BR' }
      })
    ]);

    const cast = (credits.data.cast || []).slice(0, 5).map(a => a.name);
    const directors = (credits.data.crew || [])
      .filter(c => c.job === 'Director')
      .map(d => d.name);

    const meta = {
      ...tmdbToStremio({ ...details.data, imdb_id: extIds.data.imdb_id }),
      cast,
      director: directors,
      country: (details.data.production_countries || []).map(c => c.name)
    };

    cache.set(cacheKey, meta);
    return meta;
  } catch (err) {
    console.error('[Catalog] Erro ao buscar meta:', err.message);
    return null;
  }
}

module.exports = { getMovieCatalog, getMovieMeta };
