import React, { useState, useEffect, useId, useRef } from 'react';
import { Game, SiteSettings, UserAccountsConfig, UserRole } from '../types/game';
import { StorageService } from '../services/storageService';
import { POSUploadProductModal } from './POSUploadProductModal';
import { POSMultiUploadModal } from './POSMultiUploadModal';
import { DailyFinancialReport } from './DailyFinancialReport';
import { compressImageFile } from '../utils/imageUtils';

interface AdminDashboardProps {
  games: Game[];
  settings: SiteSettings;
  onSaveGame: (game: Omit<Game, 'id'> & { id?: string }) => Game;
  onSaveMultipleGames: (games: (Omit<Game, 'id'> & { id?: string })[]) => Game[];
  onUpdateGame: (game: Game) => void;
  onDeleteGame: (id: string) => void;
  onDeleteMultipleGames: (ids: string[]) => void;
  onResetToDefault: () => void;
  onSaveSettings: (settings: SiteSettings) => void;
  onUpdateCredentials: (user: string, pass: string) => boolean;
  onExportBackup: () => void;
  onImportBackup: (fileContent: string) => { success: boolean; count?: number; error?: string };
  onLogout: () => void;
  onCloseAdmin: () => void;
  onOpenPos?: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefreshGames?: () => void;
}

