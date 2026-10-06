import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import main
from memory import manager


RAB_MEMORY = {
    "id": "rab-memory",
    "type": "preference",
    "scope": "global",
    "project_id": None,
    "key": "rab_style",
    "value": (
        "RAB EZRAB harus profesional, spreadsheet-like, semua rumus "
        "saling terhubung, dan mendukung export Excel serta PDF."
    ),
    "importance": 0.9,
}


class FakeOllamaResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"response": "Respons uji Ollama"}


class FakeOllamaClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return None

    async def post(self, *args, **kwargs):
        return FakeOllamaResponse()


class MemoryAwareChatTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.memory_file = Path(self.temp_dir.name) / "storage.json"
        self.memory_file.write_text(json.dumps([RAB_MEMORY]), encoding="utf-8")
        self.memory_file_patch = patch.object(manager, "MEMORY_FILE", str(self.memory_file))
        self.memory_file_patch.start()
        self.ollama_patch = patch.object(main.httpx, "AsyncClient", FakeOllamaClient)
        self.ollama_patch.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.ollama_patch.stop()
        self.memory_file_patch.stop()
        self.temp_dir.cleanup()

    def test_relevant_rab_memory_is_found(self):
        questions = [
            "Bagaimana format RAB yang sebaiknya saya gunakan?",
            "Apa standar spreadsheet untuk EZRAB?",
            "Bagaimana agar rumus RAB saling terhubung?",
            "Apakah RAB dapat diekspor ke Excel dan PDF?",
        ]

        for question in questions:
            with self.subTest(question=question):
                memories = main.find_relevant_memories(question)
                self.assertEqual(
                    [memory["id"] for memory in memories], ["rab-memory"]
                )

    def test_irrelevant_memory_is_not_found(self):
        memories = main.find_relevant_memories(
            "Bagaimana cuaca hari ini di Jakarta?"
        )

        self.assertEqual(memories, [])

    def test_search_prioritizes_importance_for_equally_relevant_memories(self):
        low_importance_memory = {**RAB_MEMORY, "id": "low-rab", "importance": 0.1}
        self.memory_file.write_text(
            json.dumps([low_importance_memory, RAB_MEMORY]), encoding="utf-8"
        )

        results = manager.search_memory("RAB")

        self.assertEqual([result["id"] for result in results], ["rab-memory", "low-rab"])

    def test_chat_reports_memory_used_when_relevant_memory_exists(self):
        response = self.client.post(
            "/api/chat",
            json={"message": "Bagaimana format RAB yang sebaiknya saya gunakan?"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["memory"]["used"])
        self.assertEqual(response.json()["memory"]["count"], 1)

    def test_chat_continues_when_no_relevant_memory_exists(self):
        response = self.client.post(
            "/api/chat",
            json={"message": "Bagaimana cuaca hari ini di Jakarta?"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertFalse(response.json()["memory"]["used"])
        self.assertEqual(response.json()["memory"]["count"], 0)


if __name__ == "__main__":
    unittest.main()
