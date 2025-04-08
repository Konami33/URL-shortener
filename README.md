# URL Shortener

### Project Overview
- **Tech Stack**:
  - **Node.js**: Backend runtime with Express for APIs.
  - **PostgreSQL**: Stores pre-generated unique short URL keys.
  - **MongoDB**: Stores short-to-long URL mappings and metadata.
  - **Redis**: Caches frequently accessed URL mappings for low latency.
- **APIs**:
  - `POST /api/urls`: Create a short URL from a long URL.
  - `GET /api/urls/:shortUrlId`: Redirect to the long URL.
- **Features**:
  - Unique 7-character short URLs (alphanumeric: A-Z, a-z, 0-9).
  - High availability and low latency via caching and load balancing.
  - Error handling, logging, and environment configuration.

### Step 1: Project Structure
Here’s a clean, modular structure for a production-ready Node.js app:

```
url-shortener/
├── src/
│   ├── config/             # Configuration files (DB, Redis, env)
│   │   └── index.js
│   ├── controllers/        # API logic
│   │   └── urlController.js
│   ├── services/           # Business logic (URL shortening, caching)
│   │   ├── urlService.js
│   │   └── keyService.js
│   ├── models/             # Database schemas/models
│   │   ├── mongoUrlModel.js
│   │   └── pgKeyModel.js
│   ├── middleware/         # Custom middleware (e.g., error handling)
│   │   └── errorHandler.js
│   ├── routes/             # API routes
│   │   └── urlRoutes.js
│   ├── utils/              # Helper functions (e.g., key generation)
│   │   └── keyGenerator.js
│   └── app.js              # Main Express app setup
├── .env                    # Environment variables
├── .gitignore              # Git ignore file
├── package.json            # Dependencies and scripts
└── README.md               # Project documentation
```

### Step 2: Setup and Dependencies
1. **Initialize the Project**:
   ```bash
   mkdir url-shortener
   cd url-shortener
   npm init -y
   ```

2. **Install Dependencies**:
   ```bash
   npm install express dotenv mongoose pg redis winston
   npm install --save-dev nodemon
   ```

   - `express`: Web framework.
   - `dotenv`: Load environment variables.
   - `mongoose`: MongoDB ORM.
   - `pg`: PostgreSQL client.
   - `redis`: Redis client.
   - `winston`: Logging.
   - `nodemon`: Auto-restart during development.

3. **Update `package.json` Scripts**:
   ```json
   "scripts": {
     "start": "node src/app.js",
     "dev": "nodemon src/app.js"
   }
   ```

---

### Step 3: Environment Configuration
Create a `.env` file for sensitive configuration:

```
# .env
PORT=3000
MONGO_URI=mongodb://localhost:27017/url_shortener
PG_HOST=localhost
PG_PORT=5432
PG_USER=your_pg_user
PG_PASSWORD=your_pg_password
PG_DATABASE=url_shortener
REDIS_HOST=localhost
REDIS_PORT=6379
BASE_URL=http://short.ly
```

Load it in `src/config/index.js`:

```javascript
// src/config/index.js
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI,
  pgConfig: {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  },
  redisConfig: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
  baseUrl: process.env.BASE_URL,
};
```

---

### Step 4: Database Setup
#### PostgreSQL (Key Store)
- **Schema**: Table `keys` to store pre-generated short URL IDs.
- Run this SQL to set up:
  ```sql
  CREATE TABLE keys (
    short_url_id VARCHAR(7) PRIMARY KEY,
    used BOOLEAN DEFAULT FALSE
  );
  ```
- Pre-populate with keys (e.g., via a script later).

#### MongoDB (URL Store)
- **Schema**: Collection `urls` for URL mappings.

#### Redis
- No setup needed; we’ll use it as an in-memory key-value store.

---

### Step 5: Models
#### PostgreSQL Key Model (`src/models/pgKeyModel.js`)
```javascript
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.pgConfig);

async function getUnusedKey() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      'SELECT short_url_id FROM keys WHERE used = FALSE LIMIT 1 FOR UPDATE'
    );
    if (!res.rows.length) throw new Error('No unused keys available');
    const key = res.rows[0].short_url_id;
    await client.query('UPDATE keys SET used = TRUE WHERE short_url_id = $1', [key]);
    await client.query('COMMIT');
    return key;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getUnusedKey };
```

#### MongoDB URL Model (`src/models/mongoUrlModel.js`)
```javascript
const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  shortUrlId: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true },
  userId: { type: String }, // Optional
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Url', urlSchema);
```

---

### Step 6: Utility Functions
#### Key Generator (`src/utils/keyGenerator.js`)
```javascript
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateKey(length = 7) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Pre-populate PostgreSQL with keys (run this separately)
async function prePopulateKeys(count) {
  const { Pool } = require('pg');
  const config = require('../config');
  const pool = new Pool(config.pgConfig);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < count; i++) {
      const key = generateKey();
      await client.query('INSERT INTO keys (short_url_id, used) VALUES ($1, $2) ON CONFLICT DO NOTHING', [key, false]);
    }
    await client.query('COMMIT');
    console.log(`${count} keys populated`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { generateKey, prePopulateKeys };
```

