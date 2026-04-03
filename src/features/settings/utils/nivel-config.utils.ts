import { DEFAULT_NIVEL_CONFIG } from "../constants";
import type { NivelConfig } from "../../evaluations/types";

type AsignaturaLike = {
    id: string;
    year: number;
    grupo: number;
};

export function getNivelConfigKey(asignaturaId: string): string {
    return `asignatura:${asignaturaId}`;
}

export function getLegacyNivelConfigKey(asignatura: Pick<AsignaturaLike, "year" | "grupo">): string {
    return `${asignatura.year}-${asignatura.grupo}`;
}

export function getNivelConfigForAsignatura(
    nivelConfigs: Record<string, NivelConfig>,
    asignatura: AsignaturaLike | undefined,
): NivelConfig {
    if (!asignatura) return DEFAULT_NIVEL_CONFIG;

    return (
        nivelConfigs[getNivelConfigKey(asignatura.id)]
        ?? nivelConfigs[getLegacyNivelConfigKey(asignatura)]
        ?? DEFAULT_NIVEL_CONFIG
    );
}
