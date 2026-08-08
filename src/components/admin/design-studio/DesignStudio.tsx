// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la pantalla
// v4.733.0
//
// Tres paneles: configuración a la izquierda, mesa de trabajo al centro, capas
// y propiedades a la derecha. Es el reparto del Generador de Pendones ampliado,
// y por eso se siente conocido desde el primer minuto.
//
// ── DÓNDE VIVE LA VERDAD ────────────────────────────────────────────
//
// `doc` es el documento y es lo único que se dibuja, se guarda y se exporta.
// El panel izquierdo NO recompila la plantilla en cada cambio: eso borraría
// todo lo que el usuario haya movido. Lo que hace es actualizar las VARIABLES,
// y `applyVariables` repinta sólo los nodos que siguen atados a ellas. Se
// vuelve al servidor únicamente cuando cambia la plantilla o cuando se pide
// otro mensaje: las dos veces el usuario está pidiendo, a propósito, una pieza
// nueva.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Download, Save, Loader2,
    Trash2, Copy, Grid3x3, AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter,
    Sparkles, FolderOpen, FileImage, FileType2, ImageDown, Globe2, ImagePlus,
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from '../content-studio/MediaPicker';
import DesignCanvas from './DesignCanvas';
import DesignSidebar from './DesignSidebar';
import DesignInspector from './DesignInspector';
import PublishDialog from './PublishDialog';
import CompositionPanel from './CompositionPanel';
import {
    fetchCatalog, compose, listDesigns, createDesign, updateDesign, deleteDesign, uploadToLibrary,
    type Catalog, type ClubHit, type Branding, type DesignCopy, type SavedDesign, type ElementItem,
    type Composition,
} from './designApi';
import {
    formatOf, applyVariables, resolveVariables, duplicateNode, uid, isText, isImage,
    HISTORY_STEPS, PALETTE,
    type DesignDocument, type DesignNode, type TextNode, type ImageNode,
} from '../../../lib/designSpec';
import { newField, type LinkedField } from '../../../lib/designFields';
import { withBase, withBackdrop, withoutBackdrop, hasBackdrop } from '../../../lib/designCompose';
import { exportDocument, exportToFile, thumbnail, type ExportFormat } from '../../../lib/designRender';

const EMPTY_DOC: DesignDocument = { format: 'post_1_1', background: PALETTE.white, nodes: [] };

