import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D, { type ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { Brain, Layers, Cpu, RotateCw, Eye, EyeOff } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// BrainGraph3D — Visualización tipo Obsidian del grafo de conocimiento
// Renderiza brains (nodos grandes) + memorias (nodos chicos) con relaciones
// usando react-force-graph-3d (Three.js). Tema dark cosmic.
// ─────────────────────────────────────────────────────────────────────────────

interface GraphNode {
    id: string;
    nodeType: 'brain' | 'memory';
    kind: string;
    name: string;
    isMaster?: boolean;
    memoryCount?: number;
    brainId?: string;
    location?: string | null;
    sourceType?: string | null;
}

interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    linkType: 'relation' | 'belongs';
    kind?: string;
    weight: number;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    stats?: { brains: number; memories: number; relations: number };
}

interface BrainGraph3DProps {
    data: GraphData;
    height?: number;
    onNodeClick?: (node: GraphNode) => void;
}

// Paleta cosmic — inspirada en Obsidian dark theme
const KIND_COLOR_3D: Record<string, string> = {
    MASTER:       '#a78bfa', // violet-400
    CLUB:         '#60a5fa', // blue-400
    DISTRICT:     '#34d399', // emerald-400
    ASSOCIATION:  '#fbbf24', // amber-400
    PROGRAM:      '#f472b6', // pink-400
    CONFERENCE:   '#818cf8', // indigo-400
    EVENT:        '#94a3b8', // slate-400
    PROJECT_FAIR: '#fb923c', // orange-400
    FOUNDATION:   '#f87171', // red-400
    // Memorias
    POST:         '#3b82f6',
    PROJECT:      '#10b981',
    KNOWLEDGE:    '#8b5cf6',
    NOTE:         '#64748b',
    PUBLICATION:  '#6366f1',
    MEMBER:       '#ec4899',
    DOCUMENT:     '#f59e0b',
    CHAT:         '#a78bfa',
};

const LINK_COLOR: Record<string, string> = {
    PARENT_OF:         'rgba(167, 139, 250, 0.5)', // violet
    MEMBER_OF:         'rgba(52, 211, 153, 0.6)',  // emerald
    COLLABORATES_WITH: 'rgba(251, 191, 36, 0.6)',  // amber
    SIMILAR_TO:        'rgba(244, 114, 182, 0.5)', // pink
    PARTICIPATES_IN:   'rgba(96, 165, 250, 0.5)',  // blue
    belongs:           'rgba(100, 116, 139, 0.18)', // slate (memoria→brain)
};

