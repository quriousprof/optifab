"""Saved factory layouts: Firestore when OPTIFAB_GCP_PROJECT is set, JSON files under data/layouts/ otherwise."""
import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings

LOCAL_DIR = Path(__file__).resolve().parents[2] / "data" / "layouts"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalStore:
    def _path(self, name: str) -> Path:
        return LOCAL_DIR / f"{name}.json"

    def all(self) -> list[dict]:
        docs = [json.loads(p.read_text()) for p in LOCAL_DIR.glob("*.json")] if LOCAL_DIR.exists() else []
        return sorted(({"name": d["name"], "updatedAt": d["updatedAt"]} for d in docs), key=lambda d: d["updatedAt"], reverse=True)

    def get(self, name: str) -> dict | None:
        path = self._path(name)
        return json.loads(path.read_text()) if path.exists() else None

    def put(self, name: str, machines: list[dict], floor: dict | None = None) -> dict:
        LOCAL_DIR.mkdir(parents=True, exist_ok=True)
        doc = {"name": name, "updatedAt": _now(), "machines": machines}
        if floor is not None:
            doc["floor"] = floor
        self._path(name).write_text(json.dumps(doc))
        return doc

    def delete(self, name: str) -> bool:
        path = self._path(name)
        exists = path.exists()
        path.unlink(missing_ok=True)
        return exists


class FirestoreStore:
    def __init__(self, project: str):
        from google.cloud import firestore  # imported lazily so local dev needs no GCP packages configured

        self._col = firestore.Client(project=project).collection(settings.gcp_layouts_collection)

    def all(self) -> list[dict]:
        docs = self._col.select(["name", "updatedAt"]).stream()
        return sorted((d.to_dict() for d in docs), key=lambda d: d["updatedAt"], reverse=True)

    def get(self, name: str) -> dict | None:
        snap = self._col.document(name).get()
        return snap.to_dict() if snap.exists else None

    def put(self, name: str, machines: list[dict], floor: dict | None = None) -> dict:
        doc = {"name": name, "updatedAt": _now(), "machines": machines}
        if floor is not None:
            doc["floor"] = floor
        self._col.document(name).set(doc)
        return doc

    def delete(self, name: str) -> bool:
        ref = self._col.document(name)
        exists = ref.get().exists
        ref.delete()
        return exists


store = FirestoreStore(settings.gcp_project) if settings.gcp_project else LocalStore()
