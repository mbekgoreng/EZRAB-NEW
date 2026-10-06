from dataclasses import dataclass

from ai.providers import ModelProvider

from .intent import Intent


@dataclass(frozen=True)
class ModelSelection:
    provider: ModelProvider
    model: str


class ModelRouter:
    """Routes current intents to the configured local provider and model."""

    def __init__(self, provider: ModelProvider):
        self._provider = provider

    def select(self, intent: Intent) -> ModelSelection:
        return ModelSelection(provider=self._provider, model=self._provider.default_model)
