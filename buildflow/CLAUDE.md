# CLAUDE.md — BuildFlow

Construction project management PWA (Hebrew RTL, local-first). Full functional spec in **SPEC.md** — read it before significant changes; §17 lists what is deliberately out of scope.

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc --noEmit && vite build  ← run this to verify changes
npm run preview
```

## Architecture (the rules that matter)

1. **All data access goes through `src/data/layer.ts` (`dl`)** — never call Dexie directly from components. Exceptions: bulk generation (`seed.ts`, `structure/generate.ts`) and read-only `useLiveQuery` reads via `db`.
2. **Every write enqueues an outbox row** (SPEC §8.3). The outbox is the future sync queue — don't bypass it.
3. **IDs are client-generated UUIDs** (`crypto.randomUUID`), never sequential server IDs.
4. **Soft delete only**: set `archived_at`, never delete rows.
5. **Permissions**: single source of truth in `src/lib/permissions.ts` (`can()`), plus `visibleToUser()` for the contractor rule — a contractor sees only items where `assigned_company_id` equals their company. Check permissions in UI *and* in services.
6. **Defect status machine** lives in `src/lib/status.ts`. Never set `defect.status` directly — go through `changeStatus()` in `defectService.ts` (it validates transitions, logs activity, sends notifications).
7. **Status colors are fixed system-wide** (SPEC §15): defined once in `styles/index.css` (`--color-st-*`) and `lib/labels.ts` (`STATUS_HEX`). List rows, pins, charts and reports must use the same colors.
8. **Location tree** is a generic recursive table with materialized `path` (`/id1/id2/id3`). "All descendants of X" = `path.startsWith(x.path)`; ancestor rollups = split the defect's location path.
9. **Pins are relative coords** (0–1) tied to a specific `plan_version_id`. New plan versions must NOT silently move pins (SPEC §7.4).
10. **RTL**: `dir="rtl"` at the root; use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). The plan canvas is forced `dir="ltr"` — keep it that way. Numbers/codes get `.ltr-num`.

## Layout

```
src/
├── data/        types.ts · db.ts (Dexie schema) · layer.ts (dl) · blobs.ts · seed.ts
├── lib/         permissions · status (state machine) · labels (Hebrew) · date · image · csv · planSvg · util
├── state/       session.ts (zustand: current user, theme)
├── components/  ui.tsx (Btn/Card/Dialog/…) · BlobImg · LocationPicker
└── features/    auth · projects · shell (layout+context) · dashboard · structure
                 · plans (canvas+viewer) · defects · tasks · photos · dailylog
                 · people · notifications · reports · settings
```

`useProject()` (features/shell/ProjectContext) provides project, me, users/companies maps, locations, `locName()`, `href()` — use it inside project pages instead of re-querying.

## Known tech debt (intentional, don't "fix" silently)

- UI strings are Hebrew literals; i18n extraction (`t()`) is scheduled with the EN locale pass.
- No backend: auth is a demo user picker; outbox never drains. Sync adapter is the next milestone (SPEC §8).
- PDF plans, image annotation, pin clustering, checklists — later stages per SPEC §16.

## Conventions

- TypeScript strict; keep types in `data/types.ts` aligned with SPEC §5.
- Feature folders own their pages/services; shared primitives go in `components/ui.tsx`.
- Verify with `npm run build` before committing.
