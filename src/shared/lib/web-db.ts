import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

// Browser replacement for @tauri-apps/plugin-sql: SQLite compiled to WASM,
// persisted as a single blob in IndexedDB. Exposes the same execute/select API.

const IDB_NAME = "grading-app";
const IDB_STORE = "sqlite";
const IDB_KEY = "grading.db";
const SAVE_DELAY_MS = 300;

export interface QueryResult {
    rowsAffected: number;
    lastInsertId?: number;
}

function openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function loadBlob(): Promise<Uint8Array | null> {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
        const req = idb.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function saveBlob(data: Uint8Array): Promise<void> {
    const idb = await openIdb();
    return new Promise((resolve, reject) => {
        const tx = idb.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(data, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

function toBindValues(values: unknown[]): SqlValue[] {
    return values.map((v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v === "number" || typeof v === "string" || v instanceof Uint8Array) return v;
        return JSON.stringify(v);
    });
}

export class WebDatabase {
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor(private readonly db: SqlJsDatabase) {
        window.addEventListener("pagehide", () => this.flushPending());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.flushPending();
        });
    }

    static async load(): Promise<WebDatabase> {
        const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
        const existing = await loadBlob();
        return new WebDatabase(existing ? new SQL.Database(existing) : new SQL.Database());
    }

    async execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
        if (bindValues.length === 0) {
            this.db.exec(query);
        } else {
            this.db.run(query, toBindValues(bindValues));
        }
        const rowsAffected = this.db.getRowsModified();
        const idRow = this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
        this.scheduleSave();
        return { rowsAffected, lastInsertId: typeof idRow === "number" ? idRow : undefined };
    }

    async select<T>(query: string, bindValues: unknown[] = []): Promise<T> {
        const stmt = this.db.prepare(query);
        try {
            stmt.bind(toBindValues(bindValues));
            const rows: Record<string, SqlValue>[] = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows as T;
        } finally {
            stmt.free();
        }
    }

    private scheduleSave() {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
    }

    private flushPending() {
        if (this.saveTimer) this.flush();
    }

    private flush() {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        const data = this.db.export();
        // export() resets connection pragmas in sql.js
        this.db.exec("PRAGMA foreign_keys = ON;");
        saveBlob(data).catch((err) => console.error("[web-db] No se pudo guardar", err));
    }
}
