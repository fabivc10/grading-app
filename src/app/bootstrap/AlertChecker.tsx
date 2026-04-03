import { useEffect } from "react";
import { useEvaluacionesStore } from "../../features/evaluations/store";
import { useAsignaturasStore } from "../../features/subjects/store";
import { useAsistenciaStore } from "../../features/attendance/store";
import { getAttendanceStats } from "../../features/attendance/utils/attendance.utils";
import { useConfiguracionStore } from "../../features/settings/store";
import { getNivelConfigForAsignatura } from "../../features/settings/utils/nivel-config.utils";
import { useNotificationsStore } from "../../features/notifications/store";
import type { EvalEntry, StudentEval, NivelConfig } from "../../features/evaluations/types";
import type { Umbral } from "../../features/settings/types";
import type { DayKey, EstadoAsist } from "../../features/attendance/types";
import type { NotifPriority } from "../../features/notifications/types";

const ATTENDANCE_DAYS: DayKey[] = ["l", "m", "x", "j", "v"];
const ALERT_KEY_PREFIXES = ["p-", "a-"];

type Period = "s1" | "s2" | "general";
type AlertSnapshot = {
    key: string;
    level: number;
    text: string;
    priority: NotifPriority;
};

function entryEarned(entry: EvalEntry): number {
    if (entry.items.length === 0) return entry.pct;
    return Math.min(entry.items.reduce((sum, item) => sum + Math.min(item.nota, item.valor), 0), entry.pct);
}

function categoryPct(entries: EvalEntry[]): number {
    if (entries.length === 0) return 100;
    const maxPoints = entries.reduce((sum, entry) => sum + entry.pct, 0);
    if (maxPoints <= 0) return 100;
    return Math.round((entries.reduce((sum, entry) => sum + entryEarned(entry), 0) / maxPoints) * 100);
}

function evaluationAttendancePct(attendance: StudentEval["asistencia"], period: Period = "general"): number {
    const weeks =
        period === "s1" ? attendance.s1 :
        period === "s2" ? attendance.s2 :
        [...attendance.s1, ...attendance.s2];

    return getAttendanceStats(
        weeks.flatMap((week) => week.dias),
        useConfiguracionStore.getState().unjustifiedAbsencesPerFault,
        useConfiguracionStore.getState().tardiesPerFault,
    ).pct;
}

function calcScore(record: StudentEval, config: NivelConfig, absenceThresholds: Umbral[], period: Period = "general"): number {
    let total = 0;
    for (const category of (["cotidiano", "tareas", "prueba", "proyecto"] as const)) {
        const entries = period === "general" ? record[category] : record[category].filter((entry) => entry.semestre === period);
        const weight = category === "proyecto" && config.numProyectos === 0 ? 0 : config[category];
        total += (categoryPct(entries) / 100) * weight;
    }

    const attendancePct = evaluationAttendancePct(record.asistencia, period);
    total += (attendancePct / 100) * config.asistencia;

    const absencePct = 100 - attendancePct;
    const penalty = absenceThresholds.filter((threshold) =>
        threshold.dir === ">" ? absencePct >= threshold.valor : absencePct <= threshold.valor
    ).length;

    return Math.min(100, Math.max(0, Math.round(total - penalty)));
}

function matchedAverageThresholds(score: number, thresholds: Umbral[]) {
    return [...thresholds]
        .sort((left, right) => left.valor - right.valor)
        .filter((threshold) => score <= threshold.valor);
}

function matchedAbsenceThresholds(absencePct: number, thresholds: Umbral[]) {
    return [...thresholds]
        .sort((left, right) => left.valor - right.valor)
        .filter((threshold) => (threshold.dir === ">" ? absencePct >= threshold.valor : absencePct <= threshold.valor));
}

function levelPriority(level: number, max: number): NotifPriority {
    if (level >= max) return "alta";
    if (level >= Math.ceil(max / 2)) return "media";
    return "baja";
}

