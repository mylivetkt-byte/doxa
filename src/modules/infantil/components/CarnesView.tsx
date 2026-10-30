import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  QrCode, Printer, Shield, User, Shirt, Tag,
  AlertTriangle, CheckCircle2, Layers, Search, ScanLine, LogIn, LogOut
} from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePersonas } from "@/hooks/useDatabase";
import {
  useInfantilAcudientes,
  useInfantilGrupos,
  useInfantilCheckIn,
  useInfantilCheckOut,
  useInfantilAsistencias,
} from "@/hooks/useInfantil";
import { useNinos, matchInfantilGrupoByAge, getSavedInfantilGrupoMap, saveInfantilGrupoForNino } from "../hooks/useNinos";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { QRCodeSVG } from "qrcode.react";
import QrEventoScanner from "@/components/attendance/QrEventoScanner";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type PrintMode = "sticker" | "duo" | "planilla" | "carne";

/**
 * Construye una URL corta y escaneable tanto por cámaras nativas de celular (iOS/Android)
 * como por el lector QR interno del sistema.
 */
export function getInfantilQrValue(nino: any): string {
  const shortId = (nino?.id || "").replace(/-/g, "").slice(0, 8);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin && shortId) {
    return `${origin}/infantil/checkin?c=${shortId}`;
  }
  return nino?.qr_code || nino?.detalles?.qr_codigo || nino?.id || "";
}

/**
 * Extrae el código o identificador del niño desde un texto QR (sea URL con ?c= / ?qr= o ID directo).
 */
export function extractNinoIdentifierFromQr(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes("?c=") || trimmed.includes("?qr=")) {
      const url = new URL(trimmed, typeof window !== "undefined" ? window.location.origin : "https://localhost");
      const param = url.searchParams.get("c") || url.searchParams.get("qr") || url.searchParams.get("code") || url.searchParams.get("nino");
      if (param) return param.trim();
    }
  } catch {}
  return trimmed.replace(/^#/, "").trim();
}

