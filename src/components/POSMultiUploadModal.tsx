import React, { useState, useRef } from 'react';
import { Game } from '../types/game';
import { compressImageFile } from '../utils/imageUtils';
import { extractSteamAppId, fetchSteamSpec } from '../services/steamService';

interface POSMultiUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMultipleProducts: (products: (Omit<Game, 'id'> & { id?: string })[]) => Game[];
  exchangeRate?: number;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface BatchItem {
  id: string;
  name: string;
  tag: string;
  genre: string;
  price: number;
  img: string;
  link?: string;
  barcode: string;
  description: string;
  stock?: number;
  steamStatus?: 'idle' | 'loading' | 'success' | 'error';
  steamMessage?: string;
}

const PRESET_BATCH_CATEGORIES = [
  'Steam Offline',
  'Steam Online',
  'Product',
  'Gameថែមពេលទិញ External',
  'Gaming Accessories',
  'Steam Account',
  'Console Games',
  'Software & Tools',
];

const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80';

export const POSMultiUploadModal: React.FC<POSMultiUploadModalProps> = ({
  isOpen,
  onClose,
  onSaveMultipleProducts,
  exchangeRate = 4100,
  onShowToast,
}) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [defaultTag, setDefaultTag] = useState('Steam Offline');
  const [defaultGenre, setDefaultGenre] = useState('Action RPG');
  const [defaultPrice, setDefaultPrice] = useState('2.50');
  const [defaultDescription, setDefaultDescription] = useState(
    'Steam Offline Account with Lifetime Access'
  );
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState(0);

  // Batch Steam Fetch Progress
  const [isSteamBatchFetching, setIsSteamBatchFetching] = useState(false);
  const [steamBatchDone, setSteamBatchDone] = useState(0);
  const [steamBatchTotal, setSteamBatchTotal] = useState(0);

  // Text / Steam Links bulk paste mode
  const [showTextPasteMode, setShowTextPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState('');

  const multiFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const defaultPriceNum = parseFloat(defaultPrice) || 0;

  const generateSku = () => `KG-${Math.floor(100000 + Math.random() * 900000)}`;

  // Concurrent batch Steam fetcher (fills exact Name, Cover, Genre, and Steam Link; never overwrites description)
  const runConcurrentSteamBatch = async (targets: BatchItem[], forceRefresh = false) => {
    if (targets.length === 0) return;

    setIsSteamBatchFetching(true);
    setSteamBatchDone(0);
    setSteamBatchTotal(targets.length);

    const targetIds = new Set(targets.map((t) => t.id));
    setItems((prev) =>
      prev.map((it) =>
        targetIds.has(it.id)
          ? { ...it, steamStatus: 'loading', steamMessage: 'Syncing Steam Store...' }
          : it
      )
    );

    const CONCURRENCY = 3;
    let cursor = 0;
    let successCount = 0;

    const worker = async () => {
      while (cursor < targets.length) {
        const currentIndex = cursor++;
        const target = targets[currentIndex];

        try {
          const spec = await fetchSteamSpec({
            link: target.link,
            name: target.link ? undefined : target.name,
            forceRefresh,
          });
          successCount++;
          setItems((prev) =>
            prev.map((it) =>
              it.id === target.id
                ? {
                    ...it,
                    name: spec.matchedName,
                    genre: spec.primaryGenre || it.genre,
                    img: spec.coverImage || it.img,
                    link: spec.steamUrl,
                    // Never auto-fill or overwrite it.description
                    steamStatus: 'success',
                    steamMessage: `App ID: ${spec.appId}`,
                  }
                : it
            )
          );
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : 'Failed to match Steam Store item';
          setItems((prev) =>
            prev.map((it) =>
              it.id === target.id
                ? {
                    ...it,
                    steamStatus: 'error',
                    steamMessage: msg,
                  }
                : it
            )
          );
        } finally {
          setSteamBatchDone((prev) => prev + 1);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker())
    );

    setIsSteamBatchFetching(false);
    if (successCount > 0) {
      onShowToast(
        `Synced ${successCount}/${targets.length} item${targets.length > 1 ? 's' : ''} from Steam Store!`,
        'success'
      );
    } else {
      onShowToast('Could not match items from Steam Store.', 'error');
    }
  };

  // Single-row Steam refresh button handler
  const handleRefreshRowSteam = async (item: BatchItem) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, steamStatus: 'loading', steamMessage: 'Refreshing...' }
          : it
      )
    );

    try {
      const hasSteamLink = Boolean(extractSteamAppId(item.link));
      const spec = await fetchSteamSpec({
        link: hasSteamLink ? item.link : undefined,
        name: hasSteamLink ? undefined : item.name,
        forceRefresh: true,
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                name: spec.matchedName,
                genre: spec.primaryGenre || it.genre,
                img: spec.coverImage || it.img,
                link: spec.steamUrl,
                // Strictly preserve it.description
                steamStatus: 'success',
                steamMessage: `App ID: ${spec.appId}`,
              }
            : it
        )
      );
      onShowToast(`Synced "${spec.matchedName}" from Steam!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Steam lookup failed';
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, steamStatus: 'error', steamMessage: msg } : it
        )
      );
      onShowToast(msg, 'error');
    }
  };

  // Handle Multi-File Image Selection
  const handleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFiles(true);
    setTotalFilesToProcess(files.length);
    setProcessedCount(0);

    const newItems: BatchItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      try {
        const compressedBase64 = await compressImageFile(file, 640, 850, 0.8);
        newItems.push({
          id: `batch_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          name: cleanName || `Game Product #${items.length + i + 1}`,
          tag: defaultTag,
          genre: defaultGenre,
          price: defaultPriceNum,
          img: compressedBase64,
          barcode: generateSku(),
          description: defaultDescription,
          steamStatus: 'idle',
        });
      } catch (err) {
        console.error('Failed to compress file', file.name, err);
      }

      setProcessedCount((prev) => prev + 1);
    }

    setItems((prev) => [...prev, ...newItems]);
    setIsProcessingFiles(false);
    onShowToast(`បានបន្ថែម ${newItems.length} ផលិតផលចូលក្នុងបញ្ជី Multi-Upload!`, 'success');

    if (multiFileInputRef.current) {
      multiFileInputRef.current.value = '';
    }
  };

  // Handle Steam Links / Text Paste Bulk generation
  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      onShowToast('សូមបញ្ចូល ឬបិទភ្ជាប់ (Paste) Steam Links ឬឈ្មោះផលិតផល!', 'error');
      return;
    }

    const lines = pastedText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const steamTargets: BatchItem[] = [];

    const newItems: BatchItem[] = lines.map((line, idx) => {
      const parts = line.split('|').map((p) => p.trim());
      const firstToken = parts[0] || '';
      const detectedAppId = extractSteamAppId(firstToken);
      const itemPrice =
        parts[1] && !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : defaultPriceNum;
      const itemNote = parts[2] || defaultDescription;

      const batchItem: BatchItem = {
        id: `batch_text_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: detectedAppId
          ? `Steam App #${detectedAppId}`
          : firstToken || `Game #${items.length + idx + 1}`,
        tag: defaultTag,
        genre: defaultGenre,
        price: itemPrice,
        img: DEFAULT_COVER,
        link: detectedAppId ? firstToken : undefined,
        barcode: generateSku(),
        description: itemNote,
        steamStatus: detectedAppId ? 'loading' : 'idle',
      };

      if (detectedAppId) {
        steamTargets.push(batchItem);
      }

      return batchItem;
    });

    setItems((prev) => [...prev, ...newItems]);
    setPastedText('');
    setShowTextPasteMode(false);

    if (steamTargets.length > 0) {
      onShowToast(
        `Added ${newItems.length} rows — fetching ${steamTargets.length} from Steam Store...`,
        'info'
      );
      void runConcurrentSteamBatch(steamTargets, false);
    } else {
      onShowToast(`បានបង្កើត ${newItems.length} ផលិតផលពីបញ្ជីអត្ថបទ!`, 'success');
    }
  };

  // Apply batch presets to all existing items in list
  const applyPresetToAll = (field: 'tag' | 'genre' | 'price' | 'description') => {
    if (items.length === 0) return;
    setItems((prev) =>
      prev.map((item) => {
        if (field === 'tag') return { ...item, tag: defaultTag };
        if (field === 'genre') return { ...item, genre: defaultGenre };
        if (field === 'price') return { ...item, price: defaultPriceNum };
        if (field === 'description') return { ...item, description: defaultDescription };
        return item;
      })
    );
    onShowToast(`បានអនុវត្ត ${field.toUpperCase()} ទៅលើផលិតផលទាំងអស់ (${items.length})!`);
  };

  const handleUpdateItem = (id: string, updates: Partial<BatchItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveAll = () => {
    if (items.length === 0) {
      onShowToast('សូម Upload រូបភាព ឬបញ្ចូលផលិតផលយ៉ាងហោច 1 ដំបូង!', 'error');
      return;
    }

    const invalidItem = items.find((i) => !i.name.trim());
    if (invalidItem) {
      onShowToast('មានផលិតផលមួយចំនួនដែលគ្មានឈ្មោះ! សូមពិនិត្យឡើងវិញ។', 'error');
      return;
    }

    const payload: (Omit<Game, 'id'> & { id?: string })[] = items.map((item) => ({
      name: item.name.trim(),
      tag: item.tag.trim() || 'Steam Offline',
      genre: item.genre.trim() || 'General',
      price: item.price >= 0 ? item.price : 0,
      img: item.img || DEFAULT_COVER,
      link: item.link?.trim() || undefined,
      barcode: item.barcode || generateSku(),
      description: item.description.trim() || undefined,
      createdAt: new Date().toISOString(),
    }));

    onSaveMultipleProducts(payload);
    onShowToast(`🎉 បានបញ្ចូល ${items.length} ផលិតផលក្នុង POS និង Storefront រួចរាល់!`, 'success');
    setItems([]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl 2xl:max-w-6xl bg-[#0f172a] border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.25)] overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-900/40 bg-[#131b2e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-teal-500 to-purple-600 flex items-center justify-center text-white shadow-neon-cyan">
              <i className="fa-solid fa-layer-group text-lg"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-orbitron font-extrabold text-lg text-white">
                  POS MULTI-UPLOAD PRODUCTS
                </h3>
                <span className="text-[10px] bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full font-bold uppercase">
                  Steam Link Batch Sync
                </span>
              </div>
              <p className="text-xs text-cyan-300/80 font-rajdhani">
                Paste Steam Links or upload multiple images — auto-syncs Name, Cover, Genre &amp; Steam Link (never overwrites your notes)!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 text-gray-400 hover:text-white hover:bg-red-600/80 transition flex items-center justify-center cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5 flex-1">
          {/* Top Quick Settings Preset Bar */}
          <div className="bg-[#131b2e] p-4 rounded-xl border border-purple-900/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-orbitron font-bold text-gray-200 flex items-center gap-2">
                <i className="fa-solid fa-sliders text-cyan-400"></i>
                <span>BATCH DEFAULT PRESETS (APPLY TO UPLOADED ITEMS)</span>
              </span>
              <span className="text-[11px] text-gray-400 font-rajdhani">
                Rate: $1 = {exchangeRate.toLocaleString()} ៛
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Default Category */}
              <div>
                <label className="block text-[11px] text-gray-300 font-semibold mb-1">
                  DEFAULT CATEGORY:
                </label>
                <div className="flex gap-1">
                  <select
                    value={defaultTag}
                    onChange={(e) => setDefaultTag(e.target.value)}
                    className="flex-1 bg-[#0a0f1d] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
                  >
                    {PRESET_BATCH_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => applyPresetToAll('tag')}
                    className="px-2 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded text-[10px] font-bold cursor-pointer"
                    title="Apply to all items below"
                  >
                    Apply All
                  </button>
                </div>
              </div>

              {/* Default Genre */}
              <div>
                <label className="block text-[11px] text-gray-300 font-semibold mb-1">
                  DEFAULT GENRE:
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={defaultGenre}
                    onChange={(e) => setDefaultGenre(e.target.value)}
                    placeholder="Action RPG"
                    className="flex-1 bg-[#0a0f1d] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => applyPresetToAll('genre')}
                    className="px-2 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded text-[10px] font-bold cursor-pointer"
                    title="Apply to all items below"
                  >
                    Apply All
                  </button>
                </div>
              </div>

              {/* Default Price */}
              <div>
                <label className="block text-[11px] text-gray-300 font-semibold mb-1">
                  DEFAULT PRICE ($ USD):
                </label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    placeholder="2.50"
                    className="flex-1 bg-[#0a0f1d] text-white font-orbitron font-bold rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => applyPresetToAll('price')}
                    className="px-2 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded text-[10px] font-bold cursor-pointer"
                    title="Apply to all items below"
                  >
                    Apply All
                  </button>
                </div>
              </div>

              {/* Default Short Note / Description */}
              <div>
                <label className="block text-[11px] text-gray-300 font-semibold mb-1">
                  DEFAULT NOTE / RECEIPT DESC:
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={defaultDescription}
                    onChange={(e) => setDefaultDescription(e.target.value)}
                    placeholder="Steam Offline Account"
                    className="flex-1 bg-[#0a0f1d] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/30 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => applyPresetToAll('description')}
                    className="px-2 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded text-[10px] font-bold cursor-pointer"
                    title="Apply to all items below"
                  >
                    Apply All
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Upload Dropzone & Steam Links Paste Switcher */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Multi-Image File Picker Area */}
            <div
              className="md:col-span-2 relative border-2 border-dashed border-cyan-500/40 hover:border-cyan-400 bg-[#0a0f1d]/80 rounded-2xl p-6 text-center transition flex flex-col items-center justify-center group cursor-pointer"
              onClick={() => multiFileInputRef.current?.click()}
            >
              <input
                ref={multiFileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFilesSelect}
                className="hidden"
              />

              <div className="w-14 h-14 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-900/60 transition mb-3">
                <i className="fa-solid fa-cloud-arrow-up text-2xl"></i>
              </div>

              <h4 className="font-orbitron font-bold text-white text-sm">
                SELECT MULTIPLE IMAGES (DRAG &amp; DROP)
              </h4>
              <p className="text-xs text-gray-400 mt-1 max-w-sm">
                ជ្រើសរើសរូបភាពច្រើនក្នុងពេលតែមួយ (JPG, PNG, WebP)។ ប្រព័ន្ធនឹងទាញយកឈ្មោះដោយស្វ័យប្រវត្តិតាមឈ្មោះរូបភាព និងកាត់បន្ថយទំហំស្វ័យប្រវត្តិ។
              </p>

              <button
                type="button"
                className="mt-3 px-4 py-2 bg-gradient-to-r from-cyan-600 to-teal-500 text-white font-rajdhani font-bold text-xs rounded-xl shadow-md pointer-events-none"
              >
                <i className="fa-solid fa-images mr-1.5"></i>
                <span>Choose Multiple Files</span>
              </button>
            </div>

            {/* Paste Steam Links or Titles Card */}
            <div className="bg-[#131b2e] rounded-2xl p-4 border border-purple-900/40 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <i className="fa-brands fa-steam text-cyan-400"></i>
                  <h4 className="text-xs font-orbitron font-bold text-gray-200">
                    PASTE STEAM LINKS / TITLES
                  </h4>
                </div>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Paste Steam Store links (one per line) or use format:{' '}
                  <code className="text-cyan-300">Steam Link | Price | Note</code>.
                  Automatically fetches exact Name, verified Cover, Genre &amp; Link.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowTextPasteMode(!showTextPasteMode)}
                className="mt-3 w-full py-2 px-3 rounded-xl bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-200 border border-cyan-500/35 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <i className="fa-brands fa-steam"></i>
                <span>{showTextPasteMode ? 'Close Paste Box' : 'Open Steam Link Paste Box'}</span>
              </button>
            </div>
          </div>

          {/* Image Processing Progress Indicator */}
          {isProcessingFiles && (
            <div className="p-4 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-center space-y-2 animate-pulse">
              <div className="flex items-center justify-center gap-2 text-cyan-300 font-orbitron text-xs font-bold">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>
                  Compressing &amp; Preparing Images ({processedCount} / {totalFilesToProcess})...
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden max-w-md mx-auto">
                <div
                  className="bg-cyan-400 h-full transition-all duration-200"
                  style={{
                    width: `${
                      totalFilesToProcess > 0 ? (processedCount / totalFilesToProcess) * 100 : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Steam Batch Fetch Progress Indicator */}
          {isSteamBatchFetching && (
            <div className="p-4 bg-purple-950/50 border border-cyan-500/45 rounded-xl text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-cyan-300 font-orbitron text-xs font-bold">
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>
                  Fetching Steam Store Artwork &amp; Metadata ({steamBatchDone} /{' '}
                  {steamBatchTotal})...
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden max-w-md mx-auto">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-fuchsia-400 h-full transition-all duration-200"
                  style={{
                    width: `${
                      steamBatchTotal > 0 ? (steamBatchDone / steamBatchTotal) * 100 : 0
                    }%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {/* Steam Links / Text Paste Box (Collapsible) */}
          {showTextPasteMode && (
            <div className="bg-[#0a0f1d] border border-cyan-500/40 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <i className="fa-brands fa-steam"></i>
                  <span>Paste Steam Links or Titles (one per line):</span>
                </label>
                <span className="text-[11px] text-gray-400">
                  Formats: <code>https://store.steampowered.com/app/2358720/</code> or{' '}
                  <code>Link | Price | Note</code>
                </span>
              </div>
              <textarea
                rows={5}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={
                  'https://store.steampowered.com/app/2358720/Black_Myth_Wukong/ | 5.00 | Steam Offline Lifetime\nhttps://store.steampowered.com/app/1245620/ELDEN_RING/ | 3.50\nhttps://store.steampowered.com/app/814380/Sekiro_Shadows_Die_Twice__GOTY_Edition/'
                }
                className="w-full bg-[#131b2e] text-xs font-mono text-white p-3 rounded-xl border border-purple-900/50 outline-none focus:border-cyan-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTextPasteMode(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <i className="fa-brands fa-steam"></i>
                  <span>Generate &amp; Fetch Steam Info</span>
                </button>
              </div>
            </div>
          )}

          {/* Items Preview Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="font-orbitron font-bold text-sm text-white">
                  ITEMS READY FOR UPLOAD ({items.length})
                </h4>
                {items.length > 0 && (
                  <span className="text-xs bg-purple-950/80 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono">
                    Total: ${items.reduce((acc, i) => acc + i.price, 0).toFixed(2)}
                  </span>
                )}
              </div>

              {items.length > 0 && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSteamBatchFetching}
                    onClick={() => void runConcurrentSteamBatch(items, true)}
                    className="px-3 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 disabled:opacity-50 text-cyan-300 border border-cyan-500/35 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <i
                      className={`fa-solid ${
                        isSteamBatchFetching ? 'fa-spinner fa-spin' : 'fa-rotate'
                      } text-[11px]`}
                    ></i>
                    <span>Sync All with Steam</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems([])}
                    className="text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
                  >
                    Clear All ({items.length})
                  </button>
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 bg-[#0a0f1d]/60 rounded-xl border border-purple-900/30 text-gray-500 space-y-2">
                <i className="fa-solid fa-folder-open text-3xl text-gray-600"></i>
                <p className="text-xs">
                  No products in batch list yet. Paste Steam Links or select image files above to start.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-[#131b2e] border border-purple-900/40 hover:border-cyan-500/50 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center gap-3 transition"
                  >
                    {/* Index & Thumbnail */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono text-gray-500 w-5">
                        #{idx + 1}
                      </span>
                      <div className="w-12 h-16 rounded-lg overflow-hidden bg-black/60 border border-purple-500/30 relative">
                        <img
                          src={item.img}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover object-top"
                        />
                        {item.steamStatus === 'loading' && (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-cyan-300">
                            <i className="fa-solid fa-spinner fa-spin text-xs"></i>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Editable Fields Grid */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 w-full text-xs">
                      {/* Name & Optional Steam Link */}
                      <div className="lg:col-span-4 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <label className="block text-[10px] text-gray-400 font-semibold">
                            Product Name
                          </label>
                          {item.steamStatus === 'success' && item.steamMessage && (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              {item.steamMessage}
                            </span>
                          )}
                          {item.steamStatus === 'error' && item.steamMessage && (
                            <span
                              className="text-[10px] text-rose-400 truncate max-w-[140px]"
                              title={item.steamMessage}
                            >
                              {item.steamMessage}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                          className="w-full bg-[#0a0f1d] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/20 focus:border-cyan-400 outline-none"
                        />
                        <input
                          type="text"
                          value={item.link || ''}
                          onChange={(e) => handleUpdateItem(item.id, { link: e.target.value })}
                          placeholder="Steam Store Link (optional)"
                          className="w-full bg-[#0a0f1d]/80 text-[10px] text-cyan-300 placeholder-gray-600 rounded-md px-2 py-1 border border-cyan-900/40 focus:border-cyan-400 outline-none font-mono"
                        />
                      </div>

                      {/* Tag / Category */}
                      <div className="lg:col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-1">
                          Category
                        </label>
                        <select
                          value={item.tag}
                          onChange={(e) => handleUpdateItem(item.id, { tag: e.target.value })}
                          className="w-full bg-[#0a0f1d] text-white rounded-lg px-2 py-1.5 border border-purple-500/20 outline-none"
                        >
                          {PRESET_BATCH_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Genre */}
                      <div className="lg:col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-1">
                          Genre
                        </label>
                        <input
                          type="text"
                          value={item.genre}
                          onChange={(e) => handleUpdateItem(item.id, { genre: e.target.value })}
                          className="w-full bg-[#0a0f1d] text-white rounded-lg px-2.5 py-1.5 border border-purple-500/20 outline-none"
                        />
                      </div>

                      {/* Price */}
                      <div className="lg:col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-1">
                          Price ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.price}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              price: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full bg-[#0a0f1d] text-white font-orbitron font-bold rounded-lg px-2.5 py-1.5 border border-purple-500/20 focus:border-cyan-400 outline-none"
                        />
                      </div>

                      {/* Note / Receipt Short Desc (Never auto-filled by Steam) */}
                      <div className="lg:col-span-2">
                        <label className="block text-[10px] text-gray-400 font-semibold mb-1">
                          Note / Short Desc
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateItem(item.id, { description: e.target.value })
                          }
                          placeholder="Short note..."
                          className="w-full bg-[#0a0f1d] text-white text-[11px] rounded-lg px-2 py-1.5 border border-purple-500/20 outline-none"
                        />
                      </div>
                    </div>

                    {/* Row Actions: Steam Refresh & Delete */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={item.steamStatus === 'loading'}
                        onClick={() => void handleRefreshRowSteam(item)}
                        className="w-8 h-8 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 disabled:opacity-50 text-cyan-300 border border-cyan-500/35 flex items-center justify-center transition cursor-pointer"
                        title="Refresh Name, Cover & Genre from Steam Store"
                      >
                        <i
                          className={`fa-solid fa-rotate text-xs ${
                            item.steamStatus === 'loading' ? 'fa-spin' : ''
                          }`}
                        ></i>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="w-8 h-8 rounded-lg bg-red-950/50 hover:bg-red-900/80 text-red-400 hover:text-white flex items-center justify-center transition cursor-pointer"
                        title="Remove from batch"
                      >
                        <i className="fa-solid fa-trash-can text-xs"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#131b2e] border-t border-cyan-900/40 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-gray-300 font-rajdhani">
            <span>Ready: </span>
            <strong className="text-cyan-400 font-bold">{items.length} Products</strong>
            <span className="text-gray-500">
              {' '}
              • All products will instantly sync with POS &amp; Storefront
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={items.length === 0 || isProcessingFiles || isSteamBatchFetching}
              onClick={handleSaveAll}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-500 to-purple-600 hover:from-cyan-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-orbitron font-bold text-xs sm:text-sm shadow-neon-cyan flex items-center gap-2 cursor-pointer transition hover:scale-102"
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>UPLOAD ALL ({items.length}) PRODUCTS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
