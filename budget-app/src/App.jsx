import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";

import { storage, usingCloud } from "./storage";

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
  { wbs: "1.1",  name: "עבודות פירוק והכנות שטח בריכה וחדר חשמל", cost: 203873.37, start: "2025-11-01", finish: "2025-11-12" },
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
  /* cost is spread day-proportionally across the activity span (consistent with PV) */
  rows.forEach((a) => {
    const after = a.cost * disc;
    const meta = metaOf(a.wbs);
    const totalDays = Math.round((a.f - a.s) / DAY) + 1;
    months.forEach((mo) => {
      if (a.s <= mo.end && a.f >= mo.start) {
        const os = a.s > mo.start ? a.s : mo.start;
        const oe = a.f < mo.end ? a.f : mo.end;
        const overlap = Math.round((oe - os) / DAY) + 1;
        const share = totalDays > 0 ? after * (overlap / totalDays) : 0;
        mo.planned += share;
        mo.groups[meta.key] = (mo.groups[meta.key] || 0) + share;
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
const Gantt = React.memo(function Gantt({ title, activities, discount, onShift, onResize, baselineByWbs, readOnly }) {
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
});

/* ================= monthly stacked chart ================= */
const FlowChart = React.memo(function FlowChart({ title, months, groupsPresent, todayLabel, font, extraLine, netLine }) {
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
});

/* ================= activity table ================= */
const ActivityTable = React.memo(function ActivityTable({ acts, setters, discount, exec, locked, font }) {
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
});

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
function Narrative({ items, plain }) {
  const body = (
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
  );
  if (plain) return body;
  return (
    <div style={{ ...panel, padding: "16px 16px 8px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>ניתוח וממצאים</div>
      {body}
    </div>
  );
}

/* ================= logo ================= */
function Logo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ flexShrink: 0, display: "block" }} aria-label="לוגו">
      <rect x="2" y="2" width="60" height="60" rx="14" fill={C.ink} />
      <rect x="13" y="34" width="9" height="16" rx="2" fill="#1D6FA3" />
      <rect x="27" y="26" width="9" height="24" rx="2" fill="#E0A020" />
      <rect x="41" y="18" width="9" height="32" rx="2" fill="#2F8F63" />
      <path d="M13 26 L30 16 L40 21 L51 11" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ================= error boundary ================= */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{ fontFamily: "'Assistant',sans-serif", padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>😕</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>משהו השתבש בתצוגה</div>
          <div style={{ fontSize: 13, color: "#5C7282", marginBottom: 16 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#12293B", color: "#fff", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>נסה שוב</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ================= SPI/CPI gauge ================= */
function Gauge({ label, value, sub }) {
  const v = value == null || isNaN(value) ? null : Math.max(0.5, Math.min(1.5, value));
  const frac = v == null ? 0 : (v - 0.5) / 1.0;               // 0..1 across the arc
  const ang = Math.PI * (1 - frac);                            // PI (left) .. 0 (right)
  const cx = 90, cy = 84, r = 66;
  const nx = cx + r * 0.78 * Math.cos(ang), ny = cy - r * 0.78 * Math.sin(ang);
  const arc = (a0, a1, color) => {
    const x0 = cx + r * Math.cos(a0), y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
    return <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={color} strokeWidth="13" fill="none" strokeLinecap="round" />;
  };
  const good = value != null && value >= 1;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px 8px", textAlign: "center", flex: "1 1 180px", minWidth: 180 }}>
      <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{label}</div>
      <svg width="180" height="100" viewBox="0 0 180 100" style={{ display: "block", margin: "0 auto" }}>
        {arc(Math.PI, Math.PI * 0.55, C.red)}
        {arc(Math.PI * 0.55, Math.PI * 0.45, C.amber)}
        {arc(Math.PI * 0.45, 0, C.green)}
        {v != null && <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.ink} strokeWidth="3.5" strokeLinecap="round" />}
        <circle cx={cx} cy={cy} r="5.5" fill={C.ink} />
        <text x="14" y="98" fontSize="9" fill={C.muted}>0.5</text>
        <text x="158" y="98" fontSize="9" fill={C.muted}>1.5</text>
      </svg>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: -26, color: value == null ? C.muted : good ? C.green : value < 0.95 ? C.red : C.amber }}>{ratio(value)}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.muted, marginTop: 2, marginBottom: 4 }}>{sub}</div>}
    </div>
  );
}

/* ================= per-chapter progress bars ================= */
function GroupBars({ rows }) {
  const maxB = Math.max(...rows.map((r) => r.budget), 1);
  return (
    <div style={{ ...panel, padding: "16px 16px 12px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>התקדמות לפי פרקים — תקציב מול ערך שבוצע</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((r) => (
          <div key={r.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: r.color, marginInlineEnd: 6 }} />
                {r.id > 0 ? `${r.id} · ` : ""}{r.name}
              </span>
              <span style={{ color: C.muted }}>{shekelShort(r.earned)} / {shekelShort(r.budget)} · <b style={{ color: r.pct >= 99.5 ? C.green : C.ink }}>{Math.round(r.pct)}%</b></span>
            </div>
            <div style={{ height: 14, background: "#EDF1F5", borderRadius: 7, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: `${(r.budget / maxB) * 100}%`, background: r.color, opacity: 0.22, borderRadius: 7 }} />
              <div style={{ position: "absolute", insetBlock: 0, insetInlineStart: 0, width: `${(r.budget / maxB) * (r.pct / 100) * 100}%`, background: r.color, borderRadius: 7 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= milestones ================= */
function MilestoneList({ items }) {
  if (!items.length) return null;
  return (
    <div style={{ ...panel, padding: "16px 16px 10px", flex: "1 1 320px", minWidth: 300 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>אבני דרך</div>
      {items.map((m, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: 15, color: m.done ? C.green : m.late ? C.red : C.amber }}>{m.done ? "✔" : "◆"}</span>
          <span style={{ fontSize: 13, flex: 1 }}>{m.name}</span>
          <span dir="ltr" style={{ fontSize: 12.5, color: C.muted }}>{m.dateStr}</span>
          {m.delta != null && m.delta !== 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: m.delta > 0 ? C.red : C.green }}>{m.delta > 0 ? `+${m.delta}` : m.delta} ימים</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ================= schedule slip table ================= */
function SlipTable({ rows }) {
  return (
    <div style={{ ...panel, padding: "16px 16px 10px", flex: "1 1 320px", minWidth: 300 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>סטיות לו״ז מול בסיס — חמש הגדולות</div>
      {rows.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, paddingBottom: 8 }}>אין סטיות מול תכנית הבסיס 👍</div>}
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderTop: i ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: 11, color: C.muted, minWidth: 28 }}>{r.wbs}</span>
          <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: r.slip > 0 ? C.red : C.green, whiteSpace: "nowrap" }}>{r.slip > 0 ? `+${r.slip}` : r.slip} ימים</span>
        </div>
      ))}
    </div>
  );
}

/* ================= tiny markdown renderer (for AI output) ================= */
function MdInline({ text }) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}
function Md({ text }) {
  const lines = String(text || "").split("\n");
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(<ul key={out.length} style={{ margin: "4px 0 10px", paddingInlineStart: 20 }}>{list}</ul>); list = null; } };
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (/^#{1,3}\s/.test(t)) { flush(); out.push(<div key={i} style={{ fontSize: 14.5, fontWeight: 800, margin: "12px 0 4px" }}><MdInline text={t.replace(/^#{1,3}\s/, "")} /></div>); }
    else if (/^[-•*]\s/.test(t)) { (list = list || []).push(<li key={i} style={{ marginBottom: 3 }}><MdInline text={t.replace(/^[-•*]\s/, "")} /></li>); }
    else if (/^\d+[.)]\s/.test(t)) { (list = list || []).push(<li key={i} style={{ marginBottom: 3 }}><MdInline text={t.replace(/^\d+[.)]\s/, "")} /></li>); }
    else if (t === "") { flush(); }
    else { flush(); out.push(<div key={i} style={{ marginBottom: 6 }}><MdInline text={t} /></div>); }
  });
  flush();
  return <div style={{ fontSize: 13.5, lineHeight: 1.75 }}>{out}</div>;
}

