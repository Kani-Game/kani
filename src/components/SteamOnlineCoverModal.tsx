import React, { useEffect, useRef, useState } from 'react';
import { SiteSettings, SteamOnlineCoverSlide } from '../types/game';
import {
  DEFAULT_COVER_IMAGE,
  DEFAULT_EXTERNAL_COVER_IMAGE,
  extractYouTubeVideoId,
} from './CoverMediaModal';
import { PromoCoverTarget } from './SteamOnlineCover';
import { compressImageFile } from '../utils/imageUtils';

interface SteamOnlineCoverFormProps {
  target?: PromoCoverTarget;
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onClose?: () => void;
}

const TARGET_META: Record<
  PromoCoverTarget,
  {
    settingsKey: 'steamOnlineCoverSlides' | 'productCoverSlides' | 'externalCoverSlides';
    label: string;
    modalTitle: string;
    saveButton: string;
    defaultTitle: string;
    defaultSubtitle: string;
    defaultPrefix: string;
    defaultHighlight: string;
  }
> = {
  'steam-online': {
    settingsKey: 'steamOnlineCoverSlides',
    label: 'Steam Online',
    modalTitle: 'STEAM ONLINE COVER (PHOTO / VIDEO / TEXT)',
    saveButton: 'SAVE STEAM ONLINE COVER',
    defaultTitle: 'STEAM ONLINE MEGA SALE',
    defaultSubtitle: 'ហ្គេម Steam Online តម្លៃពេញផ្លូវការពី Steam Store និងមានបញ្ចុះតម្លៃពិសេសប្រចាំថ្ងៃ',
    defaultPrefix: 'Up to',
    defaultHighlight: '-50%',
  },
  product: {
    settingsKey: 'productCoverSlides',
    label: 'Product',
    modalTitle: 'PRODUCT COVER (PHOTO / VIDEO / TEXT)',
    saveButton: 'SAVE PRODUCT COVER',
    defaultTitle: 'GAMING PRODUCTS & GEAR',
    defaultSubtitle: 'ទំនិញគ្រឿងបន្លាស់ ឧបករណ៍ហ្គេម External HDD Controller Keyboard និង Accessories គុណភាពខ្ពស់',
    defaultPrefix: 'Shop',
    defaultHighlight: 'HOT GEAR',
  },
  external: {
    settingsKey: 'externalCoverSlides',
    label: 'GameថែមExternal',
    modalTitle: 'GAME ថែម EXTERNAL COVER (PHOTO / VIDEO / TEXT)',
    saveButton: 'SAVE EXTERNAL COVER',
    defaultTitle: 'GAME ថែមពេលទិញ EXTERNAL',
    defaultSubtitle: 'ជ្រើសរើសហ្គេម PC ពេញនិយមជាច្រើនដោយឥតគិតថ្លៃ នៅពេលទិញ External Hard Disk ពីហាងយើងខ្ញុំ',
    defaultPrefix: 'External',
    defaultHighlight: 'FREE GAMES',
  },
};

const getTargetDefaultCover = (target: PromoCoverTarget): string =>
  target === 'external' ? DEFAULT_EXTERNAL_COVER_IMAGE : DEFAULT_COVER_IMAGE;

const createDefaultSlide = (target: PromoCoverTarget, index = 1): SteamOnlineCoverSlide => {
  const meta = TARGET_META[target];
  return {
    id: `${target}_cover_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    mediaType: 'photo',
    mediaLayout: target === 'external' ? 'side' : undefined,
    mediaUrl: getTargetDefaultCover(target),
    rightMediaUrl: '',
    title: index === 1 ? meta.defaultTitle : `${meta.label.toUpperCase()} PROMO #${index}`,
    subtitle: meta.defaultSubtitle,
    ctaLabel: 'ទាក់ទង Admin',
    discountPrefix: meta.defaultPrefix,
    discountHighlight: meta.defaultHighlight,
    showDiscount: true,
  };
};

