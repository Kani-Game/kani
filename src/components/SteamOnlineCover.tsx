import React, { useEffect, useMemo, useState } from 'react';
import { Game, SiteSettings, SteamOnlineCoverSlide } from '../types/game';
import { DEFAULT_COVER_IMAGE, extractYouTubeVideoId } from './CoverMediaModal';
import { computeSteamOnlinePricing, getSteamHeroBackdropCandidates } from '../utils/pricingUtils';

export type PromoCoverTarget = 'steam-online' | 'product' | 'external';

interface SteamOnlineCoverProps {
  variant?: PromoCoverTarget;
  settings: SiteSettings;
  games: Game[];
  globalDiscountPercent?: number;
  canEditCover?: boolean;
  onEditCover?: () => void;
  onOpenTelegram: () => void;
  onBrowseCatalog?: () => void;
}

export const SteamOnlineCover: React.FC<SteamOnlineCoverProps> = ({
  variant = 'steam-online',
  settings,
  games,
  globalDiscountPercent = 0,
  canEditCover = false,
  onEditCover,
  onOpenTelegram,
  onBrowseCatalog,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [imgErrorMap, setImgErrorMap] = useState<Record<string, boolean>>({});

  // Calculate highest live discount across Steam Online catalog for auto-fallback
  const topCatalogDiscount = useMemo(() => {
    let maxPct = globalDiscountPercent || 0;
    for (const g of games) {
      const pct = computeSteamOnlinePricing(g, globalDiscountPercent).discountPercent;
      if (pct > maxPct) maxPct = pct;
    }
    return maxPct;
  }, [games, globalDiscountPercent]);

  const topGameBackdrop = useMemo(() => {
    const firstWithImg = games.find((g) => Boolean(g.img));
    if (!firstWithImg) return DEFAULT_COVER_IMAGE;
    const candidates = getSteamHeroBackdropCandidates(firstWithImg);
    return candidates[0] || firstWithImg.img || DEFAULT_COVER_IMAGE;
  }, [games]);

  const slides: SteamOnlineCoverSlide[] = useMemo(() => {
    const rawSlides =
      variant === 'product'
        ? settings.productCoverSlides
        : variant === 'external'
        ? settings.externalCoverSlides
        : settings.steamOnlineCoverSlides;
    const custom = Array.isArray(rawSlides)
      ? rawSlides.filter(
          (s) => s && (Boolean(s.mediaUrl?.trim()) || Boolean(s.title?.trim()))
        )
      : [];
    if (custom.length > 0) return custom;

    if (variant === 'product') {
      const productImg = games.find((g) => Boolean(g.img))?.img || DEFAULT_COVER_IMAGE;
      return [
        {
          id: 'default_product_cover',
          mediaType: 'photo',
          mediaUrl: productImg,
          title: 'GAMING PRODUCTS & GEAR',
          subtitle:
            'ទំនិញគ្រឿងបន្លាស់ ឧបករណ៍ហ្គេម External HDD Controller Keyboard និង Accessories គុណភាពខ្ពស់',
          ctaLabel: 'ទាក់ទង Admin',
          discountPrefix: 'Shop',
          discountHighlight: 'HOT GEAR',
          showDiscount: true,
        },
      ];
    }

    if (variant === 'external') {
      return [
        {
          id: 'default_external_cover',
          mediaType: 'photo',
          mediaUrl: topGameBackdrop,
          title: 'GAME ថែមពេលទិញ EXTERNAL',
          subtitle:
            'ជ្រើសរើសហ្គេម PC ពេញនិយមជាច្រើនដោយឥតគិតថ្លៃ នៅពេលទិញ External Hard Disk ពីហាងយើងខ្ញុំ',
          ctaLabel: 'ទាក់ទង Admin',
          discountPrefix: 'External',
          discountHighlight: 'FREE GAMES',
          showDiscount: true,
        },
      ];
    }

    return [
      {
        id: 'default_steam_online_cover',
        mediaType: 'photo',
        mediaUrl: topGameBackdrop,
        title: 'STEAM ONLINE STORE',
        subtitle:
          'ហ្គេម Steam Online តម្លៃពេញផ្លូវការពី Steam Store និងមានបញ្ចុះតម្លៃពិសេសប្រចាំថ្ងៃ',
        ctaLabel: 'ទាក់ទង Admin',
        discountPrefix: 'Up to',
        discountHighlight: topCatalogDiscount > 0 ? `-${topCatalogDiscount}%` : '-50%',
        showDiscount: true,
      },
    ];
  }, [
    variant,
    settings.steamOnlineCoverSlides,
    settings.productCoverSlides,
    settings.externalCoverSlides,
    games,
    topGameBackdrop,
    topCatalogDiscount,
  ]);

  const safeIndex = slides.length > 0 ? activeIndex % slides.length : 0;
  const activeSlide = slides[safeIndex];

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [slides.length, isPaused]);

  const handlePrev = () => {
    if (slides.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    if (slides.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const mediaUrl = activeSlide.mediaUrl?.trim() || DEFAULT_COVER_IMAGE;
  const isVideo = activeSlide.mediaType === 'video' && Boolean(activeSlide.mediaUrl?.trim());
  const youtubeId = isVideo ? extractYouTubeVideoId(mediaUrl) : null;
  const hasImgError = Boolean(imgErrorMap[activeSlide.id]);

  const showDiscount = activeSlide.showDiscount !== false;
  const discountPrefix = (activeSlide.discountPrefix ?? 'Up to').trim();
  const discountHighlight = (
    activeSlide.discountHighlight?.trim() ||
    (topCatalogDiscount > 0 ? `-${topCatalogDiscount}%` : '-50%')
  ).trim();

  const slideControls =
    slides.length > 1 ? (
      <>
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous cover slide"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/65 hover:bg-[#0077e6] text-white border border-white/15 flex items-center justify-center transition cursor-pointer backdrop-blur-sm"
        >
          <i className="fa-solid fa-chevron-left text-xs"></i>
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next cover slide"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/65 hover:bg-[#0077e6] text-white border border-white/15 flex items-center justify-center transition cursor-pointer backdrop-blur-sm"
        >
          <i className="fa-solid fa-chevron-right text-xs"></i>
        </button>
      </>
    ) : null;

  const renderMediaLayer = (extraClass = 'opacity-75') =>
    isVideo ? (
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        {youtubeId ? (
          <iframe
            key={`${activeSlide.id}-yt`}
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${
              isMuted ? 1 : 0
            }&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
            title={activeSlide.title || 'Cover Video'}
            className={`absolute inset-0 w-full h-full scale-[1.28] object-cover ${extraClass}`}
            allow="autoplay; encrypted-media"
          />
        ) : (
          <video
            key={`${activeSlide.id}-${mediaUrl}`}
            src={mediaUrl}
            autoPlay
            loop
            muted={isMuted}
            playsInline
            className={`w-full h-full object-cover ${extraClass}`}
          />
        )}
      </div>
    ) : !hasImgError && mediaUrl ? (
      <img
        key={`${activeSlide.id}-${mediaUrl}`}
        src={mediaUrl}
        alt={activeSlide.title || 'Cover'}
        referrerPolicy="no-referrer"
        onError={() =>
          setImgErrorMap((prev) => ({
            ...prev,
            [activeSlide.id]: true,
          }))
        }
        className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500 ${extraClass}`}
      />
    ) : (
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#122742_0%,_#070a10_65%)]"
      />
    );

  // STYLE 2: PRODUCT — Hardware Showroom Split-Stage (Editorial Info Left + Unobstructed Photo/Video Stage Right)
  if (variant === 'product') {
    return (
      <section
        aria-label="Product Showcase Cover"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative mb-8 rounded-2xl overflow-hidden bg-[#0a0f1a] border border-sky-500/25 shadow-[0_24px_56px_rgba(2,8,20,0.85)] select-none"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[300px] lg:min-h-[360px]">
          {/* Left Editorial Stage */}
          <div className="lg:col-span-5 relative flex flex-col justify-between p-6 sm:p-8 lg:p-9 bg-gradient-to-br from-[#0e1627] via-[#0a101d] to-[#080c15] border-b lg:border-b-0 lg:border-r border-slate-800/80">
            <div className="space-y-3.5">
              {/* Clean unboxed typographic metadata kicker */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-rajdhani font-bold tracking-wider uppercase text-sky-400">
                <span>Hardware &amp; Gear</span>
                {showDiscount && (discountPrefix || discountHighlight) && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-amber-300">
                      {[discountPrefix, discountHighlight].filter(Boolean).join(' ')}
                    </span>
                  </>
                )}
              </div>

              {activeSlide.title?.trim() && (
                <h2
                  className="font-orbitron font-black text-white leading-[1.12] tracking-tight text-balance"
                  style={{ fontSize: 'clamp(1.5rem, 2.7vw, 2.35rem)' }}
                >
                  {activeSlide.title}
                </h2>
              )}

              {activeSlide.subtitle?.trim() && (
                <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed max-w-md">
                  {activeSlide.subtitle}
                </p>
              )}
            </div>

            <div className="pt-6 flex flex-wrap items-center gap-3">
              {activeSlide.ctaLabel?.trim() && (
                <button
                  type="button"
                  onClick={onOpenTelegram}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-orbitron font-bold text-xs shadow-[0_8px_20px_rgba(14,165,233,0.3)] transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <i className="fa-brands fa-telegram text-sm"></i>
                  <span>{activeSlide.ctaLabel}</span>
                </button>
              )}

              {onBrowseCatalog && (
                <button
                  type="button"
                  onClick={onBrowseCatalog}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-sky-400/50 font-rajdhani font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap shrink-0"
                >
                  <i className="fa-solid fa-box-open text-sky-400"></i>
                  <span>មើលទំនិញទាំងអស់ ({games.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Unobstructed Photo / Video Media Stage */}
          <div className="lg:col-span-7 relative min-h-[220px] sm:min-h-[260px] lg:min-h-full bg-[#060911] overflow-hidden">
            {renderMediaLayer('opacity-95')}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a101d]/65 via-transparent to-transparent hidden lg:block"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060911]/60 via-transparent to-[#060911]/30"
            />

            {/* Top-right Controls */}
            <div className="absolute top-3.5 right-4 z-30 flex items-center gap-2">
              {isVideo && !youtubeId && (
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-rajdhani font-bold text-slate-200 bg-[#0b1220]/85 hover:bg-slate-800 border border-slate-700/80 backdrop-blur-md transition cursor-pointer"
                  title={isMuted ? 'Unmute Cover Video' : 'Mute Cover Video'}
                >
                  <i
                    className={`fa-solid ${
                      isMuted ? 'fa-volume-xmark text-slate-400' : 'fa-volume-high text-sky-300'
                    }`}
                  ></i>
                  <span>{isMuted ? 'Muted' : 'Sound On'}</span>
                </button>
              )}

              {canEditCover && onEditCover && (
                <button
                  type="button"
                  onClick={onEditCover}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-orbitron font-bold text-white bg-[#0b1220]/90 hover:bg-sky-600 border border-sky-400/50 shadow-lg backdrop-blur-md transition cursor-pointer whitespace-nowrap"
                  title="Edit Product Cover Photo, Video & Text"
                >
                  <i className="fa-solid fa-photo-film text-sky-300"></i>
                  <span>Edit Product Cover</span>
                </button>
              )}
            </div>

            {slideControls}

            {slides.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm">
                {slides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`Slide ${idx + 1}: ${s.title || 'Slide'}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === safeIndex ? 'w-6 bg-sky-400' : 'w-2 bg-slate-500 hover:bg-slate-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // STYLE 3: GAME ថែម EXTERNAL — Widescreen Cinema Viewport + Bottom Docked Emerald Action Bar
  if (variant === 'external') {
    return (
      <section
        aria-label="External Free Games Showcase Cover"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        className="relative mb-8 rounded-2xl overflow-hidden bg-[#060d12] border border-emerald-500/30 shadow-[0_24px_60px_rgba(3,16,20,0.88)] select-none"
      >
        {/* Top Wide Unobstructed Photo / Video Viewport */}
        <div className="relative h-[220px] sm:h-[260px] lg:h-[300px] overflow-hidden bg-[#050b0f]">
          {renderMediaLayer('opacity-90')}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060f16] via-[#060f16]/15 to-[#060f16]/45"
          />

          {/* Top-Right Admin & Audio Controls */}
          <div className="absolute top-3.5 right-4 z-30 flex items-center gap-2">
            {isVideo && !youtubeId && (
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-rajdhani font-bold text-slate-200 bg-[#07131a]/85 hover:bg-slate-800 border border-emerald-500/35 backdrop-blur-md transition cursor-pointer"
                title={isMuted ? 'Unmute Cover Video' : 'Mute Cover Video'}
              >
                <i
                  className={`fa-solid ${
                    isMuted ? 'fa-volume-xmark text-slate-400' : 'fa-volume-high text-emerald-300'
                  }`}
                ></i>
                <span>{isMuted ? 'Muted' : 'Sound On'}</span>
              </button>
            )}

            {canEditCover && onEditCover && (
              <button
                type="button"
                onClick={onEditCover}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-orbitron font-bold text-white bg-[#07131a]/90 hover:bg-emerald-600 border border-emerald-400/50 shadow-lg backdrop-blur-md transition cursor-pointer whitespace-nowrap"
                title="Edit External Cover Photo, Video & Text"
              >
                <i className="fa-solid fa-photo-film text-emerald-300"></i>
                <span>Edit External Cover</span>
              </button>
            )}
          </div>

          {slideControls}
        </div>

        {/* Bottom Docked Architectural Content Bar */}
        <div className="relative z-10 px-6 sm:px-8 lg:px-10 py-5 bg-[#060f16] border-t border-emerald-500/25 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-rajdhani font-bold tracking-wider uppercase text-emerald-400">
              <span>External HDD Bonus</span>
              {showDiscount && (discountPrefix || discountHighlight) && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-cyan-300">
                    {[discountPrefix, discountHighlight].filter(Boolean).join(' ')}
                  </span>
                </>
              )}
              {slides.length > 1 && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400 tabular-nums">
                    Slide {safeIndex + 1}/{slides.length}
                  </span>
                </>
              )}
            </div>

            {activeSlide.title?.trim() && (
              <h2
                className="font-orbitron font-black text-white leading-tight tracking-tight text-balance"
                style={{ fontSize: 'clamp(1.35rem, 2.4vw, 2.15rem)' }}
              >
                {activeSlide.title}
              </h2>
            )}

            {activeSlide.subtitle?.trim() && (
              <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                {activeSlide.subtitle}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {slides.length > 1 && (
              <div className="flex items-center gap-1.5 mr-1">
                {slides.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    aria-label={`Slide ${idx + 1}: ${s.title || 'Slide'}`}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      idx === safeIndex
                        ? 'w-6 bg-gradient-to-r from-emerald-400 to-cyan-400'
                        : 'w-2 bg-slate-700 hover:bg-slate-500'
                    }`}
                  />
                ))}
              </div>
            )}

            {activeSlide.ctaLabel?.trim() && (
              <button
                type="button"
                onClick={onOpenTelegram}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-orbitron font-bold text-xs shadow-[0_8px_22px_rgba(16,185,129,0.3)] transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <i className="fa-brands fa-telegram text-sm"></i>
                <span>{activeSlide.ctaLabel}</span>
              </button>
            )}

            {onBrowseCatalog && (
              <button
                type="button"
                onClick={onBrowseCatalog}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0c1a22] hover:bg-[#122631] text-slate-100 border border-emerald-500/30 hover:border-emerald-400 font-rajdhani font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <i className="fa-solid fa-gift text-emerald-400"></i>
                <span>មើល Game ទាំងអស់ ({games.length})</span>
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  // STYLE 1 (Default): STEAM ONLINE — Full-Bleed Promo Banner with Slanted Discount Ribbon
  return (
    <section
      aria-label="Steam Online Custom Promo Cover"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative mb-8 rounded-2xl overflow-hidden bg-[#070a10] border border-slate-800/90 shadow-[0_24px_60px_rgba(2,5,12,0.88)] select-none"
    >
      <div className="relative min-h-[300px] sm:min-h-[350px] lg:min-h-[395px] flex items-center">
        {/* Background Media Layer: Photo or Video */}
        {renderMediaLayer(isVideo ? 'opacity-80' : 'opacity-75')}

        {/* Measured Protective Contrast Scrim */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#06090f] via-[#06090f]/80 to-[#06090f]/25"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#06090f]/95 via-transparent to-[#06090f]/45"
        />

        {/* Admin Quick Action Buttons (Top-Right) */}
        <div className="absolute top-3.5 right-4 z-30 flex items-center gap-2">
          {isVideo && !youtubeId && (
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-rajdhani font-bold text-slate-200 bg-[#0b1220]/85 hover:bg-slate-800 border border-slate-700/80 backdrop-blur-md transition cursor-pointer"
              title={isMuted ? 'Unmute Cover Video' : 'Mute Cover Video'}
            >
              <i
                className={`fa-solid ${
                  isMuted ? 'fa-volume-xmark text-slate-400' : 'fa-volume-high text-sky-300'
                }`}
              ></i>
              <span>{isMuted ? 'Muted' : 'Sound On'}</span>
            </button>
          )}

          {canEditCover && onEditCover && (
            <button
              type="button"
              onClick={onEditCover}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-orbitron font-bold text-white bg-[#0b1220]/90 hover:bg-[#0077e6] border border-sky-400/50 hover:border-sky-300 shadow-lg backdrop-blur-md transition cursor-pointer whitespace-nowrap"
              title="Edit Cover Photo, Video, Text & Promo Style"
            >
              <i className="fa-solid fa-photo-film text-sky-300"></i>
              <span>Edit Cover / Text</span>
            </button>
          )}
        </div>

        {/* Cover Content Overlay: Discount Style + Custom Headline & Subtitle + CTA */}
        <div className="relative z-10 w-full px-6 sm:px-10 lg:px-12 py-10 sm:py-12 max-w-3xl space-y-4">
          {/* G2A-Style Slanted Blue + Orange Discount Ribbon */}
          {showDiscount && (discountPrefix || discountHighlight) && (
            <div className="inline-flex items-stretch drop-shadow-[0_8px_18px_rgba(0,0,0,0.75)] tabular-nums">
              {discountPrefix && (
                <div className="px-3 py-1.5 bg-gradient-to-b from-[#0ea5e9] to-[#0077e6] -skew-x-12 flex items-center justify-center rounded-l-[4px]">
                  <span className="skew-x-12 text-white font-sans font-extrabold text-xs sm:text-sm leading-none tracking-tight whitespace-nowrap">
                    {discountPrefix}
                  </span>
                </div>
              )}
              {discountHighlight && (
                <div
                  className={`px-4 py-1.5 bg-gradient-to-b from-[#ff6a13] to-[#ea4200] -skew-x-12 flex items-center justify-center shadow-[-3px_0_8px_rgba(0,0,0,0.35)] ${
                    discountPrefix ? '-ml-1 rounded-r-[4px]' : 'rounded-[4px]'
                  }`}
                >
                  <span className="skew-x-12 text-white font-sans font-black text-lg sm:text-2xl leading-none tracking-tight whitespace-nowrap">
                    {discountHighlight}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Custom Cover Headline Text */}
          {activeSlide.title?.trim() && (
            <h2
              className="font-g2a-display font-black uppercase text-white leading-[1.08] tracking-tight text-balance drop-shadow-[0_6px_22px_rgba(0,0,0,0.9)]"
              style={{ fontSize: 'clamp(1.75rem, 3.6vw, 3.2rem)' }}
            >
              {activeSlide.title}
            </h2>
          )}

          {/* Custom Subtitle / Promo Copy */}
          {activeSlide.subtitle?.trim() && (
            <p className="text-xs sm:text-sm md:text-base text-slate-200/95 leading-relaxed max-w-xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
              {activeSlide.subtitle}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {activeSlide.ctaLabel?.trim() && (
              <button
                type="button"
                onClick={onOpenTelegram}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ff6a13] to-[#ea4200] hover:from-[#ff7b2e] hover:to-[#ff5500] text-white font-rajdhani font-bold text-xs sm:text-sm shadow-[0_8px_22px_rgba(234,66,0,0.45)] transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <i className="fa-brands fa-telegram text-base"></i>
                <span>{activeSlide.ctaLabel}</span>
              </button>
            )}

            {onBrowseCatalog && (
              <button
                type="button"
                onClick={onBrowseCatalog}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0d1524]/90 hover:bg-[#14223a] text-slate-100 border border-slate-700 hover:border-sky-400/60 font-rajdhani font-bold text-xs sm:text-sm transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <i className="fa-brands fa-steam text-sky-400"></i>
                <span>មើល Game ទាំងអស់ ({games.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Multi-Slide Prev / Next Arrows */}
        {slideControls}
      </div>

      {/* Bottom Slide Switcher Dots (if 2+ slides) */}
      {slides.length > 1 && (
        <div className="relative z-20 flex items-center justify-center gap-2 pb-3 pt-1 bg-[#06090f]/80">
          {slides.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`Slide ${idx + 1}: ${s.title || 'Promo Slide'}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                idx === safeIndex
                  ? 'w-7 bg-gradient-to-r from-[#0ea5e9] to-[#ff5a00]'
                  : 'w-2 bg-slate-600 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
