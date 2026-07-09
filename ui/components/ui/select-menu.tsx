"use client";

import * as React from "react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  separator?: boolean;   // render a separator before this item
  avatarUrl?: string | null;
}

export interface SelectMenuProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  /** "sm" → compact pill (e.g. role badge). "default" → form field height. */
  size?: "sm" | "default";
  /** Align the dropdown to the start or end of the trigger */
  align?: "start" | "end" | "center";
  className?: string;
  style?: React.CSSProperties;
}

function Avatar({ url, label, size }: { url?: string | null; label: string; size: number }) {
  const initial = label[0]?.toUpperCase() ?? "?";
  const fontSize = size <= 18 ? 9 : 11;
  return url ? (
    <img
      src={url}
      alt={label}
      style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0,
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 500, color: "rgba(255,255,255,0.55)",
    }}>
      {initial}
    </div>
  );
}

/**
 * Drop-in replacement for native <select>.
 * Uses the Doppel glass DropdownMenu under the hood.
 * Supports optional avatarUrl on options for clone pickers.
 *
 * Usage:
 *   <SelectMenu
 *     value={value}
 *     onChange={setValue}
 *     options={[{ value: "a", label: "Option A", avatarUrl: "..." }, ...]}
 *   />
 */
export function SelectMenu({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select…",
  size = "default",
  align = "start",
  className,
  style,
}: SelectMenuProps) {
  const selected = options.find(o => o.value === value);
  const displayLabel = selected?.label ?? placeholder;
  const sm = size === "sm";
  const hasAnyAvatar = options.some(o => o.avatarUrl !== undefined);
  const avatarSize = sm ? 18 : 20;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          style={style}
          className={cn(
            "inline-flex items-center justify-between gap-2 font-sans",
            "rounded-xl border border-[rgba(255,255,255,0.09)] bg-[rgba(255,255,255,0.05)]",
            "text-[rgba(255,255,255,0.70)] transition-all outline-none",
            "hover:border-[rgba(255,255,255,0.15)] hover:bg-[rgba(255,255,255,0.07)]",
            "focus-visible:ring-1 focus-visible:ring-[rgba(255,255,255,0.25)]",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "group cursor-pointer data-[state=open]:border-[rgba(255,255,255,0.18)] data-[state=open]:bg-[rgba(255,255,255,0.08)]",
            sm
              ? "h-7 px-2.5 text-xs min-w-[72px]"
              : "h-9 px-3 text-sm min-w-[120px]",
            className,
          )}
        >
          <span className="inline-flex items-center gap-1.5 min-w-0">
            {hasAnyAvatar && (
              <Avatar url={selected?.avatarUrl} label={displayLabel} size={avatarSize} />
            )}
            <span className="truncate">{displayLabel}</span>
          </span>
          <ChevronDownIcon
            className={cn(
              "shrink-0 opacity-45 transition-transform duration-150",
              "group-data-[state=open]:rotate-180",
              sm ? "h-3 w-3" : "h-3.5 w-3.5",
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
      >
        {options.map(opt => (
          <React.Fragment key={opt.value}>
            {opt.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => onChange(opt.value)}
              className={cn(
                opt.value === value && "text-[rgba(255,255,255,0.92)] bg-[rgba(255,255,255,0.06)]",
              )}
            >
              {hasAnyAvatar && (
                <Avatar url={opt.avatarUrl} label={opt.label} size={avatarSize} />
              )}
              {opt.label}
              {opt.value === value && (
                <svg
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  className="ml-auto shrink-0"
                >
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