export const SteamOnlineCoverForm: React.FC<SteamOnlineCoverFormProps> = ({
  target = 'steam-online',
  settings,
  onSaveSettings,
  onShowToast,
  onClose,
}) => {
  const meta = TARGET_META[target];
  const savedSlidesForTarget = settings[meta.settingsKey];

  const getInitialSlides = (): SteamOnlineCoverSlide[] => {
    if (Array.isArray(savedSlidesForTarget) && savedSlidesForTarget.length > 0) {
      return savedSlidesForTarget.map((s) => ({ ...s }));
    }
    return [createDefaultSlide(target, 1)];
  };

  const [slides, setSlides] = useState<SteamOnlineCoverSlide[]>(getInitialSlides);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isUploading, setIsUploading] = useState<'photo' | 'right' | 'video' | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const rightPhotoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (Array.isArray(savedSlidesForTarget) && savedSlidesForTarget.length > 0) {
      setSlides(savedSlidesForTarget.map((s) => ({ ...s })));
    } else {
      setSlides([createDefaultSlide(target, 1)]);
    }
    setActiveSlideIdx(0);
  }, [target, savedSlidesForTarget]);

  const safeIdx = Math.min(activeSlideIdx, Math.max(0, slides.length - 1));
  const currentSlide = slides[safeIdx] || createDefaultSlide(target, 1);
  const currentMediaLayout: 'side' | 'full' =
    currentSlide.mediaLayout === 'full' ? 'full' : 'side';

  const updateCurrentSlide = (patch: Partial<SteamOnlineCoverSlide>) => {
    setSlides((prev) =>
      prev.map((slide, idx) => (idx === safeIdx ? { ...slide, ...patch } : slide))
    );
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'left' | 'right' = 'left'
  ) => {
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

    setIsUploading(side === 'right' ? 'right' : 'photo');
    try {
      const compressed = await compressImageFile(file, 1200, 720, 0.8, 180_000);
      if (side === 'right') {
        updateCurrentSlide({ mediaType: 'photo', rightMediaUrl: compressed });
      } else {
        updateCurrentSlide({ mediaType: 'photo', mediaUrl: compressed });
      }
      onShowToast?.(`បានបញ្ចូលរូបភាព Cover ${meta.label} រួចរាល់! សូមចុច Save ដើម្បីរក្សាទុក`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'បរាជ័យក្នុងការបញ្ចូលរូបភាព';
      onShowToast?.(msg, 'error');
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
      onShowToast?.(`បានបញ្ចូលវីដេអូ Cover ${meta.label} រួចរាល់! សូមចុច Save ដើម្បីរក្សាទុក`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload video';
      onShowToast?.(`Upload វីដេអូមិនបានសម្រេច: ${msg}`, 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const handleAddSlide = () => {
    const nextSlide = createDefaultSlide(target, slides.length + 1);
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
    const defaultImg = getTargetDefaultCover(target);
    const hasInvalidVideo = slides.some(
      (s) => s.mediaType === 'video' && (!s.mediaUrl?.trim() || s.mediaUrl === defaultImg)
    );
    if (hasInvalidVideo) {
      onShowToast?.('សូម Upload វីដេអូ ឬបញ្ចូល Video URL ជាមុនសិន', 'error');
      return;
    }

    const cleaned = slides.map((s) => ({
      ...s,
      mediaLayout: target === 'external' ? (s.mediaLayout === 'full' ? ('full' as const) : ('side' as const)) : s.mediaLayout,
      mediaUrl: s.mediaUrl?.trim() || defaultImg,
      rightMediaUrl: s.rightMediaUrl?.trim() || '',
      title: s.title?.trim() || meta.defaultTitle,
      subtitle: s.subtitle?.trim() || '',
      ctaLabel: s.ctaLabel?.trim() || '',
      discountPrefix: s.discountPrefix?.trim() || '',
      discountHighlight: s.discountHighlight?.trim() || '',
      showDiscount: s.showDiscount !== false,
    }));

    onSaveSettings({
      ...settings,
      [meta.settingsKey]: cleaned,
    });
    onShowToast?.(`🎉 បានរក្សាទុក Cover ${meta.label} រួចរាល់!`);
    onClose?.();
  };

  const handleResetDefault = () => {
    const fresh = [createDefaultSlide(target, 1)];
    setSlides(fresh);
    setActiveSlideIdx(0);
    onSaveSettings({
      ...settings,
      [meta.settingsKey]: [],
    });
    onShowToast?.(`បានត្រឡប់ទៅ Cover ${meta.label} ដើមវិញរួចរាល់!`);
  };

  const isExternal = target === 'external';
  const youtubeId =
    currentSlide.mediaType === 'video' ? extractYouTubeVideoId(currentSlide.mediaUrl) : null;

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Multi-Slide Tabs Bar */}
      {(!isExternal || slides.length > 1) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 pb-3 border-b ${
            isExternal ? 'border-purple-900/40' : 'border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {slides.map((s, idx) => (
              <div key={s.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveSlideIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-orbitron font-bold border transition cursor-pointer ${
                    idx === safeIdx
                      ? isExternal
                        ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white border-fuchsia-400 shadow-md'
                        : 'bg-gradient-to-r from-[#0ea5e9] to-[#0077e6] text-white border-sky-300 shadow-md'
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
            className={`px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-[#1a2640] text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              isExternal
                ? 'text-purple-300 border border-purple-500/40'
                : 'text-sky-300 border border-sky-500/40'
            }`}
          >
            <i className="fa-solid fa-plus"></i>
            <span>Add Slide</span>
          </button>
        </div>
      )}

      {/* Live Preview */}
      {target === 'product' ? (
        <div className="rounded-xl overflow-hidden bg-[#0a0f1a] border border-sky-500/35 grid grid-cols-12 h-44 sm:h-48">
          <div className="col-span-5 p-4 flex flex-col justify-between bg-[#0d1524] border-r border-slate-800">
            <div className="space-y-1.5">
              <div className="text-[10px] font-rajdhani font-bold uppercase text-sky-400 truncate">
                Hardware &amp; Gear
                {currentSlide.showDiscount !== false && (currentSlide.discountPrefix || currentSlide.discountHighlight)
                  ? ` · ${[currentSlide.discountPrefix, currentSlide.discountHighlight].filter(Boolean).join(' ')}`
                  : ''}
              </div>
              <div className="font-orbitron font-black text-white text-sm sm:text-base leading-tight line-clamp-2">
                {currentSlide.title || meta.defaultTitle}
              </div>
              {currentSlide.subtitle && (
                <p className="text-[10px] text-slate-300 line-clamp-2">{currentSlide.subtitle}</p>
              )}
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500 text-slate-950 font-orbitron font-bold text-[10px] w-fit">
              <span>{currentSlide.ctaLabel || 'ទាក់ទង Admin'}</span>
            </div>
          </div>
          <div className="col-span-7 relative overflow-hidden bg-[#060911]">
            {currentSlide.mediaType === 'video' && currentSlide.mediaUrl?.trim() ? (
              youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&rel=0`}
                  title="Product Cover Video Preview"
                  className="absolute inset-0 w-full h-full pointer-events-none scale-125"
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
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )
            ) : (
              <img
                src={currentSlide.mediaUrl || DEFAULT_COVER_IMAGE}
                alt="Product Cover Preview"
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
          </div>
        </div>
      ) : target === 'external' ? (
        <>
          {/* Mode & Layout Switchers — Identical to Steam Offline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                Cover Media Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    updateCurrentSlide({
                      mediaType: 'photo',
                      mediaUrl: currentSlide.mediaUrl?.trim() || DEFAULT_EXTERNAL_COVER_IMAGE,
                    })
                  }
                  className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    currentSlide.mediaType === 'photo'
                      ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white border-fuchsia-400 shadow-md'
                      : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-image"></i>
                  <span>Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const isDefaultPhoto =
                      !currentSlide.mediaUrl?.trim() ||
                      currentSlide.mediaUrl === DEFAULT_EXTERNAL_COVER_IMAGE;
                    updateCurrentSlide({
                      mediaType: 'video',
                      mediaUrl: isDefaultPhoto ? '' : currentSlide.mediaUrl,
                      mediaLayout: isDefaultPhoto ? 'full' : currentMediaLayout,
                    });
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    currentSlide.mediaType === 'video'
                      ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-400 shadow-md'
                      : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-video"></i>
                  <span>Video</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                Display Layout
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => updateCurrentSlide({ mediaLayout: 'full' })}
                  className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    currentMediaLayout === 'full'
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                      : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-panorama"></i>
                  <span>Full Cover</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateCurrentSlide({ mediaLayout: 'side' })}
                  className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                    currentMediaLayout === 'side'
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                      : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-table-columns"></i>
                  <span>Side Panels</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Preview — Identical to Steam Offline */}
          <div className="relative h-40 sm:h-48 rounded-xl overflow-hidden bg-[#0c0820] border border-purple-500/40 flex items-center justify-center">
            {currentSlide.mediaType === 'video' && currentSlide.mediaUrl?.trim() ? (
              youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&loop=1&playlist=${youtubeId}&controls=0&rel=0`}
                  title="External Cover Video Preview"
                  className="w-full h-full pointer-events-none scale-125"
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
                  className={`h-full object-cover ${currentMediaLayout === 'full' ? 'w-full' : 'w-1/2 mx-auto'}`}
                />
              )
            ) : currentMediaLayout === 'full' ? (
              <img
                src={currentSlide.mediaUrl || DEFAULT_EXTERNAL_COVER_IMAGE}
                alt="External Cover Preview"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-between bg-[radial-gradient(ellipse_at_center,_#25134e_0%,_#130b2c_60%,_#090716_100%)]">
                <img
                  src={currentSlide.mediaUrl || DEFAULT_EXTERNAL_COVER_IMAGE}
                  alt="Left External Cover"
                  referrerPolicy="no-referrer"
                  className={`h-full w-1/3 object-cover opacity-85 ${
                    !currentSlide.mediaUrl || currentSlide.mediaUrl === DEFAULT_EXTERNAL_COVER_IMAGE
                      ? 'object-[16%_25%]'
                      : 'object-center'
                  }`}
                />
                <div className="px-3 text-center">
                  <div className="font-orbitron font-black text-sm text-white tracking-widest line-clamp-2">
                    {currentSlide.title || meta.defaultTitle}
                  </div>
                  <div className="text-[10px] text-purple-300 mt-1">Cover Preview</div>
                </div>
                <img
                  src={currentSlide.rightMediaUrl?.trim() || currentSlide.mediaUrl || DEFAULT_EXTERNAL_COVER_IMAGE}
                  alt="Right External Cover"
                  referrerPolicy="no-referrer"
                  className={`h-full w-1/3 object-cover opacity-85 ${
                    !currentSlide.rightMediaUrl?.trim() &&
                    (!currentSlide.mediaUrl || currentSlide.mediaUrl === DEFAULT_EXTERNAL_COVER_IMAGE)
                      ? 'object-[84%_25%]'
                      : 'object-center'
                  }`}
                />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090716]/75 via-transparent to-[#090716]/40" />
            {currentSlide.mediaType === 'video' && !currentSlide.mediaUrl?.trim() && (
              <div className="relative z-10 text-center text-gray-400 text-xs px-4">
                <i className="fa-solid fa-film text-2xl text-cyan-400 mb-2 block"></i>
                <span>Upload MP4/WebM video or paste a direct Video / YouTube URL below</span>
              </div>
            )}
          </div>
        </>
      ) : (
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
              {currentSlide.title || meta.defaultTitle}
            </div>
            {currentSlide.subtitle && (
              <p className="text-[11px] text-slate-300 line-clamp-2">{currentSlide.subtitle}</p>
            )}
          </div>
        </div>
      )}

      {/* Media Inputs: Steam Offline-Style Left/Right Photo & Video Inputs for External, Standard for Steam Online / Product */}
      {target === 'external' ? (
        currentSlide.mediaType === 'photo' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                {currentMediaLayout === 'full' ? 'COVER PHOTO (Full Background)' : 'LEFT / MAIN COVER PHOTO'}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={currentSlide.mediaUrl}
                  onChange={(e) => updateCurrentSlide({ mediaUrl: e.target.value })}
                  placeholder="Paste image URL or upload a photo..."
                  className="flex-1 min-w-0 bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                />
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handlePhotoUpload(e, 'left')}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploading !== null}
                  onClick={() => photoInputRef.current?.click()}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <i
                    className={`fa-solid ${
                      isUploading === 'photo' ? 'fa-spinner fa-spin' : 'fa-upload'
                    }`}
                  ></i>
                  <span>Upload Photo</span>
                </button>
              </div>
            </div>

            {currentMediaLayout === 'side' && (
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  RIGHT-SIDE COVER PHOTO <span className="text-gray-500">(Optional - leaves empty to match Left)</span>
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={currentSlide.rightMediaUrl || ''}
                    onChange={(e) => updateCurrentSlide({ rightMediaUrl: e.target.value })}
                    placeholder="Optional separate right character/photo URL..."
                    className="flex-1 min-w-0 bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
                  />
                  <input
                    ref={rightPhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePhotoUpload(e, 'right')}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploading !== null}
                    onClick={() => rightPhotoInputRef.current?.click()}
                    className="px-4 py-2.5 rounded-xl bg-[#1a243d] hover:bg-purple-800/60 border border-purple-500/40 disabled:opacity-50 text-purple-200 font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <i
                      className={`fa-solid ${
                        isUploading === 'right' ? 'fa-spinner fa-spin' : 'fa-upload'
                      }`}
                    ></i>
                    <span>Upload Right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                COVER VIDEO (Upload MP4/WebM or Paste Video / YouTube Link)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={currentSlide.mediaUrl === getTargetDefaultCover(target) ? '' : currentSlide.mediaUrl}
                  onChange={(e) => updateCurrentSlide({ mediaUrl: e.target.value })}
                  placeholder="https://.../video.mp4 or YouTube URL or upload file..."
                  className="flex-1 min-w-0 bg-[#131b2e] text-xs text-cyan-200 rounded-xl px-3.5 py-2.5 border border-cyan-500/40 outline-none focus:border-cyan-400"
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
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 text-white font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <i
                    className={`fa-solid ${
                      isUploading === 'video' ? 'fa-spinner fa-spin' : 'fa-clapperboard'
                    }`}
                  ></i>
                  <span>{isUploading === 'video' ? 'Uploading...' : 'Upload Video'}</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">
                Supports MP4, WebM, MOV (up to 50MB) or any direct video / YouTube URL. Plays automatically in muted loop with a sound toggle button on the cover.
              </p>
            </div>
          </div>
        )
      ) : (
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
                onChange={(e) => void handlePhotoUpload(e, 'left')}
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
                  value={
                    currentSlide.mediaUrl === getTargetDefaultCover(target)
                      ? ''
                      : currentSlide.mediaUrl
                  }
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
      )}

      {/* Text Overlay & Optional Promo Controls */}
      {isExternal ? (
        <details className="group rounded-xl bg-[#0b1120]/80 border border-purple-900/40">
          <summary className="px-4 py-3 flex items-center justify-between cursor-pointer select-none text-xs font-orbitron font-bold text-purple-200 hover:text-white">
            <span className="flex items-center gap-2">
              <i className="fa-solid fa-sliders text-fuchsia-400"></i>
              <span>Optional: Cover Headline, Description &amp; Multiple Slides</span>
            </span>
            <i className="fa-solid fa-chevron-down text-[10px] text-purple-400 transition-transform group-open:rotate-180"></i>
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-3 border-t border-purple-900/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                  COVER HEADLINE TEXT
                </label>
                <input
                  type="text"
                  value={currentSlide.title}
                  onChange={(e) => updateCurrentSlide({ title: e.target.value })}
                  placeholder="e.g. GAME ថែម EXTERNAL"
                  className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
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
                  placeholder="e.g. ទាក់ទង Admin"
                  className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
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
                className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
              />
            </div>
            {slides.length === 1 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleAddSlide}
                  className="px-3 py-1.5 rounded-lg bg-[#131b2e] hover:bg-purple-900/40 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <i className="fa-solid fa-plus"></i>
                  <span>Add Another Slide</span>
                </button>
              </div>
            )}
          </div>
        </details>
      ) : (
        <>
          <div className="space-y-3 p-4 rounded-xl bg-[#0b1120] border border-slate-800">
            <span className="block text-xs font-orbitron font-bold text-slate-200 uppercase tracking-wider">
              2. Cover Text (Headline, Subtitle &amp; Button)
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
        </>
      )}

      {/* Footer Actions */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t ${
          isExternal ? 'border-purple-900/40' : 'border-slate-800'
        }`}
      >
        <button
          type="button"
          onClick={handleResetDefault}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        >
          <i className="fa-solid fa-rotate-left"></i>
          <span>{isExternal ? 'Reset Default Cover' : 'Reset Default'}</span>
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
            className={`px-5 py-2.5 rounded-xl text-white font-orbitron font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer disabled:opacity-50 ${
              isExternal
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400'
                : 'bg-gradient-to-r from-[#0ea5e9] via-[#0077e6] to-[#ff5a00] hover:opacity-95'
            }`}
          >
            <i className="fa-solid fa-floppy-disk"></i>
            <span>{isExternal ? 'SAVE COVER MEDIA' : meta.saveButton}</span>
          </button>
        </div>
      </div>
    </form>
  );
};

interface SteamOnlineCoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  target?: PromoCoverTarget;
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SteamOnlineCoverModal: React.FC<SteamOnlineCoverModalProps> = ({
  isOpen,
  onClose,
  target = 'steam-online',
  settings,
  onSaveSettings,
  onShowToast,
}) => {
  if (!isOpen) return null;
  const meta = TARGET_META[target];
  const isExternal = target === 'external';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className={`relative w-full max-w-2xl bg-[#0f172a] rounded-2xl shadow-2xl p-5 sm:p-7 my-4 max-h-[92vh] overflow-y-auto border ${
          isExternal ? 'border-purple-500/50' : 'border-sky-500/45'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between pb-4 mb-5 border-b ${
            isExternal ? 'border-purple-900/40' : 'border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                isExternal
                  ? 'bg-gradient-to-br from-purple-600/30 to-cyan-500/30 border-cyan-400/40 text-cyan-300'
                  : 'bg-gradient-to-br from-[#0ea5e9]/30 to-[#ff5a00]/30 border-sky-400/40 text-sky-300'
              }`}
            >
              <i className="fa-solid fa-photo-film text-lg"></i>
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-base text-white">
                {isExternal ? 'CHANGE EXTERNAL COVER PHOTO OR VIDEO' : meta.modalTitle}
              </h3>
              <p className="text-xs text-gray-400">
                {isExternal
                  ? 'Upload a custom background photo, side artwork, or looping cover video'
                  : `Add Photo or Video, custom Headline/Subtitle text, and Promo ribbon style for ${meta.label}`}
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
          target={target}
          settings={settings}
          onSaveSettings={onSaveSettings}
          onShowToast={onShowToast}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
