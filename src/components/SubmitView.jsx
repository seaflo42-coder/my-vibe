import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const TAG_OPTIONS = [
  'Prompt Engineering', 'RAG', 'AI Agent',
  'Automation', 'ChatGPT', 'Claude',
  'Data Analysis', 'Image Gen', 'Fine-tuning',
  'API', 'Workflow', 'No-code',
];

export default function SubmitView({ addNode, connected, currentSession }) {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [concern, setConcern] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [submitted, setSubmitted] = useState(false);

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 3)
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !concern.trim()) return;
    addNode(name.trim(), concern.trim(), selectedTags, currentSession, team.trim());
    setSubmitted(true);
  };

  const handleReset = () => {
    setName('');
    setTeam('');
    setConcern('');
    setSelectedTags([]);
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <div style={styles.container}>
        <motion.div
          style={styles.successCard}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
        >
          <div style={styles.successIcon}>&#10003;</div>
          <h2 style={styles.successTitle}>등록 완료!</h2>
          <p style={styles.successText}>
            디스플레이에서 내 고민을 확인해보세요.
          </p>
          <p style={styles.successSub}>
            비슷한 고민을 가진 동료를 찾아보세요!
          </p>
          <button onClick={handleReset} style={styles.resetBtn}>
            추가 고민 등록하기
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <motion.div
        style={styles.card}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div style={styles.header}>
          <h1 style={styles.title}>AI Study 2기</h1>
          <p style={styles.subtitle}>Session {currentSession}/4</p>
          <div style={{ ...styles.statusDot, backgroundColor: connected ? '#22c55e' : '#ef4444' }} />
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              style={styles.input}
              autoComplete="off"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>팀명</label>
            <input
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="예: 1팀, Alpha"
              style={styles.input}
              autoComplete="off"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>해결하고 싶은 고민</label>
            <textarea
              value={concern}
              onChange={(e) => setConcern(e.target.value)}
              placeholder="예: 회의록을 AI로 자동 정리하고 싶어요"
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>관련 태그 (최대 3개)</label>
            <div style={styles.tagGrid}>
              {TAG_OPTIONS.map((tag) => (
                <motion.button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    ...styles.tag,
                    ...(selectedTags.includes(tag) ? styles.tagActive : {}),
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  {tag}
                </motion.button>
              ))}
            </div>
          </div>

          <motion.button
            type="submit"
            style={{
              ...styles.submitBtn,
              opacity: name.trim() && concern.trim() ? 1 : 0.5,
            }}
            whileTap={{ scale: 0.97 }}
            disabled={!name.trim() || !concern.trim()}
          >
            고민 등록하기
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  card: {
    background: '#1e293b',
    borderRadius: '20px',
    padding: '28px 24px',
    width: '100%',
    maxWidth: '420px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  header: {
    textAlign: 'center',
    marginBottom: '24px',
    position: 'relative',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#f1f5f9',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#94a3b8',
    marginTop: '4px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    position: 'absolute',
    top: '4px',
    right: '0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  input: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '14px 16px',
    fontSize: '16px',
    color: '#f1f5f9',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  textarea: {
    background: '#0f172a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '14px 16px',
    fontSize: '16px',
    color: '#f1f5f9',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  tagGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tag: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    padding: '8px 14px',
    fontSize: '13px',
    color: '#94a3b8',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tagActive: {
    background: 'rgba(99, 102, 241, 0.2)',
    borderColor: '#6366f1',
    color: '#a5b4fc',
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '14px',
    padding: '16px',
    fontSize: '16px',
    fontWeight: 600,
    color: 'white',
    cursor: 'pointer',
    marginTop: '8px',
  },
  successCard: {
    background: '#1e293b',
    borderRadius: '20px',
    padding: '40px 32px',
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  successIcon: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '28px',
    color: 'white',
    margin: '0 auto 16px',
  },
  successTitle: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f1f5f9',
    margin: '0 0 8px',
  },
  successText: {
    fontSize: '15px',
    color: '#94a3b8',
    margin: 0,
  },
  successSub: {
    fontSize: '13px',
    color: '#64748b',
    marginTop: '4px',
  },
  resetBtn: {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    padding: '12px 24px',
    fontSize: '14px',
    color: '#94a3b8',
    cursor: 'pointer',
    marginTop: '24px',
  },
};
