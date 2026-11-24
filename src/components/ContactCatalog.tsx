import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { SiteSettings } from '../types/game';

interface ContactCatalogProps {
  settings: SiteSettings;
  canEdit?: boolean;
  onSaveSettings?: (updated: SiteSettings) => void;
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type ChannelKind = 'telegram-admin' | 'telegram-group' | 'facebook' | 'youtube' | 'google-map';

export function resolveChannelUrl(rawValue: string | undefined, kind: ChannelKind): string | null {
  const raw = (rawValue || '').trim();
  if (!raw) return null;

  // Guard against unsafe URI schemes
  if (/^(javascript|data|vbscript):/i.test(raw)) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (kind === 'telegram-admin' || kind === 'telegram-group') {
    if (/^(t\.me|telegram\.me)\//i.test(raw)) {
      return `https://${raw}`;
    }
    const cleanHandle = raw.replace(/^@+/, '').trim();
    return cleanHandle ? `https://t.me/${cleanHandle}` : null;
  }

  if (kind === 'facebook') {
    if (/^(www\.)?(facebook\.com|fb\.com|fb\.watch|m\.facebook\.com)\//i.test(raw)) {
      return `https://${raw}`;
    }
    const clean = raw.replace(/^@+/, '').replace(/^\/+/, '');
    return clean ? `https://www.facebook.com/${clean}` : null;
  }

  if (kind === 'youtube') {
    if (/^(www\.)?(youtube\.com|youtu\.be)\//i.test(raw)) {
      return `https://${raw}`;
    }
    const clean = raw.replace(/^\/+/, '');
    if (clean.startsWith('@')) {
      return `https://www.youtube.com/${clean}`;
    }
    return clean ? `https://www.youtube.com/@${clean}` : null;
  }

  if (kind === 'google-map') {
    if (/^(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(raw)) {
      return `https://${raw}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
  }

  return null;
}

const TelegramVectorQr: React.FC<{ url: string }> = ({ url }) => {
  const { totalSize, pathData, center, badgeRadius } = useMemo(() => {
    const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
    const size = qr.modules.size;
    const margin = 1;
    const total = size + margin * 2;
    const c = total / 2;
    const clearR = size * 0.14;
    const cmds: string[] = [];

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (!qr.modules.get(row, col)) continue;
        const x = col + margin;
        const y = row + margin;
        const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        if (dist < clearR) continue;
        cmds.push(`M${x},${y}h1v1h-1z`);
      }
    }

    return {
      totalSize: total,
      pathData: cmds.join(''),
      center: c,
      badgeRadius: clearR * 0.82,
    };
  }, [url]);

  const iconSize = badgeRadius * 1.25;

  return (
    <svg
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      className="w-full h-auto block"
      role="img"
      aria-label={`QR code for ${url}`}
    >
      <rect width={totalSize} height={totalSize} fill="#ffffff" />
      <path d={pathData} fill="#000000" />
      <circle cx={center} cy={center} r={badgeRadius} fill="#000000" />
      <svg
        x={center - iconSize / 2}
        y={center - iconSize / 2}
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
      >
        <path
          fill="#ffffff"
          d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z"
        />
      </svg>
    </svg>
  );
};

export const ContactCatalog: React.FC<ContactCatalogProps> = ({
  settings,
  canEdit = false,
  onSaveSettings,
  onShowToast,
}) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [draft, setDraft] = useState({
    telegramAdminHandle: settings.telegramAdminHandle || '@kanigame168',
    telegramGroupUrl: settings.telegramGroupUrl || '',
    facebookUrl: settings.facebookUrl || '',
    youtubeUrl: settings.youtubeUrl || '',
    googleMapUrl: settings.googleMapUrl || '',
    storeAddress: settings.storeAddress || '',
    storeHours: settings.storeHours || '',
  });

  useEffect(() => {
    setDraft({
      telegramAdminHandle: settings.telegramAdminHandle || '@kanigame168',
      telegramGroupUrl: settings.telegramGroupUrl || '',
      facebookUrl: settings.facebookUrl || '',
      youtubeUrl: settings.youtubeUrl || '',
      googleMapUrl: settings.googleMapUrl || '',
      storeAddress: settings.storeAddress || '',
      storeHours: settings.storeHours || '',
    });
  }, [settings]);

  const cleanAdminHandle = (settings.telegramAdminHandle || '@kanigame168').replace(/^@+/, '').trim();
  const telegramAdminUrl = resolveChannelUrl(settings.telegramAdminHandle || 'kanigame168', 'telegram-admin');
  const telegramGroupUrl = resolveChannelUrl(settings.telegramGroupUrl, 'telegram-group');
  const facebookUrl = resolveChannelUrl(settings.facebookUrl, 'facebook');
  const youtubeUrl = resolveChannelUrl(settings.youtubeUrl, 'youtube');
  const googleMapUrl =
    resolveChannelUrl(settings.googleMapUrl, 'google-map') ||
    (settings.storeAddress?.trim()
      ? resolveChannelUrl(settings.storeAddress, 'google-map')
      : null);

  const handleUnconfiguredClick = (channelName: string) => {
    if (canEdit) {
      setIsEditOpen(true);
      onShowToast?.(`សូមបញ្ចូល Link សម្រាប់ ${channelName}`, 'info');
    } else {
      onShowToast?.(
        `Link ${channelName} កំពុងរៀបចំ — សូមទាក់ទង Admin @${cleanAdminHandle}`,
        'info'
      );
    }
  };

  const handleSaveLinks = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveSettings) return;
    const updated: SiteSettings = {
      ...settings,
      telegramAdminHandle: draft.telegramAdminHandle.trim() || '@kanigame168',
      telegramGroupUrl: draft.telegramGroupUrl.trim(),
      facebookUrl: draft.facebookUrl.trim(),
      youtubeUrl: draft.youtubeUrl.trim(),
      googleMapUrl: draft.googleMapUrl.trim(),
      storeAddress: draft.storeAddress.trim(),
      storeHours: draft.storeHours.trim(),
    };
    onSaveSettings(updated);
    setIsEditOpen(false);
    onShowToast?.('បានរក្សាទុក Link ទំនាក់ទំនង និងផែនទីហាងរួចរាល់!', 'success');
  };

  const channels: {
    id: ChannelKind;
    label: string;
    iconClass: string;
    url: string | null;
    cardBorder: string;
    logoClass: string;
    buttonClass: string;
  }[] = [
    {
      id: 'telegram-admin',
      label: 'Telegram Admin',
      iconClass: 'fa-brands fa-telegram',
      url: telegramAdminUrl,
      cardBorder: 'border-sky-500/35 hover:border-sky-400/80',
      logoClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
      buttonClass:
        'bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:from-[#38bdf8] hover:to-[#0ea5e9] text-white',
    },
    {
      id: 'telegram-group',
      label: 'Telegram Group',
      iconClass: 'fa-brands fa-telegram',
      url: telegramGroupUrl,
      cardBorder: 'border-indigo-500/35 hover:border-indigo-400/80',
      logoClass: 'bg-sky-500/15 text-sky-300 border-sky-400/30',
      buttonClass:
        'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      iconClass: 'fa-brands fa-facebook-f',
      url: facebookUrl,
      cardBorder: 'border-blue-500/35 hover:border-blue-400/80',
      logoClass: 'bg-blue-600/20 text-blue-300 border-blue-400/35',
      buttonClass:
        'bg-gradient-to-r from-[#1877F2] to-[#0b5ed7] hover:from-[#3b82f6] hover:to-[#1877F2] text-white',
    },
    {
      id: 'youtube',
      label: 'YouTube',
      iconClass: 'fa-brands fa-youtube',
      url: youtubeUrl,
      cardBorder: 'border-rose-500/35 hover:border-rose-400/80',
      logoClass: 'bg-rose-500/15 text-rose-400 border-rose-400/30',
      buttonClass:
        'bg-gradient-to-r from-[#ef4444] to-[#dc2626] hover:from-[#f87171] hover:to-[#ef4444] text-white',
    },
    {
      id: 'google-map',
      label: 'Google Map',
      iconClass: 'fa-solid fa-location-dot',
      url: googleMapUrl,
      cardBorder: 'border-emerald-500/35 hover:border-emerald-400/80',
      logoClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
      buttonClass:
        'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-extrabold',
    },
  ];

  return (
    <section aria-label="Contact Channels & Map" className="max-w-md mx-auto py-2 sm:py-4 space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-[#131b2e] hover:bg-purple-900/60 text-purple-200 border border-purple-500/45 font-orbitron font-bold text-xs transition cursor-pointer whitespace-nowrap"
          >
            <i className="fa-solid fa-pen-to-square text-purple-300"></i>
            <span>Edit Links</span>
          </button>
        </div>
      )}

      {/* Compact 1-by-1 Logo + Clickable Button List */}
      <div className="flex flex-col gap-2.5 sm:gap-3">
        {channels.map((ch) => (
          <div
            key={ch.id}
            className={`rounded-2xl bg-[#0c111f] border p-2.5 sm:p-3 flex flex-col gap-2.5 transition-all duration-200 hover:-translate-y-0.5 shadow-[0_8px_20px_rgba(2,6,16,0.7)] ${ch.cardBorder}`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center ${ch.logoClass}`}
              >
                <i className={`${ch.iconClass} text-xl`}></i>
              </div>

              {ch.url ? (
                <a
                  href={ch.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-1 min-h-[44px] px-4 py-2 rounded-xl font-orbitron font-bold text-xs sm:text-sm flex items-center justify-between gap-2 transition whitespace-nowrap shadow-md ${ch.buttonClass}`}
                >
                  <span>{ch.label}</span>
                  <i className="fa-solid fa-arrow-up-right-from-square text-xs opacity-85"></i>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => handleUnconfiguredClick(ch.label)}
                  className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 font-orbitron font-bold text-xs sm:text-sm flex items-center justify-between gap-2 transition cursor-pointer whitespace-nowrap"
                >
                  <span>{canEdit ? `Set ${ch.label}` : ch.label}</span>
                  <i className="fa-solid fa-chevron-right text-xs opacity-70"></i>
                </button>
              )}
            </div>

            {ch.id === 'telegram-admin' && (
              <div className="w-full pt-0.5">
                {ch.url ? (
                  <a
                    href={ch.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Telegram Admin QR Code"
                    className="block w-full rounded-xl overflow-hidden bg-white p-3 sm:p-4 border border-sky-500/25 hover:border-sky-400/60 transition"
                  >
                    <TelegramVectorQr url={ch.url} />
                  </a>
                ) : (
                  <div className="w-full rounded-xl overflow-hidden bg-white p-3 sm:p-4 border border-sky-500/25">
                    <TelegramVectorQr url="https://t.me/kanigame168" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inline Admin Modal for Configuring All 5 Links */}
      {isEditOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          onClick={() => setIsEditOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-[#0f172a] border border-cyan-500/45 rounded-2xl shadow-2xl p-5 sm:p-7 my-4 max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/35 flex items-center justify-center text-cyan-300">
                  <i className="fa-solid fa-share-nodes text-lg"></i>
                </div>
                <div>
                  <h3 className="font-orbitron font-bold text-base text-white">
                    CONTACT, SOCIAL &amp; MAP LINKS
                  </h3>
                  <p className="text-xs text-gray-400">
                    Configure Telegram Admin, Telegram Group, Facebook, YouTube &amp; Google Map URLs
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="Close modal"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            <form onSubmit={handleSaveLinks} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  1. TELEGRAM ADMIN HANDLE / LINK
                </label>
                <input
                  type="text"
                  value={draft.telegramAdminHandle}
                  onChange={(e) =>
                    setDraft({ ...draft, telegramAdminHandle: e.target.value })
                  }
                  placeholder="@kanigame168"
                  className="w-full bg-[#131b2e] text-xs font-mono text-cyan-300 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  2. TELEGRAM GROUP LINK
                </label>
                <input
                  type="text"
                  value={draft.telegramGroupUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, telegramGroupUrl: e.target.value })
                  }
                  placeholder="https://t.me/yourgroup or @yourgroup"
                  className="w-full bg-[#131b2e] text-xs font-mono text-indigo-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-indigo-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  3. FACEBOOK PAGE LINK
                </label>
                <input
                  type="text"
                  value={draft.facebookUrl}
                  onChange={(e) => setDraft({ ...draft, facebookUrl: e.target.value })}
                  placeholder="https://www.facebook.com/yourpage"
                  className="w-full bg-[#131b2e] text-xs font-mono text-blue-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  4. YOUTUBE CHANNEL LINK
                </label>
                <input
                  type="text"
                  value={draft.youtubeUrl}
                  onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
                  placeholder="https://www.youtube.com/@yourchannel"
                  className="w-full bg-[#131b2e] text-xs font-mono text-rose-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-rose-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  5. GOOGLE MAP LINK
                </label>
                <input
                  type="text"
                  value={draft.googleMapUrl}
                  onChange={(e) => setDraft({ ...draft, googleMapUrl: e.target.value })}
                  placeholder="https://maps.app.goo.gl/... or Google Maps URL"
                  className="w-full bg-[#131b2e] text-xs font-mono text-emerald-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    STORE ADDRESS (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={draft.storeAddress}
                    onChange={(e) => setDraft({ ...draft, storeAddress: e.target.value })}
                    placeholder="e.g. Phnom Penh, Cambodia"
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    OPEN HOURS (OPTIONAL)
                  </label>
                  <input
                    type="text"
                    value={draft.storeHours}
                    onChange={(e) => setDraft({ ...draft, storeHours: e.target.value })}
                    placeholder="e.g. 9:00 AM - 9:00 PM"
                    className="w-full bg-[#131b2e] text-xs text-gray-200 rounded-xl px-4 py-2.5 border border-slate-700 outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-orbitron font-bold text-xs shadow-lg flex items-center gap-2 transition cursor-pointer"
                >
                  <i className="fa-solid fa-floppy-disk"></i>
                  <span>SAVE LINKS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
