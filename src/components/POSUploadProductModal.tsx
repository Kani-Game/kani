import React, { useState, useRef } from 'react';
import { Game } from '../types/game';
import { compressImageFile } from '../utils/imageUtils';

interface POSUploadProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProduct: (game: Omit<Game, 'id'> & { id?: string }) => Game;
  onOpenMultiUpload?: () => void;
  editingProduct?: Game | null;
  exchangeRate?: number;
}

const PRESET_COVERS = [
  {
    name: 'Cyberpunk 2077',
    url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80',
    genre: 'Sci-Fi RPG',
  },
  {
    name: 'Elden Ring',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
    genre: 'Action RPG',
  },
  {
    name: 'God of War',
    url: 'https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?w=600&auto=format&fit=crop&q=80',
    genre: 'Action Adventure',
  },
  {
    name: 'Black Myth: Wukong',
    url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600&auto=format&fit=crop&q=80',
    genre: 'Soulslike Action',
  },
  {
    name: 'Gaming Accessories',
    url: 'https://images.unsplash.com/photo-1527814050087-3793815479db?w=600&auto=format&fit=crop&q=80',
    genre: 'Hardware',
  },
];

export const POSUploadProductModal: React.FC<POSUploadProductModalProps> = ({
  isOpen,
  onClose,
  onSaveProduct,
  onOpenMultiUpload,
  editingProduct,
  exchangeRate = 4100,
}) => {
  const [name, setName] = useState(editingProduct?.name || '');
  const [tag, setTag] = useState(editingProduct?.tag || 'Steam Offline');
  const [customTag, setCustomTag] = useState('');
  const [genre, setGenre] = useState(editingProduct?.genre || 'Action RPG');
  const [price, setPrice] = useState<string>(
    editingProduct?.price !== undefined ? editingProduct.price.toString() : '5.00'
  );
  // Buy-in cost price: auto = 0, but user can input
  const [costPrice, setCostPrice] = useState<string>(
    editingProduct?.costPrice !== undefined ? editingProduct.costPrice.toString() : '0'
  );
  const [img, setImg] = useState(
    editingProduct?.img ||
      'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&auto=format&fit=crop&q=80'
  );
  const [barcode, setBarcode] = useState(
    editingProduct?.barcode ||
      `SKU-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [stock, setStock] = useState<string>(
    editingProduct?.stock !== undefined ? editingProduct.stock.toString() : ''
  );
  const [isDigital, setIsDigital] = useState(editingProduct?.stock === undefined);
  const [description, setDescription] = useState(editingProduct?.description || '');
  const [link, setLink] = useState(editingProduct?.link || '');
  const [imgError, setImgError] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const numPrice = parseFloat(price) || 0;
  const khrPrice = Math.round(numPrice * exchangeRate);

  const handleGenerateBarcode = () => {
    const randomSku = `KG-${Math.floor(100000 + Math.random() * 900000)}`;
    setBarcode(randomSku);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        alert('File size too large (max 15MB)');
        return;
      }
      setIsUploadingFile(true);
      try {
        const compressedBase64 = await compressImageFile(file, 640, 850, 0.82);
        setImg(compressedBase64);
        setImgError(false);
      } catch (err) {
        console.error('Image compression failed', err);
        const reader = new FileReader();
        reader.onload = (event) => {
          setImg(event.target?.result as string);
          setImgError(false);
        };
        reader.readAsDataURL(file);
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('សូមបញ្ចូលឈ្មោះ Game ឬ Product!');
      return;
    }

    const finalTag = tag === 'CUSTOM' ? (customTag.trim() || 'General') : tag;

    const productData: Omit<Game, 'id'> & { id?: string } = {
      ...(editingProduct?.id ? { id: editingProduct.id } : {}),
      name: name.trim(),
      tag: finalTag,
      genre: genre.trim() || 'General',
      price: numPrice,
      costPrice: parseFloat(costPrice) || 0,
      img: img.trim() || 'https://placehold.co/600x800/131b2e/ffffff?text=Game',
      barcode: barcode.trim() || undefined,
      stock: isDigital ? undefined : parseInt(stock, 10) || 0,
      description: description.trim() || undefined,
      link: link.trim() || undefined,
      createdAt: editingProduct?.createdAt || new Date().toISOString(),
    };

    onSaveProduct(productData);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-[#0f172a] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-900/40 bg-[#131b2e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-neon-purple">
              <i className="fa-solid fa-cloud-arrow-up text-lg"></i>
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-lg text-white">
                {editingProduct ? 'EDIT PRODUCT / GAME' : 'UPLOAD PRODUCT IN POS'}
              </h3>
              <p className="text-xs text-purple-300 font-rajdhani">
                {editingProduct
                  ? 'កែប្រែទិន្នន័យផលិតផល'
                  : 'បញ្ចូលផលិតផលក្នុង POS នឹងបង្ហាញលើគេហទំព័រ Storefront ភ្លាមៗ (Instant Sync)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!editingProduct && onOpenMultiUpload && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMultiUpload();
                }}
                className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Switch to Multi-Product Upload"
              >
                <i className="fa-solid fa-layer-group text-xs"></i>
                <span className="hidden sm:inline">Multi-Upload Mode</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 text-gray-400 hover:text-white hover:bg-red-600/80 transition flex items-center justify-center cursor-pointer"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 flex-1">
          {/* Real-time sync alert banner */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/60 to-cyan-950/60 border border-purple-500/30 flex items-center gap-3 text-xs text-purple-200">
            <i className="fa-solid fa-bolt text-cyan-400 text-base shrink-0"></i>
            <span>
              <strong>Auto-Sync Active:</strong> When you upload or save this item, it will immediately appear in the <strong>POS Cashier Terminal</strong> AND on the public <strong>Storefront Catalog</strong>!
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Essential Product Info */}
            <div className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Product / Game Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Black Myth: Wukong, Sekiro, Steam Account..."
                  className="w-full bg-[#131b2e] text-sm text-white placeholder-gray-500 rounded-xl px-3.5 py-2.5 border border-purple-500/30 focus:border-purple-400 focus:ring-1 focus:ring-purple-400 outline-none"
                />
              </div>

              {/* Tag / Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Category / Tag <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTag('Product');
                      if (price === '0') setPrice('20.00');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold font-rajdhani border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      tag === 'Product'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md'
                        : 'bg-[#131b2e] text-gray-400 border-purple-900/40 hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-box text-xs"></i>
                    <span>Product</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTag('Steam Offline');
                      if (price === '0') setPrice('5.00');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold font-rajdhani border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      tag === 'Steam Offline'
                        ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                        : 'bg-[#131b2e] text-gray-400 border-purple-900/40 hover:text-white'
                    }`}
                  >
                    <i className="fa-brands fa-steam text-xs"></i>
                    <span>Steam Offline</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTag('Gameថែមពេលទិញ External');
                      setPrice('0');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold font-rajdhani border transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      tag === 'Gameថែមពេលទិញ External'
                        ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                        : 'bg-[#131b2e] text-gray-400 border-purple-900/40 hover:text-white'
                    }`}
                  >
                    <i className="fa-solid fa-gift text-xs"></i>
                    <span>External (Free)</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <select
                    value={tag === 'Product' || tag === 'Steam Offline' || tag === 'Gameថែមពេលទិញ External' ? '' : tag}
                    onChange={(e) => {
                      if (e.target.value === 'CUSTOM') {
                        setTag('CUSTOM');
                      } else if (e.target.value) {
                        setTag(e.target.value);
                      }
                    }}
                    className="flex-1 bg-[#131b2e] text-xs text-gray-300 rounded-xl px-3 py-2 border border-purple-900/40 outline-none"
                  >
                    <option value="">Other Category Types...</option>
                    <option value="Account">Account (Steam/EA/Xbox)</option>
                    <option value="Gaming Accessories">Gaming Accessories / Gear</option>
                    <option value="Software & Tools">Software & Utility</option>
                    <option value="CUSTOM">Custom Tag (Type below)...</option>
                  </select>
                </div>

                {tag === 'CUSTOM' && (
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder="Enter custom category tag..."
                    className="mt-2 w-full bg-[#131b2e] text-xs text-white rounded-xl px-3 py-2 border border-purple-500/40 outline-none"
                  />
                )}
              </div>

              {/* Genre & Classification */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Genre / Type
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    placeholder="e.g. Hardware, Accessory, Action RPG, FPS"
                    className="flex-1 bg-[#131b2e] text-sm text-white placeholder-gray-500 rounded-xl px-3.5 py-2 border border-purple-500/30 outline-none"
                  />
                  <select
                    onChange={(e) => {
                      if (e.target.value) setGenre(e.target.value);
                    }}
                    value=""
                    className="bg-[#131b2e] text-xs text-gray-300 rounded-xl px-2 border border-purple-900/40"
                  >
                    <option value="">Quick Pick</option>
                    <option value="Hardware">Hardware / Gear</option>
                    <option value="Gaming Device">Gaming Device</option>
                    <option value="Action RPG">Action RPG</option>
                    <option value="Open World">Open World</option>
                    <option value="Sports">Sports</option>
                  </select>
                </div>
              </div>

              {/* Price (USD & KHR) & Buy-in Cost */}
              <div className="bg-[#131b2e]/80 p-3.5 rounded-xl border border-purple-900/50 space-y-3">
                {/* Selling Price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                      Sell-out Price ($ USD) <span className="text-red-400">*</span>
                    </label>
                    <span className="text-xs text-cyan-400 font-rajdhani font-bold">
                      ≈ {khrPrice.toLocaleString()} ៛ KHR
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="5.00"
                      className="w-full bg-[#0a0f1d] text-base font-orbitron font-bold text-white rounded-xl pl-8 pr-3.5 py-2 border border-purple-500/30 focus:border-cyan-400 outline-none"
                    />
                  </div>
                  {/* Fast price chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['0.00', '1.50', '2.50', '5.00', '10.00', '20.00', '28.00'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrice(p)}
                        className="px-2 py-0.5 rounded text-[11px] bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-500/20 cursor-pointer font-rajdhani font-bold"
                      >
                        {p === '0.00' ? 'Free' : `$${p}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buy-in Cost Price (Price Buy in auto = 0 but i can input) */}
                <div className="pt-2 border-t border-purple-900/40">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fa-solid fa-coins text-[11px]"></i>
                      <span>Buy-in Cost Price ($ USD)</span>
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Auto = $0.00 (Editable)
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#0a0f1d] text-sm font-mono text-emerald-300 rounded-xl pl-7 pr-3.5 py-1.5 border border-emerald-500/30 focus:border-emerald-400 outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Used for Profit calculation in Daily Reports (Profit = Sell-out - Buy-in).
                  </p>
                </div>
              </div>

              {/* Barcode & Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-gray-300 uppercase">
                      Barcode / SKU
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateBarcode}
                      className="text-[10px] text-cyan-400 hover:underline cursor-pointer"
                    >
                      Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="e.g., KG-849201"
                    className="w-full bg-[#131b2e] text-xs font-mono text-white rounded-xl px-3 py-2 border border-purple-500/30 outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-gray-300 uppercase">
                      Inventory Stock
                    </label>
                    <label className="text-[10px] text-purple-300 flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDigital}
                        onChange={(e) => setIsDigital(e.target.checked)}
                        className="rounded accent-purple-600 cursor-pointer"
                      />
                      <span>Unlimited</span>
                    </label>
                  </div>
                  <input
                    type="number"
                    min="0"
                    disabled={isDigital}
                    value={isDigital ? '' : stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder={isDigital ? 'Digital / Unlimited' : '10'}
                    className={`w-full bg-[#131b2e] text-xs text-white rounded-xl px-3 py-2 border border-purple-500/30 outline-none ${
                      isDigital ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Image Upload & Preview */}
            <div className="space-y-4 flex flex-col">
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Product Image / Cover Photo
              </label>

              {/* Cover Preview Card */}
              <div className="relative w-full aspect-[4/3] bg-[#0a0f1d] rounded-2xl overflow-hidden border-2 border-dashed border-purple-500/40 flex items-center justify-center group">
                {img && !imgError ? (
                  <img
                    src={img}
                    alt="Preview"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-4">
                    <i className="fa-solid fa-image text-3xl text-gray-500 mb-2"></i>
                    <p className="text-xs text-gray-400">No Image Selected</p>
                  </div>
                )}

                {/* Overlaid badges */}
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2.5 py-0.5 rounded-md text-[10px] font-bold text-cyan-300 border border-cyan-500/30 font-rajdhani">
                  {tag}
                </div>
                <div className="absolute bottom-2 right-2 bg-purple-600/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-xs font-extrabold text-white font-orbitron shadow-md">
                  {numPrice === 0 ? 'FREE' : `$${numPrice.toFixed(2)}`}
                </div>
              </div>

              {/* Upload Buttons */}
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingFile}
                    className="flex-1 py-2 px-3 rounded-xl bg-purple-900/50 hover:bg-purple-800/70 border border-purple-500/40 text-purple-200 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-arrow-up-from-bracket"></i>
                    <span>{isUploadingFile ? 'Uploading...' : 'Upload Device Image'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const url = prompt('Enter Image URL:');
                      if (url) {
                        setImg(url.trim());
                        setImgError(false);
                      }
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <i className="fa-solid fa-link"></i>
                    <span>Paste URL</span>
                  </button>
                </div>

                {/* Preset Fast Image Picks */}
                <div>
                  <p className="text-[11px] text-gray-400 mb-1.5">Or pick sample cover:</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_COVERS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          setImg(preset.url);
                          setImgError(false);
                          if (!name) setName(preset.name);
                          if (preset.genre) setGenre(preset.genre);
                        }}
                        className="group relative aspect-video rounded-lg overflow-hidden border border-purple-900/50 hover:border-cyan-400 transition cursor-pointer"
                        title={preset.name}
                      >
                        <img
                          src={preset.url}
                          alt={preset.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Description & Link */}
                <div className="pt-1">
                  <input
                    type="text"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Official Store / Telegram Download Link (Optional)"
                    className="w-full bg-[#131b2e] text-xs text-white placeholder-gray-500 rounded-xl px-3 py-1.5 border border-purple-500/20 outline-none mb-2"
                  />

                  <label className="block text-[11px] font-semibold text-gray-300 uppercase mb-1">
                    Short Description (Shows on Receipt under Name)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description, e.g., Steam Offline Lifetime Access, Version 1.0..."
                    className="w-full bg-[#131b2e] text-xs text-white placeholder-gray-500 rounded-xl px-3 py-1.5 border border-purple-500/20 outline-none resize-none"
                  ></textarea>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-purple-900/40 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-orbitron font-bold text-xs sm:text-sm shadow-neon-purple flex items-center gap-2 cursor-pointer"
            >
              <i className="fa-solid fa-cloud-arrow-up"></i>
              <span>{editingProduct ? 'SAVE CHANGES' : 'UPLOAD & PUBLISH PRODUCT'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
