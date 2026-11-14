import React, { useState } from 'react';
import { Game } from '../types/game';

interface GameModalProps {
  game: Game | null;
  isSelected: boolean;
  onToggleSelect: (game: Game) => void;
  onClose: () => void;
  adminHandle?: string;
  onSendToTelegram?: (game: Game) => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  game,
  isSelected,
  onToggleSelect,
  onClose,
  adminHandle,
  onSendToTelegram,
}) => {
  const [imgError, setImgError] = useState(false);
  if (!game) return null;

  const fallbackImg = `https://placehold.co/800x600/131b2e/ffffff?text=${encodeURIComponent(
    game.name
  )}`;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] bg-[#0b1121] border border-amber-500/45 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-lg bg-black/60 text-gray-200 hover:text-white flex items-center justify-center backdrop-blur-sm hover:bg-black/85 border border-white/10 transition cursor-pointer"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Cover Image */}
        <div className="relative h-[320px] sm:h-[360px] w-full bg-[#0b1121]">
          <img
            src={imgError ? fallbackImg : game.img}
            alt={game.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b1121] via-[#0b1121]/30 to-transparent"></div>
        </div>

        {/* Content */}
        <div className="px-5 sm:px-6 pb-5 pt-1 -mt-6 relative z-10">
          {/* Tag Pill Badge */}
          <span className="inline-block px-3 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/45 text-amber-400 font-orbitron font-bold text-[10px] uppercase tracking-wider mb-2.5">
            {game.tag}
          </span>

          {/* Game Title */}
          <h3 className="font-orbitron text-xl sm:text-2xl font-extrabold text-white uppercase tracking-wide leading-snug mb-1">
            {game.name}
          </h3>

          {/* Metadata Line */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 font-medium mb-3">
            <span>{game.tag}</span>
            <span>·</span>
            <span>{game.genre}</span>
            {game.barcode && (
              <>
                <span>·</span>
                <span className="font-mono">SKU: {game.barcode}</span>
              </>
            )}
            {game.link && (
              <>
                <span>·</span>
                <a
                  href={game.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 transition"
                >
                  <span>Store Page</span>
                  <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                </a>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="border-t border-slate-800/90 pt-4 flex flex-col gap-2.5">
            {onSendToTelegram && (
              <button
                type="button"
                onClick={() => onSendToTelegram(game)}
                className="w-full py-2.5 px-4 rounded-xl font-orbitron font-bold text-xs sm:text-sm text-center text-white bg-gradient-to-r from-[#00b4ff] to-[#00d2ff] hover:from-[#00a2eb] hover:to-[#00bde6] transition-all shadow-lg shadow-cyan-950/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className="fa-brands fa-telegram text-base"></i>
                <span>ផ្ញើ Game នេះទៅ Admin (@{(adminHandle || 'kanigame168').replace('@', '')})</span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onToggleSelect(game);
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl font-orbitron font-bold text-xs text-center transition flex items-center justify-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-red-600/90 hover:bg-red-500 text-white shadow-md shadow-red-950/50'
                    : 'bg-[#1e293b] hover:bg-[#273549] text-gray-100 border border-slate-700/80'
                }`}
              >
                <i
                  className={`fa-solid ${isSelected ? 'fa-xmark' : 'fa-check'}`}
                ></i>
                <span>{isSelected ? 'លុបចេញពីបញ្ជី' : 'ជ្រើសរើស Game នេះ'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl font-rajdhani font-bold text-xs sm:text-sm bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/45 transition cursor-pointer shrink-0"
              >
                បិទ (Close)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
