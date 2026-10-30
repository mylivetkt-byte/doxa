import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileDown,
  Plus,
  X,
  Image as ImageIcon,
  History,
  Save,
  FileImage,
  Trash2,
  CheckCircle2,
  Settings2,
  FileText,
  RefreshCw,
  Sparkles,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import SearchableCombobox from "@/components/seminario/SearchableCombobox";
import IsoTemplateEditorDialog from "@/components/programa/IsoTemplateEditorDialog";
import { findIsoTemplate, isEstacionTextoPorDefecto, type IsoMinisterioTemplate } from "@/lib/isoMinisterioTemplates";
import { exportIsoMinisterioPdf, normKey } from "@/lib/exportIsoMinisterioPdf";
import {
  useProgMinisterios,
  useProgEventos,
  useProgAsignaciones,
  useProgCargos,
  useUpsertAsignacion,
  useDeleteAsignacion,
  useUpsertCargo,
  useUpsertMinisterio,
  type ProgMinisterio,
} from "@/hooks/usePrograma";
import { useIsoTemplateOverrides, getEffectiveIsoTemplate, useUpsertIsoTemplate } from "@/hooks/useIsoTemplates";
import { usePersonas } from "@/hooks/useDatabase";
import { useProgTextos } from "@/hooks/useProgTextos";
import {
  readHistorial,
  saveSnapshot,
  deleteSnapshot,
  formatSnapTs,
  type IsoSnapshot,
} from "@/lib/isoHistorial";
import {
  isMinisterioInfantilNombre,
  isKabodNombre,
  isKingsArmyNombre,
  isExcluidoDeInfantil,
  useProgramacionReunionesInfantil,
  useMigrarProgramacionReuniones,
  useInfantilGrupos,
} from "@/hooks/useInfantil";

type ConfirmAction = "pdf" | "png" | "jpg";
type ModoMinisterioIso = "kabod" | "kings_army" | "infantil";

