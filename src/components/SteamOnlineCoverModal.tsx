import React, { useEffect, useRef, useState } from 'react';
import { SiteSettings, SteamOnlineCoverSlide } from '../types/game';
import { DEFAULT_COVER_IMAGE, extractYouTubeVideoId } from './CoverMediaModal';
import { compressImageFile } from '../utils/imageUtils';

interface SteamOnlineCoverFormProps {
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onClose?: () => void;
}

const createDefaultSlide = (index = 1): SteamOnlineCoverSlide => ({
  id: `steam_cover_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  mediaType: 'photo',
  mediaUrl: DEFAULT_COVER_IMAGE,
  title: index === 1 ? 'STEAM ONLINE MEGA SALE' : `STEAM ONLINE PROMO #${index}`,
  subtitle: 'ហ្គេម Steam Online តម្លៃពេញផ្លូវការពី Steam Store និងមានបញ្ចុះតម្លៃពិសេសប្រចាំថ្ងៃ',
  ctaLabel: 'ទាក់ទង Admin',
  discountPrefix: 'Up to',
  discountHighlight: '-50%',
  showDiscount: true,
});

export const SteamOnlineCoverForm: React.FC<SteamOnlineCoverFormProps> = ({
  settings,
  onSaveSettings,
  onShowToast,
  onClose,
}) => {
  const getInitialSlides = (): SteamOnlineCoverSlide[] => {
    if (Array.isArray(settings.steamOnlineCoverSlides) && settings.steamOnlineCoverSlides.length > 0) {
      return settings.steamOnlineCoverSlides.map((s) => ({ ...s }));
    }
    return [createDefaultSlide(1)];
  };

  const [slides, setSlides] = useState<SteamOnlineCoverSlide[]>(getInitialSlides);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isUploading, setIsUploading] = useState<'photo' | 'video' | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Array.isArray(settings.steamOnlineCoverSlides) && settings.steamOnlineCoverSlides.length > 0) {
      setSlides(settings.steamOnlineCoverSlides.map((s) => ({ ...s })));
    }
  }, [settings.steamOnlineCoverSlides]);

  const safeIdx = Math.min(activeSlideIdx, Math.max(0, slides.length - 1));
  const currentSlide = slides[safeIdx] || createDefaultSlide(1);

  const updateCurrentSlide = (patch: Partial<SteamOnlineCoverSlide>) => {
    setSlides((prev) =>
      prev.map((slide, idx) => (idx === safeIdx ? { ...slide, ...patch } : slide))
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast?.('សូមជ្រើសរើសឯកសាររូបភាព (JPG, PNG, WebP, GIF)', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onShowToast?.('ទំហំរូបភាពធំពេក (Max 15MB)', 'error');
      return;
    }

    setIsUploading('photo');
    try {
      const compressed = await compressImageFile(file, 1400, 900, 0.85);
      updateCurrentSlide({ mediaType: 'photo', mediaUrl: compressed });
      onShowToast?.('បានបញ្ចូលរូបភាព Cover រួចរាល់! សូមចុច Save Steam Online Cover');
    } catch {
      onShowToast?.('បរាជ័យក្នុងការបញ្ចូលរូបភាព', 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name)) {
      onShowToast?.('សូមជ្រើសរើសឯកសារវីដេអូ (MP4, WebM, MOV, OGG)', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      onShowToast?.('ទំហំវីដេអូធំពេក (Max 50MB)', 'error');
      return;
    }

    setIsUploading('video');
    try {
      const response = await fetch('/api/upload-cover-media', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'video/mp4',
          'x-file-name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Upload failed');
      }
      updateCurrentSlide({ mediaType: 'video', mediaUrl: payload.url });
      onShowToast?.('បានបញ្ចូលវីដេអូ Cover រួចរាល់! សូមចុច Save Steam Online Cover');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload video';
      onShowToast?.(`Upload វីដេអូមិនបានសម្រេច: ${msg}`, 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const handleAddSlide = () => {
    const nextSlide = createDefaultSlide(slides.length + 1);
    const nextSlides = [...slides, nextSlide];
    setSlides(nextSlides);
    setActiveSlideIdx(nextSlides.length - 1);
  };

  const handleDeleteSlide = (idxToDelete: number) => {
    if (slides.length <= 1) {
      onShowToast?.('ត្រូវមាន Cover យ៉ាងតិច ១ ផ្ទាំង', 'info');
      return;
    }
    const nextSlides = slides.filter((_, idx) => idx !== idxToDelete);
    setSlides(nextSlides);
    setActiveSlideIdx(Math.max(0, Math.min(safeIdx, nextSlides.length - 1)));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = slides.map((s) => ({
      ...s,
      mediaUrl: s.mediaUrl?.trim() || DEFAULT_COVER_IMAGE,
      title: s.title?.trim() || 'STEAM ONLINE STORE',
      subtitle: s.subtitle?.trim() || '',
      ctaLabel: s.ctaLabel?.trim() || '',
      discountPrefix: s.discountPrefix?.trim() || '',
      discountHighlight: s.discountHighlight?.trim() || '',
      showDiscount: s.showDiscount !== false,
    }));

    onSaveSettings({
      ...settings,
      steamOnlineCoverSlides: cleaned,
    });
    onShowToast?.('🎉 បានរក្សាទុក Cover Steam Online (Photo/Video/Text & Discount) រួចរាល់!');
    onClose?.();
  };

  const handleResetDefault = () => {
    const fresh = [createDefaultSlide(1)];
    setSlides(fresh);
    setActiveSlideIdx(0);
    onSaveSettings({
      ...settings,
      steamOnlineCoverSlides: [],
    });
    onShowToast?.('បានត្រឡប់ទៅ Steam Online Cover ដើមវិញរួចរាល់!');
  };

  const youtubeId =
    currentSlide.mediaType === 'video' ? extractYouTubeVideoId(currentSlide.mediaUrl) : null;

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Multi-Slide Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {slides.map((s, idx) => (
            <div key={s.id} className="inline-flex items-center">
              <button
                type="button"
                onClick={() => setActiveSlideIdx(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-orbitron font-bold border transition cursor-pointer ${
                  idx === safeIdx
                    ? 'bg-gradient-to-r from-[#0ea5e9] to-[#0077e6] text-white border-sky-300 shadow-md'
                    : 'bg-[#131b2e] text-gray-300 border-slate-700 hover:text-white'
                }`}
              >
                Slide {idx + 1}
              </button>
              {slides.length > 1 && idx === safeIdx && (
                <button
                  type="button"
                  onClick={() => handleDeleteSlide(idx)}
                  title="Delete this slide"
                  className="ml-1 w-7 h-7 rounded-lg bg-rose-950/70 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 flex items-center justify-center transition cursor-pointer"
                >
                  <i className="fa-solid fa-trash text-[10px]"></i>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddSlide}
          className="px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-[#1a2640] text-sky-300 border border-sky-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
        >
          <i className="fa-solid fa-plus"></i>
          <span>Add Slide</span>
        </button>
      </div>

      {/* Live Preview */}
      <div className="relative h-44 sm:h-52 rounded-xl overflow-hidden bg-[#06090f] border border-slate-700/80 flex items-center">
        {currentSlide.mediaType === 'video' && currentSlide.mediaUrl?.trim() ? (
          youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&rel=0`}
              title="Steam Online Cover Video Preview"
              className="absolute inset-0 w-full h-full pointer-events-none scale-125 opacity-75"
              allow="autoplay; encrypted-media"
            />
          ) : (
            <video
              key={currentSlide.mediaUrl}
              src={currentSlide.mediaUrl}
              autoPlay
              loop
              muted
              playsInline
              className="absolute inset-0 w-full h-full object-cover opacity-75"
            />
          )
        ) : (
          <img
            src={currentSlide.mediaUrl || DEFAULT_COVER_IMAGE}
            alt="Cover Preview"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-70"
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#06090f] via-[#06090f]/75 to-transparent" />

        <div className="relative z-10 p-5 max-w-md space-y-2">
          {currentSlide.showDiscount !== false &&
            (currentSlide.discountPrefix || currentSlide.discountHighlight) && (
              <div className="inline-flex items-stretch">
                {currentSlide.discountPrefix && (
                  <div className="px-2 py-1 bg-gradient-to-b from-[#0ea5e9] to-[#0077e6] -skew-x-12 flex items-center rounded-l-[3px]">
                    <span className="skew-x-12 text-white font-sans font-extrabold text-[11px] leading-none">
                      {currentSlide.discountPrefix}
                    </span>
                  </div>
                )}
                {currentSlide.discountHighlight && (
                  <div className="px-2.5 py-1 bg-gradient-to-b from-[#ff6a13] to-[#ea4200] -skew-x-12 -ml-0.5 flex items-center rounded-r-[3px]">
                    <span className="skew-x-12 text-white font-sans font-black text-sm leading-none">
                      {currentSlide.discountHighlight}
                    </span>
                  </div>
                )}
              </div>
            )}

          <div className="font-g2a-display font-black uppercase text-white text-lg sm:text-xl leading-tight line-clamp-2">
            {currentSlide.title || 'STEAM ONLINE COVER'}
          </div>
          {currentSlide.subtitle && (
            <p className="text-[11px] text-slate-300 line-clamp-2">{currentSlide.subtitle}</p>
          )}
        </div>
      </div>

      {/* Media Type Switcher + Upload/URL */}
      <div className="space-y-3 p-4 rounded-xl bg-[#0b1120] border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-orbitron font-bold text-slate-200 uppercase tracking-wider">
            1. Cover Background (Photo or Video)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateCurrentSlide({ mediaType: 'photo' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-orbitron font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                currentSlide.mediaType === 'photo'
                  ? 'bg-sky-600 text-white border-sky-400'
                  : 'bg-[#131b2e] text-gray-300 border-slate-700'
              }`}
            >
              <i className="fa-solid fa-image"></i>
              <span>Photo</span>
            </button>
            <button
              type="button"
              onClick={() => updateCurrentSlide({ mediaType: 'video' })}
              className={`px-3 py-1.5 rounded-lg text-xs font-orbitron font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                currentSlide.mediaType === 'video'
                  ? 'bg-orange-600 text-white border-orange-400'
                  : 'bg-[#131b2e] text-gray-300 border-slate-700'
              }`}
            >
              <i className="fa-solid fa-video"></i>
              <span>Video</span>
            </button>
          </div>
        </div>

        {currentSlide.mediaType === 'photo' ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={currentSlide.mediaUrl}
              onChange={(e) => updateCurrentSlide({ mediaUrl: e.target.value })}
              placeholder="Paste Photo URL or click Upload Photo..."
              className="flex-1 min-w-0 bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-slate-700 outline-none focus:border-sky-400"
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handlePhotoUpload(e)}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading !== null}
              onClick={() => photoInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#0077e6] hover:opacity-95 disabled:opacity-50 text-white font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
            >
              <i
                className={`fa-solid ${
                  isUploading === 'photo' ? 'fa-spinner fa-spin' : 'fa-upload'
                }`}
              ></i>
              <span>Upload Photo</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={currentSlide.mediaUrl === DEFAULT_COVER_IMAGE ? '' : currentSlide.mediaUrl}
                onChange={(e) => updateCurrentSlide({ mediaUrl: e.target.value })}
                placeholder="https://.../video.mp4 or YouTube link or upload video..."
                className="flex-1 min-w-0 bg-[#131b2e] text-xs text-cyan-200 rounded-xl px-3.5 py-2.5 border border-slate-700 outline-none focus:border-orange-400"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/webm,video/ogg,video/quicktime,video/*"
                onChange={(e) => void handleVideoUpload(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploading !== null}
                onClick={() => videoInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#ff6a13] to-[#ea4200] hover:opacity-95 disabled:opacity-50 text-white font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                <i
                  className={`fa-solid ${
                    isUploading === 'video' ? 'fa-spinner fa-spin' : 'fa-clapperboard'
                  }`}
                ></i>
                <span>{isUploading === 'video' ? 'Uploading...' : 'Upload Video'}</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              Supports MP4, WebM, MOV (max 50MB) or direct Video / YouTube URL.
            </p>
          </div>
        )}
      </div>

      {/* Text Overlay Fields */}
      <div className="space-y-3 p-4 rounded-xl bg-[#0b1120] border border-slate-800">
        <span className="block text-xs font-orbitron font-bold text-slate-200 uppercase tracking-wider">
          2. Cover Text (Headline, Subtitle & Button)
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-300 mb-1">
              COVER HEADLINE TEXT
            </label>
            <input
              type="text"
              value={currentSlide.title}
              onChange={(e) => updateCurrentSlide({ title: e.target.value })}
              placeholder="e.g. STEAM ONLINE MEGA SALE"
              className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 outline-none focus:border-sky-400"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-300 mb-1">
              BUTTON TEXT (OPTIONAL)
            </label>
            <input
              type="text"
              value={currentSlide.ctaLabel || ''}
              onChange={(e) => updateCurrentSlide({ ctaLabel: e.target.value })}
              placeholder="e.g. ទាក់ទង Admin / Order Now"
              className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2.5 border border-slate-700 outline-none focus:border-sky-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-300 mb-1">
            COVER SUBTITLE / DESCRIPTION TEXT
          </label>
          <textarea
            rows={2}
            value={currentSlide.subtitle || ''}
            onChange={(e) => updateCurrentSlide({ subtitle: e.target.value })}
            placeholder="Write promo text in Khmer or English..."
            className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-slate-700 outline-none focus:border-sky-400"
          />
        </div>
      </div>

      {/* Discount Style Ribbon Configuration */}
      <div className="space-y-3 p-4 rounded-xl bg-[#0b1120] border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-orbitron font-bold text-slate-200 uppercase tracking-wider">
            3. Discount Style Ribbon
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={currentSlide.showDiscount !== false}
              onChange={(e) => updateCurrentSlide({ showDiscount: e.target.checked })}
              className="accent-orange-500 w-4 h-4 cursor-pointer"
            />
            <span>Show Discount Ribbon</span>
          </label>
        </div>

        {currentSlide.showDiscount !== false && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-sky-300 mb-1">
                BLUE RIBBON TEXT
              </label>
              <input
                type="text"
                value={currentSlide.discountPrefix ?? ''}
                onChange={(e) => updateCurrentSlide({ discountPrefix: e.target.value })}
                placeholder="e.g. Up to"
                className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2.5 border border-sky-500/40 outline-none focus:border-sky-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-orange-300 mb-1">
                ORANGE DISCOUNT TEXT
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentSlide.discountHighlight ?? ''}
                  onChange={(e) => updateCurrentSlide({ discountHighlight: e.target.value })}
                  placeholder="e.g. -50%"
                  className="flex-1 bg-[#131b2e] text-xs text-white font-bold rounded-xl px-3.5 py-2.5 border border-orange-500/40 outline-none focus:border-orange-400"
                />
                {['-30%', '-50%', '-70%'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateCurrentSlide({ discountHighlight: preset })}
                    className="px-2.5 py-2 rounded-lg bg-[#131b2e] hover:bg-orange-600/30 text-orange-300 border border-orange-500/35 text-[11px] font-bold cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
        <button
          type="button"
          onClick={handleResetDefault}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        >
          <i className="fa-solid fa-rotate-left"></i>
          <span>Reset Default</span>
        </button>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isUploading !== null}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0ea5e9] via-[#0077e6] to-[#ff5a00] hover:opacity-95 disabled:opacity-50 text-white font-orbitron font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer"
          >
            <i className="fa-solid fa-floppy-disk"></i>
            <span>SAVE STEAM ONLINE COVER</span>
          </button>
        </div>
      </div>
    </form>
  );
};

interface SteamOnlineCoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SteamOnlineCoverModal: React.FC<SteamOnlineCoverModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onShowToast,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#0f172a] border border-sky-500/45 rounded-2xl shadow-2xl p-5 sm:p-7 my-4 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0ea5e9]/30 to-[#ff5a00]/30 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <i className="fa-solid fa-photo-film text-lg"></i>
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-base text-white">
                STEAM ONLINE COVER (PHOTO / VIDEO / TEXT)
              </h3>
              <p className="text-xs text-gray-400">
                Add Photo or Video, custom Headline/Subtitle text, and Discount ribbon style
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
            aria-label="Close modal"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        <SteamOnlineCoverForm
          settings={settings}
          onSaveSettings={onSaveSettings}
          onShowToast={onShowToast}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
