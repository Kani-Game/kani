import React, { useState, useEffect, useId, useRef, useCallback } from 'react';
import { Game, SiteSettings, SteamSpecData, UserAccountsConfig, UserRole, SteamOnlineAutoSyncConfig, SteamOnlineSyncSource } from '../types/game';
import { StorageService } from '../services/storageService';
import { POSUploadProductModal } from './POSUploadProductModal';
import { POSMultiUploadModal } from './POSMultiUploadModal';
import { DailyFinancialReport } from './DailyFinancialReport';
import { GameModal } from './GameModal';
import { CoverMediaForm } from './CoverMediaModal';
import { SteamOnlineCoverForm } from './SteamOnlineCoverModal';
import { PromoCoverTarget } from './SteamOnlineCover';
import { extractSteamAppId, fetchSteamGenresBatch, fetchSteamSpec } from '../services/steamService';
import { blobToCompressedDataUrl, compressDataUrl, compressImageFile } from '../utils/imageUtils';
import { SteamOnlineSyncModal, SteamSyncModalState, SteamSyncFeedItem } from './SteamOnlineSyncModal';
import { MissingSteamSpecsModal } from './MissingSteamSpecsModal';

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

type AdminTab = 'games' | 'reports' | 'settings' | 'backup';
type AdminCatalogViewMode = 'small' | 'medium' | 'large' | 'detail';

