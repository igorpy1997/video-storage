// vercel-blob-bridge.js
const express = require('express');
const cors = require('cors');
const { handleUpload } = require('@vercel/blob/client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const stream = require('stream');

// Setting up temporary folder for storing files
const tempDir = path.join(os.tmpdir(), 'vercel-blob-bridge');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer to store files on disk instead of memory
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
    }
});

const upload = multer({ storage: storage });

// Setting up logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logStream = fs.createWriteStream(path.join(logDir, 'bridge.log'), { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${message}\n`;
    console.log(logMsg.trim());
    logStream.write(logMsg);
}

// Startup info
log('Starting Vercel Blob Bridge');

const app = express();
const PORT = process.env.PORT || 3001;
const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

// Check if token is present
if (!process.env.BLOB_READ_WRITE_TOKEN) {
    log('WARNING: BLOB_READ_WRITE_TOKEN not set. Uploads will likely fail!');
} else {
    log('BLOB_READ_WRITE_TOKEN is set');
}

log(`FastAPI URL: ${FASTAPI_URL}`);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    log(`${req.method} ${req.url}`);
    next();
});

// Main endpoint for handling Vercel Blob uploads
app.post('/api/blob-upload', async (req, res) => {
    log('Received blob upload request');

    try {
        const jsonResponse = await handleUpload({
            body: req.body,
            request: {
                headers: req.headers,
                url: req.url
            },
            onBeforeGenerateToken: async (pathname) => {
                log(`Generating token for path: ${pathname}`);

                // Always allow uploads without permission checking
                return {
                    allowedContentTypes: [
                        'video/mp4',
                        'video/webm',
                        'video/quicktime',
                        'video/x-msvideo',
                        'video/x-flv',
                        'video/*'  // Allows any video format
                    ],
                    tokenPayload: JSON.stringify({
                        pathname,
                        timestamp: Date.now()
                    }),
                };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
                try {
                    log(`Upload completed: ${blob.url}`);

                    // Notify FastAPI about successful upload
                    log('Notifying FastAPI about upload');
                    await axios.post(`${FASTAPI_URL}/video-uploaded`, {
                        blobUrl: blob.url,
                        blobSize: blob.size,
                        blobPathname: blob.pathname,
                        tokenPayload
                    });

                    log('FastAPI notification successful');
                } catch (error) {
                    log(`Failed to notify FastAPI: ${error.message}`);
                }
            },
        });

        log('Upload token generated successfully');
        return res.json(jsonResponse);
    } catch (error) {
        log(`Blob upload error: ${error.message}`);
        return res.status(400).json({ error: error.message });
    }
});

// Simple health check endpoint
app.get('/health', (req, res) => {
    log('Health check requested');
    res.json({
        status: 'ok',
        message: 'Vercel Blob Bridge is running',
        fastapi_url: FASTAPI_URL,
        blob_token_configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
    });
});

// Function to format file size in a human-readable format
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
    else return (bytes / 1073741824).toFixed(2) + ' GB';
}

// Function to delete temporary file
function cleanupTempFile(filePath) {
    if (filePath && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            log(`Temporary file deleted: ${filePath}`);
        } catch (err) {
            log(`Error deleting temporary file: ${err.message}`);
        }
    }
}

// New endpoint for uploading via FormData
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        log('Received FormData upload request');

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided' });
        }

        const title = req.body.title || 'Untitled';
        const file = req.file;
        const filePath = file.path;

        log(`Processing file: ${file.originalname}, size: ${formatFileSize(file.size)}, saved to: ${filePath}`);

        const fileExtension = path.extname(file.originalname);
        const uniqueFilename = `videos/${Date.now()}-${Math.random().toString(36).substring(2, 15)}${fileExtension}`;
        log(`Generated unique filename: ${uniqueFilename}`);

        try {
            // Upload file to Vercel Blob
            const { put } = await import('@vercel/blob');

            // Create a read stream from the file
            const fileStream = fs.createReadStream(filePath);

            log(`Starting upload to Vercel Blob with multipart: true`);

            // Always use multipart for file uploads
            const blob = await put(uniqueFilename, fileStream, {
                access: 'public',
                contentType: file.mimetype,
                multipart: true,
                onUploadProgress: (progress) => {
                    log(`Upload progress: ${Math.round(progress.percentage)}% (${formatFileSize(progress.loaded)}/${formatFileSize(progress.total)})`);
                }
            });

            log(`File uploaded to Vercel Blob: ${blob.url}`);

            const requestData = {
                blobUrl: blob.url,
                blobSize: blob.size || file.size,
                blobPathname: blob.pathname || uniqueFilename,
                title: title
            };
            log(`Sending data to FastAPI: ${JSON.stringify(requestData)}`);

            try {
                await axios.post(`${FASTAPI_URL}/videos/register`, requestData);
                log('FastAPI notification successful');
            } catch (error) {
                log(`Failed to notify FastAPI: ${error.message}`);
                // Continue even if we failed to notify FastAPI
            }

            // Delete temporary file
            cleanupTempFile(filePath);

            return res.json({
                success: true,
                url: blob.url,
                size: blob.size || file.size,
                pathname: blob.pathname || uniqueFilename,
                title: title,
                id: Date.now().toString() // Temporary ID
            });
        } catch (error) {
            // Delete temporary file in case of error
            cleanupTempFile(filePath);
            throw error;
        }
    } catch (error) {
        log(`Upload error: ${error.message}`);
        log(error.stack);
        return res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(PORT, () => {
    log(`Vercel Blob Bridge running on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`);
    log(error.stack);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log('Unhandled Rejection at:', promise, 'reason:', reason);
});