// storage.js — שמירה בענן דרך Supabase, עם נפילה חלקה ל-localStorage
// API זהה ל-window.storage: get / set / delete
import { createClient } from "@supabase/supabase-js";

// ענן משותף עם מערכת BuildFlow — משתני סביבה גוברים על ברירת המחדל
const URL = import.meta.env.VITE_SUPABASE_URL || "https://vkveqmdvkpyybpvaakfb.supabase.co";
// שני שמות נתמכים — VITE_SUPABASE_ANON_KEY (הקאנוני) או VITE_SUPABASE_KEY (כפי שמוגדר ב-Vercel)
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_CMS1chTpkfXpEWjA7GwADw_o2_kv0oG";
const supa = URL && ANON ? createClient(URL, ANON) : null;

const local = {
  async get(key) { const v = localStorage.getItem(key); return v == null ? null : { key, value: v }; },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
  async delete(key) { localStorage.removeItem(key); return { key, deleted: true }; },
};

const cloud = {
  async get(key) {
    try {
      const { data, error } = await supa.from("kv").select("value").eq("key", key).maybeSingle();
      if (error) { console.warn("supabase get:", error.message); return local.get(key); }
      return data ? { key, value: data.value } : null;
    } catch (e) { console.warn("supabase get:", e?.message); return local.get(key); }
  },
  async set(key, value) {
    try {
      const { error } = await supa.from("kv").upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) { console.warn("supabase set:", error.message); return local.set(key, value); }
      /* מראה מקומית — כך שקריאה מיידית תראה את הערך גם אם הענן איטי */
      try { localStorage.setItem(key, value); } catch (e) {}
      return { key, value };
    } catch (e) { console.warn("supabase set:", e?.message); return local.set(key, value); }
  },
  async delete(key) {
    try {
      const { error } = await supa.from("kv").delete().eq("key", key);
      try { localStorage.removeItem(key); } catch (e) {}
      if (error) { console.warn("supabase delete:", error.message); return local.delete(key); }
      return { key, deleted: true };
    } catch (e) { console.warn("supabase delete:", e?.message); return local.delete(key); }
  },
};

export const storage = supa ? cloud : local;
export const usingCloud = !!supa;
