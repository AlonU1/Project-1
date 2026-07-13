import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";

import { storage } from "./storage";

/* ================= design tokens ================= */
const C = {
  ink: "#12293B", muted: "#5C7282", border: "#E3E9EF",
  bg: "#F5F7FA", surface: "#FFFFFF", green: "#2F8F63", amber: "#E08A2B", red: "#C0504D",
  baseGray: "#8A99A8", net: "#8C5E00",
};

const GROUP_META = [
  { id: 1,  key: "g1",  name: "פירוקים והכנות",        color: "#8C6D46" },
  { id: 2,  key: "g2",  name: "בריכה",                 color: "#1D6FA3" },
  { id: 3,  key: "g3",  name: "חדר דיזל/גנרטור, ממ\"ד", color: "#C0504D" },
  { id: 4,  key: "g4",  name: "צנרת במתחם בריכה",       color: "#2F8F63" },
  { id: 8,  key: "g8",  name: "עבודות חשמל",           color: "#E0A020" },
  { id: 40, key: "g40", name: "עבודות פיתוח",          color: "#7A5FA0" },
];
const OTHER = { id: 0, key: "g0", name: "כללי / אבני דרך", color: "#9AA7B2" };
const metaOf = (wbs) => GROUP_META.find((g) => g.id === Math.trunc(parseFloat(wbs))) || OTHER;

const HEB_MONTHS = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
const DAY = 86400000;
const IDX_KEY = "budget-projects-index";     // רשימת הפרויקטים [{id,name}]
const PROJ_PREFIX = "budget-proj-";          // נתוני כל פרויקט
const LEGACY_KEY = "beit-elazar-budget-v1";  // מפתח ישן (גרסה חד-פרויקטית) — להעברה חד-פעמית
const newId = () => "p" + Date.now().toString(36) + Math.floor(Math.random() * 1000);

/* ================= date helpers ================= */
const toDate = (iso) => { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const isoOf = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDaysISO = (iso, n) => { const d = toDate(iso); if (!d) return iso; d.setDate(d.getDate() + (Number(n) || 0)); return isoOf(d); };
const daysBetween = (aISO, bISO) => { const a = toDate(aISO), b = toDate(bISO); if (!a || !b) return 0; return Math.round((b - a) / DAY); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const plannedFrac = (startISO, finishISO, statusDate) => {
  const s = toDate(startISO), f = toDate(finishISO);
  if (!s || !f || f < s) return 0;
  return clamp01(((statusDate - s) / DAY + 1) / ((f - s) / DAY + 1));
};

/* ================= FS dependency cascade ================= */
/* FS cascade: dependent starts the day after its predecessor finishes.
   A task that was hand-edited (manual) or is the one currently being edited (anchorId)
   keeps its date — the cascade only pushes its successors forward. */
function cascade(list, anchorId) {
  const arr = list.map((a) => ({ ...a }));
  const byWbs = {};
  arr.forEach((a) => { if (a.wbs) byWbs[a.wbs] = a; });
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    arr.forEach((a) => {
      if (!a.pred || a.pred === a.wbs) return;
      if (a.id === anchorId || a.manual) return;
      const p = byWbs[a.pred];
      if (!p || !p.finish) return;
      const ns = addDaysISO(p.finish, 1);
      if (a.start !== ns) { a.start = ns; a.finish = addDaysISO(ns, a.duration); changed = true; }
    });
    if (!changed) break;
  }
  return arr;
}

/* ================= seed data (milestones = duration 0) ================= */
const TODAY0 = new Date();
const RAW = [
  { wbs: "0.1",  name: "◆ קבלת היתר בניה",                        cost: 0,         start: "2025-10-28", finish: "2025-10-28" },
  { wbs: "1.1",  name: "עבודות פירוק והכנות שטח בריכה וחדר חשמל", cost: 203873.37, start: "2026-11-01", finish: "2026-11-12" },
  { wbs: "2.01", name: "הכנת שתית",                               cost: 29760,     start: "2025-11-01", finish: "2025-11-12" },
  { wbs: "2.02", name: "קידוח כלונסאות",                          cost: 970128,    start: "2025-11-20", finish: "2025-12-24", pred: "2.01" },
  { wbs: "2.03", name: "חציבות ראשי כלונסאות, ניקיון, בדיקות",    cost: 8721.6,    start: "2025-12-24", finish: "2026-01-04", pred: "2.02" },
  { wbs: "2.04", name: "עבודות צנרת תת-קרקעית",                   cost: 80990,     start: "2026-01-04", finish: "2026-01-05", pred: "2.03" },
  { wbs: "2.05", name: "יציקת רזה",                               cost: 74400,     start: "2026-01-06", finish: "2026-01-07", pred: "2.04" },
  { wbs: "2.06", name: "יציקת רצפה",                              cost: 263488,    start: "2026-01-08", finish: "2026-01-28", pred: "2.05" },
  { wbs: "2.07", name: "יציקת קיר בריכה",                         cost: 1838308.64,start: "2026-04-27", finish: "2026-04-30" },
  { wbs: "2.08", name: "ייצור לוחות, קורות - כולל התקנה",         cost: 272075.2,  start: "2026-05-01", finish: "2026-07-01", pred: "2.07" },
  { wbs: "2.09", name: "יציקת תקרה",                              cost: 470816,    start: "2026-07-01", finish: "2026-07-21", pred: "2.08" },
  { wbs: "2.1",  name: "בדיקת אטימות",                            cost: 223591.8,  start: "2026-08-15", finish: "2026-09-23" },
  { wbs: "2.11", name: "גמרים בריכה",                             cost: 166685.68, start: "2026-09-23", finish: "2026-10-15", pred: "2.1" },
  { wbs: "3.1",  name: "עבודות עפר",                              cost: 7920,      start: "2025-12-01", finish: "2025-12-14" },
  { wbs: "3.2",  name: "יציקת קירות, רצפה",                       cost: 417216.8,  start: "2026-01-10", finish: "2026-02-18" },
  { wbs: "3.3",  name: "הקמת מבנה - עבודות הנדסה אזרחית",         cost: 112812,    start: "2026-02-19", finish: "2026-05-27", pred: "3.2" },
  { wbs: "3.4",  name: "עבודות גמרים למבנה",                      cost: 290838.89, start: "2026-06-01", finish: "2026-07-26", pred: "3.3" },
  { wbs: "4.1",  name: "עבודות צנרת במתחם בריכה",                 cost: 1813020.94,start: "2026-08-01", finish: "2026-09-09" },
  { wbs: "8.01", name: "מקדמה - חשמל",                            cost: 200000,    start: "2025-12-01", finish: "2025-12-02" },
  { wbs: "8.1",  name: "עבודות חשמל - לוחות, ציוד, חיווט וחיבורים",cost: 1772983.52,start: "2026-08-01", finish: "2026-10-07" },
  { wbs: "40.1", name: "עבודות פיתוח",                            cost: 1184942.35,start: "2026-09-15", finish: "2026-10-12" },
  { wbs: "0.2",  name: "◆ מסירה",                                  cost: 0,         start: "2026-12-30", finish: "2026-12-30" },
];
const mkPlan = (withExec) => RAW.map((a, i) => {
  const frac = plannedFrac(a.start, a.finish, TODAY0);
  return {
    id: i + 1, pred: "", ...a,
    duration: daysBetween(a.start, a.finish),
    progress: withExec ? Math.round(frac * 100) : 0,
    actual: withExec ? Math.round(a.cost * (1 - 0.1111) * frac) : 0,
  };
});
const BASE_SEED = mkPlan(false);
const CUR_SEED = mkPlan(true);
const INV_SEED = [
  { id: 1, date: "2025-11-30", cumulative: 420000, extras: 0, paid: 300000 },
  { id: 2, date: "2025-12-31", cumulative: 1050000, extras: 0, paid: 700000 },
  { id: 3, date: "2026-01-31", cumulative: 1580000, extras: 25000, paid: 1050000 },
  { id: 4, date: "2026-02-28", cumulative: 1830000, extras: 25000, paid: 1600000 },
  { id: 5, date: "2026-03-31", cumulative: 1900000, extras: 60000, paid: 1855000 },
  { id: 6, date: "2026-04-30", cumulative: 3400000, extras: 85000, paid: 1960000 },
  { id: 7, date: "2026-05-31", cumulative: 3700000, extras: 120000, paid: 3485000 },
  { id: 8, date: "2026-06-30", cumulative: 3950000, extras: 145000, paid: 3820000 },
];
/* approved (contract items + extras) drives EV/AC; paid drives cash-flow */
const invApproved = (i) => (Number(i.cumulative) || 0) + (Number(i.extras) || 0);
const invTotal = invApproved;
const invPaidC = (i) => (i.paid == null || i.paid === "" ? invApproved(i) : Number(i.paid) || 0);

/* ================= formatting ================= */
const fmtDate = (dt) => dt ? `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getFullYear()).slice(2)}` : "";
const monthLabel = (y, m) => `${HEB_MONTHS[m]} ${String(y).slice(2)}`;
const shekel = (n) => (n == null || isNaN(n) ? "—" : "₪" + Math.round(n).toLocaleString("he-IL"));
const shekelShort = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return "₪" + (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return "₪" + Math.round(n / 1e3) + "K";
  return "₪" + Math.round(n);
};
const ratio = (n) => (n == null || isNaN(n) || !isFinite(n) ? "—" : n.toFixed(2));

/* ================= monthly model ================= */
function buildModel(activities, discountPct) {
  const rows = activities
    .map((a) => ({ ...a, s: toDate(a.start), f: toDate(a.finish) }))
    .filter((a) => a.s && a.f && a.f >= a.s);
  if (!rows.length) return { months: [], totals: {}, groupsPresent: [] };
  const minS = new Date(Math.min(...rows.map((r) => r.s)));
  const maxF = new Date(Math.max(...rows.map((r) => r.f)));
  const months = [];
  let y = minS.getFullYear(), m = minS.getMonth();
  while (y < maxF.getFullYear() || (y === maxF.getFullYear() && m <= maxF.getMonth())) {
    months.push({ y, m, start: new Date(y, m, 1), end: new Date(y, m + 1, 0), planned: 0, groups: {} });
    m++; if (m > 11) { m = 0; y++; }
  }
  const disc = 1 - (Number(discountPct) || 0) / 100;
  rows.forEach((a) => {
    const after = a.cost * disc;
    const meta = metaOf(a.wbs);
    let n = 0;
    months.forEach((mo) => { if (a.s <= mo.end && a.f >= mo.start) n++; });
    const perMonth = n > 0 ? after / n : 0;
    months.forEach((mo) => {
      if (a.s <= mo.end && a.f >= mo.start) {
        mo.planned += perMonth;
        mo.groups[meta.key] = (mo.groups[meta.key] || 0) + perMonth;
      }
    });
  });
  let cum = 0;
  const monthData = months.map((mo) => {
    cum += mo.planned;
    const row = { label: monthLabel(mo.y, mo.m), start: mo.start, planned: mo.planned, cumulative: cum };
    GROUP_META.forEach((g) => { row[g.key] = mo.groups[g.key] || 0; });
    return row;
  });
  const totalCost = rows.reduce((s, a) => s + a.cost, 0);
  const totalAfter = totalCost * disc;
  const peak = monthData.reduce((p, mo) => (mo.planned > p.planned ? mo : p), { planned: 0 });
  const groupsPresent = GROUP_META.filter((g) => rows.some((r) => metaOf(r.wbs).key === g.key));
  return {
    months: monthData, groupsPresent,
    totals: { totalCost, totalAfter, span: monthData.length, peakMonthly: peak.planned, peakLabel: peak.label, startDate: minS, endDate: maxF },
  };
}

/* ================= EVM ================= */
function evmAt(baseline, current, statusDate, discountPct, baseByWbs) {
  const disc = 1 - (Number(discountPct) || 0) / 100;
  let PV = 0, EV = 0, BAC = 0;
  baseline.forEach((b) => {
    const after = (b.cost || 0) * disc;
    BAC += after;
    PV += after * plannedFrac(b.start, b.finish, statusDate);
  });
  current.forEach((a) => {
    const b = baseByWbs[a.wbs];
    const budget = ((b ? b.cost : a.cost) || 0) * disc;
    const f = Math.min(plannedFrac(a.start, a.finish, statusDate), (Number(a.progress) || 0) / 100);
    EV += budget * f;
  });
  return { PV, EV, BAC };
}
function buildEvm(baseline, current, invoices, discountPct, baseByWbs, statusDate) {
  const dated = invoices.filter((i) => toDate(i.date)).sort((a, b) => toDate(a.date) - toDate(b.date));
  const now = statusDate || (dated.length ? toDate(dated.at(-1).date) : new Date());
  const { PV, EV, BAC } = evmAt(baseline, current, now, discountPct, baseByWbs);
  const paid = dated.filter((i) => toDate(i.date) <= now);
  const AC = paid.length ? invApproved(paid.at(-1)) : current.reduce((s, a) => s + (Number(a.actual) || 0), 0);
  const paidCash = paid.length ? invPaidC(paid.at(-1)) : AC;
  const acSource = paid.length ? "חשבון מאושר" : "עלות בפועל בטבלה";
  const SPI = PV > 0 ? EV / PV : null;
  const CPI = AC > 0 ? EV / AC : null;
  const EAC = CPI && CPI > 0 ? BAC / CPI : null;
  return {
    statusDate: now, BAC, PV, EV, AC, paidCash, unpaid: AC - paidCash, acSource,
    SV: EV - PV, CV: EV - AC, SPI, CPI,
    EAC, ETC: EAC != null ? EAC - AC : null, VAC: EAC != null ? BAC - EAC : null,
    pctComplete: BAC > 0 ? (EV / BAC) * 100 : 0,
  };
}

/* ================= shared UI ================= */
const Kpi = ({ label, value, sub, accent }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", flex: "1 1 145px", minWidth: 145 }}>
    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: accent || C.ink, letterSpacing: -0.3 }}>{value}</div>
    {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
  </div>
);
const cell = { fontFamily: "inherit", fontSize: 13, padding: "5px 7px", border: `1px solid ${C.border}`, borderRadius: 6, background: "#FCFDFE", color: C.ink };
const panel = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 16 };

