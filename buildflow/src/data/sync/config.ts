// ===== חיבור הענן — Supabase =====
// ה-anon key מיועד לצד לקוח ולכן בטוח שהוא נמצא בקוד; ההגנה נעשית ב-RLS.

export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://vkveqmdvkpyybpvaakfb.supabase.co'

export const SUPABASE_ANON_KEY: string =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_CMS1chTpkfXpEWjA7GwADw_o2_kv0oG'

export const syncEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const STORAGE_BUCKET = 'buildflow'
export const blobPublicUrl = (id: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/blobs/${id}`
