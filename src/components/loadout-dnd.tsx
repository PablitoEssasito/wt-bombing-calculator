"use client";

import { Accessibility, AutoScroller } from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, PointerSensor, useDraggable, useDroppable } from "@dnd-kit/react";
import * as motion from "motion/react-m";
import { createContext, useContext, useState } from "react";
import {
  applyDrop,
  blockedIn,
  equivalentOption,
  type Armament,
  type Blocker,
  type Build,
  type DragSource,
  type DropResult,
  type DropTarget,
} from "@/domain/loadout";

/**
 * Drag and drop for the loadout creator: a choice dragged out of the menu onto
 * a pylon, from one pylon to another, off the aircraft, or onto every free
 * pylon at once. All of it is also reachable by clicking — dragging is a
 * shortcut for a pointer, which is why only the pointer sensor is on: the
 * keyboard sensor would claim the Space and Enter that already pick a choice.
 * Its accessibility plugin is off for the same reason — it would announce each
 * button as "draggable", explain a keyboard drag that isn't there, and mark an
 * empty pylon's button aria-disabled although it can still be clicked.
 * Auto-scrolling is off too: the pylons sit right under the menu, so every
 * drag crosses the menu's foot, and it would run the menu — or, with the row
 * near the window's foot, the whole page — away from under the pointer.
 * What a drop may do is decided in the domain (`applyDrop`), the same rules the
 * menu greys choices out by.
 */

/** How a pylon reads while something is being dragged. */
export type PylonState =
  | { kind: "idle" }
  | { kind: "ok" }
  | { kind: "blocked"; blocker: Blocker | null }
  | { kind: "incompatible" };

type Dnd = { dragging: DragSource | null; build: Build; armament: Armament };

const DndContext = createContext<Dnd | null>(null);

function useDnd(): Dnd {
  const dnd = useContext(DndContext);
  if (!dnd) throw new Error("loadout-dnd components need a <LoadoutDnd> around them");
  return dnd;
}

/** The choice in hand, if a drag is under way. */
export function useDragging(): DragSource | null {
  return useDnd().dragging;
}

/** Where a pylon stands for the choice in hand. */
function pylonState(dnd: Dnd, slot: number): PylonState {
  const { dragging, build, armament } = dnd;
  if (!dragging) return { kind: "idle" };
  if (applyDrop(build, armament, dragging, { to: "pylon", slot })) return { kind: "ok" };
  if (dragging.from === "pylon" && dragging.slot === slot) return { kind: "idle" };
  const option = equivalentOption(armament, dragging.slot, dragging.option, slot);
  if (!option) return { kind: "incompatible" };
  const rest = new Map(build);
  if (dragging.from === "pylon") rest.delete(dragging.slot);
  return { kind: "blocked", blocker: blockedIn(armament, rest, slot).get(option.name) ?? null };
}

type TargetData = DropTarget;

export function LoadoutDnd({
  build,
  armament,
  onDrop,
  renderOverlay,
  children,
}: {
  build: Build;
  armament: Armament;
  onDrop: (result: DropResult, source: DragSource, target: DropTarget) => void;
  renderOverlay: (source: DragSource) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState<DragSource | null>(null);

  return (
    <DragDropProvider
      sensors={[PointerSensor]}
      plugins={(defaults) => defaults.filter((plugin) => plugin !== Accessibility && plugin !== AutoScroller)}
      onDragStart={({ operation }) => {
        setDragging((operation.source?.data as DragSource | undefined) ?? null);
      }}
      onDragEnd={(event) => {
        const source = event.operation.source?.data as DragSource | undefined;
        const target = event.operation.target?.data as TargetData | undefined;
        setDragging(null);
        if (event.canceled || !source || !target) return;
        const result = applyDrop(build, armament, source, target);
        if (result) onDrop(result, source, target);
      }}
    >
      <DndContext.Provider value={{ dragging, build, armament }}>{children}</DndContext.Provider>
      <DragOverlay dropAnimation={null}>
        {(source) => {
          const data = source.data as DragSource | undefined;
          return data ? (
            <motion.div
              initial={{ scale: 1, rotate: 0 }}
              animate={{ scale: 1.06, rotate: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="pointer-events-none w-max max-w-[min(24rem,85vw)] whitespace-nowrap rounded-lg border border-accent bg-surface-2 px-3 py-2 shadow-[0_12px_32px_-12px] shadow-accent/60"
            >
              {renderOverlay(data)}
            </motion.div>
          ) : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
}

/**
 * A menu entry that can be dragged onto a pylon; clicking it still picks it.
 * The ref goes on the entry's own button: dnd-kit won't start a drag from
 * inside a button that isn't the dragged element itself.
 */
export function DraggableChoice({
  slot,
  option,
  disabled,
  children,
}: {
  slot: number;
  option: string;
  disabled: boolean;
  children: (ref: (element: Element | null) => void) => React.ReactNode;
}) {
  const data: DragSource = { from: "menu", slot, option };
  const { ref } = useDraggable({ id: `menu:${slot}:${option}`, data, disabled });
  return children(ref);
}

/**
 * A pylon: somewhere to drop a choice, and — when it holds one — something to
 * drag off it. `children` gets the pylon's state for the choice in hand so the
 * slot can light up, dim, or explain why not, and the ref for its button.
 */
export function PylonTarget({
  slot,
  option,
  className,
  children,
}: {
  slot: number;
  option: string | undefined;
  className?: string;
  children: (state: PylonState, over: boolean, ref: (element: Element | null) => void) => React.ReactNode;
}) {
  const dnd = useDnd();
  const state = pylonState(dnd, slot);
  const target: TargetData = { to: "pylon", slot };
  // Off only where the choice in hand can't land; left on while idle, so it is
  // already registered the moment a drag begins (applyDrop has the last word).
  const drop = useDroppable({
    id: `pylon:${slot}`,
    data: target,
    disabled: state.kind === "blocked" || state.kind === "incompatible",
  });
  const source: DragSource | undefined = option ? { from: "pylon", slot, option } : undefined;
  const drag = useDraggable({ id: `pylon-drag:${slot}`, data: source, disabled: !source });

  return (
    <div className={className}>
      {children(state, drop.isDropTarget, (element) => {
        drop.ref(element);
        // Only a pylon holding something is a drag source; an empty one stays
        // unregistered rather than registered-and-disabled.
        drag.ref(source ? element : null);
      })}
    </div>
  );
}

/**
 * A strip that only exists mid-drag: "take it off" while a pylon's choice is
 * in hand, "every free pylon" while a menu choice is.
 */
export function DropZone({ kind, children }: { kind: "remove" | "all"; children: React.ReactNode }) {
  const { dragging, build, armament } = useDnd();
  const target: TargetData = { to: kind };
  const active =
    dragging !== null &&
    (kind === "remove" ? dragging.from === "pylon" : dragging.from === "menu") &&
    applyDrop(build, armament, dragging, target) !== null;
  const { ref, isDropTarget } = useDroppable({ id: `zone:${kind}`, data: target, disabled: !active });
  if (!active) return null;
  return (
    <div
      ref={ref}
      className={
        "rounded-lg border-2 border-dashed px-3 py-2.5 text-center text-sm transition-colors " +
        (kind === "remove"
          ? isDropTarget
            ? "border-danger bg-danger/10 text-danger"
            : "border-danger/50 text-danger/80"
          : isDropTarget
            ? "border-accent bg-accent-dim text-accent"
            : "border-accent/50 text-accent/80")
      }
    >
      {children}
    </div>
  );
}
