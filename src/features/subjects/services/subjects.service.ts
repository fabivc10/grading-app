import { genId } from "../../../shared/lib/genId";
import * as repo from "../repositories/subjects.repository";
import type { Asignatura, AsignaturaDTO, AsignaturaFormData, Semestre, SemestreDTO } from "../types";

function toModel(dto: AsignaturaDTO, semDtos: SemestreDTO[]): Asignatura {
    const sems = semDtos.filter((item) => item.asignatura_id === dto.id);
    return {
        id: dto.id,
        year: dto.year,
        nombre: dto.nombre,
        grupo: parseInt(dto.grupo, 10) || 1,
        seccion: parseInt(dto.seccion ?? "0", 10) || 1,
        lecciones: dto.lecciones,
        created_at: dto.created_at || new Date(0).toISOString(),
        semestres: [
            sems[0] ? { id: sems[0].id, nombre: sems[0].nombre } : { id: genId(), nombre: "Semestre I" },
            sems[1] ? { id: sems[1].id, nombre: sems[1].nombre } : { id: genId(), nombre: "Semestre II" },
        ] as [Semestre, Semestre],
    };
}

export async function fetchAsignaturas(institutionId: number): Promise<Asignatura[]> {
    const rows = await repo.findByInstitution(institutionId);
    const semRows = await repo.findSemestresByAsignaturas(rows.map((row) => row.id));
    return rows.map((row) => toModel(row, semRows));
}

export async function insertAsignatura(
    institutionId: number,
    data: AsignaturaFormData
): Promise<Asignatura> {
    const id = genId();
    const createdAt = new Date().toISOString();
    const semestres: [Semestre, Semestre] = [
        { id: genId(), nombre: "Semestre I" },
        { id: genId(), nombre: "Semestre II" },
    ];

    await repo.insert(id, institutionId, data.year, data.nombre, String(data.grupo), String(data.seccion), data.lecciones, createdAt);
    for (const semestre of semestres) {
        await repo.insertSemestre(semestre.id, id, semestre.nombre);
    }

    return { id, ...data, created_at: createdAt, semestres };
}

export async function updateAsignatura(
    id: string,
    data: AsignaturaFormData,
    semestres: [Semestre, Semestre]
): Promise<void> {
    await repo.update(id, data.year, data.nombre, String(data.grupo), String(data.seccion), data.lecciones);
    for (const semestre of semestres) {
        await repo.updateSemestre(semestre.id, semestre.nombre);
    }
}

export async function deleteAsignatura(id: string): Promise<void> {
    await repo.remove(id);
}

export async function decrementLeccion(id: string): Promise<void> {
    await repo.decrementLecciones(id);
}
