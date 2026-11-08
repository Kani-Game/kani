import React, { useState } from 'react';
import { Game } from '../types/game';

interface SelectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGames: Game[];
  onRemoveGame: (id: string) => void;
  onClearAll: () => void;
  adminHandle: string;
  onShowToast: (msg: string) => void;
}

export const SelectionDrawer: React.FC<SelectionDrawerProps> = ({
  isOpen,
  onClose,
  selectedGames,
  onRemoveGame,
  onClearAll,
  adminHandle,
  onShowToast,
}) => {
  const [customerNote, setCustomerNote] = useState('');
  const [customHandle, setCustomHandle] = useState(adminHandle);

  if (!isOpen) return null;

  const handleCopyAdmin = () => {
    navigator.clipboard.writeText(customHandle || adminHandle);
    onShowToast(`Copied ${customHandle || adminHandle} to clipboard!`);
  };

  const generateTelegramMessage = () => {
    let text = `🎮 *KANI GAME - REQUEST GAMES*\n\n`;
    text += `ជម្រាបសួរ Admin, ខ្ញុំចង់បាន Game ចំនួន (${selectedGames.length}) ដូចខាងក្រោម៖\n\n`;

    selectedGames.forEach((game, index) => {
      text += `${index + 1}. 🌟 ${game.name} (${game.tag})\n`;
    });

    if (customerNote.trim()) {
      text += `\n👤 *ព័ត៌មានបន្ថែម*: ${customerNote.trim()}\n`;
    }

    text += `\nសូមអរគុណ! 🙏`;
    return text;
  };

  const handleSendTelegram = () => {
    if (selectedGames.length === 0) {
      onShowToast('សូមជ្រើសរើស Game យ៉ាងហោចណាស់ 1 ដំបូង!');
      return;
    }

    const message = generateTelegramMessage();
    const encodedText = encodeURIComponent(message);
    const cleanHandle = (customHandle || adminHandle).replace('@', '').trim();

    // Primary: Direct share link
    const telegramShareUrl = `https://t.me/share/url?url=https://kanigame.com&text=${encodedText}`;
    
    // Also copy to clipboard so user has it immediately
    try {
      navigator.clipboard.writeText(message);
    } catch {}

    window.open(telegramShareUrl, '_blank');
    onShowToast(`កំពុងបញ្ជូនទៅកាន់ Telegram (${cleanHandle})...`);
  };

  const handleCopyOrderSummary = () => {
    const message = generateTelegramMessage();
    navigator.clipboard.writeText(message);
    onShowToast('បានចម្លងបញ្ជី Game (Copied Order Summary)!');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#0f172a] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between p-4 border-b border-purple-900/40 bg-[#131b2e]">
          <div className="flex items-center gap-2.5">
            <i className="fa-brands fa-telegram text-cyan-400 text-2xl"></i>
            <div>
              <h3 className="font-orbitron font-bold text-base text-white">
                បញ្ជី Game ដែលបានជ្រើសរើស
              </h3>
              <p className="text-xs text-gray-400">Send Selected Games to Telegram</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center transition"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Selected Items List */}
        <div className="p-4 max-h-64 overflow-y-auto space-y-2 border-b border-purple-900/30">
          {selectedGames.length === 0 ? (
            <div className="text-center py-8">
              <i className="fa-solid fa-gamepad text-3xl text-gray-600 mb-2"></i>
              <p className="text-xs text-gray-400">មិនទាន់មាន Game ត្រូវបានជ្រើសរើសនៅឡើយទេ</p>
            </div>
          ) : (
            selectedGames.map((game, index) => (
              <div
                key={game.id}
                className="flex items-center justify-between bg-[#131b2e] p-2.5 rounded-xl border border-purple-900/30 text-xs hover:border-purple-500/30 transition"
              >
                <div className="flex items-center gap-2.5 truncate flex-1 min-w-0 pr-2">
                  <span className="font-bold text-purple-400 font-mono w-5">
                    {index + 1}.
                  </span>
                  <img
                    src={game.img}
                    alt={game.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://placehold.co/100x100/131b2e/ffffff?text=Game';
                    }}
                    className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="truncate">
                    <p className="font-bold text-gray-200 truncate">{game.name}</p>
                    <span className="text-[10px] text-gray-400">{game.tag}</span>
                  </div>
                </div>

                <button
                  onClick={() => onRemoveGame(game.id)}
                  className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-950/30 transition flex-shrink-0"
                  title="Remove"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Form Inputs & Direct Telegram Action */}
        <div className="p-4 bg-[#0d1322] space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              ឈ្មោះ ឬ លេខទូរស័ព្ទ / Telegram Username (Optional):
            </label>
            <input
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="ឧទាហរណ៍: Sokha - 012 345 678"
              className="w-full bg-[#131b2e] text-xs text-gray-200 placeholder-gray-500 rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Telegram Admin Account:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customHandle}
                onChange={(e) => setCustomHandle(e.target.value)}
                className="w-full bg-[#131b2e] text-xs text-cyan-300 font-mono rounded-xl px-3.5 py-2 border border-purple-900/50 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyAdmin}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-gray-200 rounded-xl border border-slate-700 transition"
                title="Copy Handle"
              >
                <i className="fa-solid fa-copy"></i>
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={handleSendTelegram}
              disabled={selectedGames.length === 0}
              className={`w-full py-3 px-4 rounded-xl font-orbitron font-bold text-xs sm:text-sm text-center text-white transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                selectedGames.length > 0
                  ? 'bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-cyan-950/50'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              <i className="fa-brands fa-telegram text-lg"></i>
              <span>ផ្ញើទៅ Telegram ឥឡូវនេះ ({selectedGames.length})</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyOrderSummary}
                disabled={selectedGames.length === 0}
                className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-gray-300 rounded-xl text-xs font-semibold border border-slate-700 transition flex items-center justify-center gap-1.5"
              >
                <i className="fa-solid fa-clipboard text-purple-400"></i>
                <span>ចម្លងសារ (Copy Text)</span>
              </button>

              {selectedGames.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="py-2 px-3 bg-red-950/40 hover:bg-red-900/60 text-red-300 rounded-xl text-xs font-semibold border border-red-800/40 transition flex items-center gap-1"
                >
                  <i className="fa-solid fa-trash-can"></i>
                  <span>លុបទាំងអស់</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
