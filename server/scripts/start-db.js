const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(1000);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.connect(port, host);
  });
}

function findMongodExe() {
  const candidates = [
    path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-6.0.14.exe'),
    path.resolve(__dirname, '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-6.0.14.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'mongod';
}

async function startDB() {
  const open = await isPortOpen(27017);
  if (open) {
    console.log('[MongoDB Daemon] MongoDB is already running on port 27017.');
    return;
  }

  const exe = findMongodExe();
  const dbPath = path.resolve(__dirname, '../data/db');
  fs.mkdirSync(dbPath, { recursive: true });

  console.log(`[MongoDB Daemon] Starting persistent MongoDB v6.0.14 on port 27017...`);
  console.log(`[MongoDB Daemon] Storage path: ${dbPath}`);

  const child = spawn(exe, [
    '--dbpath', dbPath,
    '--port', '27017',
    '--bind_ip', '127.0.0.1'
  ], {
    stdio: 'inherit'
  });

  child.on('close', (code) => {
    console.log(`[MongoDB Daemon] Process closed with code ${code}`);
  });
}

startDB().catch(console.error);
