import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type {
  SteamSpecItem,
  SteamRequirementBlock,
  SteamSpecData,
  SteamOnlineFeedItem,
  SteamOnlineSyncSource,
} from '../types/game';

export type { SteamSpecItem, SteamRequirementBlock, SteamSpecData, SteamOnlineFeedItem, SteamOnlineSyncSource };
export type SteamSpecResponse = SteamSpecData;

const STEAM_SPEC_CACHE_KEY = 'kani_steam_spec_cache_v1';
const CLIENT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SteamCacheStore {
  byAppId: Record<string, { data: SteamSpecResponse; expiresAt: number }>;
  aliases: Record<string, { appId: number; expiresAt: number }>;
}

const inFlightRequests = new Map<string, Promise<SteamSpecResponse>>();

export function extractSteamAppId(rawInput?: string | null): number | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (/^\d{3,10}$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }

  const webMatch = trimmed.match(
    /(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d{3,10})/i
  );
  if (webMatch?.[1]) {
    return Number(webMatch[1]);
  }

  const protocolMatch = trimmed.match(/steam:\/\/(?:run|rungameid|store)\/(\d{3,10})/i);
  if (protocolMatch?.[1]) {
    return Number(protocolMatch[1]);
  }

  const genericPathMatch = trimmed.match(/\/app\/(\d{3,10})(?:[/?#]|$)/i);
  if (genericPathMatch?.[1]) {
    return Number(genericPathMatch[1]);
  }

  return null;
}

function normalizeLookupName(name?: string): string {
  return (name || '')
    .replace(/[®™©]/g, ' ')
    .replace(/\b(?:steam\s*offline|offline\s*mode|repack)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function toFirestoreTitleDocId(name?: string): string | null {
  const norm = normalizeLookupName(name)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96);
  return norm ? `title_${norm}` : null;
}

function buildAliasKey(name?: string, link?: string): string {
  return `${(link || '').trim().toLowerCase()}::${normalizeLookupName(name)}`;
}

function isValidSteamSpec(obj: unknown): obj is SteamSpecResponse {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Partial<SteamSpecResponse>;
  return (
    typeof candidate.appId === 'number' &&
    Number.isFinite(candidate.appId) &&
    candidate.appId > 0 &&
    typeof candidate.matchedName === 'string' &&
    Boolean(candidate.minimum) &&
    Boolean(candidate.recommended)
  );
}

function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function readClientCache(): SteamCacheStore {
  try {
    const raw = localStorage.getItem(STEAM_SPEC_CACHE_KEY);
    if (!raw) return { byAppId: {}, aliases: {} };
    const parsed = JSON.parse(raw) as Partial<SteamCacheStore>;
    return {
      byAppId: parsed.byAppId && typeof parsed.byAppId === 'object' ? parsed.byAppId : {},
      aliases: parsed.aliases && typeof parsed.aliases === 'object' ? parsed.aliases : {},
    };
  } catch {
    return { byAppId: {}, aliases: {} };
  }
}

function writeClientCache(store: SteamCacheStore): void {
  const now = Date.now();
  const prunedByAppId: SteamCacheStore['byAppId'] = {};
  const prunedAliases: SteamCacheStore['aliases'] = {};

  for (const [k, v] of Object.entries(store.byAppId)) {
    if (v && v.expiresAt > now) prunedByAppId[k] = v;
  }
  for (const [k, v] of Object.entries(store.aliases)) {
    if (v && v.expiresAt > now) prunedAliases[k] = v;
  }

  try {
    localStorage.setItem(
      STEAM_SPEC_CACHE_KEY,
      JSON.stringify({ byAppId: prunedByAppId, aliases: prunedAliases })
    );
  } catch {
    try {
      const entries = Object.entries(prunedByAppId).slice(-25);
      localStorage.setItem(
        STEAM_SPEC_CACHE_KEY,
        JSON.stringify({ byAppId: Object.fromEntries(entries), aliases: {} })
      );
    } catch {
      // Non-fatal
    }
  }
}

function saveSpecToClientCache(
  spec: SteamSpecResponse,
  name?: string,
  link?: string
): void {
  const store = readClientCache();
  const expiresAt = Date.now() + CLIENT_CACHE_TTL_MS;
  store.byAppId[String(spec.appId)] = { data: spec, expiresAt };
  const aliasKey = buildAliasKey(name, link);
  if (aliasKey !== '::') {
    store.aliases[aliasKey] = { appId: spec.appId, expiresAt };
  }
  writeClientCache(store);
}

export async function saveSteamSpecToCloud(
  spec: SteamSpecResponse,
  gameName?: string
): Promise<void> {
  if (!isValidSteamSpec(spec)) return;
  const cleanSpec = sanitizeForFirestore(spec);
  try {
    await setDoc(doc(db, 'steamSpecs', `app_${spec.appId}`), cleanSpec, { merge: true });
    const titleDocId = toFirestoreTitleDocId(gameName);
    if (titleDocId) {
      await setDoc(doc(db, 'steamSpecs', titleDocId), cleanSpec, { merge: true });
    }
  } catch (err) {
    console.warn('Firestore saveSteamSpecToCloud warning:', err);
  }
}

export async function getSteamSpecFromCloud(params: {
  name?: string;
  link?: string;
}): Promise<SteamSpecResponse | null> {
  try {
    const directAppId = extractSteamAppId(params.link) || extractSteamAppId(params.name);
    if (directAppId) {
      const snap = await getDoc(doc(db, 'steamSpecs', `app_${directAppId}`));
      if (snap.exists()) {
        const data = snap.data();
        if (isValidSteamSpec(data)) return data;
      }
    }

    const titleDocId = toFirestoreTitleDocId(params.name);
    if (titleDocId) {
      const snap = await getDoc(doc(db, 'steamSpecs', titleDocId));
      if (snap.exists()) {
        const data = snap.data();
        if (isValidSteamSpec(data)) return data;
      }
    }
  } catch (err) {
    console.warn('Firestore getSteamSpecFromCloud warning:', err);
  }
  return null;
}

export function getCachedSteamSpec(params: {
  name?: string;
  link?: string;
}): SteamSpecResponse | null {
  const now = Date.now();
  const store = readClientCache();
  const directAppId = extractSteamAppId(params.link) || extractSteamAppId(params.name);

  if (directAppId) {
    const entry = store.byAppId[String(directAppId)];
    if (entry && entry.expiresAt > now && isValidSteamSpec(entry.data)) {
      return entry.data;
    }
    return null;
  }

  const aliasKey = buildAliasKey(params.name, params.link);
  if (aliasKey !== '::') {
    const alias = store.aliases[aliasKey];
    if (alias && alias.expiresAt > now) {
      const entry = store.byAppId[String(alias.appId)];
      if (entry && entry.expiresAt > now && isValidSteamSpec(entry.data)) {
        return entry.data;
      }
    }
  }

  return null;
}

async function requestSteamEndpoint(
  endpointPath: string,
  queryStr: string
): Promise<{ spec?: SteamSpecResponse; nonJson?: boolean; error?: string }> {
  const response = await fetch(`${endpointPath}?${queryStr}`);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();

  let payload: any = null;
  const rawText = await response.text();
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = null;
    }
  }

  const looksLikeHtml =
    contentType.includes('text/html') ||
    rawText.trimStart().startsWith('<!doctype') ||
    rawText.trimStart().startsWith('<html');

  if (!response.ok) {
    return {
      error:
        payload?.error ||
        `Steam lookup failed (HTTP ${response.status}).`,
    };
  }

  if (looksLikeHtml || payload === null) {
    return { nonJson: true };
  }

  if (!isValidSteamSpec(payload)) {
    return {
      error:
        payload?.error ||
        'Steam returned an incomplete response for this title.',
    };
  }

  return { spec: payload };
}

export async function fetchSteamSpec(params: {
  name?: string;
  link?: string;
  forceRefresh?: boolean;
  existingSpec?: SteamSpecData;
}): Promise<SteamSpecResponse> {
  const name = (params.name || '').trim();
  const link = (params.link || '').trim();
  const forceRefresh = Boolean(params.forceRefresh);

  if (!name && !link) {
    throw new Error('Please provide a Steam Store link or game title.');
  }

  // 1. Saved directly inside Website's Game record
  if (!forceRefresh && isValidSteamSpec(params.existingSpec)) {
    saveSpecToClientCache(params.existingSpec, name, link);
    return params.existingSpec;
  }

  // 2. LocalStorage 24h cache
  if (!forceRefresh) {
    const cached = getCachedSteamSpec({ name, link });
    if (cached) {
      return cached;
    }
  }

  const requestKey = `${link.toLowerCase()}::${name.toLowerCase()}::${forceRefresh ? 'refresh' : 'std'}`;
  const existing = inFlightRequests.get(requestKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    // 3. Shared Website Firestore Database (/steamSpecs)
    if (!forceRefresh) {
      const cloudSpec = await getSteamSpecFromCloud({ name, link });
      if (cloudSpec) {
        saveSpecToClientCache(cloudSpec, name, link);
        return cloudSpec;
      }
    }

    // 4. Live backend lookup (/api/steam-spec -> fallback /.netlify/functions/steam-spec)
    const query = new URLSearchParams();
    if (name) query.set('name', name);
    if (link) query.set('link', link);
    if (forceRefresh) query.set('refresh', '1');
    const queryStr = query.toString();

    let result = await requestSteamEndpoint('/api/steam-spec', queryStr);
    if (result.nonJson) {
      result = await requestSteamEndpoint('/.netlify/functions/steam-spec', queryStr);
    }

    if (result.nonJson) {
      throw new Error(
        'Steam Store proxy is unreachable on this static host and specs are not saved in the website database yet.'
      );
    }

    if (!result.spec) {
      throw new Error(result.error || 'Could not retrieve Steam PC system requirements.');
    }

    const spec = result.spec;

    // 5. Persist to local cache AND Website Firestore database (/steamSpecs)
    saveSpecToClientCache(spec, name, link);
    void saveSteamSpecToCloud(spec, name);

    return spec;
  })().finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, promise);
  return promise;
}

