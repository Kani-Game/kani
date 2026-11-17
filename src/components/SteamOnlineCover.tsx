import React, { useEffect, useMemo, useState } from 'react';
import { Game, SiteSettings, SteamOnlineCoverSlide } from '../types/game';
import { DEFAULT_COVER_IMAGE, extractYouTubeVideoId } from './CoverMediaModal';
import { computeSteamOnlinePricing, getSteamHeroBackdropCandidates } from '../utils/pricingUtils';

interface SteamOnlineCoverProps {
  settings: SiteSettings;
  games: Game[];
  globalDiscountPercent?: number;
  canEditCover?: boolean;
  onEditCover?: () => void;
  onOpenTelegram: () => void;
  onBrowseCatalog?: () => void;
}

export const SteamOnlineCover: React.FC<SteamOnlineCoverProps> = ({
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
    const custom = Array.isArray(settings.steamOnlineCoverSlides)
      ? settings.steamOnlineCoverSlides.filter(
          (s) => s && (Boolean(s.mediaUrl?.trim()) || Boolean(s.title?.trim()))
        )
      : [];
    if (custom.length > 0) return custom;

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
  }, [settings.steamOnlineCoverSlides, topGameBackdrop, topCatalogDiscount]);

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

  return (
    <section
      aria-label="Steam Online Custom Promo Cover"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative mb-8 rounded-2xl overflow-hidden bg-[#070a10] border border-slate-800/90 shadow-[0_24px_60px_rgba(2,5,12,0.88)] select-none"
    >
      <div className="relative min-h-[300px] sm:min-h-[350px] lg:min-h-[395px] flex items-center">
        {/* Background Media Layer: Photo or Video */}
        {isVideo ? (
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
            {youtubeId ? (
              <iframe
                key={`${activeSlide.id}-yt`}
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${
                  isMuted ? 1 : 0
                }&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
                title={activeSlide.title || 'Steam Online Cover Video'}
                className="absolute inset-0 w-full h-full scale-[1.28] object-cover opacity-80"
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
                className="w-full h-full object-cover opacity-80"
              />
            )}
          </div>
        ) : !hasImgError && mediaUrl ? (
          <img
            key={`${activeSlide.id}-${mediaUrl}`}
            src={mediaUrl}
            alt={activeSlide.title || 'Steam Online Cover'}
            referrerPolicy="no-referrer"
            onError={() =>
              setImgErrorMap((prev) => ({
                ...prev,
                [activeSlide.id]: true,
              }))
            }
            className="absolute inset-0 w-full h-full object-cover object-center opacity-75 transition-opacity duration-500"
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_#122742_0%,_#070a10_65%)]"
          />
        )}

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
              title="Edit Steam Online Cover Photo, Video, Text & Discount Style"
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
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous cover slide"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-[#0077e6] text-white border border-white/15 flex items-center justify-center transition cursor-pointer backdrop-blur-sm"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next cover slide"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-[#0077e6] text-white border border-white/15 flex items-center justify-center transition cursor-pointer backdrop-blur-sm"
            >
              <i className="fa-solid fa-chevron-right text-xs"></i>
            </button>
          </>
        )}
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
