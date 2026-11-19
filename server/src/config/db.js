const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

let gridfsBucket = null;
let mongoMemoryServer = null;
let localMongodProcess = null;

function isPortOpen(port, host = '127.0.0.1', timeout = 1000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeout);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', () => {
      s.destroy();
      resolve(false);
    });
    s.connect(port, host);
  });
}

function findMongodExe() {
  const candidates = [
    path.resolve(__dirname, '../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-6.0.14.exe'),
    path.resolve(__dirname, '../../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-6.0.14.exe'),
    path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-6.0.14.exe'),
    path.resolve(__dirname, '../../node_modules/mongodb-memory-server-core/mongod')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return 'mongod';
}

async function ensureLocalPersistentMongoDB(port = 27017) {
  const open = await isPortOpen(port);
  if (open) {
    return;
  }

  const dbDir = path.resolve(__dirname, '../../data/db');
  fs.mkdirSync(dbDir, { recursive: true });

  const exe = findMongodExe();
  console.log(`[MongoDB] Initializing persistent local MongoDB storage at ${dbDir}...`);

  localMongodProcess = spawn(exe, [
    '--dbpath', dbDir,
    '--port', port.toString(),
    '--bind_ip', '127.0.0.1'
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  localMongodProcess.stderr.on('data', (d) => {
    const s = d.toString();
    if (!s.includes('TLS') && !s.includes('Deprecated')) {
      console.warn('[MongoDB Process Stderr]:', s.trim());
    }
  });

  localMongodProcess.on('close', (code) => {
    localMongodProcess = null;
  });

  // Wait for mongod to accept connections
  let isReady = false;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (await isPortOpen(port)) {
      isReady = true;
      break;
    }
  }

  if (!isReady) {
    throw new Error(`Failed to start persistent MongoDB on port ${port}. Please ensure no other process is holding ${dbDir}`);
  }

  console.log(`[MongoDB] Persistent MongoDB engine active on 127.0.0.1:${port}`);

  // Register clean shutdown
  const cleanup = () => {
    if (localMongodProcess) {
      try {
        localMongodProcess.kill('SIGINT');
      } catch (e) {}
      localMongodProcess = null;
    }
  };

  process.once('SIGINT', cleanup);
  process.once('SIGTERM', cleanup);
  process.once('exit', cleanup);
}

async function connectDB(customUri) {
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  let uri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/deepshield';

  // In test environment or if forced memory DB, use isolated MongoMemoryServer
  if (process.env.NODE_ENV === 'test' || process.env.USE_MEMORY_DB === 'true') {
    if (!mongoMemoryServer) {
      const exe = findMongodExe();
      if (exe && fs.existsSync(exe)) {
        process.env.MONGOMS_SYSTEM_BINARY = exe;
      }
      mongoMemoryServer = await MongoMemoryServer.create();
    }
    uri = mongoMemoryServer.getUri();
    const conn = await mongoose.connect(uri);
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, { bucketName: 'uploads' });
    return conn;
  }

  // Development and Production: Guarantee persistent database storage
  try {
    const isLocal = uri.includes('127.0.0.1:27017') || uri.includes('localhost:27017');
    if (isLocal) {
      await ensureLocalPersistentMongoDB(27017);
    }

    const conn = await mongoose.connect(uri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 10000
    });

    console.log(`[MongoDB] Connected persistently to ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.connection.db, { bucketName: 'uploads' });
    return conn;
  } catch (err) {
    console.error(`[MongoDB Connection Error]: Could not establish connection to ${uri}: ${err.message}`);
    throw err;
  }
}

function getGridFSBucket() {
  if (!gridfsBucket) {
    if (mongoose.connection && mongoose.connection.db) {
      gridfsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
    } else {
      throw new Error('Database not connected. Cannot access GridFS bucket.');
    }
  }
  return gridfsBucket;
}

async function disconnectDB() {
  if (mongoose.connection && mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (localMongodProcess) {
    try {
      localMongodProcess.kill('SIGINT');
    } catch (e) {}
    localMongodProcess = null;
  }
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}

module.exports = { connectDB, getGridFSBucket, disconnectDB };
