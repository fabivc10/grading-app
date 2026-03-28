export type ScheduleEntry = {
    id: string;
    asignaturaId: string;
    day: number;
    slot: number;
    leccionNum: number;
};

export type Break = {
    id: string;
    nombre: string;
    startSlot: number;
    durationSlots: number;
    days: number[];
};

export type DragPayload =
    | { kind: "panel"; asignaturaId: string; label: string; subLabel: string }
    | { kind: "entry"; entryId: string; label: string; subLabel: string };

export type DragState = {
    payload: DragPayload;
    grabOffset: number;
    x: number;
    y: number;
};
