import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatSupabaseError } from "@/lib/supabaseError";
import type { IsoMinisterioTemplate } from "@/lib/isoMinisterioTemplates";
import { findIsoTemplate, isEstacionTextoPorDefecto } from "@/lib/isoMinisterioTemplates";
import { useUpsertIsoTemplate, useDeleteIsoTemplate } from "@/hooks/useIsoTemplates";
import type { ProgMinisterio } from "@/hooks/usePrograma";
import { usePersonas } from "@/hooks/useDatabase";
import SearchableCombobox from "@/components/seminario/SearchableCombobox";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ministerio: ProgMinisterio;
  /** Plantilla efectiva actual (base + override) — usada para precargar el form. */
  template: IsoMinisterioTemplate;
}

export default function IsoTemplateEditorDialog({ open, onOpenChange, ministerio, template }: Props) {
  const upsert = useUpsertIsoTemplate();
  const remove = useDeleteIsoTemplate();
  const { data: personas = [] } = usePersonas();

  const [form, setForm] = useState<IsoMinisterioTemplate>(template);

  useEffect(() => { if (open) setForm(template); }, [open, template]);

  const personaItems = useMemo(
    () => personas.map((p: any) => ({ id: p.id, label: `${p.nombres} ${p.apellidos}`, sub: p.telefono || p.email || "" })),
    [personas]
  );

  const setF = <K extends keyof IsoMinisterioTemplate>(k: K, v: IsoMinisterioTemplate[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setEstacion = (i: number, v: string) => {
    const prev = form.estaciones[i];
    const arr = [...form.estaciones];
    arr[i] = v;
    setF("estaciones", arr);
    if (form.estacionesTexto?.includes(prev)) {
      const updated = (form.estacionesTexto || []).filter((e) => e !== prev);
      setF("estacionesTexto", [...updated, v]);
    }
  };
  const addEstacion = () => setF("estaciones", [...form.estaciones, "Nueva estación"]);
  const delEstacion = (i: number) => {
    const removed = form.estaciones[i];
    setF("estaciones", form.estaciones.filter((_, j) => j !== i));
    if (form.estacionesTexto?.includes(removed)) {
      setF("estacionesTexto", (form.estacionesTexto || []).filter((e) => e !== removed));
    }
  };
  const moveEstacion = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= form.estaciones.length) return;
    const arr = [...form.estaciones]; [arr[i], arr[j]] = [arr[j], arr[i]];
    setF("estaciones", arr);
  };

  const setFirma = (k: keyof IsoMinisterioTemplate["firmas"], field: "nombre" | "cargo", v: string) =>
    setF("firmas", { ...form.firmas, [k]: { ...form.firmas[k], [field]: v } });

  const guardar = async () => {
    try {
      await upsert.mutateAsync({
        ministerio_id: ministerio.id,
        codigo: form.codigo,
        version: form.version,
        fecha_vigencia: form.fechaVigencia,
        titulo: form.titulo,
        estaciones: form.estaciones,
        estaciones_texto: form.estacionesTexto && form.estacionesTexto.length > 0 ? form.estacionesTexto : null,
        importante: form.importante ?? "",
        responsabilidades: form.responsabilidades,
        firmas: form.firmas,
        tipos_evento: form.tiposEvento && form.tiposEvento.length > 0 ? form.tiposEvento : null,
        fecha_inicio: form.fechaInicio || null,
        fecha_fin: form.fechaFin || null,
        fechas_incluidas: form.fechasIncluidas && form.fechasIncluidas.length > 0 ? form.fechasIncluidas.filter(Boolean) : null,
        lider_nombre_manual: form.liderNombreManual?.trim() ? form.liderNombreManual.trim() : null,
      });
      toast.success("Formato ISO guardado");
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No se pudo guardar el formato", { description: formatSupabaseError(e) });
    }
  };

  const restaurar = async () => {
    if (!confirm("¿Restaurar al formato original del sistema? Se perderán los cambios personalizados.")) return;
    try {
      await remove.mutateAsync(ministerio.id);
      const base = findIsoTemplate(ministerio.nombre);
      if (base) setForm(base);
      toast.success("Formato restaurado al original");
    } catch (e: any) {
      toast.error("No se pudo restaurar el formato", { description: formatSupabaseError(e) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar formato ISO — {ministerio.nombre}</DialogTitle>
          <DialogDescription>
            Personaliza el encabezado, las columnas, los textos y las firmas. Los cambios se aplican al PDF y a la vista previa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Encabezado */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Encabezado</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código</Label><Input value={form.codigo} onChange={(e) => setF("codigo", e.target.value)} /></div>
              <div><Label>Versión</Label><Input value={form.version} onChange={(e) => setF("version", e.target.value)} /></div>
              <div><Label>Fecha vigencia</Label><Input value={form.fechaVigencia} onChange={(e) => setF("fechaVigencia", e.target.value)} placeholder="dd/mm/aaaa" /></div>
              <div className="col-span-2"><Label>Título</Label><Input value={form.titulo} onChange={(e) => setF("titulo", e.target.value)} /></div>
            </div>
          </section>

          {/* Líder de Ministerio */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Líder de Ministerio</h4>
            <p className="text-xs text-muted-foreground">
              Puedes escribir el nombre libremente o seleccionar un servidor. Si se deja vacío, se usa el líder configurado en el ministerio.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Input
                placeholder="Nombre del líder (texto libre)"
                value={form.liderNombreManual || ""}
                onChange={(e) => setF("liderNombreManual", e.target.value)}
              />
              <SearchableCombobox
                items={personaItems}
                value={null}
                onChange={(id) => {
                  const p: any = personas.find((x: any) => x.id === id);
                  if (p) setF("liderNombreManual", `${p.nombres} ${p.apellidos}`);
                }}
                placeholder="…o seleccionar persona"
              />
            </div>
          </section>

          {/* Fechas de participación (estricto: sólo estas) */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Fechas de participación</h4>
                <p className="text-xs text-muted-foreground">
                  Solo se mostrarán en el programador las fechas que agregues aquí. Si la lista está vacía, no se cargará ninguna reunión.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setF("fechasIncluidas", [...(form.fechasIncluidas || []), ""])}
              >
                <Plus className="h-3 w-3 mr-1" />Agregar fecha
              </Button>
            </div>
            <div className="space-y-1.5">
              {(form.fechasIncluidas || []).map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={f || ""}
                    onChange={(e) => {
                      const arr = [...(form.fechasIncluidas || [])];
                      arr[i] = e.target.value;
                      setF("fechasIncluidas", arr);
                    }}
                    className="flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    onClick={() => setF("fechasIncluidas", (form.fechasIncluidas || []).filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {(!form.fechasIncluidas || form.fechasIncluidas.length === 0) && (
                <p className="text-xs text-muted-foreground italic">Aún no se han agregado fechas.</p>
              )}
            </div>
          </section>




          {/* Estaciones */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Columnas / Estaciones</h4>
              <Button size="sm" variant="outline" onClick={addEstacion}><Plus className="h-3.5 w-3.5 mr-1" />Agregar</Button>
            </div>
            <div className="space-y-1.5">
              {form.estaciones.map((est, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
                  <Input value={est} onChange={(e) => setEstacion(i, e.target.value)} className="flex-1" />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveEstacion(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveEstacion(i, 1)} disabled={i === form.estaciones.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => delEstacion(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
              {form.estaciones.length === 0 && <p className="text-xs text-muted-foreground">Sin columnas — agrega al menos una.</p>}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Estaciones de texto libre (Digitar)</h4>
                <p className="text-xs text-muted-foreground">
                  Marca las columnas que deben llenarse digitando texto libre en lugar de buscar una persona. Columnas como Texto, Alabanza, Dinámica, Decoración, Objetivo y Refrigerio se configuran automáticamente como texto libre.
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              {form.estaciones.map((est) => {
                const isAutoText = isEstacionTextoPorDefecto(est);
                const selected = (form.estacionesTexto || []).includes(est) || isAutoText;
                return (
                  <button
                    key={est}
                    type="button"
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/80"}`}
                    onClick={() => {
                      const currentlySelected = (form.estacionesTexto || []).includes(est) || isAutoText;
                      let next: string[];
                      if (currentlySelected) {
                        next = (form.estacionesTexto || []).filter((e) => e !== est);
                      } else {
                        next = [...(form.estacionesTexto || []), est];
                      }
                      setF("estacionesTexto", next);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{est}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${selected ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>
                        {selected ? "✓ Digitar (Texto libre)" : "Buscar persona en BD"}
                      </span>
                    </div>
                  </button>
                );
              })}
              {form.estaciones.length === 0 && <p className="text-xs text-muted-foreground italic">Agrega columnas para habilitar las opciones de texto libre.</p>}
            </div>
          </section>

          {/* Textos */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Textos al pie</h4>
            <div><Label>Importante</Label><Textarea rows={3} value={form.importante || ""} onChange={(e) => setF("importante", e.target.value)} /></div>
            <div><Label>Responsabilidades</Label><Textarea rows={4} value={form.responsabilidades} onChange={(e) => setF("responsabilidades", e.target.value)} /></div>
          </section>

          {/* Firmas */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold">Firmas</h4>
            {(["elaboradoPor", "revisadoPor", "autorizadoPor"] as const).map((k) => (
              <div key={k} className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center">
                <span className="text-xs font-medium capitalize">{k.replace("Por", "")}</span>
                <Input placeholder="Nombre" value={form.firmas[k].nombre} onChange={(e) => setFirma(k, "nombre", e.target.value)} />
                <Input placeholder="Cargo" value={form.firmas[k].cargo} onChange={(e) => setFirma(k, "cargo", e.target.value)} />
              </div>
            ))}
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={restaurar} disabled={remove.isPending}>
            <RotateCcw className="h-4 w-4 mr-1" />Restaurar original
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={upsert.isPending}>Guardar formato</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
