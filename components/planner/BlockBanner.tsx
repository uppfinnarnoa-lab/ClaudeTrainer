"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, Archive } from "lucide-react";
import type { TrainingBlock } from "@/lib/planner/types";
import { BLOCK_TYPE_COLORS } from "@/lib/planner/types";
import { formatDistance, formatDuration } from "@/lib/utils";
import { format, parseISO, differenceInWeeks } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  blocks: TrainingBlock[];
  onNewBlock: () => void;
  onBlockClick: (block: TrainingBlock) => void;
}

export function BlockBanner({ blocks, onNewBlock, onBlockClick }: Props) {
  const [open, setOpen] = useState(true);

  const today = format(new Date(), "yyyy-MM-dd");
  const past    = blocks.filter(b => b.archived || b.endDate < today);
  const current = blocks.filter(b => !b.archived && b.startDate <= today && b.endDate >= today);
  const upcoming = blocks.filter(b => !b.archived && b.startDate > today);

  return (
    <div className="border-b border-border bg-surface">
      {/* Toggle bar */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 transition-colors"
      >
        <span className="font-semibold text-primary flex-1 text-left">Training Blocks</span>
        <button
          onClick={e => { e.stopPropagation(); onNewBlock(); }}
          className="flex items-center gap-1 text-xs text-accent hover:underline px-2 py-1"
        >
          <Plus size={12} />
          New block
        </button>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1 max-h-56 overflow-y-auto">
          {/* Past */}
          {past.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide pt-1">Past</p>
              {past.map(b => <BlockRow key={b.id} block={b} today={today} onClick={onBlockClick} isPast />)}
            </div>
          )}

          {/* Current */}
          {current.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide pt-1">Current</p>
              {current.map(b => <BlockRow key={b.id} block={b} today={today} onClick={onBlockClick} isCurrent />)}
            </div>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wide pt-1">Upcoming</p>
              {upcoming.map(b => <BlockRow key={b.id} block={b} today={today} onClick={onBlockClick} />)}
            </div>
          )}

          {blocks.length === 0 && (
            <p className="text-xs text-muted py-2">
              No training blocks yet.{" "}
              <button onClick={onNewBlock} className="text-accent hover:underline">Create your first block</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BlockRow({ block, today, onClick, isPast, isCurrent }: {
  block: TrainingBlock;
  today: string;
  onClick: (b: TrainingBlock) => void;
  isPast?: boolean;
  isCurrent?: boolean;
}) {
  const color = block.color ?? BLOCK_TYPE_COLORS[block.blockType] ?? "#8B5CF6";
  const weeks = differenceInWeeks(parseISO(block.endDate), parseISO(block.startDate)) + 1;
  const startFmt = format(parseISO(block.startDate), "d MMM");
  const endFmt = format(parseISO(block.endDate), "d MMM");

  // Progress for current block
  const progressDays = isCurrent
    ? differenceInWeeks(new Date(), parseISO(block.startDate)) + 1
    : null;

  return (
    <button
      onClick={() => onClick(block)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-xs transition-colors hover:bg-surface-2",
        isPast && "opacity-70"
      )}
    >
      {/* Color badge */}
      <div
        className="w-3 h-3 rounded-sm shrink-0"
        style={{ backgroundColor: color }}
      />

      {/* Name + type */}
      <div className="flex-1 min-w-0">
        <span className="font-semibold text-primary">{block.name}</span>
        <span className="ml-1.5 text-muted capitalize">{block.blockType}</span>
        <span className="ml-1.5 text-muted">{startFmt}–{endFmt} · {weeks}w</span>
      </div>

      {/* Actuals (past) or progress (current) */}
      {isPast && block.actualKm && (
        <span className="text-muted font-mono shrink-0">{block.actualKm.toFixed(0)}km</span>
      )}
      {isCurrent && progressDays !== null && (
        <span className="text-accent shrink-0">Wk {progressDays}/{weeks}</span>
      )}
      {isPast && <Archive size={12} className="text-muted shrink-0" />}
    </button>
  );
}
