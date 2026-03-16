import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import { networkInterfaces } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// ── Naver Real Estate API Proxy ──────────────────────────────────
const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

// Proxy: region list
app.get('/api/naver/regions', async (req, res) => {
  try {
    const cortarNo = req.query.cortarNo || '1100000000';
    const url = `https://new.land.naver.com/api/regions/list?cortarNo=${cortarNo}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': 'https://new.land.naver.com/', 'Host': 'new.land.naver.com' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: article list (mobile API)
app.get('/api/naver/articles', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://m.land.naver.com/cluster/ajax/articleList?${params}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': 'https://m.land.naver.com/', 'Host': 'm.land.naver.com' },
    });
    const text = await resp.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: 'Invalid response from Naver', raw: text.substring(0, 200) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: complex list (mobile API)
app.get('/api/naver/complexes', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://m.land.naver.com/cluster/ajax/complexList?${params}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': 'https://m.land.naver.com/', 'Host': 'm.land.naver.com' },
    });
    const text = await resp.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: 'Invalid response from Naver', raw: text.substring(0, 200) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: complex detail
app.get('/api/naver/complex/:complexNo', async (req, res) => {
  try {
    const url = `https://new.land.naver.com/api/complexes/${req.params.complexNo}?sameAddressGroup=false`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': `https://new.land.naver.com/complexes/${req.params.complexNo}`, 'Host': 'new.land.naver.com' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: articles by region (new.land API)
app.get('/api/naver/articles-region', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://new.land.naver.com/api/articles?${params}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': 'https://new.land.naver.com/', 'Host': 'new.land.naver.com' },
    });
    const text = await resp.text();
    try {
      res.json(JSON.parse(text));
    } catch {
      res.status(502).json({ error: 'Invalid response from Naver', raw: text.substring(0, 200) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: complexes by dong
app.get('/api/naver/region-complexes', async (req, res) => {
  try {
    const params = new URLSearchParams(req.query).toString();
    const url = `https://new.land.naver.com/api/regions/complexes?${params}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': 'https://new.land.naver.com/', 'Host': 'new.land.naver.com' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: article detail
app.get('/api/naver/article/:atclNo', async (req, res) => {
  try {
    const { atclNo } = req.params;
    const url = `https://new.land.naver.com/api/articles/${atclNo}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': `https://new.land.naver.com/articles/${atclNo}`, 'Host': 'new.land.naver.com' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: article photos
app.get('/api/naver/article/:atclNo/photos', async (req, res) => {
  try {
    const { atclNo } = req.params;
    const url = `https://new.land.naver.com/api/articles/photos/${atclNo}`;
    const resp = await fetch(url, {
      headers: { ...NAVER_HEADERS, 'Referer': `https://new.land.naver.com/articles/${atclNo}`, 'Host': 'new.land.naver.com' },
    });
    const data = await resp.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy: Naver land images
app.get('/api/naver/image', async (req, res) => {
  try {
    const imgPath = req.query.path;
    if (!imgPath) return res.status(400).json({ error: 'path required' });
    const url = `https://landthumb-phinf.pstatic.net${imgPath}`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': NAVER_HEADERS['User-Agent'],
        'Referer': 'https://m.land.naver.com/',
      },
    });
    if (!resp.ok) return res.status(resp.status).end();
    res.set('Content-Type', resp.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await resp.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve static files from Vite build
app.use(express.static(join(__dirname, 'dist')));

// SPA fallback: serve index.html for non-API routes
app.get('{*path}', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const server = createServer(app);
const wss = new WebSocketServer({ server });

// In-memory store
let nodes = [];
let nextId = 1;

function broadcast(data, excludeWs) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  // Send current state to new connection
  ws.send(JSON.stringify({ type: 'INIT', nodes }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ADD_NODE': {
        const node = {
          id: nextId++,
          name: msg.name,
          team: msg.team || '',
          concern: msg.concern,
          tags: msg.tags || [],
          status: 'pending', // pending | in_progress | resolved
          session: msg.session || 1,
          createdAt: Date.now(),
          resolvedAt: null,
          comments: [],
        };
        nodes.push(node);
        broadcast({ type: 'NODE_ADDED', node });
        ws.send(JSON.stringify({ type: 'NODE_ADDED', node }));
        break;
      }
      case 'UPDATE_STATUS': {
        const node = nodes.find((n) => n.id === msg.id);
        if (node) {
          node.status = msg.status;
          if (msg.status === 'resolved') {
            node.resolvedAt = Date.now();
          }
          broadcast({ type: 'NODE_UPDATED', node });
          ws.send(JSON.stringify({ type: 'NODE_UPDATED', node }));
        }
        break;
      }
      case 'DELETE_NODE': {
        nodes = nodes.filter((n) => n.id !== msg.id);
        broadcast({ type: 'NODE_DELETED', id: msg.id });
        ws.send(JSON.stringify({ type: 'NODE_DELETED', id: msg.id }));
        break;
      }
      case 'ADD_COMMENT': {
        const node = nodes.find((n) => n.id === msg.id);
        if (node) {
          if (!node.comments) node.comments = [];
          node.comments.push({
            text: msg.text,
            author: msg.author || 'Mentor',
            createdAt: Date.now(),
          });
          broadcast({ type: 'NODE_UPDATED', node });
          ws.send(JSON.stringify({ type: 'NODE_UPDATED', node }));
        }
        break;
      }
      case 'SET_SESSION': {
        broadcast({ type: 'SESSION_CHANGED', session: msg.session });
        ws.send(JSON.stringify({ type: 'SESSION_CHANGED', session: msg.session }));
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  const nets = networkInterfaces();
  let localIp = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIp = net.address;
        break;
      }
    }
  }
  console.log(`\n  WebSocket server running on:`);
  console.log(`  - Local:   ws://localhost:${PORT}`);
  console.log(`  - Network: ws://${localIp}:${PORT}`);
  console.log(`\n  Open the Vite dev server and append:`);
  console.log(`  - /           -> Display dashboard (for TV)`);
  console.log(`  - /#/submit   -> Mobile input (for participants)`);
  console.log(`  - /#/mentor   -> Mentor panel\n`);
});
