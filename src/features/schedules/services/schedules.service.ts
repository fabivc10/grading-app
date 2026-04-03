import { getDb } from "../../../shared/lib/db";
import { genId } from "../../../shared/lib/genId";
import type { ScheduleEntry, Break } from "../types";

type EntryRow = {
    id: string;
    institution_id: number;
    subject_id: string;
    day: number;
    slot: number;
    lesson_number: number;
};

type BreakRow = {
    id: string;
    institution_id: number;
    name: string;
    start_slot: number;
    duration_slots: number;
    days: string;
};

export async function fetchEntries(institutionId: number): Promise<ScheduleEntry[]> {
    const db = await getDb();
    const rows = await db.select<EntryRow[]>(
        "SELECT id, institution_id, subject_id, day, slot, lesson_number FROM schedule_entries WHERE institution_id = ?",
        [institutionId]
    );
    return rows.map((r) => ({
        id: r.id,
        asignaturaId: r.subject_id,
        day: r.day,
        slot: r.slot,
        leccionNum: r.lesson_number,
    }));
}

export async function insertEntry(
    institutionId: number,
    entry: Omit<ScheduleEntry, "id">
): Promise<ScheduleEntry> {
    const db = await getDb();
    const id = genId();
    await db.execute(
        "INSERT INTO schedule_entries (id, institution_id, subject_id, day, slot, lesson_number) VALUES (?,?,?,?,?,?)",
        [id, institutionId, entry.asignaturaId, entry.day, entry.slot, entry.leccionNum]
    );
    return { id, ...entry };
}

export async function moveEntry(id: string, day: number, slot: number): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE schedule_entries SET day=?, slot=? WHERE id=?", [day, slot, id]);
}

export async function deleteEntry(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM schedule_entries WHERE id=?", [id]);
}

export async function deleteEntriesInBreak(
    institutionId: number,
    startSlot: number,
    durationSlots: number,
    days: number[]
): Promise<void> {
    const db = await getDb();
    const placeholders = days.map(() => "?").join(",");
    await db.execute(
        `DELETE FROM schedule_entries
         WHERE institution_id=? AND day IN (${placeholders})
           AND slot >= ? AND slot < ?`,
        [institutionId, ...days, startSlot, startSlot + durationSlots]
    );
}

export async function fetchBreaks(institutionId: number): Promise<Break[]> {
    const db = await getDb();
    const rows = await db.select<BreakRow[]>(
        "SELECT id, institution_id, name, start_slot, duration_slots, days FROM schedule_breaks WHERE institution_id = ?",
        [institutionId]
    );
    return rows.map((r) => ({
        id: r.id,
        nombre: r.name,
        startSlot: r.start_slot,
        durationSlots: r.duration_slots,
        days: JSON.parse(r.days) as number[],
    }));
}

export async function insertBreak(
    institutionId: number,
    b: Omit<Break, "id">
): Promise<Break> {
    const db = await getDb();
    const id = genId();
    await db.execute(
        "INSERT INTO schedule_breaks (id, institution_id, name, start_slot, duration_slots, days) VALUES (?,?,?,?,?,?)",
        [id, institutionId, b.nombre, b.startSlot, b.durationSlots, JSON.stringify(b.days)]
    );
    return { id, ...b };
}

export async function deleteBreak(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM schedule_breaks WHERE id=?", [id]);
}
