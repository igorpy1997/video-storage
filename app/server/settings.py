from pydantic import SecretStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from sqlalchemy import URL


class PostgresSettings(BaseSettings):
    host: str
    port: int
    user: str
    password: SecretStr
    db: str

class Settings(BaseSettings):
    model_config = SettingsConfigDict()
    dev: bool = False
    blob_read_write_token: str = Field(default="", alias="BLOB_READ_WRITE_TOKEN")
    blob_store_id: str = Field(default="", alias="BLOB_STORE_ID")
    blob_api_url: str = Field(default="https://blob.vercel-storage.com")
    temp_dir: str = Field(default="./temp")
    psql: PostgresSettings = PostgresSettings(_env_prefix="PSQL_")

    def psql_dsn(self) -> URL:
        return URL.create(
            drivername="postgresql+asyncpg",
            username=self.psql.user,
            password=self.psql.password.get_secret_value(),
            host=self.psql.host,
            port=self.psql.port,
            database=self.psql.db,
        )

