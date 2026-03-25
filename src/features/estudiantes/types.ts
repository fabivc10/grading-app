export type Adecuacion = "acceso" | "significativa" | "no_significativa" | "no_tiene";

export type AsigRef = { id: string; nombre: string; grupo: string; año: number };

export type Estudiante = {
    id: string;
    nombreCompleto: string;
    cedula: string;
    telefono: string;
    edad: number;
    adecuacion: Adecuacion;
    asignaturas: AsigRef[];
};

export type EstudianteFormData = Omit<Estudiante, "id">;
