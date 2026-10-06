import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import main
from ai.context import ContextBuilder
from ai.orchestrator import AIOrchestrator
from ai.orchestrator.intent import Intent, IntentDetector
from ai.orchestrator.router import ModelRouter
from ai.providers import ModelUnavailableError, ProviderUnavailableError
from memory import manager


class FakeProvider:
    default_model = "qwen3:8b"

    def __init__(self, response=None, error=None):
        self.response = response or {"response": "Halo dari EZRAB"}
        self.error = error
        self.calls = []

    async def generate(self, prompt, *, model=None):
        self.calls.append({"prompt": prompt, "model": model})
        if self.error:
            raise self.error
        return self.response


class SlowProvider(FakeProvider):
    async def generate(self, prompt, *, model=None):
        await asyncio.sleep(0.05)
        return {"response": "terlambat"}


class OrchestratorTests(unittest.TestCase):
    def test_basic_chat_returns_structured_response_and_request_id(self):
        provider = FakeProvider()
        response = asyncio.run(AIOrchestrator(provider).handle_request(message="Halo"))

        self.assertTrue(response["success"])
        self.assertEqual(response["intent"], "general_chat")
        self.assertEqual(response["message"], "Halo dari EZRAB")
        self.assertEqual(response["model"], "qwen3:8b")
        self.assertTrue(response["request_id"].startswith("ezrab-ai-"))
        self.assertEqual(
            set(response),
            {"success", "request_id", "intent", "message", "data", "tools_used", "model", "requires_confirmation", "error"},
        )

    def test_intent_detection_rules(self):
        detector = IntentDetector()
        cases = {
            "Hallo": Intent.GENERAL_CHAT,
            "Berapa total RAB saya?": Intent.RAB_QUESTION,
            "Hitung volume sloof": Intent.CALCULATION,
            "Cari AHSP pasangan bata ringan": Intent.AHSP_QUESTION,
            "Analisis PDF DED ini": Intent.DOCUMENT_ANALYSIS,
            "Analisis gambar denah ini": Intent.VISION_ANALYSIS,
            "Tambahkan pekerjaan pondasi": Intent.MUTATION_REQUEST,
            "Bagaimana cuaca hari ini?": Intent.UNKNOWN,
        }

        for message, expected_intent in cases.items():
            with self.subTest(message=message):
                self.assertEqual(detector.detect(message), expected_intent)

    def test_model_router_uses_default_local_model(self):
        provider = FakeProvider()
        selection = ModelRouter(provider).select(Intent.RAB_QUESTION)

        self.assertIs(selection.provider, provider)
        self.assertEqual(selection.model, "qwen3:8b")

    def test_context_builder_returns_only_connected_memory_data(self):
        memory = {
            "id": "memory-1",
            "type": "preference",
            "key": "rab_style",
            "value": "RAB harus menggunakan Excel.",
            "scope": "global",
            "project_id": None,
            "importance": 0.9,
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            memory_file = Path(temp_dir) / "storage.json"
            memory_file.write_text(json.dumps([memory]), encoding="utf-8")
            with patch.object(manager, "MEMORY_FILE", str(memory_file)):
                context = ContextBuilder().build(
                    message="Format RAB", user_id="user-1", project_id="project-1"
                )

        self.assertTrue(context["user"]["available"])
        self.assertTrue(context["memory"]["available"])
        self.assertFalse(context["project"]["available"])
        self.assertEqual(
            context["project"]["reason"],
            "Data proyek aktif belum tersedia.",
        )

    def test_ollama_failure_is_safe_structured_error(self):
        response = asyncio.run(
            AIOrchestrator(FakeProvider(error=ProviderUnavailableError())).handle_request(message="Halo")
        )

        self.assertFalse(response["success"])
        self.assertEqual(response["error"]["code"], "AI_CORE_UNAVAILABLE")
        self.assertTrue(response["error"]["retryable"])
        self.assertNotIn("Traceback", response["error"]["message"])

    def test_ai_core_timeout_is_safe_and_retryable(self):
        with patch("ai.orchestrator.service.MODEL_TIMEOUT_SECONDS", 0.001):
            response = asyncio.run(AIOrchestrator(SlowProvider()).handle_request(message="Halo"))
        self.assertFalse(response["success"])
        self.assertEqual(response["error"]["code"], "AI_CORE_TIMEOUT")
        self.assertTrue(response["error"]["retryable"])

    def test_model_unavailable_is_safe_structured_error(self):
        response = asyncio.run(
            AIOrchestrator(FakeProvider(error=ModelUnavailableError())).handle_request(message="Halo")
        )

        self.assertFalse(response["success"])
        self.assertEqual(response["error"]["code"], "MODEL_UNAVAILABLE")

    def test_empty_message_does_not_call_provider(self):
        provider = FakeProvider()
        response = asyncio.run(AIOrchestrator(provider).handle_request(message="   "))

        self.assertFalse(response["success"])
        self.assertEqual(response["error"]["code"], "INVALID_REQUEST")
        self.assertEqual(provider.calls, [])

    def test_gateway_rejects_too_long_message_without_stack_trace(self):
        response = TestClient(main.app).post("/api/ai/chat", json={"message": "x" * 4_001})
        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["error"]["code"], "INVALID_REQUEST")
        self.assertIn("request_id", payload)
        self.assertNotIn("Traceback", payload["error"]["message"])

    def test_gateway_rejects_malformed_and_oversized_project_context(self):
        client = TestClient(main.app)
        malformed = client.post("/api/ai/chat", json={"message": "halo", "project_context": []})
        self.assertEqual(malformed.status_code, 400)
        too_large = client.post("/api/ai/chat", json={"message": "halo", "project_context": {"note": "x" * (97 * 1024)}})
        self.assertEqual(too_large.status_code, 400)

    def test_gateway_rejects_invalid_service_token_when_enabled(self):
        with patch.object(main, "SERVICE_TOKEN", "test-service-token"), patch.object(main, "REQUIRE_SERVICE_TOKEN", True):
            response = TestClient(main.app).post("/api/ai/chat", json={"message": "halo"}, headers={"x-ezrab-service-token": "wrong"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "FORBIDDEN")

    def test_unknown_intent_is_returned_without_crashing(self):
        response = asyncio.run(
            AIOrchestrator(FakeProvider()).handle_request(message="Bagaimana cuaca hari ini?")
        )

        self.assertTrue(response["success"])
        self.assertEqual(response["intent"], "unknown")

    def test_mutation_requires_confirmation_without_provider_call(self):
        provider = FakeProvider()
        response = asyncio.run(
            AIOrchestrator(provider).handle_request(message="Tambahkan pekerjaan pondasi")
        )

        self.assertTrue(response["success"])
        self.assertTrue(response["requires_confirmation"])
        self.assertEqual(response["intent"], "mutation_request")
        self.assertEqual(provider.calls, [])

    def test_ai_chat_endpoint_uses_orchestrator(self):
        with patch.object(
            main.ollama_provider,
            "generate",
            new=AsyncMock(return_value={"response": "Halo dari endpoint baru"}),
        ):
            response = TestClient(main.app).post(
                "/api/ai/chat",
                json={"message": "Halo EZRAB", "user_id": "user-1"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(response.json()["message"], "Halo dari endpoint baru")
        self.assertTrue(response.json()["request_id"].startswith("ezrab-ai-"))


if __name__ == "__main__":
    unittest.main()
