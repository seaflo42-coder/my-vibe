import { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const STATUS_LABELS = { pending: '미해결', in_progress: '진행중', resolved: '해결됨' };

// 12 distinct node color themes - each node gets a unique one based on its id
const NODE_THEMES = [
  { border: '#6366f1', glow: 'rgba(99,102,241,0.30)', bg: '#111327', headerBg: '#161a3a', accent: '#818cf8' },
  { border: '#f59e0b', glow: 'rgba(245,158,11,0.30)', bg: '#1a1608', headerBg: '#261f0a', accent: '#fbbf24' },
  { border: '#ec4899', glow: 'rgba(236,72,153,0.30)', bg: '#1c0f1e', headerBg: '#2a1228', accent: '#f472b6' },
  { border: '#14b8a6', glow: 'rgba(20,184,166,0.30)', bg: '#0b1a18', headerBg: '#0e2724', accent: '#2dd4bf' },
  { border: '#f97316', glow: 'rgba(249,115,22,0.30)', bg: '#1a1008', headerBg: '#26180a', accent: '#fb923c' },
  { border: '#8b5cf6', glow: 'rgba(139,92,246,0.30)', bg: '#150f27', headerBg: '#1e1438', accent: '#a78bfa' },
  { border: '#06b6d4', glow: 'rgba(6,182,212,0.30)', bg: '#081820', headerBg: '#0a2230', accent: '#22d3ee' },
  { border: '#ef4444', glow: 'rgba(239,68,68,0.30)', bg: '#1c0e0e', headerBg: '#2a1212', accent: '#f87171' },
  { border: '#22c55e', glow: 'rgba(34,197,94,0.30)', bg: '#0c1a10', headerBg: '#102616', accent: '#4ade80' },
  { border: '#eab308', glow: 'rgba(234,179,8,0.30)', bg: '#1a1705', headerBg: '#262108', accent: '#facc15' },
  { border: '#3b82f6', glow: 'rgba(59,130,246,0.30)', bg: '#0e1428', headerBg: '#111c3a', accent: '#60a5fa' },
  { border: '#d946ef', glow: 'rgba(217,70,239,0.30)', bg: '#1c0c22', headerBg: '#281034', accent: '#e879f9' },
];

function getNodeTheme(id) {
  return NODE_THEMES[id % NODE_THEMES.length];
}

// Status indicator styling (small dot + label inside the node)
const STATUS_DOTS = {
  pending: '#f59e0b',
  in_progress: '#3b82f6',
  resolved: '#22c55e',
};

// Compute connections between nodes sharing tags
function getConnections(nodes) {
  const conns = [];
  const tagMap = {};
  nodes.forEach((n) => {
    (n.tags || []).forEach((tag) => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(n.id);
    });
  });
  const seen = new Set();
  Object.entries(tagMap).forEach(([tag, ids]) => {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${Math.min(ids[i], ids[j])}-${Math.max(ids[i], ids[j])}`;
        if (!seen.has(key)) {
          seen.add(key);
          conns.push({ from: ids[i], to: ids[j], tag });
        }
      }
    }
  });
  return conns;
}

// Tag color palette
const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];
function getTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

const CARD_W = 240;

export default function DisplayView({ nodes, connected, currentSession }) {
  const containerRef = useRef(null);
  const [positions, setPositions] = useState({});
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [dragging, setDragging] = useState(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-position new nodes in a grid
  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      let changed = false;
      const existing = Object.keys(next).length;
      nodes.forEach((node, i) => {
        if (!next[node.id]) {
          const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length)));
          const col = (existing + i) % cols;
          const row = Math.floor((existing + i) / cols);
          next[node.id] = {
            x: 80 + col * (CARD_W + 80),
            y: 80 + row * 240,
          };
          changed = true;
        }
      });
      Object.keys(next).forEach((id) => {
        if (!nodes.find((n) => n.id === Number(id))) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [nodes]);

  // Center view on first load
  useEffect(() => {
    if (nodes.length > 0 && Object.keys(positions).length > 0) {
      const xs = Object.values(positions).map((p) => p.x);
      const ys = Object.values(positions).map((p) => p.y);
      if (xs.length === 0) return;
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const contentW = maxX - minX + CARD_W + 160;
      const contentH = maxY - minY + 300;
      const zoom = Math.min(1, size.w / contentW, size.h / contentH) * 0.85;
      const cx = (minX + maxX + CARD_W) / 2;
      const cy = (minY + maxY + 150) / 2;
      setCamera((prev) => {
        if (prev.x === 0 && prev.y === 0 && prev.zoom === 1) {
          return { x: size.w / 2 - cx * zoom, y: size.h / 2 - cy * zoom, zoom };
        }
        return prev;
      });
    }
  }, [nodes.length, Object.keys(positions).length > 0]);

  const connections = useMemo(() => getConnections(nodes), [nodes]);

  const toWorld = useCallback((sx, sy) => ({
    x: (sx - camera.x) / camera.zoom,
    y: (sy - camera.y) / camera.zoom,
  }), [camera]);

  const handlePointerDown = useCallback((e) => {
    const target = e.target.closest('[data-node-id]');
    if (target) {
      const id = Number(target.dataset.nodeId);
      const pos = positions[id];
      if (pos) {
        const world = toWorld(e.clientX, e.clientY);
        setDragging({ id, offsetX: world.x - pos.x, offsetY: world.y - pos.y });
      }
    } else {
      setDragging({ pan: true, startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y });
    }
  }, [positions, camera, toWorld]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    if (dragging.pan) {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      setCamera((c) => ({ ...c, x: dragging.camX + dx, y: dragging.camY + dy }));
    } else {
      const world = toWorld(e.clientX, e.clientY);
      setPositions((prev) => ({
        ...prev,
        [dragging.id]: { x: world.x - dragging.offsetX, y: world.y - dragging.offsetY },
      }));
    }
  }, [dragging, toWorld]);

  const handlePointerUp = useCallback(() => setDragging(null), []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera((c) => {
      const newZoom = Math.min(2.5, Math.max(0.2, c.zoom * delta));
      const wx = (e.clientX - c.x) / c.zoom;
      const wy = (e.clientY - c.y) / c.zoom;
      return { zoom: newZoom, x: e.clientX - wx * newZoom, y: e.clientY - wy * newZoom };
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const stats = {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === 'pending').length,
    in_progress: nodes.filter((n) => n.status === 'in_progress').length,
    resolved: nodes.filter((n) => n.status === 'resolved').length,
  };
  const resolveRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

  const fitView = () => {
    const xs = Object.values(positions).map((p) => p.x);
    const ys = Object.values(positions).map((p) => p.y);
    if (xs.length === 0) return;
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + CARD_W + 60;
    const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 260;
    const zoom = Math.min(2, size.w / (maxX - minX), size.h / (maxY - minY)) * 0.85;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setCamera({ x: size.w / 2 - cx * zoom, y: size.h / 2 - cy * zoom, zoom });
  };

  return (
    <div
      ref={containerRef}
      style={st.container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <BackgroundGrid camera={camera} />

      {/* Canvas */}
      <div style={{
        position: 'absolute', inset: 0,
        transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
        transformOrigin: '0 0', willChange: 'transform',
      }}>
        {/* SVG connections */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '10000px', height: '10000px', pointerEvents: 'none', overflow: 'visible' }}>
          <defs>
            <filter id="lineGlow">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {connections.map((conn, i) => {
            const fromPos = positions[conn.from];
            const toPos = positions[conn.to];
            if (!fromPos || !toPos) return null;
            const x1 = fromPos.x + CARD_W;
            const y1 = fromPos.y + 70;
            const x2 = toPos.x;
            const y2 = toPos.y + 70;
            const midX = (x1 + x2) / 2;
            const color = getTagColor(conn.tag);
            return (
              <g key={i}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.35}
                  filter="url(#lineGlow)"
                />
                <circle cx={x1} cy={y1} r={4.5} fill={color} opacity={0.6} />
                <circle cx={x2} cy={y2} r={4.5} fill={color} opacity={0.6} />
              </g>
            );
          })}
        </svg>

        {/* Node cards */}
        {nodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const theme = getNodeTheme(node.id);
          const isResolved = node.status === 'resolved';
          const statusDot = STATUS_DOTS[node.status];
          const hasComments = node.comments?.length > 0;

          return (
            <div
              key={node.id}
              data-node-id={node.id}
              style={{
                position: 'absolute', left: pos.x, top: pos.y, width: CARD_W,
                cursor: dragging?.id === node.id ? 'grabbing' : 'grab',
                userSelect: 'none',
                opacity: isResolved ? 0.7 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              <div style={{
                background: theme.bg,
                borderRadius: '12px',
                border: `1.5px solid ${theme.border}`,
                boxShadow: `0 0 28px ${theme.glow}, 0 4px 16px rgba(0,0,0,0.5)`,
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  background: theme.headerBg,
                  padding: '10px 14px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  borderBottom: `1px solid ${theme.border}40`,
                }}>
                  {/* Status dot */}
                  <div style={{
                    width: '9px', height: '9px', borderRadius: '50%',
                    background: statusDot, boxShadow: `0 0 8px ${statusDot}`,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: theme.accent, flex: 1 }}>
                    {node.name}
                  </span>
                  {/* Status label */}
                  <span style={{
                    fontSize: '10px', fontWeight: 600, color: statusDot,
                    background: `${statusDot}18`, padding: '2px 8px', borderRadius: '6px',
                    border: `1px solid ${statusDot}30`,
                  }}>
                    {STATUS_LABELS[node.status]}
                  </span>
                </div>

                {/* Team badge */}
                {node.team && (
                  <div style={{
                    padding: '6px 14px 0',
                  }}>
                    <span style={{
                      fontSize: '10px', color: '#94a3b8',
                      background: 'rgba(255,255,255,0.05)',
                      padding: '2px 8px', borderRadius: '4px',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      {node.team}
                    </span>
                  </div>
                )}

                {/* Concern */}
                <div style={{
                  padding: '10px 14px',
                  fontSize: '13px',
                  color: isResolved ? '#86efac' : '#e2e8f0',
                  lineHeight: 1.6,
                  textDecoration: isResolved ? 'line-through' : 'none',
                  letterSpacing: '0.2px',
                }}>
                  {node.concern}
                </div>

                {/* Tags */}
                {node.tags?.length > 0 && (
                  <div style={{ padding: '0 14px 8px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {node.tags.map((tag) => {
                      const tc = getTagColor(tag);
                      return (
                        <span key={tag} style={{
                          fontSize: '10px', color: tc,
                          background: `${tc}12`, border: `1px solid ${tc}25`,
                          padding: '2px 8px', borderRadius: '4px', fontWeight: 500,
                        }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Mentor comments */}
                {hasComments && (
                  <div style={{
                    margin: '0 10px 10px',
                    borderTop: `1px solid ${theme.border}30`,
                    paddingTop: '8px',
                  }}>
                    {node.comments.map((c, i) => (
                      <div key={i} style={{
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.15)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        marginBottom: i < node.comments.length - 1 ? '4px' : 0,
                        borderLeft: '3px solid #6366f1',
                      }}>
                        <div style={{
                          fontSize: '9px', fontWeight: 700, color: '#818cf8',
                          marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>
                          Mentor
                        </div>
                        <div style={{ fontSize: '12px', color: '#c7d2fe', lineHeight: 1.5 }}>
                          {c.text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Port dots - right */}
              <div style={{
                position: 'absolute', right: '-6px', top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                {(node.tags || []).map((tag) => (
                  <div key={tag} style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: getTagColor(tag), border: '2px solid #0a0e1a',
                    boxShadow: `0 0 6px ${getTagColor(tag)}50`,
                  }} />
                ))}
              </div>
              {/* Port dots - left */}
              <div style={{
                position: 'absolute', left: '-6px', top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                {(node.tags || []).map((tag) => (
                  <div key={tag} style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: getTagColor(tag), border: '2px solid #0a0e1a',
                    boxShadow: `0 0 6px ${getTagColor(tag)}50`,
                  }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* HUD Header */}
      <div style={st.header}>
        <div style={st.headerLeft}>
          <h1 style={st.logo}>Connect & Solve</h1>
          <span style={st.sessionBadge}>Session {currentSession}/4</span>
        </div>
        <div style={st.headerRight}>
          <div style={st.statChip}>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{stats.pending}</span>
            <span style={st.statChipLabel}>미해결</span>
          </div>
          <div style={st.statChip}>
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>{stats.in_progress}</span>
            <span style={st.statChipLabel}>진행중</span>
          </div>
          <div style={st.statChip}>
            <span style={{ color: '#22c55e', fontWeight: 700 }}>{stats.resolved}</span>
            <span style={st.statChipLabel}>해결</span>
          </div>
          <div style={{ ...st.statChip, borderColor: 'rgba(168,85,247,0.3)' }}>
            <span style={{ color: '#a855f7', fontWeight: 700 }}>{resolveRate}%</span>
            <span style={st.statChipLabel}>해결률</span>
          </div>
          <div style={{ ...st.connDot, backgroundColor: connected ? '#22c55e' : '#ef4444' }} />
        </div>
      </div>

      {/* Progress */}
      <div style={st.progressWrap}>
        <div style={{ ...st.progressBar, width: `${resolveRate}%` }} />
      </div>

      {/* Zoom */}
      <div style={st.controls}>
        <button style={st.controlBtn} onClick={() => setCamera((c) => ({ ...c, zoom: Math.min(2.5, c.zoom * 1.2) }))}>+</button>
        <button style={st.controlBtn} onClick={() => setCamera((c) => ({ ...c, zoom: Math.max(0.2, c.zoom * 0.8) }))}>-</button>
        <button style={{ ...st.controlBtn, fontSize: '11px' }} onClick={fitView}>Fit</button>
        <div style={st.zoomLabel}>{Math.round(camera.zoom * 100)}%</div>
      </div>

      {/* Empty */}
      {nodes.length === 0 && (
        <div style={st.emptyState}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#128161;</div>
          <div style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 500 }}>
            QR 코드를 스캔하여 고민을 등록해주세요
          </div>
          <div style={{ fontSize: '14px', color: '#475569', marginTop: '8px' }}>
            등록된 고민이 여기에 실시간으로 표시됩니다
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={st.legend}>
        {Object.entries(STATUS_DOTS).map(([status, color]) => (
          <div key={status} style={st.legendItem}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
            <span style={st.legendText}>{STATUS_LABELS[status]}</span>
          </div>
        ))}
        <div style={st.legendItem}>
          <svg width="20" height="10"><path d="M 0 5 C 5 5, 15 5, 20 5" stroke="#6366f1" strokeWidth="2" fill="none" opacity="0.5" /></svg>
          <span style={st.legendText}>같은 관심사</span>
        </div>
      </div>
    </div>
  );
}

function BackgroundGrid({ camera }) {
  const spacing = 25;
  const offsetX = camera.x % (spacing * camera.zoom);
  const offsetY = camera.y % (spacing * camera.zoom);
  return (
    <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <pattern id="dotGrid" x={offsetX} y={offsetY}
          width={spacing * camera.zoom} height={spacing * camera.zoom}
          patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="rgba(99,102,241,0.10)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotGrid)" />
    </svg>
  );
}

const st = {
  container: {
    position: 'fixed', inset: 0, background: '#080b14', overflow: 'hidden',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    cursor: 'default', touchAction: 'none',
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 24px', zIndex: 100,
    background: 'linear-gradient(180deg, rgba(8,11,20,0.95) 0%, rgba(8,11,20,0.7) 70%, transparent 100%)',
    pointerEvents: 'none',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '14px', pointerEvents: 'auto' },
  logo: { fontSize: '20px', fontWeight: 700, color: '#f1f5f9', margin: 0, letterSpacing: '-0.5px' },
  sessionBadge: {
    background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
    padding: '5px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600,
    border: '1px solid rgba(99,102,241,0.2)',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' },
  statChip: {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    padding: '6px 12px', borderRadius: '10px', fontSize: '14px',
  },
  statChipLabel: { fontSize: '11px', color: '#64748b' },
  connDot: { width: '8px', height: '8px', borderRadius: '50%', marginLeft: '6px' },
  progressWrap: {
    position: 'absolute', top: '62px', left: '24px', right: '24px',
    height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
    zIndex: 100, pointerEvents: 'none',
  },
  progressBar: {
    height: '100%', background: 'linear-gradient(90deg, #6366f1, #22c55e)',
    borderRadius: '4px', transition: 'width 0.8s ease',
  },
  controls: {
    position: 'absolute', bottom: '24px', right: '24px',
    display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', zIndex: 100,
  },
  controlBtn: {
    width: '36px', height: '36px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15,23,42,0.9)',
    color: '#94a3b8', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  zoomLabel: { fontSize: '10px', color: '#475569', marginTop: '2px' },
  emptyState: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)', textAlign: 'center',
    zIndex: 10, pointerEvents: 'none',
  },
  legend: {
    position: 'absolute', bottom: '20px', left: '24px',
    display: 'flex', gap: '20px', zIndex: 100, pointerEvents: 'none',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  legendText: { fontSize: '11px', color: '#475569' },
};
