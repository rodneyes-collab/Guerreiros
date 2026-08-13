import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Player, Match } from '../types';
import * as d3 from 'd3';
import { Network, ZoomIn, ZoomOut, RefreshCcw, ShieldCheck, Trophy, AlertTriangle, Search } from 'lucide-react';

interface SynergyGraphProps {
  players: Player[];
  matches: Match[];
}

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  gender: string;
  wins: number;
  losses: number;
  elo: number;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {
  source: string | NodeDatum;
  target: string | NodeDatum;
  games: number;
  wins: number;
  winRate: number;
}

export const SynergyGraph: React.FC<SynergyGraphProps> = ({ players, matches }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ p1: string; p2: string; winRate: number; games: number; wins: number } | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'elite' | 'friction'>('all');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const activePlayers = useMemo(() => {
    return players.filter(p => !p.isDM);
  }, [players]);

  // Compute graph data (nodes and links)
  const { nodes, links } = useMemo(() => {
    const nodeMap = new Map<string, NodeDatum>();
    activePlayers.forEach(p => {
      nodeMap.set(p.id, {
        id: p.id,
        name: p.name,
        gender: p.gender,
        wins: p.wins || 0,
        losses: p.losses || 0,
        elo: p.elo || 1000
      });
    });

    const pairMap = new Map<string, { games: number; wins: number }>();

    matches.forEach(m => {
      const processTeam = (teamIds: string[], isWin: boolean) => {
        if (!teamIds || teamIds.length < 2) return;
        for (let i = 0; i < teamIds.length; i++) {
          for (let j = i + 1; j < teamIds.length; j++) {
            const id1 = teamIds[i];
            const id2 = teamIds[j];
            if (!nodeMap.has(id1) || !nodeMap.has(id2)) continue;
            const key = [id1, id2].sort().join('___');
            const current = pairMap.get(key) || { games: 0, wins: 0 };
            current.games += 1;
            if (isWin) current.wins += 1;
            pairMap.set(key, current);
          }
        }
      };

      processTeam(m.teamA, m.winner === 'A');
      processTeam(m.teamB, m.winner === 'B');
    });

    const linkList: LinkDatum[] = [];
    pairMap.forEach((val, key) => {
      const [source, target] = key.split('___');
      const winRate = val.games > 0 ? val.wins / val.games : 0;
      
      // Filter based on mode
      if (filterMode === 'elite' && winRate < 0.65) return;
      if (filterMode === 'friction' && winRate > 0.40) return;
      if (val.games < 1) return;

      linkList.push({
        source,
        target,
        games: val.games,
        wins: val.wins,
        winRate
      });
    });

    // Filter links and nodes if searchQuery is set
    let finalLinks = linkList;
    let finalNodes = Array.from(nodeMap.values());

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      // Keep only links where source or target name contains the query
      finalLinks = linkList.filter(l => {
        const srcId = typeof l.source === 'string' ? l.source : (l.source as NodeDatum).id;
        const tgtId = typeof l.target === 'string' ? l.target : (l.target as NodeDatum).id;
        const srcNode = nodeMap.get(srcId);
        const tgtNode = nodeMap.get(tgtId);
        return (
          (srcNode && srcNode.name.toLowerCase().includes(q)) ||
          (tgtNode && tgtNode.name.toLowerCase().includes(q))
        );
      });

      // Keep only nodes that are part of the filtered links OR directly match the query
      const connectedNodeIds = new Set<string>();
      finalLinks.forEach(l => {
        const srcId = typeof l.source === 'string' ? l.source : (l.source as NodeDatum).id;
        const tgtId = typeof l.target === 'string' ? l.target : (l.target as NodeDatum).id;
        connectedNodeIds.add(srcId);
        connectedNodeIds.add(tgtId);
      });

      finalNodes = Array.from(nodeMap.values()).filter(node => 
        connectedNodeIds.has(node.id) || node.name.toLowerCase().includes(q)
      );
    }

    return {
      nodes: finalNodes,
      links: finalLinks
    };
  }, [activePlayers, matches, filterMode, searchQuery]);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = 600;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [0, 0, width, height])
      .attr('width', '100%')
      .attr('height', '100%');

    const container = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Simulation
    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(35));

    // Links (Edges)
    const link = container.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => {
        if (d.winRate >= 0.65) return '#10b981'; // Emerald for elite
        if (d.winRate <= 0.35) return '#f43f5e'; // Rose for friction
        return 'rgba(255, 255, 255, 0.15)';
      })
      .attr('stroke-width', d => Math.max(1.5, Math.min(6, d.games * 1.2)))
      .attr('stroke-opacity', 0.8)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const p1Name = typeof d.source === 'object' ? (d.source as NodeDatum).name : d.source;
        const p2Name = typeof d.target === 'object' ? (d.target as NodeDatum).name : d.target;
        setSelectedPair({
          p1: p1Name,
          p2: p2Name,
          winRate: d.winRate,
          games: d.games,
          wins: d.wins
        });
      });

    // Nodes (Players)
    const node = container.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag<SVGGElement, NodeDatum>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    // Node circles
    node.append('circle')
      .attr('r', 22)
      .attr('fill', '#000000')
      .attr('stroke', d => d.elo > 1200 ? '#facc15' : 'rgba(255, 255, 255, 0.3)')
      .attr('stroke-width', 2.5)
      .on('mouseenter', (event, d) => {
        setHoveredNode(d.id);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      });

    // Inner icon / initials
    node.append('text')
      .text(d => d.name.substring(0, 2).toUpperCase())
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#ffffff')
      .attr('font-size', '10px')
      .attr('font-weight', '900');

    // Player name label below node
    node.append('text')
      .text(d => d.name.split(' ')[0])
      .attr('text-anchor', 'middle')
      .attr('dy', '34px')
      .attr('fill', 'rgba(255, 255, 255, 0.7)')
      .attr('font-size', '9px')
      .attr('font-weight', '700')
      .attr('class', 'uppercase tracking-tighter pointer-events-none');

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NodeDatum).x || 0)
        .attr('y1', d => (d.source as NodeDatum).y || 0)
        .attr('x2', d => (d.target as NodeDatum).x || 0)
        .attr('y2', d => (d.target as NodeDatum).y || 0);

      node
        .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  return (
    <div className="bg-black/40 p-6 sm:p-8 rounded-3xl border border-white/5 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-white">Grafo de Sinergias (D3 Network)</h2>
            <p className="text-xs text-white/50 font-bold tracking-widest uppercase">Mapeamento Visual de Grupos de Elite e Pontos de Atrito</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Filtrar sócio..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/60 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/20 font-bold outline-none focus:border-brand-primary/50 transition-colors w-full sm:w-48"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-2xl border border-white/10">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filterMode === 'all' ? 'bg-brand-primary text-brand-secondary shadow-lg shadow-brand-primary/20' : 'text-white/60 hover:text-white'}`}
            >
              Todas
            </button>
            <button
              onClick={() => setFilterMode('elite')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${filterMode === 'elite' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' : 'text-emerald-400/80 hover:text-emerald-400'}`}
            >
              <Trophy className="w-3.5 h-3.5" /> Elite (&gt;65%)
            </button>
            <button
              onClick={() => setFilterMode('friction')}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${filterMode === 'friction' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-rose-400/80 hover:text-rose-400'}`}
            >
              <AlertTriangle className="w-3.5 h-3.5" /> Atrito (&lt;40%)
            </button>
          </div>
        </div>
      </div>

      {/* Graph Canvas Container */}
      <div className="relative w-full h-[550px] bg-black/70 rounded-2xl border border-white/10 overflow-hidden shadow-inner flex items-center justify-center">
        <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Legend Overlay */}
        <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-xl flex flex-col gap-2 pointer-events-none text-[10px] font-black uppercase tracking-widest">
          <div className="flex items-center gap-2.5 text-emerald-400">
            <div className="w-4 h-1 bg-emerald-500 rounded" /> Dupla de Elite (Vitórias &gt; 65%)
          </div>
          <div className="flex items-center gap-2.5 text-rose-400">
            <div className="w-4 h-1 bg-rose-500 rounded" /> Ponto de Atrito (Vitórias &lt; 40%)
          </div>
          <div className="flex items-center gap-2.5 text-white/50">
            <div className="w-4 h-1 bg-white/30 rounded" /> Sinergia Neutra / Padrão
          </div>
        </div>

        {/* Selected Pair Card Popup if clicked */}
        {selectedPair && (
          <div className="absolute top-4 right-4 bg-black/90 border border-brand-primary/40 p-4 rounded-2xl shadow-2xl max-w-xs space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-brand-primary uppercase tracking-widest">Detalhe da Parceria</span>
              <button onClick={() => setSelectedPair(null)} className="text-white/40 hover:text-white font-bold text-xs">✕</button>
            </div>
            <p className="text-xs font-black text-white uppercase tracking-tight">{selectedPair.p1} & {selectedPair.p2}</p>
            <div className="flex items-center justify-between text-[11px] font-bold text-white/70 pt-1 border-t border-white/10">
              <span>{selectedPair.games} partidas juntos</span>
              <span className={`px-2 py-0.5 rounded font-black ${selectedPair.winRate >= 0.65 ? 'bg-emerald-500/20 text-emerald-300' : selectedPair.winRate <= 0.4 ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-white'}`}>
                {Math.round(selectedPair.winRate * 100)}% ({selectedPair.wins}V)
              </span>
            </div>
          </div>
        )}
      </div>

      <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest text-center">
        Dica: Arraste os nós para reorganizar o grafo ou clique nas conexões para inspecionar o desempenho da dupla.
      </p>
    </div>
  );
};
