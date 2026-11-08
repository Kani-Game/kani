import React from 'react';
import { SiteSettings } from '../types/game';

interface HeroBannerProps {
  settings: SiteSettings;
  steamCount: number;
  freeCount: number;
  totalCount: number;
  onOpenTelegram: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  settings,
  steamCount,
  freeCount,
  totalCount,
  onOpenTelegram,
}) => {
  return (
    <div className="relative rounded-2xl overflow-hidden mb-8 border border-purple-500/25 bg-gradient-to-r from-purple-950/40 via-[#0d1322] to-cyan-950/40 p-6 sm:p-8 md:p-10 shadow-2xl">
      {/* Background accents */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-purple-500/15 via-transparent to-transparent pointer-events-none"></div>
      <div className="absolute -bottom-10 -right-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 lg:gap-8">
        <div className="max-w-3xl 2xl:max-w-4xl">
          {/* Pulsing Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold mb-4 backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span>{settings.heroBadge}</span>
          </div>

          {/* Heading */}
          <h2 className="font-orbitron text-2xl sm:text-3xl md:text-4xl 2xl:text-5xl font-extrabold text-white tracking-wide leading-tight mb-3">
            {settings.heroTitle}
          </h2>

          {/* Description */}
          <p className="text-gray-300 text-sm sm:text-base 2xl:text-lg mb-6 leading-relaxed max-w-3xl">
            {settings.heroDescription}
          </p>

          {/* Telegram Direct Connect Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onOpenTelegram}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-orbitron font-bold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-md shadow-cyan-950/50 transition cursor-pointer"
            >
              <i className="fa-brands fa-telegram text-base"></i>
              <span>ADMIN TELEGRAM: {settings.telegramAdminHandle}</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid & Card on Widescreen */}
        <div className="bg-[#0b101d]/80 border border-purple-500/25 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl xl:min-w-[360px] 2xl:min-w-[420px] shrink-0">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-purple-900/40">
            <span className="text-xs font-orbitron font-bold text-gray-300 flex items-center gap-2">
              <i className="fa-solid fa-bolt text-yellow-400"></i>
              CATALOG LIVE STATS
            </span>
            <span className="text-[10px] font-mono text-green-400 bg-green-950/60 border border-green-500/30 px-2 py-0.5 rounded-full">
              UPDATED
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="bg-[#131b2e] p-3 rounded-xl border border-purple-900/40 text-center">
              <p className="text-[10px] sm:text-[11px] text-gray-400 font-rajdhani font-semibold tracking-wider">
                STEAM OFFLINE
              </p>
              <p className="text-xl sm:text-2xl 2xl:text-3xl font-orbitron font-bold text-purple-400 mt-1">
                {steamCount}
              </p>
            </div>
            <div className="bg-[#131b2e] p-3 rounded-xl border border-cyan-900/40 text-center">
              <p className="text-[10px] sm:text-[11px] text-gray-400 font-rajdhani font-semibold tracking-wider">
                FREE GAMES
              </p>
              <p className="text-xl sm:text-2xl 2xl:text-3xl font-orbitron font-bold text-cyan-400 mt-1">
                {freeCount}
              </p>
            </div>
            <div className="bg-[#131b2e] p-3 rounded-xl border border-fuchsia-900/40 text-center">
              <p className="text-[10px] sm:text-[11px] text-gray-400 font-rajdhani font-semibold tracking-wider">
                TOTAL TITLES
              </p>
              <p className="text-xl sm:text-2xl 2xl:text-3xl font-orbitron font-bold text-fuchsia-400 mt-1">
                {totalCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
