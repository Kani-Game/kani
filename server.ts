import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const STEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

interface SteamSpecItem {
  label: string;
  value: string;
}

interface SteamRequirementBlock {
  items: SteamSpecItem[];
  notes: string[];
}

interface SteamSpecPayload {
  appId: number;
  matchedName: string;
  steamUrl: string;
  coverImage: string;
  genres: string[];
  primaryGenre: string;
  developers: string[];
  publishers: string[];
  releaseDate: string;
  minimum: SteamRequirementBlock;
  recommended: SteamRequirementBlock;
  fetchedAt: number;
}

const appIdCache = new Map<number, { data: SteamSpecPayload; expiresAt: number }>();
const lookupAliasCache = new Map<string, { appId: number; expiresAt: number }>();

const STEAM_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

function extractSteamAppId(rawInput?: string | null): number | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Numeric app ID directly
  if (/^\d{3,10}$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  // store.steampowered.com/app/<id>, steamcommunity.com/app/<id>, steamdb.info/app/<id>
  const webMatch = trimmed.match(
    /(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d{3,10})/i
  );
  if (webMatch?.[1]) {
    return Number(webMatch[1]);
  }

  // steam://run/<id>, steam://rungameid/<id>, steam://store/<id>
  const protocolMatch = trimmed.match(/steam:\/\/(?:run|rungameid|store)\/(\d{3,10})/i);
  if (protocolMatch?.[1]) {
    return Number(protocolMatch[1]);
  }

  // Fallback /app/<id> path anywhere in URL
  const genericPathMatch = trimmed.match(/\/app\/(\d{3,10})(?:[/?#]|$)/i);
  if (genericPathMatch?.[1]) {
    return Number(genericPathMatch[1]);
  }

  return null;
}

function normalizeSearchTitle(rawName: string): string {
  return rawName
    .replace(/[®™©]/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:steam\s*offline|repack|fitgirl|dodi|elamigos|offline|free|pc)[^)]*\)/gi, ' ')
    .replace(
      /\b(?:steam\s*offline|offline\s*mode|repack|fitgirl|dodi|elamigos|portable|cracked|full\s*game|free\s*download)\b/gi,
      ' '
    )
    .replace(/[|•–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[®™©:.,!?'"()\[\]-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

const PENALTY_TERMS = [
  'dlc',
  'ost',
  'soundtrack',
  'points',
  'bundle',
  'season pass',
  'expansion',
  'artbook',
  'demo',
  'dedicated server',
  'server',
  'sdk',
  'modding',
  'credits',
  'coins',
  'upgrade',
  'pack',
];

function scoreSearchCandidate(query: string, candidateName: string, type?: string): number {
  const normQuery = normalizeSearchTitle(query).toLowerCase();
  const normCandidate = normalizeSearchTitle(candidateName).toLowerCase();

  let score = 0;
  if (normCandidate === normQuery) {
    score += 120;
  } else if (normCandidate.startsWith(normQuery)) {
    score += 65;
  } else if (normCandidate.includes(normQuery)) {
    score += 40;
  }

  const qTokens = tokenize(normQuery);
  const cTokens = tokenize(normCandidate);
  const cSet = new Set(cTokens);

  if (qTokens.length > 0) {
    let matched = 0;
    for (const token of qTokens) {
      if (cSet.has(token)) matched++;
    }
    const recall = matched / qTokens.length;
    const precision = cTokens.length > 0 ? matched / cTokens.length : 0;
    score += Math.round(recall * 50 + precision * 25);
  }

  for (const term of PENALTY_TERMS) {
    const queryHasTerm = normQuery.includes(term);
    const candidateHasTerm = normCandidate.includes(term);
    if (candidateHasTerm && !queryHasTerm) {
      score -= 85;
    }
  }

  if (type && type.toLowerCase() !== 'app') {
    score -= 40;
  }

  return score;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: STEAM_FETCH_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAppIdBySearch(rawName: string): Promise<number | null> {
  const cleaned = normalizeSearchTitle(rawName);
  if (!cleaned) return null;

  const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(
    cleaned
  )}&l=english&cc=US`;
  const payload = await fetchJsonWithTimeout(searchUrl, 8000);
  const items: Array<{ id?: number; name?: string; type?: string }> = payload?.items || [];
  if (items.length === 0) return null;

  let bestId: number | null = null;
  let bestScore = -Infinity;

  for (const item of items) {
    if (!item.id || !item.name) continue;
    const s = scoreSearchCandidate(cleaned, item.name, item.type);
    if (s > bestScore) {
      bestScore = s;
      bestId = Number(item.id);
    }
  }

  return bestId;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&reg;/gi, '®')
    .replace(/&trade;/gi, '™')
    .replace(/&copy;/gi, '©')
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeSpecLabel(rawLabel: string): string {
  const cleaned = rawLabel.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
  const lower = cleaned.toLowerCase();
  if (lower === 'os' || lower === 'operating system') return 'OS';
  if (lower === 'processor' || lower === 'cpu') return 'Processor';
  if (lower === 'memory' || lower === 'ram') return 'Memory';
  if (lower === 'graphics' || lower === 'gpu' || lower === 'video card') return 'Graphics';
  if (lower === 'directx') return 'DirectX';
  if (lower === 'storage' || lower === 'hard drive' || lower === 'disk space') return 'Storage';
  if (lower === 'network' || lower === 'internet') return 'Network';
  if (lower === 'sound card' || lower === 'sound' || lower === 'audio') return 'Sound Card';
  if (lower === 'additional notes' || lower === 'notes') return 'Additional Notes';
  if (lower === 'vr support') return 'VR Support';
  return cleaned;
}

function parseRequirementsHtml(html?: string): SteamRequirementBlock {
  if (!html || typeof html !== 'string') {
    return { items: [], notes: [] };
  }

  // Convert structural breaks to newlines before stripping HTML tags
  const normalizedHtml = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n');

  const plain = decodeHtmlEntities(normalizedHtml.replace(/<[^>]+>/g, ''));
  const rawLines = plain
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const items: SteamSpecItem[] = [];
  const notes: string[] = [];

  for (const line of rawLines) {
    // Skip redundant section titles
    if (/^(?:minimum|recommended)\s*:?$/i.test(line)) {
      continue;
    }

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 32) {
      const rawKey = line.slice(0, colonIdx).trim();
      const rawVal = line.slice(colonIdx + 1).trim();
      const label = normalizeSpecLabel(rawKey);

      if (label === 'Additional Notes') {
        if (rawVal) notes.push(rawVal);
        continue;
      }

      if (rawVal) {
        items.push({ label, value: rawVal });
        continue;
      }
    }

    notes.push(line);
  }

  return { items, notes };
}

function buildAssetUrl(assetUrlFormat: string, filename?: string): string | null {
  if (!filename || typeof filename !== 'string') return null;
  if (/^https?:\/\//i.test(filename)) return filename;

  let pathPart = assetUrlFormat
    ? assetUrlFormat.replace('${FILENAME}', filename.replace(/^\/+/, ''))
    : filename;

  pathPart = pathPart.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(pathPart)) return pathPart;

  if (pathPart.startsWith('store_item_assets/')) {
    return `https://shared.fastly.steamstatic.com/${pathPart}`;
  }
  return `https://shared.fastly.steamstatic.com/store_item_assets/${pathPart}`;
}

async function checkUrlReturns200(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': STEAM_FETCH_HEADERS['User-Agent'] },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (headRes.status === 200) return true;
    if (headRes.status === 405) {
      const getRes = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': STEAM_FETCH_HEADERS['User-Agent'],
          Range: 'bytes=0-0',
        },
        redirect: 'follow',
        signal: controller.signal,
      });
      return getRes.status === 200 || getRes.status === 206;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveVerifiedCoverImage(appId: number, appData: any): Promise<string> {
  const candidates: string[] = [];

  try {
    const inputJson = JSON.stringify({
      ids: [{ appid: appId }],
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true },
    });
    const browseUrl = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
      inputJson
    )}`;
    const browseData = await fetchJsonWithTimeout(browseUrl, 6000);
    const storeItem = browseData?.response?.store_items?.[0];
    const assets = storeItem?.assets;

    if (assets) {
      const format = assets.asset_url_format || `steam/apps/${appId}/\${FILENAME}`;
      const orderedKeys = [
        'library_capsule_2x',
        'library_capsule',
        'main_capsule',
        'header_2x',
        'header',
      ];
      for (const key of orderedKeys) {
        const built = buildAssetUrl(format, assets[key]);
        if (built) candidates.push(built);
      }
    }
  } catch {
    // Non-fatal; fallback candidates below will still be verified via HEAD
  }

  // Fallback candidates from appdetails and standard Steam CDN paths
  if (typeof appData?.header_image === 'string' && appData.header_image) {
    candidates.push(appData.header_image);
  }
  candidates.push(
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`
  );
  if (typeof appData?.capsule_imagev5 === 'string' && appData.capsule_imagev5) {
    candidates.push(appData.capsule_imagev5);
  }

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  for (const url of uniqueCandidates) {
    const ok = await checkUrlReturns200(url);
    if (ok) return url;
  }

  return typeof appData?.header_image === 'string' ? appData.header_image : '';
}

