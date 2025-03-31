from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, func
from sqlalchemy.orm import relationship

from server.storages import Base


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    thumbnail_path = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    duration = Column(Integer, nullable=True)
    status = Column(String, default="processing")
    upload_completed = Column(Boolean, default=False)
    processing_completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Зв'язок з таблицею video_processing_jobs
    processing_jobs = relationship("VideoProcessingJob", back_populates="video", cascade="all, delete-orphan")
    video_uuid = Column(String(100), nullable=True)  # UUID видео для связи с хранилищем
    parts_count = Column(Integer, default=0)