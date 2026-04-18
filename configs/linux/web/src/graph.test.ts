import { describe, it, expect, beforeEach } from 'vitest';
import { renderGraph, applyFilter } from './graph.js';
import type { Skill, Realm, Progress } from './types.js';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'boot-and-init',
    description: 'test',
    realm: 'foundations',
    category: 'boot',
    difficulty: 'beginner',
    xp: 100,
    estimated_minutes: 60,
    prerequisites: [],
    unlocks: [],
    kernel_files: [],
    doc_files: [],
    badge: 'First Boot',
    tags: [],
    content: '',
    ...overrides,
  };
}

const REALMS: Realm[] = [
  { id: 'foundations', name: 'The Foundations', color: '#c9a227', icon: 'F', description: '' },
  { id: 'memory', name: 'Memory Arcana', color: '#2d6b2d', icon: 'M', description: '' },
];

function makeProgress(overrides: Partial<Progress> = {}): Progress {
  return {
    version: 1, completedSkills: [], inProgressSkills: [],
    totalXP: 0, badges: [], verificationChecks: {},
    startedAt: '2026-01-01T00:00:00Z', ...overrides,
  };
}

let svg: SVGSVGElement;

beforeEach(() => {
  document.body.innerHTML = '<svg id="test-svg" width="800" height="600"></svg>';
  svg = document.getElementById('test-svg') as unknown as SVGSVGElement;
  // Mock getBoundingClientRect
  svg.getBoundingClientRect = () => ({
    width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0, toJSON: () => {},
  });
});

describe('renderGraph', () => {
  it('renders nodes for each skill', () => {
    const skills = [makeSkill(), makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] })];
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});
    const nodes = svg.querySelectorAll('.node');
    expect(nodes.length).toBe(2);
  });

  it('renders edges for prerequisites', () => {
    const skills = [
      makeSkill(),
      makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
    ];
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});
    const edges = svg.querySelectorAll('.edge');
    expect(edges.length).toBe(1);
  });

  it('renders no edges for root skill', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    const edges = svg.querySelectorAll('.edge');
    expect(edges.length).toBe(0);
  });

  it('sets correct node state classes', () => {
    const skills = [
      makeSkill(),
      makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
    ];
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderGraph(svg, skills, REALMS, progress, () => {});

    const nodeClasses = Array.from(svg.querySelectorAll('.node')).map(n => n.getAttribute('class'));
    expect(nodeClasses).toContain('node node-completed');
    expect(nodeClasses).toContain('node node-available');
  });

  it('marks locked nodes when prerequisites not met', () => {
    const skills = [
      makeSkill(),
      makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
      makeSkill({ name: 'process-lifecycle', prerequisites: ['system-calls'] }),
    ];
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});

    const nodeClasses = Array.from(svg.querySelectorAll('.node')).map(n => n.getAttribute('class'));
    expect(nodeClasses.filter(c => c?.includes('node-locked')).length).toBe(2);
    expect(nodeClasses.filter(c => c?.includes('node-available')).length).toBe(1);
  });

  it('renders skill names as text', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    const nameText = svg.querySelector('.node-name');
    expect(nameText?.textContent).toBe('boot and init');
  });

  it('renders XP text', () => {
    renderGraph(svg, [makeSkill({ xp: 150 })], REALMS, makeProgress(), () => {});
    const xpText = svg.querySelector('.node-xp');
    expect(xpText?.textContent).toBe('150 XP');
  });

  it('renders badge text for completed nodes', () => {
    const progress = makeProgress({ completedSkills: ['boot-and-init'] });
    renderGraph(svg, [makeSkill()], REALMS, progress, () => {});
    const badgeText = svg.querySelector('.node-badge');
    expect(badgeText?.textContent).toBe('First Boot');
  });

  it('does not render badge for incomplete nodes', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    const badgeText = svg.querySelector('.node-badge');
    expect(badgeText?.textContent).toBe('');
  });

  it('renders difficulty dots', () => {
    renderGraph(svg, [makeSkill({ difficulty: 'intermediate' })], REALMS, makeProgress(), () => {});
    const dots = svg.querySelectorAll('.diff-dot');
    expect(dots.length).toBe(2); // intermediate = 2 dots
  });

  it('renders 1 dot for beginner', () => {
    renderGraph(svg, [makeSkill({ difficulty: 'beginner' })], REALMS, makeProgress(), () => {});
    expect(svg.querySelectorAll('.diff-dot').length).toBe(1);
  });

  it('renders 3 dots for advanced', () => {
    renderGraph(svg, [makeSkill({ difficulty: 'advanced' })], REALMS, makeProgress(), () => {});
    expect(svg.querySelectorAll('.diff-dot').length).toBe(3);
  });

  it('calls onNodeClick for available nodes', () => {
    let clicked: Skill | null = null;
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), (s) => { clicked = s; });
    const node = svg.querySelector('.node') as Element;
    node.dispatchEvent(new Event('click'));
    expect(clicked?.name).toBe('boot-and-init');
  });

  it('applies realm colors to indicator bar', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    // The realm indicator rect should have the gold color
    const rects = svg.querySelectorAll('.node rect');
    const fills = Array.from(rects).map(r => r.getAttribute('fill'));
    expect(fills).toContain('#c9a227');
  });

  it('creates zoom group', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    expect(svg.querySelector('.graph-root')).not.toBeNull();
  });

  it('handles empty skill list', () => {
    renderGraph(svg, [], REALMS, makeProgress(), () => {});
    expect(svg.querySelectorAll('.node').length).toBe(0);
    expect(svg.querySelectorAll('.edge').length).toBe(0);
  });

  it('positions prerequisite levels above dependent levels', () => {
    const skills = [
      makeSkill(),
      makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
    ];
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});
    const nodes = Array.from(svg.querySelectorAll('.node'));
    const transforms = nodes.map(n => {
      const t = n.getAttribute('transform') || '';
      const match = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      return match ? parseFloat(match[2]) : 0;
    });
    // First node (boot-and-init, level 0) should be above second (level 1)
    expect(transforms[0]).toBeLessThan(transforms[1]);
  });

  it('tags each node with data-skill-name', () => {
    renderGraph(svg, [makeSkill()], REALMS, makeProgress(), () => {});
    const node = svg.querySelector('.node');
    expect(node?.getAttribute('data-skill-name')).toBe('boot-and-init');
  });

  it('tags each edge with data-source and data-target', () => {
    const skills = [
      makeSkill(),
      makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
    ];
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});
    const edge = svg.querySelector('.edge');
    expect(edge?.getAttribute('data-source')).toBe('boot-and-init');
    expect(edge?.getAttribute('data-target')).toBe('system-calls');
  });
});

