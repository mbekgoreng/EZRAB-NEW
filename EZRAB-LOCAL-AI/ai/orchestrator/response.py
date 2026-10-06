from typing import Any

from .intent import Intent


def success_response(
    *,
    request_id: str,
    intent: Intent,
    message: str,
    model: str | None,
    data: dict[str, Any] | None = None,
    tools_used: list[str] | None = None,
    requires_confirmation: bool = False,
) -> dict[str, Any]:
    return {
        "success": True,
        "request_id": request_id,
        "intent": intent.value,
        "message": message,
        "data": data or {},
        "tools_used": tools_used or [],
        "model": model,
        "requires_confirmation": requires_confirmation,
        "error": None,
    }


def error_response(
    *,
    request_id: str,
    intent: Intent,
    code: str,
    message: str,
    retryable: bool = False,
) -> dict[str, Any]:
    return {
        "success": False,
        "request_id": request_id,
        "intent": intent.value,
        "message": message,
        "data": {},
        "tools_used": [],
        "model": None,
        "requires_confirmation": False,
        "error": {"code": code, "message": message, "retryable": retryable},
    }
