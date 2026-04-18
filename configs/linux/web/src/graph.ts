import * as d3 from 'd3';
import type { Skill, Realm, SkillNode, SkillEdge, Progress } from './types.js';
import { getSkillState } from './progress.js';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 64;
const LEVEL_GAP_Y = 120;
const NODE_GAP_X = 220;

interface LayoutNode extends SkillNode {
  level: number;
  col: number;
}

function computeLayout(skills: Skill[], progress: Progress): { nodes: LayoutNode[]; edges: SkillEdge[] } {
  const byName = new Map(skills.map(s => [s.name, s]));
  const edges: SkillEdge[] = [];
  for (const s of skills) {
    for (const p of s.prerequisites) {
      edges.push({ source: p, target: s.name });
    }
  }

  // Topological sort to assign levels
  const levels = new Map<string, number>();
  function getLevel(name: string): number {
    if (levels.has(name)) return levels.get(name)!;
    const skill = byName.get(name);
    if (!skill || skill.prerequisites.length === 0) {
      levels.set(name, 0);
      return 0;
    }
    const maxPrereq = Math.max(...skill.prerequisites.map(p => getLevel(p)));
    const level = maxPrereq + 1;
    levels.set(name, level);
    return level;
  }
  skills.forEach(s => getLevel(s.name));

  // Group by level, sort by realm within level
  const byLevel = new Map<number, Skill[]>();
  for (const s of skills) {
    const lvl = levels.get(s.name)!;
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(s);
  }

  const nodes: LayoutNode[] = [];
  for (const [level, levelSkills] of byLevel) {
    levelSkills.sort((a, b) => a.realm.localeCompare(b.realm));
    const totalWidth = levelSkills.length * NODE_GAP_X;
    const startX = -totalWidth / 2 + NODE_GAP_X / 2;
    levelSkills.forEach((skill, idx) => {
      nodes.push({
        skill,
        x: startX + idx * NODE_GAP_X,
        y: level * LEVEL_GAP_Y,
        level,
        col: idx,
        state: getSkillState(progress, skill.name, skill.prerequisites),
      });
    });
  }

  return { nodes, edges };
}

export function renderGraph(
  container: SVGSVGElement,
  skills: Skill[],
  realms: Realm[],
  progress: Progress,
  onNodeClick: (skill: Skill) => void,
): void {
  const realmMap = new Map(realms.map(r => [r.id, r]));
  const { nodes, edges } = computeLayout(skills, progress);
  const nodeMap = new Map(nodes.map(n => [n.skill.name, n]));

  const svg = d3.select(container);
  svg.selectAll('*').remove();

  // Compute bounds
  const padding = 100;
  const xs = nodes.map(n => n.x);
  const ys = nodes.map(n => n.y);
  const minX = Math.min(...xs) - NODE_WIDTH / 2 - padding;
  const maxX = Math.max(...xs) + NODE_WIDTH / 2 + padding;
  const minY = Math.min(...ys) - NODE_HEIGHT / 2 - padding;
  const maxY = Math.max(...ys) + NODE_HEIGHT / 2 + padding;

  const g = svg.append('g').attr('class', 'graph-root');

  // Zoom/pan (may fail in jsdom where SVG viewBox is not implemented)
  try {
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoom);

    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / (maxX - minX);
    const scaleY = rect.height / (maxY - minY);
    const scale = Math.min(scaleX, scaleY, 1.2);
    const tx = rect.width / 2 - ((minX + maxX) / 2) * scale;
    const ty = padding * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  } catch {
    // Zoom not available (e.g. test environment without full SVG support)
  }

  // Draw edges
  const edgeGroup = g.append('g').attr('class', 'edges');
  for (const edge of edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) continue;
    const completed = src.state === 'completed';
    edgeGroup.append('path')
      .attr('d', `M${src.x},${src.y + NODE_HEIGHT / 2} C${src.x},${(src.y + tgt.y) / 2} ${tgt.x},${(src.y + tgt.y) / 2} ${tgt.x},${tgt.y - NODE_HEIGHT / 2}`)
      .attr('class', `edge ${completed ? 'edge-completed' : 'edge-locked'}`)
      .attr('fill', 'none');
  }

  // Draw nodes
  const nodeGroup = g.append('g').attr('class', 'nodes');
  for (const node of nodes) {
    const realm = realmMap.get(node.skill.realm);
    const color = realm?.color || '#666';

    const ng = nodeGroup.append('g')
      .attr('class', `node node-${node.state}`)
      .attr('transform', `translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`)
      .style('cursor', node.state === 'locked' ? 'not-allowed' : 'pointer')
      .on('click', () => {
        if (node.state !== 'locked') onNodeClick(node.skill);
      });

    // Background rect
    ng.append('rect')
      .attr('width', NODE_WIDTH)
      .attr('height', NODE_HEIGHT)
      .attr('rx', 8)
      .attr('class', `node-bg node-bg-${node.state}`)
      .style('--realm-color', color);

    // Realm indicator
    ng.append('rect')
      .attr('width', 6)
      .attr('height', NODE_HEIGHT)
      .attr('rx', '3 0 0 3')
      .attr('fill', color)
      .attr('opacity', node.state === 'locked' ? 0.3 : 0.9);

    // Difficulty dots
    const dots = node.skill.difficulty === 'beginner' ? 1 : node.skill.difficulty === 'intermediate' ? 2 : 3;
    for (let i = 0; i < dots; i++) {
      ng.append('circle')
        .attr('cx', NODE_WIDTH - 16 + i * 10)
        .attr('cy', 12)
        .attr('r', 3)
        .attr('class', `diff-dot diff-${node.skill.difficulty}`);
    }

    // Name
    ng.append('text')
      .attr('x', 16)
      .attr('y', 28)
      .attr('class', 'node-name')
      .text(node.skill.name.replace(/-/g, ' '));

    // XP and badge
    ng.append('text')
      .attr('x', 16)
      .attr('y', 48)
      .attr('class', 'node-xp')
      .text(`${node.skill.xp} XP`);

    ng.append('text')
      .attr('x', NODE_WIDTH - 10)
      .attr('y', 48)
      .attr('class', 'node-badge')
      .attr('text-anchor', 'end')
      .text(node.state === 'completed' ? node.skill.badge : '');
  }
}

export function updateNodeStates(
  container: SVGSVGElement,
  skills: Skill[],
  progress: Progress,
): void {
  const svg = d3.select(container);
  skills.forEach(skill => {
    const state = getSkillState(progress, skill.name, skill.prerequisites);
    svg.selectAll('.node').each(function () {
      const el = d3.select(this);
      const nameEl = el.select('.node-name');
      if (nameEl.text() === skill.name.replace(/-/g, ' ')) {
        el.attr('class', `node node-${state}`);
        el.select('.node-bg').attr('class', `node-bg node-bg-${state}`);
        if (state === 'completed') {
          el.select('.node-badge').text(skill.badge);
        }
      }
    });
  });
}
