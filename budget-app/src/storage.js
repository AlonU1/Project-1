// storage.js — שמירה בענן דרך Supabase, עם נפילה חלקה ל-localStorage
// API זהה ל-window.storage: get / set / delete
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supa = URL && ANON ? createClient(URL, ANON) : null;

const local = {
  async get(key) { const v = localStorage.getItem(key); return v == null ? null : { key, value: v }; },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
  async delete(key) { localStorage.removeItem(key); return { key, deleted: true }; },
};

const cloud = {
  async get(key) {
    const { data, error } = await supa.from("kv").select("value").eq("key", key).maybeSingle();
    if (error) { console.warn("supabase get:", error.message); return local.get(key); }
    return data ? { key, value: data.value } : null;
  },
  async set(key, value) {
    const { error } = await supa.from("kv").upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) { console.warn("supabase set:", error.message); return local.set(key, value); }
    return { key, value };
  },
  async delete(key) {
    const { error } = await supa.from("kv").delete().eq("key", key);
    if (error) { console.warn("supabase delete:", error.message); return local.delete(key); }
    return { key, deleted: true };
  },
};

export const storage = supa ? cloud : local;
export const usingCloud = !!supa;
