import React, { useState } from 'react';
import { Game } from '../types/game';

interface GameCardProps {
  game: Game;
  isSelected: boolean;
  onToggleSelect: (game: Game) => void;
  onOpenPreview: (game: Game) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected,
  onToggleSelect,
  onOpenPreview,
}) => {
  const [imgError, setImgError] = useState(false);
  const isSteam = game.tag.toLowerCase().includes('steam');
  const tagBg = isSteam
    ? 'bg-purple-950/80 text-purple-300 border-purple-500/30'
    : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/30';

  const fallbackImg = `https://placehold.co/600x800/131b2e/ffffff?text=${encodeURIComponent(
    game.name
  )}`;


  return (
    <div
      className={`group relative bg-[#131b2e] rounded-xl overflow-hidden border border-purple-900/40 hover:border-purple-500/60 transition-all duration-300 glow-box flex flex-col cursor-pointer transform hover:-translate-y-1 ${
        isSelected ? 'card-selected' : ''
      }`}
    >
      {/* Cover Image */}
      <div
        className="relative w-full aspect-[3/4] bg-slate-900 overflow-hidden"
        onClick={() => onToggleSelect(game)}
      >
        <img
          src={imgError ? fallbackImg : game.img}
          alt={game.name}
          onError={() => setImgError(true)}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#131b2e] via-transparent to-black/30 pointer-events-none"></div>

        {/* Checkbox badge */}
        <div
          className={`absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-purple-600 text-white shadow-lg scale-110 ring-2 ring-purple-300'
              : 'bg-black/60 text-gray-400 border border-white/20 hover:border-white/40'
          }`}
          title={isSelected ? 'លុបចេញពីបញ្ជី' : 'ជ្រើសរើស Game នេះ'}
        >
          <i className={`fa-solid ${isSelected ? 'fa-check' : 'fa-plus'} text-xs`}></i>
        </div>

        {/* Tag badge */}
        <span
          className={`absolute top-2 left-2 text-[10px] font-rajdhani font-bold px-2 py-0.5 rounded border backdrop-blur-sm ${tagBg}`}
        >
          {game.tag}
        </span>
      </div>

      {/* Card Info */}
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-1 mb-1">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider line-clamp-1">
              {game.genre || 'Action'}
            </p>
          </div>
          <h4
            className="font-rajdhani font-bold text-sm text-gray-100 line-clamp-2 leading-snug hover:text-purple-300 transition-colors cursor-pointer"
            onClick={() => onOpenPreview(game)}
            title={game.name}
          >
            {game.name}
          </h4>
        </div>

        {/* Bottom Actions */}
        <div className="mt-3 flex items-center gap-1.5">

          <button
            type="button"
            onClick={() => onToggleSelect(game)}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider text-white transition flex items-center justify-center gap-1.5 shadow ${
              isSelected
                ? 'bg-purple-700 hover:bg-purple-600 ring-1 ring-purple-400'
                : 'bg-purple-600/85 hover:bg-purple-600'
            }`}
          >
            <i
              className={`fa-solid ${
                isSelected ? 'fa-circle-check text-green-300' : 'fa-square-check'
              }`}
            ></i>
            <span>{isSelected ? 'បានជ្រើសរើស' : 'ជ្រើសរើស'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPreview(game)}
            className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-gray-300 rounded-lg text-xs border border-slate-700 transition"
            title="Preview Details"
          >
            <i className="fa-solid fa-eye text-xs"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
