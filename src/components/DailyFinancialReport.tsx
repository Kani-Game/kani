import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DailyReportRow, ExpenseItem, ReportCategory, POSSaleRecord } from '../types/game';
import { StorageService, formatReportDate } from '../services/storageService';

export type FinancialTextSize = 'sm' | 'md' | 'lg' | 'xl';

interface DailyFinancialReportProps {
  onShowToast?: (msg: string, type?: 'success' | 'info' | 'error') => void;
  onClose?: () => void;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Product: {
    bg: 'bg-sky-500/20',
    text: 'text-sky-300',
    border: 'border-sky-500/40',
  },
  'Steam offline': {
    bg: 'bg-rose-950/80',
    text: 'text-rose-300',
    border: 'border-rose-500/40',
  },
  Account: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-300',
    border: 'border-amber-500/40',
  },
};

export interface ParsedSheetRow {
  gameName: string;
  category: ReportCategory;
  buyIn: number;
  sellOut: number;
  profit: number;
  date: string;
  source: 'manual';
  isValid: boolean;
  rawCols: string[];
}

function cleanPrice(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$៛₫,\s]/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function detectCategory(val: string | undefined, defaultCat: ReportCategory): ReportCategory {
  if (!val) return defaultCat;
  const lower = val.toLowerCase();
  if (lower.includes('steam') || lower.includes('offline')) return 'Steam offline';
  if (lower.includes('account') || lower.includes('acc')) return 'Account';
  if (lower.includes('product') || lower.includes('prod') || lower.includes('item') || lower.includes('accessory')) return 'Product';
  return defaultCat;
}

function isLikelyDate(str: string): boolean {
  if (!str) return false;
  const s = str.trim();
  return /[-/.]|[a-zA-Z]{3}/.test(s) && /\d/.test(s);
}

function normalizeDate(str: string, fallback: string): string {
  if (!str) return fallback;
  const s = str.trim();
  if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)) {
    return s;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return formatReportDate(parsed);
  }
  const parts = s.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dObj = new Date(y, m, d);
      if (!isNaN(dObj.getTime())) return formatReportDate(dObj);
    }
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
      const dObj = new Date(y < 100 ? 2000 + y : y, m, d);
      if (!isNaN(dObj.getTime())) return formatReportDate(dObj);
    }
  }
  return s || fallback;
}

export function parseGoogleSheetsData(
  text: string,
  defaultCategory: ReportCategory = 'Steam offline',
  defaultDate: string
): { rows: ParsedSheetRow[]; hasHeader: boolean; headerText?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], hasHeader: false };

  const sample = lines[0];
  const separator = sample.includes('\t') ? '\t' : sample.includes(',') ? ',' : '\t';

  const parsedLines = lines.map((line) => {
    if (separator === ',') {
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      if (matches) {
        return matches.map((m) => m.replace(/^"|"$/g, '').trim());
      }
      return line.split(',').map((s) => s.replace(/^"|"$/g, '').trim());
    } else {
      return line.split('\t').map((s) => s.trim());
    }
  });

  const firstCols = parsedLines[0].map((c) => c.toLowerCase());
  const headerKeywords = ['game', 'item', 'name', 'category', 'buy', 'sell', 'profit', 'date', 'col', 'price', 'product'];
  const isHeader = firstCols.some((c) => headerKeywords.some((k) => c.includes(k)));

  const dataRows = isHeader ? parsedLines.slice(1) : parsedLines;
  const headerText = isHeader ? lines[0] : undefined;

  const resultRows: ParsedSheetRow[] = [];

  for (const cols of dataRows) {
    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

    const gameName = cols[0] || 'Unnamed Game';
    let category: ReportCategory = defaultCategory;
    let buyIn = 0;
    let sellOut = 0;
    let profit: number | null = null;
    let dateStr = defaultDate;

    if (cols.length >= 6) {
      category = detectCategory(cols[1], defaultCategory);
      buyIn = cleanPrice(cols[2]);
      sellOut = cleanPrice(cols[3]);
      const p = cleanPrice(cols[4]);
      profit = !isNaN(p) && cols[4].trim() !== '' ? p : sellOut - buyIn;
      if (cols[5]?.trim()) {
        dateStr = normalizeDate(cols[5].trim(), defaultDate);
      }
    } else if (cols.length === 5) {
      category = detectCategory(cols[1], defaultCategory);
      buyIn = cleanPrice(cols[2]);
      sellOut = cleanPrice(cols[3]);
      if (isLikelyDate(cols[4])) {
        dateStr = normalizeDate(cols[4].trim(), defaultDate);
        profit = sellOut - buyIn;
      } else {
        profit = cleanPrice(cols[4]);
      }
    } else if (cols.length === 4) {
      if (isNaN(cleanPrice(cols[1])) && (cols[1].toLowerCase().includes('steam') || cols[1].toLowerCase().includes('product') || cols[1].toLowerCase().includes('acc'))) {
        category = detectCategory(cols[1], defaultCategory);
        buyIn = cleanPrice(cols[2]);
        sellOut = cleanPrice(cols[3]);
      } else {
        buyIn = cleanPrice(cols[1]);
        sellOut = cleanPrice(cols[2]);
        if (cols[3]?.trim()) {
          dateStr = normalizeDate(cols[3].trim(), defaultDate);
        }
      }
      profit = sellOut - buyIn;
    } else if (cols.length === 3) {
      buyIn = cleanPrice(cols[1]);
      sellOut = cleanPrice(cols[2]);
      profit = sellOut - buyIn;
    } else if (cols.length === 2) {
      sellOut = cleanPrice(cols[1]);
      profit = sellOut;
    }

    resultRows.push({
      gameName,
      category,
      buyIn,
      sellOut,
      profit: profit !== null ? profit : sellOut - buyIn,
      date: dateStr,
      source: 'manual',
      isValid: gameName.trim().length > 0,
      rawCols: cols,
    });
  }

  return { rows: resultRows, hasHeader: isHeader, headerText };
}

