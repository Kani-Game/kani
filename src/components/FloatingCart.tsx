import React from 'react';

interface FloatingCartProps {
  selectedCount: number;
  onOpenDrawer: () => void;
  onSendTelegram: () => void;
}

export const FloatingCart: React.FC<FloatingCartProps> = ({
  selectedCount,
  onOpenDrawer,
  onSendTelegram,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-3xl bg-[#0f172a]/95 border border-purple-500/50 rounded-2xl p-3 sm:p-4 shadow-[0_10px_40px_rgba(168,85,247,0.35)] backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-8 flex items-center justify-between gap-3">
      {/* Selection Info */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white text-lg font-bold shadow-neon-purple">
            <i className="fa-solid fa-gamepad"></i>
          </div>
          <span className="absolute -top-2 -right-2 bg-cyan-400 text-black font-extrabold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-md animate-bounce">
            {selectedCount}
          </span>
        </div>
        <div>
          <p className="text-[11px] sm:text-xs text-gray-400 font-rajdhani uppercase tracking-wider font-semibold">
            បានជ្រើសរើស Game
          </p>
          <p className="text-sm sm:text-base font-orbitron font-extrabold text-white">
            <span className="text-purple-400">{selectedCount}</span> Items Selected
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenDrawer}
          className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 transition flex items-center gap-2 cursor-pointer"
        >
          <i className="fa-solid fa-list-ul text-purple-400"></i>
          <span className="hidden xs:inline">មើលបញ្ជី</span> <span>(List)</span>
        </button>

        <button
          onClick={onSendTelegram}
          className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-orbitron font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-cyan-900/40 flex items-center gap-2 cursor-pointer"
        >
          <i className="fa-brands fa-telegram text-base"></i>
          <span>SEND TELEGRAM</span>
        </button>
      </div>
    </div>
  );
};
