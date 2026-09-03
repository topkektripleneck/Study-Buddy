import {

  DndContext,

  DragOverlay,

  PointerSensor,

  closestCorners,

  useDroppable,

  useSensor,

  useSensors,

  type DragEndEvent,

  type DragStartEvent,

} from "@dnd-kit/core";

import {

  SortableContext,

  useSortable,

  verticalListSortingStrategy,

} from "@dnd-kit/sortable";

import { CSS } from "@dnd-kit/utilities";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useListen } from "@/hooks/useListen";

import { removeFromMatrix, setQuadrant, updateTask } from "@/lib/actions";

import { api } from "@/lib/api";

import { GlowBorder, Surface } from "@/ui/kit";

import {

  QUADRANT_META,

  type EisenhowerMatrixFile,

  type EisenhowerQuadrant,

  type EisenhowerQuadrantItem,

  type TaskItem,

} from "@/types";



const QUADRANTS: EisenhowerQuadrant[] = ["do_first", "schedule", "delegate", "eliminate"];

const ELIMINATE_UNDO_SECS = 5;



interface EliminatePending {

  itemId: string;

  taskId: string;

  title: string;

  fromQuadrant: EisenhowerQuadrant;

  secondsLeft: number;

}



function SortableCard({

  item,

  task,

  quadrant,

  onStage,

  onRemove,

  onDueChange,

  onDelegateChange,

  onEliminationReasonChange,

}: {

  item: EisenhowerQuadrantItem;

  task: TaskItem | undefined;

  quadrant: EisenhowerQuadrant;

  onStage: () => void;

  onRemove: () => void;

  onDueChange: (dueAt: string | null) => void;

  onDelegateChange: (delegateTo: string) => void;

  onEliminationReasonChange: (reason: string) => void;

}) {

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({

    id: item.id,

    data: { quadrant },

  });

  const style = {

    transform: CSS.Transform.toString(transform),

    transition,

    opacity: isDragging ? 0.5 : 1,

  };



  return (

    <li ref={setNodeRef} style={{ ...card, ...style }}>

      <div style={cardMain} {...attributes} {...listeners}>

        <span style={cardLabel}>{task?.title ?? "Unknown"}</span>

        {quadrant === "schedule" && (

          <button

            type="button"

            style={stageBtn}

            onClick={(e) => {

              e.stopPropagation();

              onStage();

            }}

            title="Send to calendar"

          >

            Cal

          </button>

        )}

        <button

          type="button"

          style={removeBtn}

          onClick={(e) => {

            e.stopPropagation();

            onRemove();

          }}

          aria-label="Remove from matrix"

        >

          ×

        </button>

      </div>

      {quadrant === "schedule" && (

        <label style={fieldRow} onPointerDown={(e) => e.stopPropagation()}>

          <span style={fieldLabel}>Due</span>

          <input

            type="date"

            className="sb-input"

            style={fieldInput}

            value={task?.dueAt ? task.dueAt.slice(0, 10) : ""}

            onChange={(e) =>

              onDueChange(e.target.value ? `${e.target.value}T12:00:00.000Z` : null)

            }

          />

        </label>

      )}

      {quadrant === "delegate" && (

        <label style={fieldRow} onPointerDown={(e) => e.stopPropagation()}>

          <span style={fieldLabel}>Delegate</span>

          <input

            type="text"

            className="sb-input"

            style={fieldInput}

            placeholder="Who?"

            defaultValue={item.delegateTo ?? ""}

            onBlur={(e) => onDelegateChange(e.target.value)}

          />

        </label>

      )}

      {quadrant === "eliminate" && (

        <label style={fieldRow} onPointerDown={(e) => e.stopPropagation()}>

          <span style={fieldLabel}>Why drop</span>

          <input

            type="text"

            className="sb-input"

            style={fieldInput}

            placeholder="Not worth it because…"

            defaultValue={item.eliminationReason ?? ""}

            onBlur={(e) => onEliminationReasonChange(e.target.value)}

          />

        </label>

      )}

    </li>

  );

}



