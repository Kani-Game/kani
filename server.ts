import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
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

  // Steam New Releases Auto-Update Feed Endpoint (directly from https://store.steampowered.com/)
  const STEAM_ONLINE_FEED_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const STEAM_TAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  let steamPopularTagsCache: { map: Map<number, string>; expiresAt: number } | null = null;
  const steamOnlineFeedCache = new Map<string, { payload: any; expiresAt: number }>();

  const GENERIC_FEATURE_TAGS = new Set([
    'singleplayer',
    'multiplayer',
    'online co-op',
    'co-op',
    'pvp',
    'free to play',
    'early access',
    '3d',
    'first-person',
    'third person',
    'controller',
    'great soundtrack',
    'atmospheric',
    'story rich',
    'difficult',
    'replay value',
    'character customization',
    'female protagonist',
    'pixel graphics',
    'colorful',
    'funny',
    'gore',
    'violent',
    'nudity',
    'sexual content',
  ]);

  async function fetchTextWithTimeout(url: string, timeoutMs = 9000): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': STEAM_FETCH_HEADERS['User-Agent'],
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from ${url}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  function extractAppIdsBetweenMarkers(
    html: string,
    startMarker: string,
    endMarker?: string
  ): number[] {
    if (!html) return [];
    const startIdx = html.indexOf(startMarker);
    if (startIdx < 0) return [];
    const endIdx = endMarker ? html.indexOf(endMarker, startIdx + startMarker.length) : -1;
    const slice =
      endIdx > startIdx ? html.slice(startIdx, endIdx) : html.slice(startIdx, startIdx + 35000);
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const match of slice.matchAll(/data-ds-appid="(\d{3,10})"/g)) {
      const id = Number(match[1]);
      if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return ids;
  }

  async function getSteamTagNameMap(): Promise<Map<number, string>> {
    const now = Date.now();
    if (steamPopularTagsCache && steamPopularTagsCache.expiresAt > now) {
      return steamPopularTagsCache.map;
    }
    try {
      const tagsList = await fetchJsonWithTimeout(
        'https://store.steampowered.com/tagdata/populartags/english',
        7000
      );
      const map = new Map<number, string>();
      if (Array.isArray(tagsList)) {
        for (const t of tagsList) {
          if (t && typeof t.tagid === 'number' && typeof t.name === 'string') {
            map.set(t.tagid, t.name.trim());
          }
        }
      }
      steamPopularTagsCache = { map, expiresAt: now + STEAM_TAG_CACHE_TTL_MS };
      return map;
    } catch {
      return steamPopularTagsCache?.map || new Map<number, string>();
    }
  }

  function resolveGenreFromSteamTags(tagIds: number[], tagMap: Map<number, string>): string {
    const names = tagIds
      .map((id) => tagMap.get(id))
      .filter((n): n is string => Boolean(n));
    const specific = names.filter((n) => !GENERIC_FEATURE_TAGS.has(n.toLowerCase()));
    const lowerSet = new Set(specific.map((n) => n.toLowerCase()));

    if (lowerSet.has('action') && lowerSet.has('rpg')) return 'Action RPG';
    if (lowerSet.has('action') && lowerSet.has('adventure')) return 'Action Adventure';
    if (lowerSet.has('battle royale')) return 'Battle Royale';
    if (lowerSet.has('mmorpg') || lowerSet.has('massively multiplayer')) return 'MMORPG';
    if (lowerSet.has('tactical') && (lowerSet.has('fps') || lowerSet.has('shooter'))) {
      return 'Tactical Shooter';
    }
    if (lowerSet.has('fps')) return 'FPS Shooter';
    if (lowerSet.has('racing') && lowerSet.has('simulation')) return 'Racing Sim';
    if (lowerSet.has('survival')) return 'Survival';
    if (specific.length >= 2) return `${specific[0]} / ${specific[1]}`;
    if (specific.length === 1) return specific[0];
    if (names.length >= 1) return names[0];
    return 'Steam Game';
  }

  async function fetchSteamOnlineFeedFromUpstream(
    source: string,
    limit: number,
    forceRefresh: boolean
  ) {
    const normalizedSource =
      source === 'new_releases_online' || source === 'top_sellers_online'
        ? source
        : 'popular_new_online';
    const clampedLimit = Math.max(1, Math.min(50, limit || 30));
    const cacheKey = `${normalizedSource}::${clampedLimit}`;
    const now = Date.now();

    if (!forceRefresh) {
      const cached = steamOnlineFeedCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return cached.payload;
      }
    }

    const extractAllAppIds = (html: string): number[] => {
      if (!html) return [];
      const ids: number[] = [];
      const seen = new Set<number>();
      for (const match of html.matchAll(/data-ds-appid="(\d{3,10})"/g)) {
        const id = Number(match[1]);
        if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      return ids;
    };

    const [
      homeHtml,
      exploreHtml,
      featuredCategories,
      searchPopularPaid1,
      searchPopularPaid2,
      searchTopSellersPaid1,
      searchTopSellersPaid2,
      tagMap,
    ] = await Promise.all([
      fetchTextWithTimeout('https://store.steampowered.com/?cc=US&l=english', 9000).catch(() => ''),
      fetchTextWithTimeout('https://store.steampowered.com/explore/new/?cc=US&l=english', 9000).catch(
        () => ''
      ),
      fetchJsonWithTimeout('https://store.steampowered.com/api/featuredcategories/?l=english&cc=US', 8000).catch(
        () => null
      ),
      fetchJsonWithTimeout(
        'https://store.steampowered.com/search/results/?query&filter=popularnew&category1=998&hidef2p=1&infinite=1&start=0&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJsonWithTimeout(
        'https://store.steampowered.com/search/results/?query&filter=popularnew&category1=998&hidef2p=1&infinite=1&start=60&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJsonWithTimeout(
        'https://store.steampowered.com/search/results/?query&filter=topsellers&category1=998&hidef2p=1&infinite=1&start=0&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJsonWithTimeout(
        'https://store.steampowered.com/search/results/?query&filter=topsellers&category1=998&hidef2p=1&infinite=1&start=60&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      getSteamTagNameMap(),
    ]);

    // 1. Steam Homepage "Popular New Releases" tab (https://store.steampowered.com/)
    const homePopularNewIds = extractAppIdsBetweenMarkers(
      homeHtml,
      'id="tab_newreleases_content"',
      'id="tab_topsellers_content"'
    );
    // 2. Steam Explore New "New Top Sellers Released This Month"
    const exploreTopMonthIds = extractAppIdsBetweenMarkers(
      exploreHtml,
      'New Top Sellers',
      'Popular New Releases'
    );
    // 3. Steam Explore New "New Releases" latest queue
    const exploreAllNewIds = extractAppIdsBetweenMarkers(
      exploreHtml,
      'id="tab_allnewreleases_content"',
      'id="tab_under10_content"'
    );
    // 4. Steam paid popular / top-sellers search results (excludes free-to-play via hidef2p=1)
    const searchPopularPaidIds = [
      ...extractAllAppIds(String(searchPopularPaid1?.results_html || '')),
      ...extractAllAppIds(String(searchPopularPaid2?.results_html || '')),
    ];
    const searchTopPaidIds = [
      ...extractAllAppIds(String(searchTopSellersPaid1?.results_html || '')),
      ...extractAllAppIds(String(searchTopSellersPaid2?.results_html || '')),
    ];
    // 5. Steam featured categories new_releases fallback
    const featuredNewIds: number[] = Array.isArray(featuredCategories?.new_releases?.items)
      ? featuredCategories.new_releases.items
          .map((item: any) => Number(item?.id))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      : [];

    const orderedAppIds: number[] = [];
    const seenIds = new Set<number>();
    const appendIds = (list: number[]) => {
      for (const id of list) {
        if (Number.isFinite(id) && id > 0 && !seenIds.has(id)) {
          seenIds.add(id);
          orderedAppIds.push(id);
        }
      }
    };

    if (normalizedSource === 'new_releases_online') {
      appendIds(homePopularNewIds);
      appendIds(exploreAllNewIds);
      appendIds(exploreTopMonthIds);
      appendIds(searchPopularPaidIds);
      appendIds(featuredNewIds);
    } else if (normalizedSource === 'top_sellers_online') {
      appendIds(exploreTopMonthIds);
      appendIds(searchTopPaidIds);
      appendIds(homePopularNewIds);
      appendIds(searchPopularPaidIds);
    } else {
      // Default: Paid ($20+) Popular New Releases + 1-Year Paid Top & Popular Releases from store.steampowered.com
      appendIds(exploreTopMonthIds);
      appendIds(homePopularNewIds);
      appendIds(searchPopularPaidIds);
      appendIds(searchTopPaidIds);
      appendIds(featuredNewIds);
    }

    const batchIds = orderedAppIds.slice(0, 180);
    if (batchIds.length === 0) {
      throw new Error('Could not load paid $20+ new releases from store.steampowered.com.');
    }

    const chunks: number[][] = [];
    for (let i = 0; i < batchIds.length; i += 70) {
      chunks.push(batchIds.slice(i, i + 70));
    }

    const browseResponses = await Promise.all(
      chunks.map((chunk) => {
        const browseInput = JSON.stringify({
          ids: chunk.map((appid) => ({ appid })),
          context: { language: 'english', country_code: 'US' },
          data_request: {
            include_assets: true,
            include_basic_info: true,
            include_release: true,
            include_tag_count: 10,
            include_all_purchase_options: false,
          },
        });
        return fetchJsonWithTimeout(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
            browseInput
          )}`,
          9500
        ).catch(() => null);
      })
    );

    const storeItems: any[] = [];
    for (const resp of browseResponses) {
      if (Array.isArray(resp?.response?.store_items)) {
        storeItems.push(...resp.response.store_items);
      }
    }

    const itemById = new Map<number, any>();
    for (const si of storeItems) {
      if (si && typeof si.appid === 'number') {
        itemById.set(si.appid, si);
      }
    }

    const nowSec = Math.floor(now / 1000);
    const maxAgeSec = 365 * 86400; // Last 1 year of paid Steam releases
    const minPriceCents = 2000; // Strictly $20.00 USD and above
    const filteredItems: any[] = [];
    for (const appId of batchIds) {
      const item = itemById.get(appId);
      // type === 0 ensures full Games only (skips DLCs, demos, soundtracks, videos, bundles)
      if (!item || item.success !== 1 || item.visible === false || item.type !== 0 || !item.name) {
        continue;
      }
      if (item.release?.is_coming_soon) {
        continue;
      }
      // Paid games $20+ only — exclude all free & under-$20 titles
      if (item.is_free) {
        continue;
      }
      const rawCents = Number(item.best_purchase_option?.final_price_in_cents);
      if (!Number.isFinite(rawCents) || rawCents < minPriceCents) {
        continue;
      }
      // Strictly released within the last 1 year
      const relSec = Number(item.release?.steam_release_date || 0);
      if (!Number.isFinite(relSec) || relSec <= 0 || nowSec - relSec > maxAgeSec) {
        continue;
      }
      filteredItems.push(item);
      if (filteredItems.length >= clampedLimit) break;
    }

    const games = await Promise.all(
      filteredItems.map(async (item) => {
        const appId = Number(item.appid);
        const assets = item.assets || {};
        const format = assets.asset_url_format || `steam/apps/${appId}/\${FILENAME}`;
        const directManifestCover =
          buildAssetUrl(format, assets.library_capsule_2x) ||
          buildAssetUrl(format, assets.library_capsule) ||
          buildAssetUrl(format, assets.main_capsule_2x) ||
          buildAssetUrl(format, assets.header_2x) ||
          buildAssetUrl(format, assets.header);

        let coverImg = directManifestCover || '';
        if (!coverImg) {
          const fallbackCandidates = [
            `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
            `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
          ];
          coverImg = fallbackCandidates[1];
          for (const url of fallbackCandidates) {
            if (await checkUrlReturns200(url)) {
              coverImg = url;
              break;
            }
          }
        }

        const tagIds: number[] = Array.isArray(item.tagids) ? item.tagids : [];
        const genre = resolveGenreFromSteamTags(tagIds, tagMap);
        const origCents = Number(item.best_purchase_option?.original_price_in_cents);
        const finalCents = Number(item.best_purchase_option?.final_price_in_cents);
        const fullCents =
          Number.isFinite(origCents) && origCents > 0
            ? Math.max(origCents, Number.isFinite(finalCents) ? finalCents : 0)
            : finalCents;
        const steamPriceUsd = Number.isFinite(fullCents) && fullCents >= minPriceCents ? fullCents / 100 : 0;
        const releaseSec = Number(item.release?.steam_release_date);
        const releaseDate =
          Number.isFinite(releaseSec) && releaseSec > 0
            ? new Date(releaseSec * 1000).toISOString().slice(0, 10)
            : '';

        return {
          appId,
          name: String(item.name).trim(),
          genre: genre.slice(0, 100),
          img: coverImg,
          steamUrl: `https://store.steampowered.com/app/${appId}/`,
          releaseDate,
          steamPriceUsd,
          isFree: false,
        };
      })
    );

    const validGames = games.filter((g) => g.name && g.img && g.genre && g.steamPriceUsd >= 20 && !g.isFree);
    const payload = {
      fetchedAt: now,
      source: normalizedSource,
      count: validGames.length,
      games: validGames,
    };

    steamOnlineFeedCache.set(cacheKey, {
      payload,
      expiresAt: now + STEAM_ONLINE_FEED_CACHE_TTL_MS,
    });

    return payload;
  }

  app.get('/api/steam-online-games', async (req: Request, res: Response) => {
    const source = typeof req.query.source === 'string' ? req.query.source.trim() : 'popular_new_online';
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;
    const refreshParam = typeof req.query.refresh === 'string' ? req.query.refresh.trim() : '';
    const forceRefresh = refreshParam === '1' || refreshParam === 'true';

    try {
      const payload = await fetchSteamOnlineFeedFromUpstream(source, limit, forceRefresh);
      res.setHeader('Cache-Control', 'public, max-age=120');
      res.json(payload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch new games from Steam Store.';
      res.status(502).json({ error: message });
    }
  });

  // Batch Steam Full Price Resolver (for existing/manual Steam Online games)
  const steamPriceCache = new Map<number, { steamPriceUsd: number; expiresAt: number }>();

  app.post('/api/steam-prices', async (req: Request, res: Response) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems.slice(0, 50) as Array<{
      id?: string;
      name?: string;
      link?: string;
      steamAppId?: number;
    }>;

    if (items.length === 0) {
      res.json({ prices: {} });
      return;
    }

    const now = Date.now();
    const resolvedList = await Promise.all(
      items.map(async (item) => {
        const key = String(item.id || item.name || '').trim();
        if (!key) return null;
        let appId: number | null =
          (typeof item.steamAppId === 'number' && Number.isFinite(item.steamAppId) && item.steamAppId > 0
            ? item.steamAppId
            : null) ||
          extractSteamAppId(item.link) ||
          extractSteamAppId(item.name);

        if (!appId && item.name) {
          const aliasKey = `::${normalizeSearchTitle(item.name).toLowerCase()}`;
          const cachedAlias = lookupAliasCache.get(aliasKey);
          if (cachedAlias && cachedAlias.expiresAt > now) {
            appId = cachedAlias.appId;
          } else {
            appId = await resolveAppIdBySearch(item.name).catch(() => null);
            if (appId && aliasKey !== '::') {
              lookupAliasCache.set(aliasKey, { appId, expiresAt: now + STEAM_CACHE_TTL_MS });
            }
          }
        }

        if (!appId) return null;
        return { key, appId };
      })
    );

    const validEntries = resolvedList.filter(
      (entry): entry is { key: string; appId: number } => Boolean(entry)
    );
    const prices: Record<string, { appId: number; steamPriceUsd: number }> = {};
    const uncachedAppIds = new Set<number>();

    for (const entry of validEntries) {
      const cached = steamPriceCache.get(entry.appId);
      if (cached && cached.expiresAt > now && cached.steamPriceUsd > 0) {
        prices[entry.key] = { appId: entry.appId, steamPriceUsd: cached.steamPriceUsd };
      } else {
        uncachedAppIds.add(entry.appId);
      }
    }

    const missingIds = Array.from(uncachedAppIds);
    if (missingIds.length > 0) {
      try {
        const browseInput = JSON.stringify({
          ids: missingIds.map((appid) => ({ appid })),
          context: { language: 'english', country_code: 'US' },
          data_request: {
            include_assets: false,
            include_basic_info: false,
            include_all_purchase_options: false,
          },
        });
        const browseResp = await fetchJsonWithTimeout(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
            browseInput
          )}`,
          8500
        ).catch(() => null);

        const storeItems = Array.isArray(browseResp?.response?.store_items)
          ? browseResp.response.store_items
          : [];
        for (const si of storeItems) {
          const idNum = Number(si?.appid);
          if (!Number.isFinite(idNum) || idNum <= 0) continue;
          const origCents = Number(si?.best_purchase_option?.original_price_in_cents);
          const finalCents = Number(si?.best_purchase_option?.final_price_in_cents);
          const fullCents =
            Number.isFinite(origCents) && origCents > 0
              ? Math.max(origCents, Number.isFinite(finalCents) ? finalCents : 0)
              : finalCents;
          if (Number.isFinite(fullCents) && fullCents > 0) {
            const usd = Math.round(fullCents) / 100;
            steamPriceCache.set(idNum, { steamPriceUsd: usd, expiresAt: now + STEAM_CACHE_TTL_MS });
          }
        }
      } catch {
        // Fallback below for individual missing items
      }

      // Fallback via appdetails for any appId still missing price
      const stillMissing = missingIds.filter((idNum) => !steamPriceCache.has(idNum));
      if (stillMissing.length > 0) {
        await Promise.all(
          stillMissing.slice(0, 15).map(async (idNum) => {
            try {
              const details = await fetchJsonWithTimeout(
                `https://store.steampowered.com/api/appdetails?appids=${idNum}&filters=price_overview&cc=US&l=en`,
                6000
              );
              const overview = details?.[String(idNum)]?.data?.price_overview;
              const rawCents = Number(overview?.initial || overview?.final);
              if (Number.isFinite(rawCents) && rawCents > 0) {
                const usd = Math.round(rawCents) / 100;
                steamPriceCache.set(idNum, { steamPriceUsd: usd, expiresAt: now + STEAM_CACHE_TTL_MS });
              }
            } catch {
              // ignore individual lookup error
            }
          })
        );
      }

      for (const entry of validEntries) {
        const resolved = steamPriceCache.get(entry.appId);
        if (resolved && resolved.steamPriceUsd > 0) {
          prices[entry.key] = { appId: entry.appId, steamPriceUsd: resolved.steamPriceUsd };
        }
      }
    }

    res.json({ prices });
  });

  const httpServer = http.createServer(app);

  const isProd =
    process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(
        express.static(distDir, {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('index.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
          },
        })
      );
      app.get('*', (req: Request, res: Response, next) => {
        if (req.path.startsWith('/api/')) {
          next();
          return;
        }
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
