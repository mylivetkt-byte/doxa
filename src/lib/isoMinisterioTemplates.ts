/**
 * Plantillas ISO de programación por ministerio.
 * Cada plantilla define el encabezado normativo y las "estaciones" (cargos)
 * que conforman las columnas del formato.
 *
 * Piloto inicial: Afirmación y Comunicaciones.
 * Próximos: Danzas, Diaconado, FEL, Intercesión, Kabod, Kings Army.
 */

export interface IsoMinisterioTemplate {
  /** Nombre del ministerio en `prog_ministerios.nombre` (case-insensitive match). */
  nombreMinisterio: string;
  /** Código normativo ISO (ej. FO-EC-PA01). */
  codigo: string;
  /** Versión del formato. */
  version: string;
  /** Fecha de emisión del formato (dd/mm/aaaa). */
  fechaVigencia: string;
  /** Título grande del PDF. */
  titulo: string;
  /** Estaciones/columnas del cuadro (en orden). Se crean como cargos del ministerio. */
  estaciones: string[];
  /** Tipos de evento (prog_eventos.tipo) en los que participa este ministerio. Vacío/undefined = todos. */
  tiposEvento?: string[];
  /** Fecha inicial (ISO yyyy-mm-dd) del rango de reuniones donde aparece. Vacío = sin límite inferior. */
  fechaInicio?: string | null;
  /** Fecha final (ISO yyyy-mm-dd) del rango de reuniones donde aparece. Vacío = sin límite superior. */
  fechaFin?: string | null;
  /** Fechas específicas (yyyy-mm-dd) donde participa el ministerio. Si tiene valores, se SUMAN a los eventos del rango. */
  fechasIncluidas?: string[] | null;
  /** Nombre del líder escrito manualmente (opcional). Si está definido, prevalece sobre el líder configurado en el ministerio. */
  liderNombreManual?: string | null;
  /** Estaciones que se diligencian con texto libre (concepto/descripción), no con una persona de la membresía. */
  estacionesTexto?: string[];
  /** Texto del bloque "Importante" (puede ser vacío). */
  importante?: string;
  /** Responsabilidades / nota al pie. */
  responsabilidades: string;
  /** Firmas (Elaborado / Revisado / Autorizado). */
  firmas: {
    elaboradoPor: { nombre: string; cargo: string };
    revisadoPor: { nombre: string; cargo: string };
    autorizadoPor: { nombre: string; cargo: string };
  };
}

const FIRMAS_DEFAULT: IsoMinisterioTemplate["firmas"] = {
  elaboradoPor: { nombre: "Edith Carolina Niño Martinez", cargo: "Dirección de Procesos" },
  revisadoPor: { nombre: "Tania Alexandra Grimaldos B", cargo: "Pastora" },
  autorizadoPor: { nombre: "Carlos Alberto Delgado A.", cargo: "Pastor" },
};

const RESPONSABILIDADES_DEFAULT =
  "Para poder servir se debe cumplir con todas las Responsabilidades: " +
  "*Miembro activo de una casa de paz, * haber terminado las escuelas, " +
  "*asistir a los servicios básicos de la Iglesia: Viernes y Domingo. " +
  "*Ser fiel en los Diezmos y Ofrendas *asistir a la reunión de Liderazgo. " +
  "NOTA: Quien no pueda asistir debe buscar quien lo reemplace e informar al Líder de ministerio.";