function QuadrantColumn({

  quadrant,

  ids,

  matrix,

  taskById,

  onRefresh,

  setError,

}: {

  quadrant: EisenhowerQuadrant;

  ids: string[];

  matrix: EisenhowerMatrixFile;

  taskById: Map<string, TaskItem>;

  onRefresh: () => void;

  setError: (msg: string | null) => void;

}) {

  const { setNodeRef } = useDroppable({ id: quadrant });

  const meta = QUADRANT_META[quadrant];



  async function run(action: () => Promise<{ ok: boolean; message: string }>) {

    const result = await action();

    if (!result.ok) setError(result.message);

    await onRefresh();

  }



  return (

    <div ref={setNodeRef}>

      <GlowBorder tone={quadrant === "do_first" ? "accent" : "warm"}>

        <Surface padding="md" variant="overlay" style={quadrantCard}>

          <div style={header}>

            <strong>{meta.title}</strong>

            <span style={count}>{ids.length}</span>

          </div>

          <p style={subtitle}>{meta.subtitle}</p>

          <SortableContext items={ids} strategy={verticalListSortingStrategy}>

            <ul style={list}>

              {ids.map((id) => {

                const item = matrix.items.find((i) => i.id === id);

                const task = item ? taskById.get(item.taskId) : undefined;

                if (!item) return null;

                return (

                  <SortableCard

                    key={id}

                    item={item}

                    task={task}

                    quadrant={quadrant}

                    onStage={() =>

                      api

                        .matrixStageForCalendar(id)

                        .then(onRefresh)

                        .catch((e) => setError(String(e)))

                    }

                    onRemove={() => run(() => removeFromMatrix(item.id))}

                    onDueChange={(dueAt) => {

                      if (!task) return Promise.resolve();

                      return run(() => updateTask({ ...task, dueAt }));

                    }}

                    onDelegateChange={(delegateTo) => {

                      api

                        .matrixUpdateItem(item.id, { delegateTo })

                        .then(onRefresh)

                        .catch((e) => setError(String(e)));

                    }}

                    onEliminationReasonChange={(eliminationReason) => {

                      api

                        .matrixUpdateItem(item.id, { eliminationReason })

                        .then(onRefresh)

                        .catch((e) => setError(String(e)));

                    }}

                  />

                );

              })}

              {ids.length === 0 && <li style={empty}>Drop tasks here</li>}

            </ul>

          </SortableContext>

        </Surface>

      </GlowBorder>

    </div>

  );

}



