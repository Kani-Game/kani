import React, { useState, useMemo, useEffect } from 'react';
import { Game, POSCartItem, POSSaleRecord, SiteSettings, UserRole } from '../types/game';
import { StorageService } from '../services/storageService';
import { POSReceiptModal } from './POSReceiptModal';
import { POSSalesHistoryModal } from './POSSalesHistoryModal';
import { POSPaymentModal } from './POSPaymentModal';
import { DailyFinancialReport } from './DailyFinancialReport';

interface POSTerminalProps {
  games: Game[];
  settings: SiteSettings;
  onSaveProduct: (game: Omit<Game, 'id'> & { id?: string }) => Game;
  onSaveMultipleProducts?: (products: (Omit<Game, 'id'> & { id?: string })[]) => Game[];
  onUpdateProduct: (game: Game) => void;
  onDeleteProduct: (id: string) => void;
  onSwitchToStore: () => void;
  onSwitchToAdmin: () => void;
  userRole?: UserRole;
  currentUsername?: string;
  onLogout?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const POSTerminal: React.FC<POSTerminalProps> = ({
  games,
  settings,
  onSaveProduct,
  onSaveMultipleProducts,
  onUpdateProduct,
  onDeleteProduct: _onDeleteProduct,
  onSwitchToStore,
  onSwitchToAdmin,
  userRole,
  currentUsername,
  onLogout,
  onShowToast,
}) => {
  // Exchange rate & Cashier settings
  const exchangeRate = settings.khrExchangeRate || 4100;
  const cashierName = settings.posCashierName || 'Kani Cashier';

  // Sales & Catalog state
  const [sales, setSales] = useState<POSSaleRecord[]>(() => StorageService.getSales());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<POSCartItem[]>([]);

  // Customer info & Discounts
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [showCustomerFields, setShowCustomerFields] = useState(false);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [taxPercent] = useState<number>(0);

  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'aba_khqr' | 'telegram' | 'card'>('cash');
  const [cashTenderedUsd, setCashTenderedUsd] = useState<string>('');
  const [cashTenderedKhr, setCashTenderedKhr] = useState<string>('');

  // Modals
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<POSSaleRecord | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Sync sales records on mount and subscribe to real-time Cloud updates
  useEffect(() => {
    setSales(StorageService.getSales());
    const unsub = StorageService.subscribeToSales((cloudSales) => {
      setSales(cloudSales);
    });
    return () => unsub();
  }, []);

  // Filtered games for POS
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      const matchSearch =
        !searchTerm.trim() ||
        g.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        g.genre.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
        (g.barcode && g.barcode.toLowerCase().includes(searchTerm.toLowerCase().trim()));

      let matchCategory = true;
      if (selectedCategory === 'steam') {
        matchCategory = g.tag.toLowerCase().includes('steam');
      } else if (selectedCategory === 'product') {
        matchCategory = g.tag.toLowerCase().includes('product');
      } else if (selectedCategory === 'free') {
        matchCategory = !g.tag.toLowerCase().includes('steam') && !g.tag.toLowerCase().includes('product');
      } else if (selectedCategory !== 'all') {
        matchCategory = g.tag === selectedCategory;
      }

      return matchSearch && matchCategory;
    });
  }, [games, searchTerm, selectedCategory]);

  // Unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.tag) set.add(g.tag);
    });
    return Array.from(set);
  }, [games]);

  // Calculations
  const subtotalUsd = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  }, [cart]);

  const discountAmountUsd = useMemo(() => {
    return (subtotalUsd * discountPercent) / 100;
  }, [subtotalUsd, discountPercent]);

  const taxAmountUsd = useMemo(() => {
    return ((subtotalUsd - discountAmountUsd) * taxPercent) / 100;
  }, [subtotalUsd, discountAmountUsd, taxPercent]);

  const totalUsd = useMemo(() => {
    const val = subtotalUsd - discountAmountUsd + taxAmountUsd;
    return Math.max(0, val);
  }, [subtotalUsd, discountAmountUsd, taxAmountUsd]);

  const totalKhr = useMemo(() => {
    return Math.round(totalUsd * exchangeRate);
  }, [totalUsd, exchangeRate]);

  // Change Calculation
  const tenderedUsdNum = parseFloat(cashTenderedUsd) || 0;
  const tenderedKhrNum = parseFloat(cashTenderedKhr) || 0;
  const totalTenderedUsdEquivalent = tenderedUsdNum + tenderedKhrNum / exchangeRate;

  const changeDueUsd = Math.max(0, totalTenderedUsdEquivalent - totalUsd);
  const changeDueKhr = Math.round(changeDueUsd * exchangeRate);

  // Cart operations
  const addToCart = (game: Game) => {
    const price = StorageService.getGamePrice(game);
    setCart((prev) => {
      const idx = prev.findIndex((item) => item.game.id === game.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      } else {
        return [...prev, { game, quantity: 1, unitPrice: price }];
      }
    });
  };

  const updateCartQty = (gameId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.game.id === gameId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as POSCartItem[];
    });
  };

  const removeCartItem = (gameId: string) => {
    setCart((prev) => prev.filter((item) => item.game.id !== gameId));
  };

  const clearCart = () => {
    setCart([]);
    setCashTenderedUsd('');
    setCashTenderedKhr('');
    setDiscountPercent(0);
  };


  // Barcode / SKU quick scan or enter
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    const match = games.find(
      (g) =>
        (g.barcode && g.barcode.toLowerCase() === searchTerm.toLowerCase().trim()) ||
        g.name.toLowerCase() === searchTerm.toLowerCase().trim()
    );
    if (match) {
      addToCart(match);
      setSearchTerm('');
      onShowToast(`បានបន្ថែម: ${match.name}`);
    } else {
      onShowToast(`រកមិនឃើញ Barcode/Name "${searchTerm}"`, 'error');
    }
  };

  // Complete Sale / Checkout
  const handleCompleteSale = (chosenMethod: 'cash' | 'aba_khqr' | 'telegram' | 'card' = paymentMethod) => {
    if (cart.length === 0) {
      onShowToast('សូមជ្រើសរើស Game ឬ Product យ៉ាងហោច 1 ទៅក្នុងកន្ត្រក!', 'error');
      return;
    }

    const receiptNo = `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const saleRecord: POSSaleRecord = {
      id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      receiptNo,
      date: new Date().toISOString(),
      items: cart.map((item) => ({
        id: item.game.id,
        name: item.game.name,
        tag: item.game.tag,
        genre: item.game.genre,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        description:
          item.game.description ||
          (item.game.tag.toLowerCase().includes('steam')
            ? 'Steam Offline Account - Lifetime Access'
            : 'External Game Package & Full Setup'),
      })),
      subtotalUsd,
      discountPercent,
      discountAmountUsd,
      taxPercent,
      taxAmountUsd,
      totalUsd,
      totalKhr,
      exchangeRate,
      paymentMethod: chosenMethod,
      cashTenderedUsd: tenderedUsdNum > 0 ? tenderedUsdNum : totalUsd,
      cashTenderedKhr: tenderedKhrNum > 0 ? tenderedKhrNum : 0,
      changeReturnedUsd: changeDueUsd,
      changeReturnedKhr: changeDueKhr,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      cashierName,
      status: 'completed',
    };

    StorageService.saveSale(saleRecord);
    setSales(StorageService.getSales());
    setActiveReceipt(saleRecord);
    clearCart();
    setIsPaymentModalOpen(false);
    onShowToast(`ការលក់ជោគជ័យ! បង្កើតវិក្កយបត្រ ${receiptNo}`, 'success');
  };

  return (
    <div className="flex-1 flex flex-col bg-[#080b11] text-gray-100 min-h-[calc(100vh-80px)]">
      {/* POS Top Control Toolbar */}
      <div className="bg-[#0f172a] border-b border-purple-900/40 px-4 sm:px-6 py-3">
        <div className="w-full max-w-[3600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-white shadow-neon-cyan">
              <i className="fa-solid fa-cash-register text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-orbitron font-extrabold text-base sm:text-lg text-white">
                  KANI <span className="text-cyan-400">POS</span> CASHIER
                </h2>
                <span className="flex items-center gap-1 text-[10px] bg-green-950/80 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  ONLINE
                </span>
              </div>
              <p className="text-[11px] text-gray-400 font-rajdhani">
                Terminal #01 • Cashier: <span className="text-purple-300 font-bold">{cashierName}</span> • Rate: <span className="text-cyan-300 font-bold">$1 = {exchangeRate.toLocaleString()} ៛</span>
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sales History */}
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="px-3 sm:px-3.5 py-2 rounded-xl bg-[#131b2e] hover:bg-slate-800 border border-purple-500/30 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              <i className="fa-solid fa-clock-rotate-left text-cyan-400"></i>
              <span>History</span>
              <span className="ml-1 bg-purple-900/80 text-purple-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {sales.length}
              </span>
            </button>

            {/* Switch to Storefront */}
            {/* User Account Role Badge */}
            {currentUsername && (
              <div
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border shadow-sm ${
                  userRole === 'pos'
                    ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                    : 'bg-purple-950/70 border-purple-500/50 text-purple-300'
                }`}
                title={
                  userRole === 'pos'
                    ? 'គណនី POS Cashier (ប្រើបានតែ POS ទេ)'
                    : 'គណនី Admin (សិទ្ធិពេញលេញ Admin + POS)'
                }
              >
                <i className={`fa-solid ${userRole === 'pos' ? 'fa-cash-register' : 'fa-crown'} text-xs`}></i>
                <span className="font-orbitron font-bold">
                  {userRole === 'pos' ? `POS: ${currentUsername}` : `Admin: ${currentUsername}`}
                </span>
                {userRole === 'pos' && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 rounded font-mono text-cyan-200">
                    POS ONLY
                  </span>
                )}
              </div>
            )}

            <button
              onClick={onSwitchToStore}
              className="px-3 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="View Storefront"
            >
              <i className="fa-solid fa-store text-purple-400"></i>
              <span className="hidden sm:inline">Storefront</span>
            </button>

            {/* Switch to Admin (Manage Products & Uploads) */}
            <button
              onClick={onSwitchToAdmin}
              className={`px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer ${
                userRole === 'pos'
                  ? 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-300'
                  : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/40'
              }`}
              title={
                userRole === 'pos'
                  ? 'Admin Only: ចុចដើម្បី Login ដោយគណនី Admin'
                  : 'Open Admin Page to Upload Products & Manage Catalog'
              }
            >
              <i className={`fa-solid ${userRole === 'pos' ? 'fa-lock text-yellow-400' : 'fa-cloud-arrow-up text-xs'}`}></i>
              <span>Admin & Uploads</span>
            </button>

            {/* Financial Report (Google Sheet Style) - Admin Only */}
            <button
              onClick={() => {
                if (userRole === 'pos') {
                  onShowToast('គណនី POS មិនមានសិទ្ធិមើលរបាយការណ៍ហិរញ្ញវត្ថុទេ! (Admin Only)', 'error');
                  return;
                }
                setIsReportModalOpen(true);
              }}
              className={`px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                userRole === 'pos'
                  ? 'bg-slate-800/80 border border-slate-700 text-gray-400 opacity-60 hover:opacity-100'
                  : 'bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/50 text-emerald-300 shadow-emerald-950/50'
              }`}
              title={
                userRole === 'pos'
                  ? 'Locked: របាយការណ៍ហិរញ្ញវត្ថុទាមទារសិទ្ធិ Admin'
                  : 'Open Daily Financial Report (Google Sheet Style)'
              }
            >
              <i className={`fa-solid ${userRole === 'pos' ? 'fa-lock text-amber-400' : 'fa-file-invoice-dollar text-emerald-400'}`}></i>
              <span>Report</span>
            </button>

            {/* Logout */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Logout"
              >
                <i className="fa-solid fa-arrow-right-from-bracket text-xs"></i>
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Terminal Workspace: Left Catalog, Right Register */}
      <div className="flex-1 w-full max-w-[3600px] mx-auto p-3 sm:p-4 lg:p-6 2xl:px-8 grid grid-cols-1 lg:grid-cols-12 2xl:grid-cols-16 min-[2400px]:grid-cols-20 gap-4 sm:gap-6">
        {/* Left Column: Product Grid & Search */}
        <div className="lg:col-span-7 2xl:col-span-11 min-[2400px]:col-span-15 flex flex-col space-y-4">
          {/* Fast Search & Barcode Scan Input */}
          <div className="flex items-center gap-2">
            <form onSubmit={handleBarcodeSubmit} className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search game name, genre or scan barcode (Press Enter to quick-add)..."
                className="w-full bg-[#131b2e] text-sm text-gray-100 placeholder-gray-400 rounded-xl px-4 py-2.5 pl-10 pr-10 border border-purple-500/30 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition"
              />
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs"></i>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <i className="fa-solid fa-xmark text-xs"></i>
                </button>
              )}
            </form>
          </div>

          {/* Quick Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-rajdhani font-bold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-[#131b2e] text-gray-400 hover:text-white border border-purple-900/40'
              }`}
            >
              All Items ({games.length})
            </button>

            <button
              onClick={() => setSelectedCategory('steam')}
              className={`px-3 py-1.5 rounded-lg font-rajdhani font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'steam'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-[#131b2e] text-gray-400 hover:text-white border border-purple-900/40'
              }`}
            >
              <i className="fa-brands fa-steam"></i>
              <span>Steam Offline</span>
            </button>

            <button
              onClick={() => setSelectedCategory('free')}
              className={`px-3 py-1.5 rounded-lg font-rajdhani font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'free'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-[#131b2e] text-gray-400 hover:text-white border border-purple-900/40'
              }`}
            >
              <i className="fa-solid fa-gift"></i>
              <span>External Free</span>
            </button>

            <button
              onClick={() => setSelectedCategory('product')}
              className={`px-3 py-1.5 rounded-lg font-rajdhani font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                selectedCategory === 'product'
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-[#131b2e] text-sky-400 hover:text-white border border-sky-900/40'
              }`}
            >
              <i className="fa-solid fa-box-open text-sky-400"></i>
              <span>Product ({games.filter((g) => g.tag.toLowerCase().includes('product')).length})</span>
            </button>

            {categories
              .filter((c) => !c.toLowerCase().includes('steam') && !c.toLowerCase().includes('external') && !c.toLowerCase().includes('product'))
              .map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-rajdhani font-bold whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-[#131b2e] text-gray-400 hover:text-white border border-purple-900/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
          </div>

          {/* Product Items Grid */}
          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-270px)] pr-1">
            {filteredGames.length === 0 ? (
              <div className="text-center py-16 bg-[#131b2e]/50 rounded-2xl border border-purple-900/30 p-6">
                <i className="fa-solid fa-box-open text-4xl text-gray-600 mb-3"></i>
                <h4 className="text-base font-bold text-gray-300">No products found</h4>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Upload a new product to start selling immediately.
                </p>
                <button
                  onClick={onSwitchToAdmin}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-2 mx-auto"
                >
                  <i className="fa-solid fa-gear"></i>
                  <span>Go to Admin Catalog & Uploads</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5 min-[2200px]:grid-cols-6 min-[2800px]:grid-cols-7 gap-3">
                {filteredGames.map((game) => {
                  const price = StorageService.getGamePrice(game);
                  const priceKhr = Math.round(price * exchangeRate);
                  const isSteam = game.tag.toLowerCase().includes('steam');
                  const inCartCount = cart.find((i) => i.game.id === game.id)?.quantity || 0;

                  return (
                    <div
                      key={game.id}
                      onClick={() => addToCart(game)}
                      className={`group relative bg-[#131b2e] rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer flex flex-col hover:-translate-y-0.5 select-none ${
                        inCartCount > 0
                          ? 'border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                          : 'border-purple-900/40 hover:border-purple-500/60'
                      }`}
                    >
                      {/* Image Thumbnail */}
                      <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden">
                        <img
                          src={game.img}
                          alt={game.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://placehold.co/400x300/131b2e/ffffff?text=${encodeURIComponent(
                              game.name
                            )}`;
                          }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#131b2e] via-transparent to-transparent pointer-events-none"></div>

                        {/* Tag */}
                        <span
                          className={`absolute top-1.5 left-1.5 text-[9px] font-rajdhani font-bold px-1.5 py-0.5 rounded backdrop-blur-sm ${
                            isSteam
                              ? 'bg-purple-950/80 text-purple-300 border border-purple-500/30'
                              : 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {game.tag}
                        </span>

                        {/* In-Cart badge */}
                        {inCartCount > 0 && (
                          <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-cyan-400 text-black font-extrabold text-xs flex items-center justify-center shadow-lg font-orbitron animate-pulse">
                            {inCartCount}
                          </span>
                        )}

                        {/* Edit in Admin Action Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwitchToAdmin();
                          }}
                          className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded bg-black/60 hover:bg-purple-600 text-gray-300 hover:text-white flex items-center justify-center text-[10px] transition cursor-pointer"
                          title="Edit product in Admin Dashboard"
                        >
                          <i className="fa-solid fa-pen"></i>
                        </button>
                      </div>

                      {/* Info & Price */}
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-[10px] text-gray-400 font-semibold line-clamp-1 uppercase">
                            {game.genre}
                          </p>
                          <h4
                            className="font-rajdhani font-bold text-xs sm:text-sm text-gray-100 line-clamp-2 leading-tight group-hover:text-cyan-300 transition"
                            title={game.name}
                          >
                            {game.name}
                          </h4>
                        </div>

                        <div className="mt-2 pt-1 border-t border-purple-900/30 flex items-center justify-between">
                          <span className="font-orbitron font-extrabold text-xs sm:text-sm text-cyan-400">
                            {price === 0 ? 'FREE' : `$${price.toFixed(2)}`}
                          </span>
                          <span className="text-[10px] text-purple-300 font-rajdhani font-bold">
                            {price === 0 ? '0 ៛' : `${priceKhr.toLocaleString()} ៛`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Register Ticket & Checkout Panel */}
        <div className="lg:col-span-5 2xl:col-span-5 min-[2400px]:col-span-5 bg-[#0f172a] rounded-2xl border border-purple-500/30 flex flex-col overflow-hidden shadow-2xl">
          {/* Register Header */}
          <div className="p-4 bg-[#131b2e] border-b border-purple-900/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-basket-shopping text-cyan-400"></i>
              <span className="font-orbitron font-bold text-sm text-white">ORDER TICKET</span>
              <span className="text-xs bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
                {cart.reduce((a, b) => a + b.quantity, 0)} Items
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCustomerFields(!showCustomerFields)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition cursor-pointer flex items-center gap-1 ${
                  showCustomerFields || customerName
                    ? 'bg-purple-900/50 text-purple-200 border-purple-400'
                    : 'bg-slate-800 text-gray-400 border-slate-700 hover:text-white'
                }`}
                title="Customer details"
              >
                <i className="fa-solid fa-user text-xs"></i>
                <span className="hidden sm:inline">Customer</span>
              </button>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs px-2 py-1 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 transition cursor-pointer"
                  title="Clear all items in cart"
                >
                  <i className="fa-solid fa-trash-can mr-1"></i>
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* Customer info fields (Collapsible) */}
          {showCustomerFields && (
            <div className="p-3 bg-[#0a0f1d] border-b border-purple-900/30 grid grid-cols-2 gap-2 text-xs animate-in slide-in-from-top-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer Name (e.g. Sokha)"
                className="bg-[#131b2e] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
              />
              <input
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone / Telegram (012...)"
                className="bg-[#131b2e] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
              />
            </div>
          )}

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto max-h-[300px] p-3 space-y-2 divide-y divide-purple-900/20">
            {cart.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <i className="fa-solid fa-cart-arrow-down text-3xl mb-2 text-gray-600"></i>
                <p className="text-xs font-semibold">Cart is currently empty</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Click on any game card or scan barcode to add to this order.
                </p>
              </div>
            ) : (
              cart.map((item) => {
                const lineTotal = item.unitPrice * item.quantity;
                return (
                  <div
                    key={item.game.id}
                    className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                  >
                    {/* Thumbnail & Name */}
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <img
                        src={item.game.img}
                        alt={item.game.name}
                        className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0 border border-purple-900/40"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/80x80/131b2e/ffffff?text=Game';
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-rajdhani font-bold text-gray-100 truncate text-xs">
                          {item.game.name}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          ${item.unitPrice.toFixed(2)} each • {item.game.tag}
                        </p>
                      </div>
                    </div>

                    {/* Stepper (+ / -) */}
                    <div className="flex items-center gap-1.5 bg-[#131b2e] px-1.5 py-0.5 rounded-lg border border-purple-900/50">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.game.id, -1)}
                        className="w-5 h-5 rounded hover:bg-purple-900/60 text-gray-300 flex items-center justify-center font-bold"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-orbitron font-bold text-white text-xs">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.game.id, 1)}
                        className="w-5 h-5 rounded hover:bg-purple-900/60 text-gray-300 flex items-center justify-center font-bold"
                      >
                        +
                      </button>
                    </div>

                    {/* Line Total & Remove */}
                    <div className="text-right flex items-center gap-2">
                      <span className="font-orbitron font-bold text-cyan-400 text-xs w-14 text-right">
                        ${lineTotal.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.game.id)}
                        className="text-gray-500 hover:text-red-400 transition"
                      >
                        <i className="fa-solid fa-xmark text-xs"></i>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Discount & Price Summary */}
          <div className="p-4 bg-[#131b2e] border-t border-purple-900/40 space-y-2.5">
            {/* Quick Discount Selector */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Discount:</span>
              <div className="flex items-center gap-1">
                {[0, 5, 10, 20].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDiscountPercent(d)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-rajdhani transition cursor-pointer ${
                      discountPercent === d
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {d === 0 ? 'None' : `${d}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Calculations Breakdown */}
            <div className="space-y-1 text-xs text-gray-400 pt-1 border-t border-purple-900/20">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span className="text-gray-200">${subtotalUsd.toFixed(2)}</span>
              </div>
              {discountAmountUsd > 0 && (
                <div className="flex justify-between text-red-400">
                  <span>Discount ({discountPercent}%):</span>
                  <span>-${discountAmountUsd.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Big Grand Total Display */}
            <div className="pt-2 border-t border-purple-900/40 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                  Total Payable
                </span>
                <div className="text-2xl sm:text-3xl font-orbitron font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-fuchsia-400 to-cyan-400">
                  ${totalUsd.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 block">Cambodian Riel (៛)</span>
                <span className="text-lg sm:text-xl font-orbitron font-bold text-cyan-400">
                  {totalKhr.toLocaleString()} ៛
                </span>
              </div>
            </div>

            {/* PAY BUTTON - Opens Payment Modal */}
            <div className="pt-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setIsPaymentModalOpen(true)}
                className={`w-full py-3.5 rounded-2xl font-orbitron font-extrabold text-sm text-white transition shadow-lg flex items-center justify-center gap-2 cursor-pointer ${
                  cart.length === 0
                    ? 'bg-slate-800 text-gray-500 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-[#E11D48] via-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 shadow-lg shadow-rose-950/60 active:scale-[0.98]'
                }`}
              >
                <i className="fa-solid fa-credit-card text-base"></i>
                <span>PAY • ${totalUsd.toFixed(2)}</span>
                <span className="text-xs font-mono text-rose-200 font-normal">
                  ({totalKhr.toLocaleString()} ៛)
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Receipt Modal (Prints & Shares) */}
      <POSReceiptModal
        sale={activeReceipt}
        settings={settings}
        onClose={() => setActiveReceipt(null)}
        onNewSale={() => {
          setActiveReceipt(null);
          clearCart();
        }}
      />

      {/* Sales History Modal */}
      <POSSalesHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        sales={sales}
        onSelectSale={(s) => setActiveReceipt(s)}
        onDeleteSale={(id) => {
          StorageService.deleteSale(id);
          setSales(StorageService.getSales());
          onShowToast('Deleted sale record');
        }}
        onClearAll={() => {
          StorageService.clearSales();
          setSales([]);
          onShowToast('Cleared sales history');
        }}
        exchangeRate={exchangeRate}
      />

      {/* POS Payment Modal (Bakong KHQR / Cash - Matches Screenshot) */}
      <POSPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        cart={cart}
        subtotalUsd={subtotalUsd}
        discountPercent={discountPercent}
        discountAmountUsd={discountAmountUsd}
        taxPercent={taxPercent}
        taxAmountUsd={taxAmountUsd}
        totalUsd={totalUsd}
        totalKhr={totalKhr}
        exchangeRate={exchangeRate}
        settings={settings}
        cashierName={cashierName}
        customerName={customerName}
        customerPhone={customerPhone}
        onConfirmSuccess={(saleRecord) => {
          StorageService.saveSale(saleRecord);
          setSales(StorageService.getSales());
          setActiveReceipt(saleRecord);
          clearCart();
          onShowToast(`🎉 ការទូទាត់ជោគជ័យ! បង្កើតវិក្កយបត្រ ${saleRecord.receiptNo}`, 'success');
        }}
        onShowToast={onShowToast}
      />

      {/* Daily Financial Report Modal for POS */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#0f172a] rounded-2xl border border-emerald-500/50 shadow-2xl max-w-7xl 2xl:max-w-[96vw] min-[2400px]:max-w-[3200px] w-full p-4 sm:p-6 my-auto max-h-[94vh] overflow-y-auto relative ring-1 ring-emerald-500/30">
            <div className="flex items-center justify-between pb-4 border-b border-gray-800 mb-4 sticky top-0 bg-[#0f172a] z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <i className="fa-solid fa-file-invoice-dollar text-lg"></i>
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-base text-white">Report</h3>
                  <p className="text-xs text-gray-400">POS Integrated Profit Ledger & Google Sheets Summary</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-red-600/80 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                title="Close Report Modal"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>
            <DailyFinancialReport onShowToast={onShowToast} />
          </div>
        </div>
      )}
    </div>
  );
};
