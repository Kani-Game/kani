import React, { useState } from 'react';
import { POSSaleRecord } from '../types/game';

interface POSSalesHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sales: POSSaleRecord[];
  onSelectSale: (sale: POSSaleRecord) => void;
  onDeleteSale: (id: string) => void;
  onClearAll: () => void;
  exchangeRate?: number;
}

export const POSSalesHistoryModal: React.FC<POSSalesHistoryModalProps> = ({
  isOpen,
  onClose,
  sales,
  onSelectSale,
  onDeleteSale,
  onClearAll,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredSales = sales.filter((s) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      s.receiptNo.toLowerCase().includes(term) ||
      (s.customerName && s.customerName.toLowerCase().includes(term)) ||
      (s.customerPhone && s.customerPhone.includes(term)) ||
      s.paymentMethod.toLowerCase().includes(term) ||
      s.items.some((it) => it.name.toLowerCase().includes(term))
    );
  });

  const totalRevenueUsd = sales.reduce((acc, s) => acc + s.totalUsd, 0);
  const totalRevenueKhr = sales.reduce((acc, s) => acc + s.totalKhr, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#0f172a] border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-900/40 bg-[#131b2e]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-900/60 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <i className="fa-solid fa-clock-rotate-left text-lg"></i>
            </div>
            <div>
              <h3 className="font-orbitron font-bold text-lg text-white">POS TRANSACTION HISTORY</h3>
              <p className="text-xs text-purple-300 font-rajdhani">
                ប្រវត្តិការលក់ និងបង្កាន់ដៃទទួលប្រាក់ទាំងអស់ ({sales.length} Transactions)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <i className="fa-solid fa-xmark text-sm"></i>
          </button>
        </div>

        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#0a0f1d] border-b border-purple-900/40">
          <div className="p-3 bg-[#131b2e] rounded-xl border border-purple-900/40">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
              Total Revenue (USD)
            </span>
            <p className="text-xl font-orbitron font-extrabold text-cyan-400 mt-0.5">
              ${totalRevenueUsd.toFixed(2)}
            </p>
          </div>

          <div className="p-3 bg-[#131b2e] rounded-xl border border-purple-900/40">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
              Total Revenue (KHR)
            </span>
            <p className="text-xl font-orbitron font-extrabold text-purple-400 mt-0.5">
              {totalRevenueKhr.toLocaleString()} ៛
            </p>
          </div>

          <div className="p-3 bg-[#131b2e] rounded-xl border border-purple-900/40 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
                Total Orders
              </span>
              <p className="text-xl font-orbitron font-extrabold text-white mt-0.5">
                {sales.length}
              </p>
            </div>
            {sales.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Clear all POS sales history?')) {
                    onClearAll();
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 underline cursor-pointer"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Filter Input */}
        <div className="p-4 border-b border-purple-900/40 bg-[#131b2e]">
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Invoice #, Customer name, Item name..."
              className="w-full bg-[#0a0f1d] text-xs text-white placeholder-gray-500 rounded-xl pl-9 pr-4 py-2 border border-purple-500/30 outline-none"
            />
          </div>
        </div>

        {/* Sales Table / List */}
        <div className="overflow-y-auto flex-1 p-4">
          {filteredSales.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <i className="fa-solid fa-receipt text-3xl mb-2 text-gray-600"></i>
              <p className="text-sm">No transaction records found.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredSales.map((sale) => (
                <div
                  key={sale.id}
                  className="bg-[#131b2e] border border-purple-900/40 hover:border-purple-500/60 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-cyan-400 text-xs">
                        {sale.receiptNo}
                      </span>
                      <span className="text-[10px] bg-purple-950/80 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded font-mono uppercase">
                        {sale.paymentMethod === 'aba_khqr' ? 'ABA KHQR' : sale.paymentMethod}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {new Date(sale.date).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-gray-200 font-semibold line-clamp-1">
                      {sale.items.map((it) => `${it.name} (${it.quantity}x)`).join(', ')}
                    </p>

                    {sale.customerName && (
                      <p className="text-[11px] text-gray-400">
                        Customer: <span className="text-gray-300">{sale.customerName}</span>
                        {sale.customerPhone && ` • ${sale.customerPhone}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-purple-900/30">
                    <div className="text-right">
                      <div className="font-orbitron font-extrabold text-white text-sm">
                        ${sale.totalUsd.toFixed(2)}
                      </div>
                      <div className="text-[11px] font-mono text-purple-300 font-bold">
                        {sale.totalKhr.toLocaleString()} ៛
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onSelectSale(sale)}
                        className="px-3 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                        title="View & Print Receipt"
                      >
                        <i className="fa-solid fa-receipt text-xs"></i>
                        <span>Receipt</span>
                      </button>

                      <button
                        onClick={() => onDeleteSale(sale.id)}
                        className="w-8 h-8 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 flex items-center justify-center transition cursor-pointer"
                        title="Delete Sale Record"
                      >
                        <i className="fa-solid fa-trash text-xs"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
