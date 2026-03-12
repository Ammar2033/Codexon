TASK

Build a full-stack AI model hosting and marketplace platform called Codexon.

Codexon allows developers to upload AI models, deploy them as API endpoints, and earn revenue when users call their model APIs.

The system must include:

• authentication
• developer accounts
• model upload
• model deployment
• .codexon manifest parsing
• dockerized model execution
• API inference
• API key management
• usage billing
• revenue sharing
• analytics dashboards

The platform architecture must use:

Frontend:
Next.js 14 (React)
TailwindCSS

Backend API:
Node.js (Express or preferably NestJS style modular routing)

Model Runtime:
Python service running inside Docker containers

Database:
PostgreSQL

Queue / cache:
Redis

Container orchestration:
Docker

Monitoring ready architecture.

--------------------------------------------------

CORE PLATFORM CONCEPT

There are two types of users:

1. Normal users
2. Creators (developers)

A normal user can:

• browse models
• test models
• generate API keys
• send API requests

A creator can:

• upload models
• deploy models
• publish models
• monetize models
• view revenue and usage analytics

--------------------------------------------------

AUTHENTICATION SYSTEM

Implement:

POST /auth/register
POST /auth/login
POST /auth/logout

Database table users:

id
email
password_hash
is_creator
created_at

After login, user gets JWT token.

--------------------------------------------------

CREATOR ACCOUNT SYSTEM

After login, the user dashboard must show:

"Become a Creator"
or
"Switch to Developer Account"

When clicked:

POST /users/become-creator

Database update:

is_creator = true

Once enabled the user gains access to the Developer Panel.

--------------------------------------------------

DEVELOPER PANEL

Creator dashboard must include:

• Deploy Model
• My Models
• Draft Models
• Model Usage
• Revenue Analytics

--------------------------------------------------

MODEL UPLOAD SYSTEM

Creators upload a zipped project.

Example:

POST /models/upload

Upload format:

multipart/form-data

The uploaded file is a ZIP containing:

model_package/

model/
model.onnx or model.pt

app.py
test.py
requirements.txt
aimodel.codexon

--------------------------------------------------

MODEL PACKAGE STRUCTURE

Example:

model_package/

model/
model.onnx

app.py
test.py
requirements.txt
aimodel.codexon

--------------------------------------------------

.codoexon MANIFEST

The .codexon file describes deployment configuration.

Example:

{
  "model": {
    "name": "image-classifier",
    "version": "1.0",
    "description": "Image classification model"
  },

  "runtime": {
    "framework": "onnx",
    "python": "3.12"
  },

  "resources": {
    "cpu": 2,
    "memory": "8GB",
    "gpu": 1
  },

  "api": {
    "endpoint": "/predict"
  },

  "billing": {
    "price_per_request": 0.002
  }
}

Backend must parse this file.

--------------------------------------------------

MODEL STORAGE

Uploaded ZIP files must be stored in object storage style folder:

storage/models/{model_id}/{version}/

--------------------------------------------------

MODEL DATABASE

Table models:

id
owner_id
name
description
status (draft / deployed / published)
created_at

Table model_versions:

id
model_id
version
storage_path
codexon_config
status

--------------------------------------------------

MODEL DEPLOYMENT

Creators can click:

Deploy Model

Endpoint:

POST /models/{id}/deploy

Deployment process:

1 parse .codexon
2 validate files
3 build docker runtime
4 start container
5 register API endpoint

--------------------------------------------------

MODEL RUNTIME SYSTEM

Models run in Python Docker containers.

Each container must:

install requirements.txt
load model weights
run FastAPI server

Example runtime:

uvicorn app:app --host 0.0.0.0 --port 8000

--------------------------------------------------

MODEL TEST SYSTEM

Before publishing, creator can test the model.

If test.py exists:

Backend runs:

python test.py

Return result logs.

Also allow API testing UI in frontend.

--------------------------------------------------

MODEL PUBLISHING

Creator can publish model to marketplace.

POST /models/{id}/publish

Status changes:

draft → published

--------------------------------------------------

MODEL MARKETPLACE

Users can browse available models.

GET /marketplace/models

Model page must show:

• description
• price per request
• usage examples
• API documentation

--------------------------------------------------

MODEL USAGE PAGE

When clicking a model:

Show:

How to use this model

Example request:

POST https://api.codexon.ai/v1/models/{model_id}

Headers:

Authorization: Bearer API_KEY

Example body:

{
  "input": "data"
}

--------------------------------------------------

API KEY SYSTEM

Users must create API keys.

Endpoints:

POST /api-keys/create
GET /api-keys
DELETE /api-keys/{id}

Database:

api_keys

id
user_id
key_hash
created_at

--------------------------------------------------

API REQUEST FLOW

User sends request:

Client
↓
NGINX
↓
Node.js API
↓
Model router
↓
Python runtime container
↓
Inference result

--------------------------------------------------

USAGE BILLING SYSTEM

Each API call generates usage event.

Table usage_events:

id
model_id
user_id
latency
timestamp
request_size

Billing calculation:

price_per_request from .codexon

--------------------------------------------------

REVENUE SYSTEM

Creator earns money when their model is used.

Revenue calculation:

request_price = creator_price

Platform commission example:

20%

Example:

request price = $0.01

Creator receives:

$0.008

Platform receives:

$0.002

--------------------------------------------------

CREATOR REVENUE DASHBOARD

Developer panel must show:

Revenue
Model Usage
API Calls
Commission

Charts:

requests per day
revenue per day
top models

--------------------------------------------------

DATABASE

Use PostgreSQL.

Tables required:

users
models
model_versions
api_keys
usage_events
transactions
wallets

--------------------------------------------------

FRONTEND REQUIREMENTS

Next.js 14

Pages:

/login
/register
/dashboard
/become-creator
/developer
/developer/models
/developer/deploy
/developer/revenue
/models
/models/[id]

--------------------------------------------------

FRONTEND FEATURES

User dashboard

Creator dashboard

Model upload UI

ZIP upload

Model usage documentation

API request tester

Charts for revenue

--------------------------------------------------

MODEL TEST UI

Allow testing model with JSON input.

Call:

POST /models/{id}/test

--------------------------------------------------

FUTURE SDK SUPPORT

Platform will later include:

Codexon Python SDK
Codexon Node.js SDK

For now usage must be via HTTP API.

--------------------------------------------------

TECH STACK SUMMARY

Frontend
Next.js
Tailwind

Backend API
Node.js

Runtime
Python Docker

Database
PostgreSQL

Queue
Redis

--------------------------------------------------

OUTPUT REQUIREMENTS

Generate:

1 Full backend folder structure
2 Node.js API implementation
3 Python model runner
4 .codexon parser
5 PostgreSQL schema
6 Docker runtime
7 Next.js frontend pages
8 API routes
9 Deployment architecture