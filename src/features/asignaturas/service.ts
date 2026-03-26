import { genId } from "../../shared/lib/genId";
import * as repo from "./repository";
import type { Asignatura, AsignaturaFormData, Semestre, AsignaturaDTO, SemestreDTO } from "./types";

// ─── Mapping ──────────────────────────────────────────────────────────────────
function toModel(dto: AsignaturaDTO, semDtos: SemestreDTO[]): Asignatura {
    const sems = semDtos.filter((s) => s.asignatura_id === dto.id);
    return {
        id:         dto.id,
        año:        dto.año,
        nombre:     dto.nombre,
        grupo:      parseInt(dto.grupo, 10) || 1,
        seccion:    parseInt(dto.seccion ?? '0', 10) || 1,
        lecciones:  dto.lecciones,
        created_at: dto.created_at || new Date(0).toISOString(),
        semestres: [
            sems[0] ? { id: sems[0].id, nombre: sems[0].nombre } : { id: genId(), nombre: "Semestre I" },
            sems[1] ? { id: sems[1].id, nombre: sems[1].nombre } : { id: genId(), nombre: "Semestre II" },
        ] as [Semestre, Semestre],
    };
}

// ─── Queries ──────────────────────────────────────────────────────────────────
export async function fetchAsignaturas(institutionId: number): Promise<Asignatura[]> {
    const rows    = await repo.findByInstitution(institutionId);
    const semRows = await repo.findSemestresByAsignaturas(rows.map((r) => r.id));
    return rows.map((r) => toModel(r, semRows));
}

// ─── Commands ─────────────────────────────────────────────────────────────────
export async function insertAsignatura(
    institutionId: number,
    data: AsignaturaFormData
): Promise<Asignatura> {
    const id        = genId();
    const createdAt = new Date().toISOString();
    const sems: [Semestre, Semestre] = [
        { id: genId(), nombre: "Semestre I" },
        { id: genId(), nombre: "Semestre II" },
    ];

    await repo.insert(id, institutionId, data.año, data.nombre, data.grupo, data.seccion, data.lecciones, createdAt);
    for (const s of sems) await repo.insertSemestre(s.id, id, s.nombre);

    return { id, ...data, created_at: createdAt, semestres: sems };
}

export async function updateAsignatura(
    id: string,
    data: AsignaturaFormData,
    semestres: [Semestre, Semestre]
): Promise<void> {
    await repo.update(id, data.año, data.nombre, data.grupo, data.seccion, data.lecciones);
    for (const s of semestres) await repo.updateSemestre(s.id, s.nombre);
}

export async function deleteAsignatura(id: string): Promise<void> {
    await repo.remove(id);
}

export async function decrementLeccion(id: string): Promise<void> {
    await repo.decrementLecciones(id);
}
