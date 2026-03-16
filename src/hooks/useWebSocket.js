import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = window.location.hostname === 'localhost'
  ? `ws://localhost:3001`
  : `wss://${window.location.host}`;

export function useWebSocket() {
  const [nodes, setNodes] = useState([]);
  const [connected, setConnected] = useState(false);
  const [currentSession, setCurrentSession] = useState(1);
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.type) {
        case 'INIT':
          setNodes(msg.nodes);
          break;
        case 'NODE_ADDED':
          setNodes((prev) => {
            if (prev.some((n) => n.id === msg.node.id)) return prev;
            return [...prev, msg.node];
          });
          break;
        case 'NODE_UPDATED':
          setNodes((prev) =>
            prev.map((n) => (n.id === msg.node.id ? msg.node : n))
          );
          break;
        case 'NODE_DELETED':
          setNodes((prev) => prev.filter((n) => n.id !== msg.id));
          break;
        case 'SESSION_CHANGED':
          setCurrentSession(msg.session);
          break;
      }
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const addNode = useCallback(
    (name, concern, tags, session, team) => {
      send({ type: 'ADD_NODE', name, concern, tags, session, team });
    },
    [send]
  );

  const updateStatus = useCallback(
    (id, status) => {
      send({ type: 'UPDATE_STATUS', id, status });
    },
    [send]
  );

  const deleteNode = useCallback(
    (id) => {
      send({ type: 'DELETE_NODE', id });
    },
    [send]
  );

  const addComment = useCallback(
    (id, text, author) => {
      send({ type: 'ADD_COMMENT', id, text, author });
    },
    [send]
  );

  const setSession = useCallback(
    (session) => {
      send({ type: 'SET_SESSION', session });
    },
    [send]
  );

  return {
    nodes,
    connected,
    currentSession,
    addNode,
    updateStatus,
    deleteNode,
    addComment,
    setSession,
  };
}
