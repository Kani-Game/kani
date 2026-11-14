import React, { useEffect, useState, useCallback } from 'react';
import { Game } from '../types/game';
import {
  fetchSteamSpec,
  SteamRequirementBlock,
  SteamSpecResponse,
} from '../services/steamService';

interface GameModalProps {
  game: Game | null;
  isSelected: boolean;
  onToggleSelect: (game: Game) => void;
  onClose: () => void;
  adminHandle?: string;
  onSendToTelegram?: (game: Game) => void;
  onSelectGenre?: (genre: string) => void;
}

function getHardwareIconClass(label: string): string {
  const lower = label.toLowerCase();
  if (lower === 'os' || lower.includes('operating')) return 'fa-brands fa-windows';
  if (lower === 'processor' || lower.includes('cpu')) return 'fa-solid fa-microchip';
  if (lower === 'memory' || lower.includes('ram')) return 'fa-solid fa-memory';
  if (lower === 'graphics' || lower.includes('gpu') || lower.includes('video'))
    return 'fa-solid fa-display';
  if (lower.includes('directx')) return 'fa-solid fa-bolt';
  if (lower === 'storage' || lower.includes('disk') || lower.includes('drive'))
    return 'fa-solid fa-hard-drive';
  if (lower === 'network' || lower.includes('internet'))
    return 'fa-solid fa-network-wired';
  if (lower.includes('sound') || lower.includes('audio'))
    return 'fa-solid fa-volume-high';
  return 'fa-solid fa-sliders';
}

interface SpecColumnProps {
  title: string;
  accent: 'cyan' | 'fuchsia';
  block: SteamRequirementBlock;
}

