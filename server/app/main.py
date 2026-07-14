from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.database import create_db_and_tables
from app.models import Workflow  # noqa: F401 — ensures table is registered

from .routers import app_router, workflow_router

# Load the repository environment first, then fill missing values from server/.env.
# This supports both local monorepo startup and running the backend directory alone.
server_env_path = Path(__file__).resolve().parent.parent / ".env"
root_env_path = server_env_path.parent.parent / ".env"
load_dotenv(dotenv_path=root_env_path)
load_dotenv(dotenv_path=server_env_path)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create SQLite tables if they don't exist
    await create_db_and_tables()
    yield
    # Shutdown (nothing to clean up for SQLite)


app = FastAPI(title="Workflow API", version="1.0.0", lifespan=lifespan)

app.include_router(workflow_router.router, prefix="/api/workflow", tags=["workflow"])
app.include_router(app_router.router, prefix="/api/app", tags=["app"])
uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Welcome to Workflow API"}


@app.get("/api/health")
async def health_check():
    return {"status": "healthy"}
