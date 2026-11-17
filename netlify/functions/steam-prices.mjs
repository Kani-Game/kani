const STEAM_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

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
  const genericPathMatch = trimmed.match(/\/app\/(\d{3,10})(?:[/?#]|$)/i);
  if (genericPathMatch?.[1]) return Number(genericPathMatch[1]);
  return null;
}

function normalizeSearchTitle(rawName) {
  return String(rawName || '')
    .replace(/[®™©]/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*(?:steam\s*offline|repack|fitgirl|dodi|elamigos|offline|free|pc)[^)]*\)/gi, ' ')
    .replace(/\b(?:steam\s*offline|offline\s*mode|repack|fitgirl|dodi|elamigos|portable|cracked|full\s*game|free\s*download)\b/gi, ' ')
    .replace(/[|•–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (items.length === 0) return null;
  const lowerQuery = cleaned.toLowerCase();
  const exact = items.find((i) => normalizeSearchTitle(i?.name).toLowerCase() === lowerQuery);
  const candidate = exact || items.find((i) => i?.type === 'app') || items[0];
  return candidate?.id ? Number(candidate.id) : null;
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
        body: JSON.stringify({ prices: {} }),
      };
    }

    const resolved = (
      await Promise.all(
        items.map(async (item) => {
          const key = String(item?.id || item?.name || '').trim();
          if (!key) return null;
          let appId =
            (typeof item?.steamAppId === 'number' && Number.isFinite(item.steamAppId) && item.steamAppId > 0
              ? item.steamAppId
              : null) ||
            extractSteamAppId(item?.link) ||
            extractSteamAppId(item?.name);
          if (!appId && item?.name) {
            appId = await resolveAppIdBySearch(item.name);
          }
          return appId ? { key, appId } : null;
        })
      )
    ).filter(Boolean);

    const uniqueIds = Array.from(new Set(resolved.map((r) => r.appId)));
    const priceByAppId = new Map();

    if (uniqueIds.length > 0) {
      const browseInput = JSON.stringify({
        ids: uniqueIds.map((appid) => ({ appid })),
        context: { language: 'english', country_code: 'US' },
        data_request: {
          include_assets: false,
          include_basic_info: false,
          include_all_purchase_options: false,
        },
      });
      const browseResp = await fetchJson(
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
          priceByAppId.set(idNum, Math.round(fullCents) / 100);
        }
      }
    }

    const prices = {};
    for (const entry of resolved) {
      const usd = priceByAppId.get(entry.appId);
      if (usd && usd > 0) {
        prices[entry.key] = { appId: entry.appId, steamPriceUsd: usd };
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prices }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err?.message || 'Failed to resolve Steam prices.' }),
    };
  }
}
