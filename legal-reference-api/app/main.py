from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.routers import resources, categories


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    settings = get_settings()
    print(f"Starting {settings.app_name}...")
    print(f"Frontend URL: {settings.frontend_url}")
    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(
    title="Legal Reference Library API",
    description="FastAPI backend for the Legal Reference Library",
    version="1.0.0",
    lifespan=lifespan,
)

# Get settings
settings = get_settings()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://localhost:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(resources.router, prefix="/resources", tags=["Resources"])
app.include_router(categories.router, prefix="/categories", tags=["Categories"])


@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {
        "status": "ok",
        "app": "Legal Reference Library API",
        "version": "1.0.0",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


# Run with: uvicorn app.main:app --reload --port 8000
