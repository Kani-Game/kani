import React, { useEffect, useRef, useState } from 'react';
import { SiteSettings } from '../types/game';
import { compressImageFile } from '../utils/imageUtils';

export const DEFAULT_COVER_IMAGE = '/assets/aistudio/image_81ca6681.png';

export function extractYouTubeVideoId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
  ];
  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match?.[1]) return match[1];
  }
  return null;
}

interface CoverMediaFormProps {
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onClose?: () => void;
}

export const CoverMediaForm: React.FC<CoverMediaFormProps> = ({
  settings,
  onSaveSettings,
  onShowToast,
  onClose,
}) => {
  const [mediaType, setMediaType] = useState<'photo' | 'video'>(
    settings.heroMediaType === 'video' ? 'video' : 'photo'
  );
  const [mediaLayout, setMediaLayout] = useState<'side' | 'full'>(
    settings.heroMediaLayout === 'full' ? 'full' : 'side'
  );
  const [coverImage, setCoverImage] = useState<string>(
    settings.heroCoverImage || DEFAULT_COVER_IMAGE
  );
  const [coverRightImage, setCoverRightImage] = useState<string>(
    settings.heroCoverRightImage || ''
  );
  const [coverVideo, setCoverVideo] = useState<string>(settings.heroCoverVideo || '');
  const [isUploading, setIsUploading] = useState<'left' | 'right' | 'video' | null>(null);

  const leftPhotoInputRef = useRef<HTMLInputElement>(null);
  const rightPhotoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMediaType(settings.heroMediaType === 'video' ? 'video' : 'photo');
    setMediaLayout(settings.heroMediaLayout === 'full' ? 'full' : 'side');
    setCoverImage(settings.heroCoverImage || DEFAULT_COVER_IMAGE);
    setCoverRightImage(settings.heroCoverRightImage || '');
    setCoverVideo(settings.heroCoverVideo || '');
  }, [settings]);

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'left' | 'right'
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

    setIsUploading(target);
    try {
      const compressed = await compressImageFile(file, 1400, 900, 0.85);
      if (target === 'left') {
        setCoverImage(compressed);
      } else {
        setCoverRightImage(compressed);
      }
      setMediaType('photo');
      onShowToast?.('បានបញ្ចូលរូបភាព Cover រួចរាល់! សូមចុច Save Cover Media ដើម្បីរក្សាទុក');
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
      onShowToast?.('ទំហំវីដេអូធំពេក (Max 50MB) ឬសូមដាក់ Link វីដេអូផ្ទាល់', 'error');
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

      setCoverVideo(payload.url);
      setMediaType('video');
      setMediaLayout('full');
      onShowToast?.('បានបញ្ចូលវីដេអូ Cover រួចរាល់! សូមចុច Save Cover Media ដើម្បីរក្សាទុក');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to upload video';
      onShowToast?.(`Upload វីដេអូមិនបានសម្រេច: ${msg}`, 'error');
    } finally {
      setIsUploading(null);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (mediaType === 'video' && !coverVideo.trim()) {
      onShowToast?.('សូម Upload វីដេអូ ឬបញ្ចូល Video URL ជាមុនសិន', 'error');
      return;
    }

    const updated: SiteSettings = {
      ...settings,
      heroMediaType: mediaType,
      heroMediaLayout: mediaLayout,
      heroCoverImage: coverImage.trim() || DEFAULT_COVER_IMAGE,
      heroCoverRightImage: coverRightImage.trim(),
      heroCoverVideo: coverVideo.trim(),
    };

    onSaveSettings(updated);
    onShowToast?.('🎉 បានរក្សាទុករូបភាព/វីដេអូ Cover រួចរាល់!');
    onClose?.();
  };

  const handleResetDefault = () => {
    setMediaType('photo');
    setMediaLayout('side');
    setCoverImage(DEFAULT_COVER_IMAGE);
    setCoverRightImage('');
    setCoverVideo('');

    onSaveSettings({
      ...settings,
      heroMediaType: 'photo',
      heroMediaLayout: 'side',
      heroCoverImage: DEFAULT_COVER_IMAGE,
      heroCoverRightImage: '',
      heroCoverVideo: '',
    });
    onShowToast?.('បានត្រឡប់ទៅ Cover ដើមវិញរួចរាល់!');
  };

  const activeYoutubeId = mediaType === 'video' ? extractYouTubeVideoId(coverVideo) : null;

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {/* Mode & Layout Switchers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
            Cover Media Type
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMediaType('photo')}
              className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                mediaType === 'photo'
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
                setMediaType('video');
                if (!coverVideo) setMediaLayout('full');
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                mediaType === 'video'
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
              onClick={() => setMediaLayout('full')}
              className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                mediaLayout === 'full'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                  : 'bg-[#131b2e] text-gray-300 border-purple-900/40 hover:text-white'
              }`}
            >
              <i className="fa-solid fa-panorama"></i>
              <span>Full Cover</span>
            </button>
            <button
              type="button"
              onClick={() => setMediaLayout('side')}
              className={`py-2.5 px-3 rounded-xl text-xs font-orbitron font-bold border transition flex items-center justify-center gap-2 cursor-pointer ${
                mediaLayout === 'side'
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

      {/* Live Preview */}
      <div className="relative h-40 sm:h-48 rounded-xl overflow-hidden bg-[#0c0820] border border-purple-500/40 flex items-center justify-center">
        {mediaType === 'video' && coverVideo.trim() ? (
          activeYoutubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${activeYoutubeId}?autoplay=1&mute=1&loop=1&playlist=${activeYoutubeId}&controls=0&rel=0`}
              title="Cover Video Preview"
              className="w-full h-full pointer-events-none scale-125"
              allow="autoplay; encrypted-media"
            />
          ) : (
            <video
              key={coverVideo}
              src={coverVideo}
              autoPlay
              loop
              muted
              playsInline
              className={`h-full object-cover ${mediaLayout === 'full' ? 'w-full' : 'w-1/2 mx-auto'}`}
            />
          )
        ) : mediaLayout === 'full' ? (
          <img
            src={coverImage || DEFAULT_COVER_IMAGE}
            alt="Cover Preview"
            className="w-full h-full object-cover opacity-80"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-between bg-[radial-gradient(ellipse_at_center,_#25134e_0%,_#130b2c_60%,_#090716_100%)]">
            <img
              src={coverImage || DEFAULT_COVER_IMAGE}
              alt="Left Cover"
              className="h-full w-1/3 object-cover opacity-85"
            />
            <div className="px-3 text-center">
              <div className="font-orbitron font-black text-sm text-white tracking-widest">
                {settings.heroMainTitle || 'KANI GAME'}
              </div>
              <div className="text-[10px] text-purple-300 mt-1">Cover Preview</div>
            </div>
            <img
              src={coverRightImage || coverImage || DEFAULT_COVER_IMAGE}
              alt="Right Cover"
              className="h-full w-1/3 object-cover opacity-85"
            />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090716]/75 via-transparent to-[#090716]/40" />
        {mediaType === 'video' && !coverVideo.trim() && (
          <div className="relative z-10 text-center text-gray-400 text-xs px-4">
            <i className="fa-solid fa-film text-2xl text-cyan-400 mb-2 block"></i>
            <span>Upload MP4/WebM video or paste a direct Video / YouTube URL below</span>
          </div>
        )}
      </div>

      {/* Photo Inputs */}
      {mediaType === 'photo' ? (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              {mediaLayout === 'full' ? 'COVER PHOTO (Full Background)' : 'LEFT / MAIN COVER PHOTO'}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="Paste image URL or upload a photo..."
                className="flex-1 min-w-0 bg-[#131b2e] text-xs text-gray-200 rounded-xl px-3.5 py-2.5 border border-purple-900/50 outline-none focus:border-purple-500"
              />
              <input
                ref={leftPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handlePhotoUpload(e, 'left')}
                className="hidden"
              />
              <button
                type="button"
                disabled={isUploading !== null}
                onClick={() => leftPhotoInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-orbitron font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0 whitespace-nowrap"
              >
                <i
                  className={`fa-solid ${
                    isUploading === 'left' ? 'fa-spinner fa-spin' : 'fa-upload'
                  }`}
                ></i>
                <span>Upload Photo</span>
              </button>
            </div>
          </div>

          {mediaLayout === 'side' && (
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                RIGHT-SIDE COVER PHOTO <span className="text-gray-500">(Optional - leaves empty to match Left)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={coverRightImage}
                  onChange={(e) => setCoverRightImage(e.target.value)}
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
        /* Video Inputs */
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              COVER VIDEO (Upload MP4/WebM or Paste Video / YouTube Link)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={coverVideo}
                onChange={(e) => setCoverVideo(e.target.value)}
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
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-900/40">
        <button
          type="button"
          onClick={handleResetDefault}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        >
          <i className="fa-solid fa-rotate-left"></i>
          <span>Reset Default Cover</span>
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
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 disabled:opacity-50 text-white font-orbitron font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer"
          >
            <i className="fa-solid fa-floppy-disk"></i>
            <span>SAVE COVER MEDIA</span>
          </button>
        </div>
      </div>
    </form>
  );
};

interface CoverMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SiteSettings;
  onSaveSettings: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CoverMediaModal: React.FC<CoverMediaModalProps> = ({
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
        className="relative w-full max-w-2xl bg-[#0f172a] border border-purple-500/50 rounded-2xl shadow-2xl p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-purple-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-cyan-500/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <i className="fa-solid fa-photo-film text-lg"></i>
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-base text-white">
                CHANGE COVER PHOTO OR VIDEO
              </h3>
              <p className="text-xs text-gray-400">
                Upload a custom background photo, side artwork, or looping cover video
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

        <CoverMediaForm
          settings={settings}
          onSaveSettings={onSaveSettings}
          onShowToast={onShowToast}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