const DesignStudio: React.FC = () => {
    // ── Estado. TODOS los hooks van arriba, antes de cualquier return:
    //    React identifica cada hook por su ORDEN de llamada y un return
    //    temprano en medio tumba el árbol entero (regla del sitio, v4.689).
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [templateId, setTemplateId] = useState('aniversario_foto');
    const [club, setClub] = useState<ClubHit | null>(null);
    const [branding, setBranding] = useState<Branding | null>(null);
    const [years, setYears] = useState('');
    const [message, setMessage] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [copy, setCopy] = useState<DesignCopy | null>(null);
    const [missing, setMissing] = useState<string[]>([]);

    const [doc, setDoc] = useState<DesignDocument>(EMPTY_DOC);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [zoom, setZoom] = useState(0.5);
    const [showGuides, setShowGuides] = useState(true);

    const [past, setPast] = useState<DesignDocument[]>([]);
    const [future, setFuture] = useState<DesignDocument[]>([]);

    const [generating, setGenerating] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    // A QUÉ se le está poniendo la imagen. Un solo `MediaPicker` por pantalla y
    // un campo que dice dónde va lo elegido — es el `pickerField` que pide la
    // regla de v4.700, no un selector por casilla.
    const [pickerTarget, setPickerTarget] = useState<'foto' | 'capa' | 'base' | string | null>(null);
    const [saved, setSaved] = useState<SavedDesign[]>([]);
    const [showSaved, setShowSaved] = useState(false);
    const [currentId, setCurrentId] = useState<string | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    // El enlace público de este diseño, si lo tiene. Guardar lo actualiza, y la
    // barra lo muestra: un enlace que se refresca en silencio confunde tanto
    // como uno que se queda viejo.
    const [publicUrl, setPublicUrl] = useState<string | null>(null);
    // La composición con IA sale de la plantilla elegida y el administrador la
    // ajusta acá. Se guarda con el diseño y viaja a la publicación.
    const [composition, setComposition] = useState<Composition>({
        enabled: false, baseImageUrl: null, masterPrompt: '', variants: 1, publicVariants: 1, style: 'institucional',
    });

    const viewportRef = useRef<HTMLDivElement>(null);

    // ── Carga inicial ──────────────────────────────────────────────
    useEffect(() => {
        fetchCatalog()
            .then(setCatalog)
            .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo cargar el catálogo'));
        listDesigns().then(setSaved).catch(() => { /* el listado es secundario */ });
    }, []);

    // ── Historial ──────────────────────────────────────────────────
    // Un paso por ACCIÓN, no por píxel: el arrastre sólo confirma al soltar
    // (`commit`), o deshacer una vez retrocedería un píxel.
    const commit = useCallback((next: DesignDocument) => {
        setPast(p => [...p.slice(-(HISTORY_STEPS - 1)), doc]);
        setFuture([]);
        setDoc(next);
    }, [doc]);

    const undo = useCallback(() => {
        setPast(p => {
            if (!p.length) return p;
            const prev = p[p.length - 1];
            setFuture(f => [doc, ...f].slice(0, HISTORY_STEPS));
            setDoc(prev);
            return p.slice(0, -1);
        });
    }, [doc]);

    const redo = useCallback(() => {
        setFuture(f => {
            if (!f.length) return f;
            setPast(p => [...p, doc]);
            setDoc(f[0]);
            return f.slice(1);
        });
    }, [doc]);

    // ── Mutaciones ─────────────────────────────────────────────────
    const setNodes = useCallback((nodes: DesignNode[], doCommit: boolean) => {
        if (doCommit) commit({ ...doc, nodes });
        else setDoc(d => ({ ...d, nodes }));
    }, [commit, doc]);

    const patchNode = useCallback((id: string, patch: Partial<DesignNode>) => {
        commit({
            ...doc,
            nodes: doc.nodes.map(n => {
                if (n.id !== id) return n;
                // Editar el texto a mano lo DESLIGA de su variable: a partir de
                // ahí, cambiar «los años» en el panel ya no lo pisa. Sin esta
                // regla, el usuario corrige el título y el siguiente cambio de
                // variable se lo borra sin avisar.
                // Y con la variable se va su declaración: sin marcador, ningún
                // campo del formulario consume ya este nodo, y dejar la
                // configuración colgando daría un campo declarado que no pinta
                // nada. Para cambiar lo que se ve sin perder el campo está el
                // «valor por defecto».
                const unlink = isText(n) && 'text' in patch ? { srcText: null, field: null } : {};
                return { ...n, ...patch, ...unlink } as DesignNode;
            }),
        });
    }, [commit, doc]);

    const removeNode = useCallback((id: string) => {
        commit({ ...doc, nodes: doc.nodes.filter(n => n.id !== id) });
        setSelectedIds(s => s.filter(i => i !== id));
    }, [commit, doc]);

    const duplicate = useCallback((id: string) => {
        const n = doc.nodes.find(x => x.id === id);
        if (!n) return;
        const clone = duplicateNode(n);
        commit({ ...doc, nodes: [...doc.nodes, clone] });
        setSelectedIds([clone.id]);
    }, [commit, doc]);

    const reorder = useCallback((id: string, dir: -1 | 1) => {
        const i = doc.nodes.findIndex(n => n.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= doc.nodes.length) return;
        const nodes = [...doc.nodes];
        [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
        commit({ ...doc, nodes });
    }, [commit, doc]);

    // Al fondo o al frente de una vez. Con la plantilla clásica —doce capas—,
    // poner una imagen de fondo con las flechas de a un paso son doce clics.
    const sendTo = useCallback((id: string, where: 'back' | 'front') => {
        const n = doc.nodes.find(x => x.id === id);
        if (!n) return;
        const resto = doc.nodes.filter(x => x.id !== id);
        commit({ ...doc, nodes: where === 'back' ? [n, ...resto] : [...resto, n] });
    }, [commit, doc]);

    const alignSelection = useCallback((axis: 'x' | 'y') => {
        if (!selectedIds.length) return;
        commit({
            ...doc,
            nodes: doc.nodes.map(n => selectedIds.includes(n.id) && !n.locked
                ? (axis === 'x' ? { ...n, x: 0.5 - n.w / 2 } : { ...n, y: 0.5 - n.h / 2 })
                : n),
        });
    }, [commit, doc, selectedIds]);

    const addText = useCallback(() => {
        const node: TextNode = {
            id: uid('text'), type: 'text', name: 'Texto nuevo',
            x: 0.15, y: 0.45, w: 0.7, h: 0.1, rotation: 0, opacity: 1,
            text: 'Escribí acá', srcText: null,
            fontSize: 0.04, fontFamily: 'sans', fontWeight: 700, color: PALETTE.royal,
            align: 'center', valign: 'middle', lineHeight: 1.2, letterSpacing: 0,
            italic: false, uppercase: false, autoFit: true, minFontSize: 0.018,
        };
        commit({ ...doc, nodes: [...doc.nodes, node] });
        setSelectedIds([node.id]);
    }, [commit, doc]);

    // Una imagen suelta como CAPA. Es distinto de la fotografía de la
    // plantilla: aquélla llena un recuadro que la plantilla ya definió; ésta la
    // agrega el usuario donde quiere, la coloca y la BLOQUEA para que no se le
    // mueva mientras edita el resto. Nace sin `srcVar`, así que ninguna variable
    // la pisa.
    const addImageNode = useCallback((url: string) => {
        const node: DesignNode = {
            id: uid('img'), type: 'image', name: 'Imagen',
            x: 0.28, y: 0.30, w: 0.44, h: 0.44,
            rotation: 0, opacity: 1,
            src: url, srcVar: null, fit: 'contain', radius: 0,
        } as DesignNode;
        // Si el documento está vacío, la imagen sola no da una pieza: se crea un
        // lienzo mínimo para que haya dónde ponerla.
        commit(doc.nodes.length ? { ...doc, nodes: [...doc.nodes, node] } : { ...doc, nodes: [node] });
        setSelectedIds([node.id]);
        toast.success('Imagen agregada como capa. Podés colocarla y bloquearla desde Propiedades.');
    }, [commit, doc]);

    const addElement = useCallback((el: ElementItem) => {
        const size = 0.22;
        const node: DesignNode = {
            id: uid(el.id), type: el.path ? 'icon' : 'shape', name: el.label,
            x: 0.5 - size / 2, y: 0.5 - size / (el.ratio || 1) / 2,
            w: size, h: size / (el.ratio || 1),
            rotation: 0, opacity: 1,
            shape: el.shape || 'rect', path: el.path || null,
            fill: el.defaultFill, radius: 0, stroke: null, strokeWidth: 0,
        } as DesignNode;
        commit({ ...doc, nodes: [...doc.nodes, node] });
        setSelectedIds([node.id]);
    }, [commit, doc]);

    // ── Variables en vivo ──────────────────────────────────────────
    // El panel izquierdo escribe variables; esto las aplica a los nodos que
    // siguen atados a ellas, y a ninguno más.
    const liveVars = useMemo(() => ({
        anios: years,
        mensaje: message,
        imagen: photo || '',
        club: branding?.clubName || '',
        ciudad: branding?.city || '',
        distrito: branding?.district || '',
        gobernador: branding?.governor || '',
        presidente: branding?.president || '',
        periodo: branding?.period || '',
        logo: branding?.logo || '',
    }), [years, message, photo, branding]);

    useEffect(() => {
        setDoc(d => {
            if (!d.nodes.length) return d;
            const nodes = applyVariables(d.nodes, liveVars);
            return nodes === d.nodes || nodes.every((n, i) => n === d.nodes[i]) ? d : { ...d, nodes };
        });
    }, [liveVars]);

    // ── Componer ───────────────────────────────────────────────────
    // Marcar un elemento como campo del formulario público. Es lo que faltaba:
    // hasta v4.722 las variables sólo existían si el diseño venía de una
    // plantilla del catálogo, así que un texto agregado a mano nunca podía ser
    // editable y —peor— corregir a mano el texto de una plantilla lo
    // desvinculaba y lo sacaba del formulario sin avisar.
    //
    // Un texto marcado pasa a SER esa variable (`{{mensaje}}`), que es
    // exactamente cómo lo declaran las plantillas del catálogo: así reutiliza
    // toda la maquinaria que ya existe —`applyVariables`, `bakeFrozen`,
    // `buildPublicFields`— sin inventar un segundo concepto.
    //
    // Va DESPUÉS de `liveVars` a propósito: está en su array de dependencias y
    // ese array se evalúa al renderizar, así que declararlo antes da un
    // ReferenceError de zona muerta — pantalla en blanco, no un aviso. Es el
    // mismo tropiezo que `uploadImage` con `runCompose` en v4.720.1.
    const setPublicKey = useCallback((id: string, key: string | null) => {
        commit({
            ...doc,
            nodes: doc.nodes.map(n => {
                if (n.id !== id) return n;
                // La declaración nace con la clave y muere con ella: un nodo sin
                // campo no puede llevar la configuración de un campo, o al
                // volver a marcarlo aparecería la de la vez anterior.
                const field = key ? (n.field || newField(key, isImage(n) ? 'image' : 'text')) : null;
                if (isImage(n)) return { ...n, srcVar: key, field } as DesignNode;
                if (!isText(n)) return n;
                if (!key) return { ...n, srcText: null, field: null } as DesignNode;
                const srcText = `{{${key}}}`;
                // Se resuelve en el acto con lo que ya hay cargado, para que el
                // lienzo no quede en blanco al marcarlo.
                const text = resolveVariables(srcText, liveVars) || n.text;
                return { ...n, srcText, text, field } as DesignNode;
            }),
        });
    }, [commit, doc, liveVars]);

    // La CONFIGURACIÓN del campo, no su clave. Cambiar la clase reinicia las
    // reglas de la imagen: las de un logotipo y las de una fotografía son
    // opuestas —una no recorta y conserva transparencia, la otra recorta al
    // encuadre— y arrastrar las anteriores dejaría un campo que dice una cosa y
    // hace otra.
    const setNodeField = useCallback((id: string, p: Partial<LinkedField>) => {
        commit({
            ...doc,
            nodes: doc.nodes.map(n => {
                if (n.id !== id || !n.field) return n;
                const kindChanged = p.kind && p.kind !== n.field.kind;
                const base = kindChanged
                    ? { ...n.field, ...newField(p.kind as string, isImage(n) ? 'image' : 'text'), label: n.field.label, help: n.field.help, required: n.field.required, visible: n.field.visible, defaultValue: n.field.defaultValue }
                    : n.field;
                return { ...n, field: { ...base, ...p } } as DesignNode;
            }),
        });
    }, [commit, doc]);

    const runCompose = useCallback(async (opts: { skipAI: boolean; tpl?: string }) => {
        setGenerating(true);
        try {
            const r = await compose({
                templateId: opts.tpl || templateId,
                subjectClubId: club?.id || null,
                skipAI: opts.skipAI,
                overrides: {
                    ...(years ? { anios: years } : {}),
                    ...(opts.skipAI && message ? { mensaje: message } : {}),
                    ...(photo ? { imagen: photo } : {}),
                },
            });
            setDoc(r.document);
            setPast([]); setFuture([]);
            setSelectedIds([]);
            setMissing(r.missing);
            if (r.branding && 'clubName' in r.branding) setBranding(r.branding as Branding);
            if (!opts.skipAI) {
                setCopy(r.copy);
                setMessage(r.copy?.mensaje || '');
                if (r.copy?.degraded) toast.warning(r.copy.note || 'El texto se escribió sin modelo de lenguaje.');
                else toast.success('Diseño generado.');
            }
            if (r.variables?.anios && !years) setYears(r.variables.anios);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo componer el diseño');
        } finally {
            setGenerating(false);
        }
    }, [templateId, club, years, message, photo]);

    // Subir un archivo del disco. Va por `/api/media/upload`, que es el camino
    // que YA registra en la Biblioteca Multimedia: así la imagen queda guardada
    // y reutilizable, en vez de vivir sólo dentro de esta pieza — que era
    // justamente el retroceso que había que evitar.
    //
    // Va DESPUÉS de `runCompose` a propósito: al estar en su array de
    // dependencias, ponerlo antes daría un ReferenceError de zona muerta al
    // renderizar, y eso es una pantalla en blanco, no un aviso.
    const uploadImage = useCallback(async (file: File | undefined, target: 'foto' | 'capa' | 'base' | 'logo') => {
        if (!file) return;
        if (!file.type.startsWith('image/')) { toast.error('Ese archivo no es una imagen.'); return; }
        setUploading(true);
        try {
            const { url } = await uploadToLibrary(file, club?.id || null);
            if (target === 'capa') { addImageNode(url); return; }
            if (target === 'base') { setComposition(c => ({ ...c, baseImageUrl: url })); toast.success('Imagen base cargada.'); return; }
            if (target === 'logo') {
                // El nodo se busca acá adentro y no con `logoNode`, que se
                // declara más abajo: referenciarlo en el array de dependencias
                // daría un ReferenceError de zona muerta al renderizar, y eso es
                // una pantalla en blanco, no un aviso (regla del sitio).
                const n = doc.nodes.find(x => isImage(x) && (x.srcVar === 'logo' || x.role === 'logo'));
                if (!n) { toast.error('Este diseño no tiene un espacio para el logotipo.'); return; }
                // NO se toca `srcVar`: poner el logotipo de ejemplo no es
                // desvincular el campo del portal público.
                patchNode(n.id, { src: url } as Partial<DesignNode>);
                toast.success('Logotipo cargado y guardado en la Biblioteca.');
                return;
            }
            setPhoto(url);
            const hasPhotoNode = doc.nodes.some(n => isImage(n) && (n.srcVar === 'imagen' || n.role === 'foto'));
            if (doc.nodes.length && !hasPhotoNode) runCompose({ skipAI: true });
            toast.success('Imagen subida y guardada en la Biblioteca.');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen');
        } finally {
            setUploading(false);
        }
    }, [club, doc.nodes, runCompose, addImageNode, patchNode]);

    // Cambiar de plantilla RECOMPONE, y eso descarta lo que se haya movido a
    // mano — es inevitable: el layout es otro. Se conserva lo que sí se puede
    // conservar (mensaje, foto, años), que es lo que costó trabajo.
    const changeTemplate = useCallback((id: string) => {
        setTemplateId(id);
        // Cada plantilla trae su propia configuración de composición. Se adopta
        // al elegirla, no se arrastra la de la anterior: el prompt maestro de
        // una plantilla no describe a otra.
        const c = catalog?.templates?.find(t => t.id === id)?.composition;
        if (c) setComposition(c);
        if (doc.nodes.length) runCompose({ skipAI: true, tpl: id });
    }, [doc.nodes.length, runCompose, catalog]);

    // ── Fondo generado por IA ──────────────────────────────────────
    // El criterio —dónde entra el fondo, qué apaga, cómo se quita— vive en
    // `src/lib/designCompose.ts`, espejo del servidor. Hasta v4.731 estaba
    // escrito a mano acá, y el portal público iba a necesitar exactamente lo
    // mismo: dos copias que se separan en silencio.
    const applyBackdrop = useCallback((url: string) => {
        commit(withBackdrop(doc, url));
        setSelectedIds([]);
        toast.success('Fondo aplicado. El texto se sigue dibujando encima, nítido.');
    }, [commit, doc]);

    const removeBackdrop = useCallback(() => commit(withoutBackdrop(doc)), [commit, doc]);

    const hayBackdrop = useMemo(() => hasBackdrop(doc), [doc]);

    // ── El lienzo institucional ────────────────────────────────────
    //
    // La imagen base se elegía en el panel de Composición y no se veía en
    // ninguna parte: era sólo un dato que viajaba al modelo. El administrador
    // colocaba el texto y el logotipo a ciegas respecto del fondo sobre el que
    // iban a quedar, y la pieza salía sin ese fondo. Ahora entra como nodo al
    // pie de la pila, así que se dibuja, se exporta y se publica con el resto.
    //
    // Es un EFECTO y no un envoltorio del setter a propósito: la imagen base se
    // cambia desde cuatro sitios —subir, elegir de la Biblioteca, quitarla, y
    // cambiar de plantilla, que trae la suya—. Sincronizar en cada uno deja al
    // quinto sin hacerlo, y el fallo es mudo: el panel muestra la imagen y la
    // pieza sigue en blanco.
    useEffect(() => {
        setDoc(d => {
            if (!d.nodes.length) return d;
            const actual = d.nodes.find(n => n.role === 'lienzo');
            const puesta = actual && isImage(actual) ? actual.src : null;
            if ((puesta || null) === (composition.baseImageUrl || null)) return d;
            return withBase(d, composition.baseImageUrl);
        });
    }, [composition.baseImageUrl]);

    // ── La Cabecera ────────────────────────────────────────────────
    //
    // El nodo del logotipo se busca por su CLAVE (`srcVar === 'logo'`), que es
    // lo que lo ata al campo del portal público, y sólo después por `role` —el
    // respaldo para los diseños guardados antes de que la clave viajara ahí—.
    // Al revés se elegiría un nodo decorativo con el rol puesto y el panel
    // editaría un recuadro que nadie llena.
    const logoNode = useMemo(
        () => (doc.nodes.find(n => isImage(n) && n.srcVar === 'logo')
            || doc.nodes.find(n => isImage(n) && n.role === 'logo')
            || null) as ImageNode | null,
        [doc.nodes]
    );

    // Crear el hueco en un diseño que no lo tiene. Nace YA marcado como campo
    // del portal —con su recuadro de referencia—, porque un hueco de logotipo
    // que no es campo no lo puede llenar nadie: es exactamente el defecto que
    // dejó al portal de aniversarios sin la mitad de su formulario.
    const addLogoNode = useCallback(() => {
        const box = { x: 0.068, y: 0.055, w: 0.28, h: 0.096 };
        const field = newField('logo', 'image');
        const node: DesignNode = {
            id: uid('logo'), type: 'image', name: 'Logotipo del club', role: 'logo',
            src: branding?.logo || null, srcVar: 'logo', fit: 'contain', radius: 0,
            dropIfEmpty: true, rotation: 0, opacity: 1, ...box,
            field: { ...field, image: { ...field.image!, frame: box } },
        } as DesignNode;
        commit({ ...doc, nodes: [...doc.nodes, node] });
        setSelectedIds([node.id]);
        toast.success('Listo. Colocalo y ajustá su tamaño; quien use el enlace público sube el suyo ahí.');
    }, [commit, doc, branding]);

    // ── El hueco de la FOTOGRAFÍA ──────────────────────────────────
    //
    // Mismo caso que el logotipo, y con la misma consecuencia: un diseño sin
    // hueco para la fotografía no la pide en el formulario público, y desde el
    // panel no hay forma de darse cuenta —el administrador ve su pieza completa
    // y el visitante ve un formulario al que le falta la mitad—.
    //
    // Pasa sobre todo con los diseños hechos antes de v4.722.3: el compilador
    // borraba el hueco cuyo valor no se podía resolver, y el club con el que se
    // diseñaba casi nunca tenía una fotografía cargada. El logotipo sobrevivía
    // —el club sí tiene escudo— y la fotografía no. Recompilar la plantilla se
    // llevaría por delante todo lo que el usuario haya movido, así que lo que
    // se ofrece es agregar el hueco que falta.
    const photoNode = useMemo(
        () => doc.nodes.find(n => isImage(n) && (n.srcVar === 'imagen' || n.role === 'foto')) || null,
        [doc.nodes]
    );

    const addPhotoNode = useCallback(() => {
        const box = { x: 0, y: 0, w: 1, h: 0.47 };
        const field = newField('imagen', 'image');
        const node: DesignNode = {
            id: uid('foto'), type: 'image', name: 'Fotografía del club', role: 'foto',
            src: photo || null, srcVar: 'imagen', fit: 'cover', radius: 0,
            rotation: 0, opacity: 1, ...box,
            field: { ...field, kind: 'foto', label: 'Fotografía del club' },
        } as DesignNode;
        // Al principio de la lista: la fotografía va DEBAJO del texto y del
        // logotipo, o los taparía. Después del lienzo, que es el fondo de todo.
        const i = doc.nodes.findIndex(n => n.role !== 'lienzo');
        const at = i === -1 ? doc.nodes.length : i;
        commit({ ...doc, nodes: [...doc.nodes.slice(0, at), node, ...doc.nodes.slice(at)] });
        setSelectedIds([node.id]);
        toast.success('Listo. Colocalo y ajustá su tamaño; quien use el enlace público sube la suya ahí.');
    }, [commit, doc, photo]);

    // ── Teclado ────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            // Dentro de un campo de texto los atajos son del campo, no del
            // lienzo: Ctrl+Z tiene que deshacer lo que se está escribiendo.
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

            const mod = e.metaKey || e.ctrlKey;
            if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
            if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
            if (mod && e.key.toLowerCase() === 'd' && selectedIds.length === 1) { e.preventDefault(); duplicate(selectedIds[0]); return; }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
                e.preventDefault();
                commit({ ...doc, nodes: doc.nodes.filter(n => !selectedIds.includes(n.id) || n.locked) });
                setSelectedIds([]);
                return;
            }
            if (e.key === 'Escape') { setSelectedIds([]); return; }
            if (e.key.startsWith('Arrow') && selectedIds.length) {
                e.preventDefault();
                const step = e.shiftKey ? 0.02 : 0.002;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                commit({
                    ...doc,
                    nodes: doc.nodes.map(n => selectedIds.includes(n.id) && !n.locked ? { ...n, x: n.x + dx, y: n.y + dy } : n),
                });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [undo, redo, duplicate, commit, doc, selectedIds]);

    // Zoom "ajustar": el lienzo entero visible con un respiro alrededor.
    const fitZoom = useCallback(() => {
        const el = viewportRef.current;
        if (!el) return;
        const fmt = formatOf(doc.format);
        setZoom(Math.min((el.clientWidth - 64) / fmt.width, (el.clientHeight - 64) / fmt.height, 1));
    }, [doc.format]);

    useEffect(() => { fitZoom(); }, [fitZoom]);

    // ── Exportar y guardar ─────────────────────────────────────────
    const title = useMemo(
        // `?.` en CADA eslabón. El `?.` sólo en `catalog` cortaba si la respuesta
        // llegaba sin `templates` —una versión anterior de la API, un error
        // devuelto como objeto— y entonces el `.find` reventaba el árbol entero:
        // panel en blanco, no un aviso. Es la misma clase de fallo que
        // `ClipboardList` en `AdminLayout.tsx`.
        () => `${catalog?.templates?.find(t => t.id === templateId)?.name || 'Diseño'}${club ? ` · ${club.name}` : ''}`,
        [catalog, templateId, club]
    );

    // La vía explícita a la Biblioteca Multimedia. La fila de `Media` ES el
    // archivo; la ficha editable vive en `DesignProject`. Se pide a propósito,
    // no sale de guardar.
    const sendToLibrary = async () => {
        setExportOpen(false);
        setExporting(true);
        try {
            const file = await exportToFile(doc, title);
            await uploadToLibrary(file, club?.id || null);
            toast.success('La pieza quedó en la Biblioteca Multimedia.');
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo guardar en la Biblioteca'); }
        finally { setExporting(false); }
    };

    const doExport = async (format: ExportFormat) => {
        setExportOpen(false);
        setExporting(true);
        try { await exportDocument(doc, { format, title }); toast.success(`Descargado en ${format.toUpperCase()}.`); }
        catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo exportar'); }
        finally { setExporting(false); }
    };

    // ── GUARDAR ES GUARDAR LA CONFIGURACIÓN, NO PRODUCIR UN ARCHIVO ──
    //
    // Hasta v4.730 cada guardado exportaba la pieza a 2160 px y la subía a la
    // Biblioteca Multimedia. Estaba mal por dos motivos, y el segundo es el de
    // fondo:
    //
    //   · Ensuciaba la Biblioteca. Guardar es un gesto que se repite cada dos
    //     minutos mientras se ajusta un diseño, así que un solo trabajo dejaba
    //     decenas de PNG casi idénticos mezclados con las fotos reales de los
    //     clubes. Se reportó con la Biblioteca en más de 3.000 imágenes.
    //   · Lo que se está editando acá es la CONFIGURACIÓN de una plantilla, no
    //     una pieza terminada. Las piezas las genera cada club desde el portal
    //     público, con SUS datos; la del administrador es una vista previa con
    //     valores de ejemplo. Convertirla en un archivo la presenta como algo
    //     que no es.
    //
    // Lo único que produce guardar es la MINIATURA del listado, y vive en la
    // ficha (`DesignProject.thumbUrl`), no en `Media`: es de 360 px y sólo
    // existe para que «Mis diseños» no sea una fila de recuadros vacíos.
    //
    // Mandar la pieza a la Biblioteca sigue siendo posible — está en el menú de
    // Descargar— pero es una decisión explícita, no un efecto secundario.
    const save = async () => {
        if (!doc.nodes.length) { toast.warning('Todavía no hay nada que guardar.'); return; }
        setSaving(true);
        try {
            // Una miniatura fallida no puede impedir guardar: lo que se pidió
            // fue guardar el diseño, y la vista previa es lo secundario.
            const thumbUrl = await thumbnail(doc).catch(() => null);
            const body = {
                title, templateId, category: 'aniversario',
                document: doc, variables: liveVars, branding: branding || {}, copy: copy || {},
                subjectClubId: club?.id || null, thumbUrl,
                composition,
            };
            const row = currentId ? await updateDesign(currentId, body) : await createDesign(body);
            setCurrentId(row.id);
            setSaved(await listDesigns());
            // El servidor refresca la publicación atada a este diseño y devuelve
            // cuál es. Se DICE: el usuario acaba de cambiar lo que ve cualquiera
            // que tenga el enlace.
            if (row.publication?.url) {
                setPublicUrl(row.publication.url);
                toast.success('Guardado. El enlace público ya muestra estos cambios.');
            } else {
                setPublicUrl(null);
                toast.success('Diseño guardado.');
                // Cuando el servidor sabe POR QUÉ no tocó ningún enlace, se
                // dice. Callarlo deja al usuario mirando un sitio público que
                // no cambia, sin nada que explique la diferencia.
                if (row.publicationNote) toast.warning(row.publicationNote, { duration: 8000 });
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
        } finally {
            setSaving(false);
        }
    };

    const openSaved = (d: SavedDesign) => {
        setDoc(d.document); setTemplateId(d.templateId); setCurrentId(d.id);
        setMessage(d.variables?.mensaje || ''); setYears(d.variables?.anios || '');
        setPhoto(d.variables?.imagen || null); setCopy(d.copy || null);
        setPast([]); setFuture([]); setSelectedIds([]); setShowSaved(false);
        // Si ese diseño ya tiene enlace, la barra lo muestra desde el primer
        // momento: es lo que explica por qué guardar va a cambiar el enlace.
        setPublicUrl(d.publication?.url || null);
        toast.success('Diseño abierto.');
    };

    const removeSaved = async (id: string) => {
        try {
            await deleteDesign(id);
            setSaved(s => s.filter(d => d.id !== id));
            if (currentId === id) setCurrentId(null);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo eliminar'); }
    };

    const fmt = formatOf(doc.format);
    const btn = 'p-2 rounded-lg hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors';

    return (
        <div className="flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 260px)', minHeight: 620 }}>
            {/* ── Barra de herramientas ────────────────────────────── */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
                <button className={btn} onClick={undo} disabled={!past.length} title="Deshacer (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
                <button className={btn} onClick={redo} disabled={!future.length} title="Rehacer (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button className={btn} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} title="Alejar"><ZoomOut className="w-4 h-4" /></button>
                <span className="text-xs font-bold text-gray-500 w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button className={btn} onClick={() => setZoom(z => Math.min(3, z + 0.1))} title="Acercar"><ZoomIn className="w-4 h-4" /></button>
                <button className={btn} onClick={fitZoom} title="Ajustar a la ventana"><Maximize2 className="w-4 h-4" /></button>
                <button className={`${btn} ${showGuides ? 'bg-indigo-50 text-indigo-600' : ''}`} onClick={() => setShowGuides(g => !g)} title="Guías, márgenes y área segura"><Grid3x3 className="w-4 h-4" /></button>
                <span className="w-px h-5 bg-gray-200 mx-1" />
                <button className={btn} onClick={() => alignSelection('x')} disabled={!selectedIds.length} title="Centrar horizontalmente"><AlignHorizontalJustifyCenter className="w-4 h-4" /></button>
                <button className={btn} onClick={() => alignSelection('y')} disabled={!selectedIds.length} title="Centrar verticalmente"><AlignVerticalJustifyCenter className="w-4 h-4" /></button>
                <button className={btn} onClick={() => selectedIds[0] && duplicate(selectedIds[0])} disabled={selectedIds.length !== 1} title="Duplicar (Ctrl+D)"><Copy className="w-4 h-4" /></button>
                <button className={btn} onClick={() => selectedIds[0] && removeNode(selectedIds[0])} disabled={selectedIds.length !== 1} title="Eliminar (Supr)"><Trash2 className="w-4 h-4" /></button>

                <span className="ml-auto text-[11px] font-bold text-gray-400 mr-2 hidden sm:inline">
                    {fmt.label} · {fmt.width}×{fmt.height} px · {fmt.networks.slice(0, 3).join(', ')}
                </span>

                <button onClick={() => setShowSaved(s => !s)} className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-indigo-600 px-2.5 py-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <FolderOpen className="w-4 h-4" /> Mis diseños{saved.length > 0 && <span className="text-gray-400">({saved.length})</span>}
                </button>
                <button onClick={save} disabled={saving || !doc.nodes.length}
                    className="flex items-center gap-1.5 text-xs font-bold border border-gray-300 hover:border-indigo-400 disabled:opacity-40 rounded-lg px-3 py-2 text-gray-700 transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                </button>
                {publicUrl && (
                    <a href={publicUrl} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold text-green-700 bg-green-50 border border-green-200 hover:border-green-400 rounded-lg px-2.5 py-2 transition-colors"
                        title={`Enlace público: ${publicUrl}`}>
                        <Globe2 className="w-3.5 h-3.5" /> En vivo
                    </a>
                )}
                <button onClick={() => setPublishOpen(true)} disabled={!doc.nodes.length}
                    className="flex items-center gap-1.5 text-xs font-bold border border-gray-300 hover:border-indigo-400 disabled:opacity-40 rounded-lg px-3 py-2 text-gray-700 transition-colors"
                    title={publicUrl ? "Cambiar la dirección o los campos del enlace público" : "Generar un enlace público para que cualquiera arme su pieza con esta plantilla"}>
                    <Globe2 className="w-4 h-4" /> {publicUrl ? "Publicación" : "Publicar"}
                </button>
                <div className="relative">
                    <button onClick={() => setExportOpen(o => !o)} disabled={exporting || !doc.nodes.length}
                        className="flex items-center gap-1.5 text-xs font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg px-3.5 py-2 transition-colors">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Descargar
                    </button>
                    {exportOpen && (
                        <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-40 py-1">
                            {([
                                ['png', 'PNG', `${fmt.width * 2}×${fmt.height * 2} px`, FileImage],
                                ['jpg', 'JPG', 'más liviano', ImageDown],
                                ['pdf', 'PDF', 'listo para imprimir', FileType2],
                            ] as const).map(([f, label, hint, Icon]) => (
                                <button key={f} onClick={() => doExport(f)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-left">
                                    <Icon className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-bold text-gray-700">{label}</span>
                                    <span className="ml-auto text-[10px] text-gray-400">{hint}</span>
                                </button>
                            ))}
                            {/* Mandar la pieza a la Biblioteca Multimedia sigue siendo
                                posible, pero es una decisión EXPLÍCITA. Como efecto
                                secundario de guardar dejaba decenas de copias casi
                                iguales mezcladas con las fotos de los clubes. */}
                            <div className="border-t border-gray-100 mt-1 pt-1">
                                <button onClick={sendToLibrary} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 text-left">
                                    <ImagePlus className="w-4 h-4 text-gray-400" />
                                    <span className="text-xs font-bold text-gray-700">Guardar en la Biblioteca</span>
                                    <span className="ml-auto text-[10px] text-gray-400">como imagen</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Mis diseños ──────────────────────────────────────── */}
            {showSaved && (
                <div className="border-b border-gray-200 bg-gray-50 p-3 shrink-0 max-h-40 overflow-y-auto">
                    {saved.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Todavía no guardaste ningún diseño.</p>
                    ) : (
                        <div className="flex gap-3 flex-wrap">
                            {saved.map(d => (
                                <div key={d.id} className="relative w-28 group">
                                    <button onClick={() => openSaved(d)} className="block w-28 h-28 rounded-lg overflow-hidden border border-gray-200 hover:border-indigo-400 bg-white transition-colors">
                                        {/* La miniatura de la ficha primero; `imageUrl` es el
                                            respaldo para los diseños guardados cuando cada
                                            guardado subía un archivo a la Biblioteca. */}
                                        {d.thumbUrl || d.imageUrl
                                            ? <img src={d.thumbUrl || d.imageUrl || ''} alt="" className="w-full h-full object-cover" />
                                            : <span className="text-[10px] text-gray-400 flex items-center justify-center h-full">Sin vista previa</span>}
                                    </button>
                                    <p className="mt-1 text-[10px] text-gray-500 truncate">{d.title}</p>
                                    <button onClick={() => removeSaved(d.id)}
                                        className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity" title="Eliminar">
                                        <Trash2 className="w-3 h-3 text-red-500" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Tres paneles ─────────────────────────────────────── */}
            <div className="flex-1 flex min-h-0">
                <DesignSidebar
                    catalog={catalog}
                    templateId={templateId}
                    onTemplate={changeTemplate}
                    club={club}
                    onClub={(c, b) => { setClub(c); setBranding(b); if (b?.years != null) setYears(String(b.years)); }}
                    branding={branding}
                    years={years}
                    onYears={setYears}
                    message={message}
                    onMessage={setMessage}
                    copy={copy}
                    photo={photo}
                    onPickPhoto={() => setPickerTarget('foto')}
                    onUploadPhoto={f => uploadImage(f, 'foto')}
                    uploading={uploading}
                    onClearPhoto={() => setPhoto(null)}
                    generating={generating}
                    onGenerate={() => runCompose({ skipAI: false })}
                    missing={missing}
                    logo={{
                        node: logoNode,
                        onPatch: patchNode,
                        // La subida escribe en ESE nodo y NO toca `srcVar`: poner
                        // el logotipo de ejemplo no es desvincular el campo.
                        onUpload: f => uploadImage(f, 'logo'),
                        onPickFromLibrary: () => setPickerTarget('logo'),
                        onClear: id => patchNode(id, { src: null } as Partial<DesignNode>),
                        onAdd: addLogoNode,
                        uploading,
                        clubLogo: branding?.logo || null,
                    }}
                    extra={
                        <CompositionPanel
                            step={6}
                            composition={composition}
                            onChange={setComposition}
                            photoUrl={photo}
                            format={doc.format}
                            palette={{ primary: branding?.primary, accent: branding?.accent }}
                            maxVariants={catalog?.maxVariants || 4}
                            hasBackdrop={hayBackdrop}
                            onApply={applyBackdrop}
                            onRemove={removeBackdrop}
                            onPickBase={() => setPickerTarget('base')}
                            onUploadBase={f => uploadImage(f, 'base')}
                            uploading={uploading}
                            hasPhotoSlot={!!photoNode}
                            onAddPhoto={addPhotoNode}
                            document={doc}
                        />
                    }
                />

                <main ref={viewportRef} className="flex-1 min-w-0 overflow-auto bg-gray-200/70 flex items-center justify-center p-8">
                    {doc.nodes.length === 0 ? (
                        <div className="text-center max-w-sm">
                            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
                                <Sparkles className="w-7 h-7 text-white" />
                            </div>
                            <h3 className="text-base font-black text-gray-800 mb-1">Elegí una plantilla y un club</h3>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                La IA escribe el mensaje con los datos reales del club y armá la pieza desde ahí.
                                Todo lo que veas acá es exactamente lo que se descarga.
                            </p>
                        </div>
                    ) : (
                        <DesignCanvas
                            doc={doc}
                            selectedIds={selectedIds}
                            zoom={zoom}
                            showGuides={showGuides}
                            onSelect={setSelectedIds}
                            onNodesChange={setNodes}
                            // Escribir en el lienzo pasa por `patchNode`, igual
                            // que escribir en la casilla del panel: es el mismo
                            // gesto y tiene que desligar de la variable igual.
                            onEditText={(id, text) => patchNode(id, { text } as Partial<DesignNode>)}
                        />
                    )}
                </main>

                <DesignInspector
                    nodes={doc.nodes}
                    selectedIds={selectedIds}
                    elements={catalog?.elements || []}
                    onSelect={setSelectedIds}
                    onPatch={patchNode}
                    onReorder={reorder}
                    onDelete={removeNode}
                    onDuplicate={duplicate}
                    onAddElement={addElement}
                    onAddText={addText}
                    onAddImage={() => setPickerTarget('capa')}
                    onUploadImage={f => uploadImage(f, 'capa')}
                    onReplaceImage={id => setPickerTarget(id)}
                    assignable={catalog?.assignable || []}
                    onSetPublicKey={setPublicKey}
                    onSendTo={sendTo}
                    onSetField={setNodeField}
                    onUploadReplacement={(id, f) => {
                        if (!f) return;
                        // Se sube y se escribe en ESE nodo, sin tocar la
                        // fotografía de la plantilla ni su campo vinculado —ver
                        // la nota del `MediaPicker` más abajo—.
                        uploadToLibrary(f, club?.id || null)
                            .then(({ url }) => patchNode(id, { src: url } as Partial<DesignNode>))
                            .catch(e => toast.error(e instanceof Error ? e.message : 'No se pudo subir la imagen'));
                    }}
                    uploading={uploading}
                />
            </div>

            {publishOpen && (
                <PublishDialog
                    document={doc}
                    projectId={currentId}
                    defaultName={title}
                    // Lo institucional se congela con lo que hay AHORA: son los
                    // datos del club elegido, y el enlace público tiene que
                    // seguir mostrándolos aunque nadie vuelva a consultarlo.
                    frozen={{
                        logo: branding?.logo || '',
                        distrito: branding?.district || '',
                        gobernador: branding?.governor || '',
                        periodo: branding?.period || '',
                    }}
                    composition={composition}
                    onClose={() => setPublishOpen(false)}
                    onPublished={p => setPublicUrl(p.url)}
                />
            )}

            {/* UN SOLO MediaPicker por pantalla; `pickerTarget` dice a dónde va
                lo elegido. La otra vía —subir— la resuelve `uploadImage`, y las
                dos se ofrecen juntas en cada casilla, como manda la regla de
                v4.700: sin la de subir, poner una imagen obligaba a irse hasta
                la Biblioteca, cargarla allá y volver. */}
            {pickerTarget && (
                <MediaPicker
                    isOpen={!!pickerTarget}
                    onClose={() => setPickerTarget(null)}
                    maxSelection={1}
                    onSelect={items => {
                        const url = items?.[0]?.url;
                        const target = pickerTarget;
                        setPickerTarget(null);
                        if (!url) return;
                        if (target === 'capa') { addImageNode(url); return; }
                        if (target === 'base') { setComposition(c => ({ ...c, baseImageUrl: url })); toast.success('Imagen base cargada.'); return; }
                        if (target === 'logo') {
                            if (!logoNode) { toast.error('Este diseño no tiene un espacio para el logotipo.'); return; }
                            patchNode(logoNode.id, { src: url } as Partial<DesignNode>);
                            return;
                        }
                        if (target && target !== 'foto') {
                            // Reemplazar la imagen de un nodo concreto desde
                            // Propiedades: `target` es su id.
                            //
                            // NO se toca `srcVar`. Hasta v4.722 se ponía en
                            // `null` «para desligarlo», y eso borraba el campo
                            // vinculado del nodo sin decirlo: quien marcaba el
                            // logotipo como campo público y después cambiaba la
                            // imagen de ejemplo para ver cómo quedaba, publicaba
                            // la plantilla sin ese campo. Poner una imagen de
                            // ejemplo no es desvincular; desvincular tiene su
                            // propio control.
                            patchNode(target, { src: url } as Partial<DesignNode>);
                            return;
                        }
                        setPhoto(url);
                        // Si la plantilla trae un nodo de foto que se descartó
                        // por no haber imagen, hay que recomponer: el nodo no
                        // existe y `applyVariables` no puede resucitarlo.
                        const hasPhotoNode = doc.nodes.some(n => isImage(n) && (n.srcVar === 'imagen' || n.role === 'foto'));
                        if (doc.nodes.length && !hasPhotoNode) runCompose({ skipAI: true });
                    }}
                />
            )}
        </div>
    );
};

export default DesignStudio;
