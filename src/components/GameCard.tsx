import React, { useState } from 'react';
import { Game } from '../types/game';
import { computeSteamOnlinePricing } from '../utils/pricingUtils';

interface GameCardProps {
  game: Game;
  isSelected: boolean;
  onToggleSelect: (game: Game) => void;
  onOpenPreview: (game: Game) => void;
  onSendToTelegram?: (game: Game) => void;
  steamOnlineDiscountPercent?: number;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected,
  onToggleSelect,
  onOpenPreview,
  onSendToTelegram,
  steamOnlineDiscountPercent = 0,
}) => {
  const [imgError, setImgError] = useState(false);

  const lowerTag = game.tag.toLowerCase();
  const isSteamOnline = lowerTag.includes('steam') && lowerTag.includes('online');
  const isSteam = lowerTag.includes('steam') && !lowerTag.includes('online');
  const isProduct = lowerTag.includes('product');

  // Dedicated Redesigned Game Box Style for Steam Online
  if (isSteamOnline) {
    const pricing = computeSteamOnlinePricing(game, steamOnlineDiscountPercent);

    return (
      <article
        onClick={() => onToggleSelect(game)}
        className={`group relative flex flex-col rounded-xl bg-[#070a10] border transition-all duration-200 hover:-translate-y-1 cursor-pointer select-none mt-2 ${
          isSelected
            ? 'border-[#ff5a00] ring-1 ring-[#ff5a00]/60 shadow-[0_14px_30px_rgba(255,90,0,0.28)]'
            : 'border-slate-800/90 hover:border-[#0099ff]/60 shadow-[0_12px_28px_rgba(2,5,12,0.85)]'
        }`}
      >
        {/* G2A-Style Slanted Dual-Tone Discount Ribbon at Top Center */}
        {pricing.hasDiscount && (
          <div
            aria-label={`Discount ${pricing.discountPercent}%`}
            className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-stretch pointer-events-none drop-shadow-[0_6px_14px_rgba(0,0,0,0.8)] tabular-nums"
          >
            <div className="px-2.5 py-1 bg-gradient-to-b from-[#0ea5e9] to-[#0077e6] -skew-x-12 flex items-center justify-center rounded-l-[3px]">
              <span className="skew-x-12 text-white font-sans font-extrabold text-[11px] sm:text-xs leading-none tracking-tight whitespace-nowrap">
                Up to
              </span>
            </div>
            <div className="px-3 py-1 bg-gradient-to-b from-[#ff6a13] to-[#ea4200] -skew-x-12 -ml-1 flex items-center justify-center rounded-r-[3px] shadow-[-2px_0_6px_rgba(0,0,0,0.3)]">
              <span className="skew-x-12 text-white font-sans font-black text-base sm:text-lg leading-none tracking-tight whitespace-nowrap">
                -{pricing.discountPercent}%
              </span>
            </div>
          </div>
        )}

        {/* Inner Rounded Card Shell */}
        <div className="flex flex-col flex-1 rounded-xl overflow-hidden">
          {/* Artwork Top Container */}
          <div className="relative aspect-[3/3.45] w-full bg-[#06090e] overflow-hidden">
            {imgError || !game.img ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-[radial-gradient(circle_at_50%_35%,_#15293d_0%,_#06090e_80%)]">
                <i className="fa-brands fa-steam text-3xl text-sky-400/90 mb-2"></i>
                <span className="font-g2a-display font-bold text-xs text-slate-200 line-clamp-2 uppercase">
                  {game.name}
                </span>
              </div>
            ) : (
              <img
                src={game.img}
                alt={game.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                loading="lazy"
                className="w-full h-full object-cover object-top group-hover:scale-[1.04] transition-transform duration-300"
              />
            )}

            {/* Smooth Dark Gradient Blend into Lower Info Area */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#070a10] via-[#070a10]/70 to-transparent"
            />
          </div>

          {/* Info, Steam Full Price & Discounted Selling Price */}
          <div className="flex-1 flex flex-col justify-between px-3 pb-3 pt-0.5 gap-2.5 bg-[#070a10]">
            <div className="space-y-1">
              <h4
                title={game.name}
                className="font-g2a-display font-extrabold uppercase text-white group-hover:text-sky-300 text-sm sm:text-[15px] leading-tight line-clamp-2 min-h-[2.35rem] tracking-tight transition-colors"
              >
                {game.name}
              </h4>

              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                <span className="text-sky-400 font-semibold">Steam</span>
                <span aria-hidden="true">·</span>
                <span className="truncate">{game.genre || 'Online Key'}</span>
                <span aria-hidden="true">·</span>
                <span className="text-slate-400 shrink-0">GLOBAL</span>
              </div>
            </div>

            {/* Price Strip: Steam Full Price + Discounted Price (discount % ribbon sits at top of card) */}
            <div className="space-y-2 mt-auto">
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-[#0d121c] border border-slate-800/90 tabular-nums">
                {pricing.steamOriginalPrice !== undefined ? (
                  pricing.hasDiscount ? (
                    <>
                      <div className="flex flex-col leading-tight min-w-0">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Steam Full
                        </span>
                        <span className="text-xs font-mono text-slate-400 line-through">
                          ${pricing.steamOriginalPrice.toFixed(2)}
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-sm sm:text-[15px] text-white shrink-0">
                        ${pricing.finalPrice?.toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] text-slate-400 font-medium">
                        Steam Full
                      </span>
                      <span className="font-mono font-extrabold text-sm sm:text-[15px] text-sky-300 shrink-0">
                        ${pricing.steamOriginalPrice.toFixed(2)}
                      </span>
                    </>
                  )
                ) : (
                  <>
                    <span className="text-[11px] text-slate-400 font-medium">
                      Steam Store
                    </span>
                    <span className="text-xs font-mono font-semibold text-sky-300">
                      $20.00+
                    </span>
                  </>
                )}
              </div>

              {/* Action Buttons Row */}
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onToggleSelect(game)}
                  className={`flex-1 h-8 px-2.5 rounded-lg text-[11px] font-rajdhani font-bold tracking-wide transition flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#ff5a00] text-white shadow-md shadow-orange-950/50'
                      : 'bg-[#121a28] hover:bg-[#0088ff] text-slate-100 hover:text-white border border-slate-700/80 hover:border-[#0088ff]'
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      isSelected ? 'fa-circle-check' : 'fa-plus'
                    } text-[10px]`}
                  ></i>
                  <span>{isSelected ? 'បានជ្រើស' : 'ជ្រើសរើស'}</span>
                </button>

                {onSendToTelegram && (
                  <button
                    type="button"
                    onClick={() => onSendToTelegram(game)}
                    className="w-8 h-8 shrink-0 rounded-lg bg-[#111926] hover:bg-sky-600 text-sky-300 hover:text-white border border-slate-700/80 hover:border-sky-400 flex items-center justify-center transition cursor-pointer"
                    title="ផ្ញើទៅ Telegram @kanigame168"
                    aria-label={`Send ${game.name} to Telegram`}
                  >
                    <i className="fa-brands fa-telegram text-xs"></i>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPreview(game);
                  }}
                  className="w-8 h-8 shrink-0 rounded-lg bg-[#111926] hover:bg-cyan-700 text-cyan-300 hover:text-white border border-slate-700/80 hover:border-cyan-400 flex items-center justify-center transition cursor-pointer"
                  title="PC System Requirements & Price Details"
                  aria-label={`View PC System Requirements for ${game.name}`}
                >
                  <i className="fa-solid fa-microchip text-[11px]"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  }

  // Standard Card Design for Steam Offline, Product, and GameថែមExternal
  const categoryLabel = isSteam
    ? 'Steam Offline'
    : isProduct
    ? 'Product'
    : 'Free Gift';

  const typeIconClass = isSteam
    ? 'fa-brands fa-steam'
    : isProduct
    ? 'fa-solid fa-box-open'
    : 'fa-solid fa-gift';

  const frameGradient = isSelected
    ? 'from-fuchsia-500 via-purple-500 to-cyan-400'
    : isSteam
    ? 'from-purple-500/80 via-fuchsia-500/85 to-purple-700/85'
    : isProduct
    ? 'from-sky-400/80 via-indigo-500/85 to-purple-500/85'
    : 'from-cyan-400/85 via-sky-500/85 to-blue-600/85';

  const topTabColor = isSelected
    ? 'bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-300 shadow-[0_2px_14px_rgba(217,70,239,0.8)]'
    : isSteam
    ? 'bg-fuchsia-500 shadow-[0_2px_12px_rgba(217,70,239,0.65)]'
    : isProduct
    ? 'bg-indigo-400 shadow-[0_2px_12px_rgba(129,140,248,0.65)]'
    : 'bg-cyan-400 shadow-[0_2px_12px_rgba(34,211,238,0.65)]';

  const outerShadow = isSelected
    ? 'shadow-[0_0_24px_rgba(217,70,239,0.55)]'
    : isSteam
    ? 'shadow-[0_10px_24px_rgba(8,5,20,0.85)] group-hover:shadow-[0_12px_28px_rgba(217,70,239,0.38)]'
    : isProduct
    ? 'shadow-[0_10px_24px_rgba(8,5,20,0.85)] group-hover:shadow-[0_12px_28px_rgba(99,102,241,0.38)]'
    : 'shadow-[0_10px_24px_rgba(8,5,20,0.85)] group-hover:shadow-[0_12px_28px_rgba(34,211,238,0.38)]';

  const headerSubtitle = game.genre || categoryLabel;

  return (
    <div
      onClick={() => onToggleSelect(game)}
      className="group relative aspect-[3/4.25] cursor-pointer transition-transform duration-200 hover:-translate-y-1.5 select-none"
    >
      {/* Neon Outer Rim Wrapper */}
      <div
        className={`relative w-full h-full rounded-xl p-[1.5px] bg-gradient-to-b ${frameGradient} ${outerShadow} transition-shadow duration-200`}
      >
        {/* Centered Top Glowing Trapezoid Notch Tab */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-[1px] left-1/2 -translate-x-1/2 w-[36%] h-[5px] z-30 ${topTabColor}`}
          style={{
            clipPath: 'polygon(0% 0%, 100% 0%, 88% 100%, 12% 100%)',
          }}
        />

        {/* Inner Dark Obsidian Card Shell */}
        <div className="relative w-full h-full rounded-[10.5px] bg-gradient-to-b from-[#17112c] via-[#100b21] to-[#0a0716] flex flex-col overflow-hidden">
          {/* Top Header Row (Avatar/Category Icon + Label + Bookmark/Select Toggle) */}
          <div className="relative z-20 flex items-center justify-between gap-2 px-2.5 pt-2.5 pb-1.5 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div
                className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center border ${
                  isSteam
                    ? 'bg-purple-950/90 border-fuchsia-400/50 text-fuchsia-300'
                    : isProduct
                    ? 'bg-indigo-950/90 border-indigo-400/50 text-sky-300'
                    : 'bg-cyan-950/90 border-cyan-400/50 text-cyan-300'
                }`}
              >
                <i className={`${typeIconClass} text-[10px]`}></i>
              </div>
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] font-medium text-gray-200 truncate">
                  {headerSubtitle}
                </p>
              </div>
            </div>

            {/* Top-Right Circular Bookmark Toggle Dedicated to List Selection */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(game);
              }}
              className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white border-fuchsia-300 shadow-[0_0_12px_rgba(217,70,239,0.75)]'
                  : 'bg-[#090616]/90 text-gray-300 hover:text-white border-purple-500/35 hover:border-cyan-400/60'
              }`}
              title={isSelected ? 'លុបចេញពីបញ្ជី' : 'ជ្រើសរើស'}
              aria-label={isSelected ? `Deselect ${game.name}` : `Select ${game.name}`}
            >
              <i
                className={`fa-solid ${
                  isSelected ? 'fa-check' : 'fa-bookmark'
                } text-[10px]`}
              ></i>
            </button>
          </div>

          {/* Inset Rounded Artwork Frame */}
          <div className="relative flex-1 mx-2 mb-2 rounded-lg overflow-hidden bg-[#080513] border border-purple-400/20">
            {imgError || !game.img ? (
              <div className="relative w-full h-full bg-[radial-gradient(circle_at_50%_40%,_#241145_0%,_#0e071e_72%,_#070412_100%)] flex flex-col items-center justify-center px-3 pb-14 text-center">
                <div className="relative flex items-center justify-center mb-2">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 100 88"
                    className="w-20 h-16 opacity-80"
                  >
                    <polygon
                      points="50,6 94,82 6,82"
                      fill="rgba(168,85,247,0.12)"
                      stroke="#a855f7"
                      strokeWidth="2.5"
                    />
                  </svg>
                  <i
                    className={`${typeIconClass} absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[32%] text-lg text-fuchsia-300`}
                  ></i>
                </div>
                <span className="font-orbitron font-bold text-xs text-purple-200 uppercase tracking-wider line-clamp-2">
                  {game.name}
                </span>
              </div>
            ) : (
              <img
                src={game.img}
                alt={game.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                loading="lazy"
                className="w-full h-full object-cover object-top group-hover:scale-[1.04] transition-transform duration-300"
              />
            )}

            {/* Measured Bottom Scrim + Title + Action Bar */}
            <div className="absolute inset-x-0 bottom-0 pt-10 pb-2 px-2 bg-gradient-to-t from-[#080513] via-[#0c071b]/90 to-transparent flex flex-col gap-1.5">
              <h4
                title={game.name}
                className="font-g2a-display font-bold text-white group-hover:text-cyan-300 text-sm sm:text-[15px] leading-tight tracking-wide line-clamp-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)] transition-colors"
              >
                {game.name}
              </h4>

              {/* Clean Compact Action Strip */}
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => onToggleSelect(game)}
                  className={`flex-1 h-7 px-2 rounded-md text-[11px] font-rajdhani font-bold tracking-wide transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-500 text-white shadow-[0_0_12px_rgba(168,85,247,0.65)]'
                      : 'bg-[#1a1236]/95 hover:bg-purple-700/80 text-gray-100 border border-purple-500/35 hover:border-fuchsia-400/70'
                  }`}
                >
                  <i
                    className={`fa-solid ${
                      isSelected ? 'fa-circle-check text-cyan-200' : 'fa-plus'
                    } text-[10px]`}
                  ></i>
                  <span className="truncate">{isSelected ? 'បានជ្រើស' : 'ជ្រើសរើស'}</span>
                </button>

                {onSendToTelegram && (
                  <button
                    type="button"
                    onClick={() => onSendToTelegram(game)}
                    className="w-7 h-7 shrink-0 rounded-md bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white flex items-center justify-center transition-all shadow-sm cursor-pointer"
                    title="ផ្ញើទៅ Telegram @kanigame168"
                    aria-label={`Send ${game.name} to Telegram`}
                  >
                    <i className="fa-brands fa-telegram text-[10px]"></i>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPreview(game);
                  }}
                  className="w-7 h-7 shrink-0 rounded-md bg-[#16102d]/95 hover:bg-cyan-950/90 text-cyan-300 hover:text-white border border-cyan-500/35 hover:border-cyan-400 flex items-center justify-center transition-colors cursor-pointer"
                  title="PC System Requirements (Steam Spec)"
                  aria-label={`View PC System Requirements for ${game.name}`}
                >
                  <i className="fa-solid fa-microchip text-[10px]"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Neon Glow Accent Lip matching mockup card edge */}
          <div
            aria-hidden="true"
            className={`pointer-events-none mx-4 mb-[1px] h-[2px] rounded-full opacity-80 ${
              isSelected
                ? 'bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400'
                : isSteam
                ? 'bg-gradient-to-r from-purple-500/40 via-fuchsia-400 to-purple-500/40'
                : isProduct
                ? 'bg-gradient-to-r from-indigo-500/40 via-sky-400 to-purple-500/40'
                : 'bg-gradient-to-r from-cyan-500/40 via-cyan-300 to-blue-500/40'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