/* big dot only on months where an account was actually paid */
const InvDot = (props) => {
  const { cx, cy, payload, index } = props;
  if (cx == null || cy == null || !payload || !payload.invPaid) return null;
  return <circle key={"inv" + index} cx={cx} cy={cy} r={6} fill={C.amber} stroke="#fff" strokeWidth={1.8} />;
};

/* ================= Gantt: responsive, grouped, critical path, milestones ================= */
const ROW_H = 28, HEADER_H = 40, LABEL_W = 240;
function Gantt({ title, activities, discount, onShift, onResize, baselineByWbs, readOnly }) {
  const dragRef = useRef(null);
  const wrapRef = useRef(null);
  const [availW, setAvailW] = useState(900);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setAvailW(Math.max(420, el.clientWidth || 900));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const disc = 1 - discount / 100;

  const valid = activities
    .map((a) => ({ ...a, s: toDate(a.start), f: toDate(a.finish), meta: metaOf(a.wbs) }))
    .filter((a) => a.s && a.f && a.f >= a.s);
  if (!valid.length) return null;

  /* critical path: longest reach through FS links; isolated end-defining activity also marked */
  const byWbs = {};
  valid.forEach((v) => { if (v.wbs) byWbs[v.wbs] = v; });
  const succs = {};
  valid.forEach((v) => { if (v.pred && byWbs[v.pred]) (succs[v.pred] = succs[v.pred] || []).push(v.wbs); });
  const reachMemo = {};
  const reach = (w, depth = 0) => {
    if (reachMemo[w] != null) return reachMemo[w];
    if (depth > 50) return 0;
    const a = byWbs[w];
    let r = +a.f;
    (succs[w] || []).forEach((sw) => { r = Math.max(r, reach(sw, depth + 1)); });
    reachMemo[w] = r;
    return r;
  };
  const linked = valid.filter((v) => v.wbs && (v.pred || succs[v.wbs]));
  const linkedEnd = linked.length ? Math.max(...linked.map((v) => reach(v.wbs))) : null;
  const projEnd = Math.max(...valid.map((v) => +v.f));
  const critical = new Set(valid.filter((v) => v.wbs && (
    reach(v.wbs) === projEnd || (linkedEnd != null && (v.pred || succs[v.wbs]) && reach(v.wbs) === linkedEnd)
  )).map((v) => v.id));

  const chapters = [];
  GROUP_META.concat([OTHER]).forEach((g) => {
    const acts = valid.filter((a) => a.meta.key === g.key).sort((x, y) => x.s - y.s || String(x.wbs).localeCompare(String(y.wbs)));
    if (!acts.length) return;
    const s = new Date(Math.min(...acts.map((a) => a.s)));
    const f = new Date(Math.max(...acts.map((a) => a.f)));
    const budget = acts.reduce((t, a) => t + a.cost * disc, 0);
    const prog = budget > 0 ? acts.reduce((t, a) => t + a.cost * disc * ((Number(a.progress) || 0) / 100), 0) / budget * 100 : 0;
    chapters.push({ g, acts, s, f, prog });
  });
  const rows = [];
  chapters.forEach((ch) => { rows.push({ type: "ch", ch }); ch.acts.forEach((a) => rows.push({ type: "act", a })); });

  let min = new Date(Math.min(...valid.map((r) => r.s)));
  let max = new Date(Math.max(...valid.map((r) => r.f)));
  if (baselineByWbs) {
    Object.values(baselineByWbs).forEach((b) => {
      const bs = toDate(b.start), bf = toDate(b.finish);
      if (bs && bs < min) min = bs;
      if (bf && bf > max) max = bf;
    });
  }
  const totalDays = Math.max(1, Math.round((max - min) / DAY) + 14);
  const timelineW = Math.max(420, availW - 2);
  const pxPerDay = timelineW / totalDays;
  const svgH = HEADER_H + rows.length * ROW_H + 12;
  const xOf = (dt) => ((dt - min) / DAY) * pxPerDay;

  const ticks = [];
  let y = min.getFullYear(), m = min.getMonth();
  while (y < max.getFullYear() || (y === max.getFullYear() && m <= max.getMonth())) {
    const ms = new Date(y, m, 1);
    ticks.push({ x: xOf(ms < min ? min : ms), label: monthLabel(y, m) });
    m++; if (m > 11) { m = 0; y++; }
  }
  const today = new Date();
  const todayX = today >= min && today <= max ? xOf(today) : null;

  const posByWbs = {};
  rows.forEach((r, i) => {
    if (r.type === "act" && r.a.wbs) posByWbs[r.a.wbs] = { xs: xOf(r.a.s), xEnd: xOf(r.a.f), yMid: HEADER_H + i * ROW_H + ROW_H / 2 };
  });

  const onDown = (e, a, mode) => {
    if (readOnly) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { id: a.id, mode, x0: e.clientX, start0: a.start, dur0: a.duration };
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const days = Math.round((e.clientX - d.x0) / pxPerDay);
    if (d.mode === "move") onShift(d.id, addDaysISO(d.start0, days));
    else onResize(d.id, Math.max(0, d.dur0 + days));
  };
  const onUp = () => { dragRef.current = null; };

  return (
    <div style={{ ...panel, padding: "16px 12px 10px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, padding: "0 8px 2px" }}>{title}</div>
      <div style={{ fontSize: 11, color: C.muted, padding: "0 8px 10px" }}>
        {readOnly ? "תצוגה בלבד" : "גרור פס להזזה · גרור קצה שמאלי לשינוי משך"} · מסגרת אדומה = נתיב קריטי · ◆ = אבן דרך{baselineByWbs ? " · פס אפור = בסיס" : ""}
      </div>
      <div dir="ltr" style={{ display: "flex", alignItems: "flex-start" }}>
        <div dir="rtl" style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${C.border}`, textAlign: "right" }}>
          <div style={{ height: HEADER_H }} />
          {rows.map((r, i) => r.type === "ch" ? (
            <div key={"l" + i} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 7, padding: "0 8px", background: "#EFF3F7", fontWeight: 700, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden" }}>
              <span style={{ width: 11, height: 11, borderRadius: 3, background: r.ch.g.color, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.ch.g.id > 0 ? `${r.ch.g.id} · ` : ""}{r.ch.g.name}</span>
              <span style={{ marginInlineStart: "auto", fontWeight: 600, fontSize: 11, color: C.muted }}>{Math.round(r.ch.prog)}%</span>
            </div>
          ) : (
            <div key={"l" + i} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 6, padding: "0 8px 0 4px", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", background: i % 2 ? "#FBFCFD" : "transparent" }}>
              <span style={{ color: critical.has(r.a.id) ? C.red : C.muted, fontSize: 11, minWidth: 30, fontWeight: critical.has(r.a.id) ? 700 : 400 }}>{r.a.wbs}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={r.a.name}>{r.a.name}</span>
            </div>
          ))}
        </div>
        <div dir="ltr" ref={wrapRef} style={{ overflowX: "auto", flex: 1, minWidth: 0 }} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          <svg width={timelineW} height={svgH} style={{ display: "block", touchAction: "none" }}>
            <defs>
              <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#9AA7B2" />
              </marker>
            </defs>
            {rows.map((r, i) => (
              <rect key={"bg" + i} x={0} y={HEADER_H + i * ROW_H} width={timelineW} height={ROW_H}
                fill={r.type === "ch" ? "#EFF3F7" : i % 2 ? "#FBFCFD" : "transparent"} />
            ))}
            {ticks.map((t, i) => (
              <g key={"tk" + i}>
                <line x1={t.x} y1={HEADER_H} x2={t.x} y2={svgH - 12} stroke={C.border} />
                <text x={t.x + 4} y={HEADER_H - 14} fontSize="10" fill={C.muted}>{t.label}</text>
              </g>
            ))}
            {todayX != null && (
              <g>
                <line x1={todayX} y1={HEADER_H - 6} x2={todayX} y2={svgH - 12} stroke={C.amber} strokeWidth="1.5" strokeDasharray="4 3" />
                <text x={todayX} y={HEADER_H - 24} fontSize="10" fontWeight="700" fill={C.amber} textAnchor="middle">היום</text>
              </g>
            )}
            {rows.map((r, i) => {
              if (r.type !== "act" || !r.a.pred) return null;
              const from = posByWbs[r.a.pred], to = posByWbs[r.a.wbs];
              if (!from || !to) return null;
              const crit = critical.has(r.a.id) && critical.has(byWbs[r.a.pred]?.id);
              const mid = from.xEnd + Math.max(8, (to.xs - from.xEnd) / 2);
              return <path key={"dep" + i} d={`M ${from.xEnd} ${from.yMid} L ${mid} ${from.yMid} L ${mid} ${to.yMid} L ${to.xs - 2} ${to.yMid}`}
                fill="none" stroke={crit ? C.red : "#9AA7B2"} strokeWidth={crit ? 1.6 : 1.2} markerEnd="url(#arr)" />;
            })}
            {rows.map((r, i) => {
              const y0 = HEADER_H + i * ROW_H;
              if (r.type === "ch") {
                const bx = xOf(r.ch.s), bw = Math.max(4, xOf(r.ch.f) - bx);
                return (
                  <g key={"chb" + i}>
                    <rect x={bx} y={y0 + ROW_H / 2 - 4} width={bw} height={8} rx={2} fill={r.ch.g.color} opacity={0.3} />
                    <rect x={bx} y={y0 + ROW_H / 2 - 4} width={bw * clamp01(r.ch.prog / 100)} height={8} rx={2} fill={r.ch.g.color} opacity={0.85} />
                  </g>
                );
              }
              const a = r.a;
              const isCrit = critical.has(a.id);
              const base = baselineByWbs ? baselineByWbs[a.wbs] : null;
              /* milestone: diamond */
              if (a.duration === 0) {
                const x = xOf(a.s), yMid = y0 + ROW_H / 2 - 2;
                const done = (Number(a.progress) || 0) >= 100;
                return (
                  <g key={"b" + a.id}>
                    {base && toDate(base.start) && (
                      <path d={`M ${xOf(toDate(base.start))} ${y0 + ROW_H - 9} l 5 4 l -5 4 l -5 -4 z`} fill={C.baseGray} opacity={0.75} />
                    )}
                    <path d={`M ${x} ${yMid - 7} L ${x + 7} ${yMid} L ${x} ${yMid + 7} L ${x - 7} ${yMid} Z`}
                      fill={done ? a.meta.color : "#fff"} stroke={isCrit ? C.red : a.meta.color} strokeWidth={isCrit ? 2.2 : 1.8}
                      style={{ cursor: readOnly ? "default" : "grab" }}
                      onPointerDown={(e) => onDown(e, a, "move")}>
                      <title>{`${a.name}\n${fmtDate(a.s)}${isCrit ? "\nנתיב קריטי" : ""}`}</title>
                    </path>
                  </g>
                );
              }
              const bx = xOf(a.s), bw = Math.max(4, xOf(a.f) - bx + pxPerDay * 0.6);
              const prog = clamp01((Number(a.progress) || 0) / 100);
              return (
                <g key={"b" + a.id}>
                  {base && toDate(base.start) && (
                    <rect x={xOf(toDate(base.start))} y={y0 + ROW_H - 8}
                      width={Math.max(3, xOf(toDate(base.finish)) - xOf(toDate(base.start)) + pxPerDay * 0.6)} height={5} rx={2}
                      fill={C.baseGray} opacity={0.75}>
                      <title>{`בסיס: ${fmtDate(toDate(base.start))} – ${fmtDate(toDate(base.finish))}`}</title>
                    </rect>
                  )}
                  <rect x={bx} y={y0 + 4} width={bw} height={13} rx={3}
                    fill={a.meta.color} opacity={0.45}
                    stroke={isCrit ? C.red : "none"} strokeWidth={isCrit ? 2 : 0}
                    style={{ cursor: readOnly ? "default" : "grab" }}
                    onPointerDown={(e) => onDown(e, a, "move")}>
                    <title>{`${a.name}\n${fmtDate(a.s)} – ${fmtDate(a.f)} · ${a.duration} ימים · ${a.progress || 0}%${isCrit ? "\nנתיב קריטי" : ""}`}</title>
                  </rect>
                  <rect x={bx} y={y0 + 4} width={bw * prog} height={13} rx={3} fill={a.meta.color} pointerEvents="none" />
                  {!readOnly && (
                    <rect x={bx + bw - 5} y={y0 + 4} width={7} height={13} fill="transparent" style={{ cursor: "ew-resize" }}
                      onPointerDown={(e) => onDown(e, a, "resize")} />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ================= monthly stacked chart ================= */
function FlowChart({ title, months, groupsPresent, todayLabel, font, extraLine, netLine }) {
  return (
    <div style={{ ...panel, padding: "16px 12px 8px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, padding: "0 8px 10px" }}>{title}</div>
      <div style={{ direction: "ltr", width: "100%", height: 380 }}>
        <ResponsiveContainer>
          <ComposedChart data={months} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickMargin={6} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={shekelShort} width={54} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: C.muted }} tickFormatter={shekelShort} width={54} />
            <Tooltip formatter={(v, n) => [shekel(v), n]} labelFormatter={(l) => "חודש " + l}
              contentStyle={{ fontFamily: font, fontSize: 12, direction: "rtl", borderRadius: 8, border: `1px solid ${C.border}` }} />
            <Legend wrapperStyle={{ fontFamily: font, fontSize: 12 }} />
            {groupsPresent.map((g) => (
              <Bar key={g.key} yAxisId="l" dataKey={g.key} name={`${g.id} · ${g.name}`} stackId="a" fill={g.color} maxBarSize={34} />
            ))}
            <Line yAxisId="r" dataKey="cumulative" name="מצטבר מתוכנן" stroke={C.ink} strokeWidth={2.5} dot={false} />
            {extraLine && <Line yAxisId="r" dataKey="actualCum" name="חשבון מאושר מצטבר (AC)" stroke={C.amber} strokeWidth={2.5} dot={InvDot} activeDot={{ r: 7 }} connectNulls={false} />}
            {extraLine && <Line yAxisId="r" dataKey="paidCum" name="שולם בפועל (תזרים)" stroke={C.green} strokeWidth={2.2} dot={{ r: 2.5 }} connectNulls={false} />}
            {netLine && <Line yAxisId="r" dataKey="netCum" name="זכאות נטו לאחר עכבון" stroke={C.net} strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} />}
            {todayLabel && <ReferenceLine yAxisId="r" x={todayLabel} stroke={C.amber} strokeDasharray="4 3" strokeWidth={1.2} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ================= activity table ================= */
function ActivityTable({ acts, setters, discount, exec, locked, font }) {
  const { setField, setFieldCascade, setStart, setFinish, setDuration, remove, add } = setters;
  const btn = { fontFamily: font, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "none", background: C.ink, color: "#fff", cursor: "pointer", opacity: locked ? 0.5 : 1 };
  const dis = locked;
  const heads = exec
    ? ["פרק", "WBS", "פעילות", "עלות אומדן", "לאחר הנחה", "התחלה", "משך", "סיום", "קודמת", "% ביצוע", "עלות בפועל", ""]
    : ["פרק", "WBS", "פעילות", "עלות אומדן", "לאחר הנחה", "התחלה", "משך", "סיום", "קודמת", ""];
  return (
    <div style={{ ...panel, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>פעילויות ({acts.length}) <span style={{ fontWeight: 400, fontSize: 11.5, color: C.muted }}>· משך 0 = אבן דרך ◆</span></div>
        <button style={btn} disabled={dis} onClick={add}>+ הוסף פעילות</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: exec ? 1150 : 950 }}>
          <thead>
            <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
              {heads.map((h) => <th key={h} style={{ padding: "9px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {acts.map((a) => {
              const meta = metaOf(a.wbs);
              const after = (a.cost || 0) * (1 - discount / 100);
              return (
                <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, display: "inline-block" }} />
                      <b style={{ color: C.ink }}>{meta.id || "◆"}</b>
                    </span>
                  </td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} value={a.wbs} onChange={(e) => setFieldCascade(a.id, "wbs", e.target.value)} style={{ width: 52, ...cell }} /></td>
                  <td style={{ padding: "4px 8px", minWidth: 190 }}><input disabled={dis} value={a.name} onChange={(e) => setField(a.id, "name", e.target.value)} style={{ width: "100%", ...cell }} /></td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} type="number" value={a.cost} onChange={(e) => setField(a.id, "cost", parseFloat(e.target.value) || 0)} style={{ width: 96, ...cell, textAlign: "left" }} /></td>
                  <td style={{ padding: "4px 10px", color: C.green, fontWeight: 600, whiteSpace: "nowrap" }}>{shekel(after)}</td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} type="date" dir="ltr" value={a.start} onChange={(e) => setStart(a.id, e.target.value)} style={{ ...cell, width: 126, textAlign: "center" }} /></td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} type="number" min="0" dir="ltr" value={a.duration} onChange={(e) => setDuration(a.id, e.target.value)} style={{ ...cell, width: 58, textAlign: "center" }} /></td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} type="date" dir="ltr" value={a.finish} onChange={(e) => setFinish(a.id, e.target.value)} style={{ ...cell, width: 126, textAlign: "center" }} /></td>
                  <td style={{ padding: "4px 8px" }}><input disabled={dis} value={a.pred || ""} placeholder="WBS" onChange={(e) => setFieldCascade(a.id, "pred", e.target.value.trim())} style={{ width: 52, ...cell, textAlign: "center" }} /></td>
                  {exec && (
                    <>
                      <td style={{ padding: "4px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <input type="number" min="0" max="100" value={a.progress || 0} onChange={(e) => setField(a.id, "progress", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} style={{ width: 52, ...cell, textAlign: "center" }} />
                          <div style={{ width: 38, height: 5, background: "#E8EDF2", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${a.progress || 0}%`, height: "100%", background: meta.color }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "4px 8px" }}><input type="number" value={a.actual || 0} onChange={(e) => setField(a.id, "actual", parseFloat(e.target.value) || 0)} style={{ width: 96, ...cell, textAlign: "left" }} /></td>
                    </>
                  )}
                  <td style={{ padding: "4px 8px", textAlign: "center" }}>
                    <button disabled={dis} onClick={() => remove(a.id)} title="מחק" style={{ border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 16, lineHeight: 1, opacity: dis ? 0.4 : 1 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EvmCard = ({ label, value, sub, good }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", flex: "1 1 130px", minWidth: 130 }}>
    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, color: good === true ? C.green : good === false ? C.red : C.ink }}>{value}</div>
    {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2 }}>{sub}</div>}
  </div>
);

