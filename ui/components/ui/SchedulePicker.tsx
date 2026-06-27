"use client";

import { useEffect, useRef, useState } from "react";

// ─── Wheel picker ──────────────────────────────────────────────────────────────

const ITEM_H = 42;

function WheelPicker({
  items,
  selected,
  onChange,
  width = 80,
}: {
  items: { label: string; value: string }[];
  selected: string;
  onChange: (v: string) => void;
  width?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userScrolling = useRef(false);

  // Sync scroll position when selected changes externally
  useEffect(() => {
    if (userScrolling.current) return;
    const idx = items.findIndex((i) => i.value === selected);
    if (scrollRef.current && idx >= 0) {
      scrollRef.current.scrollTop = idx * ITEM_H;
    }
  }, [selected, items]);

  function handleScroll() {
    userScrolling.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      userScrolling.current = false;
      if (!scrollRef.current) return;
      const raw = scrollRef.current.scrollTop / ITEM_H;
      const idx = Math.max(0, Math.min(items.length - 1, Math.round(raw)));
      scrollRef.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      onChange(items[idx].value);
    }, 90);
  }

  return (
    <div style={{ position: "relative", width, height: ITEM_H * 3, overflow: "hidden", flexShrink: 0 }}>
      {/* Hide scrollbar */}
      <style>{`.wp-scroll::-webkit-scrollbar{display:none}`}</style>

      {/* Gradient fade top/bottom */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2,
        background: "linear-gradient(to bottom, rgba(15,15,15,0.96) 0%, rgba(15,15,15,0) 32%, rgba(15,15,15,0) 68%, rgba(15,15,15,0.96) 100%)",
      }} />

      {/* Center selection band */}
      <div style={{
        position: "absolute", left: 4, right: 4, top: ITEM_H, height: ITEM_H,
        background: "rgba(255,255,255,0.055)", border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 9, pointerEvents: "none", zIndex: 1,
      }} />

      {/* Scrollable items */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="wp-scroll"
        style={{
          height: "100%", overflowY: "scroll",
          paddingTop: ITEM_H, paddingBottom: ITEM_H,
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        } as React.CSSProperties}
      >
        {items.map((item, i) => {
          const isSelected = item.value === selected;
          return (
            <div
              key={item.value}
              onClick={() => {
                onChange(item.value);
                scrollRef.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
              }}
              style={{
                height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 17,
                fontWeight: isSelected ? 500 : 400,
                color: isSelected ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.28)",
                cursor: "pointer",
                userSelect: "none",
                transition: "color 0.15s",
              }}
            >
              {item.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Schedule types & helpers ──────────────────────────────────────────────────

type Freq = "hourly" | "daily" | "weekdays" | "weekly" | "monthly";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: String(i).padStart(2, "0"),
}));

const MINS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i * 5).padStart(2, "0"),
  label: String(i * 5).padStart(2, "0"),
}));

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

function roundMin(m: string): string {
  const n = parseInt(m, 10);
  return String(Math.round(n / 5) * 5 % 60).padStart(2, "0");
}

function buildSchedule(freq: Freq, day: string, hour: string, min: string, mday: string): string {
  if (freq === "hourly") return "hourly";
  if (freq === "daily") return `daily:${hour}:${min}`;
  if (freq === "weekdays") return `weekdays:${hour}:${min}`;
  if (freq === "weekly") return `weekly:${day}:${hour}:${min}`;
  return `monthly:${mday}:${hour}:${min}`;
}

function parseSchedule(s: string): { freq: Freq; day: string; hour: string; min: string; mday: string } {
  if (s === "hourly") return { freq: "hourly", day: "mon", hour: "09", min: "00", mday: "1" };
  const p = s.split(":");
  const freq = p[0] as Freq;
  if (freq === "daily")    return { freq, day: "mon", hour: p[1] ?? "09", min: roundMin(p[2] ?? "00"), mday: "1" };
  if (freq === "weekdays") return { freq, day: "mon", hour: p[1] ?? "09", min: roundMin(p[2] ?? "00"), mday: "1" };
  if (freq === "weekly")   return { freq, day: p[1] ?? "mon", hour: p[2] ?? "09", min: roundMin(p[3] ?? "00"), mday: "1" };
  if (freq === "monthly")  return { freq, day: "mon", hour: p[2] ?? "09", min: roundMin(p[3] ?? "00"), mday: p[1] ?? "1" };
  return { freq: "daily", day: "mon", hour: "09", min: "00", mday: "1" };
}

