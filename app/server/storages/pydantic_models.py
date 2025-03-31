from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class BaseSchema(BaseModel):
    class Config:
        orm_mode = True
        from_attributes = True


class VideoCreate(BaseSchema):
    title: str = Field(..., min_length=1, max_length=255)


class VideoResponse(BaseSchema):
    id: int
    title: str
    thumbnail_path: str
    file_path: str
    status: str
    duration: Optional[int] = None
    upload_completed: bool
    processing_completed: bool
    created_at: datetime
    updated_at: datetime


class VideoListResponse(BaseSchema):
    videos: List[VideoResponse]
    total: int


class VideoProcessingStatus(BaseSchema):
    id: int
    video_id: int
    job_status: str
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class VideoUploadResponse(BaseSchema):
    id: int
    title: str
    message: str = "Video upload initiated successfully"