const SpecColumn: React.FC<SpecColumnProps> = ({ title, accent, block }) => {
  const isCyan = accent === 'cyan';
  const hasContent = block.items.length > 0 || block.notes.length > 0;

  return (
    <div
      className={`rounded-xl border p-4 bg-[#0d1224]/90 flex flex-col gap-3 ${
        isCyan ? 'border-cyan-500/30' : 'border-fuchsia-500/30'
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span
          className={`font-orbitron font-bold text-xs uppercase tracking-wider flex items-center gap-2 ${
            isCyan ? 'text-cyan-300' : 'text-fuchsia-300'
          }`}
        >
          <i
            className={`fa-solid ${isCyan ? 'fa-gauge' : 'fa-gauge-high'} text-xs`}
          ></i>
          <span>{title}</span>
        </span>
      </div>

      {!hasContent ? (
        <p className="text-xs text-gray-400 italic py-2">
          Not listed on Steam Store for this tier.
        </p>
      ) : (
        <>
          {block.items.length > 0 && (
            <dl className="space-y-2.5 text-xs">
              {block.items.map((item, idx) => (
                <div key={`${item.label}-${idx}`} className="flex items-start gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center mt-0.5 ${
                      isCyan
                        ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/25'
                        : 'bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-500/25'
                    }`}
                  >
                    <i className={`${getHardwareIconClass(item.label)} text-[11px]`}></i>
                  </span>
                  <div className="min-w-0 flex-1">
                    <dt className="text-[10px] font-orbitron uppercase tracking-wider text-gray-400">
                      {item.label}
                    </dt>
                    <dd className="text-gray-100 leading-snug break-words mt-0.5">
                      {item.value}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          {block.notes.length > 0 && (
            <div className="pt-2.5 border-t border-white/10 space-y-1">
              <div className="text-[10px] font-orbitron uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
                <i className="fa-solid fa-circle-info text-[10px]"></i>
                <span>Additional Notes</span>
              </div>
              {block.notes.map((note, idx) => (
                <p key={idx} className="text-[11px] text-gray-300 leading-relaxed">
                  {note}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const GameModal: React.FC<GameModalProps> = ({
  game,
  isSelected,
  onToggleSelect,
  onClose,
  adminHandle,
  onSendToTelegram,
  onSelectGenre,
}) => {
  const [imgError, setImgError] = useState(false);
  const [steamSpec, setSteamSpec] = useState<SteamSpecResponse | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  const isProduct = Boolean(game?.tag.toLowerCase().includes('product'));

  const loadSpecs = useCallback(
    async (targetGame: Game, forceRefresh = false) => {
      setSpecLoading(true);
      setSpecError(null);
      try {
        const result = await fetchSteamSpec({
          name: targetGame.name,
          link: targetGame.link,
          forceRefresh,
        });
        setSteamSpec(result);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to retrieve Steam PC system requirements.';
        setSpecError(message);
      } finally {
        setSpecLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setImgError(false);
    setSteamSpec(null);
    setSpecError(null);
    setSpecLoading(false);

    if (!game) return;
    if (!game.tag.toLowerCase().includes('product')) {
      void loadSpecs(game, false);
    }
  }, [game, loadSpecs]);

  if (!game) return null;

  const fallbackImg = `https://placehold.co/800x600/131b2e/ffffff?text=${encodeURIComponent(
    game.name
  )}`;
  const activeCover = !imgError
    ? game.img || steamSpec?.coverImage || fallbackImg
    : steamSpec?.coverImage || fallbackImg;
  const steamStoreUrl = steamSpec?.steamUrl || game.link;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl lg:max-w-4xl bg-[#0b1121] border border-purple-500/45 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.88)] overflow-hidden my-4 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-lg bg-black/70 text-gray-200 hover:text-white flex items-center justify-center backdrop-blur-sm hover:bg-black/90 border border-white/15 transition cursor-pointer"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Scrollable Content Container */}
        <div className="overflow-y-auto flex-1">
          {/* Top Game Header Banner */}
          <div className="p-5 sm:p-6 bg-gradient-to-b from-[#151c36] to-[#0b1121] border-b border-purple-900/40 flex flex-col sm:flex-row gap-5">
            {/* Cover Artwork */}
            <div className="w-full sm:w-44 md:w-48 aspect-[3/4] shrink-0 rounded-xl overflow-hidden bg-[#080d1a] border border-purple-500/30 shadow-lg mx-auto sm:mx-0 max-w-[200px]">
              <img
                src={activeCover}
                alt={game.name}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover object-top"
              />
            </div>

            {/* Title & Steam Metadata (No Description, No Price) */}
            <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2 pr-8">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/40 text-purple-300 font-orbitron font-bold text-[10px] uppercase tracking-wider">
                    <i
                      className={
                        isProduct
                          ? 'fa-solid fa-box-open'
                          : game.tag.toLowerCase().includes('steam')
                          ? 'fa-brands fa-steam'
                          : 'fa-solid fa-gift'
                      }
                    ></i>
                    <span>{game.tag}</span>
                  </span>
                  {game.genre &&
                    (onSelectGenre ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectGenre(game.genre);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/35 hover:border-cyan-400 text-cyan-300 font-rajdhani font-bold text-xs transition cursor-pointer"
                        title={`Filter catalog by ${game.genre}`}
                      >
                        <span>{game.genre}</span>
                        <i className="fa-solid fa-filter text-[9px] opacity-80"></i>
                      </button>
                    ) : (
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-rajdhani font-bold text-xs">
                        {game.genre}
                      </span>
                    ))}
                </div>

                <h3 className="font-orbitron text-xl sm:text-2xl font-extrabold text-white uppercase tracking-wide leading-snug">
                  {game.name}
                </h3>

                {/* Steam Matched Metadata */}
                {steamSpec ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
                    <span className="inline-flex items-center gap-1.5 text-emerald-300 font-medium">
                      <i className="fa-brands fa-steam text-xs"></i>
                      <span>Steam: {steamSpec.matchedName}</span>
                    </span>
                    {steamSpec.developers.length > 0 && (
                      <span className="text-gray-400">
                        Dev: <strong className="text-gray-200">{steamSpec.developers.join(', ')}</strong>
                      </span>
                    )}
                    {steamSpec.releaseDate && (
                      <span className="text-gray-400">
                        Release: <strong className="text-gray-200">{steamSpec.releaseDate}</strong>
                      </span>
                    )}
                  </div>
                ) : (
                  game.barcode && (
                    <p className="mt-2 text-xs text-gray-400 font-mono">
                      SKU: {game.barcode}
                    </p>
                  )
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {onSendToTelegram && (
                  <button
                    type="button"
                    onClick={() => onSendToTelegram(game)}
                    className="py-2 px-4 rounded-xl font-orbitron font-bold text-xs text-white bg-gradient-to-r from-[#00b4ff] to-[#00d2ff] hover:from-[#00a2eb] hover:to-[#00bde6] transition-all shadow-lg shadow-cyan-950/60 flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <i className="fa-brands fa-telegram text-sm"></i>
                    <span>ផ្ញើទៅ Admin (@{(adminHandle || 'kanigame168').replace('@', '')})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleSelect(game)}
                  className={`py-2 px-4 rounded-xl font-orbitron font-bold text-xs transition flex items-center gap-2 cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-red-600/90 hover:bg-red-500 text-white shadow-md shadow-red-950/50'
                      : 'bg-[#1e293b] hover:bg-[#273549] text-gray-100 border border-slate-700/80'
                  }`}
                >
                  <i className={`fa-solid ${isSelected ? 'fa-xmark' : 'fa-check'}`}></i>
                  <span>{isSelected ? 'លុបចេញពីបញ្ជី' : 'ជ្រើសរើស Game នេះ'}</span>
                </button>

                {steamStoreUrl && (
                  <a
                    href={steamStoreUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-3.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-cyan-500/35 text-xs font-semibold inline-flex items-center gap-1.5 transition whitespace-nowrap"
                  >
                    <i className="fa-brands fa-steam"></i>
                    <span>View on Steam Store</span>
                    <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* PC System Requirements Section */}
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/35 text-cyan-300 flex items-center justify-center">
                  <i className="fa-solid fa-microchip text-sm"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-sm text-white uppercase tracking-wider">
                    PC System Requirements
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    Minimum &amp; Recommended specifications synced from Steam Store
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(steamSpec || !isProduct) && (
                  <button
                    type="button"
                    disabled={specLoading}
                    onClick={() => void loadSpecs(game, true)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                    title="Refresh specs from Steam"
                  >
                    <i
                      className={`fa-solid fa-rotate ${specLoading ? 'fa-spin' : ''}`}
                    ></i>
                    <span>Refresh</span>
                  </button>
                )}
              </div>
            </div>

            {/* Product Item: Manual Load Button (Skip Auto-Fetch) */}
            {isProduct && !steamSpec && !specLoading && !specError && (
              <div className="rounded-xl border border-indigo-500/30 bg-[#10162b] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <p className="text-xs font-semibold text-gray-200">
                    Hardware / Product Item
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Auto-lookup is skipped for Products. Click below if you want to check Steam Store info anyway.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSpecs(game, false)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-xs font-orbitron font-bold flex items-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <i className="fa-brands fa-steam"></i>
                  <span>Load Steam Spec</span>
                </button>
              </div>
            )}

            {/* Loading State */}
            {specLoading && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map((col) => (
                  <div
                    key={col}
                    className="rounded-xl border border-purple-900/40 bg-[#0d1224]/70 p-4 space-y-3 animate-pulse"
                  >
                    <div className="h-4 w-32 bg-slate-700/70 rounded"></div>
                    <div className="h-3 w-full bg-slate-800/80 rounded"></div>
                    <div className="h-3 w-5/6 bg-slate-800/80 rounded"></div>
                    <div className="h-3 w-4/5 bg-slate-800/80 rounded"></div>
                    <div className="h-3 w-3/4 bg-slate-800/80 rounded"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!specLoading && specError && (
              <div className="rounded-xl border border-rose-500/35 bg-rose-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-rose-200">
                  <i className="fa-solid fa-triangle-exclamation text-rose-400 mt-0.5"></i>
                  <div>
                    <p className="font-semibold">Could not load Steam PC Specs</p>
                    <p className="text-rose-300/80 mt-0.5">{specError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadSpecs(game, true)}
                  className="px-3 py-1.5 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Side-by-side Minimum & Recommended Specs */}
            {!specLoading && steamSpec && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SpecColumn title="Minimum" accent="cyan" block={steamSpec.minimum} />
                <SpecColumn
                  title="Recommended"
                  accent="fuchsia"
                  block={steamSpec.recommended}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-purple-900/40 bg-[#0e1529] flex items-center justify-between gap-3">
          <span className="text-[11px] text-gray-400">
            {steamSpec ? `App ID: ${steamSpec.appId}` : game.tag}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl font-rajdhani font-bold text-xs sm:text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/45 transition cursor-pointer shrink-0"
          >
            បិទ (Close)
          </button>
        </div>
      </div>
    </div>
  );
};