/* ================= narrative analysis (auto-written from the numbers) ================= */
function buildNarrative({ evm, endDelta, retention, invoices, baseAfter, curAfter, critNames }) {
  const P = [];
  const last = invoices.length ? [...invoices].sort((a, b) => (a.date > b.date ? 1 : -1)).at(-1) : null;
  const extras = last ? Number(last.extras) || 0 : 0;
  const pct = evm.pctComplete;

  /* headline */
  const sched = evm.SPI == null ? null : evm.SPI >= 1.03 ? "מקדים את לוח הזמנים" : evm.SPI <= 0.97 ? "מפגר אחרי לוח הזמנים" : "בקצב תואם לתכנית";
  const cost = evm.CPI == null ? null : evm.CPI >= 1.03 ? "מתחת לתקציב" : evm.CPI <= 0.97 ? "חורג מהתקציב" : "בהתאם לתקציב";
  let head = `הפרויקט הושלם בכ-${pct.toFixed(0)}%.`;
  if (sched && cost) head += ` מבחינת ביצוע הוא ${sched} ומבחינה כספית ${cost}.`;
  P.push({ t: "תמונת מצב כללית", body: head, tone: (evm.SPI >= 1 && evm.CPI >= 1) ? "good" : (evm.SPI < 0.95 || evm.CPI < 0.95) ? "bad" : "warn" });

  /* schedule */
  if (evm.SPI != null) {
    let b = `מדד לוח הזמנים SPI = ${evm.SPI.toFixed(2)}. `;
    if (evm.SPI >= 1.03) b += `הערך המזוכה (${shekelShort(evm.EV)}) גבוה מהמתוכנן (${shekelShort(evm.PV)}) — הצוות ביצע יותר ממה שתוכנן לנקודה זו, קדימות של ${shekelShort(evm.SV)}.`;
    else if (evm.SPI <= 0.97) b += `בוצעו עבודות בשווי ${shekelShort(evm.EV)} מול תכנון של ${shekelShort(evm.PV)} — פיגור של ${shekelShort(-evm.SV)}. כדאי לבחון האם הפיגור על הנתיב הקריטי.`;
    else b += `הביצוע צמוד לתכנון (סטייה ${shekelShort(evm.SV)}), ללא חשש מיוחד ללוח הזמנים.`;
    P.push({ t: "לוח זמנים", body: b, tone: evm.SPI >= 1 ? "good" : evm.SPI < 0.95 ? "bad" : "warn" });
  }

  /* cost */
  if (evm.CPI != null) {
    let b = `מדד העלות CPI = ${evm.CPI.toFixed(2)}. `;
    if (evm.CPI >= 1.03) b += `על כל שקל שהוצא התקבלה עבודה בשווי ${evm.CPI.toFixed(2)} ₪ — יעילות תקציבית, חיסכון של ${shekelShort(evm.CV)} עד כה.`;
    else if (evm.CPI <= 0.97) b += `על כל שקל שהוצא התקבלה עבודה בשווי ${evm.CPI.toFixed(2)} ₪ בלבד — חריגה של ${shekelShort(-evm.CV)}. בקצב הנוכחי האומדן בהשלמה (EAC) מגיע ל-${shekelShort(evm.EAC)}, ${evm.VAC < 0 ? `חריגה צפויה של ${shekelShort(-evm.VAC)} מהתקציב` : "עדיין בגבול התקציב"}.`;
    else b += `העלות בפועל תואמת את הערך שהופק (סטייה ${shekelShort(evm.CV)}).`;
    P.push({ t: "עלות ותקציב", body: b, tone: evm.CPI >= 1 ? "good" : evm.CPI < 0.95 ? "bad" : "warn" });
  }

  /* forecast */
  if (evm.EAC != null) {
    let b = `בהינתן ביצועי העלות עד כה, האומדן להשלמת הפרויקט (EAC) עומד על ${shekel(evm.EAC)}, מתוכם נותרו להוצאה כ-${shekel(evm.ETC)} (ETC). `;
    b += evm.VAC >= 0 ? `הצפי הוא לסיום עם עודף של ${shekelShort(evm.VAC)} מול תקציב הבסיס (${shekelShort(evm.BAC)}).` : `הצפי הוא לחריגה של ${shekelShort(-evm.VAC)} מעל תקציב הבסיס (${shekelShort(evm.BAC)}).`;
    P.push({ t: "תחזית להשלמה", body: b, tone: evm.VAC >= 0 ? "good" : "bad" });
  }

  /* extras / change orders */
  if (extras > 0) {
    const ex = baseAfter > 0 ? (extras / baseAfter) * 100 : 0;
    P.push({
      t: "חריגים ופקודות שינוי",
      body: `עד כה אושרו חריגים/נוספים בהיקף מצטבר של ${shekel(extras)} (${ex.toFixed(1)}% מתקציב הבסיס). סכום זה נכלל בעלות בפועל (AC) ולכן מושך את ה-CPI כלפי מטה. אם מדובר בהרחבת היקף מאושרת ולא בחריגה תפעולית, כדאי לעדכן את תקציב החוזה כדי שהמדדים ישקפו את המצב נכון.`,
      tone: ex > 5 ? "warn" : "info",
    });
  }

  /* retention / cash */
  if (last) {
    const net = evm.AC * (1 - retention / 100);
    P.push({
      t: "תזרים ועכבון",
      body: `מסך החשבונות המאושרים (${shekel(evm.AC)}) מנוכה עכבון ${retention}% בסך ${shekel(evm.AC * retention / 100)}, כך שהתקבול נטו בפועל עומד על ${shekel(net)}. יתרת העכבון תשוחרר במסירה.`,
      tone: "info",
    });
  }

  /* schedule finish + critical path */
  let fb = "";
  if (endDelta != null && endDelta !== 0) fb += endDelta > 0 ? `הסיום הצפוי מאוחר ב-${endDelta} ימים מתכנית הבסיס. ` : `הסיום הצפוי מוקדם ב-${-endDelta} ימים מתכנית הבסיס. `;
  else fb += "הסיום הצפוי תואם את תכנית הבסיס. ";
  if (critNames && critNames.length) fb += `הנתיב הקריטי עובר דרך: ${critNames.slice(0, 4).join(", ")}${critNames.length > 4 ? " ועוד" : ""} — עיכוב בפעילויות אלה יידחה את סיום הפרויקט.`;
  P.push({ t: "לוח זמנים ונתיב קריטי", body: fb, tone: endDelta > 0 ? "warn" : "good" });

  /* recommendation */
  const recs = [];
  if (evm.SPI != null && evm.SPI < 0.97) recs.push("להאיץ פעילויות על הנתיב הקריטי או להקצות משאבים נוספים כדי לצמצם את הפיגור");
  if (evm.CPI != null && evm.CPI < 0.97) recs.push("לבחון את מקורות החריגה בעלות ולעדכן תחזית תזרים למזמין");
  if (extras > (baseAfter * 0.05)) recs.push("להסדיר את החריגים מול המזמין ולעדכן את תקציב החוזה");
  if (evm.SPI >= 1 && evm.CPI >= 1) recs.push("לשמר את הקצב הנוכחי ולעדכן חשבונות באופן שוטף כדי לשמור על תמונת מצב מדויקת");
  if (!recs.length) recs.push("להמשיך במעקב חודשי ולעדכן אחוזי ביצוע וחשבונות בזמן אמת");
  P.push({ t: "המלצות", body: recs.map((r) => "• " + r).join("\n"), tone: "info" });

  return P;
}

