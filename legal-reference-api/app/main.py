from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.routers import resources, categories
from app.routers.search import (
    google,
    youtube,
    books,
    openlibrary,
    courtlistener,
    congress,
    federalregister,
    loc,
    unicourt,
    combined,
)


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

# Search routers
app.include_router(google.router, prefix="/search/google", tags=["Search"])
app.include_router(youtube.router, prefix="/search/youtube", tags=["Search"])
app.include_router(books.router, prefix="/search/books", tags=["Search"])
app.include_router(openlibrary.router, prefix="/search/openlibrary", tags=["Search"])
app.include_router(courtlistener.router, prefix="/search/courtlistener", tags=["Search"])
app.include_router(congress.router, prefix="/search/congress", tags=["Search"])
app.include_router(federalregister.router, prefix="/search/federalregister", tags=["Search"])
app.include_router(loc.router, prefix="/search/loc", tags=["Search"])
app.include_router(unicourt.router, prefix="/search/unicourt", tags=["Search"])
app.include_router(combined.router, prefix="/search/combined", tags=["Search"])


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
