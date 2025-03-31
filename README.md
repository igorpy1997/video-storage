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
- Python 3.12+
- Node.js 18+
- Make

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/video-storage.git
cd video-storage
```

2. **Install dependencies**

```bash
# Create virtual environment using UV
uv venv --python=3.12

# Activate virtual environment
source .venv/bin/activate

# Install dependencies
make sync
```

3. **Create .env file**

```bash
cp .env.example .env
```
Edit the `.env` file with your Vercel Blob credentials and other configuration.

4. **Run the application**

```bash
make up
```

## Database Migrations

Migration files are located in the `app/migrations` directory.

This application uses Alembic for database migrations, with a preference for manual migration management rather than automatic migrations.

### Creating Initial Migration

Ensure your models are imported in `app/bot/storages/psql/__init__.py` and run:

```bash
make create-init-revision
```

This creates an initial migration file in `app/migrations/versions` and an empty `alembic_version` table in the database.

### Applying Migrations

```bash
make upgrade-revision revision=<revision_id>
```

Where `revision_id` is the ID of the migration in the `app/migrations/versions` directory. Initial migration ID is `000000000000`.

### Checking Current Migration

```bash
make current-revision
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

