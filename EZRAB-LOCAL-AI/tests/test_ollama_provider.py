import asyncio
import json
import unittest

import httpx

from ai.providers import ModelUnavailableError, OllamaProvider, ProviderUnavailableError


MODELS_RESPONSE = {
    "models": [
        {
            "name": "qwen3:8b",
            "model": "qwen3:8b",
            "capabilities": ["completion", "tools", "thinking"],
        }
    ]
}


def provider_with_handler(handler):
    def client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    return OllamaProvider(client_factory=client_factory)


class OllamaProviderTests(unittest.TestCase):
    def test_provider_reports_connection_and_default_model_available(self):
        def handler(request):
            self.assertEqual(request.url.path, "/api/tags")
            return httpx.Response(200, json=MODELS_RESPONSE)

        provider = provider_with_handler(handler)

        self.assertTrue(asyncio.run(provider.is_available()))
        self.assertTrue(asyncio.run(provider.is_model_available("qwen3:8b")))

    def test_chat_returns_ollama_response(self):
        def handler(request):
            self.assertEqual(request.url.path, "/api/chat")
            self.assertEqual(json.loads(request.content)["model"], "qwen3:8b")
            return httpx.Response(200, json={"message": {"role": "assistant", "content": "Halo"}})

        provider = provider_with_handler(handler)

        result = asyncio.run(provider.chat([{"role": "user", "content": "Halo"}]))

        self.assertEqual(result["message"]["content"], "Halo")

    def test_generate_raises_when_ollama_is_unavailable(self):
        def handler(request):
            raise httpx.ConnectError("connection refused", request=request)

        provider = provider_with_handler(handler)

        with self.assertRaises(ProviderUnavailableError):
            asyncio.run(provider.generate("Halo"))

    def test_generate_raises_when_model_is_unavailable(self):
        def handler(request):
            return httpx.Response(404, json={"error": "model not found"}, request=request)

        provider = provider_with_handler(handler)

        with self.assertRaises(ModelUnavailableError):
            asyncio.run(provider.generate("Halo", model="missing:model"))

    def test_vision_reports_unsupported_for_current_model(self):
        def handler(request):
            return httpx.Response(200, json=MODELS_RESPONSE)

        provider = provider_with_handler(handler)

        result = asyncio.run(provider.vision(b"image", "Apa isi gambar ini?"))

        self.assertFalse(result["supported"])


if __name__ == "__main__":
    unittest.main()
