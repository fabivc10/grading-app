import { useMemo, useState } from "react";
import type { EvalEntry, TemaItem } from "../../types";
import type { TeacherGradingDashboardProps } from "./types";
import { DEFAULT_DASHBOARD_CATEGORIES, cx, getCategoryEarned, getCategoryProgress, getEntryEarned, getEntryMax, getItemEarned, getToneByCategory } from "./utils";
import { ProgressBar } from "./ProgressBar";
import { EditableField } from "./EditableField";
import { Accordion } from "./Accordion";

function ObservationButton({
    value,
    onChange,
}: {
    value: string;
    onChange?: (note: string) => void;
}) {
    const [open, setOpen] = useState(false);

    if (open) {
        return (
            <input
                autoFocus
                value={value}
                placeholder="Observacion breve"
                onBlur={() => setOpen(false)}
                onChange={(e) => onChange?.(e.target.value)}
                className="h-8 w-full rounded-lg bg-zinc-950 px-2 text-xs text-zinc-300 outline-none ring-1 ring-zinc-800 transition focus:ring-zinc-600"
            />
        );
    }

    return (
        <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={value ? "Editar observacion" : "Agregar observacion"}
            className={cx(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                value ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            )}>
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M6.5 7.5h7M6.5 10h5M5.5 15.5l-1 2 2-.95 7.9-7.9a1.4 1.4 0 0 0 0-1.98l-.52-.52a1.4 1.4 0 0 0-1.98 0l-8.4 8.35Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}

function ItemStatusDot({ item }: { item: TemaItem }) {
    const earned = getItemEarned(item);
    const tone = earned >= item.valor ? "bg-emerald-400" : earned > 0 ? "bg-amber-400" : "bg-zinc-700";
    return <span className={cx("h-2.5 w-2.5 rounded-full", tone)} />;
}

function IndicatorRow({
    categoryKey,
    entry,
    item,
    onItemScoreChange,
    onItemNoteChange,
}: {
    categoryKey: TeacherGradingDashboardProps["categories"] extends never ? never : "cotidiano" | "tareas" | "prueba" | "proyecto";
    entry: EvalEntry;
    item: TemaItem;
    onItemScoreChange: TeacherGradingDashboardProps["onItemScoreChange"];
    onItemNoteChange: TeacherGradingDashboardProps["onItemNoteChange"];
}) {
    return (
        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_96px_40px] items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-zinc-900/70">
            <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-100">{item.nombre}</div>
                <div className="mt-1 text-xs text-zinc-500">{item.tema}</div>
            </div>

            <div className="truncate text-xs text-zinc-500">{entry.nombre}</div>

            <div className="flex justify-end">
                <EditableField
                    value={getItemEarned(item)}
                    max={item.valor}
                    onCommit={(score) => onItemScoreChange?.({
                        category: categoryKey,
                        entryId: entry.id,
                        itemId: item.id,
                        score,
                    })}
                />
            </div>

            <div className="flex items-center justify-end gap-2">
                <ObservationButton
                    value={item.notaDescripcion}
                    onChange={(note) => onItemNoteChange?.({
                        category: categoryKey,
                        entryId: entry.id,
                        itemId: item.id,
                        note,
                    })}
                />
                <ItemStatusDot item={item} />
            </div>
        </div>
    );
}

