export interface Game {
  id: string;
  name: string;
  tag: string;
  img: string;
  genre: string;
  link?: string;
  description?: string;
  createdAt?: string;
  price?: number; // Price in USD ($), e.g. 2.50, 0 for free
  barcode?: string; // Optional SKU or Barcode for POS scanning
  stock?: number; // Stock count or undefined for unlimited digital
  costPrice?: number; // Cost price for profit margins
}

export type GameTab = 'steam' | 'free' | 'product' | 'all';

export type AppViewMode = 'store' | 'pos' | 'admin';

export type ReportCategory = 'Product' | 'Steam offline' | 'Account' | string;

export interface DailyReportRow {
  id: string;
  gameName: string;
  category: ReportCategory;
  buyIn: number; // Cost price (auto = 0, but user can input)
  sellOut: number; // Selling price
  profit: number; // sellOut - buyIn
  date: string; // e.g. "1-Nov-2026"
  source?: 'pos' | 'manual';
  posSaleId?: string;
  receiptNo?: string;
  quantity?: number;
}

export interface ExpenseItem {
  id: string;
  name: string;
  price: number;
}

export interface ReportVersionSnapshot {
  id: string;
  versionName: string;
  timestamp: string;
  formattedDate: string;
  author: string;
  notes?: string;
  triggerType: 'pos_sale' | 'ledger_edit' | 'manual_snapshot' | 'expense_change' | 'restore';
  stats: {
    totalRows: number;
    totalCost: number;
    totalPrice: number;
    totalProfit: number;
    totalExpense: number;
    totalProfitAfterExpense: number;
  };
  rows: DailyReportRow[];
  expenses: ExpenseItem[];
}

export interface POSCartItem {
  game: Game;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  note?: string;
}

export interface POSSaleRecord {
  id: string;
  receiptNo: string;
  date: string;
  items: {
    id: string;
    name: string;
    tag: string;
    genre: string;
    unitPrice: number;
    costPrice?: number;
    quantity: number;
    subtotal: number;
    description?: string;
  }[];
  subtotalUsd: number;
  discountPercent: number;
  discountAmountUsd: number;
  taxPercent: number;
  taxAmountUsd: number;
  totalUsd: number;
  totalKhr: number;
  exchangeRate: number; // e.g. 4100 KHR per USD
  paymentMethod: 'cash' | 'aba_khqr' | 'telegram' | 'card' | 'bakong_khqr';
  bankRef?: string;
  cashTenderedUsd?: number;
  cashTenderedKhr?: number;
  changeReturnedUsd?: number;
  changeReturnedKhr?: number;
  customerName?: string;
  customerPhone?: string;
  accountLines?: [string, string, string, string]; // 4 lines of account info (e.g. Account, Password, Guard, Note)
  accountDetailsText?: string; // Formatted 4-line text
  cashierName?: string;
  status: 'completed' | 'refunded';
}

export interface SiteSettings {
  portalTitle: string;
  portalSubtitle: string;
  heroBadge: string;
  heroTitle: string;
  heroDescription: string;
  telegramAdminHandle: string;
  telegramNotePlaceholder: string;
  customMessagePrefix?: string;
  khrExchangeRate?: number; // Default 4100
  posCashierName?: string; // Default 'Kani Cashier'
  qrCodeImage?: string; // ABA KHQR / Bakong payment QR code base64 or URL
  qrCodeLabel?: string; // Label for QR code e.g. 'ABA PAY / KHQR'
}

export type UserRole = 'admin' | 'pos';

export interface UserAccount {
  id: 'admin' | 'pos';
  role: UserRole;
  username: string;
  passwordHash: string;
  displayName: string;
  updatedAt?: string;
}

export interface UserAccountsConfig {
  admin: UserAccount;
  pos: UserAccount;
}

export interface AdminAuth {
  isAuthenticated: boolean;
  username: string;
  role: UserRole;
  displayName?: string;
  token?: string;
  loginTime?: string;
}