async function fetchSteamSpecFromUpstream(
  nameQuery: string,
  linkQuery: string,
  forceRefresh: boolean
): Promise<SteamSpecPayload> {
  const now = Date.now();
  const aliasKey = `${linkQuery.trim().toLowerCase()}::${normalizeSearchTitle(nameQuery).toLowerCase()}`;

  // 1. Check direct App ID first from link or name
  let resolvedAppId = extractSteamAppId(linkQuery) || extractSteamAppId(nameQuery);

  // 2. Check alias cache if we don't have direct App ID
  if (!resolvedAppId && !forceRefresh) {
    const cachedAlias = lookupAliasCache.get(aliasKey);
    if (cachedAlias && cachedAlias.expiresAt > now) {
      resolvedAppId = cachedAlias.appId;
    }
  }

  // 3. Check App ID cache
  if (resolvedAppId && !forceRefresh) {
    const cachedEntry = appIdCache.get(resolvedAppId);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      return cachedEntry.data;
    }
  }

  // 4. Fallback to Steam storesearch by normalized game name
  if (!resolvedAppId && nameQuery) {
    resolvedAppId = await resolveAppIdBySearch(nameQuery);
  }

  if (!resolvedAppId) {
    throw new Error('Could not find a matching Steam game for that link or title.');
  }

  // Check cache again after search resolution
  if (!forceRefresh) {
    const cachedEntry = appIdCache.get(resolvedAppId);
    if (cachedEntry && cachedEntry.expiresAt > now) {
      lookupAliasCache.set(aliasKey, {
        appId: resolvedAppId,
        expiresAt: cachedEntry.expiresAt,
      });
      return cachedEntry.data;
    }
  }

  // 5. Fetch Steam appdetails (l=english)
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${resolvedAppId}&l=english&cc=US`;
  const detailsJson = await fetchJsonWithTimeout(detailsUrl, 9000);
  const entry = detailsJson?.[String(resolvedAppId)];

  if (!entry?.success || !entry?.data) {
    throw new Error(`Steam appdetails unavailable for App ID ${resolvedAppId}.`);
  }

  const appData = entry.data;
  const minimum = parseRequirementsHtml(appData.pc_requirements?.minimum);
  const recommended = parseRequirementsHtml(appData.pc_requirements?.recommended);

  // 6. Resolve verified cover image via IStoreBrowseService/GetItems/v1 + HEAD verification
  const coverImage = await resolveVerifiedCoverImage(resolvedAppId, appData);

  const genres: string[] = Array.isArray(appData.genres)
    ? appData.genres
        .map((g: { description?: string }) => g?.description?.trim())
        .filter((g: string | undefined): g is string => Boolean(g))
    : [];

  const lowerGenres = genres.map((g) => g.toLowerCase());
  let primaryGenre = genres[0] || '';
  if (lowerGenres.includes('action') && lowerGenres.includes('rpg')) {
    primaryGenre = 'Action RPG';
  } else if (lowerGenres.includes('action') && lowerGenres.includes('adventure')) {
    primaryGenre = 'Action Adventure';
  } else if (lowerGenres.includes('racing') && lowerGenres.includes('simulation')) {
    primaryGenre = 'Racing Sim';
  } else if (lowerGenres.includes('strategy') && lowerGenres.includes('simulation')) {
    primaryGenre = 'Strategy Sim';
  } else if (genres.length >= 2) {
    primaryGenre = `${genres[0]} / ${genres[1]}`;
  }

  const payload: SteamSpecPayload = {
    appId: resolvedAppId,
    matchedName: appData.name || nameQuery || `Steam App ${resolvedAppId}`,
    steamUrl: `https://store.steampowered.com/app/${resolvedAppId}/`,
    coverImage,
    genres,
    primaryGenre,
    developers: Array.isArray(appData.developers) ? appData.developers : [],
    publishers: Array.isArray(appData.publishers) ? appData.publishers : [],
    releaseDate: appData.release_date?.date || '',
    minimum,
    recommended,
    fetchedAt: now,
  };

  const expiresAt = now + STEAM_CACHE_TTL_MS;
  appIdCache.set(resolvedAppId, { data: payload, expiresAt });
  if (aliasKey !== '::') {
    lookupAliasCache.set(aliasKey, { appId: resolvedAppId, expiresAt });
  }

  return payload;
}

