from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any


class ModelProviderError(Exception):
    """Base error for a local or remote model provider."""


class ProviderUnavailableError(ModelProviderError):
    """Raised when the configured provider cannot be reached."""


class ModelUnavailableError(ModelProviderError):
    """Raised when a requested model is not provided by the runtime."""


class ModelProvider(ABC):
    """Interface used by EZRAB code to access an interchangeable model runtime."""

    default_model: str

    @abstractmethod
    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Return one non-streaming chat completion."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Return one non-streaming prompt completion."""

    @abstractmethod
    def stream(
        self,
        prompt: str,
        *,
        model: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield provider chunks for a prompt completion."""

    @abstractmethod
    async def list_models(self) -> list[dict[str, Any]]:
        """List models currently available from the provider."""

    @abstractmethod
    async def is_available(self) -> bool:
        """Return whether the provider runtime is reachable."""

    @abstractmethod
    async def supports_vision(self, *, model: str | None = None) -> bool:
        """Return whether the selected model reports vision capability."""

    @abstractmethod
    async def vision(
        self,
        image: bytes,
        prompt: str,
        *,
        model: str | None = None,
    ) -> dict[str, Any]:
        """Return a safe unsupported response until vision is implemented."""
