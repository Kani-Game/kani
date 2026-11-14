/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Game, GameTab, SiteSettings, UserRole } from './types/game';
import { StorageService } from './services/storageService';
import { Header } from './components/Header';
import { HeroBanner } from './components/HeroBanner';
import { GameCard } from './components/GameCard';
import { GameModal } from './components/GameModal';
import { FloatingCart } from './components/FloatingCart';
import { SelectionDrawer } from './components/SelectionDrawer';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AdminDashboard } from './components/AdminDashboard';
import { POSTerminal } from './components/POSTerminal';
import { ToastContainer, ToastMessage } from './components/Toast';

const getTabFromUrl = (): GameTab => {
  if (typeof window === 'undefined') return 'steam';
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const tabParam = searchParams.get('tab')?.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();

  if (
    hash === '#product' ||
    hash.includes('product') ||
    tabParam === 'product' ||
    pathname.endsWith('/product')
  ) {
    return 'product';
  }

  if (
    hash === '#external' ||
    hash === '#free' ||
    hash.includes('external') ||
    tabParam === 'external' ||
    tabParam === 'free' ||
    pathname.endsWith('/external') ||
    pathname.endsWith('/free')
  ) {
    return 'free';
  }
  return 'steam';
};

const getIsAdminFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.toLowerCase();
  return (
    hash === '#admin' ||
    hash === '#dashboard' ||
    hash === '#login' ||
    searchParams.get('view') === 'admin' ||
    searchParams.get('admin') === 'true' ||
    searchParams.get('login') === 'true' ||
    pathname.endsWith('/admin') ||
    pathname.endsWith('/login')
  );
};

const getIsPosFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.toLowerCase();
  const searchParams = new URLSearchParams(window.location.search);
  const pathname = window.location.pathname.toLowerCase();
  return (
    hash === '#pos' ||
    searchParams.get('view') === 'pos' ||
    searchParams.get('pos') === 'true' ||
    pathname.endsWith('/pos')
  );
};

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(StorageService.getSettings());
  const [activeTab, setActiveTab] = useState<GameTab>(getTabFromUrl);
  const [isPosView, setIsPosView] = useState<boolean>(getIsPosFromUrl);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'name-asc' | 'name-desc'>('default');
  const [genreFilter, setGenreFilter] = useState('all');

  // Selected Games Map { [id: string]: Game }
  const [selectedGamesMap, setSelectedGamesMap] = useState<Record<string, Game>>({});

  // Modals & Views
  const [previewGame, setPreviewGame] = useState<Game | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginTarget, setLoginTarget] = useState<'admin' | 'pos'>('admin');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(() =>
    StorageService.getCurrentUserRole()
  );
  const [currentUsername, setCurrentUsername] = useState<string>(
    () => StorageService.getAuthSession()?.username || ''
  );

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Load initial data and sync URL hash
  useEffect(() => {
    const loadedGames = StorageService.getGames();
    setGames(loadedGames);
    setSettings(StorageService.getSettings());
    const authenticated = StorageService.isLoggedIn();
    setIsLoggedIn(authenticated);

    // Asynchronously hydrate from IndexedDB for zero-quota persistence on Netlify & mobile
    StorageService.initAsyncStorage((hydratedGames) => {
      if (hydratedGames && hydratedGames.length > 0) {
        setGames(hydratedGames);
      }
    });

    // Real-Time Cloud Firestore Sync: instantly syncs Chrome, Firefox, Netlify & Mobile
    const unsubscribeCloudGames = StorageService.subscribeToGames((cloudGames) => {
      if (cloudGames && cloudGames.length > 0) {
        setGames(cloudGames);
      }
    });

    // Real-Time Cloud Firestore Sync for Settings & ABA KHQR
    const unsubscribeCloudSettings = StorageService.subscribeToSettings((cloudSettings) => {
      setSettings(cloudSettings);
    });

    // Real-Time Cloud Firestore Sync for Financial Report Rows & Expenses (keeps local cache fresh across all tabs)
    const unsubscribeCloudReportRows = StorageService.subscribeToReportRows(() => {});
    const unsubscribeCloudExpenses = StorageService.subscribeToExpenses(() => {});

    // Real-Time Cloud Firestore Sync for User Accounts & Passwords (guarantees all tabs & devices are in lockstep)
    const unsubscribeCloudUserAccounts = StorageService.subscribeToUserAccounts(() => {});

    const initialTab = getTabFromUrl();
    const initialPos = getIsPosFromUrl();
    const initialAdmin = getIsAdminFromUrl();
    setActiveTab(initialTab);

    if (initialAdmin) {
      if (authenticated) {
        const role = StorageService.getCurrentUserRole();
        if (role === 'pos') {
          setIsAdminView(false);
          setIsPosView(true);
          window.location.hash = '#pos';
          showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! មានសិទ្ធិប្រើបានតែ POS ប៉ុណ្ណោះ', 'error');
        } else {
          setIsAdminView(true);
          setIsPosView(false);
        }
      } else {
        setIsAdminView(false);
        setIsPosView(false);
        setLoginTarget('admin');
        setIsLoginModalOpen(true);
      }
    } else if (initialPos) {
      if (authenticated) {
        setIsPosView(true);
        setIsAdminView(false);
      } else {
        setIsPosView(false);
        setIsAdminView(false);
        setLoginTarget('pos');
        setIsLoginModalOpen(true);
      }
    } else {
      setIsAdminView(false);
      setIsPosView(false);
    }

    if (!window.location.hash) {
      const expectedHash = initialAdmin && authenticated ? '#admin' : initialPos && authenticated ? '#pos' : initialTab === 'steam' ? '#steam' : '#external';
      window.history.replaceState(null, '', expectedHash);
    }

    const syncFromUrl = () => {
      const tabFromUrl = getTabFromUrl();
      const posFromUrl = getIsPosFromUrl();
      const adminFromUrl = getIsAdminFromUrl();
      const isAuth = StorageService.isLoggedIn();
      const role = StorageService.getCurrentUserRole();
      setIsLoggedIn(isAuth);
      setCurrentUserRole(role);
      setCurrentUsername(StorageService.getAuthSession()?.username || '');
      setActiveTab(tabFromUrl);

      if (adminFromUrl) {
        if (isAuth) {
          if (role === 'pos') {
            setIsAdminView(false);
            setIsPosView(true);
            window.location.hash = '#pos';
            showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! មានសិទ្ធិប្រើបានតែ POS ប៉ុណ្ណោះ', 'error');
          } else {
            setIsAdminView(true);
            setIsPosView(false);
          }
        } else {
          setIsAdminView(false);
          setIsPosView(false);
          setLoginTarget('admin');
          setIsLoginModalOpen(true);
        }
      } else if (posFromUrl) {
        if (isAuth) {
          setIsPosView(true);
          setIsAdminView(false);
        } else {
          setIsPosView(false);
          setIsAdminView(false);
          setLoginTarget('pos');
          setIsLoginModalOpen(true);
        }
      } else {
        setIsAdminView(false);
        setIsPosView(false);
      }
    };

    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);

    // Secret Keyboard Shortcut: Ctrl+Shift+A or Cmd+Shift+A or Ctrl+Alt+L
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (
        (isCtrlOrCmd && e.shiftKey && (e.key === 'A' || e.key === 'a')) ||
        (isCtrlOrCmd && e.altKey && (e.key === 'L' || e.key === 'l'))
      ) {
        e.preventDefault();
        const isAuth = StorageService.isLoggedIn();
        const role = StorageService.getCurrentUserRole();
        if (isAuth) {
          if (role === 'pos') {
            showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! សូម Login ដោយគណនី Admin', 'error');
            setLoginTarget('admin');
            setIsLoginModalOpen(true);
          } else {
            setIsAdminView(true);
            setIsPosView(false);
            showToast('🔓 Switched to Admin Dashboard (Secret Shortcut)', 'info');
          }
        } else {
          setLoginTarget('admin');
          setIsLoginModalOpen(true);
          showToast('🔐 Opening Secret Admin Login (Ctrl+Shift+A)...', 'info');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribeCloudGames();
      unsubscribeCloudSettings();
      unsubscribeCloudReportRows();
      unsubscribeCloudExpenses();
      unsubscribeCloudUserAccounts();
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleTabChange = (tab: GameTab) => {
    setIsPosView(false);
    setIsAdminView(false);
    setActiveTab(tab);
    setGenreFilter('all');
    const targetHash = tab === 'steam' ? '#steam' : tab === 'product' ? '#product' : '#external';
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  };

  const handleOpenPos = () => {
    if (!isLoggedIn) {
      setLoginTarget('pos');
      setIsLoginModalOpen(true);
      showToast('POS Terminal ទាមទារ Username និង Password របស់ Admin!', 'info');
      return;
    }
    if (isPosView) {
      setIsPosView(false);
      const targetHash = activeTab === 'steam' ? '#steam' : activeTab === 'product' ? '#product' : '#external';
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      return;
    }
    setIsAdminView(false);
    setIsPosView(true);
    if (window.location.hash !== '#pos') {
      window.location.hash = '#pos';
    }
  };

  const handleOpenAdmin = () => {
    if (!isLoggedIn) {
      setLoginTarget('admin');
      setIsLoginModalOpen(true);
      return;
    }
    const role = StorageService.getCurrentUserRole();
    if (role === 'pos') {
      showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! សូម Login ដោយប្រើគណនី Admin', 'error');
      setLoginTarget('admin');
      setIsLoginModalOpen(true);
      return;
    }
    if (isAdminView) {
      setIsAdminView(false);
      const targetHash = activeTab === 'steam' ? '#steam' : activeTab === 'product' ? '#product' : '#external';
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
      return;
    }
    setIsPosView(false);
    setIsAdminView(true);
    if (window.location.hash !== '#admin') {
      window.location.hash = '#admin';
    }
  };

  // Secret Admin / POS triggers (for 5-tap gesture on logo or footer)
  const handleSecretTrigger = () => {
    const isAuth = StorageService.isLoggedIn();
    const role = StorageService.getCurrentUserRole();
    if (isAuth) {
      if (role === 'pos') {
        showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! សូម Login ដោយគណនី Admin', 'error');
        setLoginTarget('admin');
        setIsLoginModalOpen(true);
      } else {
        setIsAdminView(true);
        setIsPosView(false);
        showToast('🔓 Switched to Admin Dashboard', 'info');
      }
    } else {
      setLoginTarget('admin');
      setIsLoginModalOpen(true);
      showToast('🔐 Secret Admin & POS Login unlocked!', 'info');
    }
  };

  const [footerTapCount, setFooterTapCount] = useState(0);
  const footerTapTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleFooterSecretTap = () => {
    setFooterTapCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        if (footerTapTimerRef.current) clearTimeout(footerTapTimerRef.current);
        handleSecretTrigger();
        return 0;
      }
      return next;
    });

    if (footerTapTimerRef.current) clearTimeout(footerTapTimerRef.current);
    footerTapTimerRef.current = setTimeout(() => {
      setFooterTapCount(0);
    }, 2500);
  };


  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Counts
  const steamGames = useMemo(
    () => games.filter((g) => g.tag.toLowerCase().includes('steam')),
    [games]
  );
  const productGames = useMemo(
    () => games.filter((g) => g.tag.toLowerCase().includes('product')),
    [games]
  );
  const freeGames = useMemo(
    () => games.filter((g) => !g.tag.toLowerCase().includes('steam') && !g.tag.toLowerCase().includes('product')),
    [games]
  );

  // Extract unique genres for active tab
  const availableGenres = useMemo(() => {
    const currentList = activeTab === 'steam' ? steamGames : activeTab === 'product' ? productGames : freeGames;
    const genres = new Set<string>();
    currentList.forEach((g) => {
      if (g.genre) genres.add(g.genre.trim());
    });
    return Array.from(genres).sort();
  }, [activeTab, steamGames, freeGames, productGames]);

  // Filtered & Sorted Games for storefront
  const displayedGames = useMemo(() => {
    let list = activeTab === 'steam' ? [...steamGames] : activeTab === 'product' ? [...productGames] : [...freeGames];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(term) ||
          g.genre.toLowerCase().includes(term) ||
          g.tag.toLowerCase().includes(term)
      );
    }

    // Genre filter
    if (genreFilter !== 'all') {
      list = list.filter((g) => g.genre === genreFilter);
    }

    // Sorting
    if (sortBy === 'name-asc') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-desc') {
      list.sort((a, b) => b.name.localeCompare(a.name));
    }

    return list;
  }, [activeTab, steamGames, freeGames, productGames, searchTerm, genreFilter, sortBy]);

  // Game Selection handlers
  const toggleSelectGame = (game: Game) => {
    setSelectedGamesMap((prev) => {
      const copy = { ...prev };
      if (copy[game.id]) {
        delete copy[game.id];
        showToast(`បានលុប ${game.name} ចេញពីបញ្ជី`);
      } else {
        copy[game.id] = game;
        showToast(`បានបន្ថែម ${game.name} ទៅបញ្ជី`);
      }
      return copy;
    });
  };

  const handleSelectAllVisible = () => {
    let countAdded = 0;
    setSelectedGamesMap((prev) => {
      const copy = { ...prev };
      displayedGames.forEach((g) => {
        if (!copy[g.id]) {
          copy[g.id] = g;
          countAdded++;
        }
      });
      return copy;
    });
    showToast(`បានជ្រើសរើស ${countAdded} Games!`);
  };

  const handleClearAllSelection = () => {
    setSelectedGamesMap({});
    showToast('បានលុបការជ្រើសរើសទាំងអស់');
  };

  const handleRemoveSingleFromDrawer = (id: string) => {
    setSelectedGamesMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Direct Telegram Dispatch to Admin (@kanigame168)
  const handleSendDirectToTelegram = async () => {
    const selectedList = Object.values(selectedGamesMap);
    if (selectedList.length === 0) {
      showToast('សូមជ្រើសរើស Game យ៉ាងហោចណាស់ 1 ដំបូង!', 'error');
      return;
    }

    const cleanHandle = (settings.telegramAdminHandle || 'kanigame168').replace('@', '').trim();

    let text = `🎮 *KANI GAME - REQUEST GAMES*\n\n`;
    text += `ជម្រាបសួរ Admin @${cleanHandle}, ខ្ញុំចង់បាន Game ចំនួន (${selectedList.length}) ដូចខាងក្រោម៖\n\n`;
    selectedList.forEach((game, index) => {
      text += `${index + 1}. 🌟 ${game.name} (${game.tag})\n`;
    });
    text += `\nសូមអរគុណ! 🙏`;

    // 1. Copy formatted text to clipboard as guaranteed backup
    try {
      await navigator.clipboard.writeText(text);
    } catch {}

    // 2. Open chat directly with Admin @kanigame168 WITH pre-filled message text
    const encodedText = encodeURIComponent(text);
    const directTelegramUrl = `https://t.me/${cleanHandle}?text=${encodedText}`;
    window.open(directTelegramUrl, '_blank');
    showToast(`🚀 បានបញ្ជូនទៅកាន់ Telegram @${cleanHandle}! (ព័ត៌មាន Game ត្រូវបានបំពេញក្នុងឆាតរួចរាល់)`, 'success');
  };

  // Direct Send Single Game to Telegram Admin (@kanigame168)
  const handleSendSingleGameToTelegram = async (game: Game) => {
    const cleanHandle = (settings.telegramAdminHandle || 'kanigame168').replace('@', '').trim();

    let text = `🎮 KANI GAME - REQUEST GAME\n\n`;
    text += `🌟 Game: ${game.name}\n`;
    text += `🏷️ Tag: ${game.tag}\n`;
    if (game.genre) text += `📁 Genre: ${game.genre}\n`;
    text += `\nជម្រាបសួរ Admin @${cleanHandle}, ខ្ញុំចង់កុម្ម៉ង់ Game នេះ! សូមអរគុណ! 🙏`;

    try {
      await navigator.clipboard.writeText(text);
    } catch {}

    const encodedText = encodeURIComponent(text);
    const directTelegramUrl = `https://t.me/${cleanHandle}?text=${encodedText}`;
    window.open(directTelegramUrl, '_blank');
    showToast(`🚀 បានបញ្ជូន "${game.name}" ទៅកាន់ Telegram @${cleanHandle}! (ព័ត៌មានត្រូវបានបំពេញរួចរាល់)`, 'success');
  };

  // Admin & POS Authentication Actions
  const handleAdminLogin = async (u: string, p: string) => {
    const result = await StorageService.login(u, p);
    if (result.success) {
      setIsLoggedIn(true);
      setCurrentUserRole(result.role || 'admin');
      setCurrentUsername(result.username || u);
    }
    return result;
  };

  const handleAdminLoginSuccess = (destination: 'admin' | 'pos', role?: UserRole) => {
    setIsLoggedIn(true);
    const activeRole = role || StorageService.getCurrentUserRole() || 'admin';
    setCurrentUserRole(activeRole);
    setCurrentUsername(StorageService.getAuthSession()?.username || '');

    if (activeRole === 'pos' || destination === 'pos') {
      setIsAdminView(false);
      setIsPosView(true);
      window.location.hash = '#pos';
      if (activeRole === 'pos' && destination === 'admin') {
        showToast('គណនី POS ត្រូវបានកំណត់ឱ្យប្រើប្រាស់តែលើ POS Terminal ប៉ុណ្ណោះ!', 'info');
      } else {
        showToast('ចូលប្រើប្រាស់ POS Cashier Terminal បានជោគជ័យ!', 'success');
      }
    } else {
      setIsPosView(false);
      setIsAdminView(true);
      window.location.hash = '#admin';
      showToast('Welcome to Kani Game Admin Dashboard!', 'success');
    }
  };

  const handleAdminLogout = () => {
    StorageService.logout();
    setIsLoggedIn(false);
    setCurrentUserRole(null);
    setCurrentUsername('');
    setIsAdminView(false);
    setIsPosView(false);
    window.location.hash = activeTab === 'steam' ? '#steam' : activeTab === 'product' ? '#product' : '#external';
    showToast('Logged out successfully.');
  };

  const handleSaveGame = (gameData: Omit<Game, 'id'> & { id?: string }) => {
    const newGame = StorageService.addGame(gameData);
    setGames(StorageService.getGames());
    return newGame;
  };

  const handleSaveMultipleGames = (gamesData: (Omit<Game, 'id'> & { id?: string })[]) => {
    const newGames = StorageService.addMultipleGames(gamesData);
    setGames(StorageService.getGames());
    return newGames;
  };

  const handleUpdateGame = (game: Game) => {
    StorageService.updateGame(game);
    setGames(StorageService.getGames());
  };

  const handleDeleteGame = (id: string) => {
    StorageService.deleteGame(id);
    setGames(StorageService.getGames());
    // Also remove from selection if present
    setSelectedGamesMap((prev) => {
      if (prev[id]) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return prev;
    });
  };

  const handleDeleteMultipleGames = (ids: string[]) => {
    StorageService.deleteMultipleGames(ids);
    setGames(StorageService.getGames());
    const idSet = new Set(ids);
    setSelectedGamesMap((prev) => {
      const copy = { ...prev };
      let changed = false;
      ids.forEach((id) => {
        if (copy[id]) {
          delete copy[id];
          changed = true;
        }
      });
      return changed ? copy : prev;
    });
  };

  const handleResetToDefault = () => {
    const defaultGames = StorageService.resetToDefault();
    setGames(defaultGames);
    setSelectedGamesMap({});
  };

  const handleSaveSettings = (newSettings: SiteSettings) => {
    StorageService.saveSettings(newSettings);
    setSettings(newSettings);
  };

  const handleUpdateCredentials = (user: string, pass: string) => {
    return StorageService.updateAdminCredentials(user, pass);
  };

  const handleExportBackup = () => {
    const jsonStr = StorageService.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanigame_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Backup JSON downloaded successfully!');
  };

  const handleImportBackup = (fileContent: string) => {
    const res = StorageService.importBackup(fileContent);
    if (res.success) {
      setGames(StorageService.getGames());
      setSettings(StorageService.getSettings());
    }
    return res;
  };

  const selectedCount = Object.keys(selectedGamesMap).length;

  return (
    <div className="bg-[#080b11] text-gray-100 font-sans min-h-screen flex flex-col selection:bg-purple-600 selection:text-white pb-28">
      {/* Toast Notification Feed */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onClearSearch={() => setSearchTerm('')}
        steamCount={steamGames.length}
        freeCount={freeGames.length}
        productCount={productGames.length}
        isAdminView={isAdminView}
        onToggleAdminView={handleOpenAdmin}
        isPosView={isPosView}
        onTogglePosView={handleOpenPos}
        isLoggedIn={isLoggedIn}
        onOpenLogin={(target) => {
          setLoginTarget(target || 'admin');
          setIsLoginModalOpen(true);
        }}
        onLogout={handleAdminLogout}
        onSecretAdminTrigger={handleSecretTrigger}
      />

      {/* Main View: Storefront OR POS Cashier Terminal OR Admin Dashboard */}
      {isAdminView ? (
        <AdminDashboard
          games={games}
          settings={settings}
          onSaveGame={handleSaveGame}
          onSaveMultipleGames={handleSaveMultipleGames}
          onUpdateGame={handleUpdateGame}
          onDeleteGame={handleDeleteGame}
          onDeleteMultipleGames={handleDeleteMultipleGames}
          onResetToDefault={handleResetToDefault}
          onSaveSettings={handleSaveSettings}
          onUpdateCredentials={handleUpdateCredentials}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          onLogout={handleAdminLogout}
          onCloseAdmin={() => {
            setIsAdminView(false);
            const targetHash = activeTab === 'steam' ? '#steam' : activeTab === 'product' ? '#product' : '#external';
            if (window.location.hash !== targetHash) {
              window.location.hash = targetHash;
            }
          }}
          onOpenPos={() => {
            setIsAdminView(false);
            setIsPosView(true);
            window.location.hash = '#pos';
          }}
          onRefreshGames={() => setGames(StorageService.getGames())}
          onShowToast={showToast}
        />
      ) : isPosView ? (
        <POSTerminal
          games={games}
          settings={settings}
          onSaveProduct={handleSaveGame}
          onSaveMultipleProducts={handleSaveMultipleGames}
          onUpdateProduct={handleUpdateGame}
          onDeleteProduct={handleDeleteGame}
          onSwitchToStore={() => {
            setIsPosView(false);
            window.location.hash = activeTab === 'steam' ? '#steam' : activeTab === 'product' ? '#product' : '#external';
          }}
          onSwitchToAdmin={() => {
            const role = StorageService.getCurrentUserRole();
            if (role === 'pos') {
              showToast('គណនី POS មិនមានសិទ្ធិចូល Admin ទេ! សូម Login ដោយប្រើគណនី Admin', 'error');
              setLoginTarget('admin');
              setIsLoginModalOpen(true);
              return;
            }
            setIsPosView(false);
            setIsAdminView(true);
            window.location.hash = '#admin';
          }}
          userRole={currentUserRole || StorageService.getCurrentUserRole() || undefined}
          currentUsername={currentUsername || StorageService.getAuthSession()?.username || undefined}
          onLogout={handleAdminLogout}
          onShowToast={showToast}
        />
      ) : (
        <main className="flex-1 w-full max-w-[3600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-6">

          {/* Hero Banner */}
          <HeroBanner
            settings={settings}
            steamCount={steamGames.length}
            freeCount={freeGames.length}
            totalCount={games.length}
            onOpenTelegram={() => {
              const handle = settings.telegramAdminHandle.replace('@', '');
              window.open(`https://t.me/${handle}`, '_blank');
            }}
            onBrowseCatalog={() => {
              const el = document.getElementById('catalog-section');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          />

          {/* Category Header & Filter Controls */}
          <div
            id="catalog-section"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-3 border-b border-purple-900/30 scroll-mt-24"
          >
            <div>
              <h3 className="font-orbitron text-xl sm:text-2xl font-bold text-white flex items-center gap-3">
                {activeTab === 'steam' ? (
                  <>
                    <i className="fa-brands fa-steam text-purple-400 text-2xl"></i>
                    <span>Steam Offline Games</span>
                  </>
                ) : activeTab === 'product' ? (
                  <>
                    <i className="fa-solid fa-box-open text-sky-400 text-2xl"></i>
                    <span>Gaming Products & Accessories (ទំនិញ)</span>
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-gift text-cyan-400 text-2xl"></i>
                    <span>Gameថែមពេលទិញ External</span>
                  </>
                )}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {activeTab === 'steam'
                  ? 'ចុចប៊ូតុង Checkbox ឬ Select ដើម្បីជ្រើសរើស Game ច្រើនក្នុងពេលតែមួយ'
                  : activeTab === 'product'
                  ? 'ទំនិញគ្រឿងបន្លាស់ ឧបករណ៍ហ្គេម External HDD និង Accessories គុណភាពខ្ពស់'
                  : 'បញ្ជី Game ឥតគិតថ្លៃសម្រាប់ទាញយក ឬ Request តាម Telegram'}
              </p>
            </div>

            {/* Search, Filter & Quick Selection Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 w-full sm:w-auto sm:justify-end">
              {/* Search Bar - Below Hero, Inline with Filters */}
              <div className="relative w-full sm:w-64 lg:w-72">
                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs pointer-events-none"></i>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ស្វែងរក Game (Sekiro, GTA V...)"
                  className="w-full bg-[#131b2e] text-xs text-gray-200 placeholder-gray-500 rounded-lg px-3 py-2 pl-8 pr-8 border border-[#243047] focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 outline-none transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                  >
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                )}
              </div>

              {/* Genre Filter */}
              {availableGenres.length > 0 && (
                <select
                  value={genreFilter}
                  onChange={(e) => setGenreFilter(e.target.value)}
                  className="bg-[#131b2e] text-xs text-gray-200 rounded-lg px-3 py-2 border border-[#243047] outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="all">All Genres</option>
                  {availableGenres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              )}

              {/* Sort Order */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-[#131b2e] text-xs text-gray-200 rounded-lg px-3 py-2 border border-[#243047] outline-none focus:border-purple-500 cursor-pointer"
              >
                <option value="default">Default</option>
                <option value="name-asc">A → Z</option>
                <option value="name-desc">Z → A</option>
              </select>

              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="px-3 py-2 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/30 text-purple-200 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-check-double text-purple-400"></i>
                <span>Select All</span>
              </button>

              <button
                type="button"
                onClick={handleClearAllSelection}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-300 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <i className="fa-solid fa-trash-can text-red-400"></i>
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Active Search & Filter Indicator */}
          {(searchTerm || genreFilter !== 'all') && (
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
              <span>Filtering results:</span>
              {searchTerm && (
                <span className="bg-purple-950/60 border border-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  Search: &quot;{searchTerm}&quot;
                  <button onClick={() => setSearchTerm('')} className="hover:text-white">
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                  </button>
                </span>
              )}
              {genreFilter !== 'all' && (
                <span className="bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  Genre: {genreFilter}
                  <button onClick={() => setGenreFilter('all')} className="hover:text-white">
                    <i className="fa-solid fa-xmark text-[10px]"></i>
                  </button>
                </span>
              )}
              <span className="text-gray-500">({displayedGames.length} found)</span>
            </div>
          )}

          {/* No results placeholder */}
          {displayedGames.length === 0 ? (
            <div className="text-center py-20 bg-[#131b2e]/40 rounded-2xl border border-purple-900/30 p-8 my-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400 text-2xl">
                <i className="fa-solid fa-magnifying-glass"></i>
              </div>
              <h4 className="text-lg font-bold text-gray-200">រកមិនឃើញ Game នេះទេ</h4>
              <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                សូមព្យាយាមស្វែងរកពាក្យផ្សេងទៀត ឬជ្រើសរើសប្រភេទ Genre ផ្សេង។
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setGenreFilter('all');
                }}
                className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Clear Search & Filters
              </button>
            </div>
          ) : (
            /* Games Grid responsive column system scaling seamlessly from mobile to 34-inch ultrawide */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 min-[1800px]:grid-cols-8 min-[2200px]:grid-cols-9 min-[2600px]:grid-cols-10 min-[3000px]:grid-cols-11 min-[3400px]:grid-cols-12 gap-3.5 sm:gap-4 md:gap-5">
              {displayedGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  isSelected={!!selectedGamesMap[game.id]}
                  onToggleSelect={toggleSelectGame}
                  onOpenPreview={setPreviewGame}
                  onSendToTelegram={handleSendSingleGameToTelegram}
                />
              ))}
            </div>
          )}

          {/* Storefront Footer */}
          <footer className="mt-16 pt-8 pb-4 border-t border-purple-900/30 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
            <div
              className="flex items-center gap-2 cursor-pointer select-none"
              onClick={handleFooterSecretTap}
              title="Kani Game"
            >
              <span className="font-orbitron font-bold text-gray-200">KANI GAME</span>
              <span>— Ultimate Gaming Portal</span>
            </div>

            <div className="flex items-center gap-4">
              <a
                href={`https://t.me/${settings.telegramAdminHandle.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition"
              >
                <i className="fa-brands fa-telegram text-sm"></i>
                <span>{settings.telegramAdminHandle}</span>
              </a>

              {isLoggedIn && (
                <>
                  <span className="text-gray-600">|</span>
                  <button
                    type="button"
                    onClick={handleOpenAdmin}
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1.5 transition cursor-pointer font-medium"
                    title="Open Admin Dashboard"
                  >
                    <i className="fa-solid fa-user-shield text-xs"></i>
                    <span>Admin Panel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenPos}
                    className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition cursor-pointer font-medium"
                    title="Open POS Terminal"
                  >
                    <i className="fa-solid fa-cash-register text-xs"></i>
                    <span>POS</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAdminLogout}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1.5 transition cursor-pointer font-medium"
                    title="Logout"
                  >
                    <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
                    <span>Logout</span>
                  </button>
                </>
              )}
            </div>
          </footer>
        </main>
      )}

      {/* Floating Selection Cart Action Bar */}
      {!isAdminView && !isPosView && (
        <FloatingCart
          selectedCount={selectedCount}
          onOpenDrawer={() => setIsDrawerOpen(true)}
          onSendTelegram={handleSendDirectToTelegram}
        />
      )}


      {/* Selection Drawer Modal */}
      <SelectionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        selectedGames={Object.values(selectedGamesMap)}
        onRemoveGame={handleRemoveSingleFromDrawer}
        onClearAll={handleClearAllSelection}
        adminHandle={settings.telegramAdminHandle}
        onShowToast={showToast}
      />

      {/* Game Details Preview Modal */}
      <GameModal
        game={previewGame}
        isSelected={previewGame ? !!selectedGamesMap[previewGame.id] : false}
        onToggleSelect={(g) => toggleSelectGame(g)}
        onClose={() => setPreviewGame(null)}
        adminHandle={settings.telegramAdminHandle}
        onSendToTelegram={handleSendSingleGameToTelegram}
      />

      {/* Admin & POS Login Modal */}
      <AdminLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLogin={handleAdminLogin}
        onLoginSuccess={handleAdminLoginSuccess}
        targetDestination={loginTarget}
      />
    </div>
  );
}
