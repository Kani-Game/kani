const STEAM_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

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

function extractSteamAppId(rawInput) {
  if (!rawInput) return null;
  const trimmed = String(rawInput).trim();
  if (!trimmed) return null;
  if (/^\d{3,10}$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  const webMatch = trimmed.match(
    /(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d{3,10})/i
  );
  if (webMatch?.[1]) return Number(webMatch[1]);
  const protocolMatch = trimmed.match(/steam:\/\/(?:run|rungameid|store)\/(\d{3,10})/i);
  if (protocolMatch?.[1]) return Number(protocolMatch[1]);
  const genericPathMatch = trimmed.match(/\/app\/(\d{3,10})(?:[/?#]|$)/i);
  if (genericPathMatch?.[1]) return Number(genericPathMatch[1]);
  return null;
}

function normalizeSearchTitle(rawName) {
  return String(rawName || '')
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

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[®™©:.,!?'"()\[\]-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function scoreSearchCandidate(query, candidateName, type) {
  const normQuery = normalizeSearchTitle(query).toLowerCase();
  const normCandidate = normalizeSearchTitle(candidateName).toLowerCase();

  let score = 0;
  if (normCandidate === normQuery) score += 120;
  else if (normCandidate.startsWith(normQuery)) score += 65;
  else if (normCandidate.includes(normQuery)) score += 40;

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
    if (normCandidate.includes(term) && !normQuery.includes(term)) {
      score -= 85;
    }
  }

  if (type && String(type).toLowerCase() !== 'app') score -= 40;
  return score;
}

function resolveAccurateSteamGenre(officialGenres, tagNames) {
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
  if (top8.has('survival horror') || (top8.has('survival') && top8.has('horror'))) {
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
  if (top6.has('third-person shooter') || top5.has('shooter') || top5.has("shoot 'em up")) {
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
  if (top6.has('open world survival craft') || (top5.has('open world') && top6.has('survival'))) {
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
  if (top6.has('grand strategy') || top6.has('4x') || top6.has('turn-based strategy')) {
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

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: STEAM_FETCH_HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAppIdBySearch(nameQuery) {
  const cleaned = normalizeSearchTitle(nameQuery);
  if (!cleaned) return null;
  const payload = await fetchJson(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleaned)}&l=english&cc=US`,
    7000
  ).catch(() => null);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  let bestId = null;
  let bestScore = -Infinity;
  for (const item of items) {
    if (!item?.id || !item?.name) continue;
    const score = scoreSearchCandidate(cleaned, item.name, item.type);
    if (score > bestScore) {
      bestScore = score;
      bestId = Number(item.id);
    }
  }
  return bestId;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const items = (Array.isArray(body?.items) ? body.items : []).slice(0, 50);
    if (items.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genres: {} }),
      };
    }

    const resolvedList = [];
    for (let i = 0; i < items.length; i += 6) {
      const slice = items.slice(i, i + 6);
      const batch = await Promise.all(
        slice.map(async (item) => {
          const key = String(item?.id || item?.name || '').trim();
          if (!key) return null;
          let appId =
            (typeof item?.steamAppId === 'number' &&
            Number.isFinite(item.steamAppId) &&
            item.steamAppId > 0
              ? item.steamAppId
              : null) ||
            extractSteamAppId(item?.link) ||
            extractSteamAppId(item?.name);
          if (!appId && item?.name) {
            appId = await resolveAppIdBySearch(item.name);
          }
          return appId ? { key, appId } : null;
        })
      );
      for (const entry of batch) {
        if (entry) resolvedList.push(entry);
      }
    }

    const uniqueIds = Array.from(new Set(resolvedList.map((r) => r.appId)));
    const genreByAppId = new Map();

    if (uniqueIds.length > 0) {
      const [tagsList, browseResp] = await Promise.all([
        fetchJson('https://store.steampowered.com/tagdata/populartags/english', 7000).catch(() => []),
        fetchJson(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
            JSON.stringify({
              ids: uniqueIds.map((appid) => ({ appid })),
              context: { language: 'english', country_code: 'US' },
              data_request: {
                include_assets: false,
                include_basic_info: true,
                include_tag_count: 15,
              },
            })
          )}`,
          9500
        ).catch(() => null),
      ]);

      const tagMap = new Map();
      if (Array.isArray(tagsList)) {
        for (const t of tagsList) {
          if (t && typeof t.tagid === 'number' && typeof t.name === 'string') {
            tagMap.set(t.tagid, t.name.trim());
          }
        }
      }

      const storeItems = Array.isArray(browseResp?.response?.store_items)
        ? browseResp.response.store_items
        : [];
      for (const si of storeItems) {
        const idNum = Number(si?.appid);
        if (!Number.isFinite(idNum) || idNum <= 0) continue;
        const tagIds = Array.isArray(si?.tagids) ? si.tagids : [];
        const tagNames = tagIds.map((id) => tagMap.get(id)).filter(Boolean);
        const genre = resolveAccurateSteamGenre([], tagNames);
        if (genre) {
          genreByAppId.set(idNum, {
            genre,
            matchedName: typeof si?.name === 'string' ? si.name.trim() : undefined,
          });
        }
      }

      const stillMissing = uniqueIds.filter((idNum) => {
        const hit = genreByAppId.get(idNum);
        return !hit || hit.genre === 'Steam Game';
      });
      if (stillMissing.length > 0) {
        await Promise.all(
          stillMissing.slice(0, 12).map(async (idNum) => {
            try {
              const details = await fetchJson(
                `https://store.steampowered.com/api/appdetails?appids=${idNum}&l=english&cc=US`,
                6500
              );
              const data = details?.[String(idNum)]?.data;
              const officialGenres = Array.isArray(data?.genres)
                ? data.genres.map((g) => g?.description?.trim()).filter(Boolean)
                : [];
              if (officialGenres.length > 0) {
                genreByAppId.set(idNum, {
                  genre: resolveAccurateSteamGenre(officialGenres, []),
                  matchedName: typeof data?.name === 'string' ? data.name.trim() : undefined,
                });
              }
            } catch {
              // ignore individual error
            }
          })
        );
      }
    }

    const genres = {};
    for (const entry of resolvedList) {
      const resolved = genreByAppId.get(entry.appId);
      if (resolved && resolved.genre) {
        genres[entry.key] = {
          appId: entry.appId,
          genre: resolved.genre,
          steamUrl: `https://store.steampowered.com/app/${entry.appId}/`,
          matchedName: resolved.matchedName,
        };
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genres }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Failed to resolve Steam genres.' }),
    };
  }
}