export const DailyFinancialReport: React.FC<DailyFinancialReportProps> = ({
  onShowToast,
  onClose,
}) => {
  const [rows, setRows] = useState<DailyReportRow[]>(() => StorageService.getReportRows());
  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => StorageService.getExpenses());
  const [posSales, setPosSales] = useState<POSSaleRecord[]>(() => StorageService.getSales());

  // Undo & Redo History for Sales & Product Ledger (Cols A - F) [Ctrl+Z / Ctrl+Y]
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const undoStackRef = useRef<DailyReportRow[][]>([]);
  const redoStackRef = useRef<DailyReportRow[][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushUndoSnapshot = (currentRowsState: DailyReportRow[]) => {
    undoStackRef.current = [JSON.parse(JSON.stringify(currentRowsState)), ...undoStackRef.current].slice(0, 50);
    redoStackRef.current = [];
    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0) {
      onShowToast?.('គ្មានសកម្មភាពចាស់ដើម្បីត្រឡប់ក្រោយទេ (No more undos)', 'info');
      return;
    }
    const previousState = undoStackRef.current[0];
    undoStackRef.current = undoStackRef.current.slice(1);

    redoStackRef.current = [JSON.parse(JSON.stringify(rowsRef.current)), ...redoStackRef.current].slice(0, 50);

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);

    StorageService.saveReportRows(previousState);
    setRows(previousState);
    onShowToast?.(`↩️ បានត្រឡប់ក្រោយ (Undo / Ctrl+Z): ${previousState.length} ជួរដេក`, 'info');
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0) {
      onShowToast?.('គ្មានសកម្មភាពដើម្បីធ្វើឡើងវិញទេ (No more redos)', 'info');
      return;
    }
    const nextState = redoStackRef.current[0];
    redoStackRef.current = redoStackRef.current.slice(1);

    undoStackRef.current = [JSON.parse(JSON.stringify(rowsRef.current)), ...undoStackRef.current].slice(0, 50);

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);

    StorageService.saveReportRows(nextState);
    setRows(nextState);
    onShowToast?.(`↪️ បានធ្វើឡើងវិញ (Redo / Ctrl+Y): ${nextState.length} ជួរដេក`, 'info');
  };

  // Filter & Search states
  const [filterSource, setFilterSource] = useState<'all' | 'pos' | 'manual'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Product' | 'Steam offline' | 'Account'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active month/year for the calendar grid
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(10); // 0-indexed: 10 = November

  // Inline editing state for rows
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DailyReportRow>>({});

  // New row form modal / inline state
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [newGameName, setNewGameName] = useState('');
  const [newCategory, setNewCategory] = useState<ReportCategory>('Product');
  const [newBuyIn, setNewBuyIn] = useState<string>('0');
  const [newSellOut, setNewSellOut] = useState<string>('5.00');
  const [newDate, setNewDate] = useState<string>(() => formatReportDate(new Date()));

  // New expense state
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [newExpenseName, setNewExpenseName] = useState('');
  const [newExpensePrice, setNewExpensePrice] = useState('0');
  const [expensePriceDrafts, setExpensePriceDrafts] = useState<Record<string, string>>({});
  const [expenseNameDrafts, setExpenseNameDrafts] = useState<Record<string, string>>({});
  const expenseSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const dirtyExpenseIdsRef = useRef<Set<string>>(new Set());

  // POS Sale Inspection Modal
  const [inspectedSale, setInspectedSale] = useState<POSSaleRecord | null>(null);

  // Active formula display bar (like Google Sheets fx)
  const [activeFormula, setActiveFormula] = useState<string>(
    '=SUMIFS(E2:E1000, F2:F1000, I2)'
  );

  // Google Sheets Paste & Copy States (Cols A - F)
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteRawText, setPasteRawText] = useState('');
  const [pasteImportMode, setPasteImportMode] = useState<'append' | 'replace'>('append');
  const [pasteDefaultCategory, setPasteDefaultCategory] = useState<ReportCategory>('Steam offline');

  // 4 Text Sizes state (sm = Small 11px, md = Normal 13px, lg = Large 15px, xl = Extra Large 17px)
  const [textSize, setTextSize] = useState<FinancialTextSize>(() =>
    StorageService.getFinancialTextSize()
  );

  const handleSetTextSize = (size: FinancialTextSize) => {
    setTextSize(size);
    StorageService.setFinancialTextSize(size);
    const labels: Record<FinancialTextSize, string> = {
      sm: 'Small (11px / Compact)',
      md: 'Normal (13px / Default)',
      lg: 'Large (15px / High-Visibility)',
      xl: 'Extra Large (17px / Ultrawide & 34-inch)',
    };
    onShowToast?.(`ទំហំអក្សររបាយការណ៍ប្តូរទៅ: ${labels[size]}`, 'info');
  };

  const sizeConfig = useMemo(() => {
    switch (textSize) {
      case 'sm':
        return {
          containerClass: 'financial-size-sm',
          tableText: 'text-[11px] leading-normal antialiased font-normal',
          tableHeader: 'text-[10px] font-mono font-medium tracking-wider',
          cellPy: 'py-1',
          cellPx: 'px-2',
          cardValue: 'text-lg sm:text-xl font-orbitron font-bold',
          cardTitle: 'text-[10px] font-medium',
          cardSub: 'text-[9px] text-gray-400',
          badgeText: 'text-[9px] font-medium px-1.5 py-0.2',
          monoText: 'text-[11px] font-mono font-normal antialiased',
          inputClass: 'text-[11px] py-0.5 px-1 font-normal',
          formulaText: 'text-[11px] font-normal',
          totalText: 'text-[11px] font-orbitron font-bold',
          totalTitle: 'text-[11px] font-medium',
          label: 'Small',
          pxLabel: '11px',
        };
      case 'lg':
        return {
          containerClass: 'financial-size-lg',
          tableText: 'text-[14px] leading-relaxed antialiased font-normal',
          tableHeader: 'text-[12px] font-mono font-medium tracking-wider',
          cellPy: 'py-2.5',
          cellPx: 'px-3',
          cardValue: 'text-2xl sm:text-3xl font-orbitron font-bold',
          cardTitle: 'text-xs font-medium',
          cardSub: 'text-[11px] text-gray-400',
          badgeText: 'text-[11px] font-medium px-2 py-0.5',
          monoText: 'text-[14px] font-mono font-normal tracking-tight antialiased',
          inputClass: 'text-[14px] py-1.5 px-2 font-normal',
          formulaText: 'text-[14px] font-normal',
          totalText: 'text-[14px] font-orbitron font-bold',
          totalTitle: 'text-[14px] font-medium',
          label: 'Large',
          pxLabel: '15px',
        };
      case 'xl':
        return {
          containerClass: 'financial-size-xl',
          tableText: 'text-[16px] leading-relaxed antialiased font-normal',
          tableHeader: 'text-[13.5px] font-mono font-medium tracking-wider',
          cellPy: 'py-3',
          cellPx: 'px-3.5',
          cardValue: 'text-3xl sm:text-4xl font-orbitron font-bold',
          cardTitle: 'text-sm font-medium',
          cardSub: 'text-xs text-gray-400',
          badgeText: 'text-[12px] font-medium px-2.5 py-0.5',
          monoText: 'text-[16px] font-mono font-normal tracking-tight antialiased',
          inputClass: 'text-[16px] py-2 px-2.5 font-normal',
          formulaText: 'text-[16px] font-normal',
          totalText: 'text-[16px] font-orbitron font-bold',
          totalTitle: 'text-[16px] font-medium',
          label: 'XL',
          pxLabel: '17px',
        };
      case 'md':
      default:
        return {
          containerClass: 'financial-size-md',
          tableText: 'text-xs leading-normal antialiased font-normal',
          tableHeader: 'text-[11px] font-mono font-medium tracking-wider',
          cellPy: 'py-2',
          cellPx: 'px-2.5',
          cardValue: 'text-xl sm:text-2xl font-orbitron font-bold',
          cardTitle: 'text-[11px] font-medium',
          cardSub: 'text-[10px] text-gray-400',
          badgeText: 'text-[10px] font-medium px-2 py-0.5',
          monoText: 'text-xs font-mono font-normal antialiased',
          inputClass: 'text-xs py-1 px-1.5 font-normal',
          formulaText: 'text-xs font-normal',
          totalText: 'text-xs font-orbitron font-bold',
          totalTitle: 'text-xs font-medium',
          label: 'Normal',
          pxLabel: '13px',
        };
    }
  }, [textSize]);

  // Month names
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const fullMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Parse Google Sheets data in real time
  const parsedSheetsData = useMemo(() => {
    return parseGoogleSheetsData(
      pasteRawText,
      pasteDefaultCategory,
      formatReportDate(new Date(selectedYear, selectedMonth, 1))
    );
  }, [pasteRawText, pasteDefaultCategory, selectedYear, selectedMonth]);

  // Global Keyboard paste listener: Pressing Ctrl+V anywhere on the report triggers Google Sheets import
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim().length > 0) {
        e.preventDefault();
        setPasteRawText(text);
        setIsPasteModalOpen(true);
        onShowToast?.('📋 បានចាប់យកទិន្នន័យពី Clipboard សម្រាប់ Google Sheets!', 'info');
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  // Keyboard Shortcuts for Sales & Product Ledger: Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is actively typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (!cmdOrCtrl) return;

      const key = e.key.toLowerCase();

      // Undo: Ctrl+Z (without shift)
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Redo: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Shift+Z)
      else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Refresh data from storage on mount and subscribe to real-time Cloud updates
  useEffect(() => {
    setRows(StorageService.getReportRows());
    setExpenses(StorageService.getExpenses());
    setPosSales(StorageService.getSales());

    // Real-time Cloud listeners across Chrome, Firefox, Netlify, and Mobile
    const unsubRows = StorageService.subscribeToReportRows((cloudRows) => {
      setRows(cloudRows || []);
    });

    const unsubExpenses = StorageService.subscribeToExpenses((cloudExpenses) => {
      const nextCloud = cloudExpenses || [];
      setExpenses((prev) => {
        if (dirtyExpenseIdsRef.current.size === 0) {
          return nextCloud;
        }
        const prevMap = new Map(prev.map((item) => [item.id, item]));
        return nextCloud.map((cloudItem) =>
          dirtyExpenseIdsRef.current.has(cloudItem.id) && prevMap.has(cloudItem.id)
            ? prevMap.get(cloudItem.id)!
            : cloudItem
        );
      });
    });

    const unsubSales = StorageService.subscribeToSales((cloudSales) => {
      setPosSales(cloudSales);
    });

    return () => {
      unsubRows();
      unsubExpenses();
      unsubSales();
      Object.values(expenseSaveTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // ================= CALCULATIONS (EXACT FORMULAS) =================
  // 1. Total Cost: =SUMIFS(C:C, B:B, V1), where V1 = "Product"
  const totalCost = useMemo(() => {
    return rows
      .filter((r) => r.category.trim().toLowerCase() === 'product')
      .reduce((sum, r) => sum + (Number(r.buyIn) || 0), 0);
  }, [rows]);

  // 2. Total Price: =SUMIFS(E:E, B:B, W1) + SUMIFS(D:D, B:B, V1), W1="Steam offline", V1="Product"
  const totalPrice = useMemo(() => {
    const steamOfflineProfit = rows
      .filter((r) => r.category.trim().toLowerCase().includes('steam'))
      .reduce((sum, r) => sum + (Number(r.profit) || 0), 0);

    const productSellOut = rows
      .filter((r) => r.category.trim().toLowerCase() === 'product')
      .reduce((sum, r) => sum + (Number(r.sellOut) || 0), 0);

    const accountProfit = rows
      .filter((r) => r.category.trim().toLowerCase().includes('account'))
      .reduce((sum, r) => sum + (Number(r.profit) || 0), 0);

    return steamOfflineProfit + productSellOut + accountProfit;
  }, [rows]);

  // 3. Total Profit: =SUM(E:E)
  const totalProfit = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.profit) || 0), 0);
  }, [rows]);

  // 4. Total Expense: =SUM(R:R)
  const totalExpense = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.price) || 0), 0);
  }, [expenses]);

  // 5. Total Profit After Expense: =U3 - U5 (or Total Price / Profit - Expense)
  const totalProfitAfterExpense = useMemo(() => {
    return totalPrice - totalExpense;
  }, [totalPrice, totalExpense]);

  // Days in selected month
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedYear, selectedMonth]);

  // Daily sums map: { "1-Nov-2026": sum(profit) }
  const dailyProfitMap = useMemo(() => {
    const map: Record<string, number> = {};
    const curMonthStr = monthNames[selectedMonth];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${d}-${curMonthStr}-${selectedYear}`;
      const daySum = rows
        .filter((r) => r.date.trim().toLowerCase() === dateKey.toLowerCase())
        .reduce((sum, r) => sum + (Number(r.profit) || 0), 0);
      map[dateKey] = daySum;
    }
    return map;
  }, [rows, selectedYear, selectedMonth, daysInMonth]);

  // Calendar Weeks Chunk (7 days per row)
  const calendarWeeks = useMemo(() => {
    const curMonthStr = monthNames[selectedMonth];
    const weeks: Array<Array<{ day: number; dateStr: string; profit: number }>> = [];
    let currentWeek: Array<{ day: number; dateStr: string; profit: number }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${d}-${curMonthStr}-${selectedYear}`;
      currentWeek.push({
        day: d,
        dateStr,
        profit: dailyProfitMap[dateStr] || 0,
      });

      if (currentWeek.length === 7 || d === daysInMonth) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    return weeks;
  }, [dailyProfitMap, selectedMonth, selectedYear, daysInMonth]);

  // Filtered displayed rows
  const displayedRows = useMemo(() => {
    return rows.filter((r) => {
      // Source filter
      if (filterSource === 'pos' && r.source !== 'pos') return false;
      if (filterSource === 'manual' && r.source === 'pos') return false;

      // Category filter
      if (categoryFilter !== 'all' && r.category.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.gameName.toLowerCase().includes(q);
        const matchesCategory = r.category.toLowerCase().includes(q);
        const matchesReceipt = r.receiptNo?.toLowerCase().includes(q);
        const matchesDate = r.date.toLowerCase().includes(q);
        return matchesName || matchesCategory || matchesReceipt || matchesDate;
      }
      return true;
    });
  }, [rows, filterSource, categoryFilter, searchQuery]);

  // Count POS vs Manual
  const posRowCount = useMemo(() => rows.filter((r) => r.source === 'pos').length, [rows]);
  const manualRowCount = useMemo(() => rows.filter((r) => r.source !== 'pos').length, [rows]);

  // ================= POS SYNC ACTIONS =================
  const handleSyncPos = (mode: 'merge' | 'rebuild_all' = 'merge') => {
    const res = StorageService.syncReportWithPosSales(mode);
    setRows(StorageService.getReportRows());
    setPosSales(StorageService.getSales());

    if (res.addedCount > 0) {
      onShowToast?.(
        `⚡ ធ្វើសមកាលកម្មទិន្នន័យបានជោគជ័យ! បញ្ចូល ${res.addedCount} មុខទំនិញពី POS Transactions!`,
        'success'
      );
    } else {
      onShowToast?.('ទិន្នន័យ Report បានភ្ជាប់និង Update ជាមួយ POS Transactions រួចរាល់ហើយ!', 'info');
    }
  };

  // Inspect POS Sale receipt
  const handleInspectReceipt = (receiptNo?: string, saleId?: string) => {
    if (!receiptNo && !saleId) return;
    const found = posSales.find((s) => s.receiptNo === receiptNo || s.id === saleId);
    if (found) {
      setInspectedSale(found);
    } else {
      onShowToast?.(`រកមិនឃើញព័ត៌មានលម្អិតនៃវិក្កយបត្រ ${receiptNo || saleId}`, 'info');
    }
  };

  // ================= ROW ACTIONS =================
  const handleStartEditRow = (row: DailyReportRow) => {
    setEditingRowId(row.id);
    setEditForm({ ...row });
    setActiveFormula(`Row ${row.gameName}: Profit = Sell-out ($${row.sellOut}) - Buy-in ($${row.buyIn})`);
  };

  const handleSaveEditRow = (id: string) => {
    if (!editForm.gameName?.trim()) return;
    pushUndoSnapshot(rows);
    StorageService.updateReportRow(id, editForm);
    setRows(StorageService.getReportRows());
    setEditingRowId(null);
    setEditForm({});
    onShowToast?.('បានកែប្រែទិន្នន័យជោគជ័យ!', 'success');
  };

  const handleDeleteRow = async (id: string) => {
    pushUndoSnapshot(rows);
    await StorageService.deleteReportRow(id);
    setRows(StorageService.getReportRows());
    onShowToast?.('បានលុបទិន្នន័យរួចរាល់', 'info');
  };

  const handleClearManualRows = async () => {
    if (!window.confirm(`តើអ្នកពិតជាចង់លុបទិន្នន័យ Manual ទាំង ${manualRowCount} មែនទេ? (វានឹងមិនលេចឡើងមកវិញទេ)`)) {
      return;
    }
    pushUndoSnapshot(rows);
    await StorageService.clearManualReportRows();
    const posOnly = StorageService.getReportRows();
    setRows(posOnly);
    onShowToast?.(`បានលុបទិន្នន័យ Manual ទាំង ${manualRowCount} រួចរាល់! វានឹងមិនលេចឡើងមកវិញទេ`, 'success');
  };

  const handleClearAllRows = async () => {
    if (!window.confirm('តើអ្នកពិតជាចង់លុបទិន្នន័យទាំងអស់ក្នុង Report នេះមែនទេ? (វានឹងមិនលេចឡើងមកវិញទេ)')) {
      return;
    }
    pushUndoSnapshot(rows);
    await StorageService.clearAllReportRows();
    setRows([]);
    onShowToast?.('បានលុបទិន្នន័យទាំងអស់រួចរាល់! វានឹងមិនលេចឡើងមកវិញទេ', 'success');
  };

  const handleCreateRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;

    pushUndoSnapshot(rows);
    const buyIn = parseFloat(newBuyIn) || 0;
    const sellOut = parseFloat(newSellOut) || 0;

    const created = StorageService.addReportRow({
      gameName: newGameName.trim(),
      category: newCategory,
      buyIn,
      sellOut,
      profit: sellOut - buyIn,
      date: newDate,
      source: 'manual',
    });

    setRows(StorageService.getReportRows());
    setNewGameName('');
    setNewBuyIn('0');
    setNewSellOut('5.00');
    setIsAddingRow(false);
    onShowToast?.(`បានបញ្ចូល ${created.gameName} ទៅក្នុង Report ជោគជ័យ!`, 'success');
  };

  // ================= EXPENSE ACTIONS =================
  const flushExpenseUpdate = (id: string, updates: Partial<ExpenseItem>) => {
    StorageService.updateExpense(id, updates);
    setTimeout(() => {
      dirtyExpenseIdsRef.current.delete(id);
    }, 500);
  };

  const handleUpdateExpensePrice = (id: string, priceStr: string) => {
    dirtyExpenseIdsRef.current.add(id);
    setExpensePriceDrafts((prev) => ({ ...prev, [id]: priceStr }));
    const val = parseFloat(priceStr);
    const numericVal = isNaN(val) ? 0 : val;

    setExpenses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, price: numericVal } : item))
    );

    if (expenseSaveTimersRef.current[`price_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`price_${id}`]);
    }
    expenseSaveTimersRef.current[`price_${id}`] = setTimeout(() => {
      delete expenseSaveTimersRef.current[`price_${id}`];
      flushExpenseUpdate(id, { price: numericVal });
    }, 350);
  };

  const handleBlurExpensePrice = (id: string) => {
    const draft = expensePriceDrafts[id];
    if (expenseSaveTimersRef.current[`price_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`price_${id}`]);
      delete expenseSaveTimersRef.current[`price_${id}`];
    }
    if (draft !== undefined) {
      const parsed = parseFloat(draft);
      const numericVal = isNaN(parsed) ? 0 : parsed;
      flushExpenseUpdate(id, { price: numericVal });
      setExpensePriceDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleUpdateExpenseName = (id: string, nameStr: string) => {
    dirtyExpenseIdsRef.current.add(id);
    setExpenseNameDrafts((prev) => ({ ...prev, [id]: nameStr }));
    setExpenses((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: nameStr } : item))
    );

    if (expenseSaveTimersRef.current[`name_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`name_${id}`]);
    }
    expenseSaveTimersRef.current[`name_${id}`] = setTimeout(() => {
      const trimmed = nameStr.trim();
      if (trimmed) {
        flushExpenseUpdate(id, { name: trimmed });
      }
    }, 450);
  };

  const handleBlurExpenseName = (id: string, fallbackName: string) => {
    const draft = expenseNameDrafts[id];
    if (expenseSaveTimersRef.current[`name_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`name_${id}`]);
      delete expenseSaveTimersRef.current[`name_${id}`];
    }
    if (draft !== undefined) {
      const finalName = draft.trim() || fallbackName || 'Expense';
      setExpenses((prev) =>
        prev.map((item) => (item.id === id ? { ...item, name: finalName } : item))
      );
      flushExpenseUpdate(id, { name: finalName });
      setExpenseNameDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleAddExpenseItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpenseName.trim()) return;
    const p = parseFloat(newExpensePrice) || 0;
    StorageService.addExpense({ name: newExpenseName.trim(), price: p });
    setExpenses(StorageService.getExpenses());
    setNewExpenseName('');
    setNewExpensePrice('0');
    setIsAddingExpense(false);
    onShowToast?.('បានបន្ថែមចំណាយថ្មី និង Sync ទៅ Cloud ជោគជ័យ!', 'success');
  };

  const handleDeleteExpense = (id: string) => {
    if (expenseSaveTimersRef.current[`price_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`price_${id}`]);
    }
    if (expenseSaveTimersRef.current[`name_${id}`]) {
      clearTimeout(expenseSaveTimersRef.current[`name_${id}`]);
    }
    dirtyExpenseIdsRef.current.delete(id);
    StorageService.deleteExpense(id);
    setExpenses(StorageService.getExpenses());
    onShowToast?.('បានលុបចំណាយរួចរាល់', 'info');
  };

  // Export Live Ledger to CSV
  const handleExportCsv = () => {
    let csv = 'Game Name,Category,Buy-in,Sell-out,Profit,Date,Source,ReceiptNo\n';
    rows.forEach((r) => {
      csv += `"${r.gameName}","${r.category}",${r.buyIn},${r.sellOut},${r.profit},"${r.date}","${r.source || 'manual'}","${r.receiptNo || ''}"\n`;
    });
    csv += '\nExpense Item,Price\n';
    expenses.forEach((e) => {
      csv += `"${e.name}",${e.price}\n`;
    });
    csv += `\nTotal Cost,${totalCost}\nTotal Price,${totalPrice}\nTotal Profit,${totalProfit}\nTotal Expense,${totalExpense}\nTotal Profit After Expense,${totalProfitAfterExpense}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Kani_Game_Financial_Report_${fullMonthNames[selectedMonth]}_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast?.('💾 បានទាញយក CSV File ជោគជ័យ!', 'success');
  };

  // Copy all displayed rows to clipboard in Google Sheets TSV format
  const handleCopyForGoogleSheets = () => {
    if (displayedRows.length === 0) {
      onShowToast?.('គ្មានទិន្នន័យសម្រាប់ចម្លងទេ', 'info');
      return;
    }
    const headers = ['Game Name', 'Category', 'Buy-in', 'Sell-out', 'Profit', 'Date'];
    const lines = [
      headers.join('\t'),
      ...displayedRows.map((r) =>
        [
          r.gameName,
          r.category,
          r.buyIn.toFixed(2),
          r.sellOut.toFixed(2),
          r.profit.toFixed(2),
          r.date,
        ].join('\t')
      ),
    ];
    const tsv = lines.join('\n');
    navigator.clipboard
      .writeText(tsv)
      .then(() => {
        onShowToast?.(
          `📋 បានចម្លង ${displayedRows.length} ជួរដេកសម្រាប់ Google Sheets! (ចុច Ctrl+V លើ Sheets ដើម្បីបិទភ្ជាប់)`,
          'success'
        );
      })
      .catch(() => {
        onShowToast?.('មិនអាចចម្លងទៅ Clipboard បានទេ', 'error');
      });
  };

  // Copy single row in TSV format
  const handleCopySingleRow = (row: DailyReportRow) => {
    const tsv = [
      row.gameName,
      row.category,
      row.buyIn.toFixed(2),
      row.sellOut.toFixed(2),
      row.profit.toFixed(2),
      row.date,
    ].join('\t');

    navigator.clipboard
      .writeText(tsv)
      .then(() => {
        onShowToast?.(`📋 បានចម្លង "${row.gameName}" សម្រាប់ Google Sheets!`, 'success');
      })
      .catch(() => {
        onShowToast?.('មិនអាចចម្លងបានទេ', 'error');
      });
  };

  // Try reading clipboard automatically when opening paste modal
  const handleOpenPasteModal = async () => {
    setIsPasteModalOpen(true);
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().length > 0) {
          setPasteRawText(text);
          onShowToast?.('📋 បានទាញទិន្នន័យពី Clipboard ចូលរួចរាល់!', 'info');
        }
      }
    } catch {
      // Ignore clipboard permission errors; user can paste manually via Ctrl+V into textarea
    }
  };

  // Execute import from Google Sheets
  const handleExecuteImportSheets = () => {
    const validRows = parsedSheetsData.rows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      onShowToast?.('មិនមានទិន្នន័យត្រឹមត្រូវសម្រាប់បញ្ចូលទេ', 'error');
      return;
    }

    pushUndoSnapshot(rows);

    if (pasteImportMode === 'replace') {
      if (
        !window.confirm(
          `តើអ្នកពិតជាចង់ជំនួសទិន្នន័យ Manual ទាំងអស់ដោយ ${validRows.length} ជួរដេកថ្មីនេះមែនទេ?`
        )
      ) {
        return;
      }
      StorageService.replaceManualReportRows(validRows);
    } else {
      StorageService.addMultipleReportRows(validRows);
    }

    setRows(StorageService.getReportRows());
    setIsPasteModalOpen(false);
    setPasteRawText('');
    onShowToast?.(
      `✅ បានបញ្ចូល ${validRows.length} ជួរដេកពី Google Sheets ជោគជ័យ!`,
      'success'
    );
  };

  return (
    <div className={`bg-[#0b0f19] border border-emerald-900/40 rounded-2xl shadow-2xl overflow-hidden text-gray-100 flex flex-col my-4 ${sizeConfig.containerClass} ${sizeConfig.tableText}`}>
      {/* 1. GOOGLE SHEETS HEADER BAR (Authentic Dark Emerald Green) */}
      <div className="bg-[#11241a] border-b border-emerald-800/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Left: Table Title & POS Live Status */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
            <i className="fa-solid fa-table-cells text-base"></i>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-orbitron font-extrabold text-sm sm:text-base text-emerald-300 tracking-wider">
                Table3_11
              </span>
              <span className="text-[10px] bg-emerald-950/90 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/40 font-mono font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                POS LIVE SYNC
              </span>
              <span className="text-[10px] bg-cyan-950/80 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30 font-mono">
                {posSales.length} POS Sales ({posRowCount} items)
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-rajdhani">
              Daily Sales, Costs &amp; Profit Report • Data dynamically linked with POS Transactions
            </p>
          </div>
        </div>

        {/* Center: Month Selector & 4 Text Size Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-[#0d1c14] px-2.5 py-1 rounded-xl border border-emerald-900/60 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 0) {
                  setSelectedMonth(11);
                  setSelectedYear((y) => y - 1);
                } else {
                  setSelectedMonth((m) => m - 1);
                }
              }}
              className="w-6 h-6 rounded hover:bg-emerald-800/40 text-emerald-300 flex items-center justify-center transition cursor-pointer"
              title="Previous Month"
            >
              <i className="fa-solid fa-chevron-left text-[10px]"></i>
            </button>

            <span className="font-orbitron font-bold text-white px-2">
              {fullMonthNames[selectedMonth]} {selectedYear}
            </span>

            <button
              type="button"
              onClick={() => {
                if (selectedMonth === 11) {
                  setSelectedMonth(0);
                  setSelectedYear((y) => y + 1);
                } else {
                  setSelectedMonth((m) => m + 1);
                }
              }}
              className="w-6 h-6 rounded hover:bg-emerald-800/40 text-emerald-300 flex items-center justify-center transition cursor-pointer"
              title="Next Month"
            >
              <i className="fa-solid fa-chevron-right text-[10px]"></i>
            </button>
          </div>

          {/* 4 Text Size Switcher */}
          <div className="flex items-center gap-1 bg-[#09150e] p-1 rounded-xl border border-emerald-800/60 shadow-inner">
            <span className="text-[11px] font-rajdhani uppercase font-bold text-emerald-300 px-1.5 flex items-center gap-1 select-none">
              <i className="fa-solid fa-text-height text-emerald-400 text-xs"></i>
              <span className="hidden md:inline">Text Size:</span>
            </span>

            <div className="flex items-center gap-0.5 bg-[#0d1c14] p-0.5 rounded-lg border border-emerald-900/60">
              <button
                type="button"
                onClick={() => handleSetTextSize('sm')}
                className={`px-2 py-1 rounded text-xs font-rajdhani font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  textSize === 'sm'
                    ? 'bg-emerald-600 text-white shadow-md font-extrabold ring-1 ring-emerald-300'
                    : 'text-gray-400 hover:text-white hover:bg-emerald-900/40'
                }`}
                title="1. Small Text (11px) - Compact view for dense rows"
              >
                <span className="text-[10px] font-mono leading-none">A</span>
                <span>Small</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTextSize('md')}
                className={`px-2 py-1 rounded text-xs font-rajdhani font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  textSize === 'md'
                    ? 'bg-emerald-600 text-white shadow-md font-extrabold ring-1 ring-emerald-300'
                    : 'text-gray-400 hover:text-white hover:bg-emerald-900/40'
                }`}
                title="2. Normal Text (13px) - Default Google Sheets size"
              >
                <span className="text-xs font-mono font-medium leading-none">A</span>
                <span>Normal</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTextSize('lg')}
                className={`px-2 py-1 rounded text-xs font-rajdhani font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  textSize === 'lg'
                    ? 'bg-emerald-600 text-white shadow-md font-extrabold ring-1 ring-emerald-300'
                    : 'text-gray-400 hover:text-white hover:bg-emerald-900/40'
                }`}
                title="3. Large Text (15px) - Enhanced legibility for desktop & tablets"
              >
                <span className="text-sm font-mono font-bold leading-none">A</span>
                <span>Large</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTextSize('xl')}
                className={`px-2 py-1 rounded text-xs font-rajdhani font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  textSize === 'xl'
                    ? 'bg-emerald-600 text-white shadow-md font-extrabold ring-1 ring-emerald-300'
                    : 'text-gray-400 hover:text-white hover:bg-emerald-900/40'
                }`}
                title="4. Extra Large Text (17px) - Perfect for 34-inch ultrawide monitors and big screens"
              >
                <span className="text-base font-mono font-black leading-none">A</span>
                <span>XL</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Actions (POS Sync, Add Row, Export, Close) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* POS Re-sync button */}
          <button
            type="button"
            onClick={() => handleSyncPos('merge')}
            className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Pull and synchronize latest sales from POS Cashier"
          >
            <i className="fa-solid fa-rotate text-[11px] animate-spin-hover"></i>
            <span>Sync POS</span>
          </button>

          {/* Add Row Button */}
          <button
            type="button"
            onClick={() => setIsAddingRow(true)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <i className="fa-solid fa-plus text-[11px]"></i>
            <span>Add Row</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 border border-emerald-900/50 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
            title="Export CSV"
          >
            <i className="fa-solid fa-file-csv text-emerald-400"></i>
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
              title="Close Report"
            >
              <i className="fa-solid fa-xmark text-sm"></i>
            </button>
          )}
        </div>
      </div>

      {/* 2. FORMULA BAR (Exact Google Sheets Formula Display) */}
      <div className={`bg-[#0f1d16] border-b border-emerald-900/40 px-4 py-2 flex items-center gap-3 ${sizeConfig.formulaText} font-mono`}>
        <span className="font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800/60 select-none">
          fx
        </span>
        <div className="flex-1 bg-[#09130e] text-emerald-200 px-3 py-1.5 rounded border border-emerald-900/80 truncate shadow-inner">
          {activeFormula}
        </div>
        <span className="text-[10px] text-gray-400 hidden md:inline">
          Click any cell or total to display formula
        </span>
        <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 shrink-0">
          Size: {sizeConfig.label} ({sizeConfig.pxLabel})
        </span>
      </div>

      {/* 3. REPORT SUMMARY CARDS (Top Overview Bar) */}
      <div className="p-4 sm:p-5 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Total Cost */}
          <div
            onClick={() =>
              setActiveFormula(
                '=SUMIFS(C:C, B:B, "Product") -> Sum of column C (Buy-in) where column B is Product'
              )
            }
            className="bg-[#131b2e] border border-gray-800 rounded-xl p-3 cursor-pointer hover:border-sky-500/60 transition group shadow-sm"
          >
            <div className={`flex items-center justify-between ${sizeConfig.cardTitle} text-gray-400 uppercase font-bold`}>
              <span>Total cost</span>
              <span className="font-mono text-[9px] text-sky-400 bg-sky-950/80 px-1 rounded">
                =SUMIFS(C:C, B:B, V1)
              </span>
            </div>
            <div className={`${sizeConfig.cardValue} font-orbitron font-extrabold text-white mt-1`}>
              ${totalCost.toFixed(2)}
            </div>
            <p className={`${sizeConfig.cardSub} text-gray-400 mt-0.5`}>
              Buy-in Cost for Products
            </p>
          </div>

          {/* Total Price */}
          <div
            onClick={() =>
              setActiveFormula(
                '=SUMIFS(E:E, B:B, "Steam offline") + SUMIFS(D:D, B:B, "Product") + Account Profit'
              )
            }
            className="bg-[#131b2e] border border-gray-800 rounded-xl p-3 cursor-pointer hover:border-cyan-500/60 transition group shadow-sm"
          >
            <div className={`flex items-center justify-between ${sizeConfig.cardTitle} text-gray-400 uppercase font-bold`}>
              <span>Total price</span>
              <span className="font-mono text-[9px] text-cyan-400 bg-cyan-950/80 px-1 rounded">
                =Steam + Product
              </span>
            </div>
            <div className={`${sizeConfig.cardValue} font-orbitron font-extrabold text-cyan-400 mt-1`}>
              ${totalPrice.toFixed(2)}
            </div>
            <p className={`${sizeConfig.cardSub} text-gray-400 mt-0.5`}>
              Gross Revenue Base
            </p>
          </div>

          {/* Total Profit */}
          <div
            onClick={() => setActiveFormula('=SUM(E:E) -> Sum of column E (Profit)')}
            className="bg-[#131b2e] border border-blue-500/30 rounded-xl p-3 cursor-pointer hover:border-blue-400 transition group shadow-sm"
          >
            <div className={`flex items-center justify-between ${sizeConfig.cardTitle} text-blue-300 uppercase font-bold`}>
              <span>Total profit</span>
              <span className="font-mono text-[9px] text-blue-400 bg-blue-950/80 px-1 rounded">
                =SUM(E:E)
              </span>
            </div>
            <div className={`${sizeConfig.cardValue} font-orbitron font-extrabold text-blue-400 mt-1`}>
              ${totalProfit.toFixed(2)}
            </div>
            <p className={`${sizeConfig.cardSub} text-gray-400 mt-0.5`}>
              Overall Gross Profit
            </p>
          </div>

          {/* Total Expense */}
          <div
            onClick={() => setActiveFormula('=SUM(R:R) -> Sum of column R (Expense Prices)')}
            className="bg-[#131b2e] border border-gray-800 rounded-xl p-3 cursor-pointer hover:border-rose-500/60 transition group shadow-sm"
          >
            <div className={`flex items-center justify-between ${sizeConfig.cardTitle} text-gray-400 uppercase font-bold`}>
              <span>Total Expense</span>
              <span className="font-mono text-[9px] text-rose-400 bg-rose-950/80 px-1 rounded">
                =SUM(R:R)
              </span>
            </div>
            <div className={`${sizeConfig.cardValue} font-orbitron font-extrabold text-rose-300 mt-1`}>
              ${totalExpense.toFixed(2)}
            </div>
            <p className={`${sizeConfig.cardSub} text-gray-400 mt-0.5`}>
              Monthly Operational Costs
            </p>
          </div>

          {/* Total Profit After Expense */}
          <div
            onClick={() => setActiveFormula('=U3 - U5 -> Total price minus Total Expense')}
            className="bg-[#131b2e] border border-emerald-500/40 rounded-xl p-3 cursor-pointer hover:border-emerald-400 transition group shadow-[0_0_20px_rgba(16,185,129,0.15)] col-span-2 sm:col-span-1"
          >
            <div className={`flex items-center justify-between ${sizeConfig.cardTitle} text-emerald-300 uppercase font-bold`}>
              <span>Profit After Expense</span>
              <span className="font-mono text-[9px] text-emerald-400 bg-emerald-950/80 px-1 rounded">
                =U3 - U5
              </span>
            </div>
            <div className={`${sizeConfig.cardValue} font-orbitron font-extrabold text-emerald-400 mt-1`}>
              ${totalProfitAfterExpense.toFixed(2)}
            </div>
            <p className={`${sizeConfig.cardSub} text-gray-400 mt-0.5`}>
              Final Remaining Net Profit
            </p>
          </div>
        </div>

        {/* 4. SPREADSHEET SECTIONS:
            TOP: Sales & Product Ledger (Cols A - F)
            UNDER: Total Every Day (Cols I - O), Expense (Cols Q - R), and Total (Cols T - U)
        */}
        <div className="space-y-6">
          {/* ================= TOP: SALES & PRODUCT LEDGER (A-F) ================= */}
          <div className="w-full bg-[#0f1422] rounded-xl border border-gray-800 overflow-hidden shadow-lg flex flex-col">
            {/* Table Header Bar with Filter Tabs and Search */}
            <div className="bg-[#1b4332] text-white p-3 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <i className="fa-solid fa-list-check text-emerald-300"></i>
                <span className="font-bold text-xs uppercase tracking-wider">
                  Sales &amp; Product Ledger (Cols A - F)
                </span>
                <span className="text-[10px] font-mono bg-emerald-950 px-2 py-0.5 rounded text-emerald-200">
                  {displayedRows.length} of {rows.length}
                </span>

                {/* Undo (Ctrl+Z) Button */}
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoCount === 0}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                    undoCount > 0
                      ? 'bg-[#122b1d] hover:bg-[#1a3d2a] text-emerald-300 border-emerald-500/60 hover:text-white'
                      : 'bg-[#101b15]/60 text-gray-500 border-emerald-950/40 cursor-not-allowed opacity-50'
                  }`}
                  title="Undo last action on Ledger (Ctrl+Z)"
                >
                  <i className="fa-solid fa-rotate-left text-[11px]"></i>
                  <span>Undo</span>
                  <span className="text-[10px] font-mono text-emerald-400/80 hidden sm:inline">Ctrl+Z</span>
                  {undoCount > 0 && (
                    <span className="bg-emerald-950 text-emerald-300 text-[9px] px-1.5 py-0.2 rounded-full font-mono border border-emerald-500/40">
                      {undoCount}
                    </span>
                  )}
                </button>

                {/* Redo (Ctrl+Y) Button */}
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={redoCount === 0}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                    redoCount > 0
                      ? 'bg-[#102430] hover:bg-[#173648] text-cyan-300 border-cyan-500/60 hover:text-white'
                      : 'bg-[#101b15]/60 text-gray-500 border-emerald-950/40 cursor-not-allowed opacity-50'
                  }`}
                  title="Redo action on Ledger (Ctrl+Y or Ctrl+Shift+Z)"
                >
                  <i className="fa-solid fa-rotate-right text-[11px]"></i>
                  <span>Redo</span>
                  <span className="text-[10px] font-mono text-cyan-400/80 hidden sm:inline">Ctrl+Y</span>
                  {redoCount > 0 && (
                    <span className="bg-cyan-950 text-cyan-300 text-[9px] px-1.5 py-0.2 rounded-full font-mono border border-cyan-500/40">
                      {redoCount}
                    </span>
                  )}
                </button>

                {/* Google Sheets Paste Button */}
                <button
                  type="button"
                  onClick={handleOpenPasteModal}
                  className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-400/50 text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer ml-1"
                  title="Paste rows from Google Sheets or Excel (Ctrl+V)"
                >
                  <i className="fa-solid fa-paste text-[11px] text-emerald-200"></i>
                  <span>Paste Sheets (Ctrl+V)</span>
                </button>

                {/* Google Sheets Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyForGoogleSheets}
                  className="px-2.5 py-1 rounded-lg bg-[#0e2418] hover:bg-[#163826] text-emerald-300 border border-emerald-600/50 text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  title="Copy all rows formatted for Google Sheets (Cols A - F)"
                >
                  <i className="fa-regular fa-copy text-[11px] text-emerald-300"></i>
                  <span>Copy for Sheets</span>
                </button>
              </div>

              {/* Search box inside table */}
              <div className="relative min-w-[160px] max-w-[220px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter name, receipt, date..."
                  className="w-full bg-[#122319] text-xs text-white pl-7 pr-2.5 py-1 rounded-lg border border-emerald-700/50 outline-none placeholder-emerald-300/50"
                />
                <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px]"></i>
              </div>
            </div>

            {/* Quick Filter Sub-bar */}
            <div className="bg-[#14231b] px-3 py-2 border-b border-emerald-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              {/* Source Filters */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Source:</span>
                <button
                  type="button"
                  onClick={() => setFilterSource('all')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                    filterSource === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#182a20] text-gray-300 hover:text-white'
                  }`}
                >
                  All ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSource('pos')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition flex items-center gap-1 ${
                    filterSource === 'pos'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-[#182a20] text-cyan-300 hover:text-white'
                  }`}
                >
                  <i className="fa-solid fa-cash-register text-[9px]"></i>
                  <span>POS Sales ({posRowCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilterSource('manual')}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                    filterSource === 'manual'
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#182a20] text-purple-300 hover:text-white'
                  }`}
                >
                  Manual ({manualRowCount})
                </button>

                {/* Delete all manual rows action */}
                {manualRowCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearManualRows}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/50 cursor-pointer transition flex items-center gap-1 ml-1"
                    title="Delete all manual entries permanently (will not auto-restore)"
                  >
                    <i className="fa-solid fa-trash-can text-[9px]"></i>
                    <span>Delete Manual ({manualRowCount})</span>
                  </button>
                )}

                {/* Clear all rows action */}
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllRows}
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950/70 hover:bg-red-900 text-red-300 border border-red-800/50 cursor-pointer transition flex items-center gap-1 ml-1"
                    title="Clear all rows from report permanently"
                  >
                    <i className="fa-solid fa-trash-can text-[9px]"></i>
                    <span>Clear All ({rows.length})</span>
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 uppercase font-semibold">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="bg-[#122319] text-[11px] text-gray-200 border border-emerald-700/40 rounded px-2 py-0.5 outline-none"
                >
                  <option value="all">All Categories</option>
                  <option value="Product">Product</option>
                  <option value="Steam offline">Steam offline</option>
                  <option value="Account">Account</option>
                </select>
              </div>
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className={`w-full text-left border-collapse ${sizeConfig.tableText}`}>
                <thead>
                  <tr className={`bg-[#121c16] text-emerald-200 uppercase font-mono ${sizeConfig.tableHeader} border-b border-emerald-900/60 sticky top-0 z-10`}>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx}`}>Game / Item Name</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx}`}>Category</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right`}>Buy-in</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right`}>Sell-out</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right`}>Profit</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx}`}>Date</th>
                    <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-center w-10`}>Act</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 font-sans">
                  {displayedRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400">
                        {rows.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-2">
                            <span>មិនទាន់មានទិន្នន័យប្រតិបត្តិការទេ (No transactions recorded).</span>
                            <span className="text-xs text-gray-500">អ្នកអាចលក់ទំនិញតាម POS ឬចុច &quot;+ បន្ថែមទំនិញ&quot; ឬ Paste ពី Google Sheets</span>
                            <button
                              type="button"
                              onClick={() => {
                                const reset = StorageService.resetReportRowsToDefault();
                                setRows(reset);
                                onShowToast?.('បានទាញយកទិន្នន័យគំរូដើមទាំង 16 ជួរដេកមកវិញជោគជ័យ!', 'success');
                              }}
                              className="mt-2 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1.5"
                            >
                              <i className="fa-solid fa-rotate-left text-xs"></i>
                              <span>Restore Sample Data (16 Initial Rows)</span>
                            </button>
                          </div>
                        ) : (
                          'No items match the active filters or search query.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    displayedRows.map((row) => {
                      const isEditing = editingRowId === row.id;
                      const catStyle =
                        CATEGORY_STYLES[row.category] || {
                          bg: 'bg-purple-950/60',
                          text: 'text-purple-300',
                          border: 'border-purple-500/30',
                        };

                      return (
                        <tr
                          key={row.id}
                          onClick={() =>
                            setActiveFormula(
                              `=SellOut(${row.sellOut}) - BuyIn(${row.buyIn}) = Profit($${row.profit.toFixed(
                                2
                              )}) • [${row.category}] • Date: ${row.date}${
                                row.receiptNo ? ` • POS Receipt #${row.receiptNo}` : ''
                              }`
                            )
                          }
                          className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                        >
                          {/* Game Name & POS Badge */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} font-semibold text-gray-100 max-w-[200px]`}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.gameName || ''}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    gameName: e.target.value,
                                  }))
                                }
                                className={`w-full bg-[#131b2e] text-white px-2 py-1 rounded border border-emerald-500 ${sizeConfig.tableText}`}
                              />
                            ) : (
                              <div className="flex flex-col">
                                <span className="truncate">{row.gameName}</span>
                                {row.source === 'pos' && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInspectReceipt(row.receiptNo, row.posSaleId);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/30 font-mono text-[9px] hover:bg-cyan-900/80 cursor-pointer"
                                      title="Inspect POS receipt details"
                                    >
                                      <i className="fa-solid fa-receipt text-[8px]"></i>
                                      <span>{row.receiptNo || 'POS Sale'}</span>
                                    </button>
                                    {row.quantity && row.quantity > 1 && (
                                      <span className="text-[9px] font-mono text-gray-400">
                                        Qty: {row.quantity}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Category with distinct pill badge */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} whitespace-nowrap`}>
                            {isEditing ? (
                              <select
                                value={editForm.category || 'Product'}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    category: e.target.value,
                                  }))
                                }
                                className={`bg-[#131b2e] text-white px-1.5 py-1 rounded border border-emerald-500 ${sizeConfig.tableText}`}
                              >
                                <option value="Product">Product</option>
                                <option value="Steam offline">Steam offline</option>
                                <option value="Account">Account</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-block rounded-full font-bold tracking-wider border ${catStyle.bg} ${catStyle.text} ${catStyle.border} ${sizeConfig.badgeText}`}
                              >
                                {row.category}
                              </span>
                            )}
                          </td>

                          {/* Buy-in (Auto = 0, but user can input) */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right font-mono text-gray-300 whitespace-nowrap ${sizeConfig.monoText}`}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.5"
                                value={editForm.buyIn ?? 0}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    buyIn: parseFloat(e.target.value) || 0,
                                  }))
                                }
                                className={`w-16 bg-[#131b2e] text-right text-white px-1 py-1 rounded border border-emerald-500 ${sizeConfig.tableText}`}
                              />
                            ) : (
                              `$${(row.buyIn || 0).toFixed(2)}`
                            )}
                          </td>

                          {/* Sell-out */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right font-mono text-cyan-300 font-semibold whitespace-nowrap ${sizeConfig.monoText}`}>
                            {isEditing ? (
                              <input
                                type="number"
                                step="0.5"
                                value={editForm.sellOut ?? 0}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    sellOut: parseFloat(e.target.value) || 0,
                                  }))
                                }
                                className={`w-16 bg-[#131b2e] text-right text-white px-1 py-1 rounded border border-emerald-500 ${sizeConfig.tableText}`}
                              />
                            ) : (
                              `$${(row.sellOut || 0).toFixed(2)}`
                            )}
                          </td>

                          {/* Profit */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right font-mono text-emerald-400 font-bold whitespace-nowrap ${sizeConfig.monoText}`}>
                            ${row.profit.toFixed(2)}
                          </td>

                          {/* Date */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} font-mono text-gray-400 whitespace-nowrap ${sizeConfig.monoText}`}>
                            {isEditing ? (
                              <input
                                type="text"
                                value={editForm.date || ''}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    date: e.target.value,
                                  }))
                                }
                                className={`w-24 bg-[#131b2e] text-white px-1 py-1 rounded border border-emerald-500 font-mono ${sizeConfig.tableText}`}
                              />
                            ) : (
                              row.date
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-center whitespace-nowrap`}>
                            {isEditing ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditRow(row.id)}
                                  className="w-6 h-6 rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center cursor-pointer"
                                  title="Save"
                                >
                                  <i className="fa-solid fa-check text-[10px]"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRowId(null)}
                                  className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center cursor-pointer"
                                  title="Cancel"
                                >
                                  <i className="fa-solid fa-xmark text-[10px]"></i>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopySingleRow(row);
                                  }}
                                  className="w-6 h-6 rounded hover:bg-emerald-950/70 text-gray-400 hover:text-emerald-300 flex items-center justify-center cursor-pointer"
                                  title="Copy row for Google Sheets (Cols A - F)"
                                >
                                  <i className="fa-regular fa-copy text-[10px]"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartEditRow(row);
                                  }}
                                  className="w-6 h-6 rounded hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
                                  title="Edit Row"
                                >
                                  <i className="fa-solid fa-pen text-[10px]"></i>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRow(row.id);
                                  }}
                                  className="w-6 h-6 rounded hover:bg-red-950/60 text-gray-400 hover:text-red-400 flex items-center justify-center cursor-pointer"
                                  title="Delete Row"
                                >
                                  <i className="fa-solid fa-trash-can text-[10px]"></i>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ================= UNDER LEDGER: TOTAL EVERY DAY ON LEFT (Cols I - O), EXPENSE & TOTAL ON RIGHT (Cols Q - R, T - U) ================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* LEFT: TOTAL EVERY DAY 7-DAY CALENDAR MATRIX (Cols I - O) */}
            <div className="xl:col-span-7 2xl:col-span-7 bg-[#0f1422] rounded-xl border border-gray-800 overflow-hidden shadow-lg">
              <div className="bg-[#1b4332] text-white px-4 py-2.5 flex items-center justify-between font-bold text-xs uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <i className="fa-regular fa-calendar-days text-emerald-300"></i>
                  <span>Total every day (Cols I - O)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-200 bg-emerald-950 px-2 py-0.5 rounded">
                  =SUMIFS(E2:E1000, F2:F1000, I2)
                </span>
              </div>

              <div className="p-3 overflow-x-auto">
                <table className={`w-full text-center border-collapse ${sizeConfig.tableText}`}>
                  <tbody>
                    {calendarWeeks.map((week, wIdx) => {
                      return (
                        <React.Fragment key={wIdx}>
                          {/* Row 1: Date Labels */}
                          <tr className={`bg-[#121c16] text-gray-300 font-mono ${sizeConfig.tableHeader} border-t border-gray-800`}>
                            {week.map((item, dIdx) => (
                              <td
                                key={dIdx}
                                className={`${sizeConfig.cellPy} px-1 border border-gray-800/60 font-semibold`}
                              >
                                {item.dateStr}
                              </td>
                            ))}
                            {/* Fill empty cells if last week < 7 */}
                            {Array.from({ length: 7 - week.length }).map((_, i) => (
                              <td
                                key={`empty_h_${i}`}
                                className={`${sizeConfig.cellPy} px-1 border border-gray-800/40 bg-gray-900/30 text-gray-600`}
                              >
                                -
                              </td>
                            ))}
                          </tr>

                          {/* Row 2: Daily Sum Values with Highlighting */}
                          <tr className={`font-mono ${sizeConfig.monoText} border-b border-gray-800`}>
                            {week.map((item, dIdx) => {
                              const hasRevenue = item.profit > 0;
                              // Matching screenshot visual style
                              const isBlueHighlight = item.profit >= 50;
                              const isPinkHighlight = item.profit > 0 && item.profit < 50;

                              const bgClass = isBlueHighlight
                                ? 'bg-blue-600 text-white font-extrabold shadow-inner'
                                : isPinkHighlight
                                ? 'bg-rose-900/40 text-rose-200 font-bold'
                                : 'bg-[#0d1320] text-gray-400';

                              return (
                                <td
                                  key={dIdx}
                                  onClick={() =>
                                    setActiveFormula(
                                      `=SUMIFS(E2:E1000, F2:F1000, "${item.dateStr}") = $${item.profit.toFixed(2)}`
                                    )
                                  }
                                  className={`${sizeConfig.cellPy} px-1 border border-gray-800/80 transition-all cursor-pointer hover:ring-1 hover:ring-emerald-400 ${bgClass}`}
                                >
                                  {hasRevenue ? `$${item.profit.toFixed(2)}` : '$0.00'}
                                </td>
                              );
                            })}
                            {Array.from({ length: 7 - week.length }).map((_, i) => (
                              <td
                                key={`empty_v_${i}`}
                                className="py-2.5 px-1 border border-gray-800/40 bg-gray-900/20 text-gray-600"
                              >
                                -
                              </td>
                            ))}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* RIGHT SIDE: EXPENSE (Cols Q - R) & TOTAL (Cols T - U) */}
            <div className="xl:col-span-5 2xl:col-span-5 space-y-5">
              {/* ===== EXPENSE TABLE (Cols Q - R) ===== */}
              <div className="bg-[#0f1422] rounded-xl border border-gray-800 overflow-hidden shadow-lg flex flex-col">
                <div className="bg-[#1b4332] text-white px-3 py-2 flex items-center justify-between font-bold text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-receipt text-emerald-300 text-xs"></i>
                    <span>Expense (Cols Q - R)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingExpense(true)}
                    className="w-5 h-5 rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-[10px] cursor-pointer"
                    title="Add Expense Item"
                  >
                    <i className="fa-solid fa-plus"></i>
                  </button>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className={`w-full text-left border-collapse ${sizeConfig.tableText}`}>
                    <thead>
                      <tr className={`bg-[#121c16] text-emerald-200 uppercase font-mono ${sizeConfig.tableHeader} border-b border-gray-800`}>
                        <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx}`}>Item</th>
                        <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right`}>Price</th>
                        <th className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-center w-8`}></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 font-sans">
                      {expenses.map((exp) => (
                        <tr
                          key={exp.id}
                          onClick={() => setActiveFormula(`Expense Item: ${exp.name} = $${exp.price.toFixed(2)}`)}
                          className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                        >
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} font-medium text-gray-300`}>
                            <input
                              type="text"
                              value={expenseNameDrafts[exp.id] !== undefined ? expenseNameDrafts[exp.id] : exp.name}
                              onChange={(e) => handleUpdateExpenseName(exp.id, e.target.value)}
                              onBlur={() => handleBlurExpenseName(exp.id, exp.name)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full bg-transparent text-gray-300 font-medium focus:bg-[#141b2c] focus:px-1.5 py-0.5 rounded border border-transparent focus:border-emerald-500/60 outline-none"
                            />
                          </td>
                          <td className={`${sizeConfig.cellPy} ${sizeConfig.cellPx} text-right font-mono`}>
                            <input
                              type="number"
                              step="any"
                              value={
                                expensePriceDrafts[exp.id] !== undefined
                                  ? expensePriceDrafts[exp.id]
                                  : exp.price
                                  ? String(exp.price)
                                  : ''
                              }
                              placeholder="0.00"
                              onChange={(e) =>
                                handleUpdateExpensePrice(exp.id, e.target.value)
                              }
                              onBlur={() => handleBlurExpensePrice(exp.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  (e.currentTarget as HTMLInputElement).blur();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={`w-20 bg-[#141b2c] text-right text-rose-300 px-1.5 py-0.5 rounded border border-gray-700 focus:border-rose-500 outline-none ${sizeConfig.monoText}`}
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteExpense(exp.id);
                              }}
                              className="text-gray-500 hover:text-red-400 opacity-40 group-hover:opacity-100 transition cursor-pointer"
                            >
                              <i className="fa-solid fa-trash text-[10px]"></i>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ===== TOTAL SUMMARY ROWS (Cols T - U) ===== */}
              <div className="bg-[#0f1422] rounded-xl border border-gray-800 overflow-hidden shadow-lg flex flex-col">
                <div className="bg-[#1b4332] text-white px-3 py-2 flex items-center justify-between font-bold text-xs uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                    <i className="fa-solid fa-calculator text-emerald-300 text-xs"></i>
                    <span>Total (Cols T - U)</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-200">
                    Formulas
                  </span>
                </div>

                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  {/* Row 1: Total Cost */}
                  <div
                    onClick={() => setActiveFormula('=SUMIFS(C:C, B:B, "Product")')}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#141b2c] hover:bg-white/[0.04] transition cursor-pointer border border-gray-800"
                  >
                    <div>
                      <span className={`font-bold ${sizeConfig.totalTitle} text-gray-300`}>Total cost</span>
                      <p className="text-[9px] text-gray-500 font-mono">
                        =SUMIFS(C:C, B:B, V1)
                      </p>
                    </div>
                    <span className={`font-orbitron font-bold ${sizeConfig.totalText} text-white`}>
                      ${totalCost.toFixed(2)}
                    </span>
                  </div>

                  {/* Row 2: Total Price */}
                  <div
                    onClick={() =>
                      setActiveFormula(
                        '=SUMIFS(E:E, B:B, "Steam offline") + SUMIFS(D:D, B:B, "Product")'
                      )
                    }
                    className="flex items-center justify-between p-2 rounded-lg bg-[#141b2c] hover:bg-white/[0.04] transition cursor-pointer border border-gray-800"
                  >
                    <div>
                      <span className={`font-bold ${sizeConfig.totalTitle} text-gray-300`}>Total price</span>
                      <p className="text-[9px] text-gray-500 font-mono">
                        =Steam profit + Product sell
                      </p>
                    </div>
                    <span className={`font-orbitron font-bold ${sizeConfig.totalText} text-cyan-300`}>
                      ${totalPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Row 3: Total Profit */}
                  <div
                    onClick={() => setActiveFormula('=SUM(E:E)')}
                    className="flex items-center justify-between p-2 rounded-lg bg-blue-950/40 hover:bg-blue-950/60 transition cursor-pointer border border-blue-500/30"
                  >
                    <div>
                      <span className={`font-bold ${sizeConfig.totalTitle} text-blue-300`}>Total profit</span>
                      <p className="text-[9px] text-blue-400 font-mono">=SUM(E:E)</p>
                    </div>
                    <span className={`font-orbitron font-extrabold ${sizeConfig.totalText} text-blue-400`}>
                      ${totalProfit.toFixed(2)}
                    </span>
                  </div>

                  {/* Row 4: Total Expense */}
                  <div
                    onClick={() => setActiveFormula('=SUM(R:R)')}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#141b2c] hover:bg-white/[0.04] transition cursor-pointer border border-gray-800"
                  >
                    <div>
                      <span className={`font-bold ${sizeConfig.totalTitle} text-gray-300`}>Total Expense</span>
                      <p className="text-[9px] text-gray-500 font-mono">=SUM(R:R)</p>
                    </div>
                    <span className={`font-orbitron font-bold ${sizeConfig.totalText} text-rose-300`}>
                      ${totalExpense.toFixed(2)}
                    </span>
                  </div>

                  {/* Row 5: Total Profit After Expense */}
                  <div
                    onClick={() => setActiveFormula('=U3 - U5')}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-950/70 transition cursor-pointer border border-emerald-500/40"
                  >
                    <div>
                      <span className={`font-bold ${sizeConfig.totalTitle} text-emerald-300`}>
                        Total Profit After Expense
                      </span>
                      <p className="text-[9px] text-emerald-400 font-mono">=U3 - U5</p>
                    </div>
                    <span className={`font-orbitron font-extrabold ${sizeConfig.totalText} text-emerald-400`}>
                      ${totalProfitAfterExpense.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= MODAL: PASTE FROM GOOGLE SHEETS / EXCEL ================= */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#0c121e] rounded-2xl border border-emerald-500/50 max-w-4xl w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[92vh] my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-800 gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shrink-0">
                  <i className="fa-solid fa-file-excel text-lg"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-base sm:text-lg text-white flex items-center gap-2">
                    <span>Paste from Google Sheets / Excel</span>
                    <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                      Cols A - F
                    </span>
                  </h4>
                  <p className="text-xs text-gray-400 font-rajdhani mt-0.5">
                    Copy cells from your spreadsheet (Ctrl+C) and paste here (Ctrl+V). Tab-separated and CSV values are supported.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPasteModalOpen(false);
                  setPasteRawText('');
                }}
                className="w-8 h-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <i className="fa-solid fa-xmark text-sm"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Import Options Sub-bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#111927] p-3 rounded-xl border border-gray-800">
                {/* Import Mode */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-300 uppercase tracking-wider mb-1.5">
                    Import Mode:
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-xs text-gray-200 cursor-pointer bg-[#0c131f] px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-emerald-500/60">
                      <input
                        type="radio"
                        name="importMode"
                        checked={pasteImportMode === 'append'}
                        onChange={() => setPasteImportMode('append')}
                        className="accent-emerald-500"
                      />
                      <span>Append to Existing Ledger</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-200 cursor-pointer bg-[#0c131f] px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-rose-500/60">
                      <input
                        type="radio"
                        name="importMode"
                        checked={pasteImportMode === 'replace'}
                        onChange={() => setPasteImportMode('replace')}
                        className="accent-rose-500"
                      />
                      <span>Replace All Manual Rows</span>
                    </label>
                  </div>
                </div>

                {/* Default Category */}
                <div>
                  <label className="block text-[11px] font-bold text-emerald-300 uppercase tracking-wider mb-1.5">
                    Default Category (If not in sheet):
                  </label>
                  <select
                    value={pasteDefaultCategory}
                    onChange={(e) => setPasteDefaultCategory(e.target.value as ReportCategory)}
                    className="w-full bg-[#0c131f] text-xs text-white px-3 py-1.5 rounded-lg border border-gray-700 focus:border-emerald-500 outline-none"
                  >
                    <option value="Steam offline">Steam offline (Cols A-F)</option>
                    <option value="Product">Product (Accessories / Hardware)</option>
                    <option value="Account">Account (Steam / Epic Games)</option>
                  </select>
                </div>
              </div>

              {/* Paste Box Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <i className="fa-regular fa-clipboard text-emerald-400"></i>
                    <span>Paste Raw Text / Spreadsheet Data:</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          if (navigator.clipboard?.readText) {
                            const text = await navigator.clipboard.readText();
                            if (text) setPasteRawText(text);
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <i className="fa-solid fa-paste"></i>
                      <span>Paste from Clipboard</span>
                    </button>
                    {pasteRawText && (
                      <button
                        type="button"
                        onClick={() => setPasteRawText('')}
                        className="text-[11px] text-gray-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                      >
                        <i className="fa-solid fa-eraser"></i>
                        <span>Clear</span>
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  value={pasteRawText}
                  onChange={(e) => setPasteRawText(e.target.value)}
                  placeholder={`Paste cells directly from Google Sheets here (Ctrl+V)...\n\nExample format (Tab or Comma separated):\nGod of War Ragnarok\tSteam offline\t0.00\t1.50\t1.50\t1-Nov-2026\nCyberpunk 2077\tSteam offline\t0.00\t2.00\t2.00\t1-Nov-2026\nExternal HDD 1TB\tProduct\t35.00\t45.00\t10.00\t1-Nov-2026`}
                  rows={6}
                  className="w-full bg-[#080d15] text-xs font-mono text-gray-200 p-3 rounded-xl border border-gray-700 focus:border-emerald-500 outline-none placeholder-gray-600"
                />
              </div>

              {/* Parse Status & Live Statistics */}
              {pasteRawText.trim() && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#091510] border border-emerald-900/60 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-300 flex items-center gap-1">
                        <i className="fa-solid fa-circle-check text-emerald-400"></i>
                        <span>
                          {parsedSheetsData.rows.filter((r) => r.isValid).length} Valid Rows Detected
                        </span>
                      </span>
                      {parsedSheetsData.hasHeader && (
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-700/40">
                          Header row auto-excluded
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-gray-400">
                        Buy-in:{' '}
                        <strong className="text-white">
                          $
                          {parsedSheetsData.rows
                            .reduce((sum, r) => sum + r.buyIn, 0)
                            .toFixed(2)}
                        </strong>
                      </span>
                      <span className="text-gray-400">
                        Sell-out:{' '}
                        <strong className="text-cyan-300">
                          $
                          {parsedSheetsData.rows
                            .reduce((sum, r) => sum + r.sellOut, 0)
                            .toFixed(2)}
                        </strong>
                      </span>
                      <span className="text-gray-400">
                        Profit:{' '}
                        <strong className="text-emerald-400">
                          $
                          {parsedSheetsData.rows
                            .reduce((sum, r) => sum + r.profit, 0)
                            .toFixed(2)}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-gray-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#101b2b] text-gray-300 uppercase text-[10px] font-mono sticky top-0 border-b border-gray-800">
                        <tr>
                          <th className="py-1.5 px-2.5">#</th>
                          <th className="py-1.5 px-2.5">Game Name (Col A)</th>
                          <th className="py-1.5 px-2.5">Category (Col B)</th>
                          <th className="py-1.5 px-2.5 text-right">Buy-in (Col C)</th>
                          <th className="py-1.5 px-2.5 text-right">Sell-out (Col D)</th>
                          <th className="py-1.5 px-2.5 text-right">Profit (Col E)</th>
                          <th className="py-1.5 px-2.5">Date (Col F)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60 font-sans">
                        {parsedSheetsData.rows.map((pRow, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-white/[0.03] transition-colors ${
                              !pRow.isValid ? 'bg-rose-950/20 text-rose-300' : ''
                            }`}
                          >
                            <td className="py-1.5 px-2.5 font-mono text-[10px] text-gray-500">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2.5 font-semibold text-gray-200">
                              {pRow.gameName}
                            </td>
                            <td className="py-1.5 px-2.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                                  CATEGORY_STYLES[pRow.category]?.bg || 'bg-gray-800'
                                } ${
                                  CATEGORY_STYLES[pRow.category]?.text || 'text-gray-300'
                                } ${
                                  CATEGORY_STYLES[pRow.category]?.border || 'border-gray-700'
                                }`}
                              >
                                {pRow.category}
                              </span>
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-gray-400">
                              ${pRow.buyIn.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-cyan-300 font-semibold">
                              ${pRow.sellOut.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono text-emerald-400 font-bold">
                              ${pRow.profit.toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2.5 font-mono text-gray-400 text-[11px]">
                              {pRow.date}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400 font-rajdhani">
                Tip: You can select multiple rows in Google Sheets, press Ctrl+C, then paste here!
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasteModalOpen(false);
                    setPasteRawText('');
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImportSheets}
                  disabled={parsedSheetsData.rows.filter((r) => r.isValid).length === 0}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-orbitron font-bold transition shadow-lg cursor-pointer flex items-center gap-2"
                >
                  <i className="fa-solid fa-cloud-arrow-down"></i>
                  <span>
                    Import {parsedSheetsData.rows.filter((r) => r.isValid).length} Rows into Ledger
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD CUSTOM ROW ================= */}
      {isAddingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-emerald-500/40 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <h4 className="font-orbitron font-bold text-base text-white">
                Add Transaction Row (Cols A-F)
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingRow(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleCreateRow} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Item / Game Name (Col A) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Controller CM619 White, External 500G"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2 border border-gray-700 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Category (Col B) *
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ReportCategory)}
                    className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3 py-2 border border-gray-700 outline-none focus:border-emerald-500"
                  >
                    <option value="Product">Product</option>
                    <option value="Steam offline">Steam offline</option>
                    <option value="Account">Account</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Date (Col F) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    placeholder="1-Nov-2026"
                    className="w-full bg-[#131b2e] text-xs font-mono text-white rounded-xl px-3 py-2 border border-gray-700 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-emerald-400 mb-1 flex items-center justify-between">
                    <span>Buy-in (Col C)</span>
                    <span className="text-[10px] text-gray-400 font-normal">Auto = $0.00</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newBuyIn}
                      onChange={(e) => setNewBuyIn(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#131b2e] text-xs font-mono text-white rounded-xl pl-7 pr-3 py-2 border border-gray-700 outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-cyan-400 mb-1">
                    Sell-out (Col D) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400 font-mono text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={newSellOut}
                      onChange={(e) => setNewSellOut(e.target.value)}
                      placeholder="5.00"
                      className="w-full bg-[#131b2e] text-xs font-mono text-white rounded-xl pl-7 pr-3 py-2 border border-gray-700 outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 font-mono flex items-center justify-between">
                <span>Calculated Profit (Col E):</span>
                <span className="font-bold text-sm text-emerald-400">
                  ${((parseFloat(newSellOut) || 0) - (parseFloat(newBuyIn) || 0)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingRow(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-orbitron font-bold text-xs shadow-md cursor-pointer"
                >
                  Insert Row
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD EXPENSE ================= */}
      {isAddingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f172a] rounded-2xl border border-rose-500/40 max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <h4 className="font-orbitron font-bold text-base text-white">
                Add Expense Item (Cols Q-R)
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingExpense(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <form onSubmit={handleAddExpenseItem} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Expense Name (Col Q) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank, MND, Internet, EDC"
                  value={newExpenseName}
                  onChange={(e) => setNewExpenseName(e.target.value)}
                  className="w-full bg-[#131b2e] text-xs text-white rounded-xl px-3.5 py-2 border border-gray-700 outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-rose-400 mb-1">
                  Cost / Price (Col R) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-xs">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newExpensePrice}
                    onChange={(e) => setNewExpensePrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-[#131b2e] text-xs font-mono text-white rounded-xl pl-7 pr-3 py-2 border border-gray-700 outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingExpense(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-gray-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-orbitron font-bold text-xs shadow-md cursor-pointer"
                >
                  Add Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: INSPECT POS SALE RECORD ================= */}
      {inspectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-[#0f172a] rounded-2xl border border-cyan-500/50 max-w-lg w-full p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <i className="fa-solid fa-receipt"></i>
                </div>
                <div>
                  <h4 className="font-orbitron font-bold text-sm text-white">
                    POS RECEIPT #{inspectedSale.receiptNo}
                  </h4>
                  <p className="text-[11px] text-gray-400 font-mono">
                    {new Date(inspectedSale.date).toLocaleString()} • Cashier: {inspectedSale.cashierName || 'Kani Cashier'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedSale(null)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Sale details */}
            <div className="space-y-3">
              <div className="bg-[#121c2e] p-3 rounded-xl border border-gray-800 flex items-center justify-between text-xs">
                <span className="text-gray-400">Payment Method:</span>
                <span className="font-mono font-bold text-cyan-300 uppercase">
                  {inspectedSale.paymentMethod}
                </span>
              </div>

              <div className="border border-gray-800 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-800/80 text-gray-300 font-mono text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-2 text-center">Qty</th>
                      <th className="py-2 px-2 text-right">Unit</th>
                      <th className="py-2 px-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 font-mono">
                    {inspectedSale.items.map((item, idx) => (
                      <tr key={idx} className="text-gray-200">
                        <td className="py-2 px-3 font-sans">{item.name}</td>
                        <td className="py-2 px-2 text-center text-gray-400">{item.quantity}</td>
                        <td className="py-2 px-2 text-right text-gray-400">${item.unitPrice.toFixed(2)}</td>
                        <td className="py-2 px-3 text-right text-cyan-300 font-bold">${item.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-[#131b2e] p-3 rounded-xl border border-cyan-500/30 flex items-center justify-between text-xs font-mono">
                <span className="text-gray-300">Total Billed:</span>
                <span className="text-base font-orbitron font-extrabold text-cyan-400">
                  ${inspectedSale.totalUsd.toFixed(2)} ({inspectedSale.totalKhr.toLocaleString()} ៛)
                </span>
              </div>

              {inspectedSale.customerName && (
                <p className="text-[11px] text-gray-400">
                  Customer: <span className="text-white font-semibold">{inspectedSale.customerName}</span>{' '}
                  {inspectedSale.customerPhone && `(${inspectedSale.customerPhone})`}
                </p>
              )}
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setInspectedSale(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