/* ================= report building blocks ================= */
/* numbered report section with a heading rule */
function RSec({ n, title, children, noBreak }) {
  return (
    <div className={noBreak ? undefined : "avoid-break"} style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: `2px solid ${C.ink}`, paddingBottom: 6, marginBottom: 12 }}>
        <span style={{ background: C.ink, color: "#fff", borderRadius: 6, fontSize: 11.5, fontWeight: 800, padding: "2px 9px", lineHeight: 1.6 }}>{n}</span>
        <span style={{ fontSize: 15.5, fontWeight: 800 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* chapter completion — colored bar + planned tick + numbers */
function ChapterProgress({ rows }) {
  const totB = rows.reduce((s, r) => s + r.budget, 0);
  const totE = rows.reduce((s, r) => s + r.earned, 0);
  const totP = rows.reduce((s, r) => s + (r.budget * (r.plannedPct || 0)) / 100, 0);
  const Row = ({ name, sub, color, pct, plannedPct, earned, budget, bold }) => {
    const behind = plannedPct != null && pct + 5 < plannedPct;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: bold ? 0 : 8 }}>
        <div style={{ width: 200, fontSize: 12.5, fontWeight: bold ? 800 : 600, lineHeight: 1.3 }}>
          {name}
          {sub && <div style={{ color: C.muted, fontWeight: 400, fontSize: 10.5 }}>{sub}</div>}
        </div>
        <div style={{ flex: 1, position: "relative", height: bold ? 20 : 15, background: "#EDF1F5", borderRadius: 9, overflow: "hidden" }}>
          <div style={{ position: "absolute", insetInlineStart: 0, top: 0, bottom: 0, width: `${clamp01(pct / 100) * 100}%`, background: color, borderRadius: 9, opacity: bold ? 1 : 0.9 }} />
          {plannedPct != null && plannedPct > 0 && plannedPct < 100 && (
            <div title={`מתוכנן: ${Math.round(plannedPct)}%`} style={{ position: "absolute", insetInlineStart: `${clamp01(plannedPct / 100) * 100}%`, top: -1, bottom: -1, width: 2.5, background: C.ink }} />
          )}
        </div>
        <div style={{ width: 48, fontSize: bold ? 15 : 13.5, fontWeight: 800, textAlign: "center", color: behind ? C.red : C.ink }}>{Math.round(pct)}%</div>
        <div style={{ width: 140, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap", textAlign: "left" }} dir="ltr">{shekelShort(earned)} / {shekelShort(budget)}</div>
      </div>
    );
  };
  return (
    <div>
      {rows.map((r) => (
        <Row key={r.key} name={r.name} sub={r.count != null ? `${r.done}/${r.count} פעילויות הושלמו` : null}
          color={r.color} pct={r.pct} plannedPct={r.plannedPct} earned={r.earned} budget={r.budget} />
      ))}
      <div style={{ borderTop: `1.5px solid ${C.ink}`, paddingTop: 8, marginTop: 4 }}>
        <Row name="סה״כ פרויקט" color={C.ink} pct={totB > 0 ? (totE / totB) * 100 : 0} plannedPct={totB > 0 ? (totP / totB) * 100 : null} earned={totE} budget={totB} bold />
      </div>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8 }}>הפס הצבעוני — ביצוע בפועל (משוקלל תקציב) · הקו האנכי הכהה — הביצוע המתוכנן לתאריך הסטטוס. אחוז אדום = פיגור של יותר מ-5% מול המתוכנן.</div>
    </div>
  );
}

/* delta chips — "what changed since the previous report" */
function DeltaChips({ prev, cur }) {
  const items = [];
  const add = (label, dv, fmt, goodWhenUp = true, suffix = "") => {
    if (dv == null || isNaN(dv) || Math.abs(dv) < 1e-9) return;
    const up = dv > 0;
    const good = goodWhenUp ? up : !up;
    items.push(
      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 11px", fontSize: 12, background: "#fff" }}>
        <span style={{ color: C.muted }}>{label}</span>
        <b style={{ color: good ? C.green : C.red }}>{up ? "▲" : "▼"} {fmt(Math.abs(dv))}{suffix}</b>
      </span>
    );
  };
  add("השלמה", (cur.pct ?? 0) - (prev.pct ?? 0), (v) => v.toFixed(1), true, " נק׳");
  add("SPI", (cur.SPI ?? 0) - (prev.SPI ?? 0), (v) => v.toFixed(2), true);
  add("CPI", (cur.CPI ?? 0) - (prev.CPI ?? 0), (v) => v.toFixed(2), true);
  add("מאושר מצטבר", (cur.AC ?? 0) - (prev.AC ?? 0), shekelShort, true);
  add("חריגים", (cur.extras ?? 0) - (prev.extras ?? 0), shekelShort, false);
  add("סטיית סיום", (cur.endDelta ?? 0) - (prev.endDelta ?? 0), (v) => Math.round(v), false, " ימים");
  if (!items.length) return <div style={{ fontSize: 12.5, color: C.muted }}>אין שינוי במדדים העיקריים מאז תמונת המצב הקודמת.</div>;
  return <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{items}</div>;
}

/* change-order status meta */
const CO_STATUS = [
  { id: "draft", label: "טיוטה", color: "#8A99A8", bg: "#F0F4F8" },
  { id: "submitted", label: "הוגש", color: "#B26A00", bg: "#FDF6E9" },
  { id: "approved", label: "מאושר", color: "#2F8F63", bg: "#EEF7F1" },
  { id: "rejected", label: "נדחה", color: "#C0392B", bg: "#FBEEEC" },
];

/* ================= extra rule-based insights (beyond the narrative) ================= */
function buildInsights({ evm, curModel, invoices, retention, current, baseByWbs, discount, statusDate }) {
  const out = [];
  const disc = 1 - discount / 100;

  /* payment gap */
  if (evm.unpaid > 1000) {
    const pct = evm.AC > 0 ? (evm.unpaid / evm.AC) * 100 : 0;
    out.push({
      t: "פער אישור–תשלום", tone: pct > 15 ? "bad" : "warn",
      body: `${shekel(evm.unpaid)} (${pct.toFixed(0)}% מהמאושר) אושרו אך טרם שולמו. פער מתמשך פוגע בתזרים הקבלן ועלול להאט את קצב הביצוע.`,
    });
  }

  /* cash need — next 3 months from status date */
  const from = statusDate, to = new Date(statusDate.getFullYear(), statusDate.getMonth() + 3, statusDate.getDate());
  const need = curModel.months.filter((m) => m.start >= new Date(from.getFullYear(), from.getMonth(), 1) && m.start <= to).reduce((s, m) => s + m.planned, 0);
  if (need > 0) out.push({ t: "צפי תזרים — שלושה חודשים קרובים", tone: "info", body: `על פי התכנית המתעדכנת, בשלושת החודשים הקרובים מתוכננות עבודות בהיקף של כ-${shekel(need)}. ודא מסגרת תקציבית ותזרימית מתאימה.` });

  /* lagging activities */
  const lag = current
    .map((a) => {
      const b = baseByWbs[a.wbs];
      const budget = ((b ? b.cost : a.cost) || 0) * disc;
      const planned = plannedFrac(a.start, a.finish, statusDate);
      const gap = planned - (Number(a.progress) || 0) / 100;
      return { a, gapValue: gap * budget, gap, planned };
    })
    .filter((x) => x.gap > 0.15 && x.gapValue > 10000)
    .sort((x, y) => y.gapValue - x.gapValue)
    .slice(0, 3);
  if (lag.length) out.push({
    t: "פעילויות בפיגור ביצוע", tone: "warn",
    body: lag.map((x) => `• ${x.a.name} — בוצע ${x.a.progress || 0}% מול ${Math.round(x.planned * 100)}% מתוכנן (פער ${shekelShort(x.gapValue)})`).join("\n"),
  });

  /* extras trend */
  const dated = invoices.filter((i) => toDate(i.date)).sort((a, b) => (a.date > b.date ? 1 : -1));
  if (dated.length >= 3) {
    const lastEx = Number(dated.at(-1).extras) || 0, prevEx = Number(dated.at(-3).extras) || 0;
    if (lastEx - prevEx > 10000) out.push({ t: "מגמת חריגים", tone: "warn", body: `החריגים גדלו ב-${shekel(lastEx - prevEx)} בשני החשבונות האחרונים (סה"כ ${shekel(lastEx)}). מומלץ להסדיר פקודות שינוי מול המזמין לפני שהפער מצטבר.` });
  }

  /* retention */
  if (evm.AC > 0 && retention > 0) out.push({ t: "עכבון צבור", tone: "info", body: `נכון להיום מוחזק עכבון של ${shekel(evm.AC * retention / 100)} (${retention}% מהמאושר). סכום זה ישוחרר במסירה — יש להביאו בחשבון בתחזית התזרים של הקבלן.` });

  return out;
}

/* ================= Claude AI analysis ================= */
const AI_MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — המומלץ" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — מהיר" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — חסכוני" },
];
const AI_KEY_LS = "budget-ai-key", AI_MODEL_LS = "budget-ai-model";