async function startServer() {
  const app = express();
  const uploadsDir = path.resolve(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

  const ALLOWED_COVER_EXTS: Record<string, { ext: string; mediaType: 'photo' | 'video' }> = {
    'video/mp4': { ext: 'mp4', mediaType: 'video' },
    'video/webm': { ext: 'webm', mediaType: 'video' },
    'video/ogg': { ext: 'ogg', mediaType: 'video' },
    'video/quicktime': { ext: 'mov', mediaType: 'video' },
    'video/x-m4v': { ext: 'm4v', mediaType: 'video' },
    'image/jpeg': { ext: 'jpg', mediaType: 'photo' },
    'image/jpg': { ext: 'jpg', mediaType: 'photo' },
    'image/png': { ext: 'png', mediaType: 'photo' },
    'image/webp': { ext: 'webp', mediaType: 'photo' },
    'image/gif': { ext: 'gif', mediaType: 'photo' },
  };

  app.post(
    '/api/upload-cover-media',
    express.raw({ type: ['video/*', 'image/*', 'application/octet-stream'], limit: '50mb' }),
    async (req: Request, res: Response) => {
      try {
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          res.status(400).json({ error: 'No media file received.' });
          return;
        }

        const contentType = String(req.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const rawHeaderName = String(req.headers['x-file-name'] || '');
        let rawName = rawHeaderName;
        try {
          rawName = decodeURIComponent(rawHeaderName);
        } catch {
          rawName = rawHeaderName;
        }
        const extFromName = path.extname(rawName).replace(/^\./, '').toLowerCase();

        let resolved = ALLOWED_COVER_EXTS[contentType];
        if (!resolved && extFromName) {
          if (['mp4', 'webm', 'ogg', 'mov', 'm4v'].includes(extFromName)) {
            resolved = { ext: extFromName, mediaType: 'video' };
          } else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extFromName)) {
            resolved = { ext: extFromName === 'jpeg' ? 'jpg' : extFromName, mediaType: 'photo' };
          }
        }

        if (!resolved) {
          res.status(400).json({
            error: 'Unsupported file format. Please upload MP4, WebM, MOV, JPG, PNG, WebP, or GIF.',
          });
          return;
        }

        const safeName = `cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${resolved.ext}`;
        const targetPath = path.join(uploadsDir, safeName);
        await fs.promises.writeFile(targetPath, buffer);

        res.json({
          url: `/uploads/${safeName}`,
          mediaType: resolved.mediaType,
          size: buffer.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload cover media.';
        res.status(500).json({ error: message });
      }
    }
  );

  app.use(express.json({ limit: '2mb' }));

  // Steam Store Spec & Auto-Fill Proxy Endpoint
  app.get('/api/steam-spec', async (req: Request, res: Response) => {
    const nameQuery = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const linkQuery = typeof req.query.link === 'string' ? req.query.link.trim() : '';
    const refreshParam = typeof req.query.refresh === 'string' ? req.query.refresh.trim() : '';
    const forceRefresh = refreshParam === '1' || refreshParam === 'true';

    if (!nameQuery && !linkQuery) {
      res.status(400).json({ error: 'Please provide a Steam link or game name.' });
      return;
    }

    try {
      const data = await fetchSteamSpecFromUpstream(nameQuery, linkQuery, forceRefresh);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch Steam Store information.';
      const status = message.includes('Could not find') ? 404 : 502;
      res.status(status).json({ error: message });
    }
  });

  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (req: Request, res: Response, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