export interface SteamOnlineFeedResponse {
  fetchedAt: number;
  source: SteamOnlineSyncSource;
  count: number;
  games: SteamOnlineFeedItem[];
}

export async function fetchSteamOnlineFeed(params?: {
  source?: SteamOnlineSyncSource;
  limit?: number;
  refresh?: boolean;
}): Promise<SteamOnlineFeedResponse> {
  const source: SteamOnlineSyncSource = params?.source || 'popular_new_online';
  const limit = Math.max(1, Math.min(50, params?.limit || 30));
  const query = new URLSearchParams();
  query.set('source', source);
  query.set('limit', String(limit));
  if (params?.refresh) {
    query.set('refresh', '1');
  }
  const queryStr = query.toString();

  const tryEndpoint = async (endpoint: string) => {
    const res = await fetch(`${endpoint}?${queryStr}`);
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    let payload: any = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }
    const looksLikeHtml =
      contentType.includes('text/html') ||
      rawText.trimStart().startsWith('<!doctype') ||
      rawText.trimStart().startsWith('<html');

    if (!res.ok) {
      return { error: payload?.error || `Steam feed request failed (HTTP ${res.status}).` };
    }
    if (looksLikeHtml || payload === null) {
      return { nonJson: true };
    }
    if (!Array.isArray(payload.games)) {
      return { error: payload?.error || 'Steam feed returned invalid format.' };
    }
    return { data: payload as SteamOnlineFeedResponse };
  };

  let result = await tryEndpoint('/api/steam-online-games');
  if (result.nonJson) {
    result = await tryEndpoint('/.netlify/functions/steam-online-feed');
  }
  if (result.nonJson) {
    throw new Error('Steam Online feed endpoint is unreachable on this host.');
  }
  if (!result.data) {
    throw new Error(result.error || 'Could not load new games from Steam.');
  }
  return result.data;
}

export interface SteamPriceLookupItem {
  id: string;
  name: string;
  link?: string;
  steamAppId?: number;
}

export interface SteamPriceLookupResult {
  appId: number;
  steamPriceUsd: number;
}

export async function fetchSteamPricesBatch(
  items: SteamPriceLookupItem[]
): Promise<Record<string, SteamPriceLookupResult>> {
  if (!items.length) return {};

  const tryPost = async (endpoint: string) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.slice(0, 50) }),
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    let payload: any = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = null;
      }
    }
    const looksLikeHtml =
      contentType.includes('text/html') ||
      rawText.trimStart().startsWith('<!doctype') ||
      rawText.trimStart().startsWith('<html');

    if (looksLikeHtml || payload === null) return { nonJson: true };
    if (!res.ok || !payload?.prices || typeof payload.prices !== 'object') {
      return { error: payload?.error || `HTTP ${res.status}` };
    }
    return { prices: payload.prices as Record<string, SteamPriceLookupResult> };
  };

  let res = await tryPost('/api/steam-prices');
  if (res.nonJson) {
    res = await tryPost('/.netlify/functions/steam-prices');
  }
  return res.prices || {};
}

