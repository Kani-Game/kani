import React from 'react';
import { GameTab } from '../types/game';

interface HeaderProps {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
  onClearSearch?: () => void;
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

    onTabChange('steam');
    onClearSearch?.();
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
        <div className="relative flex items-center justify-between h-20 gap-4">
          {/* Brand Logo - 5 Taps unlocks Secret Admin/POS login for Owner */}
          <div
            className="flex items-center gap-3 cursor-pointer select-none group shrink-0"
            onClick={handleLogoTap}
            title="KANI GAME"
          >
            <div className="relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-cyan-400 p-0.5 shadow-neon-purple group-hover:scale-105 transition-transform shrink-0">
              <div className="w-full h-full bg-[#070617] rounded-[10px] overflow-hidden flex items-center justify-center">
                <img
                  src="/assets/aistudio/Untitled-1_184ce278.jpg"
                  alt="KANI GAME Logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div>
              <h1 className="font-orbitron font-extrabold text-xl sm:text-2xl lg:text-3xl tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400 glow-title whitespace-nowrap">
                KANI <span className="text-cyan-400">GAME</span>
              </h1>
              <p className="text-[10px] font-rajdhani uppercase tracking-widest text-purple-400/80 -mt-1 font-semibold whitespace-nowrap">
                Ultimate Gaming Portal
              </p>
            </div>
          </div>

          {/* Center Category Navigation Tabs (Desktop & Tablet) - Storefront View */}
          {!isAdminView && !isPosView ? (
            <nav
              aria-label="Catalog Categories"
              className="hidden md:flex flex-1 items-center justify-center gap-6 lg:gap-9 min-w-0 lg:flex-none lg:absolute lg:left-1/2 lg:-translate-x-1/2"
            >
              <a
                href="#steam"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                    e.preventDefault();
                    onTabChange('steam');
                  }
                }}
                className={`relative py-2 font-sans text-sm tracking-wide transition-colors duration-200 flex items-baseline gap-2 cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'steam'
                    ? 'text-white font-semibold border-fuchsia-400'
                    : 'text-gray-400 hover:text-gray-100 font-medium border-transparent'
                }`}
                title="Steam Offline Games"
              >
                <span>Steam Offline</span>
                <span className="text-xs font-medium tabular-nums text-gray-400">
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
                className={`relative py-2 font-sans text-sm tracking-wide transition-colors duration-200 flex items-baseline gap-2 cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'product'
                    ? 'text-white font-semibold border-fuchsia-400'
                    : 'text-gray-400 hover:text-gray-100 font-medium border-transparent'
                }`}
                title="Physical & Gaming Products"
              >
                <span>Product</span>
                <span className="text-xs font-medium tabular-nums text-gray-400">
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
                className={`relative py-2 font-sans text-sm tracking-wide transition-colors duration-200 flex items-baseline gap-2 cursor-pointer whitespace-nowrap shrink-0 border-b-2 ${
                  activeTab === 'free'
                    ? 'text-white font-semibold border-fuchsia-400'
                    : 'text-gray-400 hover:text-gray-100 font-medium border-transparent'
                }`}
                title="Gameថែមពេលទិញ External"
              >
                <span>GameថែមExternal</span>
                <span className="text-xs font-medium tabular-nums text-gray-400">
                  {freeCount}
                </span>
              </a>

              {/* POS Cashier Link (Only shown when admin/owner is logged in) */}
              {isLoggedIn && (
                <button
                  type="button"
                  onClick={handlePosClick}
                  className="relative py-2 font-sans text-sm font-medium tracking-wide transition-colors duration-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 text-cyan-300/90 hover:text-cyan-200 border-b-2 border-transparent"
                  title="Open POS Cashier Terminal"
                >
                  <span>POS</span>
                </button>
              )}
            </nav>
          ) : isPosView ? (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs font-semibold whitespace-nowrap">
              <i className="fa-solid fa-cash-register text-cyan-400"></i>
              <span>Active POS Cashier Terminal Mode</span>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-purple-300 text-xs font-semibold whitespace-nowrap">
              <i className="fa-solid fa-shield-halved text-purple-400"></i>
              <span>Secure Admin Control Panel</span>
            </div>
          )}

          {/* Right Side Actions */}
          <div className="flex items-center justify-end gap-2 sm:gap-2.5 shrink-0">
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
                  onClick={onToggleAdminView}
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
                  onClick={onTogglePosView}
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
              <div className="flex items-center gap-2 min-w-[1px]">
                {isLoggedIn && (
                  <>
                    {/* Mobile POS quick button */}
                    <button
                      type="button"
                      onClick={handlePosClick}
                      className="md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-orbitron font-bold bg-gradient-to-r from-cyan-600 to-blue-600 text-white border border-cyan-400/40 shadow-sm cursor-pointer"
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

        {/* Mobile Tab Switcher - Only in Store View */}
        {!isAdminView && !isPosView && (
          <div className="md:hidden flex items-center justify-center border-t border-[#1f293d]/50 py-2 gap-4 overflow-x-auto">
            <a
              href="#steam"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('steam');
                }
              }}
              className={`py-1.5 font-sans text-xs tracking-wide whitespace-nowrap shrink-0 flex items-baseline gap-1.5 transition border-b-2 cursor-pointer ${
                activeTab === 'steam'
                  ? 'text-white font-semibold border-fuchsia-400'
                  : 'text-gray-400 border-transparent'
              }`}
            >
              <span>Steam Offline</span>
              <span className="text-[11px] tabular-nums text-gray-400">{steamCount}</span>
            </a>
            <a
              href="#product"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('product');
                }
              }}
              className={`py-1.5 font-sans text-xs tracking-wide whitespace-nowrap shrink-0 flex items-baseline gap-1.5 transition border-b-2 cursor-pointer ${
                activeTab === 'product'
                  ? 'text-white font-semibold border-fuchsia-400'
                  : 'text-gray-400 border-transparent'
              }`}
            >
              <span>Product</span>
              <span className="text-[11px] tabular-nums text-gray-400">{productCount}</span>
            </a>
            <a
              href="#external"
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  onTabChange('free');
                }
              }}
              className={`py-1.5 font-sans text-xs tracking-wide whitespace-nowrap shrink-0 flex items-baseline gap-1.5 transition border-b-2 cursor-pointer ${
                activeTab === 'free'
                  ? 'text-white font-semibold border-fuchsia-400'
                  : 'text-gray-400 border-transparent'
              }`}
            >
              <span>GameថែមExternal</span>
              <span className="text-[11px] tabular-nums text-gray-400">{freeCount}</span>
            </a>
            {isLoggedIn && (
              <button
                type="button"
                onClick={handlePosClick}
                className="py-1.5 font-sans text-xs font-medium text-cyan-300 whitespace-nowrap shrink-0 cursor-pointer"
                title="Open POS Cashier"
              >
                POS
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

