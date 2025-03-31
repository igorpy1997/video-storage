import uuid
import tempfile
import pathlib
import aiofiles
import aiohttp
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from datetime import datetime
import asyncio
from typing import Any

from server.dependencies import get_settings
from server.storages import Video, VideoProcessingJob
from server.storages.pydantic_models import VideoCreate
from server.vercel_bob.base import VercelBlobService

settings = get_settings()

# Створюємо тимчасову директорію, якщо вона не існує
temp_dir = pathlib.Path(settings.temp_dir)
temp_dir.mkdir(parents=True, exist_ok=True)


async def save_upload_file_temp(upload_file: UploadFile) -> str:
    """Тимчасово зберігає завантажений файл для подальшої обробки"""
    # Генеруємо унікальне ім'я файлу
    file_extension = pathlib.Path(upload_file.filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = temp_dir / unique_filename

    # Зберігаємо файл
    async with aiofiles.open(file_path, "wb") as out_file:
        content = await upload_file.read()
        await out_file.write(content)

    # Перемотуємо файл на початок для подальшого використання
    await upload_file.seek(0)

    return str(file_path)


async def create_thumbnail(video_path: str, video_id: int) -> str:
    """Створює мініатюру для відео за допомогою FFmpeg"""
    thumbnail_filename = f"{video_id}_{uuid.uuid4()}.jpg"
    thumbnail_path = temp_dir / thumbnail_filename

    # Команда для FFmpeg для створення мініатюри з першого кадру
    cmd = [
        "ffmpeg", "-i", video_path,
        "-ss", "00:00:01",  # Беремо кадр з 1 секунди
        "-vframes", "1",    # Беремо лише 1 кадр
        "-vf", "scale=320:-1",  # Масштабуємо ширину до 320px, зберігаючи пропорції
        str(thumbnail_path),
    ]

    # Виконуємо команду асинхронно
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Чекаємо завершення і отримуємо результат
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create thumbnail: {stderr.decode()}",
        )

    return thumbnail_path


async def get_video_duration(video_path: str) -> int:
    """Отримує тривалість відео в секундах за допомогою FFmpeg"""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get video duration: {stderr.decode()}",
        )

    # Перетворюємо рядок з секундами у ціле число
    try:
        duration = int(float(stdout.decode().strip()))
    except ValueError:
        duration = 0

    return duration


async def upload_video_to_storage(upload_file: UploadFile) -> dict[str, Any]:
    """Завантажує відео до Vercel Blob Storage"""
    return await VercelBlobService.upload_file(upload_file, folder="videos")


async def create_video(db: AsyncSession, video_data: VideoCreate, file_info: dict[str, Any]) -> Video:
    """Створює запис про відео в базі даних"""
    # Створюємо новий запис про відео
    new_video = Video(
        title=video_data.title,
        file_path=file_info["url"],  # URL від Vercel Blob Storage
        thumbnail_path="",  # Тимчасово порожній, оновимо пізніше
        content_type=file_info["content_type"],
        size_bytes=file_info["size_bytes"],
        upload_completed=True,
    )

    db.add(new_video)
    await db.commit()
    await db.refresh(new_video)

    # Створюємо завдання на обробку
    processing_job = VideoProcessingJob(
        video_id=new_video.id,
        job_status="pending",
        started_at=datetime.now(),
    )

    db.add(processing_job)
    await db.commit()

    return new_video


async def process_video(db: AsyncSession, video_id: int) -> None:
    """Обробляє відео: створює мініатюру та оновлює інформацію"""
    # Отримуємо відео з бази
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalars().first()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        # Оновлюємо статус завдання
        await db.execute(
            update(VideoProcessingJob)
            .where(VideoProcessingJob.video_id == video_id)
            .values(job_status="processing"),
        )
        await db.commit()

        # Створюємо тимчасовий файл для відео
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_video:
            temp_video_path = temp_video.name

            # Завантажуємо відео з Vercel Blob Storage
            async with aiohttp.ClientSession() as session:
                async with session.get(video.file_path) as response:
                    if response.status != 200:
                        raise HTTPException(status_code=500, detail="Failed to download video from storage")

                    # Записуємо вміст у тимчасовий файл
                    temp_video.write(await response.read())

            # Створюємо мініатюру
            thumbnail_path = await create_thumbnail(temp_video_path, video.id)

            # Отримуємо тривалість відео
            duration = await get_video_duration(temp_video_path)

            # Завантажуємо мініатюру в Vercel Blob Storage
            thumbnail_url = await VercelBlobService.upload_thumbnail(thumbnail_path, video.id)

            # Видаляємо тимчасові файли
            pathlib.Path(temp_video_path).unlink(missing_ok=True)
            pathlib.Path(thumbnail_path).unlink(missing_ok=True)

            # Оновлюємо інформацію про відео
            video.thumbnail_path = thumbnail_url
            video.duration = duration
            video.status = "ready"
            video.processing_completed = True

            await db.commit()

            # Завершуємо завдання на обробку
            await db.execute(
                update(VideoProcessingJob)
                .where(VideoProcessingJob.video_id == video_id)
                .values(
                    job_status="completed",
                    completed_at=datetime.now(),
                ),
            )
            await db.commit()

    except Exception as e:
        # У випадку помилки, оновлюємо статус
        await db.execute(
            update(VideoProcessingJob)
            .where(VideoProcessingJob.video_id == video_id)
            .values(
                job_status="failed",
                error_message=str(e),
                completed_at=datetime.now(),
            ),
        )
        await db.commit()

        # Оновлюємо статус відео
        video.status = "error"
        await db.commit()

        raise HTTPException(status_code=500, detail=f"Error processing video: {e!s}")


async def get_all_videos(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[Video]:
    """Отримує список всіх відео з пагінацією"""
    result = await db.execute(
        select(Video)
        .order_by(Video.created_at.desc())
        .offset(skip)
        .limit(limit),
    )

    return result.scalars().all()


async def get_video_by_id(db: AsyncSession, video_id: int) -> Video | None:
    """Отримує відео за ідентифікатором"""
    result = await db.execute(select(Video).where(Video.id == video_id))
    return result.scalars().first()
