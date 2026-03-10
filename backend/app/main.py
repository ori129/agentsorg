import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    admin,
    auth,
    categories,
    clustering,
    configuration,
    demo,
    learning,
    pipeline,
    users,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="AgentsOrg", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(configuration.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(demo.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(clustering.router, prefix="/api/v1")
app.include_router(learning.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
