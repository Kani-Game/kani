import { Game } from '../types/game';

export interface SteamOnlinePricing {
  steamOriginalPrice?: number;
  discountPercent: number;
  finalPrice?: number;
  hasDiscount: boolean;
}

export function clampDiscountPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(95, Math.round(value)));
}

export function computeSteamOnlinePricing(
  game: Game,
  globalDiscountPercent?: number
): SteamOnlinePricing {
  const rawSteamPrice =
    typeof game.steamPriceUsd === 'number' && Number.isFinite(game.steamPriceUsd) && game.steamPriceUsd > 0
      ? game.steamPriceUsd
      : typeof game.price === 'number' && Number.isFinite(game.price) && game.price > 0
      ? game.price
      : undefined;

  const perGameDiscount =
    typeof game.discountPercent === 'number' && Number.isFinite(game.discountPercent)
      ? clampDiscountPercent(game.discountPercent)
      : undefined;

  const effectiveDiscount =
    perGameDiscount !== undefined ? perGameDiscount : clampDiscountPercent(globalDiscountPercent ?? 0);

  if (rawSteamPrice === undefined) {
    return {
      steamOriginalPrice: undefined,
      discountPercent: effectiveDiscount,
      finalPrice: undefined,
      hasDiscount: false,
    };
  }

  // If game has an explicit discounted custom `price` lower than `steamPriceUsd` AND no explicit discount% was configured:
  if (
    effectiveDiscount === 0 &&
    typeof game.steamPriceUsd === 'number' &&
    game.steamPriceUsd > 0 &&
    typeof game.price === 'number' &&
    game.price > 0 &&
    game.price < game.steamPriceUsd
  ) {
    const derivedPct = Math.max(
      1,
      Math.min(95, Math.round(((game.steamPriceUsd - game.price) / game.steamPriceUsd) * 100))
    );
    return {
      steamOriginalPrice: Math.round(game.steamPriceUsd * 100) / 100,
      discountPercent: derivedPct,
      finalPrice: Math.round(game.price * 100) / 100,
      hasDiscount: true,
    };
  }

  const roundedSteam = Math.round(rawSteamPrice * 100) / 100;
  if (effectiveDiscount > 0) {
    const discounted = Math.round(roundedSteam * (1 - effectiveDiscount / 100) * 100) / 100;
    return {
      steamOriginalPrice: roundedSteam,
      discountPercent: effectiveDiscount,
      finalPrice: discounted,
      hasDiscount: true,
    };
  }

  return {
    steamOriginalPrice: roundedSteam,
    discountPercent: 0,
    finalPrice: roundedSteam,
    hasDiscount: false,
  };
}

export function getSteamAppIdFromGame(game: Game): number | null {
  if (typeof game.steamAppId === 'number' && Number.isFinite(game.steamAppId) && game.steamAppId > 0) {
    return game.steamAppId;
  }
  if (game.id.startsWith('steam_online_')) {
    const n = Number(game.id.replace('steam_online_', ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (game.link) {
    const match = game.link.match(/\/app\/(\d+)/i);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

export function getSteamHeroBackdropCandidates(game: Game): string[] {
  const appId = getSteamAppIdFromGame(game);
  const candidates: string[] = [];
  if (appId) {
    candidates.push(
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
      `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
    );
  }
  if (game.img) candidates.push(game.img);
  return candidates;
}
