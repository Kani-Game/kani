import React from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'info' | 'error';
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 bg-[#131b2e]/95 text-white border border-purple-500/80 px-4 py-3 rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.4)] backdrop-blur-md animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          {toast.type === 'error' ? (
            <i className="fa-solid fa-circle-exclamation text-red-400 text-lg"></i>
          ) : (
            <i className="fa-solid fa-circle-check text-green-400 text-lg"></i>
          )}
          <span className="text-xs font-semibold leading-relaxed">{toast.text}</span>
        </div>
      ))}
    </div>
  );
};
