import { ALL_INITIAL_GAMES, INITIAL_PRODUCTS } from '../data/initialGames';
import { Game, POSSaleRecord, SiteSettings, DailyReportRow, ExpenseItem, ReportCategory, ReportVersionSnapshot, UserAccount, UserAccountsConfig, UserRole, AdminAuth } from '../types/game';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, getDocs, query, orderBy, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

// Helper to remove undefined fields and convert NaN to 0 because Firestore rejects them
function cleanFirestoreDoc<T extends Record<string, any>>(obj: T): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'number') {
        cleaned[key] = isNaN(value) ? 0 : value;
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

// Guarantees all IDs strictly match Firestore rules regex '^[a-zA-Z0-9_\-]+$' and length <= 120
function sanitizeFirestoreId(id?: string): string {
  if (!id) return `id_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const clean = id.trim().replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 120);
  return clean || `id_${Date.now()}`;
}

// Atomic batch writes in chunks of up to 400 (Firestore max limit is 500)
async function atomicBatchSet(collName: string, items: Array<{ id: string; data: Record<string, any> }>): Promise<void> {
  if (items.length === 0) return;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(({ id, data }) => {
      const sanitizedId = sanitizeFirestoreId(id);
      batch.set(doc(db, collName, sanitizedId), cleanFirestoreDoc(data));
    });
    await batch.commit();
  }
}

// Atomic batch deletes in chunks of up to 400
async function atomicBatchDelete(collName: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      const sanitizedId = sanitizeFirestoreId(id);
      batch.delete(doc(db, collName, sanitizedId));
    });
    await batch.commit();
  }
}

// Mutex flags to prevent race condition when Firestore emits intermediate snapshots during large uploads
let isBatchWritingReportRows = false;
let isBatchWritingGames = false;
let isBatchWritingExpenses = false;

const STORAGE_KEY_GAMES = 'kanigame_catalog_v1';
const STORAGE_KEY_SETTINGS = 'kanigame_settings_v1';
const STORAGE_KEY_AUTH = 'kanigame_admin_auth_v1';
const STORAGE_KEY_CREDENTIALS = 'kanigame_admin_credentials_v1';
const STORAGE_KEY_USER_ACCOUNTS = 'kanigame_user_accounts_v2';
const STORAGE_KEY_POS_SALES = 'kanigame_pos_sales_v1';
const STORAGE_KEY_REPORT_ROWS = 'kanigame_report_rows_v2';
const STORAGE_KEY_REPORT_INITIALIZED = 'kanigame_report_initialized_v2';
const STORAGE_KEY_EXPENSES = 'kanigame_expenses_v2';
const STORAGE_KEY_EXPENSES_INITIALIZED = 'kanigame_expenses_initialized_v2';
const STORAGE_KEY_VERSION_HISTORY = 'kanigame_version_history_v1';

export const DEFAULT_SETTINGS: SiteSettings = {
  portalTitle: 'KANI GAME',
  portalSubtitle: 'Ultimate Gaming Portal',
  heroBadge: 'ជ្រើសរើស Game និងផ្ញើទៅកាន់ Telegram ដោយផ្ទាល់',
  heroTitle: 'SELECT MULTIPLE GAMES & REQUEST VIA TELEGRAM',
  heroDescription: 'សូមចុចប៊ូតុង "ជ្រើសរើស" ឬ Tick លើ Game ដែលអ្នកចង់បាន រួចចុចផ្ញើទៅកាន់ Admin តាមរយៈ Telegram ភ្លាមៗ!',
  telegramAdminHandle: '@kanigame168',
  telegramNotePlaceholder: 'ឧទាហរណ៍: Sokha - 012 345 678',
  khrExchangeRate: 4100,
  posCashierName: 'Kani Cashier',
};


export const DEFAULT_USER_ACCOUNTS: UserAccountsConfig = {
  admin: {
    id: 'admin',
    role: 'admin',
    username: 'admin',
    passwordHash: 'kanigame168',
    displayName: 'System Admin',
  },
  pos: {
    id: 'pos',
    role: 'pos',
    username: 'pos',
    passwordHash: 'kanipos168',
    displayName: 'POS Cashier',
  },
};

const DEFAULT_ADMIN = DEFAULT_USER_ACCOUNTS.admin;

export function formatReportDate(dateObj: Date = new Date()): string {
  const day = dateObj.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day}-${month}-${year}`;
}

export const INITIAL_REPORT_ROWS: DailyReportRow[] = [
  { id: 'rep_1', gameName: 'Mount & Blade II: Bannerlord', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '1-Nov-2026' },
  { id: 'rep_2', gameName: 'WWE 2k26', category: 'Product', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '1-Nov-2026' },
  { id: 'rep_3', gameName: 'FC26', category: 'Account', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '1-Nov-2026' },
  { id: 'rep_4', gameName: 'External 500G', category: 'Product', buyIn: 10.0, sellOut: 28.0, profit: 18.0, date: '1-Nov-2026' },
  { id: 'rep_5', gameName: 'Controller CM619 White', category: 'Product', buyIn: 11.0, sellOut: 20.0, profit: 9.0, date: '1-Nov-2026' },
  { id: 'rep_6', gameName: 'FC26', category: 'Account', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '1-Nov-2026' },
  { id: 'rep_7', gameName: 'Call of Duty: Modern Warfare', category: 'Account', buyIn: 0, sellOut: 15.0, profit: 15.0, date: '1-Nov-2026' },
  { id: 'rep_8', gameName: 'External 500G', category: 'Product', buyIn: 10.0, sellOut: 28.0, profit: 18.0, date: '2-Nov-2026' },
  { id: 'rep_9', gameName: 'Red Dead Redemption 2', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '2-Nov-2026' },
  { id: 'rep_10', gameName: 'Cyberpunk 2077', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '2-Nov-2026' },
  { id: 'rep_11', gameName: 'Black Myth: Wukong', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '3-Nov-2026' },
  { id: 'rep_12', gameName: 'Elden Ring', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '4-Nov-2026' },
  { id: 'rep_13', gameName: 'Controller CM619 Black', category: 'Product', buyIn: 11.0, sellOut: 20.0, profit: 9.0, date: '4-Nov-2026' },
  { id: 'rep_14', gameName: 'God of War Ragnarok', category: 'Steam offline', buyIn: 0, sellOut: 5.0, profit: 5.0, date: '5-Nov-2026' },
  { id: 'rep_15', gameName: 'External 1TB + Games', category: 'Product', buyIn: 18.0, sellOut: 45.0, profit: 27.0, date: '6-Nov-2026' },
  { id: 'rep_16', gameName: 'Gaming Headset RGB', category: 'Product', buyIn: 8.0, sellOut: 18.0, profit: 10.0, date: '6-Nov-2026' },
];

export const INITIAL_EXPENSES: ExpenseItem[] = [
  { id: 'exp_1', name: 'Bank', price: 0 },
  { id: 'exp_2', name: 'MND', price: 0 },
  { id: 'exp_3', name: 'EDC + EWP', price: 0 },
  { id: 'exp_4', name: 'Nuch', price: 0 },
  { id: 'exp_5', name: 'Internet', price: 0 },
];

// IndexedDB Dual-Layer Storage Engine for unlimited capacity (prevents QuotaExceededError on Netlify & mobile)
const IDB_NAME = 'kanigame_local_db_v1';
const IDB_STORE = 'app_keyval';

function openIDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: any): Promise<void> {
  try {
    const db = await openIDB();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {
    // Ignore safe errors
  }
}

// In-memory cache for ultra-fast access and memory persistence
let cachedGames: Game[] | null = null;
let cachedUserAccounts: UserAccountsConfig | null = null;

export const StorageService = {
  // Automatically merges latest games added to code (Google AI Studio / GitHub) with locally uploaded items on Netlify
  mergeWithLatestCodebase(existingGames: Game[]): Game[] {
    const existingIds = new Set(existingGames.map((g) => g.id));
    const existingNames = new Set(existingGames.map((g) => g.name.trim().toLowerCase()));

    const missingFromCodebase: Game[] = [];
    for (const codeGame of ALL_INITIAL_GAMES) {
      if (!existingIds.has(codeGame.id) && !existingNames.has(codeGame.name.trim().toLowerCase())) {
        missingFromCodebase.push(codeGame);
      }
    }

    if (missingFromCodebase.length === 0) {
      return existingGames;
    }

    // Preserve all existing custom uploads and seamlessly append any new games from codebase
    const merged = [...existingGames, ...missingFromCodebase];
    return merged;
  },

  getGames(): Game[] {
    if (cachedGames && cachedGames.length > 0) {
      return cachedGames;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEY_GAMES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Smart merge: ensure new games added to the git repository in Google AI are automatically
          // populated for users on Netlify, without losing any products they uploaded on Netlify!
          const merged = this.mergeWithLatestCodebase(parsed);
          cachedGames = merged;
          if (merged.length !== parsed.length) {
            this.saveGames(merged);
          }
          return merged;
        }
      }
    } catch (e) {
      console.error('Failed to load games from localStorage', e);
    }

    // Initialize with default 154+ games
    cachedGames = ALL_INITIAL_GAMES;
    this.saveGames(ALL_INITIAL_GAMES);
    return ALL_INITIAL_GAMES;
  },

  // Hydrate from IndexedDB in case localStorage was cleared or quota was restricted
  async initAsyncStorage(onHydrate?: (games: Game[]) => void): Promise<Game[]> {
    try {
      const idbData = await idbGet<Game[]>(STORAGE_KEY_GAMES);
      if (idbData && Array.isArray(idbData) && idbData.length > 0) {
        const merged = this.mergeWithLatestCodebase(idbData);
        cachedGames = merged;
        try {
          localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify(merged));
        } catch {
          // ignore
        }
        if (onHydrate) {
          onHydrate(merged);
        }
        return merged;
      }
    } catch (e) {
      console.warn('Error reading from IndexedDB:', e);
    }
    return this.getGames();
  },

  saveGames(games: Game[]): void {
    cachedGames = games;

    // 1. Dual persistence: Save to IndexedDB (virtually unlimited quota for high-res images)
    idbSet(STORAGE_KEY_GAMES, games).catch((err) => {
      console.warn('IndexedDB save warning:', err);
    });

    // 2. Synchronous save to localStorage with graceful fallback
    try {
      localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify(games));
    } catch (e) {
      console.warn('Storage quota warning on localStorage. Using IndexedDB + memory cache.', e);
      try {
        // Try saving without POS sales to free space
        localStorage.removeItem(STORAGE_KEY_POS_SALES);
        localStorage.setItem(STORAGE_KEY_GAMES, JSON.stringify(games));
      } catch (inner) {
        console.warn('Critical localStorage quota exceeded. Full catalog safely saved in IndexedDB & memory.', inner);
      }
    }
  },

  // Real-time Cloud Firestore Listener: Syncs across Chrome, Firefox, Netlify & Mobile
  subscribeToGames(callback: (games: Game[]) => void): () => void {
    const collRef = collection(db, 'games');
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const cloudGames: Game[] = [];
          snapshot.forEach((docSnap) => {
            cloudGames.push(docSnap.data() as Game);
          });
          // Merge cloud games with built-in codebase games to preserve defaults
          const merged = this.mergeWithLatestCodebase(cloudGames);

          // Prevent race condition: do not overwrite local state with fewer items during active batch upload
          if (isBatchWritingGames) {
            const localGames = this.getGames();
            if (localGames.length > merged.length) {
              return;
            }
          }

          cachedGames = merged;
          this.saveGames(merged);
          callback(merged);
        } else {
          // If Firestore is empty on first boot, seed it with ALL_INITIAL_GAMES
          ALL_INITIAL_GAMES.forEach((g) => {
            setDoc(doc(db, 'games', g.id), cleanFirestoreDoc(g)).catch(() => {});
          });
        }
      },
      (error) => {
        console.warn('Firestore real-time sync listener error, falling back to local cache:', error);
        handleFirestoreError(error, OperationType.GET, 'games');
      }
    );
    return unsubscribe;
  },

  addGame(game: Omit<Game, 'id'> & { id?: string }): Game {
    const games = this.getGames();
    const newId = sanitizeFirestoreId(
      game.id && !games.some(g => g.id === game.id) 
        ? game.id 
        : `game_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    );
    
    const newGame: Game = {
      ...game,
      id: newId,
      createdAt: game.createdAt || new Date().toISOString(),
    };

    const updated = [newGame, ...games];
    this.saveGames(updated);

    // Instant Cloud Firestore write: Chrome -> Cloud -> Firefox sync
    try {
      setDoc(doc(db, 'games', newGame.id), cleanFirestoreDoc(newGame)).catch((err) => {
        console.warn('Firestore addGame sync warning:', err);
      });
    } catch (err) {
      console.warn('Firestore addGame failed:', err);
    }

    return newGame;
  },

  addMultipleGames(newGames: (Omit<Game, 'id'> & { id?: string })[]): Game[] {
    const games = this.getGames();
    const now = Date.now();
    const created: Game[] = newGames.map((g, index) => {
      const cleanId = sanitizeFirestoreId(
        g.id && !games.some((item) => item.id === g.id)
          ? g.id
          : `game_${now}_${index}_${Math.random().toString(36).substring(2, 7)}`
      );
      return {
        ...g,
        id: cleanId,
        createdAt: g.createdAt || new Date().toISOString(),
      };
    });

    const updated = [...created, ...games];
    this.saveGames(updated);

    // Atomic Batch Cloud Firestore write to prevent partial dropped writes
    isBatchWritingGames = true;
    (async () => {
      try {
        const batchItems = created.map((g) => ({
          id: g.id,
          data: g,
        }));
        await atomicBatchSet('games', batchItems);
      } catch (err) {
        console.warn('Firestore addMultipleGames atomic batch failed:', err);
      } finally {
        setTimeout(() => {
          isBatchWritingGames = false;
        }, 800);
      }
    })();

    return created;
  },

  updateGame(updatedGame: Game): void {
    const games = this.getGames();
    const index = games.findIndex(g => g.id === updatedGame.id);
    if (index !== -1) {
      games[index] = { ...updatedGame };
      this.saveGames(games);

      try {
        setDoc(doc(db, 'games', updatedGame.id), cleanFirestoreDoc(updatedGame), { merge: true }).catch(() => {});
      } catch (err) {
        console.warn('Firestore updateGame failed:', err);
      }
    }
  },

  deleteGame(id: string): void {
    const games = this.getGames();
    const filtered = games.filter(g => g.id !== id);
    this.saveGames(filtered);

    try {
      deleteDoc(doc(db, 'games', id)).catch(() => {});
    } catch (err) {
      console.warn('Firestore deleteGame failed:', err);
    }
  },

  deleteMultipleGames(ids: string[]): void {
    const idSet = new Set(ids);
    const games = this.getGames();
    const filtered = games.filter(g => !idSet.has(g.id));
    this.saveGames(filtered);

    try {
      ids.forEach((id) => {
        deleteDoc(doc(db, 'games', id)).catch(() => {});
      });
    } catch (err) {
      console.warn('Firestore deleteMultipleGames failed:', err);
    }
  },

  resetToDefault(): Game[] {
    this.saveGames(ALL_INITIAL_GAMES);
    try {
      ALL_INITIAL_GAMES.forEach((g) => {
        setDoc(doc(db, 'games', g.id), cleanFirestoreDoc(g)).catch(() => {});
      });
    } catch (err) {
      console.warn('Firestore resetToDefault failed:', err);
    }
    return ALL_INITIAL_GAMES;
  },

  getSettings(): SiteSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (data) {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        if (parsed.telegramAdminHandle === '@kanigam168' || !parsed.telegramAdminHandle) {
          parsed.telegramAdminHandle = '@kanigame168';
        }
        return parsed;
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return DEFAULT_SETTINGS;
  },

  // Real-time Cloud Listener for Settings & KHQR: Syncs ABA KHQR and rates across Chrome, Firefox & POS
  subscribeToSettings(callback: (settings: SiteSettings) => void): () => void {
    const docRef = doc(db, 'settings', 'general');
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const cloudData = docSnap.data();
          const merged: SiteSettings = { ...DEFAULT_SETTINGS, ...cloudData };
          if (merged.telegramAdminHandle === '@kanigam168' || !merged.telegramAdminHandle) {
            merged.telegramAdminHandle = '@kanigame168';
          }
          try {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(merged));
            idbSet(STORAGE_KEY_SETTINGS, merged).catch(() => {});
          } catch {}
          callback(merged);
        } else {
          // If not in cloud yet, write default settings
          const current = this.getSettings();
          setDoc(docRef, cleanFirestoreDoc(current)).catch(() => {});
        }
      },
      (error) => {
        console.warn('Firestore settings listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'settings/general');
      }
    );
    return unsubscribe;
  },

  saveSettings(settings: SiteSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
      idbSet(STORAGE_KEY_SETTINGS, settings).catch(() => {});
      // Cloud Firestore sync
      setDoc(doc(db, 'settings', 'general'), cleanFirestoreDoc(settings)).catch((err) => {
        console.warn('Firestore saveSettings warning:', err);
      });
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  },

  // Safe fallback for legacy listeners
  subscribeToDeletedMeta(): () => void {
    return () => {};
  },

  // User Accounts & Authentication (Admin & POS Roles)
  getUserAccounts(): UserAccountsConfig {
    if (cachedUserAccounts) {
      return cachedUserAccounts;
    }
    try {
      const data = localStorage.getItem(STORAGE_KEY_USER_ACCOUNTS);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.admin && parsed.pos) {
          cachedUserAccounts = parsed;
          return parsed;
        }
      }
      // Check legacy credentials to preserve previous admin credentials
      const legacy = localStorage.getItem(STORAGE_KEY_CREDENTIALS);
      if (legacy) {
        const legacyParsed = JSON.parse(legacy);
        if (legacyParsed?.username && legacyParsed?.passwordHash) {
          const legacyAccounts: UserAccountsConfig = {
            admin: {
              ...DEFAULT_USER_ACCOUNTS.admin,
              username: legacyParsed.username,
              passwordHash: legacyParsed.passwordHash,
            },
            pos: { ...DEFAULT_USER_ACCOUNTS.pos },
          };
          cachedUserAccounts = legacyAccounts;
          return legacyAccounts;
        }
      }
    } catch (e) {
      console.error('Error reading user accounts', e);
    }
    cachedUserAccounts = DEFAULT_USER_ACCOUNTS;
    return DEFAULT_USER_ACCOUNTS;
  },

  saveUserAccounts(accounts: UserAccountsConfig): void {
    cachedUserAccounts = { ...accounts };
    try {
      localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(accounts));
      idbSet(STORAGE_KEY_USER_ACCOUNTS, accounts).catch(() => {});
      // Keep legacy credentials updated as well
      localStorage.setItem(
        STORAGE_KEY_CREDENTIALS,
        JSON.stringify({
          username: accounts.admin.username,
          passwordHash: accounts.admin.passwordHash,
        })
      );

      // Sync with Firestore doc /settings/userAccounts
      setDoc(doc(db, 'settings', 'userAccounts'), cleanFirestoreDoc(accounts)).catch((err) => {
        console.warn('Firestore userAccounts save warning:', err);
      });
    } catch (e) {
      console.error('Failed to save user accounts', e);
    }
  },

  subscribeToUserAccounts(callback: (accounts: UserAccountsConfig) => void): () => void {
    try {
      const docRef = doc(db, 'settings', 'userAccounts');
      const unsub = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as any;
            if (data?.admin?.passwordHash && data?.pos?.passwordHash) {
              const merged: UserAccountsConfig = {
                admin: { ...DEFAULT_USER_ACCOUNTS.admin, ...data.admin },
                pos: { ...DEFAULT_USER_ACCOUNTS.pos, ...data.pos },
              };
              cachedUserAccounts = merged;
              localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(merged));
              idbSet(STORAGE_KEY_USER_ACCOUNTS, merged).catch(() => {});
              callback(merged);
            }
          } else {
            // Seed cloud if doc does not exist yet
            const current = this.getUserAccounts();
            setDoc(docRef, cleanFirestoreDoc(current)).catch(() => {});
          }
        },
        (error) => {
          console.warn('Firestore userAccounts listener notice:', error);
        }
      );
      return unsub;
    } catch {
      return () => {};
    }
  },

  updateUserAccount(role: UserRole, username: string, passwordHash: string): boolean {
    try {
      const accounts = this.getUserAccounts();
      const cleanUser = username.trim();
      const cleanPass = passwordHash.trim();
      if (!cleanUser || !cleanPass) return false;

      if (role === 'admin') {
        accounts.admin = {
          ...accounts.admin,
          username: cleanUser,
          passwordHash: cleanPass,
          updatedAt: new Date().toISOString(),
        };
      } else {
        accounts.pos = {
          ...accounts.pos,
          username: cleanUser,
          passwordHash: cleanPass,
          updatedAt: new Date().toISOString(),
        };
      }

      this.saveUserAccounts(accounts);
      return true;
    } catch (e) {
      console.error('Failed to update user account', e);
      return false;
    }
  },

  // Backward compatibility
  getAdminCredentials() {
    return this.getUserAccounts().admin;
  },

  updateAdminCredentials(username: string, passwordHash: string): boolean {
    return this.updateUserAccount('admin', username, passwordHash);
  },

  // Helper: Verify credentials against a specific accounts object
  checkCredentials(
    username: string,
    pass: string,
    accounts: UserAccountsConfig
  ): { success: boolean; role?: UserRole; username?: string; displayName?: string; error?: string } {
    const inputUser = username.trim().toLowerCase();
    const inputPass = pass.trim();

    // 1. Check Admin Credentials
    const adminUser = accounts.admin.username.trim().toLowerCase();
    const isAdminUserMatch = !inputUser || inputUser === adminUser || inputUser === 'admin';
    if (isAdminUserMatch && inputPass === accounts.admin.passwordHash.trim()) {
      const auth: AdminAuth = {
        isAuthenticated: true,
        username: accounts.admin.username,
        role: 'admin',
        displayName: accounts.admin.displayName,
        token: `token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
      return {
        success: true,
        role: 'admin',
        username: accounts.admin.username,
        displayName: accounts.admin.displayName,
      };
    }

    // 2. Check POS Cashier Credentials
    const posUser = accounts.pos.username.trim().toLowerCase();
    const isPosUserMatch = inputUser === posUser || (!inputUser && inputPass === accounts.pos.passwordHash.trim());
    if (isPosUserMatch && inputPass === accounts.pos.passwordHash.trim()) {
      const auth: AdminAuth = {
        isAuthenticated: true,
        username: accounts.pos.username,
        role: 'pos',
        displayName: accounts.pos.displayName,
        token: `token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(auth));
      return {
        success: true,
        role: 'pos',
        username: accounts.pos.username,
        displayName: accounts.pos.displayName,
      };
    }

    return {
      success: false,
      error: 'Username ឬ Password មិនត្រឹមត្រូវទេ! (Incorrect username or password)',
    };
  },

  // Authenticate against Admin or POS user (checks local memory/storage first, falls back to direct Firestore fetch)
  async login(
    username: string,
    pass: string
  ): Promise<{ success: boolean; role?: UserRole; username?: string; displayName?: string; error?: string }> {
    // 1. Fast local verification
    const localAccounts = this.getUserAccounts();
    const localResult = this.checkCredentials(username, pass, localAccounts);
    if (localResult.success) {
      return localResult;
    }

    // 2. If local failed (e.g. password was changed on another device/tab), check Firestore directly
    try {
      const docRef = doc(db, 'settings', 'userAccounts');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const cloudData = snap.data() as any;
        if (cloudData?.admin?.passwordHash && cloudData?.pos?.passwordHash) {
          const freshAccounts: UserAccountsConfig = {
            admin: { ...DEFAULT_USER_ACCOUNTS.admin, ...cloudData.admin },
            pos: { ...DEFAULT_USER_ACCOUNTS.pos, ...cloudData.pos },
          };
          cachedUserAccounts = freshAccounts;
          localStorage.setItem(STORAGE_KEY_USER_ACCOUNTS, JSON.stringify(freshAccounts));
          idbSet(STORAGE_KEY_USER_ACCOUNTS, freshAccounts).catch(() => {});
          return this.checkCredentials(username, pass, freshAccounts);
        }
      }
    } catch (err) {
      console.warn('Firestore live login verification note:', err);
    }

    return localResult;
  },

  // Synchronous login helper if needed
  loginSync(
    username: string,
    pass: string
  ): { success: boolean; role?: UserRole; username?: string; displayName?: string; error?: string } {
    return this.checkCredentials(username, pass, this.getUserAccounts());
  },

  getAuthSession(): AdminAuth | null {
    try {
      const data = localStorage.getItem(STORAGE_KEY_AUTH);
      if (data) {
        const auth = JSON.parse(data);
        if (auth && auth.isAuthenticated) {
          return {
            ...auth,
            role: auth.role || 'admin', // default to admin for existing sessions
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  },

  getCurrentUserRole(): UserRole | null {
    const session = this.getAuthSession();
    return session?.role || null;
  },

  isAdmin(): boolean {
    return this.getCurrentUserRole() === 'admin';
  },

  isPosOnly(): boolean {
    return this.getCurrentUserRole() === 'pos';
  },

  isLoggedIn(): boolean {
    return !!this.getAuthSession()?.isAuthenticated;
  },

  logout(): void {
    localStorage.removeItem(STORAGE_KEY_AUTH);
  },

  // Pricing helper
  getGamePrice(game: Game): number {
    if (typeof game.price === 'number') {
      return game.price;
    }
    const tagLower = (game.tag || '').toLowerCase();
    if (tagLower.includes('free') || tagLower.includes('ថែម') || tagLower.includes('external')) {
      return 0;
    }
    // Default price is $5.00
    return 5.0;
  },

  // POS Sales Management
  getSales(): POSSaleRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_POS_SALES);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load POS sales', e);
    }
    return [];
  },

  // Real-time Cloud Listener for POS Sales: Syncs sales and cashier receipts across Chrome, Firefox & Mobile
  subscribeToSales(callback: (sales: POSSaleRecord[]) => void): () => void {
    const collRef = collection(db, 'sales');
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        const cloudSales: POSSaleRecord[] = [];
        snapshot.forEach((docSnap) => {
          cloudSales.push(docSnap.data() as POSSaleRecord);
        });
        // Sort newest first
        cloudSales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        try {
          localStorage.setItem(STORAGE_KEY_POS_SALES, JSON.stringify(cloudSales));
          idbSet(STORAGE_KEY_POS_SALES, cloudSales).catch(() => {});
        } catch {}
        callback(cloudSales);
      },
      (error) => {
        console.warn('Firestore sales listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'sales');
      }
    );
    return unsubscribe;
  },

  saveSale(sale: POSSaleRecord): void {
    try {
      const sales = this.getSales();
      const updated = [sale, ...sales];
      localStorage.setItem(STORAGE_KEY_POS_SALES, JSON.stringify(updated));
      idbSet(STORAGE_KEY_POS_SALES, updated).catch(() => {});

      // Sync sale to Firestore
      try {
        setDoc(doc(db, 'sales', sale.id), cleanFirestoreDoc(sale)).catch((err) => {
          console.warn('Firestore sale sync failed:', err);
        });
      } catch (err) {
        console.warn('Firestore sale sync failed:', err);
      }

      // Auto-populate into Daily Report table with POS transaction linkage
      try {
        const saleDate = formatReportDate(new Date(sale.date));
        const currentReportRows = this.getReportRows();
        const newRows: DailyReportRow[] = sale.items.map((item, idx) => {
          const tagLower = (item.tag || '').toLowerCase();
          let cat: ReportCategory = 'Product';
          if (tagLower.includes('steam')) {
            cat = 'Steam offline';
          } else if (tagLower.includes('account')) {
            cat = 'Account';
          } else if (tagLower.includes('product')) {
            cat = 'Product';
          }
          const sellOut = Number(item.subtotal) || 0;
          const unitCost = item.costPrice !== undefined ? Number(item.costPrice) : 0;
          const buyIn = unitCost * (item.quantity || 1);
          const profit = sellOut - buyIn;
          return {
            id: `pos_row_${sale.id}_${item.id}_${idx}`,
            gameName: item.name,
            category: cat,
            buyIn,
            sellOut,
            profit,
            date: saleDate,
            source: 'pos',
            posSaleId: sale.id,
            receiptNo: sale.receiptNo,
            quantity: item.quantity,
          };
        });
        const combined = [...newRows, ...currentReportRows];
        this.saveReportRows(combined);
      } catch (err) {
        console.warn('Auto-log sale to report warning:', err);
      }
    } catch (e) {
      console.error('Failed to save POS sale', e);
    }
  },

  deleteSale(id: string): void {
    try {
      const sales = this.getSales();
      const targetSale = sales.find((s) => s.id === id);
      const filtered = sales.filter((s) => s.id !== id);
      localStorage.setItem(STORAGE_KEY_POS_SALES, JSON.stringify(filtered));
      idbSet(STORAGE_KEY_POS_SALES, filtered).catch(() => {});

      // Delete from Firestore
      deleteDoc(doc(db, 'sales', id)).catch(() => {});

      // Void/remove corresponding rows from daily report
      const rows = this.getReportRows();
      const remainingRows = rows.filter(
        (r) => r.posSaleId !== id && (!targetSale || r.receiptNo !== targetSale.receiptNo)
      );
      this.saveReportRows(remainingRows);
    } catch (e) {
      console.error('Failed to delete sale', e);
    }
  },

  clearSales(): void {
    try {
      const sales = this.getSales();
      localStorage.removeItem(STORAGE_KEY_POS_SALES);
      idbSet(STORAGE_KEY_POS_SALES, []).catch(() => {});

      // Delete each sale doc from Firestore
      sales.forEach((s) => {
        deleteDoc(doc(db, 'sales', s.id)).catch(() => {});
      });

      // Remove all POS rows from report
      const rows = this.getReportRows();
      const posRows = rows.filter((r) => r.source === 'pos');
      posRows.forEach((r) => {
        deleteDoc(doc(db, 'reportRows', r.id)).catch(() => {});
      });
      const manualOnly = rows.filter((r) => r.source !== 'pos');
      this.saveReportRows(manualOnly);
    } catch (e) {
      console.error('Failed to clear sales', e);
    }
  },

  // Synchronize Daily Report directly with all POS Transactions
  syncReportWithPosSales(mode: 'merge' | 'rebuild_all' = 'merge'): {
    addedCount: number;
    totalRows: number;
  } {
    const sales = this.getSales();
    const currentRows = this.getReportRows();

    if (mode === 'rebuild_all') {
      const manualRows = currentRows.filter((r) => r.source !== 'pos');
      const posRows: DailyReportRow[] = [];

      sales.forEach((sale) => {
        const saleDate = formatReportDate(new Date(sale.date));
        sale.items.forEach((item, idx) => {
          const tagLower = (item.tag || '').toLowerCase();
          let cat: ReportCategory = 'Product';
          if (tagLower.includes('steam')) {
            cat = 'Steam offline';
          } else if (tagLower.includes('account')) {
            cat = 'Account';
          } else if (tagLower.includes('product')) {
            cat = 'Product';
          }
          const sellOut = Number(item.subtotal) || 0;
          const unitCost = item.costPrice !== undefined ? Number(item.costPrice) : 0;
          const buyIn = unitCost * (item.quantity || 1);
          const profit = sellOut - buyIn;

          posRows.push({
            id: `pos_row_${sale.id}_${item.id}_${idx}`,
            gameName: item.name,
            category: cat,
            buyIn,
            sellOut,
            profit,
            date: saleDate,
            source: 'pos',
            posSaleId: sale.id,
            receiptNo: sale.receiptNo,
            quantity: item.quantity,
          });
        });
      });

      const combined = [...posRows, ...manualRows];
      this.saveReportRows(combined);
      return { addedCount: posRows.length, totalRows: combined.length };
    }

    // Default 'merge' mode: find POS sales that haven't been logged to report yet
    const existingSaleIds = new Set(
      currentRows.filter((r) => r.posSaleId).map((r) => r.posSaleId)
    );
    const existingReceiptNos = new Set(
      currentRows.filter((r) => r.receiptNo).map((r) => r.receiptNo)
    );

    const newRowsToAppend: DailyReportRow[] = [];
    sales.forEach((sale) => {
      if (!existingSaleIds.has(sale.id) && !existingReceiptNos.has(sale.receiptNo)) {
        const saleDate = formatReportDate(new Date(sale.date));
        sale.items.forEach((item, idx) => {
          const tagLower = (item.tag || '').toLowerCase();
          let cat: ReportCategory = 'Product';
          if (tagLower.includes('steam')) {
            cat = 'Steam offline';
          } else if (tagLower.includes('account')) {
            cat = 'Account';
          } else if (tagLower.includes('product')) {
            cat = 'Product';
          }
          const sellOut = Number(item.subtotal) || 0;
          const unitCost = item.costPrice !== undefined ? Number(item.costPrice) : 0;
          const buyIn = unitCost * (item.quantity || 1);
          const profit = sellOut - buyIn;

          newRowsToAppend.push({
            id: `pos_row_${sale.id}_${item.id}_${idx}`,
            gameName: item.name,
            category: cat,
            buyIn,
            sellOut,
            profit,
            date: saleDate,
            source: 'pos',
            posSaleId: sale.id,
            receiptNo: sale.receiptNo,
            quantity: item.quantity,
          });
        });
      }
    });

    if (newRowsToAppend.length > 0) {
      const combined = [...newRowsToAppend, ...currentRows];
      this.saveReportRows(combined);
      return { addedCount: newRowsToAppend.length, totalRows: combined.length };
    }

    return { addedCount: 0, totalRows: currentRows.length };
  },

  markReportInitialized(): void {
    try {
      localStorage.setItem(STORAGE_KEY_REPORT_INITIALIZED, 'true');
      setDoc(doc(db, 'settings', 'reportMeta'), { initialized: true }, { merge: true }).catch(() => {});
    } catch {}
  },

  isReportInitialized(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY_REPORT_INITIALIZED) === 'true';
    } catch {
      return false;
    }
  },

  // Daily Financial Report Rows Management
  getReportRows(): DailyReportRow[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_REPORT_ROWS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load report rows', e);
    }
    // If the report was ever initialized, a missing/null value means the user emptied it: return []
    if (this.isReportInitialized()) {
      return [];
    }
    // Only pre-populate if key never existed in localStorage and never initialized
    this.markReportInitialized();
    this.saveReportRows(INITIAL_REPORT_ROWS);
    return INITIAL_REPORT_ROWS;
  },

  // Real-time Cloud Listener for Daily Financial Report Rows
  subscribeToReportRows(callback: (rows: DailyReportRow[]) => void): () => void {
    const collRef = collection(db, 'reportRows');
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const cloudRows: DailyReportRow[] = [];
          snapshot.forEach((docSnap) => {
            cloudRows.push(docSnap.data() as DailyReportRow);
          });
          cloudRows.sort((a: any, b: any) => {
            if (typeof a.sortIndex === 'number' && typeof b.sortIndex === 'number') {
              return a.sortIndex - b.sortIndex;
            }
            return 0;
          });
          this.markReportInitialized();

          // Prevent race condition: do not overwrite local state with fewer items during active batch upload
          if (isBatchWritingReportRows) {
            const localRows = this.getReportRows();
            if (localRows.length > cloudRows.length) {
              return;
            }
          }

          try {
            localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify(cloudRows));
            idbSet(STORAGE_KEY_REPORT_ROWS, cloudRows).catch(() => {});
          } catch {}
          callback(cloudRows);
        } else {
          // If Firestore collection is empty, check if it was already initialized
          if (this.isReportInitialized()) {
            // User intentionally deleted or cleared all rows: do NOT rollback or re-seed!
            try {
              localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify([]));
              idbSet(STORAGE_KEY_REPORT_ROWS, []).catch(() => {});
            } catch {}
            callback([]);
            return;
          }

          // Check cloud reportMeta doc before deciding whether to seed
          getDoc(doc(db, 'settings', 'reportMeta'))
            .then((metaSnap) => {
              if (metaSnap.exists() && metaSnap.data()?.initialized) {
                // Cloud already initialized: user has an empty report. Deliver []!
                this.markReportInitialized();
                try {
                  localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify([]));
                  idbSet(STORAGE_KEY_REPORT_ROWS, []).catch(() => {});
                } catch {}
                callback([]);
              } else {
                // First boot only on clean project: seed once and mark initialized
                this.markReportInitialized();
                INITIAL_REPORT_ROWS.forEach((r, idx) => {
                  setDoc(doc(db, 'reportRows', r.id), cleanFirestoreDoc({ ...r, sortIndex: idx })).catch(() => {});
                });
              }
            })
            .catch(() => {
              callback([]);
            });
        }
      },
      (error) => {
        console.warn('Firestore reportRows listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'reportRows');
      }
    );
    return unsubscribe;
  },

  saveReportRows(rows: DailyReportRow[]): void {
    try {
      this.markReportInitialized();

      // Ensure every row has a sanitized ID
      const sanitizedRows: DailyReportRow[] = rows.map((r, idx) => ({
        ...r,
        id: sanitizeFirestoreId(r.id || `rep_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`),
      }));

      // Find any removed documents from previous state and delete them from Firestore
      const existing = this.getReportRows();
      const newIds = new Set(sanitizedRows.map((r) => r.id));
      const idsToDelete = existing.filter((r) => !newIds.has(r.id)).map((r) => r.id);

      // Save to local cache first for instant feedback
      localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify(sanitizedRows));
      idbSet(STORAGE_KEY_REPORT_ROWS, sanitizedRows).catch(() => {});

      // Atomic batch sync to Firestore to guarantee all items write together
      isBatchWritingReportRows = true;
      (async () => {
        try {
          if (idsToDelete.length > 0) {
            await atomicBatchDelete('reportRows', idsToDelete);
          }
          const batchItems = sanitizedRows.map((r, idx) => ({
            id: r.id,
            data: { ...r, sortIndex: idx },
          }));
          await atomicBatchSet('reportRows', batchItems);
        } catch (err) {
          console.warn('Firestore atomic batch saveReportRows warning:', err);
        } finally {
          setTimeout(() => {
            isBatchWritingReportRows = false;
          }, 800);
        }
      })();
    } catch (e) {
      console.error('Failed to save report rows', e);
    }
  },

  clearManualReportRows(): void {
    this.markReportInitialized();
    const current = this.getReportRows();
    const manualRows = current.filter((r) => r.source !== 'pos');
    const posOnly = current.filter((r) => r.source === 'pos');

    try {
      localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify(posOnly));
      idbSet(STORAGE_KEY_REPORT_ROWS, posOnly).catch(() => {});
    } catch {}

    isBatchWritingReportRows = true;
    (async () => {
      try {
        const idsToDelete = manualRows.map((r) => r.id);
        await atomicBatchDelete('reportRows', idsToDelete);
        const batchItems = posOnly.map((r, idx) => ({
          id: r.id,
          data: { ...r, sortIndex: idx },
        }));
        await atomicBatchSet('reportRows', batchItems);
      } catch (err) {
        console.warn('Firestore clearManualReportRows atomic batch warning:', err);
      } finally {
        setTimeout(() => {
          isBatchWritingReportRows = false;
        }, 800);
      }
    })();
  },

  clearAllReportRows(): void {
    this.markReportInitialized();
    const current = this.getReportRows();

    try {
      localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify([]));
      idbSet(STORAGE_KEY_REPORT_ROWS, []).catch(() => {});
    } catch {}

    isBatchWritingReportRows = true;
    (async () => {
      try {
        const idsToDelete = current.map((r) => r.id);
        await atomicBatchDelete('reportRows', idsToDelete);
      } catch (err) {
        console.warn('Firestore clearAllReportRows atomic batch warning:', err);
      } finally {
        setTimeout(() => {
          isBatchWritingReportRows = false;
        }, 800);
      }
    })();
  },

  resetReportRowsToDefault(): DailyReportRow[] {
    this.clearAllReportRows();
    INITIAL_REPORT_ROWS.forEach((r, idx) => {
      setDoc(doc(db, 'reportRows', r.id), cleanFirestoreDoc({ ...r, sortIndex: idx })).catch(() => {});
    });
    localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify(INITIAL_REPORT_ROWS));
    idbSet(STORAGE_KEY_REPORT_ROWS, INITIAL_REPORT_ROWS).catch(() => {});
    this.markReportInitialized();
    return INITIAL_REPORT_ROWS;
  },

  addReportRow(row: Omit<DailyReportRow, 'id'> & { id?: string }): DailyReportRow {
    const rows = this.getReportRows();
    const cleanId = sanitizeFirestoreId(row.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
    const newRow: DailyReportRow = {
      ...row,
      id: cleanId,
      profit: (row.sellOut || 0) - (row.buyIn || 0),
    };
    const updated = [newRow, ...rows];
    this.saveReportRows(updated);
    return newRow;
  },

  addMultipleReportRows(newRows: (Omit<DailyReportRow, 'id'> & { id?: string })[]): DailyReportRow[] {
    const rows = this.getReportRows();
    const now = Date.now();
    const created: DailyReportRow[] = newRows.map((r, idx) => {
      const buyIn = Number(r.buyIn) || 0;
      const sellOut = Number(r.sellOut) || 0;
      const profit = r.profit !== undefined ? Number(r.profit) : sellOut - buyIn;
      const cleanId = sanitizeFirestoreId(r.id || `rep_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`);
      return {
        ...r,
        id: cleanId,
        buyIn,
        sellOut,
        profit,
        source: r.source || 'manual',
      };
    });
    const combined = [...created, ...rows];
    this.saveReportRows(combined);
    return created;
  },

  replaceManualReportRows(newRows: (Omit<DailyReportRow, 'id'> & { id?: string })[]): DailyReportRow[] {
    const existing = this.getReportRows();
    const posOnly = existing.filter((r) => r.source === 'pos');
    const now = Date.now();
    const created: DailyReportRow[] = newRows.map((r, idx) => {
      const buyIn = Number(r.buyIn) || 0;
      const sellOut = Number(r.sellOut) || 0;
      const profit = r.profit !== undefined ? Number(r.profit) : sellOut - buyIn;
      const cleanId = sanitizeFirestoreId(r.id || `rep_${now}_${idx}_${Math.random().toString(36).substring(2, 6)}`);
      return {
        ...r,
        id: cleanId,
        buyIn,
        sellOut,
        profit,
        source: 'manual',
      };
    });
    const combined = [...created, ...posOnly];
    this.saveReportRows(combined);
    return created;
  },

  updateReportRow(id: string, updates: Partial<DailyReportRow>): void {
    const rows = this.getReportRows();
    let updatedTarget: DailyReportRow | null = null;
    const updated = rows.map((r) => {
      if (r.id === id) {
        const buyIn = updates.buyIn !== undefined ? updates.buyIn : r.buyIn;
        const sellOut = updates.sellOut !== undefined ? updates.sellOut : r.sellOut;
        const profit = sellOut - buyIn;
        updatedTarget = { ...r, ...updates, buyIn, sellOut, profit };
        return updatedTarget;
      }
      return r;
    });
    this.saveReportRows(updated);

    if (updatedTarget) {
      try {
        setDoc(doc(db, 'reportRows', id), cleanFirestoreDoc(updatedTarget), { merge: true }).catch(() => {});
      } catch (err) {
        console.warn('Firestore updateReportRow failed:', err);
      }
    }
  },

  deleteReportRow(id: string): void {
    this.markReportInitialized();
    try {
      deleteDoc(doc(db, 'reportRows', id)).catch(() => {});
    } catch (err) {
      console.warn('Firestore deleteReportRow failed:', err);
    }

    const rows = this.getReportRows();
    const filtered = rows.filter((r) => r.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY_REPORT_ROWS, JSON.stringify(filtered));
      idbSet(STORAGE_KEY_REPORT_ROWS, filtered).catch(() => {});
    } catch {}
  },

  markExpensesInitialized(): void {
    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES_INITIALIZED, 'true');
      setDoc(doc(db, 'settings', 'expenseMeta'), { initialized: true }, { merge: true }).catch(() => {});
    } catch {}
  },

  isExpensesInitialized(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY_EXPENSES_INITIALIZED) === 'true';
    } catch {
      return false;
    }
  },

  // Real-time Cloud Listener for Operating Expenses
  subscribeToExpenses(callback: (expenses: ExpenseItem[]) => void): () => void {
    const collRef = collection(db, 'expenses');
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const cloudExpenses: ExpenseItem[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            cloudExpenses.push({
              ...data,
              id: data.id || docSnap.id,
              name: String(data.name ?? ''),
              price: Number(data.price) || 0,
            });
          });
          cloudExpenses.sort((a: any, b: any) => {
            const aHas = typeof a.sortIndex === 'number';
            const bHas = typeof b.sortIndex === 'number';
            if (aHas && bHas) {
              return a.sortIndex - b.sortIndex;
            }
            if (aHas) return -1;
            if (bHas) return 1;
            return String(a.id).localeCompare(String(b.id));
          });
          this.markExpensesInitialized();

          // Prevent race condition during batch writes
          if (isBatchWritingExpenses) {
            const localExpenses = this.getExpenses();
            if (localExpenses.length > cloudExpenses.length) {
              return;
            }
          }

          try {
            localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(cloudExpenses));
            idbSet(STORAGE_KEY_EXPENSES, cloudExpenses).catch(() => {});
          } catch {}
          callback(cloudExpenses);
        } else {
          // If Firestore collection is empty, check if it was already initialized
          if (this.isExpensesInitialized()) {
            try {
              localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify([]));
              idbSet(STORAGE_KEY_EXPENSES, []).catch(() => {});
            } catch {}
            callback([]);
            return;
          }

          // Check cloud expenseMeta doc before deciding whether to seed
          getDoc(doc(db, 'settings', 'expenseMeta'))
            .then((metaSnap) => {
              if (metaSnap.exists() && metaSnap.data()?.initialized) {
                this.markExpensesInitialized();
                try {
                  localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify([]));
                  idbSet(STORAGE_KEY_EXPENSES, []).catch(() => {});
                } catch {}
                callback([]);
              } else {
                // First boot only on clean project: seed once and mark initialized
                this.markExpensesInitialized();
                const batchItems = INITIAL_EXPENSES.map((e, idx) => ({
                  id: e.id,
                  data: { ...e, sortIndex: idx },
                }));
                atomicBatchSet('expenses', batchItems).catch((err) => {
                  console.warn('Firestore initial expense seed warning:', err);
                });
              }
            })
            .catch(() => {
              callback([]);
            });
        }
      },
      (error) => {
        console.warn('Firestore expenses listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'expenses');
      }
    );
    return unsubscribe;
  },

  // Expense Management
  getExpenses(): ExpenseItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_EXPENSES);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load expenses', e);
    }
    if (this.isExpensesInitialized()) {
      return [];
    }
    // Cache locally until Firestore snapshot resolves — never overwrite Firestore with defaults from getExpenses()!
    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(INITIAL_EXPENSES));
    } catch {}
    return INITIAL_EXPENSES;
  },

  saveExpenses(expenses: ExpenseItem[]): void {
    try {
      this.markExpensesInitialized();
      const sanitizedExpenses: ExpenseItem[] = expenses.map((e, idx) => ({
        ...e,
        id: sanitizeFirestoreId(e.id || `exp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`),
        price: Number(e.price) || 0,
      }));

      const existing = this.getExpenses();
      const newIds = new Set(sanitizedExpenses.map((e) => e.id));
      const idsToDelete = existing.filter((e) => !newIds.has(e.id)).map((e) => e.id);

      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(sanitizedExpenses));
      idbSet(STORAGE_KEY_EXPENSES, sanitizedExpenses).catch(() => {});

      isBatchWritingExpenses = true;
      (async () => {
        try {
          if (idsToDelete.length > 0) {
            await atomicBatchDelete('expenses', idsToDelete);
          }
          const batchItems = sanitizedExpenses.map((e, idx) => ({
            id: e.id,
            data: { ...e, sortIndex: idx },
          }));
          await atomicBatchSet('expenses', batchItems);
        } catch (err) {
          console.warn('Firestore atomic batch saveExpenses warning:', err);
          if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
            handleFirestoreError(err, OperationType.WRITE, 'expenses');
          }
        } finally {
          setTimeout(() => {
            isBatchWritingExpenses = false;
          }, 800);
        }
      })();
    } catch (e) {
      console.error('Failed to save expenses', e);
    }
  },

  addExpense(item: Omit<ExpenseItem, 'id'> & { id?: string }): ExpenseItem {
    this.markExpensesInitialized();
    const expenses = this.getExpenses();
    const cleanId = sanitizeFirestoreId(
      item.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    );
    const newItem: ExpenseItem = {
      ...item,
      id: cleanId,
      price: Number(item.price) || 0,
    };
    const sortIndex = expenses.length;
    const updated = [...expenses, newItem];

    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(updated));
      idbSet(STORAGE_KEY_EXPENSES, updated).catch(() => {});
    } catch {}

    setDoc(
      doc(db, 'expenses', newItem.id),
      cleanFirestoreDoc({ ...newItem, sortIndex })
    ).catch((err) => {
      console.warn('Firestore addExpense failed:', err);
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
        handleFirestoreError(err, OperationType.CREATE, `expenses/${newItem.id}`);
      }
    });

    return newItem;
  },

  updateExpense(id: string, updates: Partial<ExpenseItem>): void {
    this.markExpensesInitialized();
    const expenses = this.getExpenses();
    const targetIndex = expenses.findIndex((e) => e.id === id);
    const existingItem = targetIndex >= 0 ? expenses[targetIndex] : null;
    const updatedTarget: ExpenseItem | null = existingItem
      ? {
          ...existingItem,
          ...updates,
          price: updates.price !== undefined ? Number(updates.price) || 0 : Number(existingItem.price) || 0,
        }
      : null;
    const updated =
      updatedTarget && targetIndex >= 0
        ? expenses.map((e, idx) => (idx === targetIndex ? updatedTarget : e))
        : expenses;

    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(updated));
      idbSet(STORAGE_KEY_EXPENSES, updated).catch(() => {});
    } catch {}

    const cleanId = sanitizeFirestoreId(id);
    const payload: Record<string, any> = updatedTarget
      ? { ...updatedTarget, sortIndex: targetIndex }
      : { ...updates };

    setDoc(doc(db, 'expenses', cleanId), cleanFirestoreDoc(payload), { merge: true }).catch((err) => {
      console.warn('Firestore updateExpense failed:', err);
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
        handleFirestoreError(err, OperationType.UPDATE, `expenses/${cleanId}`);
      }
    });
  },

  deleteExpense(id: string): void {
    this.markExpensesInitialized();
    const expenses = this.getExpenses();
    const filtered = expenses.filter((e) => e.id !== id);

    try {
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(filtered));
      idbSet(STORAGE_KEY_EXPENSES, filtered).catch(() => {});
    } catch {}

    const cleanId = sanitizeFirestoreId(id);
    deleteDoc(doc(db, 'expenses', cleanId)).catch((err) => {
      console.warn('Firestore deleteExpense failed:', err);
      if (err instanceof Error && err.message.toLowerCase().includes('permission')) {
        handleFirestoreError(err, OperationType.DELETE, `expenses/${cleanId}`);
      }
    });
  },

  // Calculate standard financial stats using Table3_11 exact formulas
  calculateReportStats(rows: DailyReportRow[], expenses: ExpenseItem[]) {
    // 1. Total Cost: =SUMIFS(C:C, B:B, V1), where V1 = "Product"
    const totalCost = rows
      .filter((r) => r.category.trim().toLowerCase() === 'product')
      .reduce((sum, r) => sum + (Number(r.buyIn) || 0), 0);

    // 2. Total Price: =SUMIFS(E:E, B:B, W1) + SUMIFS(D:D, B:B, V1), W1="Steam offline", V1="Product"
    const steamOfflineProfit = rows
      .filter((r) => r.category.trim().toLowerCase().includes('steam'))
      .reduce((sum, r) => sum + (Number(r.profit) || 0), 0);

    const productSellOut = rows
      .filter((r) => r.category.trim().toLowerCase() === 'product')
      .reduce((sum, r) => sum + (Number(r.sellOut) || 0), 0);

    const accountProfit = rows
      .filter((r) => r.category.trim().toLowerCase().includes('account'))
      .reduce((sum, r) => sum + (Number(r.profit) || 0), 0);

    const totalPrice = steamOfflineProfit + productSellOut + accountProfit;

    // 3. Total Profit: =SUM(E:E)
    const totalProfit = rows.reduce((sum, r) => sum + (Number(r.profit) || 0), 0);

    // 4. Total Expense: =SUM(R:R)
    const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.price) || 0), 0);

    // 5. Total Profit After Expense: =U3 - U5 (TotalPrice - TotalExpense)
    const totalProfitAfterExpense = totalPrice - totalExpense;

    return {
      totalRows: rows.length,
      totalCost,
      totalPrice,
      totalProfit,
      totalExpense,
      totalProfitAfterExpense,
    };
  },

  // Real-time Cloud Listener for Version History Snapshots
  subscribeToVersionHistory(callback: (history: ReportVersionSnapshot[]) => void): () => void {
    const collRef = collection(db, 'versionHistory');
    const unsubscribe = onSnapshot(
      collRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const cloudVersions: ReportVersionSnapshot[] = [];
          snapshot.forEach((docSnap) => {
            cloudVersions.push(docSnap.data() as ReportVersionSnapshot);
          });
          cloudVersions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          const trimmed = cloudVersions.slice(0, 35);
          try {
            localStorage.setItem(STORAGE_KEY_VERSION_HISTORY, JSON.stringify(trimmed));
          } catch {}
          callback(trimmed);
        }
      },
      (error) => {
        console.warn('Firestore versionHistory listener error:', error);
        handleFirestoreError(error, OperationType.GET, 'versionHistory');
      }
    );
    return unsubscribe;
  },

  // Version History Management
  getVersionHistory(): ReportVersionSnapshot[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_VERSION_HISTORY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load version history', e);
    }
    // Initialize baseline snapshot if empty
    const baselineRows = this.getReportRows();
    const baselineExpenses = this.getExpenses();
    const baselineStats = this.calculateReportStats(baselineRows, baselineExpenses);
    const initialVersion: ReportVersionSnapshot = {
      id: 'ver_baseline_init',
      versionName: 'v1.0 - Initial Baseline Snapshot',
      timestamp: new Date().toISOString(),
      formattedDate: new Date().toLocaleString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      author: 'System Baseline',
      notes: 'Initial ledger state with seeded Table3_11 records & POS live link',
      triggerType: 'manual_snapshot',
      stats: baselineStats,
      rows: baselineRows,
      expenses: baselineExpenses,
    };
    this.saveVersionHistory([initialVersion]);
    return [initialVersion];
  },

  saveVersionHistory(history: ReportVersionSnapshot[]): void {
    try {
      // Keep up to 35 snapshots to maintain lightweight snappy performance
      const trimmed = history.slice(0, 35);
      localStorage.setItem(STORAGE_KEY_VERSION_HISTORY, JSON.stringify(trimmed));
      trimmed.forEach((v) => {
        setDoc(doc(db, 'versionHistory', v.id), cleanFirestoreDoc(v)).catch(() => {});
      });
    } catch (e) {
      console.error('Failed to save version history', e);
    }
  },

  createVersionSnapshot(
    versionName: string,
    triggerType: 'pos_sale' | 'ledger_edit' | 'manual_snapshot' | 'expense_change' | 'restore' = 'manual_snapshot',
    author: string = 'Admin',
    notes?: string
  ): ReportVersionSnapshot {
    const currentRows = this.getReportRows();
    const currentExpenses = this.getExpenses();
    const stats = this.calculateReportStats(currentRows, currentExpenses);

    const now = new Date();
    const formattedDate = now.toLocaleString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newSnapshot: ReportVersionSnapshot = {
      id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      versionName,
      timestamp: now.toISOString(),
      formattedDate,
      author,
      notes: notes || `Snapshot captured automatically on ${triggerType.replace('_', ' ')}`,
      triggerType,
      stats,
      rows: JSON.parse(JSON.stringify(currentRows)),
      expenses: JSON.parse(JSON.stringify(currentExpenses)),
    };

    const currentHistory = this.getVersionHistory();
    const updatedHistory = [newSnapshot, ...currentHistory];
    this.saveVersionHistory(updatedHistory);

    try {
      setDoc(doc(db, 'versionHistory', newSnapshot.id), cleanFirestoreDoc(newSnapshot)).catch(() => {});
    } catch {}

    return newSnapshot;
  },

  restoreVersionSnapshot(versionId: string, restoredBy: string = 'Admin'): { success: boolean; error?: string } {
    try {
      const history = this.getVersionHistory();
      const target = history.find((v) => v.id === versionId);
      if (!target) {
        return { success: false, error: 'Version snapshot not found' };
      }

      // Safety: create a pre-restore backup before overwriting
      this.createVersionSnapshot(
        `Pre-Restore Safety Backup (Before ${target.versionName})`,
        'restore',
        restoredBy,
        `Automatic safety point saved before rolling back to ${target.formattedDate}`
      );

      // Restore data
      this.saveReportRows(JSON.parse(JSON.stringify(target.rows)));
      this.saveExpenses(JSON.parse(JSON.stringify(target.expenses)));

      // Add a restoration milestone
      this.createVersionSnapshot(
        `Restored to: ${target.versionName}`,
        'restore',
        restoredBy,
        `Ledger state reverted to snapshot from ${target.formattedDate}`
      );

      return { success: true };
    } catch (e: any) {
      console.error('Failed to restore version snapshot', e);
      return { success: false, error: e?.message || 'Restore failed' };
    }
  },

  deleteVersionSnapshot(versionId: string): void {
    const history = this.getVersionHistory();
    const filtered = history.filter((v) => v.id !== versionId);
    this.saveVersionHistory(filtered);
    deleteDoc(doc(db, 'versionHistory', versionId)).catch(() => {});
  },

  clearVersionHistory(): void {
    try {
      const history = this.getVersionHistory();
      localStorage.removeItem(STORAGE_KEY_VERSION_HISTORY);
      history.forEach((v) => {
        deleteDoc(doc(db, 'versionHistory', v.id)).catch(() => {});
      });
    } catch (e) {
      console.error('Failed to clear version history', e);
    }
  },

  // Merge Catalog between Google AI Studio & Netlify
  mergeCatalog(incomingGames: Game[]): Game[] {
    const existing = this.getGames();
    const existingMap = new Map<string, Game>();
    existing.forEach((g) => {
      existingMap.set(g.id, g);
      existingMap.set(g.name.toLowerCase().trim(), g);
    });

    const newToAdd: Game[] = [];
    incomingGames.forEach((incoming) => {
      const match =
        existingMap.get(incoming.id) ||
        existingMap.get(incoming.name.toLowerCase().trim());
      if (!match) {
        newToAdd.push(incoming);
      }
    });

    const merged = [...newToAdd, ...existing];
    this.saveGames(merged);
    return merged;
  },

  // Export / Import
  exportBackup(): string {
    const payload = {
      version: '1.4',
      exportDate: new Date().toISOString(),
      games: this.getGames(),
      settings: this.getSettings(),
      posSales: this.getSales(),
      reportRows: this.getReportRows(),
      expenses: this.getExpenses(),
      versionHistory: this.getVersionHistory(),
    };
    return JSON.stringify(payload, null, 2);
  },

  importBackup(jsonString: string): { success: boolean; count?: number; error?: string } {
    try {
      const parsed = JSON.parse(jsonString);
      const incomingList = Array.isArray(parsed) ? parsed : parsed.games;
      if (Array.isArray(incomingList)) {
        const merged = this.mergeCatalog(incomingList);
        if (parsed.settings) {
          this.saveSettings(parsed.settings);
        }
        if (Array.isArray(parsed.posSales)) {
          const currentSales = this.getSales();
          const combinedSales = [...parsed.posSales, ...currentSales].filter(
            (sale, index, self) => index === self.findIndex((s) => s.id === sale.id)
          );
          localStorage.setItem(STORAGE_KEY_POS_SALES, JSON.stringify(combinedSales));
        }
        if (Array.isArray(parsed.reportRows)) {
          this.saveReportRows(parsed.reportRows);
        }
        if (Array.isArray(parsed.expenses)) {
          this.saveExpenses(parsed.expenses);
        }
        if (Array.isArray(parsed.versionHistory)) {
          this.saveVersionHistory(parsed.versionHistory);
        }
        return { success: true, count: merged.length };
      }
      return { success: false, error: 'Invalid backup format. Missing games array.' };
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to parse JSON file' };
    }
  },

  getFinancialTextSize(): 'sm' | 'md' | 'lg' | 'xl' {
    try {
      const val = localStorage.getItem('kanigame_financial_text_size_v1');
      if (val === 'sm' || val === 'md' || val === 'lg' || val === 'xl') return val;
    } catch (e) {
      // Ignore storage errors
    }
    return 'md';
  },

  setFinancialTextSize(size: 'sm' | 'md' | 'lg' | 'xl'): void {
    try {
      localStorage.setItem('kanigame_financial_text_size_v1', size);
    } catch (e) {
      // Ignore storage errors
    }
  },

  // 1-Click Codebase Sync between Google AI Studio and Netlify
  syncWithCodebase(): { addedCount: number; totalGames: number } {
    const current = this.getGames();
    const existingIds = new Set(current.map((g) => g.id));
    const existingNames = new Set(current.map((g) => g.name.trim().toLowerCase()));

    const missingFromCodebase: Game[] = [];
    for (const codeGame of ALL_INITIAL_GAMES) {
      if (!existingIds.has(codeGame.id) && !existingNames.has(codeGame.name.trim().toLowerCase())) {
        missingFromCodebase.push(codeGame);
      }
    }

    if (missingFromCodebase.length > 0) {
      const merged = [...current, ...missingFromCodebase];
      this.saveGames(merged);
      return { addedCount: missingFromCodebase.length, totalGames: merged.length };
    }

    return { addedCount: 0, totalGames: current.length };
  },

  // Export current catalog as TypeScript code ready for git/src/data/initialGames.ts
  exportCatalogAsCode(): string {
    const games = this.getGames();
    return `import { Game } from "../types/game";\n\nexport const ALL_INITIAL_GAMES: Game[] = ${JSON.stringify(games, null, 2)};\n`;
  },

  // Download initialGames.ts file for committing to GitHub
  downloadCatalogCode(): void {
    const code = this.exportCatalogAsCode();
    const blob = new Blob([code], { type: 'text/typescript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'initialGames.ts';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Download catalog JSON for quick import/export
  downloadCatalogJson(): void {
    const games = this.getGames();
    const blob = new Blob([JSON.stringify(games, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kanigame_catalog_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
};

