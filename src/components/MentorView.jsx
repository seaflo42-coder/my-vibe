import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_CONFIG = {
  pending: { label: '미해결', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  in_progress: { label: '진행중', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  resolved: { label: '해결됨', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
};

function CommentInput({ nodeId, addComment }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(nodeId, text.trim(), 'Mentor');
    setText('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={s.commentToggle}>
        + 코멘트 추가
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={s.commentForm}>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="멘토 코멘트를 입력하세요..."
        style={s.commentInput}
      />
      <button type="submit" style={s.commentSendBtn} disabled={!text.trim()}>
        전송
      </button>
      <button type="button" onClick={() => { setOpen(false); setText(''); }} style={s.commentCancelBtn}>
        취소
      </button>
    </form>
  );
}

function CommentList({ comments }) {
  if (!comments || comments.length === 0) return null;
  return (
    <div style={s.commentList}>
      {comments.map((c, i) => (
        <div key={i} style={s.commentItem}>
          <div style={s.commentAuthor}>Mentor</div>
          <div style={s.commentText}>{c.text}</div>
        </div>
      ))}
    </div>
  );
}

export default function MentorView({
  nodes,
  updateStatus,
  deleteNode,
  addComment,
  connected,
  currentSession,
  setSession,
}) {
  const [filter, setFilter] = useState('all');

  const filtered = nodes.filter((n) => {
    if (filter === 'all') return true;
    return n.status === filter;
  });

  const stats = {
    total: nodes.length,
    pending: nodes.filter((n) => n.status === 'pending').length,
    in_progress: nodes.filter((n) => n.status === 'in_progress').length,
    resolved: nodes.filter((n) => n.status === 'resolved').length,
  };

  return (
    <div style={s.container}>
      <div style={s.inner}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Mentor Panel</h1>
            <div style={s.connStatus}>
              <div style={{ ...s.dot, backgroundColor: connected ? '#22c55e' : '#ef4444' }} />
              <span style={s.connText}>{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <div style={s.sessionControl}>
            <span style={s.sessionLabel}>Session</span>
            <div style={s.sessionBtns}>
              {[1, 2, 3, 4].map((ss) => (
                <button
                  key={ss}
                  onClick={() => setSession(ss)}
                  style={{ ...s.sessionBtn, ...(currentSession === ss ? s.sessionBtnActive : {}) }}
                >
                  {ss}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={s.statsRow}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ ...s.statCard, borderColor: cfg.color }}>
              <div style={{ ...s.statNum, color: cfg.color }}>{stats[key]}</div>
              <div style={s.statLabel}>{cfg.label}</div>
            </div>
          ))}
          <div style={{ ...s.statCard, borderColor: '#64748b' }}>
            <div style={{ ...s.statNum, color: '#f1f5f9' }}>{stats.total}</div>
            <div style={s.statLabel}>전체</div>
          </div>
        </div>

        {/* Filters */}
        <div style={s.filterRow}>
          {[
            { key: 'all', label: '전체' },
            { key: 'pending', label: '미해결' },
            { key: 'in_progress', label: '진행중' },
            { key: 'resolved', label: '해결됨' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{ ...s.filterBtn, ...(filter === f.key ? s.filterBtnActive : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Node list */}
        <div style={s.list}>
          <AnimatePresence>
            {filtered.map((node) => {
              const cfg = STATUS_CONFIG[node.status];
              return (
                <motion.div
                  key={node.id}
                  style={s.nodeCard}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  layout
                >
                  {/* Top row */}
                  <div style={s.nodeHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={s.nodeName}>{node.name}</div>
                      {node.team && <span style={s.teamBadge}>{node.team}</span>}
                    </div>
                    <div style={{ ...s.statusBadge, background: cfg.bg, color: cfg.color }}>
                      {cfg.label}
                    </div>
                  </div>

                  {/* Concern */}
                  <div style={s.nodeConcern}>{node.concern}</div>

                  {/* Tags */}
                  {node.tags?.length > 0 && (
                    <div style={s.nodeTags}>
                      {node.tags.map((t) => (
                        <span key={t} style={s.nodeTag}>#{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Existing comments */}
                  <CommentList comments={node.comments} />

                  {/* Comment input */}
                  <CommentInput nodeId={node.id} addComment={addComment} />

                  {/* Actions */}
                  <div style={s.nodeActions}>
                    {node.status !== 'pending' && (
                      <button style={s.actionBtn} onClick={() => updateStatus(node.id, 'pending')}>
                        미해결
                      </button>
                    )}
                    {node.status !== 'in_progress' && (
                      <button style={{ ...s.actionBtn, ...s.actionBtnBlue }} onClick={() => updateStatus(node.id, 'in_progress')}>
                        진행중
                      </button>
                    )}
                    {node.status !== 'resolved' && (
                      <button style={{ ...s.actionBtn, ...s.actionBtnGreen }} onClick={() => updateStatus(node.id, 'resolved')}>
                        해결!
                      </button>
                    )}
                    <button style={{ ...s.actionBtn, ...s.actionBtnRed }} onClick={() => deleteNode(node.id)}>
                      삭제
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div style={s.empty}>등록된 고민이 없습니다</div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', background: '#0f172a', padding: '20px' },
  inner: { maxWidth: '800px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: 700, color: '#f1f5f9', margin: 0 },
  connStatus: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%' },
  connText: { fontSize: '12px', color: '#64748b' },
  sessionControl: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' },
  sessionLabel: { fontSize: '12px', color: '#64748b', fontWeight: 600 },
  sessionBtns: { display: 'flex', gap: '4px' },
  sessionBtn: {
    width: '36px', height: '36px', borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
    color: '#94a3b8', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
  },
  sessionBtnActive: { background: '#6366f1', borderColor: '#6366f1', color: 'white' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#1e293b', borderRadius: '12px', padding: '16px', textAlign: 'center', borderLeft: '3px solid' },
  statNum: { fontSize: '28px', fontWeight: 700 },
  statLabel: { fontSize: '12px', color: '#64748b', marginTop: '2px' },
  filterRow: { display: 'flex', gap: '8px', marginBottom: '16px' },
  filterBtn: {
    padding: '8px 16px', borderRadius: '20px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
    color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
  },
  filterBtnActive: { background: 'rgba(99,102,241,0.2)', borderColor: '#6366f1', color: '#a5b4fc' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  nodeCard: {
    background: '#1e293b', borderRadius: '14px', padding: '18px',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  nodeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  nodeName: { fontSize: '15px', fontWeight: 600, color: '#f1f5f9' },
  teamBadge: {
    fontSize: '11px', color: '#64748b',
    background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px',
  },
  statusBadge: { padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 },
  nodeConcern: { fontSize: '14px', color: '#cbd5e1', lineHeight: 1.5, marginBottom: '8px' },
  nodeTags: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' },
  nodeTag: { fontSize: '12px', color: '#818cf8' },

  // Comment styles
  commentList: {
    marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px',
  },
  commentItem: {
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.15)',
    borderRadius: '10px', padding: '10px 12px',
    borderLeft: '3px solid #6366f1',
  },
  commentAuthor: {
    fontSize: '11px', fontWeight: 700, color: '#818cf8', marginBottom: '3px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  commentText: { fontSize: '13px', color: '#e2e8f0', lineHeight: 1.5 },
  commentToggle: {
    background: 'none', border: '1px dashed rgba(99,102,241,0.25)',
    borderRadius: '8px', padding: '8px 12px',
    color: '#6366f1', fontSize: '12px', cursor: 'pointer',
    width: '100%', textAlign: 'left', marginBottom: '10px',
  },
  commentForm: {
    display: 'flex', gap: '8px', marginBottom: '10px', alignItems: 'center',
  },
  commentInput: {
    flex: 1, background: '#0f172a',
    border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '13px', color: '#f1f5f9',
    outline: 'none', fontFamily: 'inherit',
  },
  commentSendBtn: {
    background: '#6366f1', border: 'none', borderRadius: '8px',
    padding: '10px 16px', fontSize: '12px', fontWeight: 600,
    color: 'white', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  commentCancelBtn: {
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', padding: '10px 12px', fontSize: '12px',
    color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap',
  },

  nodeActions: {
    display: 'flex', gap: '8px',
    borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px',
  },
  actionBtn: {
    padding: '6px 12px', borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)',
    color: '#94a3b8', fontSize: '12px', cursor: 'pointer',
  },
  actionBtnBlue: { borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.1)', color: '#60a5fa' },
  actionBtnGreen: { borderColor: 'rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.1)', color: '#4ade80' },
  actionBtnRed: { borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', marginLeft: 'auto' },
  empty: { textAlign: 'center', padding: '40px', color: '#475569', fontSize: '15px' },
};
