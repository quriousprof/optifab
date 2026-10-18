from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"  # alias tracks the current Flash model; pin a name to freeze it
    qaoa_depth: int = 2
    qaoa_shots: int = 1024
    qaoa_optimizer_maxiter: int = 100
    docs_path: str = str(Path(__file__).resolve().parent.parent.parent / "docs")
    gcp_project: str = ""  # set to store layouts in Firestore; empty = local JSON files
    gcp_layouts_collection: str = "layouts"
    cors_origins: list[str] = ["http://localhost:3000"]

    model_config = {"env_prefix": "OPTIFAB_", "env_file": ".env"}


settings = Settings()