export const ISO_TEMPLATES: IsoMinisterioTemplate[] = [
  {
    nombreMinisterio: "Afirmación",
    codigo: "FO-EC-PA01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO AFIRMACIÓN",
    estaciones: [
      "Aseo",
      "Devocional",
      "Lateral Derecho",
      "Lateral Derecho - Centro",
      "Centro",
      "Lateral Izquierdo",
      "Lateral Izquierdo - Centro",
    ],
    importante:
      "Todo el ministerio debe asistir con el uniforme asignado sin excusas. " +
      "Hora de llegada viernes 6:30 pm (máx. 6:40 pm). Hora de llegada domingo 7:00 am (máx. 7:10 am). " +
      "Quien llegue después de la hora estipulada no está habilitado para servir ese día. " +
      "Recordar sentarse durante el servicio en la 4, 5 y 6 fila detrás de la alabanza.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Comunicaciones",
    codigo: "FO-EC-PC01",
    version: "01",
    fechaVigencia: "11/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO COMUNICACIONES",
    estaciones: [
      "Aseo Oficina",
      "Transmisión",
      "Apoyo a Transmisión",
      "Cámara 1 Alabanza",
      "Cámara 2 Alabanza",
      "Cámara 1 Prédica",
      "Cámara 2 Prédica",
      "Fotografía",
    ],
    importante:
      "Transmisión: iniciar antes del servicio, colocar canciones y versículos en el Open, supervisar videobeam. " +
      "Apoyo: pendiente del zello y de los comentarios en Live (responder por CMG). " +
      "Cámaras: buenos planos, foco en la prédica, montar/desmontar cámaras al inicio/final. " +
      "Fotografía: imagen de la iglesia, fotos que ministren desde la entrada hasta la salida.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Danzas",
    codigo: "FO-EC-PD01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO DANZAS",
    estaciones: [
      "Docente 3-6 años",
      "Auxiliar 3-6 años",
      "Tema 3-6 años",
      "Docente 7-11 años",
      "Auxiliar 7-11 años",
      "Tema 7-11 años",
      "Danza Servicio",
    ],
    importante:
      "Llegar 30 min antes para preparación. Uniforme completo según evento. " +
      "Confirmar tema y coreografía con la líder al menos 2 días antes del servicio.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Diaconado",
    codigo: "FO-EC-PDC01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO DIACONADO",
    estaciones: [
      "Puerta Principal",
      "Puerta Lateral",
      "Lateral Derecho",
      "Lateral Izquierdo",
      "Centro",
      "Ofrenda",
      "Santa Cena",
    ],
    importante:
      "Llegada 1 hora antes del servicio. Uniforme institucional sin excepciones. " +
      "Apoyar el ingreso, ubicación y salida ordenada de la congregación.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "FEL",
    codigo: "FO-EC-PFEL01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO FEL",
    estaciones: ["Encargado", "Apoyo 1", "Apoyo 2", "Logística"],
    importante: "Coordinar con la líder los puntos a cubrir y los recursos necesarios.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Intercesión",
    codigo: "FO-EC-PI01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO INTERCESIÓN",
    estaciones: ["Intercesor 1", "Intercesor 2", "Intercesor 3", "Intercesor 4", "Cobertura Prédica"],
    importante: "Llegar 1 hora antes para preparación y guerra espiritual previa al servicio.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Kabod",
    codigo: "FO-EC-PK01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO KABOD",
    estaciones: [
      "Docente 3-6 años",
      "Auxiliar 3-6 años",
      "Tema 3-6 años",
      "Docente 7-11 años",
      "Auxiliar 7-11 años",
      "Tema 7-11 años",
    ],
    estacionesTexto: [
      "Tema 3-6 años",
      "Tema 7-11 años",
      "Texto",
      "Alabanza",
      "Dinámica",
      "Decoración",
      "Objetivo",
      "Refrigerio"
    ],
    importante: "Preparar material didáctico y devocional con anticipación. Uniforme Kabod completo.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Kings Army",
    codigo: "FO-EC-PKA01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO KINGS ARMY",
    estaciones: [
      "Grupo",
      "Docente",
      "Auxiliar",
      "Objetivo",
      "Texto Bíblico",
      "Material Didáctico",
      "Dinámica",
    ],
    estacionesTexto: ["Objetivo", "Texto Bíblico", "Material Didáctico", "Dinámica"],
    importante: "Planificador mensual. Cada semana confirmar docente y auxiliar asignados.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Alabanza",
    codigo: "FO-EC-PAL01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO ALABANZA",
    estaciones: ["Director", "Cantante", "Teclado", "Batería", "Bajo", "Guitarra", "Coros"],
    importante:
      "Ensayo obligatorio el día previo al servicio. Llegar 1 hora antes para prueba de sonido. " +
      "Uniforme institucional y actitud de adoración durante todo el servicio.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Danza",
    codigo: "FO-EC-PDZ01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO DANZA",
    estaciones: ["Bailarín 1", "Bailarín 2", "Bailarín 3", "Bailarín 4", "Tema", "Vestuario"],
    importante:
      "Llegar 30 min antes para preparación y calentamiento. Confirmar coreografía y tema con la líder 2 días antes.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Infantil",
    codigo: "FO-EC-PIN01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO INFANTIL",
    estaciones: ["Maestro", "Apoyo", "Tema", "Material", "Recepción", "Aseo"],
    estacionesTexto: ["Tema", "Material"],
    importante:
      "Preparar material didáctico y dinámicas con anticipación. Llegar 45 min antes del servicio. " +
      "Cumplir con el protocolo de cuidado del menor.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Consolidación",
    codigo: "FO-EC-PCN01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO CONSOLIDACIÓN",
    estaciones: [
      "Palabra NPT",
      "Bienvenida y Palabra",
      "Lateral Derecho",
      "Lateral Derecho Centro",
      "Centro",
      "Lateral Izquierdo",
      "Lateral Izquierdo Centro",
    ],
    importante:
      "Atender con calidez a los nuevos, registrar sus datos y entregar el material de bienvenida. " +
      "Uniforme completo y llegada 30 min antes del servicio.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "EscuelasFel",
    codigo: "FO-EC-PEF01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO ESCUELAS FEL",
    estaciones: [
      "Toma De Asistencia",
      "Docente",
      "Coffe Break",
      "Recepción",
      "Organización De Auditorio",
      "Proyecto Nehemías",
    ],
    importante:
      "Coordinar materiales y refrigerios con anticipación. Confirmar docente y tema de la clase 2 días antes.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Protocolo y Seguridad",
    codigo: "FO-EC-PPS01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO PROTOCOLO Y SEGURIDAD",
    estaciones: [
      "Puerta Principal",
      "Parqueadero",
      "Acceso Auditorio",
      "Recorrido Interno",
      "Apoyo Pastoral",
      "Apoyo Externo",
    ],
    importante:
      "Llegar 1 hora antes del servicio. Uniforme y radio asignado. Mantener comunicación constante por canal interno.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
  {
    nombreMinisterio: "Sonido",
    codigo: "FO-EC-PSO01",
    version: "01",
    fechaVigencia: "18/07/2024",
    titulo: "FORMATO PROGRAMACIÓN MINISTERIO SONIDO",
    estaciones: [
      "Operador FOH",
      "Operador Monitores",
      "Microfonía",
      "Backline",
      "Apoyo Técnico",
    ],
    importante:
      "Llegar 1.5 horas antes para montaje, prueba de línea y ensayo con alabanza. " +
      "Revisión de cableado, baterías de inalámbricos y respaldo de consola.",
    responsabilidades: RESPONSABILIDADES_DEFAULT,
    firmas: FIRMAS_DEFAULT,
  },
];

/** Palabras clave que por su naturaleza corresponden a texto libre a digitar y no a una persona */
export const TEXT_ESTACION_KEYWORDS = [
  "texto",
  "alabanza",
  "dinamica",
  "dinámica",
  "decoracion",
  "decoración",
  "objetivo",
  "refrigerio",
  "tema",
  "material",
  "leccion",
  "lección",
  "actividad",
  "cancion",
  "canción",
  "merienda",
  "comida",
  "menu",
  "menú",
  "canciones",
  "orden",
  "mensaje",
  "versiculo",
  "versículo",
  "devocional",
  "bosquejo",
  "apuntes",
  "notas",
  "grupo",
];

/** Comprueba si una estación debe ser de texto libre por defecto según su nombre */
export function isEstacionTextoPorDefecto(estacionNombre: string): boolean {
  if (!estacionNombre) return false;
  const n = norm(estacionNombre);
  return TEXT_ESTACION_KEYWORDS.some((kw) => {
    const kwNorm = norm(kw);
    return n.includes(kwNorm);
  });
}

/** Normaliza un nombre para comparar (minúsculas, sin tildes ni espacios extra). */
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Busca la plantilla ISO de un ministerio por nombre. */
export function findIsoTemplate(nombreMinisterio: string): IsoMinisterioTemplate | null {
  const n = norm(nombreMinisterio);
  const exact = ISO_TEMPLATES.find((t) => norm(t.nombreMinisterio) === n);
  if (exact) return exact;
  if (n.includes("kabod")) {
    return ISO_TEMPLATES.find((t) => norm(t.nombreMinisterio) === "kabod") || null;
  }
  if (n.includes("kings army") || n.includes("king's army") || n.includes("kingsarmy")) {
    return ISO_TEMPLATES.find((t) => norm(t.nombreMinisterio) === "kings army") || null;
  }
  if (n.includes("infantil")) {
    return ISO_TEMPLATES.find((t) => norm(t.nombreMinisterio) === "infantil") || null;
  }
  return null;
}