Run `prePopulateKeys(1000000)` separately to populate 1 million keys.

---

### Step 7: Services
#### Key Service (`src/services/keyService.js`)
```javascript
const { getUnusedKey } = require('../models/pgKeyModel');

async function fetchUniqueKey() {
  return await getUnusedKey();
}

module.exports = { fetchUniqueKey };
```

#### URL Service (`src/services/urlService.js`)
```javascript
const redis = require('redis');
const config = require('../config');
const Url = require('../models/mongoUrlModel');
const { fetchUniqueKey } = require('./keyService');

const redisClient = redis.createClient(config.redisConfig);
redisClient.connect();

async function shortenUrl(longUrl, userId) {
  const shortUrlId = await fetchUniqueKey();
  const url = new Url({ shortUrlId, longUrl, userId });
  await url.save();
  await redisClient.setEx(shortUrlId, 3600, longUrl); // Cache for 1 hour
  return `${config.baseUrl}/${shortUrlId}`;
}

async function getLongUrl(shortUrlId) {
  // Check cache first
  const cachedUrl = await redisClient.get(shortUrlId);
  if (cachedUrl) return cachedUrl;

  // Fallback to MongoDB
  const url = await Url.findOne({ shortUrlId });
  if (!url) throw new Error('URL not found');

  // Cache the result
  await redisClient.setEx(shortUrlId, 3600, url.longUrl);
  return url.longUrl;
}

module.exports = { shortenUrl, getLongUrl };
```

---

### Step 8: Controllers
#### URL Controller (`src/controllers/urlController.js`)
```javascript
const { shortenUrl, getLongUrl } = require('../services/urlService');

async function createShortUrl(req, res) {
  try {
    const { longUrl } = req.body;
    if (!longUrl || !/^https?:\/\//.test(longUrl)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const shortUrl = await shortenUrl(longUrl, null); // userId optional
    res.status(201).json({ shortUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function redirectToLongUrl(req, res) {
  try {
    const { shortUrlId } = req.params;
    const longUrl = await getLongUrl(shortUrlId);
    res.redirect(301, longUrl);
  } catch (err) {
    if (err.message === 'URL not found') {
      return res.status(404).json({ error: 'Not Found' });
    }
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createShortUrl, redirectToLongUrl };
```

---

### Step 9: Routes
#### URL Routes (`src/routes/urlRoutes.js`)
```javascript
const express = require('express');
const { createShortUrl, redirectToLongUrl } = require('../controllers/urlController');

const router = express.Router();

router.post('/urls', createShortUrl);
router.get('/urls/:shortUrlId', redirectToLongUrl);

module.exports = router;
```

---

### Step 10: Main App
#### App Setup (`src/app.js`)
```javascript
const express = require('express');
const mongoose = require('mongoose');
const winston = require('winston');
const config = require('./config');
const urlRoutes = require('./routes/urlRoutes');

const app = express();

// Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api', urlRoutes);

// Error Handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Database Connections
mongoose.connect(config.mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error(err));

// Start Server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
```

---

### Step 11: Production-Ready Enhancements
1. **Dockerize the App**:
   Create a `Dockerfile`:
   ```dockerfile
   FROM node:16
   WORKDIR /app
   COPY package*.json ./
   RUN npm install
   COPY . .
   CMD ["npm", "start"]
   ```
   Use `docker-compose` for MongoDB, PostgreSQL, and Redis.

2. **Rate Limiting**:
   Add `express-rate-limit` to prevent abuse.

3. **Monitoring**:
   Integrate Prometheus and Grafana for metrics (e.g., request latency, cache hit rate).

4. **Testing**:
   Write unit tests with Jest for services and controllers.

5. **Deployment**:
   Deploy on AWS (ECS for app, RDS for PostgreSQL, ElastiCache for Redis, MongoDB Atlas).

---

### Running the Project
1. Start MongoDB, PostgreSQL, and Redis locally (e.g., via Docker).
2. Populate PostgreSQL with keys:
   ```bash
   node -e "require('./src/utils/keyGenerator').prePopulateKeys(1000000)"
   ```
3. Run the app:
   ```bash
   npm run dev
   ```
4. Test APIs:
   - `curl -X POST -H "Content-Type: application/json" -d '{"longUrl":"https://example.com"}' http://localhost:3000/api/urls`
   - `curl http://localhost:3000/api/urls/<shortUrlId>`

---

This implementation is scalable (via Redis caching and MongoDB sharding), reliable (ACID transactions for keys), and production-ready with logging and error handling. Let me know if you’d like to refine any part!