describe('applyFilter', () => {
  const skills = [
    makeSkill(),
    makeSkill({ name: 'system-calls', prerequisites: ['boot-and-init'] }),
    makeSkill({ name: 'page-allocation', realm: 'memory', prerequisites: ['system-calls'] }),
  ];

  beforeEach(() => {
    renderGraph(svg, skills, REALMS, makeProgress(), () => {});
  });

  it('adds filtered-out class to nodes whose predicate returns false', () => {
    applyFilter(svg, name => name === 'boot-and-init');
    const passing = svg.querySelector('.node[data-skill-name="boot-and-init"]');
    const filteredOut = svg.querySelector('.node[data-skill-name="system-calls"]');
    expect(passing?.classList.contains('filtered-out')).toBe(false);
    expect(filteredOut?.classList.contains('filtered-out')).toBe(true);
  });

  it('removes filtered-out class when predicate now passes', () => {
    applyFilter(svg, () => false);
    applyFilter(svg, () => true);
    const nodes = svg.querySelectorAll('.node');
    for (const n of Array.from(nodes)) {
      expect(n.classList.contains('filtered-out')).toBe(false);
    }
  });

  it('fades edges when either endpoint is filtered out', () => {
    // Keep only boot-and-init -> both outgoing edges should fade
    applyFilter(svg, name => name === 'boot-and-init');
    const edge = svg.querySelector('.edge[data-source="boot-and-init"][data-target="system-calls"]');
    expect(edge?.classList.contains('filtered-out')).toBe(true);
  });

  it('keeps edges visible when both endpoints pass', () => {
    applyFilter(svg, () => true);
    const edges = svg.querySelectorAll('.edge');
    for (const e of Array.from(edges)) {
      expect(e.classList.contains('filtered-out')).toBe(false);
    }
  });
});
