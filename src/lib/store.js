// Storage abstraction: Supabase in production, a local JSON file in DRY_RUN
// so the whole pipeline can be demoed without credentials.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DRY_RUN, config, ROOT } from '../config.js';

const TABLES = [
  'sources', 'raw_items', 'stories', 'brand_knowledge', 'angles', 'content', 'approvals', 'analytics_events',
  // HawkEye (competitor & market intelligence)
  'hawkeye_companies', 'hawkeye_snapshots', 'hawkeye_signals', 'hawkeye_briefs', 'hawkeye_runs', 'hawkeye_seen',
];

class LocalStore {
  constructor() {
    this.file = path.join(ROOT, '.local-store', 'db.json');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.db = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, 'utf8'))
      : Object.fromEntries(TABLES.map(t => [t, []]));
  }
  _save() { fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2)); }
  // Databases created before a table existed won't have its key — create lazily.
  _t(table) { return (this.db[table] ||= []); }

  async insert(table, rows) {
    const arr = Array.isArray(rows) ? rows : [rows];
    const withIds = arr.map(r => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r }));
    this._t(table).push(...withIds);
    this._save();
    return withIds;
  }
  async update(table, id, patch) {
    const row = this._t(table).find(r => r.id === id);
    if (row) { Object.assign(row, patch, { updated_at: new Date().toISOString() }); this._save(); }
    return row;
  }
  async delete(table, id) {
    const rows = this._t(table);
    const i = rows.findIndex(r => r.id === id);
    if (i >= 0) { rows.splice(i, 1); this._save(); return true; }
    return false;
  }
  async select(table, filter = {}) {
    return this._t(table).filter(r => Object.entries(filter).every(([k, v]) => r[k] === v));
  }
  async selectById(table, id) {
    return this._t(table).find(r => r.id === id) || null;
  }
  reset() {
    this.db = Object.fromEntries(TABLES.map(t => [t, []]));
    this._save();
  }
}

class SupabaseStore {
  constructor() {
    // Lazy import so DRY_RUN mode works without the dependency installed
    this._clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(config.supabaseUrl, config.supabaseKey)
    );
  }
  async _c() { return this._clientPromise; }

  async insert(table, rows) {
    const c = await this._c();
    const { data, error } = await c.from(table).insert(rows).select();
    if (error) throw new Error(`supabase insert ${table}: ${error.message}`);
    return data;
  }
  async update(table, id, patch) {
    const c = await this._c();
    const { data, error } = await c.from(table).update(patch).eq('id', id).select().single();
    if (error) throw new Error(`supabase update ${table}: ${error.message}`);
    return data;
  }
  async delete(table, id) {
    const c = await this._c();
    const { error } = await c.from(table).delete().eq('id', id);
    if (error) throw new Error(`supabase delete ${table}: ${error.message}`);
    return true;
  }
  async select(table, filter = {}) {
    const c = await this._c();
    let q = c.from(table).select('*');
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`supabase select ${table}: ${error.message}`);
    return data;
  }
  async selectById(table, id) {
    const c = await this._c();
    const { data, error } = await c.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`supabase selectById ${table}: ${error.message}`);
    return data;
  }
}

export const store = DRY_RUN || !config.supabaseUrl ? new LocalStore() : new SupabaseStore();
