export interface SteamSpecItem {
  label: string;
  value: string;
}

export interface SteamRequirementBlock {
  items: SteamSpecItem[];
  notes: string[];
}

export interface SteamSpecResponse {
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

function buildAliasKey(name?: string, link?: string): string {
  return `${(link || '').trim().toLowerCase()}::${normalizeLookupName(name)}`;
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
    // Handle storage quota limits by clearing older Steam cache entries and retrying once
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

export function getCachedSteamSpec(params: {
  name?: string;
  link?: string;
}): SteamSpecResponse | null {
  const now = Date.now();
  const store = readClientCache();
  const directAppId = extractSteamAppId(params.link) || extractSteamAppId(params.name);

  if (directAppId) {
    const entry = store.byAppId[String(directAppId)];
    if (entry && entry.expiresAt > now) {
      return entry.data;
    }
    return null;
  }

  const aliasKey = buildAliasKey(params.name, params.link);
  if (aliasKey !== '::') {
    const alias = store.aliases[aliasKey];
    if (alias && alias.expiresAt > now) {
      const entry = store.byAppId[String(alias.appId)];
      if (entry && entry.expiresAt > now) {
        return entry.data;
      }
    }
  }

  return null;
}

export async function fetchSteamSpec(params: {
  name?: string;
  link?: string;
  forceRefresh?: boolean;
}): Promise<SteamSpecResponse> {
  const name = (params.name || '').trim();
  const link = (params.link || '').trim();
  const forceRefresh = Boolean(params.forceRefresh);

  if (!name && !link) {
    throw new Error('Please provide a Steam Store link or game title.');
  }

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
    const query = new URLSearchParams();
    if (name) query.set('name', name);
    if (link) query.set('link', link);
    if (forceRefresh) query.set('refresh', '1');

    const response = await fetch(`/api/steam-spec?${query.toString()}`);
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errMsg =
        payload?.error || `Steam lookup failed (HTTP ${response.status}).`;
      throw new Error(errMsg);
    }

    const spec = payload as SteamSpecResponse;

    // Persist in 24-hour browser localStorage cache
    const store = readClientCache();
    const expiresAt = Date.now() + CLIENT_CACHE_TTL_MS;
    store.byAppId[String(spec.appId)] = { data: spec, expiresAt };
    const aliasKey = buildAliasKey(name, link);
    if (aliasKey !== '::') {
      store.aliases[aliasKey] = { appId: spec.appId, expiresAt };
    }
    writeClientCache(store);

    return spec;
  })().finally(() => {
    inFlightRequests.delete(requestKey);
  });

  inFlightRequests.set(requestKey, promise);
  return promise;
}
