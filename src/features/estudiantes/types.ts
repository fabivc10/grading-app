export type Adecuacion = "acceso" | "significativa" | "no_significativa" | "no_tiene";

export type AsigRef = { id: string; nombre: string; grupo: number; seccion: number; año: number };

export type Tutor = { nombre: string; telefono: string };

export type Estudiante = {
    id: string;
    nombreCompleto: string;
    cedula: string;
    fechaNacimiento: string;
    telefonoEstudiante: string;
    tutores: Tutor[];          // 1 requerido, máximo 2
    adecuacion: Adecuacion;
    asignaturas: AsigRef[];
};

export type EstudianteFormData = Omit<Estudiante, "id">;