const BrainGraph3D: React.FC<BrainGraph3DProps> = ({ data, height = 600, onNodeClick }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<ForceGraphMethods<any, any> | undefined>(undefined);
    const [showMemories, setShowMemories] = useState(true);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

    // Filter data según showMemories
    const visibleData = useMemo(() => {
        if (showMemories) return data;
        return {
            nodes: data.nodes.filter(n => n.nodeType === 'brain'),
            links: data.links.filter(l => l.linkType === 'relation'),
        };
    }, [data, showMemories]);

    // Cuando cambia hover, recalcular highlight (nodo + vecinos)
    useEffect(() => {
        if (!hoveredNode) {
            setHighlightedIds(new Set());
            return;
        }
        const ids = new Set<string>([hoveredNode.id]);
        for (const link of visibleData.links) {
            const sId = typeof link.source === 'object' ? link.source.id : link.source;
            const tId = typeof link.target === 'object' ? link.target.id : link.target;
            if (sId === hoveredNode.id) ids.add(tId as string);
            if (tId === hoveredNode.id) ids.add(sId as string);
        }
        setHighlightedIds(ids);
    }, [hoveredNode, visibleData.links]);

    const nodeColor = (node: GraphNode) => {
        if (highlightedIds.size > 0 && !highlightedIds.has(node.id)) {
            return 'rgba(100, 116, 139, 0.18)';
        }
        return KIND_COLOR_3D[node.kind] || '#94a3b8';
    };

    const nodeVal = (node: GraphNode) => {
        if (node.nodeType === 'brain') {
            if (node.isMaster) return 60;
            const base = 8;
            return base + Math.min((node.memoryCount || 0) * 0.5, 25);
        }
        return 1.5; // memorias chicas
    };

    const linkColor = (link: GraphLink) => {
        const key = link.linkType === 'belongs' ? 'belongs' : (link.kind || 'PARENT_OF');
        if (highlightedIds.size > 0) {
            const sId = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source;
            const tId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
            if (!highlightedIds.has(sId as string) || !highlightedIds.has(tId as string)) {
                return 'rgba(100, 116, 139, 0.05)';
            }
        }
        return LINK_COLOR[key] || 'rgba(148, 163, 184, 0.3)';
    };

    const handleNodeClick = (node: GraphNode) => {
        // Zoom into clicked node
        if (fgRef.current && typeof node === 'object' && 'x' in node) {
            const distance = 120;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const n = node as any;
            const distRatio = 1 + distance / Math.hypot(n.x || 1, n.y || 1, n.z || 1);
            fgRef.current.cameraPosition(
                { x: n.x * distRatio, y: n.y * distRatio, z: n.z * distRatio },
                { x: n.x, y: n.y, z: n.z },
                1200
            );
        }
        if (onNodeClick) onNodeClick(node);
    };

    const resetView = () => {
        if (fgRef.current) {
            fgRef.current.cameraPosition({ x: 0, y: 0, z: 800 }, undefined, 1000);
        }
    };

    // Custom node renderer — glow sphere with name label for brains
    const nodeThreeObject = (node: GraphNode) => {
        if (node.nodeType !== 'brain') {
            // Memoria: pequeña esfera simple
            const geometry = new THREE.SphereGeometry(1.5, 8, 8);
            const material = new THREE.MeshBasicMaterial({
                color: nodeColor(node),
                transparent: true,
                opacity: 0.75,
            });
            return new THREE.Mesh(geometry, material);
        }

        // Brain: esfera glow + halo
        const group = new THREE.Group();
        const radius = node.isMaster ? 18 : Math.max(6, 4 + (node.memoryCount || 0) * 0.3);

        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 24, 24),
            new THREE.MeshBasicMaterial({ color: nodeColor(node), transparent: true, opacity: 0.95 }),
        );
        group.add(sphere);

        // Halo más grande, semi-transparente
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 1.45, 24, 24),
            new THREE.MeshBasicMaterial({
                color: nodeColor(node),
                transparent: true,
                opacity: 0.18,
            }),
        );
        group.add(halo);

        // Sprite text label
        const sprite = makeTextSprite(node.name, node.isMaster ? 22 : 13);
        sprite.position.set(0, radius + 7, 0);
        group.add(sprite);

        return group;
    };

    return (
        <div className="relative w-full rounded-2xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 border border-violet-900/30 shadow-2xl" style={{ height }}>
            {/* Controls overlay */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
                <button
                    onClick={() => setShowMemories(v => !v)}
                    className="px-3 py-1.5 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white text-xs font-medium rounded-lg flex items-center gap-2 border border-white/10 transition-colors"
                >
                    {showMemories ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showMemories ? 'Solo cerebros' : 'Ver memorias'}
                </button>
                <button
                    onClick={resetView}
                    className="px-3 py-1.5 bg-white/10 backdrop-blur-md hover:bg-white/20 text-white text-xs font-medium rounded-lg flex items-center gap-2 border border-white/10 transition-colors"
                >
                    <RotateCw className="w-3.5 h-3.5" />Reset vista
                </button>
            </div>

            {/* Stats */}
            {data.stats && (
                <div className="absolute top-3 right-3 z-10 bg-white/5 backdrop-blur-md rounded-xl px-4 py-2 border border-white/10">
                    <div className="flex items-center gap-4 text-xs text-white/80">
                        <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3 text-violet-300" />{data.stats.brains} cerebros</span>
                        {showMemories && <span className="flex items-center gap-1.5"><Layers className="w-3 h-3 text-blue-300" />{data.stats.memories} memorias</span>}
                        <span className="flex items-center gap-1.5"><Brain className="w-3 h-3 text-emerald-300" />{data.stats.relations} relaciones</span>
                    </div>
                </div>
            )}

            {/* Hovered node tooltip */}
            {hoveredNode && (
                <div className="absolute bottom-3 left-3 z-10 bg-black/70 backdrop-blur-md rounded-xl px-4 py-3 border border-violet-700/40 max-w-md">
                    <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-1">
                        {hoveredNode.nodeType === 'brain' ? `Cerebro ${hoveredNode.kind}` : `Memoria · ${hoveredNode.kind}`}
                    </div>
                    <div className="text-sm font-semibold text-white truncate">{hoveredNode.name}</div>
                    {hoveredNode.location && <div className="text-xs text-white/60 mt-0.5">{hoveredNode.location}</div>}
                    {hoveredNode.memoryCount !== undefined && (
                        <div className="text-xs text-white/60 mt-1">{hoveredNode.memoryCount} memorias indexadas</div>
                    )}
                </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 right-3 z-10 bg-black/50 backdrop-blur-md rounded-xl px-3 py-2.5 border border-white/10 max-w-[200px]">
                <div className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-2">Leyenda</div>
                <div className="space-y-1">
                    {[
                        { kind: 'MASTER', label: 'Maestro' },
                        { kind: 'CLUB', label: 'Club' },
                        { kind: 'DISTRICT', label: 'Distrito' },
                        { kind: 'ASSOCIATION', label: 'Asociación' },
                        { kind: 'PROGRAM', label: 'Programa' },
                    ].map(({ kind, label }) => (
                        <div key={kind} className="flex items-center gap-2 text-[10px] text-white/70">
                            <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLOR_3D[kind] }} />
                            {label}
                        </div>
                    ))}
                </div>
            </div>

            <ForceGraph3D
                ref={fgRef as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                graphData={visibleData as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                width={undefined}
                height={height}
                backgroundColor="rgba(2,6,23,0)"
                nodeRelSize={4}
                nodeVal={nodeVal as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                nodeLabel={(n: any) => n.name} // eslint-disable-line @typescript-eslint/no-explicit-any
                nodeThreeObject={nodeThreeObject as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                nodeThreeObjectExtend={false}
                nodeColor={nodeColor as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                linkColor={linkColor as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                linkWidth={(l: any) => l.linkType === 'relation' ? 1.6 : 0.4} // eslint-disable-line @typescript-eslint/no-explicit-any
                linkOpacity={0.6}
                linkDirectionalParticles={(l: any) => l.linkType === 'relation' ? 2 : 0} // eslint-disable-line @typescript-eslint/no-explicit-any
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={1.5}
                onNodeClick={handleNodeClick as any} // eslint-disable-line @typescript-eslint/no-explicit-any
                onNodeHover={(n: any) => setHoveredNode(n || null)} // eslint-disable-line @typescript-eslint/no-explicit-any
                enableNodeDrag={true}
                cooldownTicks={120}
                warmupTicks={50}
            />
        </div>
    );
};

function makeTextSprite(text: string, fontSize: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const padding = 8;
    ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + padding * 2;
    canvas.width = w;
    canvas.height = fontSize + padding * 2;
    ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, padding, canvas.height / 2);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width * 0.12, canvas.height * 0.12, 1);
    return sprite;
}

export default BrainGraph3D;