const TONE_BG = { good: "#EEF7F1", bad: "#FBEEEC", warn: "#FDF6E9", info: "#F0F4F8" };
const TONE_BAR = { good: C.green, bad: C.red, warn: C.amber, info: C.baseGray };
function Narrative({ items }) {
  return (
    <div style={{ ...panel, padding: "16px 16px 8px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>ניתוח וממצאים</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 10, background: TONE_BG[it.tone], borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ width: 4, borderRadius: 3, background: TONE_BAR[it.tone], flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{it.t}</div>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.7, whiteSpace: "pre-line" }}>{it.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= main ================= */
export default function App() {
  const [tab, setTab] = useState("base");
  const [baseline, setBaseline] = useState(BASE_SEED);
  const [current, setCurrent] = useState(CUR_SEED);
  const [invoices, setInvoices] = useState(INV_SEED);
  const [locked, setLocked] = useState(true);
  const [discount, setDiscount] = useState(11.11);
  const [retention, setRetention] = useState(5);
  const [statusISO, setStatusISO] = useState("");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [saveState, setSaveState] = useState("");
  const fileRef = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Heebo:wght@400;600;800&display=swap";
    document.head.appendChild(l);
    return () => { try { document.head.removeChild(l); } catch (e) {} };
  }, []);

  /* ---- payload helpers ---- */
  const defaultPayload = () => ({ baseline: BASE_SEED, current: CUR_SEED, invoices: INV_SEED, discount: 11.11, retention: 5, locked: true, statusISO: "" });
  const emptyPayload = () => ({ baseline: [], current: [], invoices: [], discount: 11.11, retention: 5, locked: false, statusISO: "" });
  const applyPayload = (d) => {
    setBaseline(Array.isArray(d.baseline) ? d.baseline : BASE_SEED);
    setCurrent(Array.isArray(d.current) ? d.current : CUR_SEED);
    setInvoices(Array.isArray(d.invoices) ? d.invoices : []);
    setDiscount(typeof d.discount === "number" ? d.discount : 11.11);
    setRetention(typeof d.retention === "number" ? d.retention : 5);
    setLocked(typeof d.locked === "boolean" ? d.locked : true);
    setStatusISO(typeof d.statusISO === "string" ? d.statusISO : "");
  };
  const currentPayload = () => ({ baseline, current, invoices, discount, retention, locked, statusISO });

  /* ---- load projects index + active project (with one-time legacy migration) ---- */
  useEffect(() => {
    (async () => {
      let idx = [];
      try { const r = await storage.get(IDX_KEY); if (r?.value) idx = JSON.parse(r.value); } catch (e) {}
      if (!Array.isArray(idx)) idx = [];
      if (!idx.length) {
        let legacy = null;
        try { const lr = await storage.get(LEGACY_KEY); if (lr?.value) legacy = JSON.parse(lr.value); } catch (e) {}
        const id = newId();
        idx = [{ id, name: "שדרוג מרכז המים — בית אלעזר" }];
        const payload = legacy ? { ...defaultPayload(), ...legacy } : defaultPayload();
        try { await storage.set(PROJ_PREFIX + id, JSON.stringify(payload)); await storage.set(IDX_KEY, JSON.stringify(idx)); } catch (e) {}
        applyPayload(payload); setProjects(idx); setProjectId(id);
      } else {
        const id = idx[0].id;
        let payload = defaultPayload();
        try { const pr = await storage.get(PROJ_PREFIX + id); if (pr?.value) payload = JSON.parse(pr.value); } catch (e) {}
        applyPayload(payload); setProjects(idx); setProjectId(id);
      }
      loadedRef.current = true;
    })();
  }, []);

  /* ---- autosave current project (debounced) ---- */
  useEffect(() => {
    if (!loadedRef.current || !projectId) return;
    setSaveState("שומר…");
    const t = setTimeout(async () => {
      try {
        await storage.set(PROJ_PREFIX + projectId, JSON.stringify(currentPayload()));
        setSaveState("נשמר ✓");
      } catch (e) { setSaveState("שמירה נכשלה"); }
    }, 700);
    return () => clearTimeout(t);
  }, [projectId, baseline, current, invoices, discount, retention, locked, statusISO]);

  /* ---- persist project index whenever it changes ---- */
  useEffect(() => {
    if (!loadedRef.current || !projects.length) return;
    (async () => { try { await storage.set(IDX_KEY, JSON.stringify(projects)); } catch (e) {} })();
  }, [projects]);

  const projName = projects.find((p) => p.id === projectId)?.name || "פרויקט";

  const switchProject = async (id) => {
    if (!id || id === projectId) return;
    let payload = defaultPayload();
    try { const r = await storage.get(PROJ_PREFIX + id); if (r?.value) payload = JSON.parse(r.value); } catch (e) {}
    applyPayload(payload); setProjectId(id); setTab("base");
  };
  const createProject = async () => {
    const name = window.prompt("שם הפרויקט החדש:", "פרויקט חדש");
    if (!name) return;
    const id = newId();
    const payload = emptyPayload();
    try { await storage.set(PROJ_PREFIX + id, JSON.stringify(payload)); } catch (e) {}
    setProjects((p) => [...p, { id, name }]);
    applyPayload(payload); setProjectId(id); setTab("base");
  };
  const duplicateProject = async () => {
    const name = window.prompt("שם העותק:", projName + " (עותק)");
    if (!name) return;
    const id = newId();
    try { await storage.set(PROJ_PREFIX + id, JSON.stringify(currentPayload())); } catch (e) {}
    setProjects((p) => [...p, { id, name }]);
    setProjectId(id); setTab("base");
  };
  const renameProject = () => {
    const cur = projects.find((p) => p.id === projectId);
    const name = window.prompt("שם הפרויקט:", cur?.name || "");
    if (!name) return;
    setProjects((p) => p.map((x) => (x.id === projectId ? { ...x, name } : x)));
  };
  const deleteProject = async () => {
    if (projects.length <= 1) { alert("לא ניתן למחוק את הפרויקט היחיד."); return; }
    const cur = projects.find((p) => p.id === projectId);
    if (!window.confirm(`למחוק את הפרויקט "${cur?.name}"? פעולה זו בלתי הפיכה.`)) return;
    try { await storage.delete(PROJ_PREFIX + projectId); } catch (e) {}
    const remaining = projects.filter((p) => p.id !== projectId);
    setProjects(remaining);
    const nid = remaining[0].id;
    let payload = defaultPayload();
    try { const r = await storage.get(PROJ_PREFIX + nid); if (r?.value) payload = JSON.parse(r.value); } catch (e) {}
    applyPayload(payload); setProjectId(nid); setTab("base");
  };

  const resetAll = async () => {
    if (!window.confirm("לאפס את הפרויקט הנוכחי לנתוני ברירת המחדל?")) return;
    applyPayload(defaultPayload());
  };

  const baseModel = useMemo(() => buildModel(baseline, discount), [baseline, discount]);
  const curModel = useMemo(() => buildModel(current, discount), [current, discount]);
  const baseByWbs = useMemo(() => { const m = {}; baseline.forEach((b) => { if (b.wbs) m[b.wbs] = b; }); return m; }, [baseline]);
  const datedInv = useMemo(() => invoices.filter((i) => toDate(i.date)).sort((a, b) => toDate(a.date) - toDate(b.date)), [invoices]);
  const statusDate = useMemo(() => (statusISO ? toDate(statusISO) : (datedInv.length ? toDate(datedInv.at(-1).date) : new Date())), [statusISO, datedInv]);
  const evm = useMemo(() => buildEvm(baseline, current, invoices, discount, baseByWbs, statusDate), [baseline, current, invoices, discount, baseByWbs, statusDate]);

  const today = new Date();
  const labelOfToday = (months) => {
    const mo = months.find((x) => today >= x.start && today <= new Date(x.start.getFullYear(), x.start.getMonth() + 1, 0));
    return mo ? mo.label : null;
  };

  const mkSetters = (setFn) => ({
    setField: (id, f, v) => setFn((p) => p.map((a) => (a.id === id ? { ...a, [f]: v } : a))),
    setFieldCascade: (id, f, v) => setFn((p) => cascade(p.map((a) => (a.id === id ? { ...a, [f]: v, ...(f === "pred" ? { manual: false } : {}) } : a)))),
    setStart: (id, v) => setFn((p) => cascade(p.map((a) => (a.id === id ? { ...a, start: v, finish: addDaysISO(v, a.duration), manual: true } : a)), id)),
    setFinish: (id, v) => setFn((p) => cascade(p.map((a) => (a.id === id ? { ...a, finish: v, start: addDaysISO(v, -a.duration), manual: true } : a)), id)),
    setDuration: (id, v) => setFn((p) => cascade(p.map((a) => {
      const dur = Math.max(0, Math.round(Number(v) || 0));
      return a.id === id ? { ...a, duration: dur, finish: addDaysISO(a.start, dur), manual: true } : a;
    }), id)),
    remove: (id) => setFn((p) => p.filter((a) => a.id !== id)),
    add: () => setFn((p) => [...p, { id: (p.at(-1)?.id || 0) + 1, wbs: "", name: "פעילות חדשה", cost: 0, start: "2026-01-01", finish: "2026-01-31", duration: 30, progress: 0, actual: 0, pred: "" }]),
  });
  const baseSetters = useMemo(() => mkSetters(setBaseline), []);
  const curSetters = useMemo(() => mkSetters(setCurrent), []);

  const attachActuals = (months) => months.map((mo) => {
    const end = new Date(mo.start.getFullYear(), mo.start.getMonth() + 1, 0);
    const paidRows = invoices.filter((i) => toDate(i.date) && toDate(i.date) <= end).sort((x, y) => toDate(x.date) - toDate(y.date));
    const last = paidRows.length ? paidRows.at(-1) : null;
    const actualCum = last ? invApproved(last) : null;
    const paidCum = last ? invPaidC(last) : null;
    const invPaid = invoices.some((i) => { const d = toDate(i.date); return d && d >= mo.start && d <= end; });
    return { ...mo, actualCum, paidCum, invPaid, netCum: actualCum != null ? actualCum * (1 - retention / 100) : null };
  });
  const curMonthsWithActual = useMemo(() => attachActuals(curModel.months), [curModel, invoices, retention]);

  const compMonths = useMemo(() => {
    const map = new Map();
    baseModel.months.forEach((mo) => map.set(+mo.start, { start: mo.start, label: mo.label, baseCum: mo.cumulative }));
    curModel.months.forEach((mo) => {
      const o = map.get(+mo.start) || { start: mo.start, label: mo.label };
      o.curCum = mo.cumulative;
      map.set(+mo.start, o);
    });
    const arr = [...map.values()].sort((a, b) => a.start - b.start);
    let lb = 0, lc = 0;
    arr.forEach((o) => {
      if (o.baseCum == null) o.baseCum = lb; else lb = o.baseCum;
      if (o.curCum == null) o.curCum = lc; else lc = o.curCum;
      const end = new Date(o.start.getFullYear(), o.start.getMonth() + 1, 0);
      const paidRows = invoices.filter((i) => toDate(i.date) && toDate(i.date) <= end).sort((x, y) => toDate(x.date) - toDate(y.date));
      const last = paidRows.length ? paidRows.at(-1) : null;
      o.actualCum = last ? invApproved(last) : null;
      o.paidCum = last ? invPaidC(last) : null;
      o.invPaid = invoices.some((i) => { const d = toDate(i.date); return d && d >= o.start && d <= end; });
      o.netCum = o.actualCum != null ? o.actualCum * (1 - retention / 100) : null;
    });
    return arr;
  }, [baseModel, curModel, invoices, retention]);

  /* SPI/CPI trend at each invoice date */
  const trend = useMemo(() => [...invoices]
    .filter((i) => toDate(i.date))
    .sort((a, b) => toDate(a.date) - toDate(b.date))
    .map((inv) => {
      const t = toDate(inv.date);
      const { PV, EV } = evmAt(baseline, current, t, discount, baseByWbs);
      const AC = invApproved(inv);
      return { label: fmtDate(t), SPI: PV > 0 ? EV / PV : null, CPI: AC > 0 ? EV / AC : null };
    }), [invoices, baseline, current, discount, baseByWbs]);

  const setInv = (id, f, v) => setInvoices((p) => p.map((i) => (i.id === id ? { ...i, [f]: v } : i)).sort((a, b) => (a.date > b.date ? 1 : -1)));
  const addInv = () => setInvoices((p) => [...p, { id: (p.at(-1)?.id || 0) + 1, date: isoOf(new Date()), cumulative: p.at(-1)?.cumulative || 0, extras: p.at(-1)?.extras || 0, paid: "" }]);
  const rmInv = (id) => setInvoices((p) => p.filter((i) => i.id !== id));

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    const planSheet = (acts, name) => {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(acts.map((a) => ({
        "פרק": metaOf(a.wbs).id || "", "WBS": a.wbs, "פעילות": a.name,
        "עלות אומדן (₪)": Math.round(a.cost || 0), "לאחר הנחה (₪)": Math.round((a.cost || 0) * (1 - discount / 100)),
        "התחלה": fmtDate(toDate(a.start)), "משך (ימים)": a.duration, "סיום": fmtDate(toDate(a.finish)),
        "קודמת": a.pred || "", "% ביצוע": a.progress || 0, "עלות בפועל (₪)": Math.round(a.actual || 0),
      }))), name);
    };
    planSheet(baseline, "תכנית בסיס");
    planSheet(current, "תכנית מתעדכנת");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compMonths.map((m) => ({
      "חודש": m.label, "מצטבר בסיס (₪)": Math.round(m.baseCum), "מצטבר מתעדכן (₪)": Math.round(m.curCum),
      "חשבונות מצטברים (₪)": m.actualCum != null ? Math.round(m.actualCum) : "",
      "נטו לאחר עכבון (₪)": m.netCum != null ? Math.round(m.netCum) : "",
    }))), "השוואת תזרים");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoices.map((i, idx) => ({
      "תאריך": fmtDate(toDate(i.date)), "חוזה מצטבר (₪)": Math.round(i.cumulative),
      "חריגים/נוספים מצטבר (₪)": Math.round(i.extras || 0),
      "מאושר מצטבר (₪)": Math.round(invApproved(i)),
      "שולם מצטבר (₪)": Math.round(invPaidC(i)),
      "פער אישור-תשלום (₪)": Math.round(invApproved(i) - invPaidC(i)),
      "חודשי מאושר (₪)": Math.round(invApproved(i) - (idx > 0 ? invApproved(invoices[idx - 1]) : 0)),
      [`עכבון ${retention}% (₪)`]: Math.round(invApproved(i) * retention / 100),
      "זכאות נטו (₪)": Math.round(invApproved(i) * (1 - retention / 100)),
    }))), "חשבונות");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["מדד", "ערך"],
      ["BAC", Math.round(evm.BAC)], ["PV", Math.round(evm.PV)], ["EV", Math.round(evm.EV)], ["AC", Math.round(evm.AC)],
      ["SV", Math.round(evm.SV)], ["CV", Math.round(evm.CV)], ["SPI", evm.SPI], ["CPI", evm.CPI],
      ["EAC", evm.EAC], ["ETC", evm.ETC], ["VAC", evm.VAC], ["% השלמה", evm.pctComplete]]), "EVM");
    XLSX.writeFile(wb, "בקרה_תקציבית_בסיס_מול_ביצוע.xlsx");
  };

  const importXlsx = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws);
        const parsed = json.map((r, i) => {
          const keys = Object.keys(r);
          const pick = (opts) => keys.find((k) => opts.some((o) => k.includes(o)));
          const g = (opts) => { const k = pick(opts); return k ? r[k] : undefined; };
          const toISO = (v) => {
            if (!v) return "";
            if (v instanceof Date) return isoOf(v);
            const s = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (s) { let yy = s[3].length === 2 ? "20" + s[3] : s[3]; return `${yy}-${s[2].padStart(2, "0")}-${s[1].padStart(2, "0")}`; }
            return String(v);
          };
          const start = toISO(g(["התחלה", "start"])), finish = toISO(g(["סיום", "finish"]));
          return {
            id: i + 1, wbs: String(g(["WBS", "wbs"]) ?? ""), name: String(g(["פעילות", "תיאור", "שם", "name"]) ?? ""),
            cost: Number(String(g(["עלות אומדן", "עלות", "cost"]) ?? 0).replace(/[^\d.-]/g, "")) || 0,
            start, finish, duration: daysBetween(start, finish),
            pred: String(g(["קודמת", "pred"]) ?? ""), progress: Number(g(["% ביצוע", "ביצוע", "progress"])) || 0,
            actual: Number(String(g(["בפועל", "actual"]) ?? 0).replace(/[^\d.-]/g, "")) || 0,
          };
        }).filter((a) => a.name);
        if (!parsed.length) { alert("לא נמצאו פעילויות בקובץ."); return; }
        if (tab === "base") setBaseline(cascade(parsed));
        else setCurrent(cascade(parsed));
      } catch (err) { alert("שגיאה בקריאת הקובץ: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const copyBaseToCurrent = () => {
    if (!window.confirm("להחליף את התכנית המתעדכנת בעותק של תכנית הבסיס?")) return;
    setCurrent(baseline.map((a) => ({ ...a, progress: 0, actual: 0 })));
  };

  const font = "'Assistant','Heebo','Segoe UI',Arial,sans-serif";
  const btn = { fontFamily: font, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.ink, cursor: "pointer" };
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} style={{
      ...btn, borderRadius: 0, border: "none", borderBottom: tab === id ? `3px solid ${C.ink}` : "3px solid transparent",
      background: "transparent", fontWeight: tab === id ? 800 : 600, color: tab === id ? C.ink : C.muted, fontSize: 14, padding: "10px 16px",
    }}>{label}</button>
  );

  const endDelta = baseModel.totals.endDate && curModel.totals.endDate
    ? Math.round((curModel.totals.endDate - baseModel.totals.endDate) / DAY) : null;
  const lastInv = invoices.length ? invoices[invoices.length - 1] : null;

  /* critical-path activity names from the current plan (for the narrative) */
  const critNames = useMemo(() => {
    const v = current.map((a) => ({ ...a, f: toDate(a.finish) })).filter((a) => a.f);
    if (!v.length) return [];
    const by = {}; v.forEach((a) => { if (a.wbs) by[a.wbs] = a; });
    const succ = {}; v.forEach((a) => { if (a.pred && by[a.pred]) (succ[a.pred] = succ[a.pred] || []).push(a.wbs); });
    const memo = {};
    const reach = (w, d = 0) => { if (memo[w] != null) return memo[w]; if (d > 50) return 0; let r = +by[w].f; (succ[w] || []).forEach((s) => { r = Math.max(r, reach(s, d + 1)); }); memo[w] = r; return r; };
    const linked = v.filter((a) => a.pred || succ[a.wbs]);
    const linkedEnd = linked.length ? Math.max(...linked.map((a) => reach(a.wbs))) : null;
    const projEnd = Math.max(...v.map((a) => +a.f));
    return v.filter((a) => a.wbs && (reach(a.wbs) === projEnd || (linkedEnd != null && (a.pred || succ[a.wbs]) && reach(a.wbs) === linkedEnd)))
      .sort((a, b) => a.f - b.f).map((a) => a.name.replace(/^◆\s*/, ""));
  }, [current]);

  const narrative = useMemo(() => buildNarrative({
    evm, endDelta, retention, invoices,
    baseAfter: baseModel.totals.totalAfter || 0, curAfter: curModel.totals.totalAfter || 0, critNames,
  }), [evm, endDelta, retention, invoices, baseModel, curModel, critNames]);

  return (
    <div dir="rtl" style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.ink, padding: "20px 22px" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .print-only { display: block !important; }
          .tab-panel { break-inside: avoid; }
          @page { size: A4 landscape; margin: 12mm; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="print-only" style={{ marginBottom: 14, borderBottom: `2px solid ${C.ink}`, paddingBottom: 8 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{projName}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
          {{ base: "תכנית בסיס", cur: "תכנית מתעדכנת", comp: "השוואה + EVM", inv: "חשבונות", report: "דוח בקרה תקציבית" }[tab]} · הופק ב-{fmtDate(today)}
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>{projName}</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>
            בקרה תקציבית: בסיס · מתעדכן · השוואה + EVM · דוח
            {saveState && <span style={{ marginInlineStart: 10, fontSize: 11.5, color: saveState.includes("✓") ? C.green : C.muted }}>{saveState}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "4px 8px" }}>
            <span style={{ fontSize: 12, color: C.muted }}>פרויקט</span>
            <select value={projectId || ""} onChange={(e) => switchProject(e.target.value)} style={{ ...cell, fontFamily: font, cursor: "pointer", maxWidth: 200 }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button title="פרויקט חדש" onClick={createProject} style={{ ...btn, padding: "5px 9px", fontSize: 15, lineHeight: 1 }}>＋</button>
            <button title="שכפל פרויקט" onClick={duplicateProject} style={{ ...btn, padding: "5px 9px", fontSize: 13, lineHeight: 1 }}>⧉</button>
            <button title="שנה שם" onClick={renameProject} style={{ ...btn, padding: "5px 9px", fontSize: 13, lineHeight: 1 }}>✎</button>
            <button title="מחק פרויקט" onClick={deleteProject} style={{ ...btn, padding: "5px 9px", fontSize: 13, lineHeight: 1, color: C.red }}>🗑</button>
          </div>
          {(() => {
            const paramsEditable = tab === "base" && !locked;
            return (
              <>
                <span style={{ fontSize: 12, color: C.muted }}>הנחה</span>
                <input type="number" step="0.01" value={discount} disabled={!paramsEditable} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: 66, padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontFamily: font, textAlign: "center", background: paramsEditable ? "#fff" : "#EEF1F5", color: paramsEditable ? C.ink : C.muted, cursor: paramsEditable ? "text" : "not-allowed" }} />
                <span style={{ fontSize: 12, color: C.muted }}>% · עכבון</span>
                <input type="number" step="0.5" value={retention} disabled={!paramsEditable} onChange={(e) => setRetention(Math.max(0, Math.min(20, parseFloat(e.target.value) || 0)))} style={{ width: 56, padding: "6px 8px", borderRadius: 7, border: `1px solid ${C.border}`, fontFamily: font, textAlign: "center", background: paramsEditable ? "#fff" : "#EEF1F5", color: paramsEditable ? C.ink : C.muted, cursor: paramsEditable ? "text" : "not-allowed" }} />
                <span style={{ fontSize: 12, color: C.muted }}>%{!paramsEditable && <span title="נערך רק בתכנית בסיס פתוחה" style={{ marginInlineStart: 4 }}>🔒</span>}</span>
              </>
            );
          })()}
          <button style={btn} onClick={() => fileRef.current?.click()}>ייבוא Excel ({tab === "base" ? "לבסיס" : "למתעדכן"})</button>
          <button style={btn} onClick={exportXlsx}>ייצוא Excel</button>
          <button style={{ ...btn, background: C.ink, color: "#fff", border: "none" }} onClick={() => window.print()}>🖨 הדפס / PDF</button>
          <button style={{ ...btn, color: C.red }} onClick={resetAll}>איפוס</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={importXlsx} style={{ display: "none" }} />
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginBottom: 16, flexWrap: "wrap" }}>
        {tabBtn("base", "① תכנית בסיס")}
        {tabBtn("cur", "② תכנית מתעדכנת")}
        {tabBtn("comp", "③ השוואה + EVM")}
        {tabBtn("inv", "④ חשבונות")}
        {tabBtn("report", "⑤ דוח")}
      </div>

      {/* ===== TAB 1: BASELINE ===== */}
      {tab === "base" && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            <Kpi label="תקציב בסיס (אומדן)" value={shekel(baseModel.totals.totalCost)} />
            <Kpi label="בסיס לאחר הנחה (BAC)" value={shekel(baseModel.totals.totalAfter)} accent={C.green} />
            <Kpi label="משך" value={`${baseModel.totals.span || 0} חודשים`} sub={baseModel.totals.startDate ? `${fmtDate(baseModel.totals.startDate)} – ${fmtDate(baseModel.totals.endDate)}` : ""} />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px", display: "flex", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{locked ? "🔒 הבסיס נעול" : "🔓 הבסיס פתוח לעריכה"}</div>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>הנחה ({discount}%) ועכבון ({retention}%) נערכים כאן</div>
              </div>
              <button style={btn} onClick={() => setLocked(!locked)}>{locked ? "פתח לעריכה" : "נעל בסיס"}</button>
            </div>
          </div>
          <FlowChart title="תזרים חודשי — תכנית בסיס" months={baseModel.months} groupsPresent={baseModel.groupsPresent} todayLabel={labelOfToday(baseModel.months)} font={font} />
          <Gantt title="גאנט — תכנית בסיס" activities={baseline} discount={discount} readOnly={locked}
            onShift={baseSetters.setStart} onResize={baseSetters.setDuration} />
          <ActivityTable acts={baseline} setters={baseSetters} discount={discount} exec={false} locked={locked} font={font} />
        </>
      )}

      {/* ===== TAB 2: CURRENT ===== */}
      {tab === "cur" && (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            <Kpi label="אומדן מתעדכן" value={shekel(curModel.totals.totalCost)} />
            <Kpi label="מתעדכן לאחר הנחה" value={shekel(curModel.totals.totalAfter)} accent={C.green} />
            <Kpi label="משך" value={`${curModel.totals.span || 0} חודשים`} sub={curModel.totals.startDate ? `${fmtDate(curModel.totals.startDate)} – ${fmtDate(curModel.totals.endDate)}` : ""} />
            <Kpi label="סיום צפוי" value={fmtDate(curModel.totals.endDate)} accent={endDelta > 0 ? C.red : C.ink} sub={endDelta != null && endDelta !== 0 ? (endDelta > 0 ? `‎+${endDelta} ימים מול בסיס` : `‎${endDelta} ימים מול בסיס`) : "בהתאם לבסיס"} />
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px" }}>
              <button style={btn} onClick={copyBaseToCurrent}>טען מחדש מהבסיס</button>
            </div>
          </div>
          <FlowChart title="תזרים חודשי — מתעדכן (+ חשבונות בפועל ונטו אחרי עכבון)" months={curMonthsWithActual} groupsPresent={curModel.groupsPresent} todayLabel={labelOfToday(curModel.months)} font={font} extraLine netLine />
          <Gantt title="גאנט — תכנית מתעדכנת (פס אפור = בסיס)" activities={current} discount={discount}
            baselineByWbs={baseByWbs} onShift={curSetters.setStart} onResize={curSetters.setDuration} />
          <ActivityTable acts={current} setters={curSetters} discount={discount} exec={true} locked={false} font={font} />
        </>
      )}

      {/* ===== TAB 3: COMPARISON + EVM ===== */}
      {tab === "comp" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, margin: "0 4px 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>מדדי EVM — לתאריך חשבון <span style={{ fontWeight: 400, fontSize: 12, color: C.muted }}>(AC לפי {evm.acSource})</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 10px" }}>
              <span style={{ fontSize: 12, color: C.muted }}>תאריך סטטוס</span>
              <select value={statusISO} onChange={(e) => setStatusISO(e.target.value)} style={{ ...cell, fontFamily: font, cursor: "pointer" }}>
                <option value="">אחרון ({fmtDate(evm.statusDate)})</option>
                {datedInv.map((i) => <option key={i.id} value={i.date}>{fmtDate(toDate(i.date))}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <EvmCard label="BAC · תקציב בסיס" value={shekelShort(evm.BAC)} />
            <EvmCard label="PV · ערך מתוכנן" value={shekelShort(evm.PV)} />
            <EvmCard label="EV · ערך מזוכה" value={shekelShort(evm.EV)} sub={`${evm.pctComplete.toFixed(1)}% השלמה`} />
            <EvmCard label="AC · חשבון מאושר" value={shekelShort(evm.AC)} sub={evm.unpaid > 0 ? `טרם שולם ${shekelShort(evm.unpaid)}` : "שולם במלואו"} good={evm.unpaid > 0 ? false : true} />
            <EvmCard label="SPI · ביצוע לו&quot;ז" value={ratio(evm.SPI)} sub={evm.SV >= 0 ? `SV ‎+${shekelShort(evm.SV)}` : `SV ‎−${shekelShort(-evm.SV)}`} good={evm.SPI == null ? undefined : evm.SPI >= 1} />
            <EvmCard label="CPI · ביצוע עלות" value={ratio(evm.CPI)} sub={evm.CV >= 0 ? `CV ‎+${shekelShort(evm.CV)}` : `CV ‎−${shekelShort(-evm.CV)}`} good={evm.CPI == null ? undefined : evm.CPI >= 1} />
            <EvmCard label="EAC · אומדן בהשלמה" value={shekelShort(evm.EAC)} sub={evm.VAC == null ? "" : evm.VAC >= 0 ? `VAC ‎+${shekelShort(evm.VAC)}` : `VAC ‎−${shekelShort(-evm.VAC)}`} good={evm.VAC == null ? undefined : evm.VAC >= 0} />
            <EvmCard label="סטיית סיום" value={endDelta == null ? "—" : endDelta === 0 ? "0 ימים" : `${endDelta > 0 ? "+" : ""}${endDelta} ימים`} good={endDelta == null ? undefined : endDelta <= 0} />
          </div>

          <Narrative items={narrative} />

          <div style={{ ...panel, padding: "16px 12px 8px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, padding: "0 8px 10px" }}>עקומות S: בסיס · מתעדכן · חשבונות בפועל · נטו אחרי עכבון</div>
            <div style={{ direction: "ltr", width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <ComposedChart data={compMonths} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} tickMargin={6} />
                  <YAxis tick={{ fontSize: 10, fill: C.muted }} tickFormatter={shekelShort} width={58} />
                  <Tooltip formatter={(v, n) => [shekel(v), n]} labelFormatter={(l) => "חודש " + l}
                    contentStyle={{ fontFamily: font, fontSize: 12, direction: "rtl", borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <Legend wrapperStyle={{ fontFamily: font, fontSize: 12 }} />
                  <Line dataKey="baseCum" name="בסיס (PV)" stroke={C.baseGray} strokeWidth={2.2} strokeDasharray="6 4" dot={false} />
                  <Line dataKey="curCum" name="מתעדכן" stroke={C.ink} strokeWidth={2.5} dot={false} />
                  <Line dataKey="actualCum" name="חשבון מאושר (AC)" stroke={C.amber} strokeWidth={2.5} dot={InvDot} activeDot={{ r: 7 }} connectNulls={false} />
                  <Line dataKey="paidCum" name="שולם בפועל" stroke={C.green} strokeWidth={2.2} dot={{ r: 2.5 }} connectNulls={false} />
                  <Line dataKey="netCum" name="זכאות נטו לאחר עכבון" stroke={C.net} strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls={false} />
                  {labelOfToday(compMonths) && <ReferenceLine x={labelOfToday(compMonths)} stroke={C.amber} strokeDasharray="4 3" strokeWidth={1.2} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ ...panel, padding: "16px 12px 8px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, padding: "0 8px 10px" }}>מגמת SPI / CPI לאורך זמן (בכל תאריך חשבון)</div>
            <div style={{ direction: "ltr", width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                  <CartesianGrid stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickMargin={6} />
                  <YAxis domain={[0.5, 1.5]} tick={{ fontSize: 10, fill: C.muted }} width={40} />
                  <Tooltip formatter={(v, n) => [ratio(v), n]} contentStyle={{ fontFamily: font, fontSize: 12, direction: "rtl", borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <Legend wrapperStyle={{ fontFamily: font, fontSize: 12 }} />
                  <ReferenceLine y={1} stroke={C.muted} strokeDasharray="3 3" />
                  <Line dataKey="SPI" name="SPI (לו&quot;ז)" stroke={C.ink} strokeWidth={2.2} dot={{ r: 3.5 }} />
                  <Line dataKey="CPI" name="CPI (עלות)" stroke={C.green} strokeWidth={2.2} dot={{ r: 3.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <Gantt title="גאנט השוואתי — מתעדכן מול בסיס (אפור)" activities={current} discount={discount}
            baselineByWbs={baseByWbs} readOnly onShift={() => {}} onResize={() => {}} />

        </>
      )}

      {/* ===== TAB 4: INVOICES ===== */}
      {tab === "inv" && (() => {
        const last = invoices.length ? [...invoices].sort((a, b) => (a.date > b.date ? 1 : -1)).at(-1) : null;
        const totApproved = last ? invApproved(last) : 0;
        const totPaid = last ? invPaidC(last) : 0;
        const totExtras = last ? Number(last.extras) || 0 : 0;
        const extrasPct = evm.BAC > 0 ? (totExtras / evm.BAC) * 100 : 0;
        return (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <Kpi label="מאושר מצטבר (AC)" value={shekel(totApproved)} sub={last ? `נכון ל-${fmtDate(toDate(last.date))}` : ""} />
              <Kpi label="שולם בפועל" value={shekel(totPaid)} accent={C.green} sub={`${totApproved > 0 ? ((totPaid / totApproved) * 100).toFixed(0) : 0}% מהמאושר`} />
              <Kpi label="פער אישור-תשלום" value={shekel(totApproved - totPaid)} accent={(totApproved - totPaid) > 0 ? C.red : C.ink} sub="מאושר שטרם שולם" />
              <Kpi label="מזה חריגים/נוספים" value={shekel(totExtras)} sub={`${extrasPct.toFixed(1)}% מתקציב הבסיס`} accent={totExtras > 0 ? C.amber : C.ink} />
              <Kpi label={`עכבון ${retention}%`} value={shekel(totApproved * retention / 100)} accent={C.red} />
            </div>

            <div style={{ ...panel, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>הזנת חשבונות חלקיים מצטברים</div>
                <button style={{ fontFamily: font, fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, border: "none", background: C.ink, color: "#fff", cursor: "pointer" }} onClick={addInv}>+ הוסף חשבון</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, maxWidth: 960 }}>
                  <thead>
                    <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                      {["תאריך חשבון", "חוזה מצטבר (₪)", "חריגים/נוספים מצטבר (₪)", "מאושר מצטבר", "שולם מצטבר (₪)", "פער אישור-תשלום", `עכבון ${retention}%`, "נטו מצטבר", ""].map((h) => <th key={h} style={{ padding: "9px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, idx) => (
                      <tr key={inv.id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "4px 12px" }}><input type="date" dir="ltr" value={inv.date} onChange={(e) => setInv(inv.id, "date", e.target.value)} style={{ ...cell, width: 130, textAlign: "center" }} /></td>
                        <td style={{ padding: "4px 12px" }}><input type="number" value={inv.cumulative} onChange={(e) => setInv(inv.id, "cumulative", parseFloat(e.target.value) || 0)} style={{ ...cell, width: 120, textAlign: "left" }} /></td>
                        <td style={{ padding: "4px 12px" }}><input type="number" value={inv.extras || 0} onChange={(e) => setInv(inv.id, "extras", parseFloat(e.target.value) || 0)} style={{ ...cell, width: 120, textAlign: "left", background: (inv.extras || 0) > 0 ? "#FFF7EA" : "#FCFDFE" }} /></td>
                        <td style={{ padding: "4px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{shekel(invApproved(inv))}</td>
                        <td style={{ padding: "4px 12px" }}><input type="number" placeholder={String(Math.round(invApproved(inv)))} value={inv.paid ?? ""} onChange={(e) => setInv(inv.id, "paid", e.target.value === "" ? "" : parseFloat(e.target.value) || 0)} style={{ ...cell, width: 120, textAlign: "left", color: C.green }} /></td>
                        <td style={{ padding: "4px 12px", color: (invApproved(inv) - invPaidC(inv)) > 0 ? C.red : C.muted, whiteSpace: "nowrap" }}>{shekel(invApproved(inv) - invPaidC(inv))}</td>
                        <td style={{ padding: "4px 12px", color: C.red, whiteSpace: "nowrap" }}>{shekel(invApproved(inv) * retention / 100)}</td>
                        <td style={{ padding: "4px 12px", color: C.net, fontWeight: 600, whiteSpace: "nowrap" }}>{shekel(invApproved(inv) * (1 - retention / 100))}</td>
                        <td style={{ padding: "4px 12px", textAlign: "center" }}>
                          <button onClick={() => rmInv(inv.id)} style={{ border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 16 }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: C.muted, padding: "10px 16px 14px", lineHeight: 1.6 }}>
                "חוזה מצטבר" = סעיפי החוזה. "חריגים/נוספים" = פקודות שינוי מצטבר. יחד = <b>מאושר מצטבר</b>, שהוא ה-AC ב-EVM (הקו הכתום). "שולם מצטבר" = הכסף שיצא בפועל (הקו הירוק, תזרים) — אם משאירים ריק, מונח שהמאושר שולם במלואו. הפער ביניהם הוא מאושר שטרם שולם. עכבון {retention}% מנוכה מהמאושר; יתרתו משוחררת במסירה.
              </div>
            </div>
          </>
        );
      })()}

      {/* ===== TAB 5: PRINTABLE REPORT ===== */}
      {tab === "report" && (
        <>
          <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button style={{ ...btn, background: C.ink, color: "#fff", border: "none" }} onClick={() => window.print()}>🖨 הדפס / שמור כ-PDF</button>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "28px 32px" }}>
            <div style={{ borderBottom: `2px solid ${C.ink}`, paddingBottom: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>דוח בקרה תקציבית חודשי</div>
              <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{projName} · תאריך סטטוס {fmtDate(evm.statusDate)}</div>
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>ניתוח וממצאים</div>
            <div style={{ marginBottom: 20 }}>
              {narrative.map((it, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{it.t}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: C.ink, whiteSpace: "pre-line" }}>{it.body}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>מדדי EVM</div>
            <table style={{ width: "100%", maxWidth: 620, borderCollapse: "collapse", fontSize: 13, marginBottom: 20 }}>
              <tbody>
                {[["BAC — תקציב בסיס", shekel(evm.BAC)], ["PV — ערך מתוכנן", shekel(evm.PV)], ["EV — ערך מזוכה", shekel(evm.EV)],
                  ["AC — עלות בפועל", shekel(evm.AC)], ["SV — סטיית לו\"ז", shekel(evm.SV)], ["CV — סטיית עלות", shekel(evm.CV)],
                  ["SPI", ratio(evm.SPI)], ["CPI", ratio(evm.CPI)], ["EAC — אומדן בהשלמה", shekel(evm.EAC)],
                  ["ETC — עלות להשלמה", shekel(evm.ETC)], ["VAC — סטייה בהשלמה", shekel(evm.VAC)]].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 10px", color: C.muted }}>{k}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>חשבונות מצטברים (עכבון {retention}%)</div>
            <table style={{ width: "100%", maxWidth: 620, borderCollapse: "collapse", fontSize: 13, marginBottom: 20 }}>
              <thead>
                <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                  {["תאריך", "חוזה מצטבר", "חריגים/נוספים", "סה\"כ מצטבר", "חודשי", "נטו מצטבר"].map((h) => <th key={h} style={{ padding: "7px 10px", fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, idx) => (
                  <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "6px 10px" }}>{fmtDate(toDate(inv.date))}</td>
                    <td style={{ padding: "6px 10px" }}>{shekel(inv.cumulative)}</td>
                    <td style={{ padding: "6px 10px", color: (inv.extras || 0) > 0 ? C.amber : C.muted }}>{shekel(inv.extras || 0)}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{shekel(invTotal(inv))}</td>
                    <td style={{ padding: "6px 10px", color: C.muted }}>{shekel(invTotal(inv) - (idx > 0 ? invTotal(invoices[idx - 1]) : 0))}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 600 }}>{shekel(invTotal(inv) * (1 - retention / 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>השוואת תזרים חודשית</div>
            <table style={{ width: "100%", maxWidth: 720, borderCollapse: "collapse", fontSize: 12.5, marginBottom: 24 }}>
              <thead>
                <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                  {["חודש", "מצטבר בסיס", "מצטבר מתעדכן", "חשבונות בפועל", "פער בפועל מול בסיס"].map((h) => <th key={h} style={{ padding: "7px 10px", fontWeight: 600 }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {compMonths.map((m) => (
                  <tr key={m.label} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "5px 10px" }}>{m.label}</td>
                    <td style={{ padding: "5px 10px" }}>{shekel(m.baseCum)}</td>
                    <td style={{ padding: "5px 10px" }}>{shekel(m.curCum)}</td>
                    <td style={{ padding: "5px 10px" }}>{m.actualCum != null ? shekel(m.actualCum) : "—"}</td>
                    <td style={{ padding: "5px 10px", color: m.actualCum != null && m.actualCum - m.baseCum < 0 ? C.red : C.green }}>
                      {m.actualCum != null ? shekel(m.actualCum - m.baseCum) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
              <span>הוכן ע"י: ________________</span>
              <span>חתימה: ________________</span>
              <span>תאריך: {fmtDate(today)}</span>
            </div>
          </div>
        </>
      )}

      <div className="no-print" style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
        הנתונים נשמרים אוטומטית ונטענים בפתיחה מחדש. פעילות עם משך 0 מוצגת כאבן דרך ◆. הנתיב הקריטי (אדום) מחושב משרשראות התלויות — הוסף קשרי "קודמת" כדי שהנתיב יתעדכן. עקומת "נטו לאחר עכבון" מציגה את התקבולים בפועל בניכוי {retention}% עכבון.
      </div>
    </div>
  );
}
