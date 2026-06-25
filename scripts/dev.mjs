// Start local API server + Vite on http://localhost:3000
import { spawn, execSync } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VITE_PORT = 3000;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

function isPortFree(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(port, '127.0.0.1');
  });
}

function killPort(port) {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch { /* ignore */ }
    }
  } catch { /* port not in use */ }
}

async function ensureVitePort() {
  if (await isPortFree(VITE_PORT)) return;
  console.log(`Port ${VITE_PORT} is busy — stopping old process...`);
  killPort(VITE_PORT);
  await new Promise((r) => setTimeout(r, 800));
  if (!(await isPortFree(VITE_PORT))) {
    console.error(`\nPort ${VITE_PORT} is still in use. Close other terminals or run:`);
    console.error(`  taskkill /F /IM node.exe\n`);
    process.exit(1);
  }
}

let server;
let vite;

function shutdown(code = 0) {
  try { server?.kill(); } catch { /* ignore */ }
  try { vite?.kill(); } catch { /* ignore */ }
  process.exit(code);
}

await ensureVitePort();

server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit' });
vite = spawn(process.execPath, [viteBin, '--port', String(VITE_PORT)], { cwd: root, stdio: 'inherit' });

server.on('error', (err) => {
  console.error('API server failed:', err.message);
  shutdown(1);
});
vite.on('error', (err) => {
  console.error('Vite failed:', err.message);
  shutdown(1);
});
server.on('exit', (code) => { if (code) shutdown(code); });
vite.on('exit', (code) => { if (code) shutdown(code); });

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
