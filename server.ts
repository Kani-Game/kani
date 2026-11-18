import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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

const STEAM_TAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let steamPopularTagsCache: { map: Map<number, string>; expiresAt: number } | null = null;

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

const NON_GENRE_OFFICIAL = new Set([
  'free to play',
  'early access',
  'utilities',
  'software',
  'design & illustration',
  'web publishing',
  'animation & modeling',
  'video production',
  'audio production',
  'photo editing',
  'game development',
  'education',
  'accounting',
]);

function resolveAccurateSteamGenre(officialGenres: string[], tagNames: string[]): string {
  const cleanOfficial = officialGenres
    .map((g) => g.trim())
    .filter((g) => g.length > 0 && !NON_GENRE_OFFICIAL.has(g.toLowerCase()));
  const cleanTags = tagNames.map((t) => t.trim()).filter(Boolean);

  const officialLower = new Set(cleanOfficial.map((g) => g.toLowerCase()));
  const top4 = new Set(cleanTags.slice(0, 4).map((t) => t.toLowerCase()));
  const top5 = new Set(cleanTags.slice(0, 5).map((t) => t.toLowerCase()));
  const top6 = new Set(cleanTags.slice(0, 6).map((t) => t.toLowerCase()));
  const top8 = new Set(cleanTags.slice(0, 8).map((t) => t.toLowerCase()));
  const top12 = new Set(cleanTags.slice(0, 12).map((t) => t.toLowerCase()));

  // High-specificity community/Steam genre rules (checked in priority order)
  if (top6.has('battle royale')) return 'Battle Royale';
  if (top6.has('metroidvania')) return 'Metroidvania';
  if (
    top6.has('mmorpg') ||
    ((officialLower.has('massively multiplayer') || top5.has('massively multiplayer')) &&
      (officialLower.has('rpg') || top8.has('rpg')))
  ) {
    return 'MMORPG';
  }
  if (top6.has('souls-like') || top6.has('soulslike')) return 'Soulslike';
  if (
    top6.has('tactical') &&
    (top8.has('fps') ||
      top8.has('first-person shooter') ||
      top8.has('third-person shooter') ||
      top8.has('shooter'))
  ) {
    return 'Tactical Shooter';
  }
  if (
    top8.has('survival horror') ||
    (top8.has('survival') && top8.has('horror'))
  ) {
    return 'Survival Horror';
  }
  if (top5.has('horror') || top5.has('psychological horror')) return 'Horror';
  if (
    top6.has('fps') ||
    top6.has('first-person shooter') ||
    top6.has('hero shooter') ||
    top6.has('looter shooter') ||
    top6.has('boomer shooter') ||
    top6.has('extraction shooter')
  ) {
    return 'FPS Shooter';
  }
  if (top6.has('third-person shooter') || top5.has('shooter') || top5.has('shoot \'em up')) {
    return 'Shooter';
  }
  if (top6.has('farming sim') || top6.has('agriculture')) return 'Farming Sim';
  if (top6.has('city builder') || top6.has('colony sim')) return 'City Builder';
  if (
    (officialLower.has('racing') || top5.has('racing')) &&
    (officialLower.has('simulation') ||
      top8.has('simulation') ||
      top8.has('automobile sim') ||
      top8.has('driving'))
  ) {
    return 'Racing Sim';
  }
  if (officialLower.has('racing') || top5.has('racing')) return 'Racing';
  if (
    top6.has('automobile sim') ||
    top6.has('flight') ||
    top6.has('space sim') ||
    top6.has('trains') ||
    (top5.has('driving') && (officialLower.has('simulation') || top8.has('simulation')))
  ) {
    return 'Vehicle Sim';
  }
  if (
    officialLower.has('sports') ||
    top5.has('sports') ||
    top5.has('football (soccer)') ||
    top5.has('basketball')
  ) {
    return 'Sports';
  }
  if (top6.has('fighting') || top6.has('2d fighter') || top6.has('3d fighter')) {
    return 'Fighting';
  }
  if (
    top6.has('action rpg') ||
    top6.has('arpg') ||
    ((officialLower.has('action') || top8.has('action')) &&
      (officialLower.has('rpg') || top8.has('rpg')))
  ) {
    return 'Action RPG';
  }
  if (top6.has('jrpg')) return 'JRPG';
  if (top6.has('tactical rpg') || top6.has('crpg') || top6.has('turn-based rpg')) {
    return 'Tactical RPG';
  }
  if (officialLower.has('rpg') || top5.has('rpg')) return 'RPG';
  if (
    top6.has('open world survival craft') ||
    (top5.has('open world') && top6.has('survival'))
  ) {
    return 'Open World Survival';
  }
  if (top5.has('survival')) return 'Survival';
  if (
    top6.has('roguelike') ||
    top6.has('roguelite') ||
    top6.has('action roguelike') ||
    top6.has('roguelike deckbuilder')
  ) {
    return 'Roguelike';
  }
  if (top6.has('rts') || top6.has('real time strategy') || top6.has('real-time tactics')) {
    return top12.has('tactical') || top12.has('wargame') ? 'Tactical RTS' : 'RTS Strategy';
  }
  if (
    top6.has('grand strategy') ||
    top6.has('4x') ||
    top6.has('turn-based strategy')
  ) {
    return 'Strategy';
  }
  if (top6.has('tower defense')) return 'Tower Defense';
  if (top6.has('hack and slash') || top6.has('spectacle fighter') || top6.has("beat 'em up")) {
    return 'Hack & Slash';
  }
  if (top5.has('stealth')) return 'Stealth Action';
  if (top5.has('visual novel')) return 'Visual Novel';
  if (
    top5.has('platformer') ||
    top5.has('2d platformer') ||
    top5.has('3d platformer') ||
    top5.has('precision platformer')
  ) {
    return 'Platformer';
  }
  if (top5.has('puzzle') || top5.has('puzzle-platformer') || top5.has('detective')) {
    return 'Puzzle';
  }
  if (
    top4.has('open world') &&
    (officialLower.has('action') || officialLower.has('adventure') || top6.has('action'))
  ) {
    return 'Open World';
  }
  if (
    (officialLower.has('action') && officialLower.has('adventure')) ||
    (top5.has('action') && top5.has('adventure')) ||
    top5.has('action-adventure')
  ) {
    return 'Action Adventure';
  }
  if (officialLower.has('strategy') && officialLower.has('simulation')) {
    return 'Strategy Sim';
  }
  if (top6.has('life sim') || top6.has('dating sim') || top6.has('management')) {
    return 'Simulation';
  }

  // Official Steam genre priority (prefer primary genre over generic Indie/Casual)
  for (const g of ['Simulation', 'Strategy', 'Adventure', 'Action', 'Casual']) {
    if (officialLower.has(g.toLowerCase()) || top5.has(g.toLowerCase())) {
      return g;
    }
  }
  if (officialLower.has('massively multiplayer')) return 'MMORPG';
  if (officialLower.has('indie')) return 'Indie';
  if (cleanOfficial.length > 0) return cleanOfficial[0];

  const nonIndieTag = cleanTags.find((t) =>
    ['action', 'adventure', 'simulation', 'strategy', 'rpg', 'casual', 'sports', 'racing', 'indie'].includes(
      t.toLowerCase()
    )
  );
  if (nonIndieTag) return nonIndieTag;

  return 'Steam Game';
}