async function runAiAnalysis({ apiKey, model, payload }) {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
  });
  const req = {
    model,
    max_tokens: 4000,
    system:
      "אתה יועץ בכיר לבקרת פרויקטים בתחום הבנייה והתשתיות, מומחה לניתוח Earned Value Management. " +
      "תקבל נתוני פרויקט בפורמט JSON (סכומים בש\"ח). כתוב ניתוח מקצועי בעברית, בפורמט Markdown, עם הכותרות: " +
      "## תמצית מנהלים (3-4 משפטים), ## ניתוח לוח זמנים, ## ניתוח עלות ותזרים, ## סיכונים מרכזיים (ממוינים לפי חומרה), " +
      "## המלצות אופרטיביות (ממוספרות, קונקרטיות), ## תחזית. היה ישיר וכמותי — עגן כל קביעה במספר מהנתונים. אל תמציא נתונים שאינם קיימים.",
    messages: [{ role: "user", content: `נתוני הפרויקט:\n${JSON.stringify(payload, null, 1)}` }],
  };
  if (!model.startsWith("claude-haiku")) req.thinking = { type: "adaptive" };
  const msg = await client.messages.create(req);
  if (msg.stop_reason === "refusal") throw new Error("הבקשה נדחתה על ידי מסנני הבטיחות של המודל.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("המודל החזיר תשובה ריקה.");
  return text;
}

function aiErrorMessage(e) {
  const status = e?.status;
  if (status === 401) return "מפתח ה-API אינו תקין. בדוק שהעתקת אותו במלואו.";
  if (status === 429) return "חריגה ממכסת הבקשות (Rate Limit). המתן דקה ונסה שוב.";
  if (status === 400) return "בקשה שגויה: " + (e?.message || "");
  if (status >= 500) return "שירות ה-AI עמוס כרגע. נסה שוב בעוד רגע.";
  if (e?.message?.includes("Failed to fetch") || e?.message?.includes("fetch")) return "שגיאת רשת — בדוק את החיבור לאינטרנט (ייתכן שחומת אש חוסמת את api.anthropic.com).";
  return e?.message || "שגיאה לא צפויה.";
}

