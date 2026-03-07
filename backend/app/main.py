import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import (
    admin,
    categories,
    clustering,
    configuration,
    demo,
    learning,
    pipeline,
    prompt_lab,
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

app.include_router(configuration.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(demo.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(prompt_lab.router, prefix="/api/v1")
app.include_router(clustering.router, prefix="/api/v1")
app.include_router(learning.router, prefix="/api/v1")

# Serve static files (prompt lab HTML)
_static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_static_dir):
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")


@app.get("/prompt-lab")
async def serve_prompt_lab():
    """Standalone dev tool — not linked from main product UI."""
    html_path = os.path.join(_static_dir, "prompt_lab.html")
    if os.path.exists(html_path):
        return FileResponse(html_path)
    return {"error": "prompt_lab.html not found"}


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
