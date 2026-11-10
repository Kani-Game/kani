import React from 'react';
import { POSSaleRecord, SiteSettings } from '../types/game';

interface POSReceiptModalProps {
  sale: POSSaleRecord | null;
  settings: SiteSettings;
  onClose: () => void;
  onNewSale: () => void;
}

export const POSReceiptModal: React.FC<POSReceiptModalProps> = ({
  sale,
  settings,
  onClose,
  onNewSale,
}) => {
  const [copied, setCopied] = React.useState(false);
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const getTelegramText = () => {
    let text = `\n*ITEMS:*\n\n`;
    sale.items.forEach((item, i) => {
      text += `${i + 1}. *${item.name}* x${item.quantity} - $${item.subtotal.toFixed(2)}\n`;
      if (item.description) {
        text += `${item.description.trim()}\n`;
      }
      if (i < sale.items.length - 1) {
        text += `\n`;
      }
    });
    text += `\n*TOTAL USD: $${sale.totalUsd.toFixed(2)}*\n`;
    text += `\n⚠️ Account ដែលទិញហើយមិនអាចដូរលុយ ឬ ដូរgameវិញបានទេ\n`;
    text += `Thank you for choosing Kani Game! 🎮`;
    return text;
  };

  const getFullReceiptText = () => {
    return `https://kanigame.com\n${getTelegramText()}`;
  };

  const handleShareTelegram = () => {
    const text = getTelegramText();
    const encoded = encodeURIComponent(text);
    const url = `https://t.me/share/url?url=https://kanigame.com&text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(getFullReceiptText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0f172a] border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-purple-900/40 bg-[#131b2e]">
          <div className="flex items-center gap-2 text-cyan-400 font-orbitron font-bold text-sm">
            <i className="fa-solid fa-receipt"></i>
            <span>SALES RECEIPT & PAYMENT SUCCESS</span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[70vh]">
          <div
            id="pos-printable-receipt"
            className="bg-white text-gray-900 font-mono text-xs p-5 rounded-xl shadow-lg border border-gray-200"
          >
            {/* Store Header */}
            <div className="text-center pb-3 border-b border-dashed border-gray-300">
              <h2 className="font-extrabold text-lg text-black tracking-wider uppercase font-sans">
                {settings.portalTitle || 'KANI GAME'}
              </h2>
              <p className="text-[10px] text-gray-600 font-sans">
                {settings.portalSubtitle || 'Ultimate Gaming Portal & Store'}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Telegram: {settings.telegramAdminHandle || '@KaniGame168'}
              </p>
              <div className="mt-2 inline-block px-2.5 py-0.5 bg-black text-white text-[9px] font-bold rounded-full">
                OFFICIAL RECEIPT
              </div>
            </div>

            {/* Receipt Meta */}
            <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-[11px] text-gray-700">
              <div className="flex justify-between">
                <span>Receipt No:</span>
                <span className="font-bold text-black">{sale.receiptNo}</span>
              </div>
              <div className="flex justify-between">
                <span>Date & Time:</span>
                <span>{new Date(sale.date).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{sale.cashierName || 'Kani Cashier'}</span>
              </div>
              {sale.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-semibold text-black">{sale.customerName}</span>
                </div>
              )}
              {sale.customerPhone && (
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span>{sale.customerPhone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Payment:</span>
                <span className="font-bold uppercase text-purple-700">
                  {sale.paymentMethod === 'aba_khqr' ? 'ABA PAY (KHQR)' : sale.paymentMethod}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-3 border-b border-dashed border-gray-300">
              <div className="flex justify-between font-bold text-gray-800 text-[10px] pb-1 border-b border-gray-200 uppercase">
                <span>Item Description</span>
                <span>Amount</span>
              </div>
              <div className="divide-y divide-gray-100 my-1">
                {sale.items.map((item, idx) => (
                  <div key={idx} className="py-2 flex justify-between items-start text-[11px] gap-2">
                    <div className="flex-1 pr-1">
                      <div className="font-bold text-gray-950 leading-tight text-xs">{item.name}</div>
                      {item.description ? (
                        <div className="text-[10px] text-gray-600 italic leading-snug my-0.5 font-sans bg-gray-50/80 px-1.5 py-0.5 rounded border border-gray-100">
                          {item.description}
                        </div>
                      ) : null}
                      <div className="text-[10px] text-gray-500 font-sans mt-0.5">
                        {item.quantity} x ${item.unitPrice.toFixed(2)} <span className="text-gray-400">({item.tag})</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-bold text-gray-900 text-xs">
                        ${item.subtotal.toFixed(2)}
                      </span>
                      <div className="text-[9px] text-gray-500 font-mono">
                        {(item.subtotal * (sale.exchangeRate || 4100)).toLocaleString()} ៛
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations & Totals */}
            <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-[11px]">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal:</span>
                <span>${sale.subtotalUsd.toFixed(2)}</span>
              </div>
              {sale.discountAmountUsd > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({sale.discountPercent}%):</span>
                  <span>-${sale.discountAmountUsd.toFixed(2)}</span>
                </div>
              )}
              {sale.taxAmountUsd > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Tax ({sale.taxPercent}%):</span>
                  <span>+${sale.taxAmountUsd.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 flex justify-between items-baseline font-bold text-base text-black border-t border-gray-300">
                <span>TOTAL USD:</span>
                <span className="text-lg">${sale.totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-purple-700">
                <span>TOTAL KHR:</span>
                <span>{sale.totalKhr.toLocaleString()} ៛</span>
              </div>
              <div className="text-[9px] text-gray-400 text-right">
                Rate: $1 = {sale.exchangeRate.toLocaleString()} ៛
              </div>
            </div>

            {/* Cash Paid / Change (if cash) */}
            {sale.paymentMethod === 'cash' && (
              <div className="py-2 border-b border-dashed border-gray-300 text-[11px] space-y-0.5 text-gray-700">
                <div className="flex justify-between">
                  <span>Cash Tendered:</span>
                  <span>
                    ${(sale.cashTenderedUsd || sale.totalUsd).toFixed(2)} (
                    {(sale.cashTenderedKhr || sale.totalKhr).toLocaleString()} ៛)
                  </span>
                </div>
                <div className="flex justify-between font-bold text-green-700">
                  <span>Change Returned:</span>
                  <span>
                    ${(sale.changeReturnedUsd || 0).toFixed(2)} (
                    {(sale.changeReturnedKhr || 0).toLocaleString()} ៛)
                  </span>
                </div>
              </div>
            )}

            {/* Receipt Footer & QR Code */}
            <div className="text-center pt-3 space-y-1 text-gray-600 text-[10px]">
              <div className="flex justify-center my-1.5">
                <div className="w-20 h-20 border-2 border-black p-1 flex items-center justify-center bg-white rounded overflow-hidden shadow-sm">
                  {settings.qrCodeImage ? (
                    <img
                      src={settings.qrCodeImage}
                      alt="Payment QR"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <i className="fa-solid fa-qrcode text-3xl text-black"></i>
                  )}
                </div>
              </div>
              <p className="font-semibold text-black">សូមអរគុណសម្រាប់ការគាំទ្រ!</p>
              <p className="text-[10px] font-medium text-red-600">Account ដែលទិញហើយមិនអាចដូរលុយ ឬ ដូរgameវិញបានទេ</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-[#131b2e] border-t border-purple-900/40 flex flex-wrap gap-2 justify-end">
          <button
            onClick={handleCopyText}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-gray-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Copy exact receipt format to clipboard"
          >
            <i className={`fa-solid ${copied ? 'fa-check text-green-400' : 'fa-copy'}`}></i>
            <span>{copied ? 'Copied!' : 'Copy Text'}</span>
          </button>

          <button
            onClick={handleShareTelegram}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <i className="fa-brands fa-telegram"></i>
            <span>Send to Telegram</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <i className="fa-solid fa-print"></i>
            <span>Print Receipt</span>
          </button>

          <button
            onClick={onNewSale}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-500 hover:from-cyan-500 hover:to-teal-400 text-white text-xs font-orbitron font-bold transition shadow-neon-cyan cursor-pointer"
          >
            <i className="fa-solid fa-plus mr-1"></i>
            <span>NEW SALE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
