const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authMiddleware = require('./middleware/auth');
const tessSync = require('./routes/tess-sync');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tesseract';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.json({ message: 'TESSERACT Server', version: '2.1.0', endpoints: ['POST/GET /api/tess/metrics/sync'] });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

tessSync(app, authMiddleware);

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[SERVER] Connected to MongoDB');
    app.listen(PORT, () => console.log(`[SERVER] Running on port ${PORT}`));
  })
  .catch(err => {
    console.error('[SERVER] MongoDB connection error:', err.message);
    process.exit(1);
  });