export default function CarnesView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: personas, isLoading: isLoadingPersonas } = usePersonas();
  const { ninos, isLoading: isLoadingNinos } = useNinos();
  const { data: acudientes } = useInfantilAcudientes();
  const { data: grupos } = useInfantilGrupos();
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const { data: asistenciasHoy = [] } = useInfantilAsistencias(todayIso);
  const checkIn = useInfantilCheckIn();
  const checkOut = useInfantilCheckOut();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNinoId, setSelectedNinoId] = useState<string>("");
  const [printMode, setPrintMode] = useState<PrintMode>("sticker");
  const [selectedGrupoFiltro, setSelectedGrupoFiltro] = useState<string>("all");

  // Modal de escáner QR directo para Check-Out desde Stickers & Carnés QR
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualQrCode, setManualQrCode] = useState("");
  const [scannedNinoModal, setScannedNinoModal] = useState<any | null>(null);
  const [recogidoPorId, setRecogidoPorId] = useState<string>("");

  // Opciones de personalización de la etiqueta
  const [mostrarAlergias, setMostrarAlergias] = useState(true);
  const [mostrarTelefono, setMostrarTelefono] = useState(true);
  const [mostrarTalonAcudiente, setMostrarTalonAcudiente] = useState(true);

  useEffect(() => {
    const paramNino = searchParams.get("nino");
    if (paramNino) {
      setSelectedNinoId(paramNino);
    }
  }, [searchParams]);

  const fechaHoy = useMemo(() => {
    try {
      return format(new Date(), "d 'de' MMMM, yyyy", { locale: es });
    } catch {
      return new Date().toLocaleDateString("es-CO");
    }
  }, []);

  // Consolidar lista de niños: preferir personas con tipo 'Niño' o registrados en infantil
  const listaNinos = useMemo(() => {
    if (ninos && ninos.length > 0) {
      return ninos;
    }
    // Fallback con personas si useNinos aún está cargando
    return (personas || []).filter(p => {
      const tipos = Array.isArray(p.tipos_persona) ? p.tipos_persona : [];
      return tipos.includes("Niño");
    });
  }, [ninos, personas]);

  // Resolver grupo infantil de cualquier niño (incluyendo vinculados desde membresía)
  const resolveGrupoForNino = (nino: any) => {
    if (!nino || !grupos || grupos.length === 0) return null;
    const savedMap = getSavedInfantilGrupoMap();
    const savedId = savedMap[nino.id];
    return (
      grupos.find(g => g.id === nino.grupo_id) ||
      (savedId ? grupos.find(g => g.id === savedId) : undefined) ||
      matchInfantilGrupoByAge(nino.fecha_nacimiento, grupos) ||
      grupos[0] ||
      null
    );
  };

  // Si la lista está vacía (ej. nueva instalación), permitir buscar en todas las personas
  const personasDisponibles = useMemo(() => {
    const fuente = listaNinos.length > 0 ? listaNinos : (personas || []);
    if (!searchTerm.trim()) return fuente.slice(0, 30);
    const q = searchTerm.toLowerCase().trim();
    return fuente.filter(p =>
      `${p.nombres ?? ""} ${p.apellidos ?? ""}`.toLowerCase().includes(q) ||
      (p.documento && p.documento.includes(q)) ||
      p.id.replace(/-/g, "").toLowerCase().startsWith(q.replace(/^#/, ""))
    ).slice(0, 40);
  }, [listaNinos, personas, searchTerm]);

  // Niño seleccionado
  const selectedNino = useMemo(() => {
    if (!selectedNinoId) return personasDisponibles[0] || null;
    return (
      (ninos || []).find(n => n.id === selectedNinoId) ||
      (personas || []).find(p => p.id === selectedNinoId) ||
      null
    );
  }, [selectedNinoId, ninos, personas, personasDisponibles]);

  // Acudientes del niño seleccionado
  const acudientesNino = useMemo(() => {
    if (!selectedNino) return [];
    return (acudientes || []).filter(a => a.nino_id === selectedNino.id);
  }, [selectedNino, acudientes]);

  const acudientePrincipal = useMemo(() => {
    return acudientesNino.find(a => a.es_principal) || acudientesNino[0] || null;
  }, [acudientesNino]);

  // Grupo asignado al niño
  const grupoNino = useMemo(() => {
    return resolveGrupoForNino(selectedNino);
  }, [selectedNino, grupos]);

  // Generar código de seguridad corto (ej. #DK-481)
  const getSecurityCode = (id?: string) => {
    if (!id) return "000";
    return id.replace(/-/g, "").slice(0, 4).toUpperCase();
  };

  // Buscar niño al escanear un código QR desde este módulo
  const findNinoByScannedCode = (rawText: string) => {
    const code = extractNinoIdentifierFromQr(rawText).toLowerCase();
    if (!code) return null;
    const cleanHex = code.replace(/-/g, "");
    const pool = [...(ninos || []), ...(personas || [])];

    return (
      pool.find(p =>
        p.id.toLowerCase() === code ||
        (cleanHex.length >= 4 && p.id.replace(/-/g, "").toLowerCase().startsWith(cleanHex)) ||
        (p as any).qr_code?.toLowerCase() === code ||
        (p as any).detalles?.qr_codigo?.toLowerCase() === code ||
        (p.documento && p.documento.toLowerCase() === code)
      ) || null
    );
  };

  const handleQrScannedInCarnes = (rawText: string) => {
    const found = findNinoByScannedCode(rawText);
    if (!found) {
      toast.error("Código QR no encontrado", {
        description: "No se encontró ningún niño asociado a este código QR."
      });
      return;
    }
    setScannerOpen(false);
    setManualQrCode("");
    setSelectedNinoId(found.id);
    setRecogidoPorId("");
    setScannedNinoModal(found);
    toast.success(`✓ Código QR leído para salida: ${found.nombres} ${found.apellidos}`);
  };

  const registrarCheckInAutomatico = async (ninoTarget: any, origen = "Check-in automático al imprimir sticker") => {
    if (!ninoTarget) return;
    const grp = resolveGrupoForNino(ninoTarget);
    if (!grp?.id) return;
    saveInfantilGrupoForNino(ninoTarget.id, grp.id);
    if (ninoTarget.grupo_id !== grp.id) {
      supabase.from("personas").update({ grupo_id: grp.id }).eq("id", ninoTarget.id).then(() => {});
    }
    const rels = (acudientes || []).filter(a => a.nino_id === ninoTarget.id);
    const acu = rels.find(a => a.es_principal) || rels[0] || null;
    try {
      await checkIn.mutateAsync({
        nino_id: ninoTarget.id,
        grupo_id: grp.id,
        entregado_por_id: acu?.acudiente_id || undefined,
        observaciones: origen,
      });
      toast.success(
        `✓ Check-In registrado automáticamente: ${ninoTarget.nombres} ${ninoTarget.apellidos} (${grp.nombre})`
      );
    } catch (err: any) {
      console.warn("Error registrando check-in automático:", err?.message);
    }
  };

  const handleCheckOutFromScan = async (ninoTarget: any) => {
    const asis = (asistenciasHoy || []).find(a => a.nino_id === ninoTarget.id && !a.hora_salida);
    if (!asis) {
      toast.error("Sin entrada activa hoy", {
        description: `${ninoTarget.nombres} no tiene un Check-In activo pendiente de salida.`
      });
      return;
    }
    try {
      await checkOut.mutateAsync({
        asistencia_id: asis.id,
        recogido_por_id: recogidoPorId && recogidoPorId !== "unregistered" ? recogidoPorId : undefined,
      });
      toast.success(`✓ Check-Out (Salida) registrado para ${ninoTarget.nombres} ${ninoTarget.apellidos}`);
      setScannedNinoModal(null);
      setRecogidoPorId("");
    } catch (err: any) {
      toast.error("Error al registrar salida", { description: err?.message });
    }
  };

  const handlePrint = async (mode: PrintMode) => {
    setPrintMode(mode);
    // Al imprimir el sticker individual o el dúo (Niño + Acudiente), registrar automáticamente el Check-In sin necesidad de leer el QR
    if ((mode === "sticker" || mode === "duo") && selectedNino) {
      await registrarCheckInAutomatico(selectedNino, "Check-in automático al imprimir sticker");
    }
    toast.info("Abriendo diálogo de impresión...", {
      description: "El Check-In ya quedó registrado. Selecciona tu impresora de etiquetas."
    });
    setTimeout(() => {
      printEtiquetas10x5cm();
    }, 200);
  };

  // Niños filtrados para la planilla en lote
  const ninosPlanilla = useMemo(() => {
    const fuente = listaNinos.length > 0 ? listaNinos : (personas || []);
    if (selectedGrupoFiltro === "all") return fuente.slice(0, 24);
    return fuente.filter(n => resolveGrupoForNino(n)?.id === selectedGrupoFiltro).slice(0, 24);
  }, [listaNinos, personas, selectedGrupoFiltro, grupos]);

  return (
    <div className="p-4 md:p-8 space-y-8 animate-fade-in bg-slate-50/50 min-h-full">
      {/* CABECERA (Oculta al imprimir) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 print:hidden">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold mb-2">
            <Shirt className="w-3.5 h-3.5" /> Impresión de Etiquetas Adhesivas para Camisetas
          </div>
          <h2 className="text-3xl font-black tracking-tight bg-gradient-to-r from-navy to-blue-600 bg-clip-text text-transparent drop-shadow-sm">
            Stickers y Carnés con Código QR
          </h2>
          <p className="text-slate-500 mt-1 font-medium">
            Imprime adhesivos físicos para pegar en la ropa de los niños y talones de seguridad para padres.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => setScannerOpen(true)}
            className="bg-coral hover:bg-coral/90 text-white rounded-xl h-11 px-4 font-bold shadow-lg shadow-coral/20"
          >
            <ScanLine className="w-4 h-4 mr-2" /> Leer QR para Check-Out (Salida)
          </Button>
          <Button
            onClick={() => handlePrint("sticker")}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-5 font-bold shadow-lg shadow-blue-500/20"
          >
            <Printer className="w-4 h-4 mr-2" /> Imprimir Sticker (Hace Check-In)
          </Button>
          <Button
            onClick={() => handlePrint("planilla")}
            variant="outline"
            className="rounded-xl h-11 px-4 border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
          >
            <Layers className="w-4 h-4 mr-2" /> Planilla en Lote
          </Button>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:hidden">
        {/* PANEL IZQUIERDO: Búsqueda y Selección de Niño (4 columnas) */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="border-0 shadow-lg shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400" /> Seleccionar Niño / Niña
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <Input
                placeholder="Buscar por nombre o documento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 rounded-xl bg-slate-50 border-slate-200 text-sm"
              />

              <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
                {isLoadingPersonas || isLoadingNinos ? (
                  <p className="text-center text-xs text-slate-400 py-6">Cargando lista de niños...</p>
                ) : personasDisponibles.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No se encontraron niños registrados con ese criterio.
                  </div>
                ) : (
                  personasDisponibles.map((p) => {
                    const isSelected = selectedNino?.id === p.id;
                    const tieneAlergia = !!(p.detalles?.alergias || (p as any).alergias);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedNinoId(p.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between ${
                          isSelected
                            ? "bg-navy text-white shadow-md shadow-navy/20"
                            : "hover:bg-slate-100 text-slate-700 bg-slate-50/60"
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-sm truncate leading-tight">
                            {p.nombres} {p.apellidos}
                          </p>
                          <p className={`text-[11px] mt-0.5 truncate ${isSelected ? "text-blue-200" : "text-slate-400"}`}>
                            ID: {getSecurityCode(p.id)} {p.documento ? `· Doc: ${p.documento}` : ""}
                          </p>
                        </div>
                        {tieneAlergia && (
                          <span
                            title="Tiene alergias registradas"
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0"
                          >
                            ⚠️ Alergia
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* OPCIONES DE PERSONALIZACIÓN */}
          <Card className="border-0 shadow-lg shadow-slate-200/50 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-500" /> Personalizar Etiqueta Adhesiva
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="sw-alergias" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Mostrar Alerta Médica / Alergias
                </Label>
                <Switch
                  id="sw-alergias"
                  checked={mostrarAlergias}
                  onCheckedChange={setMostrarAlergias}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sw-tel" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Mostrar Teléfono del Acudiente
                </Label>
                <Switch
                  id="sw-tel"
                  checked={mostrarTelefono}
                  onCheckedChange={setMostrarTelefono}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="sw-talon" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Incluir Talón de Retiro para el Padre
                </Label>
                <Switch
                  id="sw-talon"
                  checked={mostrarTalonAcudiente}
                  onCheckedChange={setMostrarTalonAcudiente}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PANEL DERECHO: VISTA PREVIA Y FORMATOS (8 columnas) */}
        <div className="lg:col-span-8 space-y-6">
          <Tabs value={printMode} onValueChange={(v) => setPrintMode(v as PrintMode)} className="w-full">
            <TabsList className="grid grid-cols-4 bg-slate-200/70 p-1 rounded-2xl h-12">
              <TabsTrigger value="sticker" className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
                <Shirt className="w-3.5 h-3.5" /> Sticker Camiseta
              </TabsTrigger>
              <TabsTrigger value="duo" className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
                <Shield className="w-3.5 h-3.5" /> Niño + Acudiente
              </TabsTrigger>
              <TabsTrigger value="planilla" className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
                <Layers className="w-3.5 h-3.5" /> Planilla Grupo
              </TabsTrigger>
              <TabsTrigger value="carne" className="rounded-xl text-xs font-bold gap-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">
                <QrCode className="w-3.5 h-3.5" /> Carné Tradicional
              </TabsTrigger>
            </TabsList>

            {/* VISTA 1: STICKER INDIVIDUAL DE CAMISETA */}
            <TabsContent value="sticker" className="mt-6">
              {selectedNino ? (
                <div className="flex flex-col items-center">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl mb-4 text-xs text-blue-800 flex items-center gap-2 max-w-md w-full">
                    <Shirt className="w-4 h-4 text-blue-600 shrink-0" />
                    <span><strong>Formato físico (10 cm × 5 cm):</strong> Etiqueta adhesiva de ropa para el niño.</span>
                  </div>

                  {/* Render del Sticker de Camiseta + Etiqueta Padre (ambos 10 cm × 5 cm iguales) */}
                  <div className="printable-single-sticker-wrapper space-y-3 flex flex-col items-center">
                    <ShirtStickerComponent
                      nino={selectedNino}
                      acudiente={acudientePrincipal}
                      grupo={grupoNino}
                      fecha={fechaHoy}
                      mostrarAlergias={mostrarAlergias}
                      mostrarTelefono={mostrarTelefono}
                    />
                    {mostrarTalonAcudiente && (
                      <ParentClaimTagComponent
                        nino={selectedNino}
                        acudiente={acudientePrincipal}
                        grupo={grupoNino}
                        fecha={fechaHoy}
                        mostrarAlergias={mostrarAlergias}
                        mostrarTelefono={mostrarTelefono}
                      />
                    )}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <Button
                      onClick={() => handlePrint("sticker")}
                      size="lg"
                      className="bg-navy hover:bg-navy/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-navy/20 font-bold"
                    >
                      <Printer className="w-5 h-5 mr-2" /> Imprimir Sticker y Hacer Check-In
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
                  <Shirt className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p>Selecciona un niño para generar su sticker adhesivo.</p>
                </div>
              )}
            </TabsContent>

            {/* VISTA 2: DÚO STICKER CAMISETA + TALÓN ACUDIENTE */}
            <TabsContent value="duo" className="mt-6">
              {selectedNino ? (
                <div className="flex flex-col items-center">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl mb-4 text-xs text-amber-900 flex items-center gap-2 max-w-md w-full">
                    <Shield className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>Protocolo de seguridad (10 cm × 5 cm c/u):</strong> 1 etiqueta para la ropa del niño y 1 etiqueta para el padre/acudiente.</span>
                  </div>

                  <div className="printable-duo-wrapper space-y-3">
                    <ShirtStickerComponent
                      nino={selectedNino}
                      acudiente={acudientePrincipal}
                      grupo={grupoNino}
                      fecha={fechaHoy}
                      mostrarAlergias={mostrarAlergias}
                      mostrarTelefono={mostrarTelefono}
                    />
                    {mostrarTalonAcudiente && (
                      <ParentClaimTagComponent
                        nino={selectedNino}
                        acudiente={acudientePrincipal}
                        grupo={grupoNino}
                        fecha={fechaHoy}
                        mostrarAlergias={mostrarAlergias}
                        mostrarTelefono={mostrarTelefono}
                      />
                    )}
                  </div>

                  <div className="mt-6 flex gap-3">
                    <Button
                      onClick={() => handlePrint("duo")}
                      size="lg"
                      className="bg-navy hover:bg-navy/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-navy/20 font-bold"
                    >
                      <Printer className="w-5 h-5 mr-2" /> Imprimir Par y Hacer Check-In
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
                  <Shield className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p>Selecciona un niño para ver el dúo de seguridad.</p>
                </div>
              )}
            </TabsContent>

            {/* VISTA 3: PLANILLA EN LOTE PARA TODO EL GRUPO */}
            <TabsContent value="planilla" className="mt-6">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Filtrar por Grupo:
                    </Label>
                    <Select value={selectedGrupoFiltro} onValueChange={setSelectedGrupoFiltro}>
                      <SelectTrigger className="w-[200px] h-10 rounded-xl bg-slate-50 border-slate-200 font-semibold text-xs">
                        <SelectValue placeholder="Todos los grupos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los grupos ({listaNinos.length})</SelectItem>
                        {(grupos || []).map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={() => handlePrint("planilla")}
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-5 font-bold"
                  >
                    <Printer className="w-4 h-4 mr-2" /> Imprimir Planilla ({ninosPlanilla.length} Stickers)
                  </Button>
                </div>

                {/* Cuadrícula de stickers para impresión en lote */}
                <div className="printable-batch-sheet grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-100 p-4 rounded-2xl border border-slate-200">
                  {ninosPlanilla.map((n) => {
                    const rels = (acudientes || []).filter(a => a.nino_id === n.id);
                    const acu = rels.find(a => a.es_principal) || rels[0] || null;
                    const grp = resolveGrupoForNino(n);
                    return (
                      <div key={n.id} className="batch-sticker-item">
                        <ShirtStickerComponent
                          nino={n}
                          acudiente={acu}
                          grupo={grp}
                          fecha={fechaHoy}
                          mostrarAlergias={mostrarAlergias}
                          mostrarTelefono={mostrarTelefono}
                          compact
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* VISTA 4: CARNÉ TRADICIONAL VERTICAL */}
            <TabsContent value="carne" className="mt-6">
              {selectedNino ? (
                <div className="flex flex-col items-center">
                  <div className="printable-carne-wrapper w-full max-w-sm">
                    <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-slate-100">
                      {/* Cabecera del carné */}
                      <div className="bg-gradient-to-br from-navy to-blue-800 text-white p-6 text-center relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
                        <Shield className="h-8 w-8 mx-auto mb-2 text-blue-200" />
                        <h3 className="font-black tracking-widest uppercase text-sm text-blue-200">DOXA Kids</h3>
                        <p className="text-xs opacity-70">Centro Mundial de Gloria</p>
                      </div>

                      {/* Cuerpo del carné */}
                      <div className="p-6 flex flex-col items-center">
                        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center -mt-16 mb-4 border-4 border-white shadow-md">
                          <User className="h-10 w-10 text-slate-300" />
                        </div>

                        <h2 className="text-2xl font-black text-navy text-center leading-tight mb-1">
                          {selectedNino.nombres}
                          <br />
                          {selectedNino.apellidos}
                        </h2>
                        {grupoNino && (
                          <Badge variant="secondary" className="mt-1 bg-blue-50 text-blue-700 font-bold text-xs">
                            {grupoNino.nombre}
                          </Badge>
                        )}

                        <div className="w-full h-px bg-slate-100 my-4" />

                        {/* QR Code */}
                        <div className="bg-white p-2.5 rounded-xl shadow-inner border border-slate-200 mb-4">
                          <QRCodeSVG
                            value={getInfantilQrValue(selectedNino)}
                            size={156}
                            level="M"
                            includeMargin={true}
                          />
                        </div>

                        <p className="text-[10px] text-slate-400 font-mono tracking-widest mb-4">
                          ID: #{getSecurityCode(selectedNino.id)}
                        </p>

                        {/* Acudientes autorizados */}
                        <div className="w-full space-y-2">
                          {acudientesNino.map((a: any) => (
                            <div key={a.id} className="bg-slate-50 p-2 rounded-lg text-xs flex justify-between items-center border border-slate-100">
                              <div>
                                <p className="font-bold text-navy">{a.acudiente?.nombres} {a.acudiente?.apellidos}</p>
                                <p className="text-slate-500 text-[10px]">{a.relacion}</p>
                              </div>
                              {a.autorizado_recoger && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200 text-[9px] h-5">
                                  Autorizado
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Pie del carné */}
                      <div className="bg-coral p-3 text-center">
                        <p className="text-[10px] text-white font-bold uppercase tracking-wider">Identificación Intransferible</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <Button
                      onClick={() => handlePrint("carne")}
                      className="bg-navy hover:bg-navy/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-navy/20 font-bold"
                    >
                      <Printer className="h-5 w-5 mr-2" /> Imprimir Carné Tradicional
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-3xl">
                  <QrCode className="h-16 w-16 mb-4 text-slate-300 mx-auto" />
                  <p>Selecciona un niño para generar su carné.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* MODAL PARA ESCANEAR / LEER CÓDIGO QR DIRECTAMENTE DESDE STICKERS & CARNÉS */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl overflow-hidden border-0 shadow-2xl print:hidden">
          <div className="h-2 w-full bg-gradient-to-r from-emerald-500 to-blue-600" />
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-xl font-bold text-navy flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-emerald-600" /> Lector de Stickers y Carnés QR
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Apunta la cámara al sticker adhesivo o carné QR, o ingresa el código de 4 caracteres (#{selectedNino ? getSecurityCode(selectedNino.id) : "0548"}).
            </p>
          </DialogHeader>

          <div className="px-6 py-2 space-y-4">
            <div className="rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-md">
              <QrEventoScanner
                onScan={handleQrScannedInCarnes}
                onClose={() => setScannerOpen(false)}
              />
            </div>

            <div className="space-y-1.5 pt-1 border-t border-slate-100">
              <Label className="text-xs font-bold text-slate-600">
                ¿Cámara no disponible? Ingresa el código del sticker (#XXXX) o documento:
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ej. 0548 o número de documento..."
                  value={manualQrCode}
                  onChange={(e) => setManualQrCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && manualQrCode.trim() && handleQrScannedInCarnes(manualQrCode)}
                  className="h-10 rounded-xl text-sm"
                />
                <Button
                  type="button"
                  onClick={() => manualQrCode.trim() && handleQrScannedInCarnes(manualQrCode)}
                  className="bg-navy hover:bg-navy/90 text-white rounded-xl font-bold"
                >
                  Buscar
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-2">
            <Button variant="outline" onClick={() => setScannerOpen(false)} className="rounded-xl w-full">
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RESULTADO AL ESCANEAR UN NIÑO (CHECK-OUT CON LECTURA DE CÓDIGO) */}
      <Dialog open={!!scannedNinoModal} onOpenChange={(open) => !open && setScannedNinoModal(null)}>
        <DialogContent className="sm:max-w-md rounded-3xl overflow-hidden border-0 shadow-2xl print:hidden">
          <div className="h-2 w-full bg-gradient-to-r from-coral to-orange-500" />
          <DialogHeader className="p-6 pb-2 text-center">
            <div className="mx-auto w-12 h-12 bg-coral/15 text-coral rounded-full flex items-center justify-center mb-2">
              <LogOut className="w-6 h-6" />
            </div>
            <DialogTitle className="text-2xl font-black text-navy">
              Confirmar Check-Out (Salida)
            </DialogTitle>
            <p className="text-xs text-slate-500">
              Código QR verificado. Confirma el acudiente que retira al menor.
            </p>
          </DialogHeader>

          {scannedNinoModal && (() => {
            const relsScanned = (acudientes || []).filter(a => a.nino_id === scannedNinoModal.id);
            const asisActiva = (asistenciasHoy || []).find(a => a.nino_id === scannedNinoModal.id && !a.hora_salida);
            return (
              <div className="px-6 py-2 space-y-3">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-navy">
                      {scannedNinoModal.nombres} {scannedNinoModal.apellidos}
                    </h3>
                    <Badge className="bg-blue-100 text-blue-800 border-0 font-mono text-xs">
                      #{getSecurityCode(scannedNinoModal.id)}
                    </Badge>
                  </div>
                  <p className="text-xs font-bold text-slate-600">
                    Grupo: <span className="text-blue-700">{resolveGrupoForNino(scannedNinoModal)?.nombre || "Infantil"}</span>
                  </p>
                  {asisActiva ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">
                      ✓ En Clase hoy (Entrada: {asisActiva.hora_entrada ? format(new Date(asisActiva.hora_entrada), "HH:mm") : "Registrada"})
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">
                      Sin entrada activa hoy
                    </Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Acudiente que retira al menor:
                  </Label>
                  <Select value={recogidoPorId} onValueChange={setRecogidoPorId}>
                    <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 text-xs font-semibold">
                      <SelectValue placeholder="Seleccionar acudiente autorizado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {relsScanned.length === 0 ? (
                        <SelectItem value="unregistered">Acudiente verificado en puerta</SelectItem>
                      ) : (
                        relsScanned.map((a) => (
                          <SelectItem key={a.acudiente_id} value={a.acudiente_id}>
                            {(a.acudiente as any)?.nombres} {(a.acudiente as any)?.apellidos} ({a.relacion}){" "}
                            {a.autorizado_recoger ? "✓ Autorizado" : "⚠️ NO Autorizado"}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  {asisActiva ? (
                    <Button
                      onClick={() => handleCheckOutFromScan(scannedNinoModal)}
                      disabled={checkOut.isPending}
                      className="bg-coral hover:bg-coral/90 text-white rounded-xl h-11 font-bold shadow-md shadow-coral/20"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Autorizar Salida (Check-Out)
                    </Button>
                  ) : (
                    <Button
                      onClick={() => {
                        setScannedNinoModal(null);
                        handlePrint("sticker");
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold"
                    >
                      <Printer className="w-4 h-4 mr-2" /> Imprimir Sticker y Hacer Check-In
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* PORTAL DE IMPRESIÓN DIRECTO AL BODY (Evita desbordamiento y división entre etiquetas) */}
      {typeof document !== "undefined" && createPortal(
        <div id="doxa-thermal-print-area">
          {selectedNino && printMode !== "planilla" && printMode !== "carne" && (
            <>
              <div className="thermal-label-page">
                <ShirtStickerComponent
                  nino={selectedNino}
                  acudiente={acudientePrincipal}
                  grupo={grupoNino}
                  fecha={fechaHoy}
                  mostrarAlergias={mostrarAlergias}
                  mostrarTelefono={mostrarTelefono}
                />
              </div>
              {mostrarTalonAcudiente && (
                <div className="thermal-label-page">
                  <ParentClaimTagComponent
                    nino={selectedNino}
                    acudiente={acudientePrincipal}
                    grupo={grupoNino}
                    fecha={fechaHoy}
                    mostrarAlergias={mostrarAlergias}
                    mostrarTelefono={mostrarTelefono}
                  />
                </div>
              )}
            </>
          )}

          {printMode === "planilla" && (
            ninosPlanilla.map((n) => {
              const rels = (acudientes || []).filter(a => a.nino_id === n.id);
              const acu = rels.find(a => a.es_principal) || rels[0] || null;
              const grp = resolveGrupoForNino(n);
              return (
                <div key={n.id} className="thermal-label-page">
                  <ShirtStickerComponent
                    nino={n}
                    acudiente={acu}
                    grupo={grp}
                    fecha={fechaHoy}
                    mostrarAlergias={mostrarAlergias}
                    mostrarTelefono={mostrarTelefono}
                    compact
                  />
                </div>
              );
            })
          )}
        </div>,
        document.body
      )}

      {/* ESTILOS DE IMPRESIÓN FÍSICA PARA ETIQUETAS ADHESIVAS Y TERMICAS (10 cm × 5 cm) */}
      <style dangerouslySetInnerHTML={{__html: `
        #doxa-thermal-print-area {
          display: none;
        }

        @media print {
          @page {
            size: 100mm 50mm;
            margin: 0mm !important;
          }
          @page :left {
            margin: 0mm !important;
          }
          @page :right {
            margin: 0mm !important;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            width: 100mm !important;
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          /* Ocultar TODO #root, diálogos y portales de UI para evitar saltos o páginas fantasma */
          #root,
          [data-radix-portal],
          [data-radix-focus-guard],
          .radix-dialog-overlay,
          .radix-overlay {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            max-height: 0 !important;
            overflow: hidden !important;
          }
          /* Mostrar únicamente el área de impresión térmica montada directamente en body */
          #doxa-thermal-print-area {
            display: block !important;
            visibility: visible !important;
            position: static !important;
            width: 100mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          /* Cada página de etiqueta física mide exactamente 100mm x 50mm */
          .thermal-label-page {
            width: 100mm !important;
            height: 50mm !important;
            max-width: 100mm !important;
            max-height: 50mm !important;
            min-width: 100mm !important;
            min-height: 50mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 1.5mm 2mm !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #ffffff !important;
          }
          .thermal-label-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .shirt-sticker-box {
            width: 96mm !important;
            min-width: 96mm !important;
            max-width: 96mm !important;
            height: 47mm !important;
            min-height: 47mm !important;
            max-height: 47mm !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            border: 1.5px solid #000000 !important;
            border-radius: 6px !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 4px 6px !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}} />
    </div>
  );
}

// --------------------------------------------------------------------------------
// UTILIDAD DE IMPRESIÓN DIRECTA EN FORMATO EXACTO 10 cm × 5 cm (100 mm × 50 mm)
// Abre directamente el diálogo nativo de impresión del navegador de forma
// confiable e inmediata, sin bloqueos de sandbox ni iframes ocultos.
// --------------------------------------------------------------------------------
export function printEtiquetas10x5cm() {
  const prevTitle = document.title;
  try {
    // Título vacío temporal para que el navegador no imprima el nombre de la página en la cabecera
    document.title = "";
  } catch {}

  try {
    window.print();
  } catch (err) {
    console.error("Error al imprimir etiqueta:", err);
  } finally {
    setTimeout(() => {
      try {
        document.title = prevTitle;
      } catch {}
    }, 1000);
  }
}

// --------------------------------------------------------------------------------
// PLANTILLA BASE UNIFICADA DE ETIQUETA (10 cm × 5 cm)
// Garantiza que la etiqueta del NIÑO y la etiqueta del PADRE sean 100% iguales
// en tamaño (10 cm × 5 cm), distribución, tipografía y código QR.
// --------------------------------------------------------------------------------
function UnifiedLabel10x5cm({
  roleType,
  nino,
  acudiente,
  grupo,
  fecha,
  mostrarAlergias = true,
  mostrarTelefono = true
}: {
  roleType: "nino" | "padre";
  nino: any;
  acudiente?: any;
  grupo?: any;
  fecha: string;
  mostrarAlergias?: boolean;
  mostrarTelefono?: boolean;
}) {
  const securityCode = (nino?.id || "0000").replace(/-/g, "").slice(0, 4).toUpperCase();
  const alergias = nino?.detalles?.alergias || nino?.alergias;
  const telefonoContacto =
    acudiente?.acudiente?.telefono ||
    acudiente?.acudiente?.whatsapp ||
    nino?.detalles?.contacto_emergencia ||
    nino?.telefono;
  const nombreAcudiente = acudiente?.acudiente?.nombres
    ? `${acudiente.acudiente.nombres} ${acudiente.acudiente.apellidos || ""}`.trim()
    : "Padre / Acudiente Autorizado";

  const isNino = roleType === "nino";

  return (
    <div
      style={{
        width: "96mm",
        height: "47mm",
        maxWidth: "96mm",
        maxHeight: "47mm",
        minWidth: "96mm",
        minHeight: "47mm",
        boxSizing: "border-box"
      }}
      className="shirt-sticker-box box-border overflow-hidden bg-white rounded-lg border-2 border-dashed border-slate-400 p-2 shadow-sm relative text-slate-900 font-sans flex items-stretch justify-between gap-2"
    >
      {/* Columna Izquierda: Cabecera + Nombre + Grupo + Alergias + Acudiente */}
      <div className="flex-1 min-w-0 flex flex-col justify-between h-full pr-1 overflow-hidden">
        {/* Cabecera DOXA Kids */}
        <div className="flex items-center justify-between border-b border-slate-300 pb-0.5 shrink-0">
          <div className="flex items-center gap-1 min-w-0">
            <div className="w-3.5 h-3.5 rounded bg-slate-900 flex items-center justify-center text-white font-black text-[8px] shrink-0">
              DK
            </div>
            <div className="truncate flex items-center gap-1">
              <span className="font-black text-[9px] tracking-wider text-slate-950 uppercase">
                DOXA KIDS
              </span>
              <span className="text-[7.5px] font-black uppercase px-1 py-0.2 rounded bg-slate-900 text-white shrink-0">
                {isNino ? "ETIQUETA NIÑO · ROPA" : "ETIQUETA PADRE · RETIRO"}
              </span>
            </div>
          </div>
          <span className="text-[8px] font-bold text-slate-700 shrink-0 ml-1">{fecha}</span>
        </div>

        {/* Nombre del Niño y Grupo (Idéntico en ambas etiquetas) */}
        <div className="my-auto py-0.5 min-w-0">
          <h2 className="text-[15px] font-black uppercase text-slate-950 leading-tight tracking-tight truncate">
            {nino.nombres}
          </h2>
          <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide truncate">
            {nino.apellidos}
          </p>

          <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-slate-100 border border-slate-300 text-slate-900 text-[8.5px] font-black uppercase max-w-full">
            <Tag className="w-2.5 h-2.5 text-slate-800 shrink-0" />
            <span className="truncate">{grupo?.nombre || "Infantil"}</span>
          </div>
        </div>

        {/* Alergia + Contacto Acudiente (Idéntico en ambas etiquetas) */}
        <div className="space-y-0.5 shrink-0">
          {mostrarAlergias && (
            alergias ? (
              <div className="bg-amber-50 border border-amber-400 text-amber-950 px-1 py-0.2 rounded text-[8px] font-black flex items-center gap-1 leading-tight truncate">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                <span className="truncate">ALERGIA: {alergias}</span>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 text-slate-700 px-1 py-0.2 rounded text-[7.5px] font-semibold flex items-center gap-1 leading-tight">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                <span>{isNino ? "Sin alergias registradas" : "Presentar QR para retiro"}</span>
              </div>
            )
          )}

          <div className="pt-0.5 border-t border-slate-300 text-[8px] flex justify-between items-center gap-1 text-slate-800 leading-none">
            <div className="truncate">
              <span className="font-bold text-slate-950">Acudiente: </span>
              <span>{nombreAcudiente}</span>
            </div>
            {mostrarTelefono && telefonoContacto && (
              <span className="font-mono font-bold text-slate-950 whitespace-nowrap shrink-0">
                📞 {telefonoContacto}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Columna Derecha: Código QR + Código de Seguridad */}
      <div className="shrink-0 flex flex-col items-center justify-between pl-1.5 border-l border-dashed border-slate-300 h-full py-0.5">
        <div className="bg-white p-0.5 rounded border border-slate-300 shrink-0">
          <QRCodeSVG
            value={getInfantilQrValue(nino)}
            size={76}
            level="L"
            includeMargin={false}
          />
        </div>
        <span className="text-[9px] font-mono font-black text-slate-950 bg-slate-100 border border-slate-300 px-1 py-0.2 rounded leading-none tracking-wider">
          #{securityCode}
        </span>
        <span className="text-[6.5px] font-black uppercase tracking-widest text-slate-600 leading-none">
          {isNino ? "NIÑO (10×5CM)" : "PADRE (10×5CM)"}
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------
// COMPONENTE: ETIQUETA ADHESIVA DE CAMISETA PARA EL NIÑO (10 cm × 5 cm)
// --------------------------------------------------------------------------------
export function ShirtStickerComponent({
  nino,
  acudiente,
  grupo,
  fecha,
  mostrarAlergias = true,
  mostrarTelefono = true
}: {
  nino: any;
  acudiente?: any;
  grupo?: any;
  fecha: string;
  mostrarAlergias?: boolean;
  mostrarTelefono?: boolean;
  compact?: boolean;
}) {
  return (
    <UnifiedLabel10x5cm
      roleType="nino"
      nino={nino}
      acudiente={acudiente}
      grupo={grupo}
      fecha={fecha}
      mostrarAlergias={mostrarAlergias}
      mostrarTelefono={mostrarTelefono}
    />
  );
}

// --------------------------------------------------------------------------------
// COMPONENTE: ETIQUETA DE RETIRO PARA EL PADRE (10 cm × 5 cm — IGUAL A LA DEL NIÑO)
// --------------------------------------------------------------------------------
export function ParentClaimTagComponent({
  nino,
  acudiente,
  grupo,
  fecha,
  mostrarAlergias = true,
  mostrarTelefono = true
}: {
  nino: any;
  acudiente?: any;
  grupo?: any;
  fecha: string;
  mostrarAlergias?: boolean;
  mostrarTelefono?: boolean;
}) {
  return (
    <UnifiedLabel10x5cm
      roleType="padre"
      nino={nino}
      acudiente={acudiente}
      grupo={grupo}
      fecha={fecha}
      mostrarAlergias={mostrarAlergias}
      mostrarTelefono={mostrarTelefono}
    />
  );
}