function humanLabel(s: string): string {
  if (s === "hourly") return "Every hour";
  const p = s.split(":");
  const freq = p[0];
  const pad = (v: string) => v.padStart(2, "0");
  const fmtTime = (h: string, m: string) => {
    const hh = parseInt(h, 10);
    const suffix = hh >= 12 ? "PM" : "AM";
    const display = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `${display}:${pad(m)} ${suffix}`;
  };
  if (freq === "daily")    return `Every day at ${fmtTime(p[1], p[2])}`;
  if (freq === "weekdays") return `Every weekday at ${fmtTime(p[1], p[2])}`;
  if (freq === "weekly")   return `Every ${DAY_LABEL[p[1]] ?? p[1]} at ${fmtTime(p[2], p[3])}`;
  if (freq === "monthly") {
    const day = parseInt(p[1], 10);
    const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
    return `${day}${suffix} of each month at ${fmtTime(p[2], p[3])}`;
  }
  return s;
}

// ─── SchedulePicker ────────────────────────────────────────────────────────────

export function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseSchedule(value);
  const [freq,  setFreq]  = useState<Freq>(parsed.freq);
  const [day,   setDay]   = useState(parsed.day);
  const [hour,  setHour]  = useState(parsed.hour);
  const [min,   setMin]   = useState(parsed.min);
  const [mday,  setMday]  = useState(parsed.mday);

  function emit(f = freq, d = day, h = hour, m = min, md = mday) {
    onChange(buildSchedule(f, d, h, m, md));
  }

  const FREQ_TABS: { value: Freq; label: string }[] = [
    { value: "hourly",   label: "Hourly" },
    { value: "daily",    label: "Daily" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekly",   label: "Weekly" },
    { value: "monthly",  label: "Monthly" },
  ];

  const showTime  = freq !== "hourly";
  const showDay   = freq === "weekly";
  const showMDay  = freq === "monthly";

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "16px 16px 18px" }}>

      {/* Frequency tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: showTime ? 18 : 0, flexWrap: "wrap" }}>
        {FREQ_TABS.map((tab) => {
          const active = freq === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => {
                setFreq(tab.value);
                emit(tab.value, day, hour, min, mday);
              }}
              style={{
                fontSize: 12, padding: "5px 13px", borderRadius: 20, cursor: "pointer",
                background: active ? "rgba(255,255,255,0.10)" : "transparent",
                border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)"}`,
                color: active ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.38)",
                fontFamily: "inherit", transition: "all 0.14s",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Weekly — day of week */}
      {showDay && (
        <div style={{ display: "flex", gap: 4, marginBottom: 18 }}>
          {DAYS.map((d) => {
            const active = day === d;
            return (
              <button
                key={d}
                onClick={() => { setDay(d); emit(freq, d, hour, min, mday); }}
                style={{
                  flex: 1, fontSize: 11, padding: "6px 0", borderRadius: 8, cursor: "pointer",
                  background: active ? "rgba(255,255,255,0.09)" : "transparent",
                  border: `1px solid ${active ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)"}`,
                  color: active ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.32)",
                  fontFamily: "inherit", transition: "all 0.14s",
                }}
              >
                {DAY_LABEL[d]}
              </button>
            );
          })}
        </div>
      )}

      {/* Time wheels */}
      {showTime && (
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 0 }}>
          {/* Month day wheel (for monthly) */}
          {showMDay && (
            <>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Day</span>
                <WheelPicker items={MONTH_DAYS} selected={mday} width={64}
                  onChange={(v) => { setMday(v); emit(freq, day, hour, min, v); }} />
              </div>
              <div style={{ height: ITEM_H, display: "flex", alignItems: "center", padding: "0 8px", marginBottom: 0, color: "rgba(255,255,255,0.15)", fontSize: 18 }}>·</div>
            </>
          )}

          {/* Hour */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Hour</span>
            <WheelPicker items={HOURS} selected={hour} width={72}
              onChange={(v) => { setHour(v); emit(freq, day, v, min, mday); }} />
          </div>

          {/* Colon */}
          <div style={{ height: ITEM_H, display: "flex", alignItems: "center", padding: "0 4px", fontSize: 22, color: "rgba(255,255,255,0.30)", fontWeight: 300 }}>
            :
          </div>

          {/* Minute */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Min</span>
            <WheelPicker items={MINS} selected={min} width={72}
              onChange={(v) => { setMin(v); emit(freq, day, hour, v, mday); }} />
          </div>
        </div>
      )}

      {/* Human-readable summary */}
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center", marginTop: 14, lineHeight: 1.4 }}>
        {humanLabel(value)}
      </p>
    </div>
  );
}
