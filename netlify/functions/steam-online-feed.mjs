const STEAM_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

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

async function fetchJson(url, timeoutMs = 8500) {
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

async function fetchText(url, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': STEAM_FETCH_HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractAppIdsBetweenMarkers(html, startMarker, endMarker) {
  if (!html) return [];
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) return [];
  const endIdx = endMarker ? html.indexOf(endMarker, startIdx + startMarker.length) : -1;
  const slice =
    endIdx > startIdx ? html.slice(startIdx, endIdx) : html.slice(startIdx, startIdx + 35000);
  const ids = [];
  const seen = new Set();
  for (const match of slice.matchAll(/data-ds-appid="(\d{3,10})"/g)) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function extractAllAppIds(html) {
  if (!html) return [];
  const ids = [];
  const seen = new Set();
  for (const match of html.matchAll(/data-ds-appid="(\d{3,10})"/g)) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
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
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': STEAM_FETCH_HEADERS['User-Agent'] },
      redirect: 'follow',
      signal: controller.signal,
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function resolveGenreFromSteamTags(tagIds, tagMap) {
  const names = tagIds.map((id) => tagMap.get(id)).filter(Boolean);
  return resolveAccurateSteamGenre([], names);
}

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const rawSource = (params.source || 'popular_new_online').trim();
  const normalizedSource =
    rawSource === 'new_releases_online' || rawSource === 'top_sellers_online'
      ? rawSource
      : 'popular_new_online';
  const parsedLimit = parseInt(params.limit || '30', 10);
  const clampedLimit = Math.max(1, Math.min(50, isNaN(parsedLimit) ? 30 : parsedLimit));

  try {
    const [
      homeHtml,
      exploreHtml,
      featuredCategories,
      searchPopularPaid1,
      searchPopularPaid2,
      searchTopSellersPaid1,
      searchTopSellersPaid2,
      tagsList,
    ] = await Promise.all([
      fetchText('https://store.steampowered.com/?cc=US&l=english', 9000).catch(() => ''),
      fetchText('https://store.steampowered.com/explore/new/?cc=US&l=english', 9000).catch(() => ''),
      fetchJson('https://store.steampowered.com/api/featuredcategories/?l=english&cc=US', 8000).catch(
        () => null
      ),
      fetchJson(
        'https://store.steampowered.com/search/results/?query&filter=popularnew&category1=998&hidef2p=1&infinite=1&start=0&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJson(
        'https://store.steampowered.com/search/results/?query&filter=popularnew&category1=998&hidef2p=1&infinite=1&start=60&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJson(
        'https://store.steampowered.com/search/results/?query&filter=topsellers&category1=998&hidef2p=1&infinite=1&start=0&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJson(
        'https://store.steampowered.com/search/results/?query&filter=topsellers&category1=998&hidef2p=1&infinite=1&start=60&count=60&cc=US&l=english',
        8500
      ).catch(() => null),
      fetchJson('https://store.steampowered.com/tagdata/populartags/english', 7000).catch(() => []),
    ]);

    const tagMap = new Map();
    if (Array.isArray(tagsList)) {
      for (const t of tagsList) {
        if (t && typeof t.tagid === 'number' && typeof t.name === 'string') {
          tagMap.set(t.tagid, t.name.trim());
        }
      }
    }

    const homePopularNewIds = extractAppIdsBetweenMarkers(
      homeHtml,
      'id="tab_newreleases_content"',
      'id="tab_topsellers_content"'
    );
    const exploreTopMonthIds = extractAppIdsBetweenMarkers(
      exploreHtml,
      'New Top Sellers',
      'Popular New Releases'
    );
    const exploreAllNewIds = extractAppIdsBetweenMarkers(
      exploreHtml,
      'id="tab_allnewreleases_content"',
      'id="tab_under10_content"'
    );
    const searchPopularPaidIds = [
      ...extractAllAppIds(String(searchPopularPaid1?.results_html || '')),
      ...extractAllAppIds(String(searchPopularPaid2?.results_html || '')),
    ];
    const searchTopPaidIds = [
      ...extractAllAppIds(String(searchTopSellersPaid1?.results_html || '')),
      ...extractAllAppIds(String(searchTopSellersPaid2?.results_html || '')),
    ];
    const featuredNewIds = Array.isArray(featuredCategories?.new_releases?.items)
      ? featuredCategories.new_releases.items
          .map((item) => Number(item?.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      : [];

    const orderedAppIds = [];
    const seenIds = new Set();
    const appendIds = (list) => {
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
      appendIds(exploreTopMonthIds);
      appendIds(homePopularNewIds);
      appendIds(searchPopularPaidIds);
      appendIds(searchTopPaidIds);
      appendIds(featuredNewIds);
    }

    const batchIds = orderedAppIds.slice(0, 180);
    if (batchIds.length === 0) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Could not load paid $20+ new releases from store.steampowered.com.' }),
      };
    }

    const chunks = [];
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
            include_tag_count: 15,
            include_all_purchase_options: false,
          },
        });
        return fetchJson(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1?input_json=${encodeURIComponent(
            browseInput
          )}`,
          9500
        ).catch(() => null);
      })
    );

    const storeItems = [];
    for (const resp of browseResponses) {
      if (Array.isArray(resp?.response?.store_items)) {
        storeItems.push(...resp.response.store_items);
      }
    }
    const itemById = new Map();
    for (const si of storeItems) {
      if (si && typeof si.appid === 'number') itemById.set(si.appid, si);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = 365 * 86400; // Last 1 year of paid Steam releases
    const minPriceCents = 2000; // Strictly $20.00 USD and above
    const filteredItems = [];
    for (const appId of batchIds) {
      const item = itemById.get(appId);
      if (!item || item.success !== 1 || item.visible === false || item.type !== 0 || !item.name) {
        continue;
      }
      if (item.release?.is_coming_soon) continue;
      if (item.is_free) continue;
      const rawCents = Number(item.best_purchase_option?.final_price_in_cents);
      if (!Number.isFinite(rawCents) || rawCents < minPriceCents) continue;
      const relSec = Number(item.release?.steam_release_date || 0);
      if (!Number.isFinite(relSec) || relSec <= 0 || nowSec - relSec > maxAgeSec) continue;
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

        const tagIds = Array.isArray(item.tagids) ? item.tagids : [];
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
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120',
      },
      body: JSON.stringify({
        fetchedAt: Date.now(),
        source: normalizedSource,
        count: validGames.length,
        games: validGames,
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: err?.message || 'Failed to fetch paid $20+ new games from Steam Store.',
      }),
    };
  }
}
