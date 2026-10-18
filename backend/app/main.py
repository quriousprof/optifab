from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.factory.router import router as factory_router
from app.optimizer.router import router as optimizer_router
from app.gemini.router import router as gemini_router

app = FastAPI(title="Optifab Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(factory_router, prefix="/api")
app.include_router(optimizer_router, prefix="/api")
app.include_router(gemini_router, prefix="/api")


@app.get("/")
def health():
    return {"status": "ok", "version": "1.0.0"}