export function MatrixView() {

  const [matrix, setMatrix] = useState<EisenhowerMatrixFile | null>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);

  const [eliminatePending, setEliminatePending] = useState<EliminatePending | null>(null);

  const finalizeRef = useRef<(pending: EliminatePending) => Promise<void>>(async () => {});



  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));



  const refresh = useCallback(async () => {

    try {

      const [m, t] = await Promise.all([api.matrixGet(), api.tasksList()]);

      setMatrix(m);

      setTasks(t);

      setError(null);

    } catch (e) {

      setError(e instanceof Error ? e.message : "Could not load the matrix");

    } finally {

      setLoading(false);

    }

  }, []);



  useEffect(() => {

    refresh();

  }, [refresh]);



  useListen(refresh, "matrix:changed", "tasks:changed");



  finalizeRef.current = async (pending: EliminatePending) => {

    const task = tasks.find((t) => t.id === pending.taskId);

    if (!task) return;

    try {

      await api.taskUpdate({ ...task, status: "archived" });

      await api.matrixRemoveItem(pending.itemId);

      await refresh();

    } catch (e) {

      setError(e instanceof Error ? e.message : "Could not archive task");

    }

  };



  useEffect(() => {

    if (!eliminatePending) return;

    if (eliminatePending.secondsLeft <= 0) {

      const pending = eliminatePending;

      setEliminatePending(null);

      void finalizeRef.current(pending);

      return;

    }

    const id = window.setTimeout(

      () => setEliminatePending((p) => (p ? { ...p, secondsLeft: p.secondsLeft - 1 } : null)),

      1000,

    );

    return () => window.clearTimeout(id);

  }, [eliminatePending]);



  async function undoEliminate() {

    if (!eliminatePending) return;

    const { itemId, fromQuadrant } = eliminatePending;

    setEliminatePending(null);

    try {

      await api.matrixMoveItem(itemId, fromQuadrant, 0);

      await refresh();

    } catch (e) {

      setError(e instanceof Error ? e.message : "Undo failed");

    }

  }



  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const unplaced = useMemo(() => {

    const placed = new Set(matrix?.items.map((i) => i.taskId) ?? []);

    return tasks.filter((t) => !placed.has(t.id) && t.status !== "done" && t.status !== "archived");

  }, [matrix, tasks]);



  const order = matrix?.quadrantOrder ?? {

    do_first: [],

    schedule: [],

    delegate: [],

    eliminate: [],

  };



  function findQuadrant(itemId: string): EisenhowerQuadrant | null {

    for (const q of QUADRANTS) {

      if ((order[q] ?? []).includes(itemId)) return q;

    }

    return null;

  }



  async function onDragEnd(event: DragEndEvent) {

    setActiveId(null);

    const { active, over } = event;

    if (!over || !matrix) return;



    const itemId = String(active.id);

    const from = findQuadrant(itemId);

    if (!from) return;



    let toQuadrant: EisenhowerQuadrant = from;

    let toIndex = 0;



    const overId = String(over.id);

    if (QUADRANTS.includes(overId as EisenhowerQuadrant)) {

      toQuadrant = overId as EisenhowerQuadrant;

      toIndex = order[toQuadrant]?.length ?? 0;

    } else {

      const overQ = findQuadrant(overId);

      if (overQ) {

        toQuadrant = overQ;

        toIndex = (order[toQuadrant] ?? []).indexOf(overId);

        if (toIndex < 0) toIndex = order[toQuadrant]?.length ?? 0;

      }

    }



    if (from === toQuadrant && (order[from] ?? []).indexOf(itemId) === toIndex) return;

    const item = matrix.items.find((i) => i.id === itemId);
    const task = item ? taskById.get(item.taskId) : undefined;

    try {
      await api.matrixMoveItem(itemId, toQuadrant, toIndex);
      await refresh();

      if (toQuadrant === "eliminate" && from !== "eliminate" && item && task) {
        setEliminatePending({
          itemId,
          taskId: task.id,
          title: task.title,
          fromQuadrant: from,
          secondsLeft: ELIMINATE_UNDO_SECS,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }



  if (!matrix) {

    return (

      <p className={error ? "sb-error-banner" : undefined} style={error ? undefined : hint}>

        {error ?? (loading ? "Loading matrix…" : "Could not load matrix")}

      </p>

    );

  }



  const activeItem = activeId ? matrix.items.find((i) => i.id === activeId) : undefined;

  const activeTitle = activeItem ? taskById.get(activeItem.taskId)?.title : undefined;



  return (

    <div>

      <div style={headerRow}>

        <h2 style={title}>Eisenhower Matrix</h2>

        <span style={hint}>{unplaced.length} unplaced</span>

      </div>

      {error && <p className="sb-error-banner">{error}</p>}



      {eliminatePending && (

        <p className="sb-warn-banner" style={undoBanner}>

          Archiving &ldquo;{eliminatePending.title}&rdquo; in {eliminatePending.secondsLeft}s —{" "}

          <button type="button" style={undoBtn} onClick={undoEliminate}>

            Undo

          </button>

        </p>

      )}



      {unplaced.length > 0 && (

        <select

          style={addSelect}

          defaultValue=""

          onChange={(e) => {

            const taskId = e.target.value;

            if (!taskId) return;

            e.target.value = "";

            setQuadrant(taskId, "do_first").then(refresh);

          }}

        >

          <option value="">+ Place unplaced task…</option>

          {unplaced.map((t) => (

            <option key={t.id} value={t.id}>

              {t.title}

            </option>

          ))}

        </select>

      )}



      <DndContext

        sensors={sensors}

        collisionDetection={closestCorners}

        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}

        onDragEnd={onDragEnd}

      >

        <div style={grid}>

          {QUADRANTS.map((quadrant) => (

            <div key={quadrant} id={quadrant} data-quadrant={quadrant}>

              <QuadrantColumn

                quadrant={quadrant}

                ids={order[quadrant] ?? []}

                matrix={matrix}

                taskById={taskById}

                onRefresh={refresh}

                setError={setError}

              />

            </div>

          ))}

        </div>

        <DragOverlay>

          {activeTitle ? <div style={{ ...card, boxShadow: "none" }}>{activeTitle}</div> : null}

        </DragOverlay>

      </DndContext>

    </div>

  );

}



const headerRow = {

  display: "flex",

  justifyContent: "space-between",

  alignItems: "baseline",

  marginBottom: "16px",

};

const title = { margin: 0, fontSize: "22px" };

const hint = { fontSize: "12px", color: "var(--sb-text-muted)" };

const undoBanner = { marginBottom: "12px" };

const undoBtn = {

  border: "none",

  background: "transparent",

  color: "inherit",

  cursor: "pointer",

  font: "inherit",

  textDecoration: "underline",

  padding: 0,

};

const grid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sb-space-md)" };

const quadrantCard = { minHeight: "200px" };

const header = { display: "flex", justifyContent: "space-between", alignItems: "center" };

const count = { fontFamily: "var(--sb-font-mono)", color: "var(--sb-accent)" };

const subtitle = { margin: "4px 0 12px", fontSize: "12px", color: "var(--sb-text-muted)" };

const list = { margin: 0, padding: 0, listStyle: "none", minHeight: "48px" };

const card = {

  display: "flex",

  flexDirection: "column" as const,

  gap: "6px",

  padding: "8px 10px",

  marginBottom: "6px",

  borderRadius: "var(--sb-radius-sm)",

  background: "var(--sb-bg-base)",

  border: "1px solid var(--sb-border-subtle)",

};

const cardMain = {

  display: "flex",

  alignItems: "center",

  gap: "6px",

  cursor: "grab",

};

const cardLabel = { flex: 1, fontSize: "13px" };

const fieldRow = {

  display: "flex",

  alignItems: "center",

  gap: "6px",

  fontSize: "11px",

};

const fieldLabel = {

  width: "52px",

  flexShrink: 0,

  color: "var(--sb-text-muted)",

  textTransform: "uppercase" as const,

  letterSpacing: "0.04em",

  fontSize: "9px",

};

const fieldInput = { flex: 1, padding: "3px 6px", fontSize: "11px", minWidth: 0 };

const stageBtn = {

  fontSize: "10px",

  padding: "2px 6px",

  borderRadius: "var(--sb-radius-sm)",

  border: "1px solid var(--sb-border-subtle)",

  background: "transparent",

  cursor: "pointer",

};

const removeBtn = {

  border: "none",

  background: "transparent",

  color: "var(--sb-text-muted)",

  cursor: "pointer",

  fontSize: "16px",

};

const empty = { color: "var(--sb-text-muted)", fontStyle: "italic", padding: "8px 0" };

const addSelect = {

  marginBottom: "12px",

  width: "100%",

  fontSize: "12px",

  padding: "6px",

  borderRadius: "var(--sb-radius-sm)",

};


