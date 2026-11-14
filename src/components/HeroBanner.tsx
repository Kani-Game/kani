import React, { useState } from 'react';
import { SiteSettings } from '../types/game';
import { DEFAULT_COVER_IMAGE, extractYouTubeVideoId } from './CoverMediaModal';

interface HeroBannerProps {
  settings: SiteSettings;
  steamCount: number;
  freeCount: number;
  totalCount: number;
  onOpenTelegram: () => void;
  onBrowseCatalog?: () => void;
  canEditCover?: boolean;
  onEditCover?: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  settings,
  steamCount,
  freeCount,
  totalCount,
  onOpenTelegram,
  onBrowseCatalog,
  canEditCover = false,
  onEditCover,
}) => {
  const [isVideoMuted, setIsVideoMuted] = useState(true);

  const telegramLabel = settings.telegramAdminHandle
    ? `ORDER ${settings.telegramAdminHandle.toUpperCase()}`
    : 'ORDER @KANIGAME168';

  const coverMainTitle = (settings.heroMainTitle ?? 'KANI GAME').trim() || 'KANI GAME';
  const coverTitleParts = coverMainTitle.split(/\s+/);
  const coverLeadingTitle = coverTitleParts.length > 1 ? coverTitleParts.slice(0, -1).join(' ') : '';
  const coverAccentTitle = coverTitleParts.length > 1 ? coverTitleParts[coverTitleParts.length - 1] : coverMainTitle;

  const mediaType = settings.heroMediaType === 'video' && settings.heroCoverVideo ? 'video' : 'photo';
  const mediaLayout = settings.heroMediaLayout === 'full' ? 'full' : 'side';
  const leftCoverImg = settings.heroCoverImage?.trim() || DEFAULT_COVER_IMAGE;
  const rightCoverImg = settings.heroCoverRightImage?.trim() || leftCoverImg;
  const isDefaultLeftImg = leftCoverImg === DEFAULT_COVER_IMAGE;
  const isDefaultRightImg = rightCoverImg === DEFAULT_COVER_IMAGE;
  const coverVideoUrl = settings.heroCoverVideo?.trim() || '';
  const youtubeId = mediaType === 'video' ? extractYouTubeVideoId(coverVideoUrl) : null;

  const handleBrowse = () => {
    if (onBrowseCatalog) {
      onBrowseCatalog();
      return;
    }
    const el = document.getElementById('catalog-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <section className="relative mb-8 py-4 select-none">
      {/* Top Notch Crosses (Outside Upper Notch) */}
      <div
        aria-hidden="true"
        className="flex items-center justify-center gap-1.5 text-[10px] font-mono tracking-widest mb-1.5"
      >
        <span className="text-purple-400">×</span>
        <span className="text-fuchsia-400">×</span>
        <span className="text-cyan-400">×</span>
      </div>

      {/* Main Chamfered Tactical Frame */}
      <div
        className="relative overflow-hidden bg-[#0c0820] shadow-[0_20px_60px_rgba(12,6,34,0.85)]"
        style={{
          clipPath:
            'polygon(18px 0%, calc(50% - 74px) 0%, calc(50% - 58px) 12px, calc(50% + 58px) 12px, calc(50% + 74px) 0%, calc(100% - 18px) 0%, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, calc(50% + 74px) 100%, calc(50% + 58px) calc(100% - 12px), calc(50% - 58px) calc(100% - 12px), calc(50% - 74px) 100%, 18px 100%, 0% calc(100% - 18px), 0% 18px)',
        }}
      >
        {/* Base Ambient Deep Purple Backdrop */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#25134e_0%,_#130b2c_52%,_#090716_100%)]"
        />

        {/* Cover Media Background: Video or Photo (Full or Side Panels) */}
        {mediaType === 'video' ? (
          mediaLayout === 'full' ? (
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
              {youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${
                    isVideoMuted ? 1 : 0
                  }&loop=1&playlist=${youtubeId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1`}
                  title="Cover Background Video"
                  className="absolute inset-0 w-full h-full scale-[1.25] object-cover opacity-65"
                  allow="autoplay; encrypted-media"
                />
              ) : (
                <video
                  key={coverVideoUrl}
                  src={coverVideoUrl}
                  autoPlay
                  loop
                  muted={isVideoMuted}
                  playsInline
                  className="w-full h-full object-cover opacity-70"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-[#090716]/60 via-[#0c0820]/50 to-[#090716]/75" />
            </div>
          ) : (
            <>
              <div
                aria-hidden="true"
                className="hidden md:block absolute inset-y-0 left-0 w-[28%] lg:w-[25%] max-w-[400px] overflow-hidden pointer-events-none"
              >
                {youtubeId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&rel=0&playsinline=1`}
                    title="Left Cover Video"
                    className="w-full h-full scale-150 opacity-85"
                    allow="autoplay; encrypted-media"
                  />
                ) : (
                  <video
                    key={`left-${coverVideoUrl}`}
                    src={coverVideoUrl}
                    autoPlay
                    loop
                    muted={isVideoMuted}
                    playsInline
                    className="w-full h-full object-cover opacity-85"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-[#090716]/30 via-transparent to-[#140b2e]" />
                <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#140b2e] via-[#140b2e]/85 to-transparent" />
              </div>
              <div
                aria-hidden="true"
                className="hidden md:block absolute inset-y-0 right-0 w-[28%] lg:w-[25%] max-w-[400px] overflow-hidden pointer-events-none"
              >
                {youtubeId ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&rel=0&playsinline=1`}
                    title="Right Cover Video"
                    className="w-full h-full scale-150 opacity-85"
                    allow="autoplay; encrypted-media"
                  />
                ) : (
                  <video
                    key={`right-${coverVideoUrl}`}
                    src={coverVideoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover opacity-85"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-l from-[#090716]/30 via-transparent to-[#140b2e]" />
                <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#140b2e] via-[#140b2e]/85 to-transparent" />
              </div>
            </>
          )
        ) : mediaLayout === 'full' ? (
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              src={leftCoverImg}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center opacity-55"
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(12,8,32,0.58)_0%,_rgba(9,7,22,0.82)_100%)]" />
          </div>
        ) : (
          <>
            {/* Left Character Artwork Panel */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute inset-y-0 left-0 w-[28%] lg:w-[25%] max-w-[400px] overflow-hidden pointer-events-none"
            >
              <img
                src={leftCoverImg}
                alt=""
                referrerPolicy="no-referrer"
                className={
                  isDefaultLeftImg
                    ? 'absolute -top-[12%] -left-10 h-[128%] w-auto max-w-none object-cover opacity-85'
                    : 'w-full h-full object-cover object-center opacity-85'
                }
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#090716]/30 via-transparent to-[#140b2e]" />
              <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#140b2e] via-[#140b2e]/85 to-transparent" />
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#0c0820] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0c0820] to-transparent" />
            </div>

            {/* Right Character Artwork Panel */}
            <div
              aria-hidden="true"
              className="hidden md:block absolute inset-y-0 right-0 w-[28%] lg:w-[25%] max-w-[400px] overflow-hidden pointer-events-none"
            >
              <img
                src={rightCoverImg}
                alt=""
                referrerPolicy="no-referrer"
                className={
                  isDefaultRightImg
                    ? 'absolute -top-[12%] -right-10 h-[128%] w-auto max-w-none object-cover opacity-85'
                    : 'w-full h-full object-cover object-center opacity-85'
                }
              />
              <div className="absolute inset-0 bg-gradient-to-l from-[#090716]/30 via-transparent to-[#140b2e]" />
              <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#140b2e] via-[#140b2e]/85 to-transparent" />
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#0c0820] to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0c0820] to-transparent" />
            </div>
          </>
        )}

        {/* Subtle Center Ambient Glows */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[58%] bg-[radial-gradient(circle_at_center,_rgba(168,85,247,0.18)_0%,_rgba(56,189,248,0.06)_55%,_transparent_75%)] pointer-events-none"
        />

        {/* Central Protective Contrast Scrim */}
        <div
          aria-hidden="true"
          className="hidden md:block absolute inset-y-0 left-[18%] right-[18%] bg-gradient-to-r from-transparent via-[#170d36]/80 to-transparent pointer-events-none"
        />

        {/* Admin Quick Button on Cover: Change Photo / Add Video */}
        {canEditCover && onEditCover && (
          <button
            type="button"
            onClick={onEditCover}
            className="absolute top-3 right-5 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-orbitron font-bold text-cyan-200 bg-[#0d1324]/85 hover:bg-purple-900/90 border border-cyan-400/50 hover:border-fuchsia-400 shadow-lg backdrop-blur-md transition cursor-pointer"
            title="Change Cover Photo or Video"
          >
            <i className="fa-solid fa-photo-film text-cyan-300"></i>
            <span>Change Photo / Video</span>
          </button>
        )}

        {/* Sound Toggle for Direct Video Cover */}
        {mediaType === 'video' && !youtubeId && (
          <button
            type="button"
            onClick={() => setIsVideoMuted((prev) => !prev)}
            className="absolute bottom-3 right-5 z-30 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-rajdhani font-bold text-gray-200 bg-[#0d1324]/80 hover:bg-purple-900/80 border border-purple-500/40 backdrop-blur-md transition cursor-pointer"
            title={isVideoMuted ? 'Unmute Cover Video' : 'Mute Cover Video'}
          >
            <i className={`fa-solid ${isVideoMuted ? 'fa-volume-xmark text-gray-400' : 'fa-volume-high text-cyan-300'}`}></i>
            <span>{isVideoMuted ? 'Muted' : 'Sound On'}</span>
          </button>
        )}

        {/* Neon Chamfered Frame SVG Border */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1200 360"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        >
          <defs>
            <linearGradient id="kaniHeroNeonBorder" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="45%" stopColor="#d946ef" />
              <stop offset="72%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <polygon
            points="18,1 526,1 542,13 658,13 674,1 1182,1 1199,18 1199,342 1182,359 674,359 658,347 542,347 526,359 18,359 1,342 1,18"
            fill="none"
            stroke="url(#kaniHeroNeonBorder)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Centered Hero Content */}
        <div className="relative z-10 flex flex-col items-center justify-center text-center px-6 sm:px-10 md:px-16 py-10 sm:py-12 md:py-14 min-h-[300px] sm:min-h-[340px]">
          {/* Inner Cross Accent */}
          <div
            aria-hidden="true"
            className="flex items-center justify-center gap-1.5 text-[10px] font-mono tracking-widest text-purple-300/70 mb-2"
          >
            <span>×</span>
            <span>×</span>
            <span>×</span>
          </div>

          {/* Brand Display Title */}
          <h2 className="font-orbitron font-black text-3xl sm:text-4xl md:text-5xl tracking-[0.22em] leading-none mb-3 drop-shadow-[0_4px_20px_rgba(168,85,247,0.35)] text-balance">
            {coverLeadingTitle && <span className="text-white">{coverLeadingTitle} </span>}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-300">
              {coverAccentTitle}
            </span>
          </h2>

          {/* Main Subheadline */}
          <p className="font-rajdhani font-bold text-sm sm:text-base md:text-lg text-white uppercase tracking-[0.08em] mb-2.5 max-w-2xl text-balance">
            {settings.heroTitle}
          </p>

          {/* Khmer Instruction Description */}
          <p className="text-xs sm:text-sm text-gray-300/95 leading-relaxed max-w-xl mx-auto mb-6">
            {settings.heroDescription}
          </p>

          {/* Dual Centered CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mb-5">
            <button
              type="button"
              onClick={onOpenTelegram}
              className="inline-flex items-center justify-center gap-2.5 px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-orbitron font-bold text-white bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-500 hover:from-purple-500 hover:to-fuchsia-500 border border-fuchsia-400/50 shadow-[0_0_24px_rgba(168,85,247,0.45)] transition-all duration-200 hover:-translate-y-0.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <i className="fa-brands fa-telegram text-base"></i>
              <span>{telegramLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleBrowse}
              className="inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-2.5 rounded-lg text-xs sm:text-sm font-orbitron font-bold text-gray-100 bg-[#120e29]/85 hover:bg-purple-950/70 border border-purple-500/40 hover:border-cyan-400/60 transition-all duration-200 hover:-translate-y-0.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>BROWSE CATALOG</span>
            </button>
          </div>

          {/* Unboxed Clean Catalog Stats (Zero-Pill) */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs sm:text-[13px] font-rajdhani font-semibold tracking-wide text-gray-300 tabular-nums">
            <span>
              Steam: <strong className="text-white font-bold">{steamCount}</strong>
            </span>
            <span aria-hidden="true" className="text-purple-400/50">
              ·
            </span>
            <span>
              Free: <strong className="text-cyan-400 font-bold">{freeCount}</strong>
            </span>
            <span aria-hidden="true" className="text-purple-400/50">
              ·
            </span>
            <span>
              Total: <strong className="text-fuchsia-400 font-bold">{totalCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Notch Crosses (Outside Lower Notch) */}
      <div
        aria-hidden="true"
        className="flex items-center justify-center gap-1.5 text-[10px] font-mono tracking-widest mt-1.5"
      >
        <span className="text-purple-400">×</span>
        <span className="text-fuchsia-400">×</span>
        <span className="text-cyan-400">×</span>
      </div>
    </section>
  );
};
