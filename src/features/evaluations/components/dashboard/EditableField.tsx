import { useState } from "react";
import { clamp } from "./utils";

export function EditableField({
    value,
    max,
    step = 1,
    align = "right",
    onCommit,
}: {
    value: number;
    max: number;
    step?: number;
    align?: "left" | "right";
    onCommit: (next: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(String(value));

    const commit = () => {
        const next = clamp(Number(draft) || 0, 0, max);
        setDraft(String(next));
        setEditing(false);
        if (next !== value) onCommit(next);
    };

    if (editing) {
        return (
            <input
                autoFocus
                type="number"
                min={0}
                max={max}
                step={step}
                value={draft}
                onBlur={commit}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") {
                        setDraft(String(value));
                        setEditing(false);
                    }
                }}
                className={`h-8 w-20 rounded-lg bg-zinc-950 px-2 text-sm font-medium text-zinc-100 outline-none ring-1 ring-zinc-700 transition focus:ring-emerald-400 ${align === "right" ? "text-right" : "text-left"}`}
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => {
                setDraft(String(value));
                setEditing(true);
            }}
            className={`inline-flex h-8 min-w-20 items-center rounded-lg px-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800/80 ${align === "right" ? "justify-end text-right" : "justify-start text-left"}`}>
            {value} / {max}
        </button>
    );
}

export default EditableField;
