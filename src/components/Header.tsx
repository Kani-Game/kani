import React from 'react';
import { GameTab } from '../types/game';

interface HeaderProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onClearSearch: () => void;
  steamCount: number;
  freeCount: number;
  productCount?: number;
  isAdminView: boolean;
  onToggleAdminView: () => void;
  isPosView: boolean;
  onTogglePosView: () => void;
  isLoggedIn: boolean;
  onOpenLogin: (target?: 'admin' | 'pos') => void;
  onLogout?: () => void;
  onSecretAdminTrigger?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  searchTerm,
  onSearchChange,
  onClearSearch,
  steamCount,
  freeCount,
  productCount = 0,
  isAdminView,
  onToggleAdminView,
  isPosView,
  onTogglePosView,
  isLoggedIn,
  onOpenLogin,
  onLogout,
  onSecretAdminTrigger,
}) => {
  const [logoTapCount, setLogoTapCount] = React.useState(0);
  const logoTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleLogoTap = () => {
    setLogoTapCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        if (logoTimerRef.current) clearTimeout(logoTimerRef.current);
        onSecretAdminTrigger?.();
        return 0;
      }
      return next;
    });

    if (logoTimerRef.current) clearTimeout(logoTimerRef.current);
    logoTimerRef.current = setTimeout(() => {
      setLogoTapCount(0);
    }, 2500);

    if (isAdminView) onToggleAdminView();
    if (isPosView) onTogglePosView();
    onTabChange('steam');
    onClearSearch();
  };

  const handlePosClick = () => {
    if (!isLoggedIn) {
      onOpenLogin('pos');
    } else {
      if (!isPosView) onTogglePosView();
    }
  };

  const handleAdminClick = () => {
    if (!isLoggedIn) {
      onOpenLogin('admin');
    } else {
      if (!isAdminView) onToggleAdminView();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0d1322]/95 backdrop-blur-md border-b border-[#1f293d]/80 transition-all">
      <div className="w-full max-w-[3600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Brand Logo - 5 Taps unlocks Secret Admin/POS login for Owner */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none group"
            onClick={handleLogoTap}
            title="KANI GAME"
          >
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-0.5 shadow-neon-purple group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-[#0d1322] rounded-[10px] flex items-center justify-center">
                <i className="fa-solid font-bold text-2xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 fa-gamepad"></i>
              </div>
            </div>
            <div>
              <h1 className="font-orbitron font-extrabold text-2xl sm:text-3xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 glow-title">
                KANI <span className="text-cyan-400">GAME</span>
              </h1>
              <p className="text-[10px] font-rajdhani uppercase tracking-widest text-purple-400/80 -mt-1 font-semibold">
                Ultimate Gaming Portal
              </p>
            </div>
          </div>

          {/* Search Bar (Desktop & Tablet) - Only in Store View */}
          {!isAdminView && !isPosView ? (
            <div className="hidden md:flex flex-1 max-w-md lg:max-w-xl 2xl:max-w-2xl mx-4">
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="ស្វែងរក Game 100+ (ឧទាហរណ៍: Sekiro, RE4, GTA V...)"
                  className="w-full bg-[#131b2e]/90 text-sm text-gray-200 placeholder-gray-400 rounded-xl px-4 py-2.5 pl-11 pr-10 border border-purple-500/20 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 outline-none transition-all shadow-inner"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-purple-400 text-sm"></i>
                {searchTerm && (
                  <button
                    onClick={onClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <i className="fa-solid fa-xmark text-xs bg-purple-900/60 p-1 rounded-full"></i>
                  </button>
                )}
              </div>
            </div>
          ) : isPosView ? (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
              <i className="fa-solid fa-cash-register text-cyan-400"></i>
              <span>Active POS Cashier Terminal Mode</span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-semibold">
              <i className="fa-solid fa-shield-halved text-purple-400"></i>
              <span>Secure Admin Control Panel</span>
            </div>
          )}

          {/* Actions & Tab Switchers */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Store & POS Navigation Tabs (Desktop) */}
            {!isAdminView && !isPosView && (
              <nav className="hidden lg:flex items-center space-x-2 bg-[#131b2e] p-1.5 rounded-xl border border-purple-900/40">
                <a
                  href="#steam"
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      onTabChange('steam');
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-rajdhani font-bold text-xs tracking-wider transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'steam'
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-900/40'
                      : 'text-gray-400 hover:text-white hover:bg-purple-900/20'
                  }`}
                  title="Steam Offline Games"
                >
                  <i className="fa-brands fa-steam text-base"></i>
                  <span>STEAM OFFLINE</span>
                  <span className="ml-1 text-[10px] bg-purple-950/80 text-purple-300 px-1.5 py-0.2 rounded-full border border-purple-500/30">
                    {steamCount}
                  </span>
                </a>

                <a
                  href="#product"
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      onTabChange('product');
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-rajdhani font-bold text-xs tracking-wider transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'product'
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-lg shadow-sky-900/40'
                      : 'text-gray-400 hover:text-white hover:bg-sky-900/20'
                  }`}
                  title="Physical & Gaming Products"
                >
                  <i className="fa-solid fa-box-open text-sky-400 text-xs"></i>
                  <span>PRODUCT</span>
                  <span className="ml-1 text-[10px] bg-sky-950/80 text-sky-300 px-1.5 py-0.2 rounded-full border border-sky-500/30">
                    {productCount}
                  </span>
                </a>

                <a
                  href="#external"
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                      e.preventDefault();
                      onTabChange('free');
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg font-rajdhani font-bold text-xs tracking-wider transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'free'
                      ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-900/40'
                      : 'text-gray-400 hover:text-white hover:bg-cyan-900/20'
                  }`}
                  title="Gameថែមពេលទិញ External"
                >
                  <i className="fa-solid fa-gift text-cyan-400 text-xs"></i>
                  <span>GameថែមExternal</span>
                  <span className="ml-1 text-[10px] bg-cyan-950/80 text-cyan-300 px-1.5 py-0.2 rounded-full border border-cyan-500/30">
                    {freeCount}
                  </span>
                </a>

                {/* POS Cashier Button (Only shown when admin/owner is logged in) */}
                {isLoggedIn && (
                  <button
                    type="button"
                    onClick={handlePosClick}
                    className="px-3.5 py-1.5 rounded-lg font-orbitron font-bold text-xs tracking-wider transition-all duration-300 flex items-center gap-1.5 cursor-pointer text-cyan-400 hover:text-white hover:bg-cyan-900/30 border border-cyan-500/30"
                    title="Open POS Cashier Terminal"
                  >
                    <i className="fa-solid fa-cash-register text-xs"></i>
                    <span>POS</span>
                  </button>
                )}
              </nav>
            )}

            {/* Direct Switcher when in POS or Admin */}
            {isPosView ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onTogglePosView}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-orbitron font-bold bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 transition cursor-pointer"
                  title="Return to Storefront Catalog"
                >
                  <i className="fa-solid fa-store text-purple-400"></i>
                  <span className="hidden xs:inline">STOREFRONT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onTogglePosView();
                    onToggleAdminView();
                  }}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-orbitron font-bold bg-[#131b2e] hover:bg-purple-900/40 text-purple-300 border border-purple-500/40 transition cursor-pointer"
                  title="Switch to Admin Dashboard"
                >
                  <i className="fa-solid fa-gauge-high text-xs text-purple-400"></i>
                  <span className="hidden sm:inline">ADMIN DASHBOARD</span>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="p-2 sm:px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-semibold transition cursor-pointer"
                    title="Logout"
                  >
                    <i className="fa-solid fa-right-from-bracket"></i>
                  </button>
                )}
              </div>
            ) : isAdminView ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleAdminView}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-orbitron font-bold bg-slate-800 hover:bg-slate-700 text-gray-200 border border-slate-700 transition cursor-pointer"
                  title="Return to Storefront"
                >
                  <i className="fa-solid fa-store text-purple-400"></i>
                  <span className="hidden xs:inline">STOREFRONT</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleAdminView();
                    onTogglePosView();
                  }}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-orbitron font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/50 shadow-neon-cyan transition cursor-pointer"
                  title="Launch POS Terminal"
                >
                  <i className="fa-solid fa-cash-register text-xs"></i>
                  <span>OPEN POS</span>
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="p-2 sm:px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-semibold transition cursor-pointer"
                    title="Logout"
                  >
                    <i className="fa-solid fa-right-from-bracket"></i>
                  </button>
                )}
              </div>
            ) : (
              /* Public / Logged In Storefront Actions */
              <div className="flex items-center gap-2">
                {isLoggedIn && (
                  <>
                    {/* Mobile POS quick button */}
                    <button
                      type="button"
                      onClick={handlePosClick}
                      className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-orbitron font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/40 shadow-sm cursor-pointer"
                      title="Open POS Terminal"
                    >
                      <i className="fa-solid fa-cash-register text-xs"></i>
                      <span>POS</span>
                    </button>

                    {/* Admin button */}
                    <button
                      type="button"
                      onClick={handleAdminClick}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-rajdhani font-bold bg-purple-950/60 border border-purple-400/60 text-purple-200 hover:bg-purple-900/60 transition-all shadow-md cursor-pointer group"
                      title="Open Admin Dashboard"
                    >
                      <i className="fa-solid fa-user-shield text-purple-300 text-xs"></i>
                      <span>Admin Panel</span>
                    </button>

                    {onLogout && (
                      <button
                        type="button"
                        onClick={onLogout}
                        className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs transition cursor-pointer"
                        title="Logout"
                      >
                        <i className="fa-solid fa-arrow-right-from-bracket"></i>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Bar - Only in Store View */}
        {!isAdminView && !isPosView && (
          <div className="md:hidden pb-3 pt-1">
            <div className="relative w-full">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ស្វែងរក Game 100+..."
                className="w-full bg-[#131b2e] text-sm text-gray-200 placeholder-gray-400 rounded-xl px-4 py-2.5 pl-10 pr-9 border border-purple-500/30 outline-none"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs"></i>
              {searchTerm && (
                <button
                  onClick={onClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <i className="fa-solid fa-xmark text-xs bg-purple-900/60 p-1 rounded-full"></i>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mobile Tab Switcher - Only in Store View */}
        {!isAdminView && !isPosView && (
          <div className="sm:hidden flex border-t border-[#1f293d]/50 py-2.5 gap-2">
            <a
              href="#steam"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('steam');
                }
              }}
              className={`flex-1 py-2 rounded-lg font-rajdhani font-bold text-xs tracking-wider text-center flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'steam'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-[#131b2e] text-gray-400'
              }`}
            >
              <i className="fa-brands fa-steam"></i> STEAM ({steamCount})
            </a>
            <a
              href="#product"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('product');
                }
              }}
              className={`flex-1 py-2 rounded-lg font-rajdhani font-bold text-xs tracking-wider text-center flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'product'
                  ? 'bg-sky-600 text-white shadow-md'
                  : 'bg-[#131b2e] text-gray-400'
              }`}
            >
              <i className="fa-solid fa-box-open"></i> Product ({productCount})
            </a>
            <a
              href="#external"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('free');
                }
              }}
              className={`flex-1 py-2 rounded-lg font-rajdhani font-bold text-xs tracking-wider text-center flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'free'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'bg-[#131b2e] text-gray-400'
              }`}
            >
              <i className="fa-solid fa-gift"></i> External ({freeCount})
            </a>
            {isLoggedIn && (
              <button
                type="button"
                onClick={handlePosClick}
                className="py-2 px-3 rounded-lg font-orbitron font-bold text-xs bg-gradient-to-r from-cyan-600 to-blue-600 text-white flex items-center justify-center gap-1 shadow cursor-pointer"
                title="Open POS Cashier"
              >
                <i className="fa-solid fa-cash-register"></i> POS
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

