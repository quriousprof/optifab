from typing import Annotated

from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel, Field

from app.layouts.store import store

router = APIRouter(tags=["layouts"])

# The name is the document id / filename, so keep it free of path characters on every route.
Name = Annotated[str, Path(pattern=r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$")]


class LayoutBody(BaseModel):
    machines: list[dict] = Field(max_length=2000)  # the frontend's PlacedMachine[]; opaque to the backend


def _get_or_404(name: str) -> dict:
    doc = store.get(name)
    if not doc:
        raise HTTPException(404, f"Layout '{name}' not found")
    return doc


@router.get("/layouts")
def list_layouts():
    return store.all()


@router.get("/layouts/{name}")
def get_layout(name: Name):
    return _get_or_404(name)


@router.put("/layouts/{name}")
def save_layout(name: Name, body: LayoutBody):
    return store.put(name, body.machines)


@router.delete("/layouts/{name}")
def delete_layout(name: Name):
    if not store.delete(name):
        raise HTTPException(404, f"Layout '{name}' not found")
    return {"deleted": name}
