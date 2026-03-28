import type { EstadoAsist } from "../types";

export type AttendanceMark = EstadoAsist | boolean | null;
export const DEFAULT_INJUSTIFIED_EQUIVALENCE = 1;
export const DEFAULT_TARDIES_PER_FAULT = 3;

function normalizeFactor(value: number) {
    return Math.max(1, Number.isFinite(value) ? value : DEFAULT_INJUSTIFIED_EQUIVALENCE);
}

export function getAttendanceCredit(mark: AttendanceMark, _unjustifiedEquivalence: number, tardiesPerFault: number): number {
    const tardyFactor = normalizeFactor(tardiesPerFault);

    if (mark === null) return 0;
    if (mark === true) return 1;
    if (mark === false) return 0;
    if (mark === "P" || mark === "J") return 1;
    if (mark === "T") return Math.max(0, 1 - 1 / tardyFactor);
    if (mark === "I") return 0;
    return 0;
}

export function getAttendanceStats(
    marks: AttendanceMark[],
    _unjustifiedEquivalence: number,
    tardiesPerFault: number,
) {
    let total = 0;
    let present = 0;
    let tardy = 0;
    let justified = 0;
    let unjustified = 0;

    marks.forEach((mark) => {
        if (mark === null) return;
        total += 1;

        if (mark === true || mark === "P") present += 1;
        else if (mark === "T") tardy += 1;
        else if (mark === "J") justified += 1;
        else if (mark === false || mark === "I") unjustified += 1;
    });

    const tardyFactor = normalizeFactor(tardiesPerFault);

    // Unjustified absences always reduce attendance immediately.
    // Tardies only reduce attendance when the configured equivalence is reached.
    const effectiveAbsences =
        unjustified +
        Math.floor(tardy / tardyFactor);
    const credit = Math.max(0, total - effectiveAbsences);
    const pct = total > 0 ? Math.round((credit / total) * 100) : 100;

    return { total, present, tardy, justified, unjustified, credit, effectiveAbsences, pct };
}
