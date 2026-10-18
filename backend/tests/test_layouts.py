import pytest
from fastapi.testclient import TestClient

from app.layouts import store as store_module
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def tmp_store(tmp_path, monkeypatch):
    monkeypatch.setattr(store_module, "LOCAL_DIR", tmp_path)
    monkeypatch.setattr("app.layouts.router.store", store_module.LocalStore())


def test_save_list_load_delete():
    machines = [{"id": "a", "componentType": "conveyor-belt", "position": [0, 0, 0]}]
    assert client.put("/api/layouts/My Plant", json={"machines": machines}).status_code == 200
    assert client.get("/api/layouts").json()[0]["name"] == "My Plant"
    assert client.get("/api/layouts/My Plant").json()["machines"] == machines
    assert client.delete("/api/layouts/My Plant").status_code == 200
    assert client.get("/api/layouts/My Plant").status_code == 404


def test_rejects_path_names():
    assert client.put("/api/layouts/..%2Fevil", json={"machines": []}).status_code in (404, 422)
    assert client.put("/api/layouts/.hidden", json={"machines": []}).status_code == 422
