import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

// Browser replacement for @tauri-apps/plugin-sql: SQLite compiled to WASM.
// The web build is a public demo, so the database lives only in memory —
// every page load starts from the seeded demo data and nothing is persisted.

export interface QueryResult {
    rowsAffected: number;
    lastInsertId?: number;
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
    private constructor(private readonly db: SqlJsDatabase) {}

    static async load(): Promise<WebDatabase> {
        const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
        return new WebDatabase(new SQL.Database());
    }

    async execute(query: string, bindValues: unknown[] = []): Promise<QueryResult> {
        if (bindValues.length === 0) {
            this.db.exec(query);
        } else {
            this.db.run(query, toBindValues(bindValues));
        }
        const rowsAffected = this.db.getRowsModified();
        const idRow = this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
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
}