function formatTime() {
    return new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function periodLabel(period: Period) {
    if (period === "s1") return "S1";
    if (period === "s2") return "S2";
    return "general";
}

function getAssignmentYear(assignment: unknown): number | string {
    if (!assignment || typeof assignment !== "object") return "";

    const assignmentRecord = assignment as Record<string, unknown>;
    const yearValue = assignmentRecord["year"];
    return typeof yearValue === "number" || typeof yearValue === "string" ? yearValue : "";
}

function subjectLabel(assignment: { nombre: string; grupo: number; seccion: number } | undefined) {
    if (!assignment) return "asignatura";

    const year = getAssignmentYear(assignment);
    return `${assignment.nombre} ${assignment.grupo}-${assignment.seccion} (${year})`;
}

export function AlertChecker() {
    const records = useEvaluacionesStore((state) => state.records);
    const assignments = useAsignaturasStore((state) => state.asignaturas);
    const averageThresholds = useConfiguracionStore((state) => state.umbralPromedio);
    const absenceThresholds = useConfiguracionStore((state) => state.umbralAusencias);
    const levelConfigs = useConfiguracionStore((state) => state.nivelConfigs);
    const unjustifiedAbsencesPerFault = useConfiguracionStore((state) => state.unjustifiedAbsencesPerFault);
    const tardiesPerFault = useConfiguracionStore((state) => state.tardiesPerFault);

    const attendanceDays = useAsistenciaStore((state) => state.dias);
    const attendanceWeeks = useAsistenciaStore((state) => state.semanas);
    const attendanceStudents = useAsistenciaStore((state) => state.students);
    const attendanceAssignmentId = useAsistenciaStore((state) => state.asignaturaId);

    useEffect(() => {
        const nextAlerts = new Map<string, AlertSnapshot>();

        for (const record of records) {
            if (!record.estudianteId) continue;

            const assignment = assignments.find((item) => item.id === record.asignaturaId);
            const config = getNivelConfigForAsignatura(levelConfigs, assignment);
            const assignmentText = subjectLabel(assignment);

            for (const period of (["s1", "s2", "general"] as const)) {
                if (!averageThresholds.length) continue;

                const score = calcScore(record, config, absenceThresholds, period);
                const matchedThresholds = matchedAverageThresholds(score, averageThresholds);
                const level = matchedThresholds.length;
                if (level === 0) continue;

                matchedThresholds.forEach((threshold, index) => {
                    const alertLevel = index + 1;
                    const key = `p-${period}-${record.estudianteId}-${record.asignaturaId}-${threshold.id}`;
                    nextAlerts.set(key, {
                        key,
                        level: alertLevel,
                        priority: levelPriority(alertLevel, averageThresholds.length),
                        text: `${record.nombre} - ${assignmentText}: promedio ${periodLabel(period)} ${score}% (umbral ${threshold.valor}%)`,
                    });
                });
            }

            if (!absenceThresholds.length) continue;

            const attendancePct = evaluationAttendancePct(record.asistencia, "general");
            const absencePct = 100 - attendancePct;
            const matchedThresholds = matchedAbsenceThresholds(absencePct, absenceThresholds);
            const level = matchedThresholds.length;
            if (level === 0) continue;

            matchedThresholds.forEach((threshold, index) => {
                const alertLevel = index + 1;
                const key = `a-${record.estudianteId}-${record.asignaturaId}-${threshold.id}`;
                nextAlerts.set(key, {
                    key,
                    level: alertLevel,
                    priority: levelPriority(alertLevel, absenceThresholds.length),
                    text: `${record.nombre} - ${assignmentText}: ${absencePct}% de faltas (${attendancePct}% asistencia, umbral ${threshold.valor}%)`,
                });
            });
        }

        if (absenceThresholds.length && attendanceAssignmentId && attendanceStudents.length) {
            const dayMap = new Map<string, Map<string, typeof attendanceDays[number]>>();
            attendanceDays.forEach((dayRecord) => {
                if (!dayMap.has(dayRecord.semanaId)) dayMap.set(dayRecord.semanaId, new Map());
                dayMap.get(dayRecord.semanaId)?.set(dayRecord.estudianteId, dayRecord);
            });

            const assignment = assignments.find((item) => item.id === attendanceAssignmentId);
            const assignmentText = subjectLabel(assignment);

            for (const student of attendanceStudents) {
                const marks: EstadoAsist[] = [];

                attendanceWeeks.forEach((week) => {
                    const dayRecord = dayMap.get(week.id)?.get(student.id);
                    if (!dayRecord) return;

                    ATTENDANCE_DAYS.forEach((dayKey) => {
                        const status = dayRecord[dayKey];
                        if (!status) return;
                        marks.push(status);
                    });
                });

                if (marks.length === 0) {
                    absenceThresholds.forEach((threshold) => {
                        nextAlerts.delete(`a-${student.id}-${attendanceAssignmentId}-${threshold.id}`);
                    });
                    continue;
                }

                const attendancePct = getAttendanceStats(marks, unjustifiedAbsencesPerFault, tardiesPerFault).pct;
                const absencePct = 100 - attendancePct;
                const matchedThresholds = matchedAbsenceThresholds(absencePct, absenceThresholds);
                const level = matchedThresholds.length;

                if (level === 0) {
                    absenceThresholds.forEach((threshold) => {
                        nextAlerts.delete(`a-${student.id}-${attendanceAssignmentId}-${threshold.id}`);
                    });
                    continue;
                }

                matchedThresholds.forEach((threshold, index) => {
                    const alertLevel = index + 1;
                    const thresholdKey = `a-${student.id}-${attendanceAssignmentId}-${threshold.id}`;
                    nextAlerts.set(thresholdKey, {
                        key: thresholdKey,
                        level: alertLevel,
                        priority: levelPriority(alertLevel, absenceThresholds.length),
                        text: `${student.nombre_completo} - ${assignmentText}: ${absencePct}% de faltas (${attendancePct}% asistencia, umbral ${threshold.valor}%)`,
                    });
                });
            }
        }

        const notificationsStore = useNotificationsStore.getState();
        const existingKeys = new Set<string>();

        Object.keys(notificationsStore.sentAlerts).forEach((key) => {
            if (ALERT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) existingKeys.add(key);
        });

        notificationsStore.notifications.forEach((notification) => {
            if (notification.alertKey && ALERT_KEY_PREFIXES.some((prefix) => notification.alertKey?.startsWith(prefix))) {
                existingKeys.add(notification.alertKey);
            }
        });

        nextAlerts.forEach((alert) => {
            existingKeys.delete(alert.key);
            notificationsStore.upsertAlert(alert.key, {
                text: alert.text,
                time: formatTime(),
                priority: alert.priority,
            });
            notificationsStore.setSentAlert(alert.key, alert.level);
        });

        existingKeys.forEach((key) => {
            notificationsStore.removeAlert(key);
            notificationsStore.clearSentAlert(key);
        });
    }, [
        attendanceAssignmentId,
        attendanceDays,
        attendanceWeeks,
        attendanceStudents,
        assignments,
        levelConfigs,
        records,
        absenceThresholds,
        averageThresholds,
        unjustifiedAbsencesPerFault,
        tardiesPerFault,
    ]);

    return null;
}



