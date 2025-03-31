import asyncio
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import pathlib
import shutil
import tempfile
import time
import uuid
from typing import Any, Optional, Dict

from fastapi import UploadFile, HTTPException

try:
    from vercel_blob import put, delete as delete_blob, list as list_blobs
    VERCEL_BLOB_AVAILABLE = True
except ImportError:
    VERCEL_BLOB_AVAILABLE = False
    logging.exception("Vercel Blob package is not installed")

from server.dependencies import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

class VercelBlobService:
    """Сервіс для роботи з Vercel Blob Storage з використанням офіційного SDK"""

    @staticmethod
    async def upload_file(file: UploadFile, folder: str = "videos") -> dict[str, Any]:
        """
        Uploads a file to Vercel Blob Storage using @vercel/blob

        Args:
            file: File to upload
            folder: Folder to store the file (videos or thumbnails)

        Returns:
            Dict with information about the uploaded file

        """
        logger.info("Starting file upload to Vercel Blob Storage. File: %s, type: %s", file.filename, file.content_type)

        if not VERCEL_BLOB_AVAILABLE:
            logger.error("vercel_blob package is not installed")
            raise HTTPException(
                status_code=500,
                detail="vercel_blob package is not installed",
            )

        try:
            file_extension = pathlib.Path(file.filename).suffix.lower()
            unique_filename = f"{folder}/{uuid.uuid4()}{file_extension}"
            logger.info("Generated unique filename: %s", unique_filename)

            logger.info("Reading file content...")
            file_content = await file.read()
            logger.info("Read %s bytes from file", len(file_content))


            logger.info("Uploading file using @vercel/blob SDK...")
            result = put(
                unique_filename,
                file_content,
                options={
                    "contentType": file.content_type,
                    "access": "public",
                },
            )

            logger.info("File successfully uploaded: %s", result)

            return {
                "url": result["url"],
                "pathname": result["pathname"],
                "content_type": file.content_type,
                "size_bytes": len(file_content),
            }

        except Exception as e:
            logger.error("Error uploading file to Vercel Blob Storage: %s", str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload to Blob storage: {e!s}",
            )

    @staticmethod
    async def upload_thumbnail(file_path: str, video_id: int) -> str:
        """
        Uploads a thumbnail to Vercel Blob Storage

        Args:
            file_path: Path to the thumbnail file
            video_id: Video ID

        Returns:
            URL of the uploaded thumbnail

        """
        logger.info("Uploading thumbnail. Path: %s, video ID: %s", file_path, video_id)

        if not VERCEL_BLOB_AVAILABLE:
            logger.error("vercel_blob package is not installed")
            raise HTTPException(
                status_code=500,
                detail="vercel_blob package is not installed",
            )

        try:
            file_path_obj = pathlib.Path(file_path)
            file_extension = file_path_obj.suffix.lower()
            content_type = "image/jpeg" if file_extension in [".jpg", ".jpeg"] else "image/png"

            unique_filename = f"thumbnails/{video_id}_{uuid.uuid4()}{file_extension}"

            with open(file_path, "rb") as f:
                file_content = f.read()


            result = put(
                unique_filename,
                file_content,
                options={
                    "contentType": content_type,
                    "access": "public",
                },
            )

            logger.info("Thumbnail successfully uploaded: %s", result)

            return result["url"]

        except Exception as e:
            logger.error("Error uploading thumbnail: %s", str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Failed to upload thumbnail: {e!s}",
            )

    @staticmethod
    async def delete_file(url: str) -> bool:
        """
        Deletes a file from Vercel Blob Storage

        Args:
            url: URL of the file to delete

        Returns:
            True if the file was successfully deleted
        """
        logger.info("Deleting file: %s", url)

        if not VERCEL_BLOB_AVAILABLE:
            logger.error("vercel_blob package is not installed")
            raise HTTPException(
                status_code=500,
                detail="vercel_blob package is not installed",
            )

        try:
            from vercel_blob import delete

            response = delete(url)

            logger.info("File deletion result: %s", response)

            if response and isinstance(response, dict):
                logger.info("File successfully deleted: %s", url)
                return True
            logger.warning("Unexpected file deletion result: %s", response)
            return False

        except Exception as e:
            import traceback
            logger.error("Error deleting file: %s", str(e))
            logger.error("Error stack: %s", traceback.format_exc())
            return False

    @staticmethod
    async def download_file(url: str) -> bytes:
        """
        Downloads a file from Vercel Blob Storage

        Args:
            url: URL of the file to download

        Returns:
            Binary content of the file
        """
        logger.info("Downloading file: %s", url)

        try:
            import aiohttp

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        logger.error("Error downloading file: status %s", response.status)
                        return b""

                    content = await response.read()
                    logger.info("File successfully downloaded, size: %s bytes", len(content))
                    return content

        except Exception as e:
            logger.error("Error downloading file: %s", str(e))
            return b""

