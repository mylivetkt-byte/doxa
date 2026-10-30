import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileDown, Plus, X, Image as ImageIcon, History, Save, FileImage, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import SearchableCombobox from "@/components/seminario/SearchableCombobox";
import { isEstacionTextoPorDefecto, type IsoMinisterioTemplate } from "@/lib/isoMinisterioTemplates";
import { exportIsoMinisterioPdf, normKey } from "@/lib/exportIsoMinisterioPdf";
import {
  useProgEventos,
  useProgAsignaciones,
  useProgCargos,
  useUpsertAsignacion,
  useDeleteAsignacion,
  useUpsertCargo,
  type ProgMinisterio,
} from "@/hooks/usePrograma";
import { usePersonas } from "@/hooks/useDatabase";
import { useProgTextos } from "@/hooks/useProgTextos";
import { readHistorial, saveSnapshot, deleteSnapshot, formatSnapTs, type IsoSnapshot } from "@/lib/isoHistorial";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ministerio: ProgMinisterio;
  template: IsoMinisterioTemplate;
  liderNombre: string;
}

type ConfirmAction = "pdf" | "png" | "jpg";

export default function IsoProgramacionPreview({ open, onOpenChange, ministerio, template, liderNombre }: Props) {
  const { data: eventos = [] } = useProgEventos();
  const { data: asignaciones = [] } = useProgAsignaciones();
  const { data: cargos = [] } = useProgCargos();
  const { data: personas = [] } = usePersonas();
  const upAsig = useUpsertAsignacion();
  const delAsig = useDeleteAsignacion();
  const upCargo = useUpsertCargo();

  const textos = useProgTextos(ministerio.id);

  const [mes, setMes] = useState(() => new Date().toLocaleDateString("es-CO", { month: "long" }).toUpperCase());
  const [adding, setAdding] = useState<{ eventoId: string; estacion: string } | null>(null);
  const [addValue, setAddValue] = useState("");

  const estacionesTextoSet = useMemo(() => {
    const explicit = (template.estacionesTexto || []).map((e) => normKey(e));
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
    if (open) setHistorial(readHistorial(ministerio.id));
  }, [open, ministerio.id]);

  const today = new Date().toISOString().slice(0, 10);
  const proxEventos = useMemo(
    () => {
      const tipos = template.tiposEvento && template.tiposEvento.length > 0 ? new Set(template.tiposEvento) : null;
      const fechas = template.fechasIncluidas && template.fechasIncluidas.length > 0
        ? new Set(template.fechasIncluidas.filter(Boolean))
        : null;
      // Estricto: si no hay fechas configuradas en la plantilla, no se muestra ninguna reunión.
      if (!fechas) return [];
      return eventos
        .filter((e) => fechas.has(e.fecha))
        .filter((e) => !tipos || tipos.has(e.tipo))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    },
    [eventos, template.tiposEvento, template.fechasIncluidas]
  );

  const liderEfectivo = template.liderNombreManual?.trim() || liderNombre;


  const personasMap = useMemo(() => new Map(personas.map((p: any) => [p.id, p])), [personas]);

  const cargosMin = useMemo(() => cargos.filter((c) => c.ministerio_id === ministerio.id), [cargos, ministerio.id]);
  const cargoPorEstacion = useMemo(() => {
    const m = new Map<string, typeof cargosMin[number]>();
    cargosMin.forEach((c) => m.set(normKey(c.nombre), c));
    return m;
  }, [cargosMin]);

  type Cell = { id: string; persona_id: string; nombre: string };
  const cellsByEv = useMemo(() => {
    const m = new Map<string, Map<string, Cell[]>>();
    proxEventos.forEach((e) => m.set(e.id, new Map()));
    asignaciones
      .filter((a) => a.ministerio_id === ministerio.id)
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
  }, [proxEventos, asignaciones, cargosMin, ministerio.id, personasMap]);

  const personaItems = useMemo(
    () =>
      personas.map((p: any) => ({
        id: p.id,
        label: `${p.nombres} ${p.apellidos}`,
        sub: p.telefono || p.whatsapp || "",
      })),
    [personas]
  );

  const ensureCargo = async (estacion: string) => {
    const k = normKey(estacion);
    const existing = cargoPorEstacion.get(k);
    if (existing) return existing.id;
    const created = await upCargo.mutateAsync({
      ministerio_id: ministerio.id,
      nombre: estacion,
      orden: template.estaciones.indexOf(estacion),
      cupo: 1,
    });
    return (created as any).id;
  };

  const addPersona = async (eventoId: string, estacion: string, persona_id: string) => {
    try {
      const cargo_id = await ensureCargo(estacion);
      await upAsig.mutateAsync({
        evento_id: eventoId,
        ministerio_id: ministerio.id,
        cargo_id,
        persona_id,
        estado: "asignado",
      });
      toast.success("Asignación guardada");
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

  /** Construye estructura plana de asignaciones (personas) para PDF/snapshot. */
  const buildAsigsPorEv = () => {
    const m = new Map<string, Map<string, string>>();
    proxEventos.forEach((e) => {
      const inner = new Map<string, string>();
      const cells = cellsByEv.get(e.id) || new Map();
      cells.forEach((arr: Cell[], key: string) => {
        if (estacionesTextoSet.has(key)) return; // los textos van por otro mapa
        inner.set(key, arr.map((x) => x.nombre).join(", "));
      });
      m.set(e.id, inner);
    });
    return m;
  };

  /** Construye mapa evento -> Map(estacionKey -> textoLibre) para estaciones tipo texto. */
  const buildTextoEstacionPorEv = () => {
    const m = new Map<string, Map<string, string>>();
    proxEventos.forEach((e) => {
      const inner = new Map<string, string>();
      template.estaciones.forEach((est) => {
        const key = normKey(est);
        if (!estacionesTextoSet.has(key)) return;
        inner.set(key, textos.get(e.id, `estacion:${key}`));
      });
      m.set(e.id, inner);
    });
    return m;
  };

  const buildUniformeMap = () => new Map(proxEventos.map((e) => [e.id, textos.get(e.id, "uniforme")]));
  const buildObservacionMap = () => new Map(proxEventos.map((e) => [e.id, textos.get(e.id, "observacion")]));

  const buildSnapshot = (etiqueta: string, definitiva = false) => {
    const asigsPorEv = buildAsigsPorEv();
    const textosEst = buildTextoEstacionPorEv();
    const snap = {
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
    return snap;
  };

  const guardarVersion = (etiqueta?: string, definitiva = false) => {
    const lbl = etiqueta || `Versión ${historial.length + 1}`;
    const snap = saveSnapshot(ministerio.id, buildSnapshot(lbl, definitiva));
    setHistorial(readHistorial(ministerio.id));
    toast.success(definitiva ? "Versión definitiva guardada" : "Versión guardada en historial");
    return snap;
  };

  const restaurarTextos = (snap: IsoSnapshot) => {
    setMes(snap.mes);
    snap.eventos.forEach((e) => {
      textos.setValor(e.id, "uniforme", e.uniforme || "");
      textos.setValor(e.id, "observacion", e.observacion || "");
    });
    toast.success("Textos restaurados (mes, uniforme, observación). Las asignaciones y textos de estación se mantienen como están en la base de datos.");
  };

  const descargarPdfDeSnap = (snap: IsoSnapshot) => {
    const m = new Map<string, Map<string, string>>();
    snap.eventos.forEach((e) => m.set(e.id, new Map(Object.entries(e.asignaciones))));
    exportIsoMinisterioPdf({
      template,
      mes: snap.mes,
      liderNombre: snap.liderNombre,
      eventos: snap.eventos.map((e) => ({ id: e.id, fecha: e.fecha, titulo: e.titulo, hora: e.hora })),
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
      eventos: proxEventos.map((e) => ({ id: e.id, fecha: e.fecha, titulo: e.titulo, hora: e.hora })),
      asignacionesPorEvento: asigs,
      uniformePorEvento: buildUniformeMap(),
      observacionPorEvento: buildObservacionMap(),
      textoEstacionPorEvento: buildTextoEstacionPorEv(),
    });
  };

  /** Captura el nodo del preview ISO como canvas en alta resolución. */
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
      return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch {
      return iso;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[95vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 pb-2 border-b flex-row items-center justify-between gap-2 space-y-0">
            <DialogTitle className="text-base">Vista previa: {template.titulo}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => guardarVersion()}>
                <Save className="h-4 w-4 mr-1" /> Guardar versión
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <History className="h-4 w-4 mr-1" /> Historial ({historial.length})
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
                          <div className="text-[10px] text-muted-foreground">{formatSnapTs(s.ts)} · {s.mes}</div>
                        </div>
                        <button
                          className="text-destructive opacity-60 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSnapshot(ministerio.id, s.id);
                            setHistorial(readHistorial(ministerio.id));
                          }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex gap-1 mt-1">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => restaurarTextos(s)}>
                          Restaurar textos
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => descargarPdfDeSnap(s)}>
                          <FileDown className="h-3 w-3 mr-1" />PDF
                        </Button>
                      </div>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>

          <div ref={captureRef} className="flex-1 overflow-auto px-4 py-3 space-y-3 bg-muted/30">
            <div className="bg-white border border-black grid grid-cols-[120px_1fr_180px] text-[11px]">
              <div className="border-r border-black flex flex-col items-center justify-center py-2">
                <div className="font-bold text-sm">CMG</div>
                <div className="text-[8px] text-center leading-tight">CENTRO MUNDIAL<br/>DE GLORIA</div>
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

            <div className="bg-white border border-black p-2 text-[12px] flex flex-wrap gap-x-6 gap-y-1 items-center">
              <div className="flex items-center gap-2">
                <span className="font-bold">MES:</span>
                <Input value={mes} onChange={(e) => setMes(e.target.value)} className="h-7 w-32 text-[12px]" />
              </div>
              <div><span className="font-bold">MINISTERIO:</span> {template.nombreMinisterio}</div>
              <div><span className="font-bold">LÍDER:</span> {liderEfectivo || "—"}</div>
            </div>

            <div className="bg-white border border-black overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="border border-black px-2 py-1 text-left w-40">FECHA</th>
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
                    <tr><td colSpan={template.estaciones.length + 3} className="text-center text-muted-foreground py-4 border border-black">Sin eventos programados</td></tr>
                  )}
                  {proxEventos.map((e) => {
                    const cells = cellsByEv.get(e.id) || new Map();
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="border border-black px-2 py-1 whitespace-nowrap">
                          {formatFecha(e.fecha)}
                          {e.hora && <div className="text-[10px] text-muted-foreground">{e.hora}</div>}
                        </td>
                        {template.estaciones.map((est) => {
                          const key = normKey(est);
                          const isTexto = estacionesTextoSet.has(key);
                          const arr: Cell[] = cells.get(key) || [];
                          const isAdding = adding?.eventoId === e.id && adding?.estacion === est;
                          if (isTexto) {
                            return (
                              <td key={est} className="border border-black p-1 align-top bg-white">
                                <textarea
                                  value={textos.get(e.id, `estacion:${key}`)}
                                  onChange={(ev) => textos.setValor(e.id, `estacion:${key}`, ev.target.value)}
                                  rows={2}
                                  className="w-full min-h-[42px] text-[11px] p-1 border rounded resize-y bg-background focus:ring-1 focus:ring-blue-500 font-sans"
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
                                  value={textos.get(e.id, `estacion:${key}`)}
                                  onChange={(ev) => textos.setValor(e.id, `estacion:${key}`, ev.target.value)}
                                  className="h-6 text-[10px] px-1.5 bg-background"
                                  placeholder={`Digitar ${est}…`}
                                />
                                {arr.map((c) => (
                                  <Badge key={c.id} variant="secondary" className="justify-between gap-1 font-normal text-[10px] py-0.5">
                                    <span className="truncate">{c.nombre}</span>
                                    <button onClick={() => removePersona(c.id)} className="hover:text-destructive">
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                                {isAdding ? (
                                  <div className="flex flex-col gap-1 p-1 bg-slate-50 rounded border border-slate-200">
                                    <SearchableCombobox
                                      items={personaItems}
                                      value={addValue}
                                      onChange={(id) => { if (id) addPersona(e.id, est, id); }}
                                      placeholder="Buscar persona en BD…"
                                      width="w-full"
                                    />
                                    <Button size="sm" variant="ghost" className="h-5 text-[10px]" onClick={() => { setAdding(null); setAddValue(""); }}>Cancelar</Button>
                                  </div>
                                ) : (
                                  <button
                                    className="text-[9.5px] text-muted-foreground hover:text-primary flex items-center gap-0.5 self-start"
                                    onClick={() => { setAdding({ eventoId: e.id, estacion: est }); setAddValue(""); }}
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
              <div className="bg-white border border-black p-2 text-[10px]">
                <span className="font-bold">Importante: </span>{template.importante}
              </div>
            )}
            <div className="bg-white border border-black p-2 text-[10px]">
              <span className="font-bold">Responsabilidades: </span>{template.responsabilidades}
            </div>

            <div className="grid grid-cols-4 bg-white border border-black text-[10px]">
              {["", "Elaborado por:", "Revisado por:", "Autorizado por:"].map((t, i) => (
                <div key={i} className={`p-1 font-bold ${i < 3 ? "border-r border-black" : ""} border-b border-black`}>{t}</div>
              ))}
              {["Firma", "", "", ""].map((t, i) => (
                <div key={i} className={`p-1 h-8 ${i < 3 ? "border-r border-black" : ""} border-b border-black`}>{t}</div>
              ))}
              {["Nombre", template.firmas.elaboradoPor.nombre, template.firmas.revisadoPor.nombre, template.firmas.autorizadoPor.nombre].map((t, i) => (
                <div key={i} className={`p-1 ${i < 3 ? "border-r border-black" : ""} border-b border-black`}>{t}</div>
              ))}
              {["Cargo", template.firmas.elaboradoPor.cargo, template.firmas.revisadoPor.cargo, template.firmas.autorizadoPor.cargo].map((t, i) => (
                <div key={i} className={`p-1 ${i < 3 ? "border-r border-black" : ""}`}>{t}</div>
              ))}
            </div>
          </div>

          <DialogFooter className="px-4 py-3 border-t bg-background gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
            <Button variant="outline" onClick={() => setConfirmAction("png")} disabled={generating}>
              <ImageIcon className="h-4 w-4 mr-1" />Exportar PNG
            </Button>
            <Button variant="outline" onClick={() => setConfirmAction("jpg")} disabled={generating}>
              <FileImage className="h-4 w-4 mr-1" />Exportar JPG
            </Button>
            <Button onClick={() => setConfirmAction("pdf")}><FileDown className="h-4 w-4 mr-1" />Descargar PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmación previa ===== */}
      <Dialog open={!!confirmAction && !previewImg} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
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
            <div>• Ministerio: <b>{template.nombreMinisterio}</b></div>
            <div>• Mes: <b>{mes}</b></div>
            <div>• Eventos: <b>{proxEventos.length}</b></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Cancelar</Button>
            <Button onClick={confirmarYDescargar} disabled={generating}>
              {generating ? "Generando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Revisión de imagen antes de descargar ===== */}
      <Dialog open={!!previewImg} onOpenChange={(o) => { if (!o) { setPreviewImg(null); setConfirmAction(null); } }}>
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Vista final de la imagen</DialogTitle>
            <DialogDescription>Revisa que todo se vea correctamente antes de guardar como definitiva.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-muted/30 p-2 border rounded">
            {previewImg && <img src={previewImg} alt="Preview ISO" className="mx-auto max-w-full" />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewImg(null); setConfirmAction(null); }}>
              Volver a editar
            </Button>
            <Button onClick={() => descargarImagenFinal((confirmAction as "png" | "jpg") || "png")}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Guardar como definitiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
