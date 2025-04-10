# URL Shortener Service

## Introduction

A URL shortener service that converts long URLs into shorter, more manageable links. This service is built using Node.js and MongoDB, following a clean architecture pattern. The application provides a simple API to create short URLs and redirect users to the original URLs when they visit the shortened version.

## Features
- Convert long URLs to short, unique 7-character URLs
- Redirect users from short URLs to original URLs
- Track visit counts for each shortened URL
- RESTful API endpoints
- Docker containerization for easy deployment
- MongoDB for data persistence
- Winston logger for application monitoring

## Tech Stack
- **Backend**: Node.js with Express
- **Database**: MongoDB
- **Containerization**: Docker & Docker Compose
- **Logging**: Winston
- **Environment Management**: dotenv

## Project Structure
```
url-shortener-simple/
├── src/
│   ├── config/             # Configuration files
│   │   └── index.js        # Environment and app configuration
│   ├── controllers/        # Request handlers
│   │   └── urlController.js # URL-related controller logic
│   ├── models/            # Database models
│   │   └── urlModel.js     # MongoDB URL schema
│   ├── routes/            # API routes
│   │   └── urlRoutes.js    # URL endpoints
│   ├── services/          # Business logic
│   │   └── urlService.js   # URL shortening service
│   └── app.js             # Main application file
├── .env                   # Environment variables
├── .gitignore            # Git ignore file
├── package.json          # Dependencies and scripts
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose configuration
└── README.md             # Project documentation
```

## Step-by-Step Implementation Guide

### Step 1: Project Initialization
```bash
# Create project directory
mkdir url-shortner-simple
cd url-shortner-simple

# Initialize npm project
npm init -y

# Install dependencies
npm install express mongoose dotenv winston
npm install --save-dev nodemon

# Create project structure
mkdir -p src/config src/controllers src/models src/routes src/services
```

### Step 2: Configuration Files

#### 2.1: Create .env file
```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/url_shortener
BASE_URL=http://localhost:3000
```

#### 2.2: Create .gitignore file
```
node_modules/
.env
.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

#### 2.3: Create config/index.js
```javascript
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI,
  baseUrl: process.env.BASE_URL,
};
```

### Step 3: Database Model

#### 3.1: Create models/urlModel.js
```javascript
const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
  shortUrlId: { type: String, required: true, unique: true },
  longUrl: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  visits: { type: Number, default: 0 }
});

module.exports = mongoose.model('Url', urlSchema);
```

### Step 4: URL Service

#### 4.1: Create services/urlService.js
```javascript
const Url = require('../models/urlModel');
const config = require('../config');

function generateShortUrlId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 7; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

async function shortenUrl(longUrl) {
  const shortUrlId = generateShortUrlId();
  const url = new Url({ shortUrlId, longUrl });
  await url.save();
  return `${config.baseUrl}/${shortUrlId}`;
}

async function getLongUrl(shortUrlId) {
  const url = await Url.findOne({ shortUrlId });
  if (!url) throw new Error('URL not found');
  
  // Increment visit count
  url.visits += 1;
  await url.save();
  
  return url.longUrl;
}

module.exports = { shortenUrl, getLongUrl };
```

### Step 5: URL Controller

#### 5.1: Create controllers/urlController.js
```javascript
const { shortenUrl, getLongUrl } = require('../services/urlService');

async function createShortUrl(req, res) {
  try {
    const { longUrl } = req.body;
    if (!longUrl || !/^https?:\/\//.test(longUrl)) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
    const shortUrl = await shortenUrl(longUrl);
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

### Step 6: URL Routes

#### 6.1: Create routes/urlRoutes.js
```javascript
const express = require('express');
const { createShortUrl, redirectToLongUrl } = require('../controllers/urlController');

const router = express.Router();

router.post('/urls', createShortUrl);
router.get('/:shortUrlId', redirectToLongUrl);

module.exports = router;
```

### Step 7: Main Application

#### 7.1: Create app.js
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
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/', urlRoutes);

// Error Handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Database Connection
mongoose.connect(config.mongoUri)
  .then(() => logger.info('MongoDB connected'))
  .catch(err => logger.error('MongoDB connection error:', err));

// Start Server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
```

### Step 8: Docker Configuration

#### 8.1: Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

#### 8.2: Create docker-compose.yml
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - MONGO_URI=mongodb://mongodb:27017/url_shortener
      - BASE_URL=http://localhost:3000
    depends_on:
      - mongodb
    volumes:
      - .:/app
      - /app/node_modules
    networks:
      - url-shortener-network

  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    networks:
      - url-shortener-network

volumes:
  mongodb_data:

networks:
  url-shortener-network:
    driver: bridge
```

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- Docker and Docker Compose (for containerized deployment)
- Postman (for API testing)

### Local Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/url_shortener
   BASE_URL=http://localhost:3000
   ```

### Docker Setup
1. Build and run using Docker Compose:
   ```bash
   docker-compose up --build
   ```

## API Documentation

### 1. Create Short URL
- **Endpoint**: `POST /urls`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "longUrl": "https://www.example.com"
  }
  ```
- **Success Response** (201 Created):
  ```json
  {
    "shortUrl": "http://localhost:3000/abc123"
  }
  ```
- **Error Response** (400 Bad Request):
  ```json
  {
    "error": "Invalid URL"
  }
  ```

### 2. Redirect to Long URL
- **Endpoint**: `GET /:shortUrlId`
- **Success**: Redirects to the original URL (301 Moved Permanently)
- **Error Response** (404 Not Found):
  ```json
  {
    "error": "Not Found"
  }
  ```

## Testing with Postman

### 1. Create Short URL
1. Open Postman
2. Create a new request:
   - Method: `POST`
   - URL: `http://localhost:3000/urls`
   - Headers: 
     - Key: `Content-Type`
     - Value: `application/json`
   - Body (raw JSON):
     ```json
     {
       "longUrl": "https://www.google.com"
     }
     ```
3. Send the request
4. Expected response:
   ```json
   {
     "shortUrl": "http://localhost:3000/abc123"
   }
   ```

### 2. Test Redirect
1. Create a new request:
   - Method: `GET`
   - URL: `http://localhost:3000/{shortUrlId}` (replace {shortUrlId} with the ID from previous response)
2. Important: In Postman settings:
   - Go to Settings → General
   - Disable "Automatically follow redirects"
3. Send the request
4. Expected response:
   - Status: 301 Moved Permanently
   - Headers: Location header with the original URL

### 3. Test Error Cases
1. Invalid URL:
   - Method: `POST`
   - URL: `http://localhost:3000/urls`
   - Body:
     ```json
     {
       "longUrl": "invalid-url"
     }
     ```
   - Expected: 400 Bad Request

2. Non-existent Short URL:
   - Method: `GET`
   - URL: `http://localhost:3000/nonexistent`
   - Expected: 404 Not Found

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### Docker Mode
```bash
# Start services
docker-compose up

# Start in detached mode
docker-compose up -d

# Stop services
docker-compose down
```

## Monitoring and Logging
- Application logs are handled by Winston
- Logs include HTTP requests and errors
- MongoDB operations are logged
- Docker container logs can be viewed using `docker-compose logs`

## Error Handling
- Invalid URLs return 400 Bad Request
- Non-existent short URLs return 404 Not Found
- Server errors return 500 Internal Server Error
- All errors are logged using Winston

## Best Practices Implemented
- Clean architecture with separation of concerns
- Environment variable configuration
- Docker containerization
- Error handling and logging
- Input validation
- RESTful API design
- MongoDB for data persistence
- Visit tracking for analytics 