async function resolveBrowseAssetsAndTags(
  appId: number,
  appData: any
): Promise<{ coverImage: string; tagIds: number[] }> {
  const candidates: string[] = [];
  let tagIds: number[] = [];

  try {
    const inputJson = JSON.stringify({
      ids: [{ appid: appId }],
      context: { language: 'english', country_code: 'US' },
      data_request: { include_assets: true, include_tag_count: 15 },
    });
    const browseUrl = `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
      inputJson
    )}`;
    const browseData = await fetchJsonWithTimeout(browseUrl, 6000);
    const storeItem = browseData?.response?.store_items?.[0];
    if (Array.isArray(storeItem?.tagids)) {
      tagIds = storeItem.tagids.filter((id: unknown) => typeof id === 'number');
    }
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

  let coverImage = typeof appData?.header_image === 'string' ? appData.header_image : '';
  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  for (const url of uniqueCandidates) {
    const ok = await checkUrlReturns200(url);
    if (ok) {
      coverImage = url;
      break;
    }
  }

  return { coverImage, tagIds };
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

  // 5. Fetch Steam appdetails (l=english) & tag map in parallel
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${resolvedAppId}&l=english&cc=US`;
  const [detailsJson, tagMap] = await Promise.all([
    fetchJsonWithTimeout(detailsUrl, 9000),
    getSteamTagNameMap(),
  ]);
  const entry = detailsJson?.[String(resolvedAppId)];

  if (!entry?.success || !entry?.data) {
    throw new Error(`Steam appdetails unavailable for App ID ${resolvedAppId}.`);
  }

  const appData = entry.data;
  const minimum = parseRequirementsHtml(appData.pc_requirements?.minimum);
  const recommended = parseRequirementsHtml(appData.pc_requirements?.recommended);

  // 6. Resolve verified cover image + Steam community tags via IStoreBrowseService/GetItems/v1
  const { coverImage, tagIds } = await resolveBrowseAssetsAndTags(resolvedAppId, appData);

  const officialGenres: string[] = Array.isArray(appData.genres)
    ? appData.genres
        .map((g: { description?: string }) => g?.description?.trim())
        .filter((g: string | undefined): g is string => Boolean(g))
    : [];
  const tagNames = tagIds
    .map((id) => tagMap.get(id))
    .filter((n): n is string => Boolean(n));

  const primaryGenre = resolveAccurateSteamGenre(officialGenres, tagNames);
  const genres = Array.from(
    new Set([primaryGenre, ...officialGenres].filter((g) => g && g.trim().length > 0))
  );

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
  const steamOnlineFeedCache = new Map<string, { payload: any; expiresAt: number }>();

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

  function resolveGenreFromSteamTags(tagIds: number[], tagMap: Map<number, string>): string {
    const names = tagIds
      .map((id) => tagMap.get(id))
      .filter((n): n is string => Boolean(n));
    return resolveAccurateSteamGenre([], names);
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

  // Batch Steam Accurate Genre Resolver (for syncing both old and new games)
  const steamGenreCache = new Map<
    number,
    { appId: number; genre: string; matchedName?: string; expiresAt: number }
  >();

  app.post('/api/steam-genres', async (req: Request, res: Response) => {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = rawItems.slice(0, 50) as Array<{
      id?: string;
      name?: string;
      link?: string;
      steamAppId?: number;
    }>;

    if (items.length === 0) {
      res.json({ genres: {} });
      return;
    }

    const now = Date.now();
    const resolvedList: Array<{ key: string; appId: number }> = [];

    // Resolve App IDs with bounded concurrency to avoid Steam throttling
    for (let i = 0; i < items.length; i += 6) {
      const slice = items.slice(i, i + 6);
      const batchResolved = await Promise.all(
        slice.map(async (item) => {
          const key = String(item.id || item.name || '').trim();
          if (!key) return null;

          let appId: number | null =
            (typeof item.steamAppId === 'number' &&
            Number.isFinite(item.steamAppId) &&
            item.steamAppId > 0
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
      for (const entry of batchResolved) {
        if (entry) resolvedList.push(entry);
      }
    }

    const genres: Record<
      string,
      { appId: number; genre: string; steamUrl: string; matchedName?: string }
    > = {};
    const uncachedAppIds = new Set<number>();

    for (const entry of resolvedList) {
      const cached = steamGenreCache.get(entry.appId);
      if (cached && cached.expiresAt > now && cached.genre) {
        genres[entry.key] = {
          appId: entry.appId,
          genre: cached.genre,
          steamUrl: `https://store.steampowered.com/app/${entry.appId}/`,
          matchedName: cached.matchedName,
        };
      } else {
        uncachedAppIds.add(entry.appId);
      }
    }

    const missingIds = Array.from(uncachedAppIds);
    if (missingIds.length > 0) {
      const tagMap = await getSteamTagNameMap();
      const browseInput = JSON.stringify({
        ids: missingIds.map((appid) => ({ appid })),
        context: { language: 'english', country_code: 'US' },
        data_request: {
          include_assets: false,
          include_basic_info: true,
          include_tag_count: 15,
        },
      });

      try {
        const browseResp = await fetchJsonWithTimeout(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
            browseInput
          )}`,
          9500
        ).catch(() => null);

        const storeItems = Array.isArray(browseResp?.response?.store_items)
          ? browseResp.response.store_items
          : [];

        for (const si of storeItems) {
          const idNum = Number(si?.appid);
          if (!Number.isFinite(idNum) || idNum <= 0) continue;
          const tagIds: number[] = Array.isArray(si?.tagids) ? si.tagids : [];
          const tagNames = tagIds
            .map((id) => tagMap.get(id))
            .filter((n): n is string => Boolean(n));
          const genre = resolveAccurateSteamGenre([], tagNames);
          if (genre) {
            steamGenreCache.set(idNum, {
              appId: idNum,
              genre,
              matchedName: typeof si?.name === 'string' ? si.name.trim() : undefined,
              expiresAt: now + STEAM_CACHE_TTL_MS,
            });
          }
        }
      } catch {
        // Fallback below
      }

      // Fallback via appdetails for any appId with no tags resolved
      const stillMissing = missingIds.filter((idNum) => {
        const hit = steamGenreCache.get(idNum);
        return !hit || hit.genre === 'Steam Game';
      });
      if (stillMissing.length > 0) {
        await Promise.all(
          stillMissing.slice(0, 12).map(async (idNum) => {
            try {
              const details = await fetchJsonWithTimeout(
                `https://store.steampowered.com/api/appdetails?appids=${idNum}&l=english&cc=US`,
                6500
              );
              const data = details?.[String(idNum)]?.data;
              const officialGenres: string[] = Array.isArray(data?.genres)
                ? data.genres
                    .map((g: { description?: string }) => g?.description?.trim())
                    .filter((g: string | undefined): g is string => Boolean(g))
                : [];
              if (officialGenres.length > 0) {
                const genre = resolveAccurateSteamGenre(officialGenres, []);
                steamGenreCache.set(idNum, {
                  appId: idNum,
                  genre,
                  matchedName: typeof data?.name === 'string' ? data.name.trim() : undefined,
                  expiresAt: now + STEAM_CACHE_TTL_MS,
                });
              }
            } catch {
              // ignore individual fallback error
            }
          })
        );
      }

      for (const entry of resolvedList) {
        const resolved = steamGenreCache.get(entry.appId);
        if (resolved && resolved.genre) {
          genres[entry.key] = {
            appId: entry.appId,
            genre: resolved.genre,
            steamUrl: `https://store.steampowered.com/app/${entry.appId}/`,
            matchedName: resolved.matchedName,
          };
        }
      }
    }

    res.json({ genres });
  });

  // Google AI (Gemini) PC Compatibility Checker Endpoint (Low-latency + cached)
  const pcCompatibilityCache = new Map<string, { report: any; expiresAt: number }>();

  app.post('/api/pc-compatibility', async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: 'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.',
      });
      return;
    }

    const gameName = typeof req.body?.gameName === 'string' ? req.body.gameName.trim() : '';
    const userPc = req.body?.userPc || {};
    const steamSpec = req.body?.steamSpec || {};

    if (!gameName || (!steamSpec?.minimum && !steamSpec?.recommended)) {
      res.status(400).json({ error: 'Missing game specifications to compare.' });
      return;
    }

    const userOs = String(userPc?.os || 'Windows 11 64-bit').trim();
    const userCpu = String(userPc?.cpu || '').trim();
    const userRamGb = Number(userPc?.ramGb) > 0 ? Number(userPc.ramGb) : 0;
    const userGpu = String(userPc?.gpu || '').trim();
    const userStorageGb = Number(userPc?.storageFreeGb) > 0 ? Number(userPc.storageFreeGb) : 0;

    const findField = (block: any, keys: string[]): string => {
      const items = Array.isArray(block?.items) ? block.items : [];
      for (const item of items) {
        const lbl = String(item?.label || '').toLowerCase();
        if (keys.some((k) => lbl.includes(k))) {
          return String(item?.value || '').trim();
        }
      }
      return '';
    };

    const minOs = findField(steamSpec.minimum, ['os', 'operating']);
    const recOs = findField(steamSpec.recommended, ['os', 'operating']);
    const minCpu = findField(steamSpec.minimum, ['processor', 'cpu']);
    const recCpu = findField(steamSpec.recommended, ['processor', 'cpu']);
    const minRam = findField(steamSpec.minimum, ['memory', 'ram']);
    const recRam = findField(steamSpec.recommended, ['memory', 'ram']);
    const minGpu = findField(steamSpec.minimum, ['graphics', 'gpu', 'video']);
    const recGpu = findField(steamSpec.recommended, ['graphics', 'gpu', 'video']);
    const minStorage = findField(steamSpec.minimum, ['storage', 'disk', 'drive']);
    const recStorage = findField(steamSpec.recommended, ['storage', 'disk', 'drive']);

    const cacheKey = JSON.stringify({
      gameName: gameName.toLowerCase(),
      appId: steamSpec?.appId || '',
      userOs,
      userCpu: userCpu.toLowerCase(),
      userRamGb,
      userGpu: userGpu.toLowerCase(),
      userStorageGb,
      minCpu,
      minRam,
      minGpu,
    });

    const now = Date.now();
    const cached = pcCompatibilityCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      res.json({ report: cached.report });
      return;
    }

    const prompt = [
      `Game: ${gameName}`,
      `User PC -> OS: ${userOs} | CPU: ${userCpu || 'Not entered'} | RAM: ${
        userRamGb > 0 ? `${userRamGb} GB` : 'Not entered'
      } | GPU: ${userGpu || 'Not entered'} | Free Storage: ${
        userStorageGb > 0 ? `${userStorageGb} GB` : 'Not entered'
      }`,
      `Minimum -> OS: ${minOs || '—'} | CPU: ${minCpu || '—'} | RAM: ${minRam || '—'} | GPU: ${
        minGpu || '—'
      } | Storage: ${minStorage || '—'}`,
      `Recommended -> OS: ${recOs || '—'} | CPU: ${recCpu || '—'} | RAM: ${
        recRam || '—'
      } | GPU: ${recGpu || '—'} | Storage: ${recStorage || '—'}`,
      'Rules: Recognize shorthand/laptop/integrated GPUs & CPUs accurately. If a user part is "Not entered", status="unknown". Each note must be 1 brief Khmer sentence (under 15 words). summaryKm: 1 concise Khmer sentence with expected FPS/settings.',
    ].join('\n');

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    try {
      const candidateConfigs: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
        { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
        { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
      ];
      let response: any = null;
      let lastErr: any = null;

      for (let attempt = 0; attempt < candidateConfigs.length; attempt++) {
        const cfg = candidateConfigs[attempt];
        try {
          response = await ai.models.generateContent({
            model: cfg.model,
            contents: prompt,
            config: {
              systemInstruction:
                'Fast expert PC gaming hardware benchmark evaluator. Return compact JSON strictly following the schema with short natural Khmer feedback.',
              thinkingConfig: { thinkingLevel: cfg.thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  overall: {
                    type: Type.STRING,
                    enum: ['recommended', 'minimum', 'below', 'partial'],
                  },
                  headlineEn: { type: Type.STRING },
                  headlineKm: { type: Type.STRING },
                  summaryKm: { type: Type.STRING },
                  osStatus: { type: Type.STRING, enum: ['recommended', 'minimum', 'below', 'unknown'] },
                  osNote: { type: Type.STRING },
                  cpuStatus: { type: Type.STRING, enum: ['recommended', 'minimum', 'below', 'unknown'] },
                  cpuNote: { type: Type.STRING },
                  ramStatus: { type: Type.STRING, enum: ['recommended', 'minimum', 'below', 'unknown'] },
                  ramNote: { type: Type.STRING },
                  gpuStatus: { type: Type.STRING, enum: ['recommended', 'minimum', 'below', 'unknown'] },
                  gpuNote: { type: Type.STRING },
                  storageStatus: { type: Type.STRING, enum: ['recommended', 'minimum', 'below', 'unknown'] },
                  storageNote: { type: Type.STRING },
                },
                required: [
                  'overall',
                  'headlineEn',
                  'headlineKm',
                  'summaryKm',
                  'osStatus',
                  'osNote',
                  'cpuStatus',
                  'cpuNote',
                  'ramStatus',
                  'ramNote',
                  'gpuStatus',
                  'gpuNote',
                  'storageStatus',
                  'storageNote',
                ],
              },
            },
          });
          break;
        } catch (err: any) {
          lastErr = err;
          const status = typeof err?.status === 'number' ? err.status : 0;
          const msg = String(err?.message || '');
          const isTransient =
            [429, 500, 502, 503, 504].includes(status) ||
            /503|unavailable|high demand|overloaded|429|resource_exhausted/i.test(msg);
          if (!isTransient || attempt === candidateConfigs.length - 1) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      const rawText = (response?.text ?? '').trim();
      if (!rawText) {
        if (lastErr) throw lastErr;
        res.status(502).json({ error: 'Google AI returned an empty analysis response.' });
        return;
      }

      const aiData = JSON.parse(rawText);
      const report = {
        overall: aiData.overall,
        headlineEn: aiData.headlineEn,
        headlineKm: aiData.headlineKm,
        summaryKm: aiData.summaryKm,
        analyzedByAi: true,
        components: [
          {
            key: 'os',
            label: 'OS',
            labelKm: 'ប្រព័ន្ធប្រតិបត្តិការ',
            status: aiData.osStatus,
            userValue: userOs,
            minValue: minOs || '—',
            recValue: recOs || '—',
            note: aiData.osNote,
          },
          {
            key: 'cpu',
            label: 'Processor (CPU)',
            labelKm: 'ស៊ីភីយូ (CPU)',
            status: aiData.cpuStatus,
            userValue: userCpu || 'Not entered',
            minValue: minCpu || '—',
            recValue: recCpu || '—',
            note: aiData.cpuNote,
          },
          {
            key: 'ram',
            label: 'Memory (RAM)',
            labelKm: 'រ៉េម (RAM)',
            status: aiData.ramStatus,
            userValue: userRamGb > 0 ? `${userRamGb} GB` : 'Not entered',
            minValue: minRam || '—',
            recValue: recRam || '—',
            note: aiData.ramNote,
          },
          {
            key: 'gpu',
            label: 'Graphics (GPU)',
            labelKm: 'ក្រាហ្វិកកាត (GPU)',
            status: aiData.gpuStatus,
            userValue: userGpu || 'Not entered',
            minValue: minGpu || '—',
            recValue: recGpu || '—',
            note: aiData.gpuNote,
          },
          {
            key: 'storage',
            label: 'Storage',
            labelKm: 'ទំហំផ្ទុក (SSD/HDD)',
            status: aiData.storageStatus,
            userValue: userStorageGb > 0 ? `${userStorageGb} GB Free` : 'Not entered',
            minValue: minStorage || '—',
            recValue: recStorage || '—',
            note: aiData.storageNote,
          },
        ],
      };

      pcCompatibilityCache.set(cacheKey, {
        report,
        expiresAt: now + STEAM_CACHE_TTL_MS,
      });

      res.json({ report });
    } catch (err: any) {
      let msg = err instanceof Error ? err.message : 'Failed to analyze specs with Google AI.';
      try {
        const inner = JSON.parse(msg);
        if (inner?.error?.message) msg = String(inner.error.message);
      } catch {
        // Not JSON string; use msg as-is
      }
      const status = typeof err?.status === 'number' ? err.status : 502;
      res.status(status >= 400 && status < 600 ? status : 502).json({ error: msg });
    }
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
