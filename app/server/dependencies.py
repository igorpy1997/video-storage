from functools import lru_cache

from server.settings import Settings


@lru_cache
def get_settings() -> Settings:
    """Функція для отримання налаштувань"""
    return Settings()