/* ================= main ================= */
function App() {
  const [tab, setTab] = useState("base");
  const [dashView, setDashView] = useState("exec");
  const [aiKey, setAiKey] = useState(() => { try { return localStorage.getItem(AI_KEY_LS) || ""; } catch (e) { return ""; } });
  const [aiModel, setAiModel] = useState(() => { try { return localStorage.getItem(AI_MODEL_LS) || AI_MODELS[0].id; } catch (e) { return AI_MODELS[0].id; } });
  const [aiHistory, setAiHistory] = useState([]);   // ניתוחי AI שמורים — נשמרים עם הפרויקט (ענן/מקומי)
  const [aiViewId, setAiViewId] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiInReport, setAiInReport] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [baseline, setBaseline] = useState(BASE_SEED);
  const [current, setCurrent] = useState(CUR_SEED);
  const [invoices, setInvoices] = useState(INV_SEED);
  const [locked, setLocked] = useState(true);
  const [discount, setDiscount] = useState(11.11);
  const [retention, setRetention] = useState(5);
  const [statusISO, setStatusISO] = useState("");
  const [changeOrders, setChangeOrders] = useState([]);   // יומן חריגים / פקודות שינוי
  const [snapshots, setSnapshots] = useState([]);          // תמונות מצב חודשיות להשוואה בין דוחות
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null);
  const [saveState, setSaveState] = useState("");
  const fileRef = useRef(null);
  const loadedRef = useRef(false);

  /* fonts are loaded from index.html; persist AI settings locally (never synced to the cloud) */
  useEffect(() => { try { localStorage.setItem(AI_KEY_LS, aiKey); } catch (e) {} }, [aiKey]);
  useEffect(() => { try { localStorage.setItem(AI_MODEL_LS, aiModel); } catch (e) {} }, [aiModel]);

  /* ---- payload helpers ---- */
  const defaultPayload = () => ({ baseline: BASE_SEED, current: CUR_SEED, invoices: INV_SEED, discount: 11.11, retention: 5, locked: true, statusISO: "", aiHistory: [], changeOrders: [], snapshots: [] });
  const emptyPayload = () => ({ baseline: [], current: [], invoices: [], discount: 11.11, retention: 5, locked: false, statusISO: "", aiHistory: [], changeOrders: [], snapshots: [] });
  const applyPayload = (d) => {
    setBaseline(Array.isArray(d.baseline) ? d.baseline : BASE_SEED);
    setCurrent(Array.isArray(d.current) ? d.current : CUR_SEED);
    setInvoices(Array.isArray(d.invoices) ? d.invoices : []);
    setDiscount(typeof d.discount === "number" ? d.discount : 11.11);
    setRetention(typeof d.retention === "number" ? d.retention : 5);
    setLocked(typeof d.locked === "boolean" ? d.locked : true);
    setStatusISO(typeof d.statusISO === "string" ? d.statusISO : "");
    setAiHistory(Array.isArray(d.aiHistory) ? d.aiHistory : []);
    setChangeOrders(Array.isArray(d.changeOrders) ? d.changeOrders : []);
    setSnapshots(Array.isArray(d.snapshots) ? d.snapshots : []);
    setAiViewId(null);
  };
  const currentPayload = () => ({ baseline, current, invoices, discount, retention, locked, statusISO, aiHistory, changeOrders, snapshots });

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
  }, [projectId, baseline, current, invoices, discount, retention, locked, statusISO, aiHistory, changeOrders, snapshots]);

  /* ---- persist project index whenever it changes ---- */
  useEffect(() => {
    if (!loadedRef.current || !projects.length) return;
    (async () => { try { await storage.set(IDX_KEY, JSON.stringify(projects)); } catch (e) {} })();
  }, [projects]);

  const projName = projects.find((p) => p.id === projectId)?.name || "פרויקט";

  /* flush the debounced autosave before leaving a project, so no <700ms edit is lost */
  const persistNow = async () => {
    if (!loadedRef.current || !projectId) return;
    try { await storage.set(PROJ_PREFIX + projectId, JSON.stringify(currentPayload())); } catch (e) {}
  };

  const switchProject = async (id) => {
    if (!id || id === projectId) return;
    await persistNow();
    let payload = defaultPayload();
    try { const r = await storage.get(PROJ_PREFIX + id); if (r?.value) payload = JSON.parse(r.value); } catch (e) {}
    applyPayload(payload); setProjectId(id); setTab("base"); setAiErr("");
  };
  const createProject = async () => {
    const name = window.prompt("שם הפרויקט החדש:", "פרויקט חדש");
    if (!name) return;
    await persistNow();
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
        const target = tab === "base" ? "תכנית הבסיס" : "התכנית המתעדכנת";
        if (!window.confirm(`הייבוא יחליף את ${target} הנוכחית ב-${parsed.length} פעילויות מהקובץ. להמשיך?`)) return;
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

  /* ---- dashboard data ---- */
  const disc = 1 - discount / 100;
  const groupRows = useMemo(() => GROUP_META.concat([OTHER]).map((g) => {
    const acts = current.filter((a) => metaOf(a.wbs).key === g.key);
    const budget = acts.reduce((s, a) => s + (a.cost || 0) * disc, 0);
    const earned = acts.reduce((s, a) => s + (a.cost || 0) * disc * ((Number(a.progress) || 0) / 100), 0);
    const planned = acts.reduce((s, a) => s + (a.cost || 0) * disc * plannedFrac(a.start, a.finish, statusDate), 0);
    const done = acts.filter((a) => (Number(a.progress) || 0) >= 100).length;
    return {
      key: g.key, id: g.id, name: g.name, color: g.color, budget, earned, count: acts.length, done,
      pct: budget > 0 ? (earned / budget) * 100 : 0,
      plannedPct: budget > 0 ? (planned / budget) * 100 : 0,
    };
  }).filter((r) => r.budget > 0), [current, disc, statusDate]);

  /* ---- monthly tracking: per-month planned vs actual, execution % ---- */
  const monthlyTrack = useMemo(() => {
    let pb = 0, pc = 0, pa = null, pp = null;
    return compMonths.map((m) => {
      const basePlan = (m.baseCum || 0) - pb; pb = m.baseCum || 0;
      const curPlan = (m.curCum || 0) - pc; pc = m.curCum || 0;
      const approved = m.actualCum != null ? m.actualCum - (pa ?? 0) : null; if (m.actualCum != null) pa = m.actualCum;
      const paid = m.paidCum != null ? m.paidCum - (pp ?? 0) : null; if (m.paidCum != null) pp = m.paidCum;
      const exec = approved != null && curPlan > 0 ? (approved / curPlan) * 100 : null;
      const monthEnd = new Date(m.start.getFullYear(), m.start.getMonth() + 1, 0);
      return { ...m, basePlan, curPlan, approved, paid, exec, isFuture: m.start > statusDate, isPast: monthEnd < statusDate };
    });
  }, [compMonths, statusDate]);

  const milestones = useMemo(() => current
    .filter((a) => a.duration === 0 && toDate(a.start))
    .sort((a, b) => toDate(a.start) - toDate(b.start))
    .map((a) => {
      const d = toDate(a.start);
      const b = baseByWbs[a.wbs];
      const delta = b && toDate(b.start) ? Math.round((d - toDate(b.start)) / DAY) : null;
      const done = (Number(a.progress) || 0) >= 100;
      return { name: a.name.replace(/^◆\s*/, ""), dateStr: fmtDate(d), done, late: !done && d < new Date(), delta };
    }), [current, baseByWbs]);

  const slips = useMemo(() => current
    .map((a) => {
      const b = baseByWbs[a.wbs];
      if (!b || !toDate(a.finish) || !toDate(b.finish)) return null;
      return { wbs: a.wbs, name: a.name.replace(/^◆\s*/, ""), slip: Math.round((toDate(a.finish) - toDate(b.finish)) / DAY) };
    })
    .filter((x) => x && x.slip !== 0)
    .sort((x, y) => y.slip - x.slip)
    .slice(0, 5), [current, baseByWbs]);

  const insights = useMemo(() => buildInsights({ evm, curModel, invoices, retention, current, baseByWbs, discount, statusDate }),
    [evm, curModel, invoices, retention, current, baseByWbs, discount, statusDate]);

  /* ---- compact project snapshot sent to the AI ---- */
  const aiPayload = useMemo(() => {
    const r = (n) => (n == null || isNaN(n) ? null : Math.round(n));
    const dated = invoices.filter((i) => toDate(i.date)).sort((a, b) => (a.date > b.date ? 1 : -1));
    return {
      project: projName, currency: "ILS", statusDate: fmtDate(evm.statusDate),
      budget: { estimateBeforeDiscount: r(curModel.totals.totalCost), BAC: r(evm.BAC), discountPct: discount, retentionPct: retention },
      evm: { PV: r(evm.PV), EV: r(evm.EV), AC_approved: r(evm.AC), paidActual: r(evm.paidCash), SPI: evm.SPI?.toFixed(2), CPI: evm.CPI?.toFixed(2), EAC: r(evm.EAC), ETC: r(evm.ETC), VAC: r(evm.VAC), pctComplete: evm.pctComplete?.toFixed(1) },
      schedule: {
        baselineFinish: fmtDate(baseModel.totals.endDate), currentFinish: fmtDate(curModel.totals.endDate),
        finishDeltaDays: endDelta, criticalPath: critNames.slice(0, 6),
        topSlipsDays: slips.map((s) => ({ name: s.name, days: s.slip })),
        milestones: milestones.map((m) => ({ name: m.name, date: m.dateStr, done: m.done, deltaDays: m.delta })),
      },
      chapters: groupRows.map((g) => ({ name: g.name, budget: r(g.budget), earned: r(g.earned), pctComplete: Math.round(g.pct) })),
      invoicesCumulative: dated.slice(-8).map((i) => ({ date: fmtDate(toDate(i.date)), contract: r(i.cumulative), extras: r(i.extras || 0), approvedTotal: r(invApproved(i)), paid: r(invPaidC(i)) })),
      cashflow: { peakMonth: curModel.totals.peakLabel, peakAmount: r(curModel.totals.peakMonthly) },
    };
  }, [projName, evm, curModel, baseModel, discount, retention, endDelta, critNames, slips, milestones, groupRows, invoices]);

  /* the analysis currently on screen — the selected history entry, or the newest one */
  const aiView = useMemo(() => aiHistory.find((h) => h.id === aiViewId) || aiHistory[0] || null, [aiHistory, aiViewId]);

  const generateAi = async () => {
    if (!aiKey.trim()) { setAiErr("הזן מפתח API כדי להפיק ניתוח."); return; }
    setAiBusy(true); setAiErr("");
    try {
      const text = await runAiAnalysis({ apiKey: aiKey.trim(), model: aiModel, payload: aiPayload });
      const entry = { id: newId(), dateISO: isoOf(new Date()), statusDate: fmtDate(evm.statusDate), model: aiModel, text };
      setAiHistory((h) => [entry, ...h].slice(0, 30));
      setAiViewId(entry.id);
    } catch (e) {
      setAiErr(aiErrorMessage(e));
    } finally { setAiBusy(false); }
  };
  const deleteAiEntry = (id) => {
    if (!window.confirm("למחוק ניתוח זה מההיסטוריה?")) return;
    setAiHistory((h) => h.filter((x) => x.id !== id));
    if (aiViewId === id) setAiViewId(null);
  };

  /* ---- change orders (יומן חריגים / פקודות שינוי) ---- */
  const addCO = () => setChangeOrders((p) => [...p, { id: newId(), date: isoOf(new Date()), name: "", amount: 0, status: "submitted", note: "" }]);
  const setCO = (id, f, v) => setChangeOrders((p) => p.map((c) => (c.id === id ? { ...c, [f]: v } : c)));
  const rmCO = (id) => setChangeOrders((p) => p.filter((c) => c.id !== id));
  const coApproved = useMemo(() => changeOrders.filter((c) => c.status === "approved").reduce((s, c) => s + (Number(c.amount) || 0), 0), [changeOrders]);
  const coPending = useMemo(() => changeOrders.filter((c) => c.status === "submitted").reduce((s, c) => s + (Number(c.amount) || 0), 0), [changeOrders]);

  /* ---- monthly snapshots (השוואה בין דוחות) ---- */
  const saveSnapshot = () => {
    const s = {
      id: newId(), dateISO: isoOf(new Date()), statusISO: isoOf(evm.statusDate),
      pct: evm.pctComplete ?? null, SPI: evm.SPI ?? null, CPI: evm.CPI ?? null,
      EV: evm.EV ?? null, AC: evm.AC ?? null, PV: evm.PV ?? null, EAC: evm.EAC ?? null,
      endDelta: endDelta, extras: lastInv ? Number(lastInv.extras) || 0 : 0, paid: evm.paidCash ?? null,
    };
    setSnapshots((p) => [s, ...p.filter((x) => x.dateISO !== s.dateISO)].slice(0, 24));
  };
  const rmSnapshot = (id) => setSnapshots((p) => p.filter((s) => s.id !== id));
  /* the snapshot we compare against — the most recent one not from today */
  const prevSnap = useMemo(() => snapshots.find((s) => s.dateISO !== isoOf(today)) || null, [snapshots]);

  /* ---- smart alerts ---- */
  const alerts = useMemo(() => {
    const out = [];
    if (evm.SPI != null && evm.SPI < 0.9) out.push({ t: "פיגור לו\"ז מהותי", tone: "bad", body: `SPI ${evm.SPI.toFixed(2)} — קצב הביצוע נמוך משמעותית מהמתוכנן.` });
    else if (evm.SPI != null && evm.SPI < 0.97) out.push({ t: "פיגור לו\"ז", tone: "warn", body: `SPI ${evm.SPI.toFixed(2)} — הביצוע מעט מאחורי התכנון.` });
    if (evm.CPI != null && evm.CPI < 0.9) out.push({ t: "חריגת עלות מהותית", tone: "bad", body: `CPI ${evm.CPI.toFixed(2)} — העלות בפועל גבוהה משמעותית מהערך שהופק.` });
    else if (evm.CPI != null && evm.CPI < 0.97) out.push({ t: "חריגת עלות", tone: "warn", body: `CPI ${evm.CPI.toFixed(2)} — העלות מעט מעל הערך שהופק.` });
    if (evm.AC > 0 && evm.unpaid / evm.AC > 0.15) out.push({ t: "פער תשלומים", tone: "warn", body: `${shekel(evm.unpaid)} מאושרים וטרם שולמו (${Math.round((evm.unpaid / evm.AC) * 100)}% מהמאושר).` });
    if (endDelta != null && endDelta > 14) out.push({ t: "סטיית סיום", tone: endDelta > 30 ? "bad" : "warn", body: `סיום הפרויקט צפוי להתאחר ב-${endDelta} ימים מול הבסיס.` });
    if (coPending > 0) out.push({ t: "פקודות שינוי ממתינות", tone: "info", body: `${shekel(coPending)} בפקודות שינוי שהוגשו וטרם אושרו.` });
    return out;
  }, [evm, endDelta, coPending]);

  return (
    <div dir="rtl" style={{ fontFamily: font, background: C.bg, minHeight: "100vh", color: C.ink, padding: "20px 22px" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-only { display: block !important; }
          .tab-panel, .avoid-break { break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          .page-break { break-before: page; }
          .report-sheet { border: none !important; border-radius: 0 !important; padding: 0 !important; max-width: none !important; }
          @page { size: A4 ${tab === "report" ? "portrait" : "landscape"}; margin: 12mm; }
        }
        .print-only { display: none; }
        input:focus, select:focus { outline: 2px solid #1D6FA3; outline-offset: 1px; }
        button:hover { filter: brightness(0.96); }
      `}</style>

      {/* generic print header — the report tab has its own cover page, so skip it there */}
      {tab !== "report" && (
        <div className="print-only" style={{ marginBottom: 14, borderBottom: `2px solid ${C.ink}`, paddingBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo size={34} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{projName}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                {{ base: "תכנית בסיס", cur: "תכנית מתעדכנת", comp: "השוואה + EVM", dash: "דשבורד", inv: "חשבונות", ai: "ניתוח AI", report: "דוח בקרה תקציבית" }[tab]} · הופק ב-{fmtDate(today)}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="no-print" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo />
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4 }}>{projName}</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>
              בקרה תקציבית לפרויקטי בנייה ותשתית
              <span title={usingCloud ? "הנתונים נשמרים בענן ומשותפים בין מכשירים" : "הנתונים נשמרים בדפדפן זה בלבד"}
                style={{ marginInlineStart: 10, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: usingCloud ? "#EEF7F1" : "#F0F4F8", color: usingCloud ? C.green : C.muted, border: `1px solid ${usingCloud ? "#CDE8D8" : C.border}` }}>
                {usingCloud ? "☁ ענן" : "💾 מקומי"}
              </span>
              {saveState && <span style={{ marginInlineStart: 8, fontSize: 11.5, color: saveState.includes("✓") ? C.green : C.muted }}>{saveState}</span>}
            </div>
          </div>
          {alerts.length > 0 && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setAlertsOpen((o) => !o)} title="התראות פעילות" style={{
                fontFamily: font, fontSize: 12, fontWeight: 800, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
                border: `1px solid ${alerts.some((a) => a.tone === "bad") ? "#E5B8B2" : "#EAD9AE"}`,
                background: alerts.some((a) => a.tone === "bad") ? "#FBEEEC" : "#FDF6E9",
                color: alerts.some((a) => a.tone === "bad") ? C.red : "#B26A00",
              }}>⚠ {alerts.length} התראות</button>
              {alertsOpen && (
                <div style={{ position: "absolute", top: "115%", insetInlineStart: 0, zIndex: 60, width: 360, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 10px 28px rgba(18,41,59,.16)", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <b style={{ fontSize: 13 }}>התראות פעילות</b>
                    <button onClick={() => setAlertsOpen(false)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 15, color: C.muted }}>×</button>
                  </div>
                  <Narrative items={alerts} plain />
                </div>
              )}
            </div>
          )}
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
        {tabBtn("dash", "④ דשבורד")}
        {tabBtn("inv", "⑤ חשבונות")}
        {tabBtn("ai", "⑥ ניתוח AI ✦")}
        {tabBtn("report", "⑦ דוח")}
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
              <select value={datedInv.some((i) => i.date === statusISO) ? statusISO : ""} onChange={(e) => setStatusISO(e.target.value)} style={{ ...cell, fontFamily: font, cursor: "pointer" }}>
                <option value="">אחרון ({fmtDate(evm.statusDate)})</option>
                {datedInv.map((i) => <option key={i.id} value={i.date}>{fmtDate(toDate(i.date))}</option>)}
              </select>
              <span style={{ fontSize: 12, color: C.muted }}>או</span>
              <input type="date" dir="ltr" value={statusISO} onChange={(e) => setStatusISO(e.target.value)} title="בחר תאריך סטטוס חופשי"
                style={{ ...cell, width: 130, textAlign: "center" }} />
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

      {/* ===== TAB: DASHBOARD ===== */}
      {tab === "dash" && (
        <>
          <div className="no-print" style={{ display: "flex", gap: 6, marginBottom: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, width: "fit-content" }}>
            {[["exec", "🎯 מנהלים"], ["sched", "🗓 לוח זמנים"], ["fin", "💰 כספים"]].map(([id, label]) => (
              <button key={id} onClick={() => setDashView(id)} style={{
                fontFamily: font, fontSize: 13, fontWeight: dashView === id ? 800 : 600, padding: "7px 16px", borderRadius: 7,
                border: "none", cursor: "pointer", background: dashView === id ? C.ink : "transparent", color: dashView === id ? "#fff" : C.muted,
              }}>{label}</button>
            ))}
          </div>

          {dashView === "exec" && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <Kpi label="השלמה (EV/BAC)" value={`${evm.pctComplete.toFixed(0)}%`} sub={`${shekelShort(evm.EV)} מתוך ${shekelShort(evm.BAC)}`} />
                <Kpi label="סיום צפוי" value={fmtDate(curModel.totals.endDate)} accent={endDelta > 0 ? C.red : C.ink} sub={endDelta ? `${endDelta > 0 ? "+" : ""}${endDelta} ימים מול בסיס` : "בהתאם לבסיס"} />
                <Kpi label="אומדן בהשלמה (EAC)" value={shekelShort(evm.EAC)} accent={evm.VAC != null && evm.VAC < 0 ? C.red : C.green} sub={evm.VAC == null ? "" : evm.VAC >= 0 ? `צפי עודף ${shekelShort(evm.VAC)}` : `צפי חריגה ${shekelShort(-evm.VAC)}`} />
                <Kpi label="שולם בפועל" value={shekelShort(evm.paidCash)} sub={evm.unpaid > 0 ? `ממתין לתשלום ${shekelShort(evm.unpaid)}` : "אין פער תשלומים"} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <Gauge label="SPI — ביצוע לוח זמנים" value={evm.SPI} sub={evm.SV >= 0 ? `מקדים בשווי ${shekelShort(evm.SV)}` : `מפגר בשווי ${shekelShort(-evm.SV)}`} />
                <Gauge label="CPI — יעילות עלות" value={evm.CPI} sub={evm.CV >= 0 ? `חיסכון ${shekelShort(evm.CV)}` : `חריגה ${shekelShort(-evm.CV)}`} />
                <MilestoneList items={milestones} />
              </div>
              <GroupBars rows={groupRows} />
              <Narrative items={narrative.slice(0, 1).concat(narrative.filter((n) => n.t === "המלצות"))} />
            </>
          )}

          {dashView === "sched" && (
            <>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <Gauge label="SPI — ביצוע לוח זמנים" value={evm.SPI} sub={`סטיית סיום: ${endDelta == null ? "—" : endDelta === 0 ? "ללא" : `${endDelta > 0 ? "+" : ""}${endDelta} ימים`}`} />
                <SlipTable rows={slips} />
                <MilestoneList items={milestones} />
              </div>
              <Gantt title="גאנט השוואתי — מתעדכן מול בסיס (אפור)" activities={current} discount={discount}
                baselineByWbs={baseByWbs} readOnly onShift={() => {}} onResize={() => {}} />
            </>
          )}

          {dashView === "fin" && (() => {
            const last = datedInv.length ? datedInv.at(-1) : null;
            const totApproved = last ? invApproved(last) : 0;
            const totPaid = last ? invPaidC(last) : 0;
            return (
              <>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <Kpi label="מאושר מצטבר" value={shekel(totApproved)} sub={last ? `נכון ל-${fmtDate(toDate(last.date))}` : ""} />
                  <Kpi label="שולם בפועל" value={shekel(totPaid)} accent={C.green} sub={`${totApproved > 0 ? ((totPaid / totApproved) * 100).toFixed(0) : 0}% מהמאושר`} />
                  <Kpi label="פער אישור–תשלום" value={shekel(totApproved - totPaid)} accent={totApproved - totPaid > 0 ? C.red : C.ink} />
                  <Kpi label={`עכבון ${retention}%`} value={shekel(totApproved * retention / 100)} accent={C.red} sub="ישוחרר במסירה" />
                  <Kpi label="שיא תזרים חודשי" value={shekelShort(curModel.totals.peakMonthly)} sub={`בחודש ${curModel.totals.peakLabel || "—"}`} />
                </div>
                <Gauge label="CPI — יעילות עלות" value={evm.CPI} sub={evm.CV >= 0 ? `חיסכון ${shekelShort(evm.CV)}` : `חריגה ${shekelShort(-evm.CV)}`} />
                <div style={{ height: 12 }} />
                <FlowChart title="תזרים חודשי — מתוכנן מול חשבונות ותשלומים" months={curMonthsWithActual} groupsPresent={curModel.groupsPresent} todayLabel={labelOfToday(curModel.months)} font={font} extraLine netLine />
              </>
            );
          })()}
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

            {/* ===== change-order journal ===== */}
            <div className="tab-panel" style={panel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 6px" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>יומן חריגים ופקודות שינוי</div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    רישום פרטני של כל חריג — במקום מספר מצטבר אחד. מאושרים: <b style={{ color: C.green }}>{shekel(coApproved)}</b>
                    {coPending > 0 && <> · ממתינים לאישור: <b style={{ color: "#B26A00" }}>{shekel(coPending)}</b></>}
                    {(() => {
                      const lastExtras = lastInv ? Number(lastInv.extras) || 0 : 0;
                      const gap = lastExtras - coApproved;
                      return Math.abs(gap) > 500 && changeOrders.length > 0
                        ? <span style={{ color: C.red }}> · פער מול "חריגים/נוספים" בחשבון האחרון: {shekel(gap)}</span>
                        : null;
                    })()}
                  </div>
                </div>
                <button className="no-print" style={btn} onClick={addCO}>+ הוסף חריג</button>
              </div>
              {changeOrders.length === 0 ? (
                <div style={{ padding: "10px 16px 16px", fontSize: 12.5, color: C.muted }}>אין חריגים רשומים. לחץ "+ הוסף חריג" כדי לרשום פקודת שינוי ראשונה.</div>
              ) : (
                <div style={{ overflowX: "auto", padding: "4px 10px 8px" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                    <thead>
                      <tr style={{ color: C.muted, fontSize: 11.5, textAlign: "right" }}>
                        {["תאריך", "תיאור", "סכום", "סטטוס", "הערה", ""].map((h) => <th key={h} style={{ padding: "6px 12px", fontWeight: 600 }}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {changeOrders.map((c) => {
                        const st = CO_STATUS.find((s) => s.id === c.status) || CO_STATUS[0];
                        return (
                          <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: "4px 12px" }}><input type="date" dir="ltr" value={c.date} onChange={(e) => setCO(c.id, "date", e.target.value)} style={{ ...cell, width: 130, textAlign: "center" }} /></td>
                            <td style={{ padding: "4px 12px" }}><input value={c.name} placeholder="תיאור החריג / פקודת השינוי" onChange={(e) => setCO(c.id, "name", e.target.value)} style={{ ...cell, width: 260 }} /></td>
                            <td style={{ padding: "4px 12px" }}><input type="number" value={c.amount} onChange={(e) => setCO(c.id, "amount", parseFloat(e.target.value) || 0)} style={{ ...cell, width: 110, textAlign: "left" }} /></td>
                            <td style={{ padding: "4px 12px" }}>
                              <select value={c.status} onChange={(e) => setCO(c.id, "status", e.target.value)}
                                style={{ ...cell, width: 100, cursor: "pointer", fontWeight: 700, color: st.color, background: st.bg }}>
                                {CO_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "4px 12px" }}><input value={c.note || ""} placeholder="—" onChange={(e) => setCO(c.id, "note", e.target.value)} style={{ ...cell, width: 200 }} /></td>
                            <td style={{ padding: "4px 6px", textAlign: "center" }}>
                              <button onClick={() => rmCO(c.id)} style={{ border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 16 }}>×</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ fontSize: 11, color: C.muted, padding: "2px 16px 14px", lineHeight: 1.6 }}>
                היומן הוא רישום ניהולי ואינו משנה את החישובים — סכום ה"חריגים/נוספים" בטבלת החשבונות הוא הקובע ל-EVM. מומלץ לוודא שסך המאושרים ביומן תואם את החשבון האחרון.
              </div>
            </div>
          </>
        );
      })()}

      {/* ===== TAB: AI ANALYSIS ===== */}
      {tab === "ai" && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* settings + generate */}
            <div style={{ ...panel, padding: "16px 18px", flex: "1 1 330px", maxWidth: 460 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✦ ניתוח AI — Claude</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
                שליחת תמצית נתוני הפרויקט (מספרים בלבד) ל-Claude לקבלת סקירת מנהלים, ניתוח סיכונים והמלצות.
                נדרש מפתח API אישי מ-<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "#1D6FA3" }}>console.anthropic.com</a>.
                המפתח נשמר <b>בדפדפן זה בלבד</b> ולא נשלח לענן האפליקציה.
              </div>
              <label style={{ fontSize: 12, color: C.muted }}>מפתח API</label>
              <input type="password" dir="ltr" value={aiKey} onChange={(e) => setAiKey(e.target.value)} placeholder="sk-ant-..."
                style={{ ...cell, width: "100%", marginTop: 4, marginBottom: 10, textAlign: "left" }} />
              <label style={{ fontSize: 12, color: C.muted }}>מודל</label>
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} style={{ ...cell, width: "100%", marginTop: 4, marginBottom: 14, fontFamily: font, cursor: "pointer" }}>
                {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <button onClick={generateAi} disabled={aiBusy} style={{
                fontFamily: font, fontSize: 14, fontWeight: 700, padding: "10px 18px", borderRadius: 9, border: "none",
                background: aiBusy ? "#8A99A8" : C.ink, color: "#fff", cursor: aiBusy ? "wait" : "pointer", width: "100%",
              }}>{aiBusy ? "⏳ מנתח את הפרויקט…" : "✦ הפק ניתוח AI"}</button>
              {aiErr && <div style={{ marginTop: 10, fontSize: 12.5, color: C.red, background: "#FBEEEC", borderRadius: 8, padding: "8px 10px", lineHeight: 1.6 }}>{aiErr}</div>}
              {aiView && (
                <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 12.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={aiInReport} onChange={(e) => setAiInReport(e.target.checked)} />
                  כלול את הניתוח המוצג בדוח המודפס (לשונית ⑦)
                </label>
              )}

              {aiHistory.length > 0 && (
                <div style={{ marginTop: 16, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>היסטוריית ניתוחים ({aiHistory.length})</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, lineHeight: 1.6 }}>
                    הניתוחים נשמרים עם הפרויקט {usingCloud ? "בענן" : "בדפדפן"} וזמינים גם אחרי רענון. לחץ לצפייה.
                  </div>
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    {aiHistory.map((h) => {
                      const sel = aiView && h.id === aiView.id;
                      return (
                        <div key={h.id} onClick={() => setAiViewId(h.id)} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer",
                          padding: "7px 10px", borderRadius: 8, marginBottom: 4, border: `1px solid ${sel ? C.ink : C.border}`,
                          background: sel ? "#F0F4F8" : "#fff",
                        }}>
                          <div>
                            <div style={{ fontSize: 12.5, fontWeight: sel ? 800 : 600 }}>✦ {fmtDate(toDate(h.dateISO))}{h.statusDate ? ` · סטטוס ${h.statusDate}` : ""}</div>
                            <div style={{ fontSize: 10.5, color: C.muted }}>{AI_MODELS.find((m) => m.id === h.model)?.label || h.model}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deleteAiEntry(h.id); }} title="מחק ניתוח"
                            style={{ border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 15 }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* result / built-in insights */}
            <div style={{ flex: "2 1 480px", minWidth: 320 }}>
              {aiView ? (
                <div className="tab-panel" style={{ ...panel, padding: "18px 22px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>✦ ניתוח Claude — {projName}</div>
                    <button className="no-print" onClick={() => window.print()} style={{ ...btn, fontSize: 12, padding: "6px 12px" }}>🖨 הדפס</button>
                  </div>
                  <Md text={aiView.text} />
                  <div style={{ fontSize: 10.5, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 12 }}>
                    נוצר על ידי {AI_MODELS.find((m) => m.id === aiView.model)?.label || aiView.model} · {fmtDate(toDate(aiView.dateISO))} · נשמר עם הפרויקט · יש לוודא מסקנות מול הנתונים בפועל
                  </div>
                </div>
              ) : (
                <div style={{ ...panel, padding: "18px 22px", textAlign: "center", color: C.muted, fontSize: 13 }}>
                  <div style={{ fontSize: 34, marginBottom: 6 }}>✦</div>
                  הניתוח יופיע כאן. בינתיים — למטה מוצגות תובנות אוטומטיות המחושבות מהנתונים ללא AI.
                </div>
              )}
              <div style={{ height: 12 }} />
              <Narrative items={insights.length ? insights : [{ t: "אין תובנות נוספות", tone: "info", body: "הזן חשבונות ואחוזי ביצוע כדי לקבל תובנות אוטומטיות." }]} />
            </div>
          </div>
        </>
      )}

      {/* ===== TAB 7: PRINTABLE REPORT ===== */}
      {tab === "report" && (() => {
        const spi = evm.SPI, cpi = evm.CPI;
        const isBad = (spi != null && spi < 0.85) || (cpi != null && cpi < 0.85) || (endDelta != null && endDelta > 30);
        const isWarn = !isBad && ((spi != null && spi < 0.97) || (cpi != null && cpi < 0.97) || (endDelta != null && endDelta > 7) || (evm.AC > 0 && evm.unpaid / evm.AC > 0.15));
        const health = isBad
          ? { label: "חריגה מהותית — נדרשת התערבות", color: "#C0392B", bg: "#FBEEEC", border: "#E5B8B2" }
          : isWarn
            ? { label: "טעון מעקב", color: "#B26A00", bg: "#FDF6E9", border: "#EAD9AE" }
            : { label: "הפרויקט במסלול", color: "#2F8F63", bg: "#EEF7F1", border: "#CDE8D8" };
        const lastSnap = snapshots[0] || null;
        const approvedCOs = changeOrders.filter((c) => c.status === "approved");
        const curSnapValues = { pct: evm.pctComplete, SPI: evm.SPI, CPI: evm.CPI, AC: evm.AC, extras: lastInv ? Number(lastInv.extras) || 0 : 0, endDelta };
        let sec = 0;
        const thCell = { padding: "6px 9px", fontWeight: 600, fontSize: 11, whiteSpace: "nowrap" };
        const tdCell = { padding: "5px 9px", whiteSpace: "nowrap" };
        return (
          <>
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10, maxWidth: 880, marginInline: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted }}>
                <button style={btn} onClick={saveSnapshot}>📸 שמור תמונת מצב להשוואה</button>
                {lastSnap && (
                  <span>
                    נשמרו {snapshots.length} · אחרונה: {fmtDate(toDate(lastSnap.dateISO))}
                    <button title="מחק את תמונת המצב האחרונה" onClick={() => rmSnapshot(lastSnap.id)} style={{ border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 14, marginInlineStart: 2 }}>×</button>
                  </span>
                )}
              </div>
              <button style={{ ...btn, background: C.ink, color: "#fff", border: "none" }} onClick={() => window.print()}>🖨 הדפס / שמור כ-PDF</button>
            </div>

            <div className="report-sheet" style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, padding: "34px 40px", maxWidth: 880, margin: "0 auto" }}>

              {/* ============ COVER ============ */}
              <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Logo size={30} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted }}>מערכת בקרה תקציבית</span>
                  </div>
                  <span style={{ fontSize: 11.5, color: C.muted }} dir="ltr">{fmtDate(today)}</span>
                </div>

                <div style={{ textAlign: "center", margin: "40px 0 26px" }}>
                  <Logo size={64} />
                  <div style={{ fontSize: 27, fontWeight: 800, marginTop: 16, letterSpacing: -0.4 }}>דוח בקרה תקציבית חודשי</div>
                  <div style={{ fontSize: 18, color: C.muted, marginTop: 6 }}>{projName}</div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>
                    תאריך סטטוס: <b style={{ color: C.ink }}>{fmtDate(evm.statusDate)}</b> · הופק: {fmtDate(today)}
                    {baseModel.totals.endDate && <> · סיום מתוכנן: <b style={{ color: C.ink }}>{fmtDate(curModel.totals.endDate)}</b></>}
                  </div>
                </div>

                {/* status banner */}
                <div style={{ background: health.bg, border: `1.5px solid ${health.border}`, borderRadius: 12, padding: "13px 20px", display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                  <span style={{ width: 13, height: 13, borderRadius: "50%", background: health.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 800, color: health.color }}>{health.label}</div>
                    <div style={{ fontSize: 12.5, color: C.ink, marginTop: 2 }}>
                      בוצע {evm.pctComplete.toFixed(0)}% · SPI {ratio(evm.SPI)} · CPI {ratio(evm.CPI)}
                      {endDelta != null && <> · סטיית סיום {endDelta > 0 ? `+${endDelta}` : endDelta} ימים</>}
                      {evm.AC > 0 && evm.unpaid > 1000 && <> · טרם שולם {shekelShort(evm.unpaid)}</>}
                    </div>
                  </div>
                </div>

                {/* KPI grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                  {[
                    ["תקציב (BAC)", shekel(evm.BAC), null, null],
                    ["השלמה", `${evm.pctComplete.toFixed(0)}%`, `EV ${shekelShort(evm.EV)}`, null],
                    ["מאושר בפועל (AC)", shekel(evm.AC), evm.paidCash != null && evm.paidCash !== evm.AC ? `שולם ${shekelShort(evm.paidCash)}` : null, null],
                    ["SPI — לו״ז", ratio(evm.SPI), evm.SV != null ? `SV ${shekelShort(evm.SV)}` : null, evm.SPI == null ? null : evm.SPI >= 1],
                    ["CPI — עלות", ratio(evm.CPI), evm.CV != null ? `CV ${shekelShort(evm.CV)}` : null, evm.CPI == null ? null : evm.CPI >= 1],
                    ["תחזית בהשלמה (EAC)", shekel(evm.EAC), evm.VAC != null ? `VAC ${shekelShort(evm.VAC)}` : null, evm.VAC == null ? null : evm.VAC >= 0],
                  ].map(([k, v, sub, good]) => (
                    <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 11, padding: "11px 13px", textAlign: "center" }}>
                      <div style={{ fontSize: 10.5, color: C.muted }}>{k}</div>
                      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 2, color: good == null ? C.ink : good ? C.green : C.red }}>{v}</div>
                      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {prevSnap && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>מה השתנה מאז תמונת המצב הקודמת ({fmtDate(toDate(prevSnap.dateISO))})</div>
                    <DeltaChips prev={prevSnap} cur={curSnapValues} />
                  </div>
                )}

                <div style={{ marginTop: "auto", fontSize: 11, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
                  <span>אומדן לאחר הנחה ({discount}%) · עכבון {retention}%</span>
                  <span>{current.length} פעילויות · {invoices.length} חשבונות{approvedCOs.length ? ` · ${approvedCOs.length} פקודות שינוי מאושרות` : ""}</span>
                </div>
              </div>

              <div className="page-break" />

              {/* ============ 1. chapter progress ============ */}
              <RSec n={++sec} title="התקדמות לפי פרקים">
                <ChapterProgress rows={groupRows} />
              </RSec>

              {/* ============ 2. slips ============ */}
              <RSec n={++sec} title="פעילויות בפיגור מול תכנית הבסיס">
                {slips.length === 0 ? (
                  <div style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>אין סטיות לו״ז מול תכנית הבסיס ✓</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                        {["סעיף", "פעילות", "% ביצוע", "% מתוכנן", "סטיית סיום"].map((h) => <th key={h} style={thCell}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {slips.map((r) => {
                        const act = current.find((a) => a.wbs === r.wbs);
                        const planned = act ? Math.round(plannedFrac(act.start, act.finish, statusDate) * 100) : null;
                        return (
                          <tr key={r.wbs} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ ...tdCell, color: C.muted }}>{r.wbs}</td>
                            <td style={{ ...tdCell, whiteSpace: "normal" }}>{r.name}</td>
                            <td style={tdCell}>{act ? `${act.progress || 0}%` : "—"}</td>
                            <td style={tdCell}>{planned != null ? `${planned}%` : "—"}</td>
                            <td style={{ ...tdCell, fontWeight: 800, color: r.slip > 0 ? C.red : C.green }}>{r.slip > 0 ? `+${r.slip}` : r.slip} ימים</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </RSec>

              {/* ============ 3. monthly tracking ============ */}
              <RSec n={++sec} title="מעקב חודשי — מתוכנן מול ביצוע">
                {/* fixed chart width — ResponsiveContainer keeps its screen size when printing, so it must also fit A4 (~700px) */}
                <div style={{ direction: "ltr", width: 650, maxWidth: "100%", marginInline: "auto", height: 195, marginBottom: 14 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={monthlyTrack} margin={{ top: 6, right: 8, bottom: 2, left: 8 }}>
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: C.muted }} tickMargin={4} />
                      <YAxis tick={{ fontSize: 9.5, fill: C.muted }} tickFormatter={shekelShort} width={50} />
                      <Legend wrapperStyle={{ fontFamily: font, fontSize: 11 }} />
                      <Bar dataKey="curPlan" name="מתוכנן לחודש" fill={C.baseGray} radius={[3, 3, 0, 0]} />
                      <Bar dataKey="approved" name="בוצע בפועל" fill={C.amber} radius={[3, 3, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                      {["חודש", "מתוכנן לחודש", "בוצע לחודש", "% ביצוע", "שולם לחודש", "מתוכנן מצטבר", "בוצע מצטבר"].map((h) => <th key={h} style={thCell}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrack.map((m) => (
                      <tr key={m.label} style={{ borderBottom: `1px solid ${C.border}`, color: m.isFuture ? C.muted : C.ink, background: m.isFuture ? "#FBFCFD" : "transparent" }}>
                        <td style={{ ...tdCell, fontWeight: 600 }}>{m.label}</td>
                        <td style={tdCell}>{shekel(m.curPlan)}</td>
                        <td style={tdCell}>{m.approved != null && !m.isFuture ? shekel(m.approved) : "—"}</td>
                        <td style={{ ...tdCell, fontWeight: 700, color: m.exec == null || m.isFuture ? C.muted : m.exec >= 85 ? C.green : m.exec >= 60 ? "#B26A00" : C.red }}>
                          {m.exec != null && !m.isFuture ? `${Math.round(m.exec)}%` : "—"}
                        </td>
                        <td style={tdCell}>{m.paid != null && !m.isFuture ? shekel(m.paid) : "—"}</td>
                        <td style={{ ...tdCell, color: C.muted }}>{shekel(m.curCum)}</td>
                        <td style={{ ...tdCell, fontWeight: 600 }}>{m.actualCum != null ? shekel(m.actualCum) : "—"}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${C.ink}`, fontWeight: 800 }}>
                      <td style={tdCell}>סה״כ</td>
                      <td style={tdCell}>{shekel(monthlyTrack.reduce((s, m) => s + (m.curPlan || 0), 0))}</td>
                      <td style={tdCell}>{shekel(evm.AC)}</td>
                      <td style={tdCell}>{(() => { const p = monthlyTrack.filter((m) => !m.isFuture).reduce((s, m) => s + (m.curPlan || 0), 0); return p > 0 ? `${Math.round((evm.AC / p) * 100)}%` : "—"; })()}</td>
                      <td style={tdCell}>{evm.paidCash != null ? shekel(evm.paidCash) : "—"}</td>
                      <td style={tdCell} colSpan={2} />
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>"בוצע לחודש" — הגידול בחשבון המאושר המצטבר באותו חודש. "% ביצוע" — בוצע מול מתוכנן באותו החודש. שורות אפורות — חודשים עתידיים (תכנון בלבד).</div>
              </RSec>

              <div className="page-break" />

              {/* ============ 4. S-curves + EVM ============ */}
              <RSec n={++sec} title="עקומות S ומדדי EVM">
                <div style={{ direction: "ltr", width: 650, maxWidth: "100%", marginInline: "auto", height: 235, marginBottom: 14 }}>
                  <ResponsiveContainer>
                    <ComposedChart data={compMonths} margin={{ top: 6, right: 10, bottom: 4, left: 10 }}>
                      <CartesianGrid stroke={C.border} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9.5, fill: C.muted }} tickMargin={5} />
                      <YAxis tick={{ fontSize: 9.5, fill: C.muted }} tickFormatter={shekelShort} width={52} />
                      <Legend wrapperStyle={{ fontFamily: font, fontSize: 11 }} />
                      <Line dataKey="baseCum" name="בסיס" stroke={C.baseGray} strokeWidth={2} strokeDasharray="6 4" dot={false} />
                      <Line dataKey="curCum" name="מתעדכן" stroke={C.ink} strokeWidth={2.2} dot={false} />
                      <Line dataKey="actualCum" name="מאושר בפועל" stroke={C.amber} strokeWidth={2.2} dot={false} connectNulls={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 7 }}>
                  {[
                    ["BAC", "תקציב בסיס", shekel(evm.BAC), null],
                    ["PV", "ערך מתוכנן", shekel(evm.PV), null],
                    ["EV", "ערך מזוכה", shekel(evm.EV), null],
                    ["AC", "עלות בפועל", shekel(evm.AC), null],
                    ["SV", "סטיית לו״ז", shekel(evm.SV), evm.SV == null ? null : evm.SV >= 0],
                    ["CV", "סטיית עלות", shekel(evm.CV), evm.CV == null ? null : evm.CV >= 0],
                    ["SPI", "מדד לו״ז", ratio(evm.SPI), evm.SPI == null ? null : evm.SPI >= 1],
                    ["CPI", "מדד עלות", ratio(evm.CPI), evm.CPI == null ? null : evm.CPI >= 1],
                    ["EAC", "אומדן בהשלמה", shekel(evm.EAC), null],
                    ["ETC", "עלות להשלמה", shekel(evm.ETC), null],
                    ["VAC", "סטייה בהשלמה", shekel(evm.VAC), evm.VAC == null ? null : evm.VAC >= 0],
                    ["השלמה", "EV / BAC", `${evm.pctComplete.toFixed(1)}%`, null],
                  ].map(([k, d, v, good]) => (
                    <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 10px" }}>
                      <div style={{ fontSize: 10, color: C.muted }}><b>{k}</b> · {d}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 1, color: good == null ? C.ink : good ? C.green : C.red }}>{v}</div>
                    </div>
                  ))}
                </div>
              </RSec>

              {/* ============ 5. narrative ============ */}
              <RSec n={++sec} title="ניתוח וממצאים">
                {narrative.map((it, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{it.t}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, color: C.ink, whiteSpace: "pre-line" }}>{it.body}</div>
                  </div>
                ))}
              </RSec>

              {/* ============ 6. AI analysis (saved) ============ */}
              {aiView && aiInReport && (
                <RSec n={++sec} title="ניתוח AI — Claude" noBreak>
                  <div style={{ background: "#F7F9FB", border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 17px" }}>
                    <Md text={aiView.text} />
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 7 }}>
                      נוצר ב-{fmtDate(toDate(aiView.dateISO))} · {AI_MODELS.find((m) => m.id === aiView.model)?.label || aiView.model} · יש לוודא מסקנות מול הנתונים בפועל
                    </div>
                  </div>
                </RSec>
              )}

              {/* ============ 7. invoices + change orders ============ */}
              <RSec n={++sec} title={`חשבונות ופקודות שינוי (עכבון ${retention}%)`}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: approvedCOs.length ? 16 : 0 }}>
                  <thead>
                    <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                      {["תאריך", "חוזה מצטבר", "חריגים/נוספים", "סה״כ מצטבר", "חודשי", "נטו לאחר עכבון"].map((h) => <th key={h} style={thCell}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv, idx) => (
                      <tr key={inv.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={tdCell}>{fmtDate(toDate(inv.date))}</td>
                        <td style={tdCell}>{shekel(inv.cumulative)}</td>
                        <td style={{ ...tdCell, color: (inv.extras || 0) > 0 ? "#B26A00" : C.muted }}>{shekel(inv.extras || 0)}</td>
                        <td style={{ ...tdCell, fontWeight: 600 }}>{shekel(invTotal(inv))}</td>
                        <td style={{ ...tdCell, color: C.muted }}>{shekel(invTotal(inv) - (idx > 0 ? invTotal(invoices[idx - 1]) : 0))}</td>
                        <td style={{ ...tdCell, fontWeight: 600 }}>{shekel(invTotal(inv) * (1 - retention / 100))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {approvedCOs.length > 0 && (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>פקודות שינוי מאושרות ({approvedCOs.length}) — סה״כ {shekel(coApproved)}</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#F0F4F8", color: C.muted, textAlign: "right" }}>
                          {["תאריך", "תיאור", "סכום", "הערה"].map((h) => <th key={h} style={thCell}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {approvedCOs.map((c) => (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td style={tdCell}>{fmtDate(toDate(c.date))}</td>
                            <td style={{ ...tdCell, whiteSpace: "normal" }}>{c.name || "—"}</td>
                            <td style={{ ...tdCell, fontWeight: 600 }}>{shekel(c.amount)}</td>
                            <td style={{ ...tdCell, whiteSpace: "normal", color: C.muted }}>{c.note || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </RSec>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 16, marginTop: 8 }}>
                <span>הוכן ע״י: ________________</span>
                <span>חתימה: ________________</span>
                <span>תאריך: {fmtDate(today)}</span>
              </div>
            </div>
          </>
        );
      })()}

      <div className="no-print" style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
        הנתונים נשמרים אוטומטית ונטענים בפתיחה מחדש. פעילות עם משך 0 מוצגת כאבן דרך ◆. הנתיב הקריטי (אדום) מחושב משרשראות התלויות — הוסף קשרי "קודמת" כדי שהנתיב יתעדכן. עקומת "נטו לאחר עכבון" מציגה את התקבולים בפועל בניכוי {retention}% עכבון.
      </div>
    </div>
  );
}

export default function AppRoot() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
