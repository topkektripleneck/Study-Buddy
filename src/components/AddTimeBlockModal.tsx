import { useState } from "react";

import type { BlockKind, TimeBlockDraft } from "@/types";

import { BLOCK_KINDS, formatHourLabel } from "@/lib/schedule";

import { ModalBackdrop, PressableEnergy } from "@/ui/kit";

interface AddTimeBlockModalProps {

  initialHour: number;

  initialMinute?: number;

  onSave: (draft: TimeBlockDraft) => void;

  onClose: () => void;

}



const MINUTES = [0, 15, 30, 45];



export function AddTimeBlockModal({

  initialHour,

  initialMinute = 0,

  onSave,

  onClose,

}: AddTimeBlockModalProps) {

  const [title, setTitle] = useState("");

  const [hour, setHour] = useState(initialHour);

  const [minute, setMinute] = useState(initialMinute);

  const [durationMinutes, setDurationMinutes] = useState(60);

  const [kind, setKind] = useState<BlockKind>("focus");



  function submit(e: React.FormEvent) {

    e.preventDefault();

    if (!title.trim()) return;

    onSave({ title, hour, minute, durationMinutes, kind });

  }



  return (

    <ModalBackdrop onClose={onClose} panelStyle={panel}>

      <h2 style={heading}>Add time block</h2>

      <p style={hint}>Click a time slot on the timeline or use this form.</p>

      <form onSubmit={submit} style={form}>

        <label style={label}>

          Title

          <input

            className="sb-input"

            value={title}

            onChange={(e) => setTitle(e.target.value)}

            placeholder="Deep work, Essay, Break..."

            autoFocus

            required

          />

        </label>



        <div style={row}>

          <label style={label}>

            Start hour

            <select className="sb-input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>

              {Array.from({ length: 13 }, (_, i) => i + 8).map((h) => (

                <option key={h} value={h}>

                  {formatHourLabel(h)}

                </option>

              ))}

            </select>

          </label>

          <label style={label}>

            Minute

            <select className="sb-input" value={minute} onChange={(e) => setMinute(Number(e.target.value))}>

              {MINUTES.map((m) => (

                <option key={m} value={m}>

                  :{m.toString().padStart(2, "0")}

                </option>

              ))}

            </select>

          </label>

          <label style={label}>

            Duration (min)

            <input

              className="sb-input"

              type="number"

              min={15}

              step={15}

              value={durationMinutes}

              onChange={(e) => setDurationMinutes(Number(e.target.value))}

            />

          </label>

        </div>



        <label style={label}>

          Type

          <select

            className="sb-input"

            value={kind}

            onChange={(e) => {
              const meta = BLOCK_KINDS.find((k) => k.value === e.target.value);
              if (meta) setKind(meta.value);
            }}

          >

            {BLOCK_KINDS.map((k) => (

              <option key={k.value} value={k.value}>

                {k.label}

              </option>

            ))}

          </select>

        </label>



        <div style={actions}>

          <PressableEnergy type="submit">Save block</PressableEnergy>

          <PressableEnergy type="button" variant="ghost" onClick={onClose}>

            Cancel

          </PressableEnergy>

        </div>

      </form>

    </ModalBackdrop>

  );

}



const panel = { width: "min(420px, 92vw)" };

const heading = { margin: "0 0 4px", fontSize: "18px" };

const hint = { margin: "0 0 16px", color: "var(--sb-text-secondary)", fontSize: "13px" };

const form = { display: "flex", flexDirection: "column" as const, gap: "12px" };

const label = { display: "flex", flexDirection: "column" as const, gap: "6px", fontSize: "13px" };

const row = { display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr", gap: "10px" };

const actions = { display: "flex", gap: "8px", marginTop: "8px" };


