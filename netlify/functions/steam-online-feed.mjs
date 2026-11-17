const STEAM_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

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
            include_tag_count: 10,
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
