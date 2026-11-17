import React, { useEffect, useState } from 'react';

export interface SteamSyncFeedItem {
  appId: number;
  name: string;
  genre: string;
  img: string;
  steamPriceUsd: number;
  releaseDate?: string;
  steamUrl?: string;
  status: 'added' | 'exists' | 'skipped';
}

export interface SteamSyncModalState {
  isOpen: boolean;
  isLoading: boolean;
  addedCount: number;
  feedGames: SteamSyncFeedItem[];
  error?: string;
}

interface SteamOnlineSyncModalProps {
  state: SteamSyncModalState;
  onClose: () => void;
  onUploadGames?: (items: SteamSyncFeedItem[]) => void;
}

export const SteamOnlineSyncModal: React.FC<SteamOnlineSyncModalProps> = ({
  state,
  onClose,
  onUploadGames,
}) => {
  const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!state.isOpen || state.isLoading) {
      setSelectedAppIds(new Set());
      return;
    }
    const skipped = state.feedGames.filter((g) => g.status === 'skipped').map((g) => g.appId);
    if (skipped.length > 0) {
      setSelectedAppIds(new Set(skipped));
    } else {
      setSelectedAppIds(new Set());
    }
  }, [state.isOpen, state.isLoading, state.feedGames]);

  if (!state.isOpen) return null;

  const addedItems = state.feedGames.filter((g) => g.status === 'added');
  const existingItems = state.feedGames.filter((g) => g.status === 'exists');
  const skippedItems = state.feedGames.filter((g) => g.status === 'skipped');

  const allSelected =
    state.feedGames.length > 0 && selectedAppIds.size === state.feedGames.length;

  const toggleSelect = (appId: number) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedAppIds(new Set());
    } else {
      setSelectedAppIds(new Set(state.feedGames.map((g) => g.appId)));
    }
  };

  const selectedItems = state.feedGames.filter((g) => selectedAppIds.has(g.appId));
  const bulkTargets =
    selectedItems.length > 0
      ? selectedItems
      : skippedItems.length > 0
      ? skippedItems
      : state.feedGames;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#0d1424] border border-emerald-500/45 rounded-2xl shadow-2xl shadow-emerald-950/50 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-[#0f1c2e] to-[#0b1623] border-b border-emerald-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0">
              <i
                className={`fa-brands fa-steam text-xl ${
                  state.isLoading ? 'fa-spin' : ''
                }`}
              ></i>
            </div>
            <div className="min-w-0">
              <h3 className="font-orbitron font-bold text-sm sm:text-base text-white truncate">
                STEAM ONLINE UPDATE ($20+ PAID)
              </h3>
              <p className="text-[11px] text-gray-400 truncate">
                Source: store.steampowered.com • Upload to Front Store Category &quot;Steam Online&quot;
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {state.isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-300 text-2xl">
                <i className="fa-solid fa-spinner fa-spin"></i>
              </div>
              <h4 className="font-bold text-base text-white">
                កំពុងទាញយក Game ថ្មីៗតម្លៃ $20+ ពី Steam...
              </h4>
              <p className="text-xs text-gray-400 max-w-md">
                Checking latest paid releases ($20.00+ USD, last 1 year) directly from https://store.steampowered.com/
              </p>
            </div>
          ) : state.error ? (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-sm text-rose-300">
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>Steam Update Error</span>
              </div>
              <p className="font-mono text-[11px] break-words">{state.error}</p>
            </div>
          ) : (
            <>
              {/* Summary Bar */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/35">
                  <div className="text-[10px] font-mono uppercase text-emerald-300/80">
                    New Uploaded
                  </div>
                  <div className="font-orbitron font-bold text-lg text-emerald-300">
                    +{state.addedCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30">
                  <div className="text-[10px] font-mono uppercase text-cyan-300/80">
                    In Steam Online
                  </div>
                  <div className="font-orbitron font-bold text-lg text-cyan-300">
                    {existingItems.length + addedItems.length}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/70">
                  <div className="text-[10px] font-mono uppercase text-gray-400">
                    Synced ($20+)
                  </div>
                  <div className="font-orbitron font-bold text-lg text-white">
                    {state.feedGames.length}
                  </div>
                </div>
              </div>

              {addedItems.length > 0 ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs font-medium flex items-center gap-2">
                  <i className="fa-solid fa-circle-check text-emerald-400"></i>
                  <span>
                    បាន Upload Game ចំនួន {addedItems.length} ចូល Category &quot;Steam Online&quot; នៅលើ Front Store រួចរាល់!
                  </span>
                </div>
              ) : (
                <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-cyan-200 text-xs font-medium flex items-center gap-2">
                  <i className="fa-solid fa-check-double text-cyan-400"></i>
                  <span>
                    {skippedItems.length > 0
                      ? `មាន ${skippedItems.length} Game ដែលធ្លាប់លុប — ចុចប៊ូតុង Upload ដើម្បីដាក់ចូល Steam Online Front Store វិញ!`
                      : 'Game ថ្មីៗតម្លៃ $20+ ពី Steam ត្រូវបាន Upload ចូល Steam Online Front Store រួចរាល់!'}
                  </span>
                </div>
              )}

              {/* Selection & Bulk Upload Toolbar */}
              {state.feedGames.length > 0 && onUploadGames && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#11192c] border border-emerald-900/40">
                  <label className="flex items-center gap-2 text-xs text-gray-200 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                    />
                    <span>
                      Select All ({selectedAppIds.size}/{state.feedGames.length})
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => onUploadGames(bulkTargets)}
                    className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
                  >
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <span>
                      {selectedItems.length > 0
                        ? `Upload Selected to Steam Online (${selectedItems.length})`
                        : skippedItems.length > 0
                        ? `Upload Skipped to Steam Online (${skippedItems.length})`
                        : `Upload All to Steam Online (${state.feedGames.length})`}
                    </span>
                  </button>
                </div>
              )}

              {/* Games List */}
              {state.feedGames.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  No qualifying $20+ paid games returned in this check.
                </div>
              ) : (
                <div className="space-y-2">
                  {state.feedGames.map((item) => {
                    const isChecked = selectedAppIds.has(item.appId);
                    const needsUpload = item.status === 'skipped';
                    return (
                      <div
                        key={item.appId}
                        className={`flex items-center gap-3 p-2.5 rounded-xl bg-[#131b2e]/90 border transition ${
                          isChecked
                            ? 'border-emerald-500/60 bg-emerald-950/20'
                            : 'border-slate-800 hover:border-emerald-500/40'
                        }`}
                      >
                        {onUploadGames && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelect(item.appId)}
                            className="w-4 h-4 rounded accent-emerald-500 cursor-pointer shrink-0"
                            aria-label={`Select ${item.name}`}
                          />
                        )}
                        <img
                          src={item.img}
                          alt={item.name}
                          className="w-12 h-16 object-cover rounded-lg bg-slate-900 border border-slate-700 shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={item.steamUrl || `https://store.steampowered.com/app/${item.appId}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-xs sm:text-sm text-white hover:text-emerald-300 truncate transition"
                            >
                              {item.name}
                            </a>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-400">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-gray-300">
                              {item.genre}
                            </span>
                            {item.releaseDate && (
                              <span className="font-mono text-gray-400">
                                <i className="fa-regular fa-calendar mr-1 text-[10px]"></i>
                                {item.releaseDate}
                              </span>
                            )}
                            <span className="font-mono font-bold text-emerald-300">
                              ${item.steamPriceUsd.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {item.status === 'added' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600/90 text-white">
                              UPLOADED ✓
                            </span>
                          ) : item.status === 'exists' ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/30">
                              IN FRONT STORE
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-500/30">
                              NOT UPLOADED
                            </span>
                          )}

                          {onUploadGames && (
                            <button
                              type="button"
                              onClick={() => onUploadGames([item])}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                                needsUpload
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                                  : 'bg-slate-800 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-500/30'
                              }`}
                              title="Upload this game to Steam Online category on Front Store"
                            >
                              <i className="fa-solid fa-cloud-arrow-up text-[10px]"></i>
                              <span>{needsUpload ? 'Upload' : 'Sync / Upload'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0b111e] border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-gray-400">
            Filter: Paid $20.00+ USD • Released within 1 Year
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {onUploadGames && !state.isLoading && state.feedGames.length > 0 && (
              <button
                type="button"
                onClick={() => onUploadGames(bulkTargets)}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
              >
                <i className="fa-solid fa-cloud-arrow-up"></i>
                <span>
                  {selectedItems.length > 0
                    ? `Upload (${selectedItems.length}) to Steam Online`
                    : 'Upload All to Steam Online'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
