import React, { useState } from 'react';
import { Game } from '../types/game';

interface GameModalProps {
  game: Game | null;
  isSelected: boolean;
  onToggleSelect: (game: Game) => void;
  onClose: () => void;
}

export const GameModal: React.FC<GameModalProps> = ({
  game,
  isSelected,
  onToggleSelect,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);
  if (!game) return null;

  const isSteam = game.tag.toLowerCase().includes('steam');
  const fallbackImg = `https://placehold.co/800x600/131b2e/ffffff?text=${encodeURIComponent(
    game.name
  )}`;


  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#0f172a] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 text-gray-300 hover:text-white flex items-center justify-center backdrop-blur-sm hover:bg-purple-600 transition"
        >
          <i className="fa-solid fa-xmark text-lg"></i>
        </button>

        {/* Cover Image */}
        <div className="relative h-60 sm:h-80 w-full bg-slate-900">
          <img
            src={imgError ? fallbackImg : game.img}
            alt={game.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/50 to-transparent"></div>

          {/* Badge */}
          <span
            className={`absolute top-4 left-4 text-xs font-rajdhani font-bold px-3 py-1 rounded-full uppercase tracking-wider text-white shadow-md ${
              isSteam ? 'bg-purple-600' : 'bg-cyan-600'
            }`}
          >
            {game.tag}
          </span>
        </div>

        {/* Content */}
        <div className="p-6 -mt-10 relative z-10">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-md bg-purple-900/50 border border-purple-500/30 text-purple-300 text-xs font-semibold">
              {game.genre}
            </span>
            {game.barcode && (
              <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-gray-300 text-xs font-mono">
                SKU: {game.barcode}
              </span>
            )}
            {game.link && (
              <a
                href={game.link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-0.5 rounded-md bg-blue-900/50 border border-blue-500/30 text-blue-300 hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
              >
                <i className="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                <span>Store Page</span>
              </a>
            )}
          </div>


          <h3 className="font-orbitron text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-3">
            {game.name}
          </h3>

          <p className="text-gray-300 text-sm leading-relaxed mb-6">
            {game.description ||
              `${game.name} - សូមជ្រើសរើស Game នេះដើម្បីផ្ញើឈ្មោះទៅកាន់ Telegram របស់ Kani Game Admin។`}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                onToggleSelect(game);
              }}
              className={`flex-1 py-3 px-6 rounded-xl font-orbitron font-bold text-sm text-center text-white transition shadow-lg flex items-center justify-center gap-2 ${
                isSelected
                  ? 'bg-red-600 hover:bg-red-500 shadow-red-900/50'
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/50'
              }`}
            >
              <i
                className={`fa-solid ${isSelected ? 'fa-xmark' : 'fa-check'}`}
              ></i>
              <span>{isSelected ? 'លុបចេញពីបញ្ជី' : 'ជ្រើសរើស Game នេះ'}</span>
            </button>

            <button
              onClick={onClose}
              className="py-3 px-6 rounded-xl font-rajdhani font-bold text-sm bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 transition"
            >
              បិទ (Close)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
