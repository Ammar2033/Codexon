# Codexon - AI Model Marketplace Platform

A full-stack platform for building, deploying, and monetizing AI models.

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.12
- PostgreSQL 16
- Redis 7
- Docker (optional, for containerized deployment)

### Backend Setup

```bash
cd backend
npm install
# Update .env with your database credentials
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Running with Docker

```bash
docker-compose up
```

## Project Structure

```
codexon/
├── backend/           # Node.js API server
│   ├── src/
│   │   ├── controllers/   # Request handlers
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Auth middleware
│   │   └── config/        # Database config
│   └── package.json
│
├── frontend/          # Next.js 14 frontend
│   ├── app/           # App router pages
│   ├── components/    # React components
│   └── lib/           # API client
│
├── runtime/           # Python model runtime
│   ├── app.py         # FastAPI inference server
│   └── Dockerfile
│
├── database/          # PostgreSQL schema
│   └── schema.sql
│
├── storage/           # Model file storage
│
└── example_model/     # Sample model package
```

## API Endpoints

### Authentication
- POST /auth/register - Register new user
- POST /auth/login - Login
- POST /auth/logout - Logout
- GET /auth/me - Get current user

### Users
- POST /users/become-creator - Upgrade to creator account

### Models
- GET /models/marketplace - List published models
- GET /models/my - List user's models (creator only)
- GET /models/:id - Get model details
- POST /models/upload - Upload model ZIP (creator only)
- POST /models/:id/deploy - Deploy model (creator only)
- POST /models/:id/publish - Publish model (creator only)
- POST /models/:id/test - Test model (creator only)
- POST /models/:id/inference - Run inference (with API key)

### API Keys
- POST /api-keys/create - Create API key
- GET /api-keys - List API keys
- DELETE /api-keys/:id - Delete API key

### Revenue
- GET /revenue - Get revenue dashboard (creator only)

## Model Package Format

Upload a ZIP containing:

```
model_package/
├── model/
│   └── model.onnx      # or model.pt
├── app.py              # FastAPI inference server
├── test.py             # Optional test script
├── requirements.txt    # Python dependencies
└── aimodel.codexon     # Deployment manifest
```

Example aimodel.codexon:
```json
{
  "model": {
    "name": "my-model",
    "version": "1.0",
    "description": "My AI model"
  },
  "runtime": {
    "framework": "onnx",
    "python": "3.12"
  },
  "resources": {
    "cpu": 2,
    "memory": "4GB"
  },
  "api": {
    "endpoint": "/predict"
  },
  "billing": {
    "price_per_request": 0.002
  }
}
```

## Technology Stack

- **Frontend**: Next.js 14, React, TailwindCSS
- **Backend**: Node.js, Express
- **Runtime**: Python, FastAPI
- **Database**: PostgreSQL
- **Cache**: Redis
- **Container**: Docker