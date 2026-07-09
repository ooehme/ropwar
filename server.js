import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const vendorDir = path.join(publicDir, 'vendor');

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', [
    'camera=(self)',
    'geolocation=(self)',
    'accelerometer=(self)',
    'gyroscope=(self)',
    'magnetometer=(self)',
    'xr-spatial-tracking=(self)'
  ].join(', '));
  next();
});

app.get('/app.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.sendFile(path.join(publicDir, 'app.js'));
});

app.get('/service-worker.js', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.sendFile(path.join(publicDir, 'service-worker.js'));
});

function sendVendorFile(res, fileName) {
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/javascript');
  res.sendFile(path.join(vendorDir, fileName), (error) => {
    if (!error) return;
    if (!res.headersSent) {
      res.status(404).type('text/plain').send(`public/vendor/${fileName} fehlt im Deployment.`);
    }
  });
}

app.get(['/three.module.js', '/vendor/three.module.js'], (req, res) => {
  sendVendorFile(res, 'three.module.min.js');
});

app.get(['/three.core.js', '/vendor/three.core.js'], (req, res) => {
  sendVendorFile(res, 'three.core.min.js');
});

app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.get('/health', (req, res) => {
  res.json({ ok: true, app: 'ropwar', version: 'v22' });
});

app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Windrad XR app listening on port ${port}`);
});
