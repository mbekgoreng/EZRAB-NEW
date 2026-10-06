import asyncio, json, logging, time
from dataclasses import dataclass
from typing import Any
from .errors import ToolInputError, ToolNotFoundError, ToolSafetyError
logger = logging.getLogger(__name__)
MAX_TOOL_CALLS_PER_REQUEST, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES = 3, 16 * 1024, 64 * 1024
@dataclass(frozen=True)
class ExecutionContext:
    request_id: str; project_id: str | None; source: str | None; authorization_status: str; read_only: bool; project_context: dict[str, Any]; user_id: str | None = None; conversation_id: str | None = None
def unavailable(tool_name, request_id, source, limitation):
    return {"success": False, "tool_name": tool_name, "availability": "not_connected", "data": None, "items": [], "source": source, "limitations": [limitation], "request_id": request_id}
class ToolExecutor:
    def __init__(self, registry): self._registry, self._calls_by_request = registry, {}
    async def execute(self, tool_name, arguments, context):
        tool = self._registry.get(tool_name)
        if tool is None: raise ToolNotFoundError(f"Tool '{tool_name}' is not registered.")
        if tool.mutates_data or tool.access != "read" or not context.read_only: raise ToolSafetyError("Mutation tools are not allowed in STEP 5.")
        if len(json.dumps(arguments, ensure_ascii=False).encode()) > MAX_INPUT_BYTES: raise ToolInputError("Tool input exceeds 16 KB.")
        parsed = self._registry.validate_arguments(tool_name, arguments)
        project = context.project_context.get("project", {})
        if tool.requires_project and (not context.project_id or parsed.project_id != context.project_id or project.get("id") != context.project_id): raise ToolSafetyError("Tool project scope does not match active project context.")
        count = self._calls_by_request.get(context.request_id, 0)
        if count >= MAX_TOOL_CALLS_PER_REQUEST: return unavailable(tool_name, context.request_id, context.source, "Batas tool call per request telah tercapai.")
        self._calls_by_request[context.request_id] = count + 1; started = time.perf_counter()
        try:
            result = await asyncio.wait_for(tool.handler(parsed, context), timeout=tool.timeout_seconds)
            if len(json.dumps(result, ensure_ascii=False).encode()) > MAX_OUTPUT_BYTES: return unavailable(tool_name, context.request_id, context.source, "Output tool melebihi batas aman.")
            return result
        except asyncio.TimeoutError: return {"success": False, "tool_name": tool_name, "availability": "timeout", "data": None, "items": [], "source": context.source, "limitations": ["Tool melampaui batas waktu."], "request_id": context.request_id}
        except Exception:
            logger.error("tool_execution request_id=%s tool_name=%s status=error", context.request_id, tool_name)
            return {"success": False, "tool_name": tool_name, "availability": "error", "data": None, "items": [], "source": context.source, "limitations": ["Tool tidak dapat dijalankan."], "request_id": context.request_id}
        finally: logger.info("tool_execution request_id=%s tool_name=%s duration_ms=%s", context.request_id, tool_name, round((time.perf_counter()-started)*1000,2))
