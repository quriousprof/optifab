from copy import deepcopy

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


def test_floor_size_round_trip_and_legacy_layouts():
    floor = {"width": 240, "depth": 160}
    assert client.put("/api/layouts/Custom", json={"machines": [], "floor": floor}).status_code == 200
    assert client.get("/api/layouts/Custom").json()["floor"] == floor
    assert client.put("/api/layouts/Legacy", json={"machines": []}).status_code == 200
    assert "floor" not in client.get("/api/layouts/Legacy").json()
    assert client.put("/api/layouts/Bad", json={"machines": [], "floor": {"width": 0, "depth": 100}}).status_code == 422


def test_firestore_round_trip_preserves_floor_dimensions_and_component_labels(monkeypatch):
    class Snapshot:
        def __init__(self, data):
            self.exists = data is not None
            self.data = data

        def to_dict(self):
            return deepcopy(self.data)

    class Document:
        def __init__(self, docs, name):
            self.docs, self.name = docs, name

        def set(self, data):
            self.docs[self.name] = deepcopy(data)

        def get(self):
            return Snapshot(self.docs.get(self.name))

    class Collection:
        def __init__(self):
            self.docs = {}

        def document(self, name):
            return Document(self.docs, name)

    firestore = store_module.FirestoreStore.__new__(store_module.FirestoreStore)
    firestore._col = Collection()
    monkeypatch.setattr("app.layouts.router.store", firestore)
    payload = {
        "floor": {"width": 240, "depth": 160},
        "machines": [
            {"id": "belt", "componentType": "conveyor-belt", "position": [20, 0, 8], "length": 35.5, "breadth": 2.4, "angle": 0.4, "entryAngle": 0.2, "exitAngle": 0.6, "displayLabel": "Inbound belt"},
            {"id": "platform", "componentType": "workstation", "position": [-8, 0, 0], "length": 30, "breadth": 22, "rotation": 1, "displayLabel": "Cell A"},
            {"id": "supply", "componentType": "raw-material", "position": [-40, 0, 0], "length": 12, "breadth": 9, "displayLabel": "Stock"},
            {"id": "cutter", "componentType": "cutting-machine", "position": [0, 0, 0], "label": "C1", "displayLabel": "Laser cutter"},
        ],
    }
    assert client.put("/api/layouts/Factory", json=payload).status_code == 200
    saved = firestore._col.docs["Factory"]
    loaded = client.get("/api/layouts/Factory").json()
    for key, value in payload.items():
        assert saved[key] == value
        assert loaded[key] == value

    del payload["machines"][0]["displayLabel"]
    payload["machines"][3]["displayLabel"] = "Cutter renamed"
    assert client.put("/api/layouts/Factory", json=payload).status_code == 200
    assert client.get("/api/layouts/Factory").json()["machines"] == payload["machines"]
    assert firestore._col.docs["Factory"]["machines"] == payload["machines"]
