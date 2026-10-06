import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx

from .base import ModelUnavailableError, ProviderUnavailableError


class OllamaProvider:
    """ModelProvider adapter for the local Ollama runtime."""

    def __init__(
        self,
        *,
        base_url: str = "http://localhost:11434",
        default_model: str = "qwen3:8b",
        timeout: float = 120.0,
        client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
    ):
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model
        self.timeout = timeout
        self._client_factory = client_factory

    async def is_available(self) -> bool:
        try:
            await self.list_models()
            return True
        except ProviderUnavailableError:
            return False

    async def list_models(self) -> list[dict[str, Any]]:
        data = await self._request("GET", "/api/tags")
        models = data.get("models", [])
        return models if isinstance(models, list) else []

    async def is_model_available(self, model: str | None = None) -> bool:
        selected_model = model or self.default_model
        for available_model in await self.list_models():
            if available_model.get("name") == selected_model or available_model.get("model") == selected_model:
                return True
        return False

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/chat",
            json={"model": model or self.default_model, "messages": messages, "stream": False},
        )

    async def generate(
        self,
        prompt: str,
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/generate",
            json={"model": model or self.default_model, "prompt": prompt, "stream": False},
        )

    async def stream(
        self,
        prompt: str,
        *,
        model: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        payload = {"model": model or self.default_model, "prompt": prompt, "stream": True}
        try:
            async with self._client_factory(timeout=self.timeout) as client:
                async with client.stream("POST", f"{self.base_url}/api/generate", json=payload) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            yield json.loads(line)
        except httpx.RequestError as error:
            raise ProviderUnavailableError("Ollama tidak tersedia.") from error
        except httpx.HTTPStatusError as error:
            self._raise_provider_error(error)

    async def supports_vision(self, *, model: str | None = None) -> bool:
        selected_model = model or self.default_model
        for available_model in await self.list_models():
            if available_model.get("name") == selected_model or available_model.get("model") == selected_model:
                return "vision" in available_model.get("capabilities", [])
        return False

    async def vision(
        self,
        image: bytes,
        prompt: str,
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        selected_model = model or self.default_model
        if not await self.supports_vision(model=selected_model):
            return {
                "supported": False,
                "reason": "Current local model does not support vision input.",
            }

        return {
            "supported": False,
            "reason": "Vision execution is not implemented in Step 2.",
        }

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        try:
            async with self._client_factory(timeout=self.timeout) as client:
                response = await client.request(method, f"{self.base_url}{path}", **kwargs)
                response.raise_for_status()
                return response.json()
        except httpx.RequestError as error:
            raise ProviderUnavailableError("Ollama tidak tersedia.") from error
        except httpx.HTTPStatusError as error:
            self._raise_provider_error(error)

    def _raise_provider_error(self, error: httpx.HTTPStatusError) -> None:
        if error.response.status_code == 404:
            raise ModelUnavailableError("Model Ollama yang diminta tidak tersedia.") from error
        raise ProviderUnavailableError("Ollama mengembalikan error.") from error
