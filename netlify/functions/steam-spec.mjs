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

function decodeHtmlEntities(text) {
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

function normalizeSpecLabel(rawLabel) {
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

function parseRequirementsHtml(html) {
  if (!html || typeof html !== 'string') return { items: [], notes: [] };
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

  const items = [];
  const notes = [];
  for (const line of rawLines) {
    if (/^(?:minimum|recommended)\s*:?$/i.test(line)) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 32) {
      const label = normalizeSpecLabel(line.slice(0, colonIdx).trim());
      const rawVal = line.slice(colonIdx + 1).trim();
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

function buildAssetUrl(assetUrlFormat, filename) {
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

async function checkUrlReturns200(url) {
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
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const nameQuery = (params.name || '').trim();
  const linkQuery = (params.link || '').trim();

  if (!nameQuery && !linkQuery) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Please provide a Steam link or game name.' }),
    };
  }

  try {
    let appId = extractSteamAppId(linkQuery) || extractSteamAppId(nameQuery);
    if (!appId && nameQuery) {
      const cleaned = normalizeSearchTitle(nameQuery);
      if (cleaned) {
        const searchPayload = await fetchJson(
          `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(cleaned)}&l=english&cc=US`
        );
        const items = searchPayload?.items || [];
        let bestScore = -Infinity;
        for (const item of items) {
          if (!item.id || !item.name) continue;
          const s = scoreSearchCandidate(cleaned, item.name, item.type);
          if (s > bestScore) {
            bestScore = s;
            appId = Number(item.id);
          }
        }
      }
    }

    if (!appId) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not find a matching Steam game for that link or title.' }),
      };
    }

    const [detailsJson, tagsList] = await Promise.all([
      fetchJson(
        `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=US`,
        9000
      ),
      fetchJson('https://store.steampowered.com/tagdata/populartags/english', 6500).catch(() => []),
    ]);
    const tagMap = new Map();
    if (Array.isArray(tagsList)) {
      for (const t of tagsList) {
        if (t && typeof t.tagid === 'number' && typeof t.name === 'string') {
          tagMap.set(t.tagid, t.name.trim());
        }
      }
    }

    const entry = detailsJson?.[String(appId)];
    if (!entry?.success || !entry?.data) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Steam appdetails unavailable for App ID ${appId}.` }),
      };
    }

    const appData = entry.data;
    const candidates = [];
    let tagIds = [];
    try {
      const inputJson = JSON.stringify({
        ids: [{ appid: appId }],
        context: { language: 'english', country_code: 'US' },
        data_request: { include_assets: true, include_tag_count: 15 },
      });
      const browseData = await fetchJson(
        `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(inputJson)}`,
        6000
      );
      const storeItem = browseData?.response?.store_items?.[0];
      if (Array.isArray(storeItem?.tagids)) {
        tagIds = storeItem.tagids.filter((id) => typeof id === 'number');
      }
      const assets = storeItem?.assets;
      if (assets) {
        const format = assets.asset_url_format || `steam/apps/${appId}/\${FILENAME}`;
        for (const key of ['library_capsule_2x', 'library_capsule', 'main_capsule', 'header_2x', 'header']) {
          const built = buildAssetUrl(format, assets[key]);
          if (built) candidates.push(built);
        }
      }
    } catch {
      // fallback below
    }

    if (typeof appData.header_image === 'string' && appData.header_image) {
      candidates.push(appData.header_image);
    }
    candidates.push(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900_2x.jpg`,
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`
    );

    let coverImage = typeof appData.header_image === 'string' ? appData.header_image : '';
    for (const url of Array.from(new Set(candidates.filter(Boolean)))) {
      if (await checkUrlReturns200(url)) {
        coverImage = url;
        break;
      }
    }

    const officialGenres = Array.isArray(appData.genres)
      ? appData.genres.map((g) => g?.description?.trim()).filter(Boolean)
      : [];
    const tagNames = tagIds.map((id) => tagMap.get(id)).filter(Boolean);
    const primaryGenre = resolveAccurateSteamGenre(officialGenres, tagNames);
    const genres = Array.from(
      new Set([primaryGenre, ...officialGenres].filter((g) => g && g.trim().length > 0))
    );

    const payload = {
      appId,
      matchedName: appData.name || nameQuery || `Steam App ${appId}`,
      steamUrl: `https://store.steampowered.com/app/${appId}/`,
      coverImage,
      genres,
      primaryGenre,
      developers: Array.isArray(appData.developers) ? appData.developers : [],
      publishers: Array.isArray(appData.publishers) ? appData.publishers : [],
      releaseDate: appData.release_date?.date || '',
      minimum: parseRequirementsHtml(appData.pc_requirements?.minimum),
      recommended: parseRequirementsHtml(appData.pc_requirements?.recommended),
      fetchedAt: Date.now(),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Failed to fetch Steam Store information.' }),
    };
  }
}
