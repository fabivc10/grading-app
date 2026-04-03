export type Adecuacion = "acceso" | "significativa" | "no_significativa" | "no_tiene";

export type AsigRef = { id: string; nombre: string; grupo: number; seccion: number; year: number };

export type Tutor = { nombre: string; telefono: string };

export type ImportedStudentRow = {
    hojaNombre: string;
    grupo: number;
    seccion: number;
    cedula: string;
    nombreCompleto: string;
    fechaNacimiento: string;
    encargadoLegal: string;
    telefonoEncargadoLegal: string;
};

export type Estudiante = {
    id: string;
    nombreCompleto: string;
    cedula: string;
    fechaNacimiento: string;
    tutores: Tutor[];
    adecuacion: Adecuacion;
    asignaturas: AsigRef[];
};

export type EstudianteFormData = Omit<Estudiante, "id">;
