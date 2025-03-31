import json
import logging
import traceback
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Form, BackgroundTasks, Query, Path
from pydantic import BaseModel
from sqlalchemy import select, func

from server.storages import Video, VideoProcessingJob
from server.storages.pydantic_models import VideoListResponse, VideoCreate, VideoUploadResponse, VideoProcessingStatus
from server.vercel_bob.base import VercelBlobService
from server.video.base import (
    upload_video_to_storage,
    create_video,
    process_video,
    get_video_by_id,
)

# from .direct_upload import router as direct_upload

logger = logging.getLogger(__name__)

router = APIRouter()
# router.include_router(direct_upload)
class VideoUploadedRequest(BaseModel):
    blobUrl: str
    blobSize: Optional[int] = None
    blobPathname: Optional[str] = None
    tokenPayload: Optional[str] = None
    title: Optional[str] = None


@router.post("/videos/register", response_model=VideoUploadResponse, status_code=202)
async def register_blob_video(
        request: Request,
        background_tasks: BackgroundTasks,
        video_data: VideoUploadedRequest,
):
    """
    Registers video that was already uploaded to Vercel Blob Storage
    and initiates processing.

    - **blobUrl**: URL of the video in Vercel Blob Storage
    - **title**: Video title (optional, will be used or generated)
    - **blobSize**: Size of the video in bytes (optional)
    - **blobPathname**: Pathname in the storage (optional)

    Returns the ID and title of the created video.
    """
    logger.info("Received blob video registration request: %s", video_data.blobUrl)

    try:
        async with request.app.state.db_session() as session:
            # Створюємо файлову інформацію з даних blob
            file_info = {
                "url": video_data.blobUrl,
                "pathname": video_data.blobPathname or "",
                "content_type": "video/mp4",  # За замовчуванням або визначте за розширенням
                "size_bytes": video_data.blobSize or 0,
            }

            title = video_data.title or f"Відео {datetime.now().strftime('%Y-%m-%d %H:%M')}"

            logger.info("Creating model for validation")
            validated_data = VideoCreate(title=title)

            try:
                logger.info("Creating database record")
                new_video = await create_video(session, validated_data, file_info)
                logger.info("Record created with ID: %s", new_video.id)
            except Exception as e:
                logger.error("Error creating database record: %s", str(e))
                logger.error(traceback.format_exc())
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to create video record: {e!s}",
                )

            logger.info("Adding task to process video with ID: %s", new_video.id)
            background_tasks.add_task(process_video, session, new_video.id)

        logger.info("Returning successful response for video with ID: %s", new_video.id)
        return VideoUploadResponse(
            id=new_video.id,
            title=new_video.title,
            message="Video registration successful",
        )
    except Exception as e:
        logger.error("Unexpected error processing request: %s", str(e))
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {e!s}",
        )

@router.get("/videos", response_model=VideoListResponse)
async def list_videos(
        request: Request,
        skip: int = Query(0, ge=0, description="Number of records to skip (for pagination)"),
        limit: int = Query(20, ge=1, le=100, description="Maximum number of records to return"),
        status: str | None = Query(None, description="Filter by video status (ready, processing, error)"),
):
    """
    Gets a list of videos with pagination and optional status filtering.

    - **skip**: Number of records to skip (for pagination)
    - **limit**: Maximum number of records to return
    - **status**: Optional filter by video status

    Returns a list of videos and the total record count.
    """
    query = select(Video)
    count_query = select(func.count(Video.id))

    if status:
        query = query.where(Video.status == status)
        count_query = count_query.where(Video.status == status)

    query = query.order_by(Video.created_at.desc()).offset(skip).limit(limit)
    async with request.app.state.db_session() as session:
        result = await session.execute(query)
        videos = result.scalars().all()

        count_result = await session.execute(count_query)
        total = count_result.scalar()

    return VideoListResponse(
        videos=videos,
        total=total,
    )


@router.get("/videos/{video_id}/status", response_model=VideoProcessingStatus)
async def get_video_processing_status(
        request: Request,
        video_id: int = Path(..., ge=1, description="Video ID"),
):
    """
    Gets the video processing status.

    - **video_id**: Video ID

    Returns information about the video processing status.
    """
    async with request.app.state.db_session() as session:
        video = await get_video_by_id(session, video_id)
        if not video:
            raise HTTPException(
                status_code=404,
                detail="Video not found",
            )

        result = await session.execute(
            select(VideoProcessingJob)
            .where(VideoProcessingJob.video_id == video_id)
            .order_by(VideoProcessingJob.created_at.desc()),
        )
        job = result.scalars().first()

        if not job:
            raise HTTPException(
                status_code=404,
                detail="Processing job not found",
            )

    return job


@router.delete("/videos/{video_id}", status_code=204)
async def delete_video(
        request: Request,
        video_id: int = Path(..., ge=1, description="Video ID"),
):
    """
    Deletes a video and its associated data.

    - **video_id**: Video ID

    Returns no content in the response (204 No Content).
    """
    async with request.app.state.db_session() as session:
        video = await get_video_by_id(session, video_id)
        if not video:
            raise HTTPException(
                status_code=404,
                detail="Video not found",
            )

        if video.file_path:
            await VercelBlobService.delete_file(video.file_path)

        if video.thumbnail_path:
            await VercelBlobService.delete_file(video.thumbnail_path)

        await session.delete(video)
        await session.commit()



