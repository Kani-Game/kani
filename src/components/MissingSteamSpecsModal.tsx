import React, { useEffect, useMemo, useState } from 'react';
import { Game } from '../types/game';
import { extractSteamAppId, fetchSteamSpec } from '../services/steamService';
import { StorageService } from '../services/storageService';

interface MissingSteamSpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
  games: Game[];
  onUpdateGame: (game: Game) => void;
  onEditGame: (game: Game) => void;
  onFilterCatalogMissing: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  syncProgress: { done: number; total: number; saved: number } | null;
  setSyncProgress: React.Dispatch<
    React.SetStateAction<{ done: number; total: number; saved: number } | null>
  >;
}

type RowSyncState = {
  status: 'idle' | 'syncing' | 'synced' | 'error' | 'skipped';
  message?: string;
};

const isGameMissingSpec = (g: Game) =>
  !g.tag.toLowerCase().includes('product') && !g.skipSteamLink && !g.steamSpec;

export const MissingSteamSpecsModal: React.FC<MissingSteamSpecsModalProps> = ({
  isOpen,
  onClose,
  games,
  onUpdateGame,
  onEditGame,
  onFilterCatalogMissing,
  onShowToast,
  syncProgress,
  setSyncProgress,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'steam-offline' | 'steam-online' | 'external'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'failed'>('all');
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowSyncState>>({});
  const [customLinks, setCustomLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const initialMissingIds = games.filter(isGameMissingSpec).map((g) => g.id);
    setTrackedIds(initialMissingIds);
    setRowStates({});
    setCustomLinks({});
    setSearchQuery('');
    setCategoryFilter('all');
    setStatusFilter('all');
    // Intentionally snapshot trackedIds only when opening modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const missingNow = useMemo(() => games.filter(isGameMissingSpec), [games]);

  const modalGames = useMemo(() => {
    const trackedSet = new Set(trackedIds);
    const missingIdSet = new Set(missingNow.map((g) => g.id));
    return games.filter((g) => missingIdSet.has(g.id) || trackedSet.has(g.id));
  }, [games, missingNow, trackedIds]);

  const filteredModalGames = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return modalGames.filter((g) => {
      if (q && !g.name.toLowerCase().includes(q) && !g.genre.toLowerCase().includes(q)) {
        return false;
      }
      const lowerTag = g.tag.toLowerCase();
      if (categoryFilter === 'steam-offline' && !(lowerTag.includes('steam') && !lowerTag.includes('online'))) {
        return false;
      }
      if (categoryFilter === 'steam-online' && !(lowerTag.includes('steam') && lowerTag.includes('online'))) {
        return false;
      }
      if (categoryFilter === 'external' && (lowerTag.includes('steam') || lowerTag.includes('product'))) {
        return false;
      }
      if (statusFilter === 'missing' && !isGameMissingSpec(g)) {
        return false;
      }
      if (statusFilter === 'failed' && rowStates[g.id]?.status !== 'error') {
        return false;
      }
      return true;
    });
  }, [modalGames, searchQuery, categoryFilter, statusFilter, rowStates]);

  if (!isOpen) return null;

  const syncSingleGame = async (target: Game, customLinkOverride?: string) => {
    const rawLink = (customLinkOverride ?? customLinks[target.id] ?? target.link ?? '').trim();
    const detectedAppId = extractSteamAppId(rawLink);

    setRowStates((prev) => ({
      ...prev,
      [target.id]: { status: 'syncing', message: 'Searching Steam...' },
    }));

    try {
      const spec = await fetchSteamSpec(
        detectedAppId
          ? { link: rawLink, forceRefresh: true }
          : { name: target.name, link: rawLink || undefined }
      );
      const latestTarget = StorageService.getGames().find((g) => g.id === target.id) || target;
      const resolvedGenre =
        spec.primaryGenre && spec.primaryGenre !== 'Steam Game'
          ? spec.primaryGenre
          : spec.genres?.[0] || latestTarget.genre;
      onUpdateGame({
        ...latestTarget,
        link: latestTarget.link || spec.steamUrl,
        steamAppId: latestTarget.steamAppId || spec.appId,
        genre: resolvedGenre || latestTarget.genre,
        skipSteamLink: false,
        steamSpec: spec,
      });
      setRowStates((prev) => ({
        ...prev,
        [target.id]: {
          status: 'synced',
          message: `Synced "${spec.matchedName}" • ${resolvedGenre || 'Steam Game'} (App ID: ${spec.appId})`,
        },
      }));
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not find matching game on Steam Store.';
      setRowStates((prev) => ({
        ...prev,
        [target.id]: { status: 'error', message: msg },
      }));
      return false;
    }
  };

  const handleSyncAllMissing = async () => {
    const targets = missingNow;
    if (targets.length === 0) {
      onShowToast('All Steam-enabled games already have PC Specs saved in Website DB!');
      return;
    }

    let done = 0;
    let saved = 0;
    setSyncProgress({ done: 0, total: targets.length, saved: 0 });
    const concurrency = 3;

    for (let i = 0; i < targets.length; i += concurrency) {
      const batch = targets.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (target) => {
          const ok = await syncSingleGame(target);
          if (ok) saved++;
          done++;
          setSyncProgress({ done, total: targets.length, saved });
        })
      );
    }

    setSyncProgress(null);
    const failedCount = targets.length - saved;
    if (failedCount > 0) {
      onShowToast(
        `Synced ${saved}/${targets.length} games. ${failedCount} failed — check the red rows to paste a Steam link or Skip.`,
        'info'
      );
    } else {
      onShowToast(`🎉 Synced & saved Steam PC Specs for all ${saved} games!`, 'success');
    }
  };

  const handleSkipGame = (target: Game) => {
    const latestTarget = StorageService.getGames().find((g) => g.id === target.id) || target;
    onUpdateGame({
      ...latestTarget,
      skipSteamLink: true,
    });
    setRowStates((prev) => ({
      ...prev,
      [target.id]: { status: 'skipped', message: 'Marked as Not Linked to Steam' },
    }));
  };

  const failedCount = Object.values(rowStates).filter((r) => r.status === 'error').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#0d1424] border border-cyan-500/45 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-r from-[#0f1c2e] to-[#0b1623] border-b border-cyan-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/90 border border-cyan-500/40 text-cyan-300 flex items-center justify-center shrink-0">
              <i
                className={`fa-solid ${
                  syncProgress ? 'fa-spinner fa-spin' : 'fa-microchip'
                } text-lg`}
              ></i>
            </div>
            <div className="min-w-0">
              <h3 className="font-orbitron font-bold text-sm sm:text-base text-white truncate">
                MISSING STEAM SPECS ({missingNow.length})
              </h3>
              <p className="text-[11px] text-gray-400 truncate">
                ហ្គេមដែលមិនទាន់ Sync Steam PC Specs — ស្វែងរក បិទភ្ជាប់ Steam Link ឬចុច Sync ទាំងអស់
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

        {/* Toolbar */}
        <div className="px-5 py-3 bg-[#101829] border-b border-slate-800/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search missing games..."
                className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-lg px-3 py-2 pl-8 border border-cyan-900/50 outline-none focus:border-cyan-400"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-400 text-xs"></i>
            </div>

            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(
                  e.target.value as 'all' | 'steam-offline' | 'steam-online' | 'external'
                )
              }
              className="bg-[#131b2e] text-xs text-gray-300 rounded-lg px-2.5 py-2 border border-slate-700 outline-none"
            >
              <option value="all">All Categories</option>
              <option value="steam-offline">Steam Offline</option>
              <option value="steam-online">Steam Online</option>
              <option value="external">Gameថែមពេលទិញ External</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'missing' | 'failed')}
              className="bg-[#131b2e] text-xs text-gray-300 rounded-lg px-2.5 py-2 border border-slate-700 outline-none"
            >
              <option value="all">All ({modalGames.length})</option>
              <option value="missing">Still Missing ({missingNow.length})</option>
              {failedCount > 0 && <option value="failed">Failed ({failedCount})</option>}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onFilterCatalogMissing}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-600 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Filter the main Catalog table to show only games missing Steam Specs"
            >
              <i className="fa-solid fa-filter text-cyan-300"></i>
              <span>Show in Table</span>
            </button>

            <button
              type="button"
              disabled={syncProgress !== null || missingNow.length === 0}
              onClick={() => void handleSyncAllMissing()}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer"
            >
              <i
                className={`fa-solid ${
                  syncProgress ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'
                }`}
              ></i>
              <span>
                {syncProgress
                  ? `Syncing ${syncProgress.done}/${syncProgress.total} (Saved: ${syncProgress.saved})...`
                  : `Sync All Missing (${missingNow.length})`}
              </span>
            </button>
          </div>
        </div>

        {/* List Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2.5">
          {filteredModalGames.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xl">
                <i className="fa-solid fa-circle-check"></i>
              </div>
              <p className="text-sm font-semibold text-white">
                {missingNow.length === 0
                  ? 'All Steam-enabled games have Steam PC Specs saved!'
                  : 'No missing games match this filter.'}
              </p>
            </div>
          ) : (
            filteredModalGames.map((game) => {
              const rowState = rowStates[game.id];
              const isStillMissing = isGameMissingSpec(game);
              const isSyncingRow = rowState?.status === 'syncing';
              const customLink = customLinks[game.id] ?? '';

              return (
                <div
                  key={game.id}
                  className={`p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                    rowState?.status === 'synced' || !isStillMissing
                      ? rowState?.status === 'skipped'
                        ? 'bg-slate-900/60 border-slate-700/70'
                        : 'bg-emerald-950/25 border-emerald-500/40'
                      : rowState?.status === 'error'
                      ? 'bg-rose-950/25 border-rose-500/45'
                      : 'bg-[#131b2e]/90 border-slate-800 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <img
                      src={game.img}
                      alt={game.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://placehold.co/100x140/131b2e/ffffff?text=Cover';
                      }}
                      className="w-11 h-14 object-cover rounded-lg border border-slate-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm text-white break-words">
                          {game.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-gray-300 border border-slate-700">
                          {game.tag}
                        </span>
                        {!isStillMissing && game.steamSpec ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-600/90 text-white">
                            Synced ✓
                          </span>
                        ) : rowState?.status === 'skipped' || game.skipSteamLink ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-700 text-gray-200">
                            Skipped
                          </span>
                        ) : rowState?.status === 'error' ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-900/80 text-rose-200 border border-rose-500/40">
                            Failed
                          </span>
                        ) : isSyncingRow ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-900/80 text-cyan-200">
                            Syncing...
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/35">
                            No Spec
                          </span>
                        )}
                      </div>

                      {rowState?.message && (
                        <p
                          className={`text-[11px] leading-snug ${
                            rowState.status === 'error'
                              ? 'text-rose-300'
                              : rowState.status === 'synced'
                              ? 'text-emerald-300'
                              : 'text-cyan-300'
                          }`}
                        >
                          {rowState.message}
                        </p>
                      )}

                      {isStillMissing && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            type="text"
                            value={customLink}
                            onChange={(e) =>
                              setCustomLinks((prev) => ({
                                ...prev,
                                [game.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional: paste Steam URL or App ID to match exact game..."
                            className="flex-1 min-w-0 bg-[#0b1120] text-[11px] text-gray-200 rounded-lg px-2.5 py-1.5 border border-slate-700 focus:border-cyan-400 outline-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                    {isStillMissing && (
                      <>
                        <button
                          type="button"
                          disabled={isSyncingRow || syncProgress !== null}
                          onClick={() => void syncSingleGame(game)}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-900/70 hover:bg-cyan-700 disabled:opacity-50 text-cyan-100 border border-cyan-500/40 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Try syncing PC Specs from Steam Store"
                        >
                          <i
                            className={`fa-solid ${
                              isSyncingRow ? 'fa-spinner fa-spin' : 'fa-rotate'
                            } text-[10px]`}
                          ></i>
                          <span>{customLink.trim() ? 'Sync Link' : 'Sync'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSyncingRow}
                          onClick={() => {
                            onEditGame(game);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-purple-950/70 hover:bg-purple-800/80 text-purple-200 border border-purple-500/35 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                          title="Edit game title or Steam link"
                        >
                          <i className="fa-solid fa-pen-to-square text-[10px]"></i>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          disabled={isSyncingRow}
                          onClick={() => handleSkipGame(game)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-600 text-[11px] font-semibold transition cursor-pointer"
                          title="Mark as Not Linked to Steam (hide from missing list)"
                        >
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0b111e] border-t border-slate-800 flex items-center justify-between gap-2 text-[11px] text-gray-400">
          <span>
            Tip: ហ្គេមខ្លះឈ្មោះមានពាក្យ [Repack] ឬឈ្មោះខ្លី (ដូចជា RE_R) ទើបរកលើ Steam មិនឃើញ — បិទភ្ជាប់ Steam URL ឬចុច Skip។
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