export default function ProgramacionIsoInfantilView() {
  const { data: ministerios = [], isLoading: loadingMin } = useProgMinisterios();
  const { data: overrides = [] } = useIsoTemplateOverrides();
  const { data: eventos = [] } = useProgEventos();
  const { data: asignaciones = [] } = useProgAsignaciones();
  const { data: cargos = [] } = useProgCargos();
  const { data: personas = [] } = usePersonas();
  const { data: grupos = [] } = useInfantilGrupos();
  const { data: serviciosReuniones = [] } = useProgramacionReunionesInfantil();
  const migrarReuniones = useMigrarProgramacionReuniones();

  const upAsig = useUpsertAsignacion();
  const delAsig = useDeleteAsignacion();
  const upCargo = useUpsertCargo();
  const upMin = useUpsertMinisterio();
  const upIsoTpl = useUpsertIsoTemplate();

  const [modoMin, setModoMin] = useState<ModoMinisterioIso>("kabod");
  const autoSelectedMinRef = useRef(false);

  // Resolver los ministerios de este módulo: "Kabod" (FO-EC-PK01), "Kings Army" (FO-EC-PKA01) e "Infantil" (FO-EC-PIN01)
  const minKabodObj: ProgMinisterio | null = useMemo(() => {
    return ministerios.find((m) => isKabodNombre(m.nombre)) || null;
  }, [ministerios]);

  const minKingsArmyObj: ProgMinisterio | null = useMemo(() => {
    return ministerios.find((m) => isKingsArmyNombre(m.nombre)) || null;
  }, [ministerios]);

  const minInfantilObj: ProgMinisterio | null = useMemo(() => {
    const exact = ministerios.find(
      (m) => normKey(m.nombre) === "infantil" && !isKingsArmyNombre(m.nombre) && !isKabodNombre(m.nombre)
    );
    if (exact) return exact;
    return (
      ministerios.find(
        (m) =>
          isMinisterioInfantilNombre(m.nombre) &&
          !isKingsArmyNombre(m.nombre) &&
          !isKabodNombre(m.nombre)
      ) || null
    );
  }, [ministerios]);

  // Auto-seleccionar el ministerio que exista o tenga asignaciones en Reuniones
  useEffect(() => {
    if (autoSelectedMinRef.current) return;
    if (ministerios.length === 0) return;

    if (minKabodObj) {
      setModoMin("kabod");
      autoSelectedMinRef.current = true;
      return;
    }
    if (minKingsArmyObj) {
      setModoMin("kings_army");
      autoSelectedMinRef.current = true;
      return;
    }
    if (minInfantilObj) {
      setModoMin("infantil");
      autoSelectedMinRef.current = true;
    }
  }, [ministerios, minKabodObj, minKingsArmyObj, minInfantilObj]);

  const ministerioInfantil: ProgMinisterio | null =
    modoMin === "kabod"
      ? minKabodObj
      : modoMin === "kings_army"
      ? minKingsArmyObj
      : minInfantilObj;

  const defaultTemplateName =
    modoMin === "kabod" ? "Kabod" : modoMin === "kings_army" ? "Kings Army" : "Infantil";

  const template: IsoMinisterioTemplate = useMemo(() => {
    if (ministerioInfantil) {
      const eff = getEffectiveIsoTemplate(ministerioInfantil.id, ministerioInfantil.nombre, overrides);
      if (eff && !isExcluidoDeInfantil(eff.nombreMinisterio) && !isExcluidoDeInfantil(eff.titulo)) {
        return eff;
      }
    }
    return findIsoTemplate(defaultTemplateName) || findIsoTemplate("Infantil")!;
  }, [ministerioInfantil, overrides, defaultTemplateName]);

  const textos = useProgTextos(ministerioInfantil?.id || null);

  const [mes, setMes] = useState(() =>
    new Date().toLocaleDateString("es-CO", { month: "long" }).toUpperCase()
  );
  const [adding, setAdding] = useState<{ eventoId: string; estacion: string } | null>(null);
  const [addValue, setAddValue] = useState("");
  const [editTplOpen, setEditTplOpen] = useState(false);
  const [selectedEvToCall, setSelectedEvToCall] = useState<string>("");

  const estacionesTextoSet = useMemo(() => {
    const explicit = (template.estacionesTexto || ["Tema", "Material"]).map((e) => normKey(e));
    const set = new Set(explicit);
    (template.estaciones || []).forEach((est) => {
      if (isEstacionTextoPorDefecto(est)) {
        set.add(normKey(est));
      }
    });
    return set;
  }, [template.estaciones, template.estacionesTexto]);

  const [historial, setHistorial] = useState<IsoSnapshot[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const captureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ministerioInfantil?.id) {
      setHistorial(readHistorial(ministerioInfantil.id));
    }
  }, [ministerioInfantil?.id]);

  // Auto-sincronizar a infantil_clases cuando hay programación infantil en Reuniones
  const serviciosInfantilProgramados = useMemo(
    () =>
      serviciosReuniones.filter(
        (s) =>
          s.tiene_programacion_infantil &&
          !isExcluidoDeInfantil(s.ministerio_nombre) &&
          !isExcluidoDeInfantil(s.tema) &&
          !isExcluidoDeInfantil(s.grupo_texto)
      ),
    [serviciosReuniones]
  );
  const autoSyncedRef = useRef<string>("");
  useEffect(() => {
    if (!grupos || grupos.length === 0) return;
    if (serviciosInfantilProgramados.length === 0) return;
    const fp = serviciosInfantilProgramados
      .map((s) => `${s.key}:${s.maestro_id}:${s.maestro_auxiliar_id}:${s.tema}`)
      .join("|");
    if (autoSyncedRef.current === fp) return;
    autoSyncedRef.current = fp;
    migrarReuniones.mutate(serviciosInfantilProgramados);
  }, [serviciosInfantilProgramados, grupos]);

  // Eventos mostrados en el formato ISO:
  // 1) Fechas incluidas en la plantilla ISO (prog_iso_templates.fechas_incluidas), MÁS
  // 2) Cualquier servicio de Reuniones (prog_eventos) que ya tenga asignaciones o textos diligenciados para el ministerio activo (Infantil o Kings Army), MÁS
  // 3) Si aún no hay fechas filtradas en plantilla ni asignaciones específicas, mostrar los servicios de Reuniones dentro del rango (o todos los disponibles)
  const proxEventos = useMemo(() => {
    if (!ministerioInfantil) return [];
    const tipos =
      template.tiposEvento && template.tiposEvento.length > 0 ? new Set(template.tiposEvento) : null;
    const fechasConfiguradas = new Set((template.fechasIncluidas || []).filter(Boolean));

    // Eventos que ya tienen asignaciones o textos en el ministerio activo (Infantil o Kings Army)
    const eventosConDatosInfantil = new Set<string>();
    asignaciones.forEach((a) => {
      if (a.ministerio_id === ministerioInfantil.id) {
        eventosConDatosInfantil.add(a.evento_id);
      }
    });
    ((textos as any).rows || []).forEach((r: any) => {
      if (
        r.ministerio_id === ministerioInfantil.id &&
        r.valor &&
        r.valor.trim() &&
        !isExcluidoDeInfantil(r.valor)
      ) {
        eventosConDatosInfantil.add(r.evento_id);
      }
    });

    const baseValidos = eventos
      .filter((e) => !isExcluidoDeInfantil(e.titulo))
      .filter((e) => !tipos || tipos.has(e.tipo));

    if (fechasConfiguradas.size > 0 || eventosConDatosInfantil.size > 0) {
      return baseValidos
        .filter((e) => fechasConfiguradas.has(e.fecha) || eventosConDatosInfantil.has(e.id))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    if (template.fechaInicio || template.fechaFin) {
      return baseValidos
        .filter((e) => {
          if (template.fechaInicio && e.fecha < template.fechaInicio) return false;
          if (template.fechaFin && e.fecha > template.fechaFin) return false;
          return true;
        })
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    return [...baseValidos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [
    eventos,
    template.tiposEvento,
    template.fechasIncluidas,
    template.fechaInicio,
    template.fechaFin,
    asignaciones,
    (textos as any).rows,
    ministerioInfantil,
  ]);

  const personasMap = useMemo(() => new Map(personas.map((p: any) => [p.id, p])), [personas]);

  const liderNombreDefault = useMemo(() => {
    if (!ministerioInfantil?.lider_persona_id) return "";
    const l: any = personasMap.get(ministerioInfantil.lider_persona_id);
    return l ? `${l.nombres} ${l.apellidos}` : "";
  }, [ministerioInfantil, personasMap]);

  const liderEfectivo = template.liderNombreManual?.trim() || liderNombreDefault;

  const cargosMin = useMemo(
    () => (ministerioInfantil ? cargos.filter((c) => c.ministerio_id === ministerioInfantil.id) : []),
    [cargos, ministerioInfantil]
  );

  const cargoPorEstacion = useMemo(() => {
    const m = new Map<string, (typeof cargosMin)[number]>();
    cargosMin.forEach((c) => m.set(normKey(c.nombre), c));
    return m;
  }, [cargosMin]);

  type Cell = { id: string; persona_id: string; nombre: string };
  const cellsByEv = useMemo(() => {
    const m = new Map<string, Map<string, Cell[]>>();
    proxEventos.forEach((e) => m.set(e.id, new Map()));
    if (!ministerioInfantil) return m;
    asignaciones
      .filter((a) => a.ministerio_id === ministerioInfantil.id)
      .forEach((a) => {
        const ev = m.get(a.evento_id);
        if (!ev) return;
        const c = a.cargo_id ? cargosMin.find((x) => x.id === a.cargo_id) : null;
        if (!c) return;
        const key = normKey(c.nombre);
        const p: any = personasMap.get(a.persona_id);
        if (!p) return;
        const arr = ev.get(key) || [];
        arr.push({ id: a.id, persona_id: a.persona_id, nombre: `${p.nombres} ${p.apellidos}` });
        ev.set(key, arr);
      });
    return m;
  }, [proxEventos, asignaciones, cargosMin, ministerioInfantil, personasMap]);

  const personaItems = useMemo(
    () =>
      personas.map((p: any) => ({
        id: p.id,
        label: `${p.nombres} ${p.apellidos}`,
        sub: p.telefono || p.whatsapp || "",
      })),
    [personas]
  );

  // Opciones de servicios en Reuniones para llamar/agregar a la tabla ISO
  const eventosDisponiblesItems = useMemo(() => {
    const idsYaMostrados = new Set(proxEventos.map((e) => e.id));
    return eventos
      .filter((e) => !idsYaMostrados.has(e.id) && !isExcluidoDeInfantil(e.titulo))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map((e) => ({
        id: e.id,
        label: `${e.fecha} — ${e.titulo}${e.hora ? ` (${e.hora})` : ""}`,
        sub: `${e.tipo} · ${e.estado}`,
      }));
  }, [eventos, proxEventos]);

  const crearMinisterioInfantil = async (targetModo: ModoMinisterioIso = modoMin) => {
    const esKings = targetModo === "kings_army";
    const esKabod = targetModo === "kabod";
    const nombreMin = esKabod ? "Kabod" : esKings ? "Kings Army" : "Infantil";
    const colorMin = esKabod ? "#2563eb" : esKings ? "#7c3aed" : "#0284c7";
    const descMin = esKabod
      ? "Ministerio Kabod (FO-EC-PK01)"
      : esKings
      ? "Ministerio Kings Army (FO-EC-PKA01)"
      : "Ministerio Infantil (FO-EC-PIN01)";
    try {
      const created = await upMin.mutateAsync({
        nombre: nombreMin,
        color: colorMin,
        descripcion: descMin,
        activo: true,
      });
      const baseTpl = findIsoTemplate(nombreMin)!;
      for (let i = 0; i < baseTpl.estaciones.length; i++) {
        await upCargo.mutateAsync({
          ministerio_id: (created as any).id,
          nombre: baseTpl.estaciones[i],
          orden: i,
          cupo: 1,
        });
      }
      toast.success(`Ministerio ${nombreMin} y estaciones ISO inicializados`);
    } catch (e: any) {
      toast.error(e.message || `Error al inicializar ${nombreMin}`);
    }
  };

  const cargarPlantillaIso = async () => {
    if (!ministerioInfantil) return;
    const existentes = new Set(cargosMin.map((c) => normKey(c.nombre)));
    let creados = 0;
    try {
      for (let i = 0; i < template.estaciones.length; i++) {
        const est = template.estaciones[i];
        if (existentes.has(normKey(est))) continue;
        await upCargo.mutateAsync({
          ministerio_id: ministerioInfantil.id,
          nombre: est,
          orden: i,
          cupo: 1,
        });
        creados++;
      }
      toast.success(
        creados > 0
          ? `${creados} cargos creados desde ${template.codigo}`
          : `Todas las estaciones ya existen (${template.codigo})`
      );
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Llamar un servicio desde Reuniones agregando su fecha a la plantilla ISO del Ministerio Infantil
  const llamarServicioDeReuniones = async (eventoId: string) => {
    if (!ministerioInfantil) return;
    const ev = eventos.find((x) => x.id === eventoId);
    if (!ev) return;
    try {
      const actuales = new Set((template.fechasIncluidas || []).filter(Boolean));
      actuales.add(ev.fecha);
      // También incluir las fechas de los eventos que ya estaban visibles
      proxEventos.forEach((p) => actuales.add(p.fecha));

      await upIsoTpl.mutateAsync({
        ministerio_id: ministerioInfantil.id,
        fechas_incluidas: Array.from(actuales).sort(),
      });
      setSelectedEvToCall("");
      toast.success(`Servicio "${ev.titulo}" (${ev.fecha}) llamado al Formato ISO Infantil`);
    } catch (e: any) {
      toast.error(e.message || "No se pudo agregar la fecha del servicio");
    }
  };

  const quitarFechaDeIso = async (fecha: string) => {
    if (!ministerioInfantil) return;
    const nuevas = (template.fechasIncluidas || []).filter((f) => f && f !== fecha);
    try {
      await upIsoTpl.mutateAsync({
        ministerio_id: ministerioInfantil.id,
        fechas_incluidas: nuevas.length > 0 ? nuevas : null,
      });
      toast.success(`Fecha ${fecha} retirada de la lista de fechas ISO`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const ensureCargo = async (estacion: string) => {
    if (!ministerioInfantil) throw new Error("Ministerio Infantil no disponible");
    const k = normKey(estacion);
    const existing = cargoPorEstacion.get(k);
    if (existing) return existing.id;
    const created = await upCargo.mutateAsync({
      ministerio_id: ministerioInfantil.id,
      nombre: estacion,
      orden: template.estaciones.indexOf(estacion),
      cupo: 1,
    });
    return (created as any).id;
  };

  const addPersona = async (eventoId: string, estacion: string, persona_id: string) => {
    if (!ministerioInfantil) return;
    try {
      const cargo_id = await ensureCargo(estacion);
      await upAsig.mutateAsync({
        evento_id: eventoId,
        ministerio_id: ministerioInfantil.id,
        cargo_id,
        persona_id,
        estado: "asignado",
      });
      toast.success("Asignación guardada en Reuniones e Iglesia Infantil");
      setAdding(null);
      setAddValue("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removePersona = async (id: string) => {
    try {
      await delAsig.mutateAsync(id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const buildAsigsPorEv = () => {
    const m = new Map<string, Map<string, string>>();
    proxEventos.forEach((e) => {
      const inner = new Map<string, string>();
      const cells = cellsByEv.get(e.id) || new Map();
      cells.forEach((arr: Cell[], key: string) => {
        if (estacionesTextoSet.has(key)) return;
        inner.set(key, arr.map((x) => x.nombre).join(", "));
      });
      m.set(e.id, inner);
    });
    return m;
  };

  const buildTextoEstacionPorEv = () => {
    const m = new Map<string, Map<string, string>>();
    proxEventos.forEach((e) => {
      const inner = new Map<string, string>();
      template.estaciones.forEach((est) => {
        const key = normKey(est);
        const val = textos.get(e.id, `estacion:${key}`);
        if (estacionesTextoSet.has(key) || (val && val.trim())) {
          inner.set(key, val);
        }
      });
      m.set(e.id, inner);
    });
    return m;
  };

  const buildUniformeMap = () =>
    new Map(proxEventos.map((e) => [e.id, textos.get(e.id, "uniforme")]));
  const buildObservacionMap = () =>
    new Map(proxEventos.map((e) => [e.id, textos.get(e.id, "observacion")]));

  const buildSnapshot = (etiqueta: string, definitiva = false) => {
    const asigsPorEv = buildAsigsPorEv();
    const textosEst = buildTextoEstacionPorEv();
    return {
      etiqueta,
      definitiva,
      mes,
      liderNombre: liderEfectivo,
      eventos: proxEventos.map((e) => {
        const asig = Object.fromEntries(asigsPorEv.get(e.id) || new Map());
        const txt = textosEst.get(e.id) || new Map();
        txt.forEach((val, key) => {
          if (val) asig[key] = val;
        });
        return {
          id: e.id,
          fecha: e.fecha,
          titulo: e.titulo,
          hora: e.hora,
          asignaciones: asig,
          uniforme: textos.get(e.id, "uniforme"),
          observacion: textos.get(e.id, "observacion"),
        };
      }),
    };
  };

  const guardarVersion = (etiqueta?: string, definitiva = false) => {
    if (!ministerioInfantil) return null;
    const lbl = etiqueta || `Versión ${historial.length + 1}`;
    const snap = saveSnapshot(ministerioInfantil.id, buildSnapshot(lbl, definitiva));
    setHistorial(readHistorial(ministerioInfantil.id));
    toast.success(definitiva ? "Versión definitiva guardada" : "Versión guardada en historial");
    return snap;
  };

  const restaurarTextos = (snap: IsoSnapshot) => {
    setMes(snap.mes);
    snap.eventos.forEach((e) => {
      textos.setValor(e.id, "uniforme", e.uniforme || "");
      textos.setValor(e.id, "observacion", e.observacion || "");
    });
    toast.success(
      "Textos restaurados (mes, uniforme, observación). Las asignaciones y textos de estación se mantienen como están en la base de datos."
    );
  };

  const descargarPdfDeSnap = (snap: IsoSnapshot) => {
    const m = new Map<string, Map<string, string>>();
    snap.eventos.forEach((e) => m.set(e.id, new Map(Object.entries(e.asignaciones))));
    exportIsoMinisterioPdf({
      template,
      mes: snap.mes,
      liderNombre: snap.liderNombre,
      eventos: snap.eventos.map((e) => ({
        id: e.id,
        fecha: e.fecha,
        titulo: e.titulo,
        hora: e.hora,
      })),
      asignacionesPorEvento: m,
      uniformePorEvento: new Map(snap.eventos.map((e) => [e.id, e.uniforme])),
      observacionPorEvento: new Map(snap.eventos.map((e) => [e.id, e.observacion])),
    });
  };

  const generarPdfActual = () => {
    const asigs = buildAsigsPorEv();
    exportIsoMinisterioPdf({
      template,
      mes,
      liderNombre: liderEfectivo,
      eventos: proxEventos.map((e) => ({
        id: e.id,
        fecha: e.fecha,
        titulo: e.titulo,
        hora: e.hora,
      })),
      asignacionesPorEvento: asigs,
      uniformePorEvento: buildUniformeMap(),
      observacionPorEvento: buildObservacionMap(),
      textoEstacionPorEvento: buildTextoEstacionPorEv(),
    });
  };

  const capturar = async (): Promise<HTMLCanvasElement> => {
    const node = captureRef.current!;
    return await html2canvas(node, {
      scale: 3,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: node.scrollWidth,
      windowHeight: node.scrollHeight,
    });
  };

  const generarImagenPreview = async (tipo: "png" | "jpg") => {
    setGenerating(true);
    try {
      const canvas = await capturar();
      const mime = tipo === "png" ? "image/png" : "image/jpeg";
      const url = canvas.toDataURL(mime, tipo === "jpg" ? 0.95 : 1.0);
      setPreviewImg(url);
    } catch (e: any) {
      toast.error("No se pudo generar la imagen: " + e.message);
    } finally {
      setGenerating(false);
    }
  };

  const descargarImagenFinal = (tipo: "png" | "jpg") => {
    if (!previewImg) return;
    const a = document.createElement("a");
    a.href = previewImg;
    a.download = `${template.codigo}-${template.nombreMinisterio.replace(/\s+/g, "_")}-${mes}.${tipo}`;
    a.click();
    guardarVersion(`Imagen ${tipo.toUpperCase()} definitiva`, true);
    toast.success(`Imagen ${tipo.toUpperCase()} descargada y versión guardada`);
    setPreviewImg(null);
  };

  const confirmarYDescargar = async () => {
    if (!confirmAction) return;
    if (confirmAction === "pdf") {
      generarPdfActual();
      guardarVersion("PDF definitivo", true);
      toast.success("PDF generado y versión guardada");
      setConfirmAction(null);
    } else {
      await generarImagenPreview(confirmAction);
      setConfirmAction(null);
    }
  };

  const formatFecha = (iso: string) => {
    try {
      const d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  if (loadingMin) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!ministerioInfantil) {
    const esKings = modoMin === "kings_army";
    const esKabod = modoMin === "kabod";
    const labelMin = esKabod ? "Kabod" : esKings ? "Kings Army" : "Infantil";
    const codigoMin = esKabod ? "FO-EC-PK01" : esKings ? "FO-EC-PKA01" : "FO-EC-PIN01";
    return (
      <div className="p-6 space-y-6">
        {/* Selector de Ministerio en DOXA Kabod y Kings Army */}
        <div className="flex flex-wrap items-center gap-2 bg-background p-2 rounded-xl border w-fit shadow-sm">
          <button
            type="button"
            onClick={() => setModoMin("kabod")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              modoMin === "kabod"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Kabod · Infantil (FO-EC-PK01)
          </button>
          <button
            type="button"
            onClick={() => setModoMin("kings_army")}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              modoMin === "kings_army"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Kings Army · Adolescentes (FO-EC-PKA01)
          </button>
          {minInfantilObj && (
            <button
              type="button"
              onClick={() => setModoMin("infantil")}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                modoMin === "infantil"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Infantil (FO-EC-PIN01)
            </button>
          )}
        </div>

        <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 bg-background border rounded-xl">
          <h2 className="text-xl font-bold text-navy">
            Ministerio {labelMin} no encontrado en Reuniones
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Para usar el formato ISO de programación (<strong>{codigoMin}</strong>), inicializa el{" "}
            <strong>Ministerio {labelMin}</strong> en la base de datos de programación.
          </p>
          <Button onClick={() => crearMinisterioInfantil(modoMin)} disabled={upMin.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Inicializar Ministerio {labelMin} ({codigoMin})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-4 bg-muted/20 min-h-full">
      {/* Barra superior de acciones y conexión con Reuniones */}
      <div className="bg-background border rounded-xl p-3 md:p-4 shadow-sm flex flex-col gap-3">
        {/* Selector entre Kabod (Infantil) y Kings Army (Adolescentes) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Formato ISO activo:</span>
            <div className="flex flex-wrap items-center gap-1.5 bg-muted/60 p-1 rounded-lg border">
              <button
                type="button"
                onClick={() => setModoMin("kabod")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  modoMin === "kabod"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-background"
                }`}
              >
                Kabod · Infantil (FO-EC-PK01)
              </button>
              <button
                type="button"
                onClick={() => setModoMin("kings_army")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  modoMin === "kings_army"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-background"
                }`}
              >
                Kings Army · Adolescentes (FO-EC-PKA01)
              </button>
              {minInfantilObj && (
                <button
                  type="button"
                  onClick={() => setModoMin("infantil")}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                    modoMin === "infantil"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-slate-600 hover:bg-background"
                  }`}
                >
                  Infantil (FO-EC-PIN01)
                </button>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-[11px]">
            {proxEventos.length} servicio(s) cargado(s) desde Reuniones
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-navy">{template.titulo}</h2>
              <Badge variant="outline" className="text-xs font-semibold">
                ISO {template.codigo}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Sincronizado en tiempo real con{" "}
              <strong>Reuniones → Programación → {ministerioInfantil.nombre}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              title="Cargar estaciones ISO como cargos"
              onClick={cargarPlantillaIso}
            >
              <FileText className="h-3.5 w-3.5 mr-1" /> Estaciones ISO
            </Button>
            <Button
              size="sm"
              variant="outline"
              title="Editar formato ISO y fechas de participación"
              onClick={() => setEditTplOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1" /> Editar formato ISO
            </Button>
            <Button size="sm" variant="outline" onClick={() => guardarVersion()}>
              <Save className="h-3.5 w-3.5 mr-1" /> Guardar versión
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <History className="h-3.5 w-3.5 mr-1" /> Historial ({historial.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-auto bg-popover z-[60]">
                <DropdownMenuLabel>Versiones guardadas</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {historial.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">Sin versiones guardadas</div>
                )}
                {historial.map((s) => (
                  <div key={s.id} className="px-2 py-2 border-b last:border-0 hover:bg-accent/40">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate flex items-center gap-1">
                          {s.definitiva && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                          {s.etiqueta}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatSnapTs(s.ts)} · {s.mes}
                        </div>
                      </div>
                      <button
                        className="text-destructive opacity-60 hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSnapshot(ministerioInfantil.id, s.id);
                          setHistorial(readHistorial(ministerioInfantil.id));
                        }}
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => restaurarTextos(s)}
                      >
                        Restaurar textos
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px]"
                        onClick={() => descargarPdfDeSnap(s)}
                      >
                        <FileDown className="h-3 w-3 mr-1" />
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmAction("png")}
              disabled={generating}
            >
              <ImageIcon className="h-3.5 w-3.5 mr-1" /> Exportar PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmAction("jpg")}
              disabled={generating}
            >
              <FileImage className="h-3.5 w-3.5 mr-1" /> Exportar JPG
            </Button>
            <Button size="sm" onClick={() => setConfirmAction("pdf")}>
              <FileDown className="h-3.5 w-3.5 mr-1" /> Descargar PDF
            </Button>
          </div>
        </div>

        {/* Selector rápido para llamar cualquier servicio creado en el módulo de Reuniones */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-xs">
          <span className="font-semibold text-navy flex items-center gap-1.5">
            <CalendarPlus className="h-4 w-4 text-blue-600" />
            Llamar servicio del módulo de Reuniones:
          </span>
          <div className="w-72">
            <SearchableCombobox
              items={eventosDisponiblesItems}
              value={selectedEvToCall}
              onChange={(id) => {
                if (id) llamarServicioDeReuniones(id);
              }}
              placeholder="Buscar reunión por fecha o nombre…"
              width="w-72"
            />
          </div>
          {serviciosInfantilProgramados.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-blue-700 hover:bg-blue-50"
              disabled={migrarReuniones.isPending}
              onClick={async () => {
                try {
                  const res = await migrarReuniones.mutateAsync(serviciosInfantilProgramados);
                  toast.success(
                    `Clases infantiles sincronizadas (${res.creados} nuevas, ${res.actualizados} actualizadas)`
                  );
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${migrarReuniones.isPending ? "animate-spin" : ""}`} />
              Sincronizar a Clases ({serviciosInfantilProgramados.length})
            </Button>
          )}
        </div>
      </div>

      {/* ===== DOCUMENTO FORMATO ISO (IDÉNTICO AL MÓDULO DE REUNIONES) ===== */}
      <div ref={captureRef} className="space-y-3 bg-muted/30 p-2 md:p-4 rounded-lg border">
        <div className="bg-white border border-black grid grid-cols-[120px_1fr_180px] text-[11px] text-black">
          <div className="border-r border-black flex flex-col items-center justify-center py-2">
            <div className="font-bold text-sm">CMG</div>
            <div className="text-[8px] text-center leading-tight">
              CENTRO MUNDIAL
              <br />
              DE GLORIA
            </div>
          </div>
          <div className="border-r border-black flex items-center justify-center font-bold text-center px-2 text-[13px]">
            {template.titulo}
          </div>
          <div className="grid grid-rows-3 text-[10px]">
            <div className="grid grid-cols-[60px_1fr] border-b border-black">
              <div className="font-bold px-1 border-r border-black flex items-center">Código:</div>
              <div className="px-1 flex items-center">{template.codigo}</div>
            </div>
            <div className="grid grid-cols-[60px_1fr] border-b border-black">
              <div className="font-bold px-1 border-r border-black flex items-center">Versión:</div>
              <div className="px-1 flex items-center">{template.version}</div>
            </div>
            <div className="grid grid-cols-[60px_1fr]">
              <div className="font-bold px-1 border-r border-black flex items-center">Fecha:</div>
              <div className="px-1 flex items-center">{template.fechaVigencia}</div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-black p-2 text-[12px] text-black flex flex-wrap gap-x-6 gap-y-1 items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold">MES:</span>
            <Input
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="h-7 w-36 text-[12px] bg-white text-black"
            />
          </div>
          <div>
            <span className="font-bold">MINISTERIO:</span> {template.nombreMinisterio}
          </div>
          <div>
            <span className="font-bold">LÍDER:</span> {liderEfectivo || "—"}
          </div>
        </div>

        <div className="bg-white border border-black overflow-x-auto text-black">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-gray-200 text-black">
              <tr>
                <th className="border border-black px-2 py-1 text-left w-44">FECHA</th>
                {template.estaciones.map((est) => (
                  <th key={est} className="border border-black px-2 py-1 text-center min-w-[130px]">
                    {est.toUpperCase()}
                  </th>
                ))}
                <th className="border border-black px-2 py-1 text-center min-w-[120px]">UNIFORME</th>
                <th className="border border-black px-2 py-1 text-center min-w-[140px]">OBSERVACIÓN</th>
              </tr>
            </thead>
            <tbody>
              {proxEventos.length === 0 && (
                <tr>
                  <td
                    colSpan={template.estaciones.length + 3}
                    className="text-center text-muted-foreground py-6 border border-black"
                  >
                    Sin eventos programados. Selecciona un servicio arriba en{" "}
                    <strong>"Llamar servicio del módulo de Reuniones"</strong> o haz clic en{" "}
                    <strong>"Editar formato ISO"</strong> para agregar fechas.
                  </td>
                </tr>
              )}
              {proxEventos.map((e) => {
                const cells = cellsByEv.get(e.id) || new Map();
                const enFechasIncluidas = (template.fechasIncluidas || []).includes(e.fecha);
                return (
                  <tr key={e.id} className="align-top">
                    <td className="border border-black px-2 py-1 whitespace-nowrap">
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <div className="font-medium">{formatFecha(e.fecha)}</div>
                          {e.hora && <div className="text-[10px] text-muted-foreground">{e.hora}</div>}
                          {e.titulo && (
                            <div className="text-[10px] text-blue-700 font-medium truncate max-w-[160px]">
                              {e.titulo}
                            </div>
                          )}
                        </div>
                        {enFechasIncluidas && (
                          <button
                            type="button"
                            onClick={() => quitarFechaDeIso(e.fecha)}
                            className="text-muted-foreground hover:text-destructive p-0.5"
                            title="Quitar fecha del formato ISO"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    {template.estaciones.map((est) => {
                      const key = normKey(est);
                      const isTexto = estacionesTextoSet.has(key);
                      const arr: Cell[] = cells.get(key) || [];
                      const isAdding = adding?.eventoId === e.id && adding?.estacion === est;
                      const textoEst = textos.get(e.id, `estacion:${key}`);
                      if (isTexto) {
                        return (
                          <td key={est} className="border border-black p-1 align-top bg-white">
                            <textarea
                              value={textoEst}
                              onChange={(ev) =>
                                textos.setValor(e.id, `estacion:${key}`, ev.target.value)
                              }
                              rows={2}
                              className="w-full min-h-[42px] text-[11px] p-1 border rounded resize-y bg-background text-foreground focus:ring-1 focus:ring-blue-500 font-sans"
                              placeholder={`Digitar ${est}…`}
                            />
                          </td>
                        );
                      }
                      return (
                        <td key={est} className="border border-black px-1.5 py-1 align-top bg-white">
                          <div className="flex flex-col gap-1">
                            {/* Campo de texto directo (Digitar libremente) */}
                            <Input
                              value={textoEst}
                              onChange={(ev) =>
                                textos.setValor(e.id, `estacion:${key}`, ev.target.value)
                              }
                              className="h-6 text-[10px] px-1.5 bg-background text-foreground"
                              placeholder={`Digitar ${est}…`}
                            />
                            {arr.map((c) => (
                              <Badge
                                key={c.id}
                                variant="secondary"
                                className="justify-between gap-1 font-normal text-[10px] py-0.5"
                              >
                                <span className="truncate">{c.nombre}</span>
                                <button
                                  onClick={() => removePersona(c.id)}
                                  className="hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                            {isAdding ? (
                              <div className="flex flex-col gap-1 p-1 bg-slate-50 rounded border border-slate-200">
                                <SearchableCombobox
                                  items={personaItems}
                                  value={addValue}
                                  onChange={(id) => {
                                    if (id) addPersona(e.id, est, id);
                                  }}
                                  placeholder="Buscar persona en BD…"
                                  width="w-full"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 text-[10px]"
                                  onClick={() => {
                                    setAdding(null);
                                    setAddValue("");
                                  }}
                                >
                                  Cancelar
                                </Button>
                              </div>
                            ) : (
                              <button
                                className="text-[9.5px] text-muted-foreground hover:text-primary flex items-center gap-0.5 self-start"
                                onClick={() => {
                                  setAdding({ eventoId: e.id, estacion: est });
                                  setAddValue("");
                                }}
                                title="Buscar y vincular persona registrada en la base de datos"
                              >
                                <Plus className="h-2.5 w-2.5" /> Buscar persona
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border border-black p-1">
                      <Input
                        value={textos.get(e.id, "uniforme")}
                        onChange={(ev) => textos.setValor(e.id, "uniforme", ev.target.value)}
                        className="h-7 text-[11px]"
                        placeholder="Uniforme…"
                      />
                    </td>
                    <td className="border border-black p-1">
                      <Input
                        value={textos.get(e.id, "observacion")}
                        onChange={(ev) => textos.setValor(e.id, "observacion", ev.target.value)}
                        className="h-7 text-[11px]"
                        placeholder="Observación…"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {template.importante && (
          <div className="bg-white border border-black p-2 text-[10px] text-black">
            <span className="font-bold">Importante: </span>
            {template.importante}
          </div>
        )}
        <div className="bg-white border border-black p-2 text-[10px] text-black">
          <span className="font-bold">Responsabilidades: </span>
          {template.responsabilidades}
        </div>

        <div className="grid grid-cols-4 bg-white border border-black text-[10px] text-black">
          {["", "Elaborado por:", "Revisado por:", "Autorizado por:"].map((t, i) => (
            <div
              key={i}
              className={`p-1 font-bold ${i < 3 ? "border-r border-black" : ""} border-b border-black`}
            >
              {t}
            </div>
          ))}
          {["Firma", "", "", ""].map((t, i) => (
            <div
              key={i}
              className={`p-1 h-8 ${i < 3 ? "border-r border-black" : ""} border-b border-black`}
            >
              {t}
            </div>
          ))}
          {[
            "Nombre",
            template.firmas.elaboradoPor.nombre,
            template.firmas.revisadoPor.nombre,
            template.firmas.autorizadoPor.nombre,
          ].map((t, i) => (
            <div
              key={i}
              className={`p-1 ${i < 3 ? "border-r border-black" : ""} border-b border-black`}
            >
              {t}
            </div>
          ))}
          {[
            "Cargo",
            template.firmas.elaboradoPor.cargo,
            template.firmas.revisadoPor.cargo,
            template.firmas.autorizadoPor.cargo,
          ].map((t, i) => (
            <div key={i} className={`p-1 ${i < 3 ? "border-r border-black" : ""}`}>
              {t}
            </div>
          ))}
        </div>
      </div>

      {/* Editor de formato ISO */}
      {editTplOpen && (
        <IsoTemplateEditorDialog
          open={editTplOpen}
          onOpenChange={setEditTplOpen}
          ministerio={ministerioInfantil}
          template={template}
        />
      )}

      {/* Confirmación previa de exportación */}
      <Dialog
        open={!!confirmAction && !previewImg}
        onOpenChange={(o) => {
          if (!o) setConfirmAction(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar exportación</DialogTitle>
            <DialogDescription>
              {confirmAction === "pdf"
                ? "Se generará el PDF ISO con la programación actual y se guardará una versión definitiva en el historial."
                : `Se generará una imagen ${confirmAction?.toUpperCase()} en alta resolución (x3). Podrás revisarla antes de guardar.`}
            </DialogDescription>
          </DialogHeader>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              • Ministerio: <b>{template.nombreMinisterio}</b>
            </div>
            <div>
              • Mes: <b>{mes}</b>
            </div>
            <div>
              • Eventos: <b>{proxEventos.length}</b>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarYDescargar} disabled={generating}>
              {generating ? "Generando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revisión de imagen antes de descargar */}
      <Dialog
        open={!!previewImg}
        onOpenChange={(o) => {
          if (!o) {
            setPreviewImg(null);
            setConfirmAction(null);
          }
        }}
      >
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Vista final de la imagen</DialogTitle>
            <DialogDescription>
              Revisa que todo se vea correctamente antes de guardar como definitiva.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 p-2 border rounded">
            {previewImg && <img src={previewImg} alt="Preview ISO" className="mx-auto max-w-full" />}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPreviewImg(null);
                setConfirmAction(null);
              }}
            >
              Volver a editar
            </Button>
            <Button onClick={() => descargarImagenFinal((confirmAction as "png" | "jpg") || "png")}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Guardar como definitiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