type AdminTab = 'games' | 'reports' | 'settings' | 'users' | 'backup';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  games,
  settings,
  onSaveGame,
  onSaveMultipleGames,
  onUpdateGame,
  onDeleteGame,
  onDeleteMultipleGames,
  onResetToDefault,
  onSaveSettings,
  onUpdateCredentials,
  onExportBackup,
  onImportBackup,
  onLogout,
  onCloseAdmin,
  onOpenPos,
  onShowToast,
  onRefreshGames,
}) => {

  const [activeTab, setActiveTab] = useState<AdminTab>('games');
  const [searchFilter, setSearchFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [editingGame, setEditingGame] = useState<Game | null>(null);

  // Single Game Form State
  const [formName, setFormName] = useState('');
  const [formTag, setFormTag] = useState('Steam Offline');
  const [formGenre, setFormGenre] = useState('Action RPG');
  const [formImg, setFormImg] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('0');
  const [previewError, setPreviewError] = useState(false);



  // Upload Modals & QR State (Moved from POS to Admin)
  const [isSingleUploadOpen, setIsSingleUploadOpen] = useState(false);
  const [isMultiUploadOpen, setIsMultiUploadOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrImage, setQrImage] = useState(settings.qrCodeImage || '');
  const [qrLabel, setQrLabel] = useState(settings.qrCodeLabel || 'ABA PAY / KHQR');
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  // Settings State
  const [localSettings, setLocalSettings] = useState<SiteSettings>({ ...settings });

  useEffect(() => {
    setLocalSettings(settings);
    setQrImage(settings.qrCodeImage || '');
    setQrLabel(settings.qrCodeLabel || 'ABA PAY / KHQR');
  }, [settings]);

  // User Accounts State (Admin & POS Cashier)
  const [userAccounts, setUserAccounts] = useState<UserAccountsConfig>(() =>
    StorageService.getUserAccounts()
  );
  const [adminUsername, setAdminUsername] = useState(userAccounts.admin.username);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');

  const [posUsername, setPosUsername] = useState(userAccounts.pos.username);
  const [posPassword, setPosPassword] = useState('');
  const [posConfirmPassword, setPosConfirmPassword] = useState('');

  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    const current = StorageService.getUserAccounts();
    setUserAccounts(current);
    setAdminUsername(current.admin.username);
    setPosUsername(current.pos.username);

    const unsub = StorageService.subscribeToUserAccounts((accs) => {
      setUserAccounts(accs);
      setAdminUsername(accs.admin.username);
      setPosUsername(accs.pos.username);
    });
    return () => unsub();
  }, []);

  // Confirmation Modals
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fileInputId = useId();
  const backupInputId = useId();

  // QR Code Upload & Management Handlers
  const handleQrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      onShowToast('File size is too large (max 5MB)', 'error');
      return;
    }
    setIsUploadingQr(true);
    try {
      const compressed = await compressImageFile(file, 640, 640, 0.9);
      setQrImage(compressed);
      onShowToast('QR Code image loaded successfully!');
    } catch {
      onShowToast('Failed to load QR code image file', 'error');
    } finally {
      setIsUploadingQr(false);
    }
  };

  const handleSaveQrCode = () => {
    const updatedSettings: SiteSettings = {
      ...localSettings,
      qrCodeImage: qrImage.trim() || undefined,
      qrCodeLabel: qrLabel.trim() || 'ABA PAY / KHQR',
    };
    setLocalSettings(updatedSettings);
    onSaveSettings(updatedSettings);
    setIsQrModalOpen(false);
    onShowToast('🎉 Payment QR Code saved successfully! Will display on receipts and POS.');
  };

  const handleDeleteQrCode = () => {
    setQrImage('');
    const updatedSettings: SiteSettings = {
      ...localSettings,
      qrCodeImage: undefined,
    };
    setLocalSettings(updatedSettings);
    onSaveSettings(updatedSettings);
    onShowToast('QR Code removed successfully.');
  };

  const handleSaveProductFromAdmin = (productData: Omit<Game, 'id'> & { id?: string }) => {
    const saved = onSaveGame(productData);
    onShowToast(`🎉 ផលិតផល "${saved.name}" ត្រូវបាន Upload ចូល Catalog និង Storefront រួចរាល់!`);
    return saved;
  };

  const handleSaveMultipleFromAdmin = (products: (Omit<Game, 'id'> & { id?: string })[]) => {
    const saved = onSaveMultipleGames(products);
    onShowToast(`🎉 បាន Upload ${saved.length} ផលិតផលចូលក្នុង Catalog & Storefront រួចរាល់!`);
    return saved;
  };

  // Filtered games in admin
  const filteredGames = games.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      g.genre.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesTag =
      tagFilter === 'all'
        ? true
        : tagFilter === 'product'
        ? g.tag.toLowerCase().includes('product')
        : tagFilter === 'steam'
        ? g.tag.toLowerCase().includes('steam')
        : !g.tag.toLowerCase().includes('steam') && !g.tag.toLowerCase().includes('product');
    return matchesSearch && matchesTag;
  });

  const steamCount = games.filter((g) => g.tag.toLowerCase().includes('steam')).length;
  const productCount = games.filter((g) => g.tag.toLowerCase().includes('product')).length;
  const freeCount = games.length - steamCount - productCount;

  // Edit Game Handlers (Editing existing games in Catalog)
  const handleStartEdit = (game: Game) => {
    setEditingGame(game);
    setFormName(game.name);
    setFormTag(game.tag);
    setFormGenre(game.genre);
    setFormImg(game.img);
    setFormLink(game.link || '');
    setFormDesc(game.description || '');
    setFormPrice(game.price !== undefined ? game.price.toString() : '');
    setFormCostPrice(game.costPrice !== undefined ? game.costPrice.toString() : '0');
    setPreviewError(false);
  };

  const handleCancelEdit = () => {
    setEditingGame(null);
    setFormName('');
    setFormImg('');
    setFormPrice('');
    setFormCostPrice('0');
    setPreviewError(false);
  };

  const handleSingleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        onShowToast('File size is too large (max 15MB)', 'error');
        return;
      }
      try {
        const compressed = await compressImageFile(file, 640, 850, 0.82);
        setFormImg(compressed);
        setPreviewError(false);
        onShowToast('Image compressed & loaded successfully!');
      } catch (err) {
        console.error('Image compression error', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setFormImg(base64);
          setPreviewError(false);
          onShowToast('Image loaded successfully!');
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmitSingleGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onShowToast('Please enter game name', 'error');
      return;
    }
    if (!formImg.trim()) {
      onShowToast('Please provide an image URL or upload an image file', 'error');
      return;
    }

    if (editingGame) {
      onUpdateGame({
        ...editingGame,
        name: formName.trim(),
        tag: formTag.trim(),
        genre: formGenre.trim(),
        img: formImg.trim(),
        link: formLink.trim() || undefined,
        description: formDesc.trim() || undefined,
        price: formPrice !== '' && !isNaN(parseFloat(formPrice)) ? parseFloat(formPrice) : undefined,
        costPrice: formCostPrice !== '' && !isNaN(parseFloat(formCostPrice)) ? parseFloat(formCostPrice) : 0,
      });
      onShowToast(`Updated "${formName}" successfully!`);
    } else {
      onSaveGame({
        name: formName.trim(),
        tag: formTag.trim(),
        genre: formGenre.trim(),
        img: formImg.trim(),
        link: formLink.trim() || undefined,
        description: formDesc.trim() || undefined,
        price: formPrice !== '' && !isNaN(parseFloat(formPrice)) ? parseFloat(formPrice) : undefined,
        costPrice: formCostPrice !== '' && !isNaN(parseFloat(formCostPrice)) ? parseFloat(formCostPrice) : 0,
      });
      onShowToast(`Added "${formName}" to catalog & storefront!`);
    }

    handleCancelEdit();
  };



  // Batch Selection in Catalog
  const toggleSelectAllVisible = () => {
    if (selectedGameIds.length === filteredGames.length) {
      setSelectedGameIds([]);
    } else {
      setSelectedGameIds(filteredGames.map((g) => g.id));
    }
  };

  const toggleSelectGame = (id: string) => {
    setSelectedGameIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleBatchDelete = () => {
    if (selectedGameIds.length === 0) {
      onShowToast('Please select at least 1 game to delete', 'error');
      return;
    }
    setShowBatchDeleteConfirm(true);
  };

  const handleConfirmBatchDelete = () => {
    const count = selectedGameIds.length;
    onDeleteMultipleGames(selectedGameIds);
    setSelectedGameIds([]);
    setShowBatchDeleteConfirm(false);
    onShowToast(`Successfully deleted ${count} games from catalog.`);
  };

  // Save Settings
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(localSettings);
    onShowToast('Settings saved successfully!');
  };

  // Update Admin Credentials
  const handleSaveAdminCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUsername.trim()) {
      onShowToast('Admin username មិនអាចទទេបានទេ!', 'error');
      return;
    }
    if (adminPassword && adminPassword !== adminConfirmPassword) {
      onShowToast('Admin Passwords មិនដូចគ្នាទេ (Passwords do not match)', 'error');
      return;
    }
    if (adminPassword && adminPassword.length < 4) {
      onShowToast('Admin password ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ', 'error');
      return;
    }

    const newPass = adminPassword.trim() || userAccounts.admin.passwordHash;
    const ok = StorageService.updateUserAccount('admin', adminUsername.trim(), newPass);
    if (ok) {
      onShowToast('✅ បានកែប្រែ Username & Password របស់ Admin ជោគជ័យ!', 'success');
      setAdminPassword('');
      setAdminConfirmPassword('');
      setUserAccounts(StorageService.getUserAccounts());
    } else {
      onShowToast('មិនអាចកែប្រែបានទេ សូមសាកល្បងម្ដងទៀត', 'error');
    }
  };

  // Update POS Cashier Credentials
  const handleSavePosCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!posUsername.trim()) {
      onShowToast('POS username មិនអាចទទេបានទេ!', 'error');
      return;
    }
    if (posPassword && posPassword !== posConfirmPassword) {
      onShowToast('POS Passwords មិនដូចគ្នាទេ (Passwords do not match)', 'error');
      return;
    }
    if (posPassword && posPassword.length < 4) {
      onShowToast('POS password ត្រូវមានយ៉ាងហោចណាស់ ៤ តួអក្សរ', 'error');
      return;
    }

    const newPass = posPassword.trim() || userAccounts.pos.passwordHash;
    const ok = StorageService.updateUserAccount('pos', posUsername.trim(), newPass);
    if (ok) {
      onShowToast('✅ បានកែប្រែ Username & Password របស់ POS Cashier ជោគជ័យ!', 'success');
      setPosPassword('');
      setPosConfirmPassword('');
      setUserAccounts(StorageService.getUserAccounts());
    } else {
      onShowToast('មិនអាចកែប្រែបានទេ សូមសាកល្បងម្ដងទៀត', 'error');
    }
  };

  // Google AI Studio <-> GitHub <-> Netlify Sync Handlers
  const handleSyncWithCodebase = () => {
    const res = StorageService.syncWithCodebase();
    if (res.addedCount > 0) {
      onRefreshGames?.();
      onShowToast(`🎉 បាន Sync ជោគជ័យ! បញ្ចូលបន្ថែម ${res.addedCount} ហ្គេមថ្មីពី GitHub Codebase (សរុប: ${res.totalGames})`);
    } else {
      onShowToast(`👍 ទិន្នន័យ Catalog របស់អ្នកបានស៊ីសង្វាក់គ្នា 100% ជាមួយ Codebase រួចរាល់ហើយ! (សរុប: ${res.totalGames} Games)`);
    }
  };

  const handleDownloadInitialGames = () => {
    StorageService.downloadCatalogCode();
    onShowToast('📥 បានទាញយក file "initialGames.ts" ជោគជ័យ! អ្នកអាចយកទៅដាក់ក្នុង GitHub ដើម្បី Deploy លើ Netlify បានភ្លាមៗ។');
  };

  const handleCopyCode = async () => {
    try {
      const code = StorageService.exportCatalogAsCode();
      await navigator.clipboard.writeText(code);
      onShowToast('📋 បាន Copy កូដ TypeScript ចូលក្នុង Clipboard រួចរាល់!');
    } catch {
      onShowToast('ពុំអាច Copy ស្វ័យប្រវត្តិបានទេ។ សូមប្រើប៊ូតុង Download ជំនួសវិញ។', 'info');
    }
  };

  const handleDownloadCatalogJson = () => {
    StorageService.downloadCatalogJson();
    onShowToast('📦 បានទាញយក Catalog JSON រួចរាល់!');
  };

  // Backup Import Handler
  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const result = onImportBackup(text);
        if (result.success) {
          onShowToast(`Successfully restored ${result.count} games from backup!`);
        } else {
          onShowToast(result.error || 'Failed to import backup', 'error');
        }
      };
      reader.readAsText(file);
    }
  };

  const renderUserAccountsSection = () => (
    <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-purple-500/40 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-purple-900/40">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-neon-purple shrink-0">
            <i className="fa-solid fa-users-gear text-lg"></i>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-orbitron font-bold text-lg text-white">
                USER ACCOUNTS & PASSWORDS (គ្រប់គ្រងគណនី ២)
              </h3>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-mono px-2 py-0.5 rounded-full border border-emerald-500/40 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Cloud Synced (Firestore)</span>
              </span>
            </div>
            <p className="text-xs text-gray-400">
              កំណត់ Username និង Password ដាច់ដោយឡែកសម្រាប់ Admin (Full) និង POS Cashier (POS Only)
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPasswords(!showPasswords)}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer transition border border-slate-700"
        >
          <i className={`fa-solid ${showPasswords ? 'fa-eye-slash' : 'fa-eye'} text-xs text-purple-400`}></i>
          <span>{showPasswords ? 'Hide Passwords' : 'Show Passwords'}</span>
        </button>
      </div>

      {/* Dual Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: ADMIN ACCOUNT */}
        <div className="bg-[#131b2e] p-5 sm:p-6 rounded-2xl border border-purple-500/40 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-purple-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300">
                  <i className="fa-solid fa-crown text-sm"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-sm text-white flex items-center gap-2">
                    <span>1. គណនី ADMIN</span>
                  </h4>
                  <span className="text-[10px] text-purple-300 font-mono">
                    Current User: {userAccounts.admin.username}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                FULL ACCESS
              </span>
            </div>

            <p className="text-[11px] text-gray-400 mb-4 bg-purple-950/40 p-2.5 rounded-xl border border-purple-900/40 leading-relaxed">
              👑 <strong>សិទ្ធិពេញលេញ:</strong> អាចចូលគ្រប់គ្រងបានទាំង Admin Dashboard, របាយការណ៍ហិរញ្ញវត្ថុ, Catalog, ការកំណត់ និង POS Terminal។
            </p>

            <form onSubmit={handleSaveAdminCredentials} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  ADMIN USERNAME:
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="e.g. admin"
                  className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-purple-500/30 focus:border-purple-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    NEW PASSWORD:
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Leave empty to keep"
                    className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-purple-500/30 focus:border-purple-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    CONFIRM PASSWORD:
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-purple-500/30 focus:border-purple-400 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-orbitron font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk text-xs"></i>
                  <span>SAVE ADMIN CREDENTIALS</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* CARD 2: POS CASHIER ACCOUNT */}
        <div className="bg-[#131b2e] p-5 sm:p-6 rounded-2xl border border-cyan-500/40 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 pb-3 border-b border-cyan-900/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <i className="fa-solid fa-cash-register text-sm"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-sm text-white flex items-center gap-2">
                    <span>2. គណនី POS CASHIER</span>
                  </h4>
                  <span className="text-[10px] text-cyan-300 font-mono">
                    Current User: {userAccounts.pos.username}
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                POS ONLY
              </span>
            </div>

            <p className="text-[11px] text-gray-400 mb-4 bg-cyan-950/40 p-2.5 rounded-xl border border-cyan-900/40 leading-relaxed">
              🔒 <strong>សិទ្ធិប្រើតែ POS:</strong> គណនីនេះត្រូវបានចាក់សោរឱ្យប្រើប្រាស់បានតែ POS Terminal ប៉ុណ្ណោះ មិនអាចចូលមើល Admin ឬរបាយការណ៍ហិរញ្ញវត្ថុបានឡើយ។
            </p>

            <form onSubmit={handleSavePosCredentials} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  POS USERNAME:
                </label>
                <input
                  type="text"
                  value={posUsername}
                  onChange={(e) => setPosUsername(e.target.value)}
                  placeholder="e.g. pos or cashier"
                  className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-cyan-500/30 focus:border-cyan-400 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    NEW PASSWORD:
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={posPassword}
                    onChange={(e) => setPosPassword(e.target.value)}
                    placeholder="Leave empty to keep"
                    className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-cyan-500/30 focus:border-cyan-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                    CONFIRM PASSWORD:
                  </label>
                  <input
                    type={showPasswords ? 'text' : 'password'}
                    value={posConfirmPassword}
                    onChange={(e) => setPosConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full bg-[#0a0f1d] text-xs text-white rounded-xl px-3.5 py-2.5 border border-cyan-500/30 focus:border-cyan-400 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-orbitron font-bold text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk text-xs"></i>
                  <span>SAVE POS CREDENTIALS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080b11] text-gray-100 pb-20">
      {/* Top Banner Navigation */}
      <div className="bg-[#0f172a] border-b border-purple-500/30 sticky top-20 z-30 shadow-xl">
        <div className="w-full max-w-[3600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between py-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-400">
                <i className="fa-solid fa-gauge-high text-lg"></i>
              </div>
              <div>
                <h2 className="font-orbitron font-bold text-lg text-white flex items-center gap-2">
                  <span>ADMIN DASHBOARD</span>
                  <span className="text-[10px] bg-green-500/20 text-green-400 font-mono px-2 py-0.5 rounded-full border border-green-500/30">
                    ONLINE
                  </span>
                </h2>
                <p className="text-xs text-gray-400 font-rajdhani">
                  Catalog Manager, Multi-File Uploader & Telegram Settings
                </p>
              </div>
            </div>

            {/* Quick Metrics & Exit */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 bg-[#131b2e] px-3 py-1.5 rounded-lg border border-purple-900/40 text-xs">
                <span className="text-gray-400">Catalog Total:</span>
                <span className="font-orbitron font-bold text-purple-400">
                  {games.length}
                </span>
              </div>

              {/* SINGLE PRODUCT UPLOAD BUTTON */}
              <button
                type="button"
                onClick={() => setIsSingleUploadOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                title="Upload single product into catalog"
              >
                <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                <span>+ Upload Item</span>
              </button>

              {/* MULTI-PRODUCT UPLOAD BUTTON */}
              <button
                type="button"
                onClick={() => setIsMultiUploadOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 via-teal-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-neon-cyan cursor-pointer"
                title="Batch upload multiple products or images"
              >
                <i className="fa-solid fa-layer-group text-xs"></i>
                <span>+ Multi-Upload</span>
              </button>

              {/* QR CODE UPLOAD BUTTON */}
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                title="Upload payment QR code for ABA KHQR / Bakong"
              >
                <i className="fa-solid fa-qrcode text-xs text-cyan-400"></i>
                <span>QR Upload</span>
              </button>

              {/* DIRECT ACCESS TO USERS & PASSWORDS */}
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer border ${
                  activeTab === 'users'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-neon-purple ring-1 ring-yellow-400'
                    : 'bg-[#131b2e] hover:bg-slate-800 text-yellow-300 border-yellow-500/40 hover:text-white'
                }`}
                title="កែប្រែ Username & Password សម្រាប់ Admin & POS"
              >
                <i className="fa-solid fa-key text-xs text-yellow-400"></i>
                <span>Users & PW (កែប្រែគណនី)</span>
              </button>

              {onOpenPos && (
                <button
                  type="button"
                  onClick={onOpenPos}
                  className="px-3.5 py-1.5 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  title="Open POS Cashier Terminal"
                >
                  <i className="fa-solid fa-cash-register text-xs"></i>
                  <span>POS Terminal</span>
                </button>
              )}

              <button
                onClick={onCloseAdmin}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <i className="fa-solid fa-store"></i>
                <span>View Storefront</span>
              </button>

              <button
                onClick={onLogout}
                className="px-3.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Sign out of Admin Dashboard"
              >
                <i className="fa-solid fa-arrow-right-from-bracket"></i>
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex space-x-1 sm:space-x-2 border-t border-purple-900/30 pt-2 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('games')}
              className={`px-4 py-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              <i className="fa-solid fa-layer-group"></i>
              <span>CATALOG ({games.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer ${
                activeTab === 'reports'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/60'
                  : 'text-emerald-400/90 hover:text-white hover:bg-emerald-950/30 border border-emerald-800/40'
              }`}
            >
              <i className="fa-solid fa-file-invoice-dollar text-emerald-400"></i>
              <span>DAILY FINANCIAL REPORT (របាយការណ៍)</span>
            </button>

            {onOpenPos && (
              <button
                type="button"
                onClick={onOpenPos}
                className="px-4 py-2 rounded-lg text-xs font-orbitron font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-neon-cyan"
                title="Switch directly to POS Cashier Terminal"
              >
                <i className="fa-solid fa-cash-register text-xs"></i>
                <span>POS TERMINAL</span>
              </button>
            )}

            {/* TAB: USERS & PASSWORDS (PROMINENT TAB) */}
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-md shadow-purple-950/60 ring-2 ring-yellow-400/70'
                  : 'text-yellow-300 hover:text-white hover:bg-purple-900/30 border border-yellow-500/40'
              }`}
            >
              <i className="fa-solid fa-users-gear text-yellow-400"></i>
              <span>🔑 USERS & PASSWORDS (គណនី ២)</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              <i className="fa-solid fa-gear"></i>
              <span>⚙️ SETTINGS (ការកំណត់ទូទៅ & TELEGRAM)</span>
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`px-4 py-2 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-2 transition flex-shrink-0 cursor-pointer ${
                activeTab === 'backup'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-gray-400 hover:text-white hover:bg-purple-900/20'
              }`}
            >
              <i className="fa-solid fa-database"></i>
              <span>BACKUP & RESTORE</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-[3600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-8">
        {/* TAB 1: GAMES CATALOG MANAGER */}
        {activeTab === 'games' && (
          <div className="space-y-6">
            {/* Prominent POS Launch Callout Banner */}
            {onOpenPos && (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-cyan-950/70 via-[#131b2e] to-purple-950/70 border border-cyan-500/40 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xl shadow-neon-cyan shrink-0">
                    <i className="fa-solid fa-cash-register"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-orbitron font-bold text-base text-white">
                        POINT OF SALE (POS) CASHIER
                      </h3>
                      <span className="text-[10px] bg-green-950/90 text-green-400 border border-green-500/40 px-2 py-0.5 rounded-full font-mono font-bold">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-xs text-cyan-200/80 font-rajdhani mt-0.5">
                      Barcode Scanning • Multi-Upload Products • Printable Receipts with Short Descriptions • ABA KHQR
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenPos}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-orbitron font-bold text-xs sm:text-sm shadow-neon-cyan flex items-center gap-2 cursor-pointer transition hover:scale-102 shrink-0"
                >
                  <i className="fa-solid fa-cash-register"></i>
                  <span>LAUNCH POS TERMINAL →</span>
                </button>
              </div>
            )}
            {/* Control Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0f172a] p-4 rounded-xl border border-purple-900/40">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                {/* Search in Admin */}
                <div className="relative min-w-[240px] flex-1 max-w-sm">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter games by title or genre..."
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-lg px-3 py-2 pl-9 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-purple-400 text-xs"></i>
                </div>

                {/* Tag Filter */}
                <select
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="bg-[#131b2e] text-xs text-gray-300 rounded-lg px-3 py-2 border border-purple-900/50 outline-none"
                >
                  <option value="all">All Categories ({games.length})</option>
                  <option value="steam">Steam Offline ({steamCount})</option>
                  <option value="product">Product ({productCount})</option>
                  <option value="free">Gameថែមពេលទិញ External ({freeCount})</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {selectedGameIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBatchDelete}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-red-950/60 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-trash-can"></i>
                    <span>Delete Selected ({selectedGameIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsSingleUploadOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold font-orbitron flex items-center gap-2 shadow-lg shadow-purple-950/60 transition cursor-pointer"
                  title="Upload a single product/game"
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>+ UPLOAD PRODUCT</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMultiUploadOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 via-teal-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold font-orbitron flex items-center gap-2 shadow-neon-cyan transition cursor-pointer"
                  title="Batch upload multiple products or images"
                >
                  <i className="fa-solid fa-layer-group"></i>
                  <span>+ MULTI-UPLOAD</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-[#131b2e] hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 text-xs font-bold font-orbitron flex items-center gap-2 transition shadow-sm cursor-pointer"
                  title="Upload and configure ABA KHQR payment code"
                >
                  <i className="fa-solid fa-qrcode text-cyan-400"></i>
                  <span>QR UPLOAD</span>
                </button>

                {onOpenPos && (
                  <button
                    type="button"
                    onClick={onOpenPos}
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-bold font-orbitron flex items-center gap-2 transition cursor-pointer"
                    title="Open POS Terminal Cashier"
                  >
                    <i className="fa-solid fa-cash-register"></i>
                    <span>POS CASHIER</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Summary Pill Bar */}
            <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 px-1 gap-2">
              <div className="flex items-center gap-2">
                <span>
                  Showing <span className="text-purple-400 font-bold">{filteredGames.length}</span> of {games.length} games
                </span>
                {selectedGameIds.length > 0 && (
                  <span className="bg-purple-950/80 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full font-bold">
                    {selectedGameIds.length} selected
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="text-xs text-purple-400 hover:text-purple-300 underline font-medium cursor-pointer"
                >
                  {selectedGameIds.length === filteredGames.length && filteredGames.length > 0
                    ? 'Deselect All'
                    : 'Select All Visible'}
                </button>
                {selectedGameIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedGameIds([])}
                    className="text-xs text-red-400 hover:text-red-300 underline font-medium cursor-pointer"
                  >
                    Clear Selection
                  </button>
                )}
              </div>
            </div>

            {/* Games Table */}
            <div className="bg-[#0f172a] rounded-xl border border-purple-900/40 overflow-hidden shadow-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#131b2e] text-gray-300 font-rajdhani uppercase tracking-wider border-b border-purple-900/40">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedGameIds.length === filteredGames.length &&
                            filteredGames.length > 0
                          }
                          onChange={toggleSelectAllVisible}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                      </th>
                      <th className="p-3 w-16">Cover</th>
                      <th className="p-3">Title & Link</th>
                      <th className="p-3">Category Tag</th>
                      <th className="p-3">Genre</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-950/40">
                    {filteredGames.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-gray-500">
                          No games match your search criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredGames.map((game) => {
                        const isSteam = game.tag.toLowerCase().includes('steam');
                        const isSelected = selectedGameIds.includes(game.id);

                        return (
                          <tr
                            key={game.id}
                            onClick={() => toggleSelectGame(game.id)}
                            className={`hover:bg-[#131b2e]/90 transition cursor-pointer select-none ${
                              isSelected
                                ? 'bg-purple-950/40 ring-1 ring-inset ring-purple-500/50'
                                : ''
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectGame(game.id)}
                                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                              />
                            </td>
                            <td className="p-3">
                              <img
                                src={game.img}
                                alt={game.name}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://placehold.co/100x140/131b2e/ffffff?text=Cover';
                                }}
                                className="w-10 h-14 object-cover rounded-md border border-purple-900/40"
                              />
                            </td>
                            <td className="p-3 font-medium text-gray-100 max-w-xs">
                              <div className="font-semibold text-sm hover:text-purple-300">
                                {game.name}
                              </div>
                              {game.link ? (
                                <a
                                  href={game.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 mt-0.5 truncate"
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                                  <span className="truncate">{game.link}</span>
                                </a>
                              ) : (
                                <span className="text-[10px] text-gray-500">No store URL</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${
                                  isSteam
                                    ? 'bg-purple-950/80 text-purple-300 border-purple-500/30'
                                    : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/30'
                                }`}
                              >
                                {game.tag}
                              </span>
                            </td>
                            <td className="p-3 text-gray-300">{game.genre}</td>
                            <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEdit(game);
                                  }}
                                  className="p-1.5 bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded-lg border border-purple-700/40 transition cursor-pointer"
                                  title="Edit Game"
                                >
                                  <i className="fa-solid fa-pen-to-square"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeletingId(game.id);
                                  }}
                                  className="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg border border-red-800/40 transition cursor-pointer"
                                  title="Delete Game"
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* EDIT GAME MODAL (Only when editing an existing game from Catalog) */}
        {editingGame && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in"
            onClick={handleCancelEdit}
          >
            <div
              className="relative w-full max-w-2xl bg-[#0f172a] border border-purple-500/50 rounded-2xl shadow-2xl p-6 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-purple-900/40">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-900/50 text-purple-300 flex items-center justify-center border border-purple-500/30">
                    <i className="fa-solid fa-pen-to-square"></i>
                  </div>
                  <div>
                    <h3 className="font-orbitron font-bold text-base text-white">
                      EDIT GAME: {editingGame.name}
                    </h3>
                    <p className="text-xs text-gray-400">Update title, tag, genre or cover artwork</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="w-8 h-8 rounded-lg bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <i className="fa-solid fa-xmark text-sm"></i>
                </button>
              </div>

              <form onSubmit={handleSubmitSingleGame} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">GAME TITLE *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-[#131b2e] text-sm text-gray-200 rounded-xl px-3.5 py-2 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">CATEGORY / TAG *</label>
                    <select
                      value={formTag}
                      onChange={(e) => setFormTag(e.target.value)}
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 outline-none"
                    >
                      <option value="Steam Offline">Steam Offline</option>
                      <option value="Product">Product (ទំនិញ / រូបវន្ត)</option>
                      <option value="Account">Account (គណនី)</option>
                      <option value="Gameថែមពេលទិញ External">Gameថែមពេលទិញ External</option>
                      <option value="Custom Game">Custom Game</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">GENRE *</label>
                    <input
                      type="text"
                      required
                      value={formGenre}
                      onChange={(e) => setFormGenre(e.target.value)}
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      SELLING PRICE ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-mono text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="5.00"
                        value={formPrice}
                        onChange={(e) => setFormPrice(e.target.value)}
                        className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl pl-7 pr-3 py-2 border border-purple-900/50 outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-emerald-400 mb-1 flex items-center justify-between">
                      <span>BUY-IN COST ($ USD)</span>
                      <span className="text-[10px] text-gray-400 font-normal">Auto = $0.00</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono text-xs">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formCostPrice}
                        onChange={(e) => setFormCostPrice(e.target.value)}
                        className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl pl-7 pr-3 py-2 border border-emerald-900/50 outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">COVER IMAGE URL OR UPLOAD</label>
                  <input
                    type="text"
                    value={formImg}
                    onChange={(e) => {
                      setFormImg(e.target.value);
                      setPreviewError(false);
                    }}
                    placeholder="https://..."
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 outline-none mb-2"
                  />
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={fileInputId}
                      className="cursor-pointer px-3 py-1.5 rounded-lg bg-purple-900/40 hover:bg-purple-800/60 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <i className="fa-solid fa-cloud-arrow-up text-cyan-400 text-xs"></i>
                      <span>Upload New Image</span>
                    </label>
                    <input
                      id={fileInputId}
                      type="file"
                      accept="image/*"
                      onChange={handleSingleImageUpload}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (navigator.clipboard?.readText) {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) {
                              setFormImg(text.trim());
                              setPreviewError(false);
                              onShowToast('Image URL pasted from clipboard!', 'success');
                              return;
                            }
                          }
                        } catch {
                          // fallback
                        }
                        onShowToast('Please press Ctrl+V inside the URL box above', 'info');
                      }}
                      className="cursor-pointer px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition"
                      title="Paste image link from clipboard"
                    >
                      <i className="fa-solid fa-paste text-cyan-400 text-xs"></i>
                      <span>Paste URL</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">STORE / DOWNLOAD LINK</label>
                  <input
                    type="url"
                    value={formLink}
                    onChange={(e) => setFormLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">DESCRIPTION</label>
                  <textarea
                    rows={6}
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Product description... (Supports multi-line text)"
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 outline-none leading-relaxed"
                  />
                </div>

                <div className="pt-3 border-t border-purple-900/40 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-white font-orbitron font-bold text-xs shadow-md"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: FINANCIAL REPORT */}
        {activeTab === 'reports' && (
          <DailyFinancialReport onShowToast={onShowToast} />
        )}

        {/* TAB: USERS & PASSWORDS MANAGER (DEDICATED FULL TAB) */}
        {activeTab === 'users' && (
          <div className="max-w-5xl mx-auto space-y-6">
            {renderUserAccountsSection()}
          </div>
        )}

        {/* TAB: SETTINGS & TELEGRAM */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Quick Banner to jump to Users & Passwords Tab */}
            <div className="bg-gradient-to-r from-purple-950/90 via-[#131b2e] to-indigo-950/90 p-4 sm:p-5 rounded-2xl border-2 border-yellow-500/50 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-300 text-lg shrink-0">
                  <i className="fa-solid fa-key"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-sm text-yellow-300">
                    USER ACCOUNTS & PASSWORDS (គ្រប់គ្រងគណនី ២)
                  </h4>
                  <p className="text-xs text-gray-300">
                    កំណត់ Username និង Password សម្រាប់ Admin (Full Access) និង POS Cashier (POS Only)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('users')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-orbitron font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer shrink-0"
              >
                <span>បើកផ្ទាំងគណនី (USERS & PW)</span>
                <i className="fa-solid fa-arrow-right text-xs"></i>
              </button>
            </div>
            {/* General Site & Telegram Settings Form */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-purple-500/40 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-purple-900/40">
                <i className="fa-brands fa-telegram text-cyan-400 text-2xl"></i>
                <div>
                  <h3 className="font-orbitron font-bold text-lg text-white">
                    TELEGRAM & PORTAL CONFIGURATION
                  </h3>
                  <p className="text-xs text-gray-400">
                    Customize the recipient Telegram handle, banners, and Khmer texts.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    TELEGRAM ADMIN HANDLE (Recipient of all game orders)
                  </label>
                  <input
                    type="text"
                    value={localSettings.telegramAdminHandle}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, telegramAdminHandle: e.target.value })
                    }
                    placeholder="@KaniGame168"
                    className="w-full bg-[#131b2e] text-xs font-mono text-cyan-300 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    When customers click &quot;SEND TELEGRAM&quot;, their game request will be sent to this Telegram username.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    HERO BANNER TITLE
                  </label>
                  <input
                    type="text"
                    value={localSettings.heroTitle}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, heroTitle: e.target.value })
                    }
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    HERO BANNER BADGE (KHMER)
                  </label>
                  <input
                    type="text"
                    value={localSettings.heroBadge}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, heroBadge: e.target.value })
                    }
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    HERO BANNER DESCRIPTION (KHMER INSTRUCTION)
                  </label>
                  <textarea
                    rows={3}
                    value={localSettings.heroDescription}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, heroDescription: e.target.value })
                    }
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-orbitron font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>SAVE SETTINGS</span>
                  </button>
                </div>
              </form>
            </div>

            {/* ABA PAY / KHQR / BAKONG PAYMENT QR CODE */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-cyan-500/40 shadow-2xl">
              <div className="flex items-center justify-between gap-3 mb-6 pb-4 border-b border-cyan-900/40 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <i className="fa-solid fa-qrcode text-xl"></i>
                  </div>
                  <div>
                    <h3 className="font-orbitron font-bold text-lg text-white">
                      PAYMENT QR CODE (ABA KHQR / BAKONG)
                    </h3>
                    <p className="text-xs text-gray-400">
                      Displayed in POS Cashier ABA Pay checkout and printed directly on receipts.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-orbitron font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                  <span>UPLOAD / CHANGE QR</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                <div className="flex flex-col items-center justify-center p-4 bg-[#131b2e] rounded-xl border border-purple-900/40">
                  {localSettings.qrCodeImage ? (
                    <div className="relative group">
                      <img
                        src={localSettings.qrCodeImage}
                        alt="Payment QR"
                        className="w-44 h-44 object-contain bg-white p-2 rounded-xl border-2 border-cyan-400 shadow-neon-cyan"
                      />
                      <div className="mt-2 text-center">
                        <span className="text-[11px] font-bold text-cyan-300 font-orbitron">
                          {localSettings.qrCodeLabel || 'ABA KHQR Active'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsQrModalOpen(true)}
                      className="w-44 h-44 border-2 border-dashed border-gray-600 hover:border-cyan-400 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:text-cyan-300 transition cursor-pointer p-4 text-center bg-slate-900/50"
                    >
                      <i className="fa-solid fa-qrcode text-3xl mb-2 text-gray-500"></i>
                      <span className="text-xs font-bold font-orbitron">No QR Code Uploaded</span>
                      <span className="text-[10px] text-gray-500 mt-1">Click to upload ABA KHQR</span>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      QR CODE DISPLAY LABEL
                    </label>
                    <input
                      type="text"
                      value={qrLabel}
                      onChange={(e) => setQrLabel(e.target.value)}
                      placeholder="e.g. ABA PAY (012 345 678) / KHQR"
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-cyan-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Subtitle shown under the QR code on receipts and the cashier payment popup.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsQrModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-orbitron font-bold text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-upload"></i>
                      <span>{localSettings.qrCodeImage ? 'Replace QR Code' : 'Upload QR Code'}</span>
                    </button>

                    {localSettings.qrCodeImage && (
                      <button
                        type="button"
                        onClick={handleDeleteQrCode}
                        className="px-4 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/40 font-orbitron font-bold text-xs flex items-center gap-2 cursor-pointer transition"
                      >
                        <i className="fa-solid fa-trash-can"></i>
                        <span>Remove QR Code</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* User Accounts & Role Permissions (Admin & POS) */}
            {renderUserAccountsSection()}
          </div>
        )}

        {/* TAB 5: BACKUP, RESTORE & FACTORY RESET */}
        {activeTab === 'backup' && (
          <div className="max-w-4xl mx-auto space-y-8">
            {/* CARD 1: GOOGLE AI STUDIO ↔ GITHUB ↔ NETLIFY LIVE DATA SYNC */}
            <div className="bg-gradient-to-br from-[#0e172e] via-[#0f172a] to-[#161233] p-6 sm:p-8 rounded-2xl border-2 border-cyan-500/50 shadow-[0_0_35px_rgba(6,182,212,0.25)] relative overflow-hidden">
              <div className="absolute top-0 right-0 transform translate-x-8 -translate-y-8 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-cyan-900/40">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-purple-600 flex items-center justify-center text-white shadow-neon-cyan shrink-0">
                    <i className="fa-solid fa-cloud-arrow-up text-xl"></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-orbitron font-extrabold text-lg text-white">
                        GOOGLE AI ↔ GITHUB ↔ NETLIFY SYNC
                      </h3>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-mono px-2.5 py-0.5 rounded-full border border-emerald-500/40 font-bold">
                        ACTIVE DUAL-STORAGE
                      </span>
                    </div>
                    <p className="text-xs text-cyan-300/90 font-rajdhani mt-0.5">
                      ធ្វើឱ្យទិន្នន័យដើរទាំងលើ Google AI Studio, GitHub Repo និង https://netlify.app/
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <span className="text-[11px] text-gray-400">Total in Catalog: </span>
                  <strong className="text-sm font-orbitron text-cyan-400">{games.length} Games</strong>
                </div>
              </div>

              {/* Guide & Status Callout */}
              <div className="bg-[#0b101d]/90 p-4 rounded-xl border border-cyan-500/30 mb-6 space-y-2 text-xs text-gray-300">
                <div className="flex items-start gap-2.5">
                  <i className="fa-solid fa-circle-check text-emerald-400 text-sm mt-0.5 shrink-0"></i>
                  <div>
                    <strong className="text-white">ការ Upload លើ Netlify បានជោគជ័យ 100%:</strong>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      រូបភាពត្រូវបាន Compress ដោយស្វ័យប្រវត្តិ (ទំហំតូច ច្បាស់ខ្លាំង) និងរក្សាទុកក្នុង <strong>IndexedDB</strong> និង <strong>LocalStorage</strong> ដោយគ្មានបញ្ហា QuotaExceededError ឡើយ។
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 pt-2 border-t border-purple-900/30">
                  <i className="fa-solid fa-arrows-rotate text-cyan-400 text-sm mt-0.5 shrink-0"></i>
                  <div>
                    <strong className="text-white">របៀបផ្ទេរទិន្នន័យទៅ GitHub ដើម្បីអោយ Netlify ដំណើរការគ្រប់ Device:</strong>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      1. ចុច <strong>"Download initialGames.ts"</strong> ឬ <strong>"Copy TS Code"</strong> ខាងក្រោម។<br />
                      2. យកទៅ Replace ក្នុង file <code>src/data/initialGames.ts</code> ក្នុង Google AI Studio ឬ Commit ទៅ GitHub។<br />
                      3. Netlify នឹង Build ហ្គេម និងផលិតផលថ្មីៗរបស់អ្នកជា Default Catalog ដោយស្វ័យប្រវត្តិ!
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Button 1: Sync with Codebase */}
                <button
                  type="button"
                  onClick={handleSyncWithCodebase}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white flex flex-col items-center justify-center text-center gap-1.5 shadow-lg shadow-purple-950/60 transition cursor-pointer hover:scale-102"
                >
                  <i className="fa-solid fa-rotate text-lg text-purple-200"></i>
                  <span className="font-orbitron font-bold text-xs">SYNC FROM CODEBASE</span>
                  <span className="text-[10px] text-purple-200/80 font-rajdhani">Merge New Games from Git</span>
                </button>

                {/* Button 2: Download initialGames.ts for GitHub */}
                <button
                  type="button"
                  onClick={handleDownloadInitialGames}
                  className="p-3.5 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white flex flex-col items-center justify-center text-center gap-1.5 shadow-neon-cyan transition cursor-pointer hover:scale-102"
                >
                  <i className="fa-solid fa-file-code text-lg text-cyan-200"></i>
                  <span className="font-orbitron font-bold text-xs">EXPORT FOR GITHUB</span>
                  <span className="text-[10px] text-cyan-200/80 font-rajdhani">Download initialGames.ts</span>
                </button>

                {/* Button 3: Copy TypeScript Code */}
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-purple-500/30 text-gray-200 flex flex-col items-center justify-center text-center gap-1.5 shadow-md transition cursor-pointer hover:scale-102"
                >
                  <i className="fa-solid fa-copy text-lg text-purple-400"></i>
                  <span className="font-orbitron font-bold text-xs">COPY TS CODE</span>
                  <span className="text-[10px] text-gray-400 font-rajdhani">Copy array to clipboard</span>
                </button>

                {/* Button 4: Download Catalog JSON */}
                <button
                  type="button"
                  onClick={handleDownloadCatalogJson}
                  className="p-3.5 rounded-xl bg-[#131b2e] hover:bg-slate-800 border border-cyan-500/40 text-cyan-300 flex flex-col items-center justify-center text-center gap-1.5 shadow-md transition cursor-pointer hover:scale-102"
                >
                  <i className="fa-solid fa-box-archive text-lg text-cyan-400"></i>
                  <span className="font-orbitron font-bold text-xs">CATALOG JSON</span>
                  <span className="text-[10px] text-cyan-400/80 font-rajdhani">Fast JSON export</span>
                </button>
              </div>
            </div>

            {/* CARD 2: STANDARD JSON BACKUP & RESTORATION */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-purple-500/40 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-purple-900/40">
                <i className="fa-solid fa-file-export text-cyan-400 text-2xl"></i>
                <div>
                  <h3 className="font-orbitron font-bold text-lg text-white">
                    DATA BACKUP & RESTORATION
                  </h3>
                  <p className="text-xs text-gray-400">
                    Export your full catalog as a JSON backup, or restore from an existing file.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Export Card */}
                <div className="bg-[#131b2e] p-6 rounded-xl border border-purple-900/40 flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-purple-900/40 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3">
                      <i className="fa-solid fa-download"></i>
                    </div>
                    <h4 className="font-orbitron font-bold text-sm text-white mb-2">
                      EXPORT JSON BACKUP
                    </h4>
                    <p className="text-xs text-gray-400 mb-6">
                      Download a complete backup snapshot of all {games.length} games and portal settings to your device.
                    </p>
                  </div>

                  <button
                    onClick={onExportBackup}
                    className="w-full py-2.5 px-4 rounded-xl font-orbitron font-bold text-xs text-white bg-purple-600 hover:bg-purple-500 transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-file-arrow-down"></i>
                    <span>DOWNLOAD BACKUP (.JSON)</span>
                  </button>
                </div>

                {/* Import Card */}
                <div className="bg-[#131b2e] p-6 rounded-xl border border-purple-900/40 flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-cyan-900/40 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3">
                      <i className="fa-solid fa-upload"></i>
                    </div>
                    <h4 className="font-orbitron font-bold text-sm text-white mb-2">
                      IMPORT JSON BACKUP
                    </h4>
                    <p className="text-xs text-gray-400 mb-6">
                      Upload a previously exported backup file to restore all games and configuration.
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor={backupInputId}
                      className="w-full py-2.5 px-4 rounded-xl font-orbitron font-bold text-xs text-white bg-cyan-600 hover:bg-cyan-500 transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fa-solid fa-file-arrow-up"></i>
                      <span>SELECT & RESTORE FILE</span>
                    </label>
                    <input
                      id={backupInputId}
                      type="file"
                      accept=".json"
                      onChange={handleBackupFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Factory Reset to Original 154 Games */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-red-500/30 shadow-2xl">
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-red-900/40">
                <i className="fa-solid fa-rotate-left text-red-400 text-2xl"></i>
                <div>
                  <h3 className="font-orbitron font-bold text-lg text-white">
                    RESET TO ORIGINAL CATALOG (154 GAMES)
                  </h3>
                  <p className="text-xs text-gray-400">
                    Restores the complete 85 Steam Offline and 69 Free External games dataset from KaniGame.
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed mb-6">
                If you ever want to re-synchronize with the exact original website catalogue (all 154 titles, tags, and covers), click the button below. Your changes can be backed up first using the Export button above.
              </p>

              <button
                onClick={() => setShowResetConfirm(true)}
                className="py-3 px-6 rounded-xl font-orbitron font-bold text-xs text-white bg-red-600 hover:bg-red-500 transition shadow-lg shadow-red-950/50 flex items-center gap-2 cursor-pointer"
              >
                <i className="fa-solid fa-triangle-exclamation"></i>
                <span>RESET CATALOG TO DEFAULT 154 GAMES</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-red-500/50 p-6 rounded-2xl max-w-sm w-full text-center shadow-2xl">
            <i className="fa-solid fa-triangle-exclamation text-red-400 text-3xl mb-3"></i>
            <h4 className="font-orbitron font-bold text-white text-base mb-2">
              Confirm Delete
            </h4>
            <p className="text-xs text-gray-300 mb-6">
              Are you sure you want to remove this game from the catalog? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 text-gray-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteGame(deletingId);
                  setDeletingId(null);
                  onShowToast('Game deleted.');
                }}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0f172a] border border-red-500/60 p-6 rounded-2xl max-w-md w-full text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-red-950/80 border border-red-500/50 flex items-center justify-center text-red-400 text-2xl shadow-lg">
              <i className="fa-solid fa-trash-can"></i>
            </div>
            <h4 className="font-orbitron font-bold text-white text-lg mb-2">
              Delete {selectedGameIds.length} Selected Games?
            </h4>
            <p className="text-xs text-gray-300 mb-6 leading-relaxed">
              Are you sure you want to permanently remove these <span className="text-red-400 font-bold">{selectedGameIds.length}</span> games from your catalog? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowBatchDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-orbitron shadow-lg shadow-red-950/50 transition cursor-pointer"
              >
                Yes, Delete ({selectedGameIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-red-500/50 p-6 rounded-2xl max-w-md w-full text-center shadow-2xl">
            <i className="fa-solid fa-rotate-left text-red-400 text-3xl mb-3"></i>
            <h4 className="font-orbitron font-bold text-white text-base mb-2">
              Restore Default Catalog?
            </h4>
            <p className="text-xs text-gray-300 mb-6">
              This will restore all 154 original Steam Offline and Free external games copied from KaniGame.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-gray-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onResetToDefault();
                  setShowResetConfirm(false);
                  onShowToast('Restored 154 default games successfully!');
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                Yes, Restore All 154 Games
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Product Upload Modal */}
      <POSUploadProductModal
        isOpen={isSingleUploadOpen}
        onClose={() => setIsSingleUploadOpen(false)}
        onSaveProduct={handleSaveProductFromAdmin}
        onOpenMultiUpload={() => setIsMultiUploadOpen(true)}
        exchangeRate={settings.khrExchangeRate || 4100}
      />

      {/* Multi-Product Upload Modal */}
      <POSMultiUploadModal
        isOpen={isMultiUploadOpen}
        onClose={() => setIsMultiUploadOpen(false)}
        onSaveMultipleProducts={handleSaveMultipleFromAdmin}
        exchangeRate={settings.khrExchangeRate || 4100}
        onShowToast={onShowToast}
      />

      {/* QR Code Upload Modal */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-[#0b101b] border border-cyan-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl shadow-cyan-950/60 flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-cyan-900/40 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <i className="fa-solid fa-qrcode text-xl"></i>
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-white text-base">
                    PAYMENT QR CODE UPLOAD
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    ABA KHQR, Bakong, or Wing payment QR code
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="space-y-4">
              {/* QR Code Preview */}
              <div className="flex flex-col items-center justify-center p-4 bg-[#131b2e] rounded-xl border border-purple-900/40">
                {qrImage ? (
                  <div className="flex flex-col items-center">
                    <img
                      src={qrImage}
                      alt="Payment QR Preview"
                      className="w-48 h-48 object-contain bg-white p-2 rounded-xl border-2 border-cyan-400 shadow-neon-cyan"
                    />
                    <span className="text-xs text-cyan-300 font-bold font-orbitron mt-2">
                      {qrLabel || 'ABA PAY / KHQR'}
                    </span>
                  </div>
                ) : (
                  <div className="w-48 h-48 border-2 border-dashed border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-500 p-4 text-center">
                    <i className="fa-solid fa-qrcode text-4xl mb-2 text-gray-600"></i>
                    <span className="text-xs font-semibold">No QR image selected</span>
                    <span className="text-[10px] text-gray-500 mt-1">Upload a screenshot of your ABA KHQR</span>
                  </div>
                )}
              </div>

              {/* Upload File Button */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  UPLOAD QR IMAGE FILE
                </label>
                <label className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-cyan-500/50 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300 text-xs font-bold font-orbitron cursor-pointer transition">
                  {isUploadingQr ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>Compressing & Loading...</span>
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-cloud-arrow-up"></i>
                      <span>Select QR Code Image (PNG / JPG)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrFileUpload}
                    className="hidden"
                    disabled={isUploadingQr}
                  />
                </label>
                <p className="text-[10px] text-gray-500 mt-1">
                  Automatically compressed to high-clarity 640x640 JPEG for fast receipt loading.
                </p>
              </div>

              {/* Or Paste Image URL */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  OR PASTE IMAGE URL
                </label>
                <input
                  type="text"
                  value={qrImage}
                  onChange={(e) => setQrImage(e.target.value)}
                  placeholder="https://... or data:image/jpeg;base64,..."
                  className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2 border border-purple-900/50 outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              {/* QR Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  DISPLAY LABEL ON RECEIPTS & POS
                </label>
                <input
                  type="text"
                  value={qrLabel}
                  onChange={(e) => setQrLabel(e.target.value)}
                  placeholder="e.g. ABA PAY (012 345 678) / KHQR"
                  className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-5 mt-4 border-t border-cyan-900/30">
              {qrImage ? (
                <button
                  type="button"
                  onClick={() => {
                    handleDeleteQrCode();
                    setIsQrModalOpen(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800/40 text-xs font-semibold transition cursor-pointer"
                >
                  <i className="fa-solid fa-trash-can mr-1.5"></i>
                  Remove QR
                </button>
              ) : (
                <div></div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveQrCode}
                  disabled={!qrImage.trim()}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-orbitron font-bold text-xs shadow-neon-cyan flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  <span>Save QR Code</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
