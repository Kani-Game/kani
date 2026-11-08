import React, { useState, useEffect } from 'react';
import { POSCartItem, SiteSettings, POSSaleRecord } from '../types/game';
import { generateKhqrCardBlob } from '../utils/khqrImageGenerator';

interface POSPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: POSCartItem[];
  subtotalUsd: number;
  discountPercent: number;
  discountAmountUsd: number;
  taxPercent: number;
  taxAmountUsd: number;
  totalUsd: number;
  totalKhr: number;
  exchangeRate: number;
  settings: SiteSettings;
  cashierName?: string;
  customerName?: string;
  customerPhone?: string;
  onConfirmSuccess: (saleRecord: POSSaleRecord) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const POSPaymentModal: React.FC<POSPaymentModalProps> = ({
  isOpen,
  onClose,
  cart,
  subtotalUsd,
  discountPercent,
  discountAmountUsd,
  taxPercent,
  taxAmountUsd,
  totalUsd,
  totalKhr,
  exchangeRate,
  settings,
  cashierName = 'Kani Cashier',
  customerName = '',
  customerPhone = '',
  onConfirmSuccess,
  onShowToast,
}) => {
  // Tabs: 'khqr' | 'cash'
  const [activeTab, setActiveTab] = useState<'khqr' | 'cash'>('khqr');
  // Currency display mode: 'USD' | 'KHR'
  const [currencyMode, setCurrencyMode] = useState<'USD' | 'KHR'>('USD');
  // Optional bank ref
  const [bankRef, setBankRef] = useState('');
  // Cash tendered
  const [cashTenderedUsd, setCashTenderedUsd] = useState<string>('');
  const [cashTenderedKhr, setCashTenderedKhr] = useState<string>('');
  // Dynamic reference code (e.g. KC-4292)
  const [refCode, setRefCode] = useState('KC-4292');
  // Live expiration timer (seconds)
  const [timerSeconds, setTimerSeconds] = useState(115); // 1:55

  // QR Sharing flow states:
  // Step 1: Share Photo QR to Telegram
  // Step 2: Once shared & customer scans, Confirm KHQR
  const [isQrShared, setIsQrShared] = useState<boolean>(false);
  const [isGeneratingPhoto, setIsGeneratingPhoto] = useState<boolean>(false);
  const [copiedPhoto, setCopiedPhoto] = useState<boolean>(false);

  // Generate reference and reset timer when modal opens
  useEffect(() => {
    if (isOpen) {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      setRefCode(`KC-${randomDigits}`);
      setTimerSeconds(115);
      setBankRef('');
      setCashTenderedUsd('');
      setCashTenderedKhr('');
      setIsQrShared(false);
      setCopiedPhoto(false);
      setIsGeneratingPhoto(false);
    }
  }, [isOpen]);

  // Countdown timer for KHQR
  useEffect(() => {
    if (!isOpen || activeTab !== 'khqr') return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => (prev > 0 ? prev - 1 : 120));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Format timer as M:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Cash calculations
  const tenderedUsdNum = parseFloat(cashTenderedUsd) || 0;
  const tenderedKhrNum = parseFloat(cashTenderedKhr) || 0;
  const totalTenderedUsd = tenderedUsdNum + tenderedKhrNum / (exchangeRate || 4100);

  const changeDueUsd = Math.max(0, totalTenderedUsd - totalUsd);
  const changeDueKhr = Math.round(changeDueUsd * (exchangeRate || 4100));

  // Build the completed sale record object
  const createSaleRecord = (method: 'bakong_khqr' | 'cash'): POSSaleRecord => {
    const receiptNo = `INV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${refCode.replace('KC-', '')}`;
    return {
      id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      receiptNo,
      date: new Date().toISOString(),
      items: cart.map((item) => ({
        id: item.game.id,
        name: item.game.name,
        tag: item.game.tag,
        genre: item.game.genre,
        unitPrice: item.unitPrice,
        costPrice: item.game.costPrice !== undefined ? item.game.costPrice : 0,
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
      paymentMethod: method,
      bankRef: bankRef.trim() || undefined,
      cashTenderedUsd: tenderedUsdNum > 0 ? tenderedUsdNum : totalUsd,
      cashTenderedKhr: tenderedKhrNum > 0 ? tenderedKhrNum : 0,
      changeReturnedUsd: changeDueUsd,
      changeReturnedKhr: changeDueKhr,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      cashierName,
      status: 'completed',
    };
  };

  // Handle Confirm Payment (Invoked when cash is received or after customer scans KHQR)
  const handleConfirm = () => {
    if (activeTab === 'cash' && totalTenderedUsd > 0 && totalTenderedUsd < totalUsd - 0.001) {
      onShowToast(`ចំនួនទឹកប្រាក់មិនគ្រប់គ្រាន់ទេ! ខ្វះ $${(totalUsd - totalTenderedUsd).toFixed(2)}`, 'error');
      return;
    }

    const sale = createSaleRecord(activeTab === 'khqr' ? 'bakong_khqr' : 'cash');
    onConfirmSuccess(sale);
    onClose();
  };

  // Fallback / dynamic KHQR image url or uploaded QR
  const khqrData = `https://bakong.nbc.org.kh/pay?ref=${refCode}&amt=${totalUsd}&cur=USD`;
  const defaultQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=450x450&data=${encodeURIComponent(
    khqrData
  )}&margin=1`;

  // Merchant display title
  const merchantTitle = settings.portalTitle ? settings.portalTitle.toUpperCase() : 'KANI CAFE';
  const handleClean = settings.telegramAdminHandle
    ? settings.telegramAdminHandle.replace('@', '').toLowerCase()
    : 'kanicafe';
  const merchantAccount = `${handleClean}@aclb`;

  // Helper to generate the authentic KHQR Photo Card Blob
  const getKhqrCardBlob = async () => {
    return await generateKhqrCardBlob({
      merchantTitle,
      merchantAccount,
      totalUsd,
      totalKhr,
      refCode,
      qrImageUrl: settings.qrCodeImage || defaultQrUrl,
      itemCount: cart.reduce((acc, it) => acc + it.quantity, 0),
      currencyMode,
    });
  };

  // Step 1: Handle Share Photo QR to Telegram (Customer Scans Photo)
  const handleSharePhotoToTelegram = async () => {
    setIsGeneratingPhoto(true);
    try {
      // 1. Generate authentic KHQR Photo Card
      const cardResult = await getKhqrCardBlob();

      // 2. Write PNG Photo directly to clipboard (for instant Ctrl+V pasting in Telegram)
      try {
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': cardResult.blob }),
          ]);
          setCopiedPhoto(true);
          setTimeout(() => setCopiedPhoto(false), 3500);
        }
      } catch (clipErr) {
        console.warn('Clipboard write image not available in current context:', clipErr);
      }

      // 3. Check for native file sharing (supported on mobile / modern desktop)
      let sharedViaNativeFile = false;
      const imageFile = new File([cardResult.blob], `Bakong_KHQR_${refCode}.png`, {
        type: 'image/png',
      });

      if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
        try {
          await navigator.share({
            files: [imageFile],
            title: `${merchantTitle} - Bakong KHQR Payment`,
            text: `Scan KHQR to pay $${totalUsd.toFixed(2)} (${totalKhr.toLocaleString()} ៛) • Ref: ${refCode}`,
          });
          sharedViaNativeFile = true;
        } catch (shareErr: any) {
          if (shareErr.name !== 'AbortError') {
            console.warn('Native share encountered error:', shareErr);
          }
        }
      }

      // 4. Open Telegram with Photo link & scan instructions
      if (!sharedViaNativeFile) {
        const publicPhotoUrl =
          settings.qrCodeImage && settings.qrCodeImage.startsWith('http')
            ? settings.qrCodeImage
            : defaultQrUrl;

        const caption = `📸 *BAKONG KHQR PAYMENT*\n🏪 *${merchantTitle}*\n💰 *TOTAL DUE: $${totalUsd.toFixed(
          2
        )} (${totalKhr.toLocaleString()} ៛)*\n🔖 Ref: *${refCode}*\n\n👉 *Please scan this QR photo to complete payment!*`;

        const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
          publicPhotoUrl
        )}&text=${encodeURIComponent(caption)}`;
        window.open(telegramUrl, '_blank');
      }

      // Transition to Step 2: Awaiting customer scan and confirm
      setIsQrShared(true);
      onShowToast(
        '📸 បានផ្ញើរូបភាព QR Code ទៅ Telegram រួចរាល់! សូមរង់ចាំអតិថិជនស្កេនរួចចុច Confirm',
        'success'
      );
    } catch (err) {
      console.error('Failed to generate or share KHQR photo:', err);
      // Fallback: Open Telegram with QR link
      const caption = `📸 *BAKONG KHQR PAYMENT*\n💰 *TOTAL DUE: $${totalUsd.toFixed(
        2
      )}*\n🔖 Ref: *${refCode}*`;
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(defaultQrUrl)}&text=${encodeURIComponent(
          caption
        )}`,
        '_blank'
      );
      setIsQrShared(true);
      onShowToast('បានបើក Telegram ដើម្បីផ្ញើរូបភាព QR Code!', 'info');
    } finally {
      setIsGeneratingPhoto(false);
    }
  };

  // Helper: Copy Photo QR to clipboard
  const handleCopyPhotoQr = async () => {
    try {
      const cardResult = await getKhqrCardBlob();
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': cardResult.blob }),
        ]);
        setCopiedPhoto(true);
        setTimeout(() => setCopiedPhoto(false), 3000);
        onShowToast('📋 រូបភាព QR Code ត្រូវបានចម្លង (Copied)! អ្នកអាចចុច Paste (Ctrl+V) ក្នុង Telegram ភ្លាមៗ!', 'success');
      } else {
        onShowToast('Browser របស់អ្នកមិនគាំទ្រ clipboard image ដោយផ្ទាល់ទេ សូមប្រើ Download QR', 'info');
      }
    } catch (e) {
      console.warn('Copy photo failed:', e);
      onShowToast('មិនអាចចម្លងរូបភាពបានទេ សូមទាញយកជា file', 'error');
    }
  };

  // Helper: Download Photo QR image
  const handleDownloadPhotoQr = async () => {
    try {
      const cardResult = await getKhqrCardBlob();
      const a = document.createElement('a');
      a.href = cardResult.dataUrl;
      a.download = `KHQR_Payment_${refCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onShowToast('💾 បានទាញយករូបភាព QR Code ជោគជ័យ!', 'success');
    } catch (e) {
      console.error('Download QR failed:', e);
      onShowToast('ទាញយករូបភាពមិនជោគជ័យ', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[420px] bg-[#111318] border border-gray-800 rounded-3xl p-4 sm:p-5 shadow-2xl text-white my-auto flex flex-col max-h-[96vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header: PAYMENT • KC-4292 and Close ✕ */}
        <div className="flex items-center justify-between pb-2 border-b border-gray-800/60">
          <div className="flex items-center gap-1.5 font-mono font-bold text-xs tracking-wider text-gray-300 uppercase">
            <span className="text-gray-400">PAYMENT</span>
            <span className="text-gray-500">•</span>
            <span className="text-white">{refCode}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
            title="Close"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Tab Switcher: Bakong KHQR / Cash */}
        <div className="bg-[#1a1d24] p-1.5 rounded-2xl grid grid-cols-2 gap-1.5 mt-3.5">
          <button
            type="button"
            onClick={() => setActiveTab('khqr')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'khqr'
                ? 'bg-[#E11D48] text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <i className="fa-solid fa-qrcode text-sm"></i>
            <span>Bakong KHQR</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cash')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'cash'
                ? 'bg-[#E11D48] text-white shadow-md'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <i className="fa-solid fa-dollar-sign text-sm"></i>
            <span>Cash</span>
          </button>
        </div>

        {/* Show Amount in: USD ($) / KHR (៛) */}
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-400 font-medium">
          <span>Show Amount in:</span>
          <div className="inline-flex bg-[#1a1d24] p-0.5 rounded-full border border-gray-800">
            <button
              type="button"
              onClick={() => setCurrencyMode('USD')}
              className={`px-3 py-0.5 rounded-full text-xs font-bold transition cursor-pointer ${
                currencyMode === 'USD'
                  ? 'bg-[#F59E0B] text-black shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              USD ($)
            </button>
            <button
              type="button"
              onClick={() => setCurrencyMode('KHR')}
              className={`px-3 py-0.5 rounded-full text-xs font-bold transition cursor-pointer ${
                currencyMode === 'KHR'
                  ? 'bg-[#F59E0B] text-black shadow-sm'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              KHR (៛)
            </button>
          </div>
        </div>

        {/* TAB 1: BAKONG KHQR */}
        {activeTab === 'khqr' && (
          <div className="mt-3.5 space-y-3 animate-in fade-in duration-150">
            {/* The Authentic KHQR Card */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200 text-gray-900">
              {/* Red Header Bar */}
              <div className="bg-[#D91B24] text-white px-4 py-2 flex items-center justify-between font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center text-[#D91B24] font-black text-[9px]">
                    KH
                  </div>
                  <span className="font-extrabold text-sm tracking-wider font-sans">KHQR</span>
                </div>
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase font-sans">
                  BAKONG CAMBODIA
                </span>
              </div>

              {/* Card Inner Body */}
              <div className="p-4 sm:p-5 flex flex-col items-center text-center bg-white">
                {/* Merchant Title */}
                <h3 className="font-extrabold text-base sm:text-lg text-[#0F172A] tracking-wider uppercase font-sans">
                  {merchantTitle}
                </h3>
                <p className="text-[11px] font-medium text-gray-500 mt-0.5 tracking-wide">
                  PHNOM PENH • {merchantAccount}
                </p>

                {/* Amount display */}
                <div className="my-2.5 flex items-baseline justify-center gap-1.5">
                  {currencyMode === 'USD' ? (
                    <>
                      <span className="text-2xl sm:text-3xl font-extrabold text-[#D91B24] font-sans">
                        ${totalUsd.toFixed(2)}
                      </span>
                      <span className="text-xs font-semibold text-gray-500 font-mono">
                        ({totalKhr.toLocaleString()} ៛)
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl sm:text-3xl font-extrabold text-[#D91B24] font-sans">
                        {totalKhr.toLocaleString()} ៛
                      </span>
                      <span className="text-xs font-semibold text-gray-500 font-mono">
                        (${totalUsd.toFixed(2)})
                      </span>
                    </>
                  )}
                </div>

                {/* QR Code Container with Central Bakong Emblem */}
                <div className="w-52 h-52 sm:w-56 sm:h-56 rounded-2xl p-2.5 border border-gray-100 flex items-center justify-center relative bg-white shadow-sm overflow-hidden">
                  <img
                    src={settings.qrCodeImage || defaultQrUrl}
                    alt="Bakong KHQR"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/assets/aistudio/image_db99fb1f.png';
                    }}
                    className="w-full h-full object-contain"
                  />

                  {/* Central Bakong Red Flower Emblem */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-9 h-9 rounded-full bg-white p-0.5 shadow-md flex items-center justify-center">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 100 100"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="50" cy="50" r="48" fill="#D91B24" />
                        <circle cx="50" cy="50" r="30" stroke="white" strokeWidth="3" fill="none" />
                        <circle cx="50" cy="50" r="9" fill="white" />
                        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                          <g key={angle} transform={`rotate(${angle} 50 50)`}>
                            <polygon points="50,20 54,28 50,36 46,28" fill="white" />
                          </g>
                        ))}
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Subtitle instructions */}
                <p className="text-[11px] text-gray-500 font-medium mt-2.5">
                  Scan with <strong className="text-gray-800">Bakong</strong>,{' '}
                  <strong className="text-gray-800">ABA Mobile</strong>,{' '}
                  <strong className="text-gray-800">Wing</strong>,{' '}
                  <strong className="text-gray-800">Acleda</strong> &amp; any bank app
                </p>

                {/* Reference & Countdown Timer */}
                <p className="text-[10px] text-gray-400 font-mono mt-1">
                  Ref: <span className="font-semibold text-gray-600">{refCode}</span> • Expires in{' '}
                  <span className="font-semibold text-rose-600 font-mono">
                    {formatTimer(timerSeconds)}
                  </span>
                </p>
              </div>
            </div>

            {/* Customer Screen Verification box */}
            <div className="p-3 rounded-xl bg-[#1a1d24] border border-gray-800 text-left flex items-start gap-2.5">
              <i className="fa-solid fa-circle-check text-emerald-400 text-sm mt-0.5 shrink-0"></i>
              <div className="text-[11px] text-gray-300 leading-tight">
                <p className="font-bold text-white">Customer Screen Verification</p>
                <p className="text-gray-400 mt-0.5">
                  Ask customer to show the green “Payment Successful” screen on their banking app, then confirm below.
                </p>
              </div>
            </div>

            {/* Optional Bank Ref / Auth Code */}
            <div>
              <input
                type="text"
                value={bankRef}
                onChange={(e) => setBankRef(e.target.value)}
                placeholder="Optional Bank Ref / Auth Code (e.g. 849201)"
                className="w-full bg-[#1a1d24] text-xs font-mono text-gray-200 placeholder-gray-500 rounded-xl px-4 py-2.5 border border-gray-800 outline-none focus:border-rose-500 text-center"
              />
            </div>
          </div>
        )}

        {/* TAB 2: CASH PAYMENT */}
        {activeTab === 'cash' && (
          <div className="mt-3.5 space-y-3 animate-in fade-in duration-150">
            {/* Total Due Card */}
            <div className="bg-[#1a1d24] p-4 rounded-2xl border border-gray-800 text-center">
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                Total Amount Due
              </span>
              <div className="my-1.5 flex items-baseline justify-center gap-1.5">
                <span className="text-3xl font-extrabold text-[#E11D48] font-sans">
                  ${totalUsd.toFixed(2)}
                </span>
                <span className="text-sm font-semibold text-gray-400 font-mono">
                  ({totalKhr.toLocaleString()} ៛)
                </span>
              </div>
              <p className="text-[10px] text-gray-500 font-mono">
                Exchange Rate: $1 = {exchangeRate.toLocaleString()} ៛
              </p>
            </div>

            {/* Quick Denominations */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                <span>Quick USD ($):</span>
                <button
                  type="button"
                  onClick={() => {
                    setCashTenderedUsd(totalUsd.toFixed(2));
                    setCashTenderedKhr('');
                  }}
                  className="text-cyan-400 hover:text-cyan-300 font-bold"
                >
                  Exact (${totalUsd.toFixed(2)})
                </button>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 5, 10, 20, 50, 100].slice(0, 5).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCashTenderedUsd(val.toString());
                      setCashTenderedKhr('');
                    }}
                    className="py-1.5 rounded-lg bg-[#1a1d24] hover:bg-slate-700 text-xs font-mono font-bold text-gray-200 border border-gray-800 transition"
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                <span>Quick KHR (៛):</span>
                <button
                  type="button"
                  onClick={() => {
                    setCashTenderedKhr(totalKhr.toString());
                    setCashTenderedUsd('');
                  }}
                  className="text-amber-400 hover:text-amber-300 font-bold"
                >
                  Exact ({totalKhr.toLocaleString()} ៛)
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[5000, 10000, 20000, 50000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setCashTenderedKhr(val.toString());
                      setCashTenderedUsd('');
                    }}
                    className="py-1.5 rounded-lg bg-[#1a1d24] hover:bg-slate-700 text-[11px] font-mono font-bold text-gray-200 border border-gray-800 transition"
                  >
                    {(val / 1000).toFixed(0)}k ៛
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs: Cash Tendered USD & KHR */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[10px] text-gray-400 uppercase font-bold mb-1">
                  Cash Received ($ USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={cashTenderedUsd}
                    onChange={(e) => setCashTenderedUsd(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#1a1d24] text-xs font-mono text-white rounded-xl pl-6 pr-2 py-2 border border-gray-800 outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-gray-400 uppercase font-bold mb-1">
                  Cash Received (៛ KHR)
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">
                    ៛
                  </span>
                  <input
                    type="number"
                    step="100"
                    value={cashTenderedKhr}
                    onChange={(e) => setCashTenderedKhr(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#1a1d24] text-xs font-mono text-white rounded-xl pl-2 pr-6 py-2 border border-gray-800 outline-none focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Change Due Display */}
            <div className="p-3 rounded-xl bg-[#1a1d24] border border-gray-800 flex items-center justify-between text-xs">
              <span className="font-bold text-gray-300">Change Returned:</span>
              <div className="text-right">
                <span
                  className={`font-mono font-extrabold text-sm ${
                    totalTenderedUsd >= totalUsd ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  ${changeDueUsd.toFixed(2)}
                </span>
                <span className="text-[11px] text-gray-400 ml-1.5 font-mono">
                  ({changeDueKhr.toLocaleString()} ៛)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM ACTION BUTTONS */}
        {activeTab === 'cash' && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 space-y-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.99] text-white font-extrabold text-sm tracking-wide shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <i className="fa-regular fa-circle-check text-base"></i>
              <span>Confirm Cash Received</span>
            </button>
          </div>
        )}

        {/* KHQR Flow: Step 1 (Share Photo QR) -> Step 2 (Confirm KHQR) */}
        {activeTab === 'khqr' && !isQrShared && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 space-y-2.5">
            {/* Primary Action: Share Photo QR to Telegram */}
            <button
              type="button"
              onClick={handleSharePhotoToTelegram}
              disabled={isGeneratingPhoto}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#229ED9] hover:bg-[#1E88E5] active:scale-[0.99] text-white font-extrabold text-sm tracking-wide shadow-lg shadow-sky-950/60 flex items-center justify-center gap-2.5 transition cursor-pointer disabled:opacity-60"
            >
              {isGeneratingPhoto ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin text-base"></i>
                  <span>កំពុងបង្កើត និងផ្ញើរូបភាព QR Code...</span>
                </>
              ) : (
                <>
                  <i className="fa-brands fa-telegram text-lg"></i>
                  <span>Share Photo QR to Telegram</span>
                </>
              )}
            </button>

            {/* Instruction description */}
            <p className="text-[11px] text-center text-gray-400 leading-tight">
              ផ្ញើរូបភាព QR Code ទៅអតិថិជនដើម្បីស្កេន រួចចុច Confirm បន្ទាប់ពីទទួលបានប្រាក់
            </p>

            {/* Quick Helper Tools: Copy Photo Image & Download Image */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <button
                type="button"
                onClick={handleCopyPhotoQr}
                className="flex-1 py-2 px-2.5 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-gray-300 hover:text-white border border-gray-800 flex items-center justify-center gap-1.5 transition text-[11px] font-semibold cursor-pointer"
                title="Copy QR image to clipboard for instant Ctrl+V pasting into Telegram"
              >
                <i className="fa-regular fa-copy text-xs text-sky-400"></i>
                <span>{copiedPhoto ? 'Copied Image!' : 'Copy Photo QR'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPhotoQr}
                className="flex-1 py-2 px-2.5 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-gray-300 hover:text-white border border-gray-800 flex items-center justify-center gap-1.5 transition text-[11px] font-semibold cursor-pointer"
                title="Download QR image file"
              >
                <i className="fa-solid fa-download text-xs text-emerald-400"></i>
                <span>Download QR</span>
              </button>
            </div>

            {/* Direct Confirmation for Walk-in Counter Customers */}
            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={() => setIsQrShared(true)}
                className="text-[11px] text-gray-400 hover:text-rose-400 underline underline-offset-2 transition cursor-pointer"
              >
                អតិថិជនស្កេនលើអេក្រង់ផ្ទាល់? ចុចទីនេះដើម្បី Confirm ភ្លាមៗ &rarr;
              </button>
            </div>
          </div>
        )}

        {/* KHQR Flow: Step 2 (Customer Scanned -> Now Cashier Confirms) */}
        {activeTab === 'khqr' && isQrShared && (
          <div className="mt-4 pt-3 border-t border-gray-800/60 space-y-2.5 animate-in fade-in duration-200">
            {/* Status Notification Banner */}
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-left flex items-start gap-2.5">
              <span className="relative flex h-3 w-3 mt-0.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <div className="text-[11px] text-emerald-200 leading-tight">
                <p className="font-bold text-emerald-300">
                  📸 បានផ្ញើរូបភាព QR Code ទៅ Telegram រួចរាល់!
                </p>
                <p className="text-emerald-400/90 mt-0.5 text-[10.5px]">
                  កំពុងរង់ចាំអតិថិជនស្កេនរូបភាព QR... នៅពេលអតិថិជនផ្ទេរប្រាក់ជោគជ័យ សូមចុច Confirm ខាងក្រោម៖
                </p>
              </div>
            </div>

            {/* Main Confirm Button - Only unlocked and presented AFTER Photo QR is shared! */}
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.99] text-white font-extrabold text-sm tracking-wide shadow-lg shadow-rose-950/60 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <i className="fa-regular fa-circle-check text-base"></i>
              <span>Confirm KHQR Received (Instant)</span>
            </button>

            {/* Secondary Utility Controls */}
            <div className="flex items-center justify-between gap-2 pt-0.5 text-xs">
              <button
                type="button"
                onClick={handleSharePhotoToTelegram}
                disabled={isGeneratingPhoto}
                className="flex-1 py-2 px-2 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-sky-400 hover:text-sky-300 border border-gray-800 flex items-center justify-center gap-1.5 transition text-[11px] font-semibold cursor-pointer"
                title="Send photo QR again to another Telegram chat"
              >
                <i className="fa-brands fa-telegram text-xs"></i>
                <span>Re-share QR</span>
              </button>

              <button
                type="button"
                onClick={handleCopyPhotoQr}
                className="flex-1 py-2 px-2 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-gray-300 hover:text-white border border-gray-800 flex items-center justify-center gap-1.5 transition text-[11px] font-semibold cursor-pointer"
              >
                <i className="fa-regular fa-copy text-xs text-sky-400"></i>
                <span>{copiedPhoto ? 'Copied!' : 'Copy Photo'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPhotoQr}
                className="flex-1 py-2 px-2 rounded-xl bg-[#1a1d24] hover:bg-white/10 text-gray-300 hover:text-white border border-gray-800 flex items-center justify-center gap-1.5 transition text-[11px] font-semibold cursor-pointer"
              >
                <i className="fa-solid fa-download text-xs text-emerald-400"></i>
                <span>Download</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