const ADMIN_CATALOG_VIEW_KEY = 'kanigame_admin_catalog_view_mode';

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
  onLogout: _onLogout,
  onCloseAdmin: _onCloseAdmin,
  onOpenPos,
  onShowToast,
  onRefreshGames,
}) => {

  const [activeTab, setActiveTab] = useState<AdminTab>('games');
  const [catalogViewMode, setCatalogViewMode] = useState<AdminCatalogViewMode>(() => {
    try {
      const saved = localStorage.getItem(ADMIN_CATALOG_VIEW_KEY);
      if (saved === 'small' || saved === 'medium' || saved === 'large' || saved === 'detail') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'detail';
  });
  const handleSetCatalogViewMode = (mode: AdminCatalogViewMode) => {
    setCatalogViewMode(mode);
    try {
      localStorage.setItem(ADMIN_CATALOG_VIEW_KEY, mode);
    } catch {
      // ignore storage errors
    }
  };
  const [searchFilter, setSearchFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [specFilter, setSpecFilter] = useState<'all' | 'missing' | 'saved' | 'skipped'>('all');
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
  const [formSteamPrice, setFormSteamPrice] = useState('');
  const [formDiscountPercent, setFormDiscountPercent] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [editSteamLink, setEditSteamLink] = useState('');
  const [editSteamGenres, setEditSteamGenres] = useState<string[]>([]);
  const [editSteamSpec, setEditSteamSpec] = useState<SteamSpecData | undefined>(undefined);
  const [formSkipSteamLink, setFormSkipSteamLink] = useState(false);
  const [isEditSteamFetching, setIsEditSteamFetching] = useState(false);
  const [editSteamFeedback, setEditSteamFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const lastEditSteamAppIdRef = useRef<number | null>(null);
  const [specInspectGame, setSpecInspectGame] = useState<Game | null>(null);
  const [isMissingSpecsModalOpen, setIsMissingSpecsModalOpen] = useState(false);
  const [specSyncProgress, setSpecSyncProgress] = useState<{
    done: number;
    total: number;
    saved: number;
  } | null>(null);
  const [genreSyncProgress, setGenreSyncProgress] = useState<{
    done: number;
    total: number;
    updated: number;
  } | null>(null);
  const [adminPromoCoverTab, setAdminPromoCoverTab] = useState<PromoCoverTarget>('steam-online');
  const [steamOnlineSyncConfig, setSteamOnlineSyncConfig] = useState<SteamOnlineAutoSyncConfig>(() =>
    StorageService.getSteamOnlineSyncConfig()
  );
  const [isSyncingSteamOnline, setIsSyncingSteamOnline] = useState(false);
  const [showSteamOnlinePanel, setShowSteamOnlinePanel] = useState(false);
  const [steamSyncModal, setSteamSyncModal] = useState<SteamSyncModalState>({
    isOpen: false,
    isLoading: false,
    addedCount: 0,
    feedGames: [],
  });



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
    const unsubSteamOnline = StorageService.subscribeToSteamOnlineSyncConfig((cfg) => {
      setSteamOnlineSyncConfig(cfg);
    });
    return () => {
      unsub();
      unsubSteamOnline();
    };
  }, []);

  useEffect(() => {
    if (tagFilter === 'steam-online') {
      setShowSteamOnlinePanel(true);
    }
  }, [tagFilter]);

  const handleUpdateSteamOnlineConfig = (patch: Partial<SteamOnlineAutoSyncConfig>) => {
    const saved = StorageService.saveSteamOnlineSyncConfig({
      ...steamOnlineSyncConfig,
      ...patch,
    });
    setSteamOnlineSyncConfig(saved);
  };

  const handleRunSteamOnlineSyncNow = async () => {
    setIsSyncingSteamOnline(true);
    setSteamSyncModal({
      isOpen: true,
      isLoading: true,
      addedCount: 0,
      feedGames: [],
    });
    try {
      const res = await StorageService.syncSteamOnlineGames({
        force: true,
        source: steamOnlineSyncConfig.source,
        limit: steamOnlineSyncConfig.maxGamesPerSync,
        defaultPriceUsd: steamOnlineSyncConfig.defaultPriceUsd,
      });
      setSteamOnlineSyncConfig(res.config);
      onRefreshGames?.();
      setSteamSyncModal({
        isOpen: true,
        isLoading: false,
        addedCount: res.addedCount,
        feedGames: res.feedGames || [],
        error: res.error,
      });
      if (res.error) {
        onShowToast(`Steam Online Sync Error: ${res.error}`, 'error');
      } else if (res.addedCount > 0) {
        onShowToast(`🎉 Auto-Update Steam Online: បានបន្ថែម Game ថ្មី ${res.addedCount} ពី Steam!`);
      } else {
        onShowToast('Steam Online មាន Game ថ្មីៗរួចរាល់ហើយ (No new games to add).', 'info');
      }
    } finally {
      setIsSyncingSteamOnline(false);
    }
  };

  const handleUploadSteamFeedGames = (items: SteamSyncFeedItem[]) => {
    if (items.length === 0) return;
    const result = StorageService.uploadSteamFeedGamesToOnline(items, {
      defaultPriceUsd: steamOnlineSyncConfig.defaultPriceUsd,
    });
    const uploadedIds = new Set(items.map((i) => i.appId));
    setSteamOnlineSyncConfig(StorageService.getSteamOnlineSyncConfig());
    onRefreshGames?.();
    setSteamSyncModal((prev) => ({
      ...prev,
      addedCount: prev.addedCount + result.addedCount,
      feedGames: prev.feedGames.map((g) =>
        uploadedIds.has(g.appId) ? { ...g, status: 'added' as const } : g
      ),
    }));
    onShowToast(
      `🎉 បាន Upload Game ចំនួន ${items.length} ចូល Category "Steam Online" នៅលើ Front Store រួចរាល់!`
    );
  };

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
      const compressed = await compressImageFile(file, 640, 640, 0.85, 180_000);
      setQrImage(compressed);
      onShowToast('QR Code image loaded successfully!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load QR code image file';
      onShowToast(msg, 'error');
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
        : tagFilter === 'steam-online'
        ? g.tag.toLowerCase().includes('steam') && g.tag.toLowerCase().includes('online')
        : tagFilter === 'steam'
        ? g.tag.toLowerCase().includes('steam') && !g.tag.toLowerCase().includes('online')
        : !g.tag.toLowerCase().includes('steam') && !g.tag.toLowerCase().includes('product');
    const isProduct = g.tag.toLowerCase().includes('product');
    const matchesSpec =
      specFilter === 'all'
        ? true
        : specFilter === 'missing'
        ? !isProduct && !g.skipSteamLink && !g.steamSpec
        : specFilter === 'saved'
        ? !isProduct && Boolean(g.steamSpec)
        : !isProduct && Boolean(g.skipSteamLink);
    return matchesSearch && matchesTag && matchesSpec;
  });

  const steamCount = games.filter((g) => {
    const lower = g.tag.toLowerCase();
    return lower.includes('steam') && !lower.includes('online');
  }).length;
  const steamOnlineCount = games.filter((g) => {
    const lower = g.tag.toLowerCase();
    return lower.includes('steam') && lower.includes('online');
  }).length;
  const productCount = games.filter((g) => g.tag.toLowerCase().includes('product')).length;
  const freeCount = games.length - steamCount - steamOnlineCount - productCount;
  const missingSpecsCount = games.filter(
    (g) => !g.tag.toLowerCase().includes('product') && !g.skipSteamLink && !g.steamSpec
  ).length;
  const savedSpecsCount = games.filter(
    (g) => !g.tag.toLowerCase().includes('product') && Boolean(g.steamSpec)
  ).length;
  const skippedSpecsCount = games.filter(
    (g) => !g.tag.toLowerCase().includes('product') && Boolean(g.skipSteamLink)
  ).length;

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
    setFormSteamPrice(game.steamPriceUsd !== undefined ? game.steamPriceUsd.toString() : '');
    setFormDiscountPercent(game.discountPercent !== undefined ? game.discountPercent.toString() : '');
    setPreviewError(false);
    const initialSteamId = extractSteamAppId(game.link);
    setEditSteamLink(initialSteamId && game.link ? game.link : '');
    setEditSteamGenres(game.steamSpec?.genres || []);
    setEditSteamSpec(game.steamSpec);
    setFormSkipSteamLink(Boolean(game.skipSteamLink));
    lastEditSteamAppIdRef.current = initialSteamId;
    setEditSteamFeedback(null);
  };

  const handleCancelEdit = () => {
    setEditingGame(null);
    setFormName('');
    setFormImg('');
    setFormLink('');
    setFormDesc('');
    setFormPrice('');
    setFormCostPrice('0');
    setFormSteamPrice('');
    setFormDiscountPercent('');
    setPreviewError(false);
    setEditSteamLink('');
    setEditSteamGenres([]);
    setEditSteamSpec(undefined);
    setFormSkipSteamLink(false);
    setEditSteamFeedback(null);
    lastEditSteamAppIdRef.current = null;
  };

  const handleEditSteamFetch = useCallback(
    async (mode: 'link' | 'name', explicitLink?: string) => {
      const targetLink = (explicitLink !== undefined ? explicitLink : editSteamLink).trim();
      const targetName = formName.trim();

      if (mode === 'link' && !targetLink) {
        setEditSteamFeedback({
          type: 'error',
          text: 'Please paste a Steam Store URL or App ID first.',
        });
        return;
      }
      if (mode === 'name' && !targetName) {
        setEditSteamFeedback({
          type: 'error',
          text: 'Please enter a game title before clicking Find.',
        });
        return;
      }

      setIsEditSteamFetching(true);
      setEditSteamFeedback({
        type: 'info',
        text:
          mode === 'link'
            ? 'Fetching exact Steam game details & verified cover...'
            : `Searching Steam Store for "${targetName}"...`,
      });

      try {
        const spec = await fetchSteamSpec(
          mode === 'link' ? { link: targetLink } : { name: targetName }
        );
        lastEditSteamAppIdRef.current = spec.appId;

        setFormName(spec.matchedName);
        setEditSteamSpec(spec);
        setFormSkipSteamLink(false);
        setEditSteamGenres(Array.isArray(spec.genres) ? spec.genres : []);
        const resolvedGenre =
          spec.primaryGenre || (Array.isArray(spec.genres) ? spec.genres[0] || '' : '');
        if (resolvedGenre) setFormGenre(resolvedGenre);
        if (spec.coverImage) {
          setFormImg(spec.coverImage);
          setPreviewError(false);
        }
        setFormLink(spec.steamUrl);
        setEditSteamLink(spec.steamUrl);
        // Never overwrite formDesc from Steam data
        setEditSteamFeedback({
          type: 'success',
          text: `Synced "${spec.matchedName}" (App ID: ${spec.appId}) — Name, Cover, Genre & Steam Link updated.`,
        });
      } catch (err) {
        setEditSteamFeedback({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Could not fetch details from Steam Store.',
        });
      } finally {
        setIsEditSteamFetching(false);
      }
    },
    [editSteamLink, formName]
  );

  // Auto-fetch when a valid Steam link or App ID is entered/pasted in Edit Modal
  useEffect(() => {
    if (!editingGame) return;
    const detectedAppId = extractSteamAppId(editSteamLink);
    if (!detectedAppId || detectedAppId === lastEditSteamAppIdRef.current) return;

    const timer = window.setTimeout(() => {
      void handleEditSteamFetch('link', editSteamLink);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [editingGame, editSteamLink, handleEditSteamFetch]);

  const handleSingleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        onShowToast('File size is too large (max 15MB)', 'error');
        return;
      }
      try {
        const compressed = await compressImageFile(file, 640, 850, 0.82, 480_000);
        setFormImg(compressed);
        setPreviewError(false);
        onShowToast('Image compressed & loaded successfully!');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to compress image for cloud sync';
        console.error('Image compression error', err);
        onShowToast(msg, 'error');
      }
    }
  };

  const handleSubmitSingleGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onShowToast('Please enter game name', 'error');
      return;
    }
    if (!formImg.trim()) {
      onShowToast('Please provide an image URL or upload an image file', 'error');
      return;
    }

    let safeImg = formImg.trim();
    if (safeImg.startsWith('data:image/') && safeImg.length > 480_000) {
      try {
        safeImg = await compressDataUrl(safeImg, 640, 850, 0.8, 480_000);
        setFormImg(safeImg);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Image exceeds maximum cloud sync size';
        onShowToast(msg, 'error');
        return;
      }
    }

    const parsedSteamPrice =
      formSteamPrice !== '' && !isNaN(parseFloat(formSteamPrice))
        ? Math.max(0, Math.round(parseFloat(formSteamPrice) * 100) / 100)
        : undefined;
    const parsedDiscount =
      formDiscountPercent !== '' && !isNaN(parseFloat(formDiscountPercent))
        ? Math.max(0, Math.min(95, Math.round(parseFloat(formDiscountPercent))))
        : undefined;

    if (editingGame) {
      onUpdateGame({
        ...editingGame,
        name: formName.trim(),
        tag: formTag.trim(),
        genre: formGenre.trim(),
        img: safeImg,
        link: formLink.trim() || undefined,
        description: formDesc.trim() || undefined,
        steamSpec: formSkipSteamLink ? undefined : editSteamSpec,
        skipSteamLink: formSkipSteamLink,
        price: formPrice !== '' && !isNaN(parseFloat(formPrice)) ? parseFloat(formPrice) : undefined,
        costPrice: formCostPrice !== '' && !isNaN(parseFloat(formCostPrice)) ? parseFloat(formCostPrice) : 0,
        steamPriceUsd: parsedSteamPrice,
        discountPercent: parsedDiscount,
      });
      onShowToast(`Updated "${formName}" successfully!`);
    } else {
      onSaveGame({
        name: formName.trim(),
        tag: formTag.trim(),
        genre: formGenre.trim(),
        img: safeImg,
        link: formLink.trim() || undefined,
        description: formDesc.trim() || undefined,
        steamSpec: formSkipSteamLink ? undefined : editSteamSpec,
        skipSteamLink: formSkipSteamLink,
        price: formPrice !== '' && !isNaN(parseFloat(formPrice)) ? parseFloat(formPrice) : undefined,
        costPrice: formCostPrice !== '' && !isNaN(parseFloat(formCostPrice)) ? parseFloat(formCostPrice) : 0,
        steamPriceUsd: parsedSteamPrice,
        discountPercent: parsedDiscount,
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

  const handleSyncAllGameGenres = async () => {
    if (genreSyncProgress) return;
    const targets = games.filter(
      (g) => !g.tag.toLowerCase().includes('product') && !g.skipSteamLink
    );
    if (targets.length === 0) {
      onShowToast('No Steam-linked games found to sync game types.', 'info');
      return;
    }

    let done = 0;
    let updated = 0;
    const total = targets.length;
    setGenreSyncProgress({ done: 0, total, updated: 0 });

    try {
      const batchSize = 40;
      for (let i = 0; i < targets.length; i += batchSize) {
        const chunk = targets.slice(i, i + batchSize);
        const resolvedMap = await fetchSteamGenresBatch(
          chunk.map((g) => ({
            id: g.id,
            name: g.name,
            link: g.link,
            steamAppId: g.steamAppId || g.steamSpec?.appId,
          }))
        );

        const latestById = new Map(StorageService.getGames().map((g) => [g.id, g]));
        for (const item of chunk) {
          const hit = resolvedMap[item.id];
          done++;
          if (hit && hit.genre && hit.genre !== 'Steam Game') {
            const latest = latestById.get(item.id) || item;
            const needsGenreChange = latest.genre !== hit.genre;
            const needsAppId = !latest.steamAppId && Boolean(hit.appId);
            const needsLink = !latest.link && Boolean(hit.steamUrl);
            const needsSpecGenre =
              Boolean(latest.steamSpec) && latest.steamSpec?.primaryGenre !== hit.genre;

            if (needsGenreChange || needsAppId || needsLink || needsSpecGenre) {
              onUpdateGame({
                ...latest,
                genre: hit.genre,
                steamAppId: latest.steamAppId || hit.appId,
                link: latest.link || hit.steamUrl,
                steamSpec: latest.steamSpec
                  ? { ...latest.steamSpec, primaryGenre: hit.genre }
                  : undefined,
              });
              if (needsGenreChange) updated++;
            }
          }
        }
        setGenreSyncProgress({ done, total, updated });
      }

      onShowToast(
        updated > 0
          ? `Updated game types (genre) for ${updated} of ${total} games from Steam!`
          : `All ${total} games already have accurate Steam game types.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync game types from Steam.';
      onShowToast(msg, 'error');
    } finally {
      setGenreSyncProgress(null);
    }
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
                Users
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

            {/* Quick Metrics, Actions & Tab Navigation */}
            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveTab('games')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer border ${
                  activeTab === 'games'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                    : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white hover:bg-purple-900/30'
                }`}
              >
                <i className="fa-solid fa-layer-group"></i>
                <span>CATALOG ({games.length})</span>
              </button>

              {/* REPORT BUTTON */}
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer border ${
                  activeTab === 'reports'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/60'
                    : 'bg-[#131b2e] hover:bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:text-white'
                }`}
                title="Open Financial Report"
              >
                <i className="fa-solid fa-file-invoice-dollar text-xs text-emerald-400"></i>
                <span>Report</span>
              </button>

              {/* SINGLE PRODUCT UPLOAD BUTTON */}
              <button
                type="button"
                onClick={() => setIsSingleUploadOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-orbitron font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                title="Upload product into catalog"
              >
                <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                <span>Upload</span>
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

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer border ${
                  activeTab === 'settings'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                    : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white hover:bg-purple-900/30'
                }`}
              >
                <i className="fa-solid fa-gear"></i>
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('backup')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-rajdhani font-bold tracking-wider flex items-center gap-1.5 transition flex-shrink-0 cursor-pointer border ${
                  activeTab === 'backup'
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                    : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white hover:bg-purple-900/30'
                }`}
              >
                <i className="fa-solid fa-database"></i>
                <span>BACKUP & RESTORE</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-[3600px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 py-8">
        {/* TAB 1: GAMES CATALOG MANAGER */}
        {activeTab === 'games' && (
          <div className="space-y-6">
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
                  <option value="steam-online">Steam Online ({steamOnlineCount})</option>
                  <option value="product">Product ({productCount})</option>
                  <option value="free">Gameថែមពេលទិញ External ({freeCount})</option>
                </select>

                {/* Steam Spec Status Filter */}
                <select
                  value={specFilter}
                  onChange={(e) =>
                    setSpecFilter(e.target.value as 'all' | 'missing' | 'saved' | 'skipped')
                  }
                  className={`text-xs rounded-lg px-3 py-2 border outline-none ${
                    specFilter === 'missing'
                      ? 'bg-amber-950/70 text-amber-200 border-amber-500/60'
                      : 'bg-[#131b2e] text-gray-300 border-purple-900/50'
                  }`}
                >
                  <option value="all">All Specs Status</option>
                  <option value="missing">Missing Steam Specs ({missingSpecsCount})</option>
                  <option value="saved">Saved Specs ({savedSpecsCount})</option>
                  <option value="skipped">Not Linked ({skippedSpecsCount})</option>
                </select>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsMissingSpecsModalOpen(true)}
                  className={`px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap border ${
                    missingSpecsCount > 0
                      ? 'bg-cyan-950/75 hover:bg-cyan-900/80 text-cyan-200 border-cyan-500/45'
                      : 'bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border-emerald-500/40'
                  }`}
                  title="Click to see which games are missing Steam PC Specs, sync all, or paste a Steam link"
                >
                  <i
                    className={`fa-solid ${
                      specSyncProgress ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'
                    } ${missingSpecsCount > 0 ? 'text-cyan-300' : 'text-emerald-300'}`}
                  ></i>
                  <span>
                    {specSyncProgress
                      ? `Syncing ${specSyncProgress.done}/${specSyncProgress.total}...`
                      : missingSpecsCount > 0
                      ? `Save Steam Specs (${missingSpecsCount})`
                      : 'All Specs Saved'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={genreSyncProgress !== null}
                  onClick={() => void handleSyncAllGameGenres()}
                  className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap border bg-purple-950/75 hover:bg-purple-900/80 disabled:opacity-60 text-purple-200 border-purple-500/45"
                  title="Re-sync accurate game types (genres) from Steam for both old and new games"
                >
                  <i
                    className={`fa-solid ${
                      genreSyncProgress ? 'fa-spinner fa-spin' : 'fa-tags'
                    } text-purple-300`}
                  ></i>
                  <span>
                    {genreSyncProgress
                      ? `Types ${genreSyncProgress.done}/${genreSyncProgress.total} (${genreSyncProgress.updated} fixed)...`
                      : 'Sync Game Types'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSteamOnlinePanel((v) => !v)}
                  className={`px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap border ${
                    showSteamOnlinePanel
                      ? 'bg-emerald-700/80 hover:bg-emerald-600/80 text-white border-emerald-400 shadow-lg shadow-emerald-950/50'
                      : steamOnlineSyncConfig.enabled
                      ? 'bg-emerald-950/75 hover:bg-emerald-900/80 text-emerald-200 border-emerald-500/45'
                      : 'bg-[#131b2e] hover:bg-gray-800 text-gray-300 border-gray-700'
                  }`}
                  title="Configure Steam Online auto-update from Steam Store"
                >
                  <i
                    className={`fa-brands fa-steam ${
                      isSyncingSteamOnline ? 'fa-spin' : ''
                    } text-emerald-300`}
                  ></i>
                  <span>
                    Steam Online Auto: {steamOnlineSyncConfig.enabled ? 'ON' : 'OFF'}
                  </span>
                  <i
                    className={`fa-solid ${
                      showSteamOnlinePanel ? 'fa-chevron-up' : 'fa-chevron-down'
                    } text-[10px] opacity-80`}
                  ></i>
                </button>

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
              </div>
            </div>

            {/* Steam Online Auto-Update Panel */}
            {showSteamOnlinePanel && (
              <div className="bg-[#0f172a] rounded-xl border border-emerald-500/40 p-4 shadow-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-900/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-500/40 text-emerald-300 flex items-center justify-center">
                      <i className="fa-brands fa-steam text-sm"></i>
                    </div>
                    <div>
                      <h3 className="font-orbitron font-bold text-xs sm:text-sm text-white flex items-center gap-2">
                        <span>STEAM ONLINE AUTO-UPDATE FROM STEAM</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                            steamOnlineSyncConfig.enabled
                              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                              : 'bg-gray-900 text-gray-400 border-gray-700'
                          }`}
                        >
                          {steamOnlineSyncConfig.enabled ? 'AUTO ON' : 'PAUSED'}
                        </span>
                      </h3>
                      <p className="text-[11px] text-gray-400">
                        ទាញយកតែហ្គេមលក់តម្លៃ $20 ឡើងទៅ (Paid $20+ Only • 1 Year) ពី https://store.steampowered.com/ ចូល Category &quot;Steam Online&quot;
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateSteamOnlineConfig({ enabled: !steamOnlineSyncConfig.enabled })
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                        steamOnlineSyncConfig.enabled
                          ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-400'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-600'
                      }`}
                    >
                      {steamOnlineSyncConfig.enabled ? 'Auto-Update: ON' : 'Auto-Update: OFF'}
                    </button>

                    <button
                      type="button"
                      disabled={isSyncingSteamOnline}
                      onClick={handleRunSteamOnlineSyncNow}
                      className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition cursor-pointer"
                    >
                      <i
                        className={`fa-solid ${
                          isSyncingSteamOnline ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'
                        }`}
                      ></i>
                      <span>{isSyncingSteamOnline ? 'Updating from Steam...' : 'Update Now from Steam'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowSteamOnlinePanel(false)}
                      aria-label="Hide Steam Online Auto-Update Panel"
                      className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-gray-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                      title="Hide panel"
                    >
                      <i className="fa-solid fa-xmark text-xs"></i>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                      Steam Store Section
                    </label>
                    <select
                      value={steamOnlineSyncConfig.source}
                      onChange={(e) =>
                        handleUpdateSteamOnlineConfig({
                          source: e.target.value as SteamOnlineSyncSource,
                        })
                      }
                      className="w-full bg-[#131b2e] text-gray-200 rounded-lg px-2.5 py-1.5 border border-emerald-900/50 outline-none focus:border-emerald-500"
                    >
                      <option value="popular_new_online">Steam Homepage — Popular New Releases</option>
                      <option value="new_releases_online">Steam Store — All Latest New Releases</option>
                      <option value="top_sellers_online">Steam Store — New Top Sellers This Month</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                      Auto-Check Interval
                    </label>
                    <select
                      value={steamOnlineSyncConfig.intervalHours}
                      onChange={(e) =>
                        handleUpdateSteamOnlineConfig({
                          intervalHours: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full bg-[#131b2e] text-gray-200 rounded-lg px-2.5 py-1.5 border border-emerald-900/50 outline-none focus:border-emerald-500"
                    >
                      <option value={1}>Every 1 Hour</option>
                      <option value={6}>Every 6 Hours</option>
                      <option value={12}>Every 12 Hours</option>
                      <option value={24}>Every 24 Hours</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                      Games Checked Per Sync
                    </label>
                      <select
                      value={steamOnlineSyncConfig.maxGamesPerSync}
                      onChange={(e) =>
                        handleUpdateSteamOnlineConfig({
                          maxGamesPerSync: Number(e.target.value) || 30,
                        })
                      }
                      className="w-full bg-[#131b2e] text-gray-200 rounded-lg px-2.5 py-1.5 border border-emerald-900/50 outline-none focus:border-emerald-500"
                    >
                      <option value={10}>Top 10 Paid Games</option>
                      <option value={20}>Top 20 Paid Games</option>
                      <option value={30}>Top 30 Paid Games</option>
                      <option value={50}>Top 50 Paid Games (1 Year)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-gray-400 mb-1">
                      Default Price USD (Optional)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Leave blank if unset"
                      value={
                        steamOnlineSyncConfig.defaultPriceUsd !== undefined
                          ? String(steamOnlineSyncConfig.defaultPriceUsd)
                          : ''
                      }
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') {
                          handleUpdateSteamOnlineConfig({ defaultPriceUsd: undefined });
                        } else {
                          const num = parseFloat(raw);
                          if (!isNaN(num) && num >= 0) {
                            handleUpdateSteamOnlineConfig({ defaultPriceUsd: num });
                          }
                        }
                      }}
                      className="w-full bg-[#131b2e] text-gray-200 rounded-lg px-2.5 py-1.5 border border-emerald-900/50 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Steam Online Admin Discount Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#0b1322] border border-emerald-500/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <i className="fa-solid fa-percent text-[11px]"></i>
                        <span>Steam Online Discount (%) កំណត់ដោយ Admin</span>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        កំណត់ % បញ្ចុះតម្លៃលើតម្លៃ Steam ដើម (ឧ. Steam $59.99 បញ្ចុះ{' '}
                        {steamOnlineSyncConfig.discountPercent || 0}% →{' '}
                        <strong className="text-[#beee11] font-mono">
                          ${(59.99 * (1 - (steamOnlineSyncConfig.discountPercent || 0) / 100)).toFixed(2)}
                        </strong>
                        )
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[0, 10, 20, 30, 50].map((pct) => {
                      const active = (steamOnlineSyncConfig.discountPercent || 0) === pct;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => handleUpdateSteamOnlineConfig({ discountPercent: pct })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                            active
                              ? 'bg-[#4c6b22] text-[#beee11] border-[#8bb83b]'
                              : 'bg-[#131b2e] text-gray-300 border-slate-700 hover:border-emerald-500/50'
                          }`}
                        >
                          {pct === 0 ? '0% (No Discount)' : `-${pct}%`}
                        </button>
                      );
                    })}

                    <div className="relative w-24">
                      <input
                        type="number"
                        min="0"
                        max="95"
                        step="1"
                        value={String(steamOnlineSyncConfig.discountPercent ?? 0)}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === '') {
                            handleUpdateSteamOnlineConfig({ discountPercent: 0 });
                          } else {
                            const num = Math.round(Number(raw));
                            if (Number.isFinite(num)) {
                              handleUpdateSteamOnlineConfig({
                                discountPercent: Math.max(0, Math.min(95, num)),
                              });
                            }
                          }
                        }}
                        className="w-full bg-[#131b2e] text-white font-mono font-bold text-xs rounded-lg pl-2.5 pr-6 py-1.5 border border-emerald-500/40 outline-none focus:border-emerald-400 tabular-nums"
                        aria-label="Custom Steam Online Discount Percentage"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-300 font-mono text-xs pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-gray-400">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span>
                      Last Sync:{' '}
                      <strong className="text-gray-200">
                        {steamOnlineSyncConfig.lastSyncAt
                          ? new Date(steamOnlineSyncConfig.lastSyncAt).toLocaleString()
                          : 'Never'}
                      </strong>
                    </span>
                    {steamOnlineSyncConfig.lastSyncMessage && (
                      <span
                        className={`font-mono ${
                          steamOnlineSyncConfig.lastSyncStatus === 'error'
                            ? 'text-rose-400'
                            : 'text-emerald-300'
                        }`}
                      >
                        • {steamOnlineSyncConfig.lastSyncMessage}
                      </span>
                    )}
                  </div>
                  {(steamOnlineSyncConfig.deletedAppIds?.length || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateSteamOnlineConfig({ deletedAppIds: [] });
                        onShowToast('Cleared skipped deleted Steam Online IDs.', 'info');
                      }}
                      className="text-[11px] text-amber-300 hover:text-amber-200 underline cursor-pointer"
                    >
                      Reset Skipped ({steamOnlineSyncConfig.deletedAppIds?.length})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Summary & View Mode Bar */}
            <div className="flex flex-wrap items-center justify-between text-xs text-gray-400 px-1 gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  Showing <span className="text-purple-400 font-bold">{filteredGames.length}</span> of {games.length} games
                </span>
                {selectedGameIds.length > 0 && (
                  <span className="bg-purple-950/80 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded-full font-bold">
                    {selectedGameIds.length} selected
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* View Size Switcher: Small / Medium / Large / Detail */}
                <div
                  className="inline-flex items-center gap-1 bg-[#0f172a] p-1 rounded-xl border border-purple-900/50"
                  role="group"
                  aria-label="Catalog View Mode"
                >
                  <span className="text-[10px] uppercase tracking-wider font-mono text-gray-500 px-1.5 hidden sm:inline">
                    View:
                  </span>
                  {(
                    [
                      { id: 'small', label: 'Small', icon: 'fa-grip' },
                      { id: 'medium', label: 'Medium', icon: 'fa-table-cells' },
                      { id: 'large', label: 'Large', icon: 'fa-table-cells-large' },
                      { id: 'detail', label: 'Detail', icon: 'fa-list' },
                    ] as const
                  ).map((mode) => {
                    const isActive = catalogViewMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleSetCatalogViewMode(mode.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-rajdhani font-bold flex items-center gap-1.5 transition cursor-pointer ${
                          isActive
                            ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400/60'
                            : 'text-gray-400 hover:text-white hover:bg-[#131b2e]'
                        }`}
                        title={`${mode.label} View`}
                      >
                        <i className={`fa-solid ${mode.icon} text-[10px]`}></i>
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
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
            </div>

            {/* Games Catalog View: Detail Table OR Small / Medium / Large Grid */}
            {catalogViewMode === 'detail' ? (
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
                                {game.description && game.description.trim() && (
                                  <p
                                    title={game.description}
                                    className="text-[11px] text-amber-200/85 mt-0.5 line-clamp-1"
                                  >
                                    {game.description}
                                  </p>
                                )}
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
                                ) : game.skipSteamLink ? (
                                  <span className="text-[10px] text-amber-300/80 inline-flex items-center gap-1 mt-0.5">
                                    <i className="fa-solid fa-link-slash text-[9px]"></i>
                                    <span>Not linked to Steam</span>
                                  </span>
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
                                      setSpecInspectGame(game);
                                    }}
                                    className={`p-1.5 rounded-lg border transition cursor-pointer ${
                                      game.steamSpec
                                        ? 'bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-300 border-cyan-600/40'
                                        : !game.tag.toLowerCase().includes('product') && !game.skipSteamLink
                                        ? 'bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border-amber-500/50'
                                        : 'bg-slate-900/60 hover:bg-slate-800 text-gray-400 border-slate-700'
                                    }`}
                                    title={
                                      game.steamSpec
                                        ? 'View PC System Requirements (Steam Spec Saved)'
                                        : !game.tag.toLowerCase().includes('product') && !game.skipSteamLink
                                        ? 'Missing Steam Spec — click to fetch & save'
                                        : 'View PC System Requirements'
                                    }
                                  >
                                    <i className="fa-solid fa-microchip"></i>
                                  </button>
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
            ) : filteredGames.length === 0 ? (
              <div className="bg-[#0f172a] rounded-xl border border-purple-900/40 p-10 text-center text-xs text-gray-500 shadow-2xl">
                No games match your search criteria.
              </div>
            ) : (
              <div
                className={
                  catalogViewMode === 'small'
                    ? 'grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11 2xl:grid-cols-13 gap-2.5'
                    : catalogViewMode === 'medium'
                    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3.5'
                    : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5'
                }
              >
                {filteredGames.map((game) => {
                  const isSteam = game.tag.toLowerCase().includes('steam');
                  const isProduct = game.tag.toLowerCase().includes('product');
                  const isSelected = selectedGameIds.includes(game.id);
                  const isSmall = catalogViewMode === 'small';
                  const isLarge = catalogViewMode === 'large';

                  return (
                    <div
                      key={game.id}
                      onClick={() => toggleSelectGame(game.id)}
                      className={`group relative bg-[#0f172a] rounded-xl border overflow-hidden transition cursor-pointer select-none flex flex-col justify-between shadow-lg ${
                        isSelected
                          ? 'border-purple-400 ring-2 ring-purple-500/60 bg-purple-950/30'
                          : 'border-purple-900/40 hover:border-purple-500/60 hover:bg-[#131b2e]'
                      }`}
                    >
                      {/* Cover Art + Floating Checkbox & Status */}
                      <div className="relative aspect-[3/4] w-full bg-[#0a0f1d] overflow-hidden">
                        <img
                          src={game.img}
                          alt={game.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://placehold.co/300x400/131b2e/ffffff?text=Cover';
                          }}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#080b11]/90 via-transparent to-black/45 pointer-events-none" />

                        {/* Selection Checkbox */}
                        <div
                          className={`absolute ${isSmall ? 'top-1.5 left-1.5' : 'top-2 left-2'} z-10`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectGame(game.id)}
                            className={`${
                              isSmall ? 'w-3.5 h-3.5' : 'w-4 h-4'
                            } rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600 shadow`}
                          />
                        </div>

                        {/* Price Badge */}
                        {game.price !== undefined && (
                          <span
                            className={`absolute ${
                              isSmall
                                ? 'top-1.5 right-1.5 text-[9px] px-1.5 py-0.5'
                                : 'top-2 right-2 text-[11px] px-2 py-0.5'
                            } rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 font-mono font-bold`}
                          >
                            ${game.price.toFixed(2)}
                          </span>
                        )}

                        {/* Category Tag on Cover Bottom */}
                        {!isSmall && (
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border truncate ${
                                isSteam
                                  ? 'bg-purple-950/90 text-purple-200 border-purple-500/40'
                                  : 'bg-cyan-950/90 text-cyan-200 border-cyan-500/40'
                              }`}
                            >
                              {game.tag}
                            </span>
                            {!isProduct && (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${
                                  game.steamSpec
                                    ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/40'
                                    : game.skipSteamLink
                                    ? 'bg-slate-900/90 text-gray-400 border-slate-600/50'
                                    : 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                {game.steamSpec ? 'Spec OK' : game.skipSteamLink ? 'No Link' : 'No Spec'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Card Body & Quick Actions */}
                      <div className={isSmall ? 'p-1.5 space-y-1.5' : isLarge ? 'p-3.5 space-y-2.5 flex-1 flex flex-col justify-between' : 'p-2.5 space-y-2 flex-1 flex flex-col justify-between'}>
                        <div className="space-y-1">
                          <h4
                            title={game.name}
                            className={`font-semibold text-gray-100 group-hover:text-purple-300 transition ${
                              isSmall
                                ? 'text-[11px] leading-tight line-clamp-1'
                                : isLarge
                                ? 'text-sm leading-snug line-clamp-2'
                                : 'text-xs leading-snug line-clamp-2'
                            }`}
                          >
                            {game.name}
                          </h4>

                          {!isSmall && (
                            <div className="text-[11px] text-gray-400 truncate">
                              {game.genre}
                            </div>
                          )}

                          {isLarge && game.description && game.description.trim() && (
                            <p
                              title={game.description}
                              className="text-[11px] text-amber-200/85 line-clamp-2 leading-relaxed"
                            >
                              {game.description}
                            </p>
                          )}

                          {isLarge && (
                            <div>
                              {game.link ? (
                                <a
                                  href={game.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-cyan-400 hover:underline inline-flex items-center gap-1 max-w-full truncate"
                                >
                                  <i className="fa-solid fa-arrow-up-right-from-square text-[9px] shrink-0"></i>
                                  <span className="truncate">{game.link}</span>
                                </a>
                              ) : game.skipSteamLink ? (
                                <span className="text-[10px] text-amber-300/80 inline-flex items-center gap-1">
                                  <i className="fa-solid fa-link-slash text-[9px]"></i>
                                  <span>Not linked to Steam</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-500">No store URL</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div
                          className={`flex items-center justify-between gap-1 pt-1 border-t border-purple-950/60`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSpecInspectGame(game);
                            }}
                            className={`${
                              isSmall ? 'p-1 text-[10px]' : isLarge ? 'px-2.5 py-1.5 text-xs flex-1 justify-center flex items-center gap-1' : 'p-1.5 text-xs flex-1 flex items-center justify-center'
                            } rounded-lg border transition cursor-pointer ${
                              game.steamSpec
                                ? 'bg-cyan-950/60 hover:bg-cyan-900/70 text-cyan-300 border-cyan-600/40'
                                : !isProduct && !game.skipSteamLink
                                ? 'bg-amber-950/50 hover:bg-amber-900/70 text-amber-300 border-amber-500/50'
                                : 'bg-slate-900/60 hover:bg-slate-800 text-gray-400 border-slate-700'
                            }`}
                            title={
                              game.steamSpec
                                ? 'View PC System Requirements (Steam Spec Saved)'
                                : !isProduct && !game.skipSteamLink
                                ? 'Missing Steam Spec — click to fetch & save'
                                : 'View PC System Requirements'
                            }
                          >
                            <i className="fa-solid fa-microchip"></i>
                            {isLarge && <span>Specs</span>}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(game);
                            }}
                            className={`${
                              isSmall ? 'p-1 text-[10px]' : isLarge ? 'px-2.5 py-1.5 text-xs flex-1 justify-center flex items-center gap-1' : 'p-1.5 text-xs flex-1 flex items-center justify-center'
                            } bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 rounded-lg border border-purple-700/40 transition cursor-pointer`}
                            title="Edit Game"
                          >
                            <i className="fa-solid fa-pen-to-square"></i>
                            {isLarge && <span>Edit</span>}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingId(game.id);
                            }}
                            className={`${
                              isSmall ? 'p-1 text-[10px]' : isLarge ? 'px-2.5 py-1.5 text-xs justify-center flex items-center' : 'p-1.5 text-xs flex-1 flex items-center justify-center'
                            } bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg border border-red-800/40 transition cursor-pointer`}
                            title="Delete Game"
                          >
                            <i className="fa-solid fa-trash-can"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                {/* Steam Store Link (Optional — Can be Unlinked) */}
                <div className="p-3 rounded-xl bg-gradient-to-br from-[#131c34] to-[#10172b] border border-cyan-500/35 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-brands fa-steam text-sm"></i>
                      <span>Steam Store Link (Optional)</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0a0f1d] border border-purple-500/35 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={formSkipSteamLink}
                        onChange={(e) => {
                          const skip = e.target.checked;
                          setFormSkipSteamLink(skip);
                          if (skip) {
                            setEditSteamSpec(undefined);
                            setEditSteamGenres([]);
                            setEditSteamLink('');
                            setEditSteamFeedback(null);
                            lastEditSteamAppIdRef.current = null;
                            if (extractSteamAppId(formLink)) {
                              setFormLink('');
                            }
                          }
                        }}
                        className="rounded accent-purple-500 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-gray-200">
                        Don&apos;t link to Steam
                      </span>
                    </label>
                  </div>

                  {formSkipSteamLink && (
                    <p className="text-[11px] text-amber-200/85 bg-amber-950/30 border border-amber-500/25 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <i className="fa-solid fa-link-slash text-amber-400 text-[11px] shrink-0"></i>
                      <span>
                        Not linked to Steam — this game will not auto-link by name.
                      </span>
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editSteamLink}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditSteamLink(val);
                        if (extractSteamAppId(val)) {
                          setFormSkipSteamLink(false);
                        }
                      }}
                      placeholder="https://store.steampowered.com/app/..."
                      className="flex-1 min-w-0 bg-[#0a0f1d] text-xs text-white placeholder-gray-500 rounded-xl px-3 py-2 border border-cyan-500/30 focus:border-cyan-400 outline-none"
                    />
                    <button
                      type="button"
                      disabled={isEditSteamFetching}
                      onClick={() => void handleEditSteamFetch('link')}
                      className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-orbitron font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      <i
                        className={`fa-solid ${
                          isEditSteamFetching
                            ? 'fa-spinner fa-spin'
                            : 'fa-wand-magic-sparkles'
                        } text-[11px]`}
                      ></i>
                      <span>Fetch</span>
                    </button>
                  </div>

                  {editSteamFeedback && (
                    <div
                      className={`text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
                        editSteamFeedback.type === 'error'
                          ? 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
                          : editSteamFeedback.type === 'success'
                          ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
                          : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-200'
                      }`}
                    >
                      <i
                        className={`fa-solid ${
                          editSteamFeedback.type === 'error'
                            ? 'fa-circle-exclamation'
                            : editSteamFeedback.type === 'success'
                            ? 'fa-circle-check'
                            : 'fa-spinner fa-spin'
                        } text-[11px] shrink-0`}
                      ></i>
                      <span className="leading-snug">{editSteamFeedback.text}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">GAME TITLE *</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="flex-1 min-w-0 bg-[#131b2e] text-sm text-gray-200 rounded-xl px-3.5 py-2 border border-purple-900/50 outline-none focus:border-purple-500"
                    />
                    <button
                      type="button"
                      disabled={isEditSteamFetching || !formName.trim()}
                      onClick={() => void handleEditSteamFetch('name')}
                      className="px-3 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 disabled:opacity-45 text-purple-200 border border-purple-500/35 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 whitespace-nowrap"
                      title="Optional manual search on Steam by title"
                    >
                      <i className="fa-solid fa-magnifying-glass text-[11px]"></i>
                      <span>Find</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">CATEGORY / TAG *</label>
                    <select
                      value={formTag}
                      onChange={(e) => {
                        const nextTag = e.target.value;
                        setFormTag(nextTag);
                        if (nextTag === 'Product' && (!formGenre.trim() || formGenre === 'Action RPG')) {
                          setFormGenre('Hardware');
                        } else if (
                          (nextTag === 'Steam Offline' ||
                            nextTag === 'Steam Online' ||
                            nextTag === 'Gameថែមពេលទិញ External') &&
                          (!formGenre.trim() || formGenre === 'Hardware' || formGenre === 'Gaming Device')
                        ) {
                          setFormGenre('Action RPG');
                        }
                      }}
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 outline-none"
                    >
                      <option value="Steam Offline">Steam Offline</option>
                      <option value="Steam Online">Steam Online</option>
                      <option value="Product">Product (ទំនិញ / រូបវន្ត)</option>
                      <option value="Account">Account (គណនី)</option>
                      <option value="Gameថែមពេលទិញ External">Gameថែមពេលទិញ External</option>
                      <option value="Custom Game">Custom Game</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-300">GENRE / TYPE *</label>
                      {editSteamGenres.length > 0 && (
                        <span className="text-[10px] text-cyan-400 font-medium">
                          Steam Linked
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        required
                        value={formGenre}
                        onChange={(e) => setFormGenre(e.target.value)}
                        className="flex-1 min-w-0 bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 focus:border-cyan-400 outline-none"
                      />
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) setFormGenre(e.target.value);
                        }}
                        className="bg-[#131b2e] text-[11px] text-gray-300 rounded-xl px-2 border border-purple-900/50 outline-none cursor-pointer"
                      >
                        <option value="">Pick</option>
                        <option value="Action RPG">Action RPG</option>
                        <option value="Action Adventure">Action Adventure</option>
                        <option value="Open World">Open World</option>
                        <option value="FPS / Shooter">FPS / Shooter</option>
                        <option value="Survival Horror">Survival Horror</option>
                        <option value="Simulation">Simulation</option>
                        <option value="Strategy">Strategy</option>
                        <option value="Racing Sim">Racing Sim</option>
                        <option value="Sports">Sports</option>
                        <option value="Fighting">Fighting</option>
                        <option value="Indie">Indie</option>
                        <option value="Hardware">Hardware</option>
                        <option value="Gaming Device">Gaming Device</option>
                      </select>
                    </div>
                  </div>
                </div>

                {editSteamGenres.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 -mt-1">
                    <span className="text-[10px] text-gray-400">Steam Genres:</span>
                    {editSteamGenres.map((sg) => (
                      <button
                        key={sg}
                        type="button"
                        onClick={() => setFormGenre(sg)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition cursor-pointer ${
                          formGenre.toLowerCase() === sg.toLowerCase()
                            ? 'bg-cyan-600/35 text-cyan-200 border-cyan-400'
                            : 'bg-[#131b2e] text-gray-300 border-purple-500/25 hover:border-cyan-400/60 hover:text-white'
                        }`}
                      >
                        {sg}
                      </button>
                    ))}
                    {editSteamGenres.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormGenre(editSteamGenres.join(', '))}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition cursor-pointer ${
                          formGenre.toLowerCase() === editSteamGenres.join(', ').toLowerCase()
                            ? 'bg-purple-600/40 text-purple-200 border-purple-400'
                            : 'bg-[#131b2e] text-purple-300 border-purple-500/25 hover:border-purple-400'
                        }`}
                      >
                        All ({editSteamGenres.join(', ')})
                      </button>
                    )}
                  </div>
                )}

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

                {formTag.toLowerCase().includes('steam') && formTag.toLowerCase().includes('online') && (
                  <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                    <div>
                      <label className="block text-xs font-semibold text-emerald-300 mb-1">
                        STEAM STORE PRICE ($ USD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400 font-mono text-xs">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="59.99"
                          value={formSteamPrice}
                          onChange={(e) => setFormSteamPrice(e.target.value)}
                          className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl pl-7 pr-3 py-2 border border-emerald-900/50 outline-none focus:border-emerald-400 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-lime-300 mb-1">
                        GAME DISCOUNT % (OPTIONAL OVERRIDE)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max="95"
                          placeholder={`Global (${steamOnlineSyncConfig.discountPercent ?? 0}%)`}
                          value={formDiscountPercent}
                          onChange={(e) => setFormDiscountPercent(e.target.value)}
                          className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl pl-3 pr-7 py-2 border border-emerald-900/50 outline-none focus:border-emerald-400 font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-lime-300 font-mono text-xs">%</span>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">COVER IMAGE URL OR UPLOAD</label>
                  <input
                    type="text"
                    value={formImg}
                    onChange={(e) => {
                      setFormImg(e.target.value);
                      setPreviewError(false);
                    }}
                    onPaste={async (e) => {
                      const items = e.clipboardData?.items;
                      if (items) {
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].type.startsWith('image/')) {
                            e.preventDefault();
                            const blob = items[i].getAsFile();
                            if (blob) {
                              try {
                                const compressed = await blobToCompressedDataUrl(blob, 640, 850, 0.82, 480_000);
                                setFormImg(compressed);
                                setPreviewError(false);
                                onShowToast('Pasted clipboard image compressed & ready!', 'success');
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : 'Failed to compress pasted image';
                                onShowToast(msg, 'error');
                              }
                            }
                            return;
                          }
                        }
                      }
                      const pastedText = e.clipboardData?.getData('text')?.trim();
                      if (pastedText && pastedText.startsWith('data:image/') && pastedText.length > 480_000) {
                        e.preventDefault();
                        try {
                          const compressed = await compressDataUrl(pastedText, 640, 850, 0.82, 480_000);
                          setFormImg(compressed);
                          setPreviewError(false);
                          onShowToast('Pasted image compressed & ready!', 'success');
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Failed to compress pasted image';
                          onShowToast(msg, 'error');
                        }
                      }
                    }}
                    placeholder="https://... or Ctrl+V paste image"
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
                          if (navigator.clipboard?.read) {
                            const clipItems = await navigator.clipboard.read();
                            for (const clipItem of clipItems) {
                              const imageType = clipItem.types.find((t) => t.startsWith('image/'));
                              if (imageType) {
                                const blob = await clipItem.getType(imageType);
                                const compressed = await blobToCompressedDataUrl(blob, 640, 850, 0.82, 480_000);
                                setFormImg(compressed);
                                setPreviewError(false);
                                onShowToast('Clipboard image compressed & loaded!', 'success');
                                return;
                              }
                            }
                          }
                          if (navigator.clipboard?.readText) {
                            const text = await navigator.clipboard.readText();
                            if (text && text.trim()) {
                              const trimmed = text.trim();
                              const finalImg =
                                trimmed.startsWith('data:image/') && trimmed.length > 480_000
                                  ? await compressDataUrl(trimmed, 640, 850, 0.82, 480_000)
                                  : trimmed;
                              setFormImg(finalImg);
                              setPreviewError(false);
                              onShowToast('Image URL pasted from clipboard!', 'success');
                              return;
                            }
                          }
                        } catch (err) {
                          if (err instanceof Error && err.message.includes('900KB')) {
                            onShowToast(err.message, 'error');
                            return;
                          }
                        }
                        onShowToast('Please press Ctrl+V inside the URL box above', 'info');
                      }}
                      className="cursor-pointer px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-500/40 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition"
                      title="Paste image or image link from clipboard"
                    >
                      <i className="fa-solid fa-paste text-cyan-400 text-xs"></i>
                      <span>Paste URL / Image</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">STORE / DOWNLOAD LINK</label>
                  <input
                    type="url"
                    value={formLink}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormLink(val);
                      if (extractSteamAppId(val)) {
                        setEditSteamLink(val);
                        setFormSkipSteamLink(false);
                      }
                    }}
                    placeholder="https://..."
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3 py-2 border border-purple-900/50 focus:border-cyan-400 outline-none"
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

        {/* TAB: SETTINGS & TELEGRAM */}
        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-8">
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
                    placeholder="@kanigame168"
                    className="w-full bg-[#131b2e] text-xs font-mono text-cyan-300 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    When customers click &quot;SEND TELEGRAM&quot;, their game request will be sent to this Telegram username.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    COVER MAIN TITLE (Large display title on Hero Cover)
                  </label>
                  <input
                    type="text"
                    value={localSettings.heroMainTitle ?? 'KANI GAME'}
                    onChange={(e) =>
                      setLocalSettings({ ...localSettings, heroMainTitle: e.target.value })
                    }
                    placeholder="KANI GAME"
                    className="w-full bg-[#131b2e] text-xs font-orbitron font-bold text-white rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Main glowing title displayed on the storefront cover (default: KANI GAME). The last word gets the neon gradient highlight.
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

            {/* CONTACT CATALOG LINKS (TELEGRAM GROUP / FACEBOOK / YOUTUBE / GOOGLE MAP) */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-cyan-500/40 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
                  <i className="fa-solid fa-share-nodes text-xl"></i>
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-lg text-white">
                    CONTACT CATALOG LINKS &amp; GOOGLE MAP
                  </h3>
                  <p className="text-xs text-gray-400">
                    Links shown in the storefront Contact tab (Telegram Group, Facebook, YouTube &amp; Google Maps).
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      TELEGRAM GROUP LINK
                    </label>
                    <input
                      type="text"
                      value={localSettings.telegramGroupUrl ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, telegramGroupUrl: e.target.value })
                      }
                      placeholder="https://t.me/yourgroup or @yourgroup"
                      className="w-full bg-[#131b2e] text-xs font-mono text-indigo-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-indigo-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      FACEBOOK PAGE LINK
                    </label>
                    <input
                      type="text"
                      value={localSettings.facebookUrl ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, facebookUrl: e.target.value })
                      }
                      placeholder="https://www.facebook.com/yourpage"
                      className="w-full bg-[#131b2e] text-xs font-mono text-blue-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-blue-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      YOUTUBE CHANNEL LINK
                    </label>
                    <input
                      type="text"
                      value={localSettings.youtubeUrl ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, youtubeUrl: e.target.value })
                      }
                      placeholder="https://www.youtube.com/@yourchannel"
                      className="w-full bg-[#131b2e] text-xs font-mono text-rose-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      GOOGLE MAP LINK
                    </label>
                    <input
                      type="text"
                      value={localSettings.googleMapUrl ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, googleMapUrl: e.target.value })
                      }
                      placeholder="https://maps.app.goo.gl/... or Google Maps URL"
                      className="w-full bg-[#131b2e] text-xs font-mono text-emerald-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      STORE ADDRESS (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      value={localSettings.storeAddress ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, storeAddress: e.target.value })
                      }
                      placeholder="e.g. Phnom Penh, Cambodia"
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">
                      OPEN HOURS (OPTIONAL)
                    </label>
                    <input
                      type="text"
                      value={localSettings.storeHours ?? ''}
                      onChange={(e) =>
                        setLocalSettings({ ...localSettings, storeHours: e.target.value })
                      }
                      placeholder="e.g. 9:00 AM - 9:00 PM"
                      className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-purple-900/50 outline-none focus:border-cyan-400"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-orbitron font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    <i className="fa-solid fa-floppy-disk"></i>
                    <span>SAVE CONTACT LINKS</span>
                  </button>
                </div>
              </form>
            </div>

            {/* HERO COVER MEDIA (PHOTO OR VIDEO) */}
            <div className="bg-[#0f172a] p-6 sm:p-8 rounded-2xl border border-fuchsia-500/40 shadow-2xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-purple-900/40">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-cyan-500/30 border border-fuchsia-400/40 flex items-center justify-center text-fuchsia-300">
                  <i className="fa-solid fa-photo-film text-xl"></i>
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-lg text-white">
                    HERO COVER PHOTO OR VIDEO
                  </h3>
                  <p className="text-xs text-gray-400">
                    Change the cover artwork photos or add a looping background video (MP4, WebM, or YouTube).
                  </p>
                </div>
              </div>

              <CoverMediaForm
                settings={localSettings}
                onSaveSettings={(updated) => {
                  setLocalSettings(updated);
                  onSaveSettings(updated);
                }}
                onShowToast={onShowToast}
              />
            </div>

            {/* CATEGORY COVERS (STEAM ONLINE / PRODUCT / GAMEថែមEXTERNAL - PHOTO / VIDEO / TEXT) */}
            <div
              className={`bg-[#0f172a] p-6 sm:p-8 rounded-2xl shadow-2xl border ${
                adminPromoCoverTab === 'external' ? 'border-fuchsia-500/40' : 'border-sky-500/40'
              }`}
            >
              <div
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b ${
                  adminPromoCoverTab === 'external' ? 'border-purple-900/40' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                      adminPromoCoverTab === 'external'
                        ? 'bg-gradient-to-br from-purple-600/30 to-cyan-500/30 border-fuchsia-400/40 text-fuchsia-300'
                        : 'bg-gradient-to-br from-[#0ea5e9]/30 to-[#ff5a00]/30 border-sky-400/40 text-sky-300'
                    }`}
                  >
                    <i
                      className={`fa-solid ${
                        adminPromoCoverTab === 'external' ? 'fa-photo-film' : 'fa-layer-group'
                      } text-xl`}
                    ></i>
                  </div>
                  <div>
                    <h3 className="font-orbitron font-bold text-lg text-white">
                      {adminPromoCoverTab === 'external'
                        ? 'EXTERNAL COVER PHOTO OR VIDEO'
                        : 'CATEGORY COVERS (PHOTO / VIDEO / TEXT & PROMO)'}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {adminPromoCoverTab === 'external'
                        ? 'Change the External cover artwork photos (Full or Side Panels) or add a looping background video.'
                        : 'Set separate Cover Photos, Videos, Headlines & Promo Ribbons for Steam Online, Product, and GameថែមExternal.'}
                    </p>
                  </div>
                </div>

                {/* Target Category Switcher */}
                <div className="flex flex-wrap items-center gap-1.5 bg-[#090e1a] p-1.5 rounded-xl border border-slate-800">
                  {(
                    [
                      { id: 'steam-online', label: 'Steam Online', icon: 'fa-brands fa-steam' },
                      { id: 'product', label: 'Product', icon: 'fa-solid fa-box-open' },
                      { id: 'external', label: 'GameថែមExternal', icon: 'fa-solid fa-gift' },
                    ] as const
                  ).map((tab) => {
                    const isActive = adminPromoCoverTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setAdminPromoCoverTab(tab.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-orbitron font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                          isActive
                            ? tab.id === 'external'
                              ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md'
                              : 'bg-gradient-to-r from-[#0ea5e9] to-[#0077e6] text-white shadow-md'
                            : 'text-gray-400 hover:text-white hover:bg-slate-800/70'
                        }`}
                      >
                        <i className={tab.icon}></i>
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <SteamOnlineCoverForm
                target={adminPromoCoverTab}
                settings={localSettings}
                onSaveSettings={(updated) => {
                  setLocalSettings(updated);
                  onSaveSettings(updated);
                }}
                onShowToast={onShowToast}
              />
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

      {/* PC System Requirements Inspector Modal */}
      <GameModal
        game={specInspectGame}
        isSelected={false}
        onToggleSelect={() => {
          if (specInspectGame) {
            toggleSelectGame(specInspectGame.id);
          }
        }}
        onClose={() => setSpecInspectGame(null)}
        adminHandle={settings.telegramAdminHandle}
        onSaveGameSpec={(targetGame, spec) => {
          const latestGame =
            StorageService.getGames().find((g) => g.id === targetGame.id) || targetGame;
          const updated: Game = {
            ...latestGame,
            steamSpec: spec,
          };
          onUpdateGame(updated);
          setSpecInspectGame((prev) => (prev && prev.id === updated.id ? updated : prev));
        }}
      />
      {/* Steam Online Sync Results Popup */}
      <SteamOnlineSyncModal
        state={steamSyncModal}
        onClose={() => setSteamSyncModal((prev) => ({ ...prev, isOpen: false }))}
        onUploadGames={handleUploadSteamFeedGames}
      />
      {/* Missing Steam Specs Inspector & Sync Modal */}
      <MissingSteamSpecsModal
        isOpen={isMissingSpecsModalOpen}
        onClose={() => setIsMissingSpecsModalOpen(false)}
        games={games}
        onUpdateGame={onUpdateGame}
        onEditGame={handleStartEdit}
        onFilterCatalogMissing={() => {
          setTagFilter('all');
          setSpecFilter('missing');
          setIsMissingSpecsModalOpen(false);
        }}
        onShowToast={onShowToast}
        syncProgress={specSyncProgress}
        setSyncProgress={setSpecSyncProgress}
      />
    </div>
  );
};
