# Video Storage

A robust application for managing video uploads, processing, and storage using Vercel Blob and FastAPI.

## Overview

This system allows users to upload videos of any size, which are then stored in Vercel Blob storage. The application automatically processes videos to create thumbnails, extract metadata, and make the content ready for viewing. The architecture is designed to handle large files efficiently through a Node.js bridge that facilitates uploads directly to cloud storage.

## Architecture

- **FastAPI Backend**: Handles video registration, processing, and metadata management
- **Node.js Bridge**: Manages large file uploads to Vercel Blob Storage
- **PostgreSQL Database**: Stores video metadata and processing status
- **Docker**: Containerizes all components for easy deployment

## Getting Started

### Prerequisites

- Docker and Docker Compose

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/video-storage.git
cd video-storage
```

2. **Create .env file**

```bash
cp .env.example .env
```
Edit the `.env` file with your Vercel Blob credentials and other configuration.

3. **Run the application**

```bash
docker compose up -d
```

4. **Run database migrations**

After starting the containers, you need to run the database migrations:

```bash
docker compose exec server python -m alembic upgrade head
```

## Environment Variables

The following environment variables should be configured in your `.env` file:

```
# Vercel Blob Storage
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
BLOB_STORE_ID=store_your_store_id  # Store ID, can be found in your blob storage URL


```

## Database Migrations

Migration files are located in the `app/migrations` directory.

This application uses Alembic for database migrations, with a preference for manual migration management rather than automatic migrations.

### Running Migrations

To apply all migrations:

```bash
docker compose exec server python -m alembic upgrade head
```

### Checking Current Migration

```bash
docker compose exec server python -m alembic current
```

## Project Structure

```
video-storage/
├── app/                   # FastAPI application
│   ├── server/            # Server code
│   │   ├── endpoints/     # API endpoints
│   │   ├── storages/      # Database models
│   │   └── video/         # Video processing logic
│   ├── migrations/        # Database migrations
│   └── __main__.py        # Application entry point
├── blob-bridge/           # Node.js bridge for Vercel Blob
│   ├── vercel-blob-bridge.js  # Bridge implementation
│   └── package.json       # Node.js dependencies
├── caddy/                 # Caddy web server
│   ├── config/            # Caddy configuration
│   ├── data/              # Caddy data
│   ├── public/            # Public assets
│   └── Caddyfile          # Main Caddy configuration file
├── front-end/             # Frontend web application
│   ├── index.html         # Main HTML file
│   ├── script.js          # JavaScript code
│   └── style.css          # CSS styles
├── docker/                # Docker configuration
├── psql/                  # PostgreSQL initialization scripts
├── .env.example           # Example environment variables
├── docker-compose.yml     # Docker Compose configuration
└── makefile               # Make commands for common operations
```

## Key Features

- Large file uploads directly to cloud storage
- Video metadata extraction and thumbnail generation
- Progress tracking for processing status
- Scalable architecture suitable for production use
- Efficient handling of storage and database resources

## Web Server Configuration

The application uses Caddy as a web server and reverse proxy. The main configuration file is located at `caddy/Caddyfile`.

### Setting Up Caddy

To run the application with Caddy:

1. Change the domain in the Caddyfile to your own domain
2. Uncomment the Caddy service code in the docker-compose.yml file
3. In the `front-end/script.js` file, update the API URLs for server deployment:
   ```javascript
   // Change these lines:
   const API_BASE_URL = 'http://localhost:8000';
   const BLOB_BRIDGE_URL = 'http://localhost:3001';
   
   // To relative paths for Caddy proxy:
   const API_BASE_URL = '/api';
   const BLOB_BRIDGE_URL = '/blob-bridge';
   ```

### Logging

Log configuration is defined in the Caddy server configuration. Logs are stored in the `/var/log/caddy/` directory by default.

## API Documentation

When running the application, API documentation is available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`