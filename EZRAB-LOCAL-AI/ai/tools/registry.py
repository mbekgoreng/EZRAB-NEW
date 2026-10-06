from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any
from pydantic import BaseModel, ValidationError
from .errors import DuplicateToolError, ToolInputError, ToolNotFoundError


ToolHandler = Callable[[BaseModel, Any], Awaitable[dict[str, Any]]]

@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    category: str
    input_model: type[BaseModel]
    handler: ToolHandler
    access: str = "read"
    mutates_data: bool = False
    requires_project: bool = True
    output_schema: dict[str, Any] = field(default_factory=dict)
    availability: str = "context_dependent"
    data_source: str = "frontend_project_context"
    timeout_seconds: float = 1.0


class ToolRegistry:
    """Registry seam for future validated EZRAB data tools."""

    def __init__(self):
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition) -> None:
        if not tool.name.strip(): raise ToolInputError("Tool name cannot be empty.")
        if tool.name in self._tools: raise DuplicateToolError(f"Tool '{tool.name}' is already registered.")
        self._tools[tool.name] = tool

    def unregister(self, tool_name: str) -> ToolDefinition | None:
        return self._tools.pop(tool_name, None)

    def get(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def list_tools(self) -> list[ToolDefinition]: return [self._tools[name] for name in sorted(self._tools)]
    def list(self) -> list[str]: return [tool.name for tool in self.list_tools()]

    def validate_arguments(self, name: str, arguments: dict[str, Any]) -> BaseModel:
        tool = self.get(name)
        if tool is None: raise ToolNotFoundError(f"Tool '{name}' is not registered.")
        if not isinstance(arguments, dict): raise ToolInputError("Tool arguments must be an object.")
        try:
            return tool.input_model.model_validate(arguments) if hasattr(tool.input_model, "model_validate") else tool.input_model.parse_obj(arguments)
        except ValidationError as exc: raise ToolInputError(f"Invalid arguments for '{name}'.") from exc