function EntrySection({
    categoryKey,
    entry,
    defaultOpen,
    onItemScoreChange,
    onItemNoteChange,
}: {
    categoryKey: "cotidiano" | "tareas" | "prueba" | "proyecto";
    entry: EvalEntry;
    defaultOpen: boolean;
    onItemScoreChange: TeacherGradingDashboardProps["onItemScoreChange"];
    onItemNoteChange: TeacherGradingDashboardProps["onItemNoteChange"];
}) {
    const earned = getEntryEarned(entry);
    const max = getEntryMax(entry) || entry.pct;
    const progress = max > 0 ? Math.round((earned / max) * 100) : 0;

    const groups = useMemo(() => {
        const map = new Map<string, TemaItem[]>();
        entry.items.forEach((item) => {
            const key = item.tema || "General";
            const current = map.get(key) ?? [];
            current.push(item);
            map.set(key, current);
        });
        return [...map.entries()];
    }, [entry.items]);

    return (
        <Accordion
            defaultOpen={defaultOpen}
            className="ring-1 ring-white/5"
            bodyClassName="border-t border-zinc-900 pt-2"
            header={
                <div className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-4">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-100">{entry.nombre}</div>
                        <div className="mt-2">
                            <ProgressBar value={progress} tone={progress === 0 ? "gray" : progress >= 100 ? "green" : "yellow"} />
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-semibold text-zinc-100">
                            {Math.round(earned * 10) / 10} / {max}
                        </div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{entry.semestre}</div>
                    </div>
                </div>
            }>
            <div className="mb-2 grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.85fr)_96px_40px] gap-3 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                <span>Indicador</span>
                <span>Evaluacion</span>
                <span className="text-right">Nota</span>
                <span />
            </div>

            <div className="space-y-3">
                {groups.map(([groupName, items]) => (
                    <div key={groupName} className="px-1">
                        <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            {groupName}
                        </div>
                        <div className="space-y-1">
                            {items.map((item) => (
                                <IndicatorRow
                                    key={item.id}
                                    categoryKey={categoryKey}
                                    entry={entry}
                                    item={item}
                                    onItemScoreChange={onItemScoreChange}
                                    onItemNoteChange={onItemNoteChange}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Accordion>
    );
}

function CategoryRow({
    label,
    categoryKey,
    maxPoints,
    entries,
    onItemScoreChange,
    onItemNoteChange,
}: {
    label: string;
    categoryKey: "cotidiano" | "tareas" | "prueba" | "proyecto";
    maxPoints: number;
    entries: EvalEntry[];
    onItemScoreChange: TeacherGradingDashboardProps["onItemScoreChange"];
    onItemNoteChange: TeacherGradingDashboardProps["onItemNoteChange"];
}) {
    const [open, setOpen] = useState(false);
    const earned = getCategoryEarned(entries);
    const progress = getCategoryProgress(entries, maxPoints);
    const tone = progress === 0 ? "gray" : progress >= 100 ? "green" : getToneByCategory(categoryKey);

    return (
        <section className="rounded-[26px] bg-zinc-950/90 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_80px_rgba(0,0,0,0.35)]">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="grid w-full grid-cols-[18px_minmax(0,1fr)_112px] items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-900/55">
                <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                    className={cx("h-4 w-4 text-zinc-500 transition-transform duration-200", open && "rotate-90 text-zinc-200")}>
                    <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <div className="min-w-0">
                    <div className="flex items-center gap-3">
                        <h3 className="truncate text-sm font-semibold text-zinc-50">{label}</h3>
                        <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                            {entries.length}
                        </span>
                    </div>
                    <div className="mt-2">
                        <ProgressBar value={progress} tone={tone} />
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-base font-semibold text-zinc-100">
                        {Math.round(earned * 10) / 10} / {maxPoints}
                    </div>
                </div>
            </button>

            {open && (
                <div className="border-t border-zinc-900 px-3 pb-3 pt-3">
                    {entries.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-zinc-500">Aun sin items</div>
                    ) : (
                        <div className="space-y-3">
                            {entries.map((entry, index) => (
                                <EntrySection
                                    key={entry.id}
                                    categoryKey={categoryKey}
                                    entry={entry}
                                    defaultOpen={index === 0}
                                    onItemScoreChange={onItemScoreChange}
                                    onItemNoteChange={onItemNoteChange}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}

export function TeacherGradingDashboard({
    student,
    categories = DEFAULT_DASHBOARD_CATEGORIES,
    onItemScoreChange,
    onItemNoteChange,
}: TeacherGradingDashboardProps) {
    const totalAvailable = categories.reduce((sum, category) => sum + category.maxPoints, 0);
    const totalEarned = categories.reduce((sum, category) => sum + getCategoryEarned(student[category.key] ?? []), 0);
    const totalProgress = totalAvailable > 0 ? Math.round((totalEarned / totalAvailable) * 100) : 0;

    return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
                <header className="rounded-[30px] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_26%),#101012] px-6 py-6 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_36px_90px_rgba(0,0,0,0.45)]">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                                Grading Dashboard
                            </p>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{student.nombre}</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                                Disenado para calificar rapido: primero ves categorias, luego expandes solo donde hace falta y editas notas en una sola accion.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl bg-zinc-950/75 px-4 py-3 ring-1 ring-white/5">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Total</div>
                                <div className="mt-1 text-lg font-semibold text-zinc-100">
                                    {Math.round(totalEarned * 10) / 10} / {totalAvailable}
                                </div>
                            </div>
                            <div className="rounded-2xl bg-zinc-950/75 px-4 py-3 ring-1 ring-white/5">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Progreso</div>
                                <div className="mt-1 text-lg font-semibold text-zinc-100">{totalProgress}%</div>
                            </div>
                            <div className="rounded-2xl bg-zinc-950/75 px-4 py-3 ring-1 ring-white/5">
                                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Categorias</div>
                                <div className="mt-1 text-lg font-semibold text-zinc-100">{categories.length}</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5">
                        <ProgressBar value={totalProgress} tone={totalProgress === 0 ? "gray" : totalProgress >= 100 ? "green" : "yellow"} />
                    </div>
                </header>

                <div className="space-y-4">
                    {categories.map((category) => (
                        <CategoryRow
                            key={category.key}
                            label={category.label}
                            categoryKey={category.key}
                            maxPoints={category.maxPoints}
                            entries={student[category.key] ?? []}
                            onItemScoreChange={onItemScoreChange}
                            onItemNoteChange={onItemNoteChange}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

export default TeacherGradingDashboard;
