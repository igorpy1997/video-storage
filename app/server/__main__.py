from fastapi import FastAPI
import uvicorn

from server.endpoints.base import router
from server.settings import Settings
from server.storages import create_db_session_pool
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.on_event("startup")
async def startup_db_client():
    settings = Settings()
    engine, db_session = await create_db_session_pool(settings)
    app.state.db_session = db_session

if __name__ == "__main__":
    uvicorn.run("server.__main__:app", host="0.0.0.0", port=8000)  # noqa: S104