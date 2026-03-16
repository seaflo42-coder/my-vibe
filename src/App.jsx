import { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useWebSocket } from './hooks/useWebSocket';
import DisplayView from './components/DisplayView';
import SubmitView from './components/SubmitView';
import MentorView from './components/MentorView';
import RealEstatePage from './components/RealEstatePage';

function getRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('/submit')) return 'submit';
  if (hash.startsWith('/mentor')) return 'mentor';
  if (hash.startsWith('/qr')) return 'qr';
  if (hash.startsWith('/realestate')) return 'realestate';
  return 'display';
}

function QRView() {
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const submitUrl = `${baseUrl}/#/submit`;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0e1a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '40px',
    }}>
      <h1 style={{ color: '#f1f5f9', fontSize: '28px', fontWeight: 700, margin: 0 }}>
        AI Study 2기
      </h1>
      <p style={{ color: '#94a3b8', fontSize: '16px', margin: 0 }}>
        QR 코드를 스캔하여 고민을 등록해주세요
      </p>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '20px',
        boxShadow: '0 20px 60px rgba(99,102,241,0.2)',
      }}>
        <QRCodeSVG
          value={submitUrl}
          size={240}
          level="M"
          bgColor="#ffffff"
          fgColor="#0f172a"
        />
      </div>
      <p style={{ color: '#64748b', fontSize: '13px', margin: 0, textAlign: 'center' }}>
        {submitUrl}
      </p>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(getRoute());
  const ws = useWebSocket();

  useEffect(() => {
    const handleHash = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  switch (route) {
    case 'submit':
      return (
        <SubmitView
          addNode={ws.addNode}
          connected={ws.connected}
          currentSession={ws.currentSession}
        />
      );
    case 'mentor':
      return (
        <MentorView
          nodes={ws.nodes}
          updateStatus={ws.updateStatus}
          deleteNode={ws.deleteNode}
          addComment={ws.addComment}
          connected={ws.connected}
          currentSession={ws.currentSession}
          setSession={ws.setSession}
        />
      );
    case 'qr':
      return <QRView />;
    case 'realestate':
      return <RealEstatePage />;
    default:
      return (
        <DisplayView
          nodes={ws.nodes}
          connected={ws.connected}
          currentSession={ws.currentSession}
        />
      );
  }
}
