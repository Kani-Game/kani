import React, { useState, useEffect, useRef } from 'react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: string, pass: string) => boolean;
  onLoginSuccess: (destination: 'admin' | 'pos') => void;
  targetDestination?: 'admin' | 'pos';
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onLoginSuccess,
  targetDestination = 'admin',
}) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [destination, setDestination] = useState<'admin' | 'pos'>(targetDestination);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // When modal opens, clear password and error, and focus password input
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setDestination(targetDestination);
      setTimeout(() => {
        passwordInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, targetDestination]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Please enter your admin password.');
      return;
    }

    const success = onLogin(username.trim() || 'admin', password);
    if (success) {
      setPassword('');
      setError(null);
      onLoginSuccess(destination);
      onClose();
    } else {
      setError('Incorrect username or password. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-[#0f172a] border border-purple-500/50 rounded-2xl shadow-[0_0_50px_rgba(168,85,247,0.35)] overflow-hidden p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          title="Close"
        >
          <i className="fa-solid fa-xmark text-sm"></i>
        </button>

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-400 p-0.5 shadow-neon-purple mb-2.5">
            <div className="w-full h-full bg-[#0d1322] rounded-[14px] flex items-center justify-center">
              <i className={`fa-solid ${destination === 'pos' ? 'fa-cash-register' : 'fa-shield-halved'} text-2xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400`}></i>
            </div>
          </div>
          <h3 className="font-orbitron font-extrabold text-xl text-white tracking-wider">
            {destination === 'pos' ? 'POS CASHIER LOGIN' : 'ADMIN & POS ACCESS'}
          </h3>
          <p className="text-xs text-purple-400/80 font-rajdhani uppercase tracking-widest mt-0.5">
            {destination === 'pos'
              ? 'POS Terminal is protected. Admin can log in.'
              : 'Enter admin username and password'}
          </p>
        </div>

        {/* Destination Switcher */}
        <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-[#131b2e] rounded-xl border border-purple-900/40">
          <button
            type="button"
            onClick={() => setDestination('pos')}
            className={`py-2 px-3 rounded-lg text-xs font-orbitron font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              destination === 'pos'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-cash-register text-xs"></i>
            <span>POS Cashier</span>
          </button>
          <button
            type="button"
            onClick={() => setDestination('admin')}
            className={`py-2 px-3 rounded-lg text-xs font-orbitron font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              destination === 'admin'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <i className="fa-solid fa-shield-halved text-xs"></i>
            <span>Admin Panel</span>
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center gap-2 animate-in fade-in">
            <i className="fa-solid fa-triangle-exclamation text-red-400"></i>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 font-rajdhani tracking-wider">
              USERNAME:
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-[#131b2e] text-sm text-gray-200 rounded-xl px-4 py-2.5 pl-10 border border-purple-900/50 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
              />
              <i className="fa-solid fa-user absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs"></i>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 font-rajdhani tracking-wider">
              PASSWORD:
            </label>
            <div className="relative">
              <input
                ref={passwordInputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full bg-[#131b2e] text-sm text-gray-200 rounded-xl px-4 py-2.5 pl-10 pr-10 border border-purple-900/50 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
              />
              <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs"></i>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-xs`}></i>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`w-full py-3 rounded-xl font-orbitron font-bold text-sm text-white transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer mt-3 ${
              destination === 'pos'
                ? 'bg-gradient-to-r from-cyan-600 via-teal-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-cyan-950/60'
                : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 shadow-purple-950/50'
            }`}
          >
            <i className={`fa-solid ${destination === 'pos' ? 'fa-cash-register' : 'fa-right-to-bracket'}`}></i>
            <span>
              {destination === 'pos' ? 'LOGIN TO POS CASHIER' : 'LOGIN TO ADMIN DASHBOARD'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
};
