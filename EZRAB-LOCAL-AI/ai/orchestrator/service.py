import asyncio
import logging
import time
import uuid
from typing import Any

import httpx

from ai.context import ContextBuilder
from ai.prompts import build_model_prompt
from ai.providers import ModelProvider, ModelUnavailableError, ProviderUnavailableError
from ai.tools import ExecutionContext, ToolExecutor, ToolRegistry, register_read_only_tools
from ai.knowledge import KnowledgeRouter

from .intent import Intent, IntentDetector
from .response import error_response, success_response
from .router import ModelRouter
from .tool_router import ToolRouter


logger = logging.getLogger(__name__)
MAX_MODEL_OUTPUT_CHARS = 12_000
MODEL_TIMEOUT_SECONDS = 35


class AIOrchestrator:
    """Coordinates safe EZRAB AI requests without direct data access."""

    def __init__(
        self,
        provider: ModelProvider,
        *,
        context_builder: ContextBuilder | None = None,
        intent_detector: IntentDetector | None = None,
        model_router: ModelRouter | None = None,
        tool_registry: ToolRegistry | None = None,
    ):
        self._context_builder = context_builder or ContextBuilder()
        self._intent_detector = intent_detector or IntentDetector()
        self._model_router = model_router or ModelRouter(provider)
        self._tool_registry = tool_registry or ToolRegistry()
        if not self._tool_registry.list_tools(): register_read_only_tools(self._tool_registry)
        self._tool_executor = ToolExecutor(self._tool_registry)
        self._tool_router = ToolRouter(self._tool_registry)
        self._knowledge_router = KnowledgeRouter()

    async def handle_request(
        self,
        *,
        message: str,
        user_id: str | None = None,
        project_id: str | None = None,
        conversation_id: str | None = None,
        project_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        request_id = f"ezrab-ai-{uuid.uuid4().hex[:12]}"
        started_at = time.perf_counter()

        if not isinstance(message, str) or not message.strip():
            response = error_response(
                request_id=request_id,
                intent=Intent.UNKNOWN,
                code="INVALID_REQUEST",
                message="Pesan tidak boleh kosong.",
            )
            self._log_result(request_id, Intent.UNKNOWN, None, None, False, started_at)
            return response

        normalized_message = message.strip()
        knowledge_category, _ = self._knowledge_router.classify(normalized_message)
        try:
            intent = Intent(knowledge_category)
            # Preserve the legacy general-chat contract for bare greetings.
            if intent is Intent.SMALL_TALK and self._knowledge_router.static_response(normalized_message) is None:
                intent = self._intent_detector.detect(normalized_message)
        except ValueError:
            intent = self._intent_detector.detect(normalized_message)

        static = self._knowledge_router.static_response(normalized_message)
        if static is not None:
            response = success_response(request_id=request_id, intent=intent, message=static["message"], model=None, data={"knowledge": static}, tools_used=[])
            self._log_result(request_id, intent, "KnowledgeRouter", None, True, started_at)
            return response

        # Short-circuit small talk / greeting / how are you / thanks / goodbye
        if intent in {Intent.HOW_ARE_YOU, Intent.GREETING, Intent.SMALL_TALK, Intent.THANKS, Intent.GOODBYE, Intent.GENERAL_CHAT}:
            if intent == Intent.HOW_ARE_YOU:
                msg = "Saya baik dan siap membantu Anda di EZRAB. Mau membahas RAB, QTO, AHSP, Kurva S, laporan proyek, atau hal lainnya?"
            elif intent in {Intent.GREETING, Intent.GENERAL_CHAT}:
                msg = "Halo! Saya EZRAB Magic AI. Ada yang ingin Anda tanyakan tentang proyek, RAB, QTO, AHSP, atau manajemen proyek?"
            elif intent == Intent.THANKS:
                msg = "Sama-sama! Senang bisa membantu Anda di EZRAB. Ada lagi yang perlu dihitung atau diperiksa?"
            elif intent == Intent.GOODBYE:
                msg = "Sampai jumpa! Semoga proyek Anda berjalan lancar dan sukses selalu. Jangan ragu untuk menyapa saya kembali jika butuh bantuan."
            else:
                msg = "Saya selalu siap menemani dan membantu pekerjaan estimasi serta pengelolaan proyek Anda di EZRAB. Apa yang sedang ingin Anda kerjakan hari ini?"
            
            response = success_response(
                request_id=request_id,
                intent=intent,
                message=msg,
                model=None,
                data={"knowledge": {"source": "small_talk_engine", "intent": intent.value, "requires_project_context": False}},
                tools_used=[]
            )
            self._log_result(request_id, intent, "SmallTalkShortCircuit", None, True, started_at)
            return response

        live_categories = {Intent.PROJECT_COST_OPTIMIZATION, Intent.MATERIAL_ALTERNATIVE, Intent.RAB_ANALYSIS, Intent.QTO, Intent.AHSP, Intent.PROJECT_SUMMARY, Intent.PROJECT_PROGRESS, Intent.PROJECT_SCHEDULE, Intent.REPORTING}
        if intent in live_categories and not project_context:
            response = success_response(request_id=request_id, intent=intent, message="Data proyek aktif belum tersedia pada konteks AI. Saya belum dapat memberikan jawaban berbasis data yang akurat.", model=None, data={"knowledge": {"source": "knowledge_memory", "intent": intent.value, "cache_hit": False, "requires_ai_core": False}}, tools_used=[])
            self._log_result(request_id, intent, "KnowledgeRouter", None, True, started_at)
            return response

        if intent is Intent.MUTATION_REQUEST:
            response = success_response(
                request_id=request_id,
                intent=intent,
                message="Perubahan data belum dapat dilakukan karena EZRAB data tools belum terhubung.",
                model=None,
                data={"action": normalized_message},
                requires_confirmation=True,
            )
            self._log_result(request_id, intent, None, None, True, started_at)
            return response

        context = self._context_builder.build(
            message=normalized_message,
            user_id=user_id,
            project_id=project_id,
            conversation_id=conversation_id,
            project_context=project_context,
        )
        selection = self._model_router.select(intent)
        requested_tools = self._tool_router.select(intent)
        execution_context = ExecutionContext(request_id=request_id, project_id=project_id, user_id=user_id, conversation_id=conversation_id, source=context["data_access"]["source"], authorization_status="local_development", read_only=True, project_context=context)
        tool_results = []
        for tool_name in requested_tools:
            arguments = {"project_id": project_id}
            if tool_name == "search_ahsp": arguments.update({"query": normalized_message, "limit": 10})
            if tool_name == "search_rab_items": arguments.update({"query": normalized_message, "limit": 10})
            tool_results.append(await self._tool_executor.execute(tool_name, arguments, execution_context))
        context["tool_results"] = tool_results
        tools_used = [result["tool_name"] for result in tool_results]
        prompt = build_model_prompt(normalized_message, context)

        try:
            provider_response = await asyncio.wait_for(
                selection.provider.generate(prompt, model=selection.model), timeout=MODEL_TIMEOUT_SECONDS
            )
            model_message = provider_response.get("response", "")
            if not isinstance(model_message, str):
                raise ProviderUnavailableError("Model mengembalikan respons tidak valid.")
            model_message = model_message[:MAX_MODEL_OUTPUT_CHARS]
            response = success_response(
                request_id=request_id,
                intent=intent,
                message=model_message,
                model=selection.model,
                data={"tool_results": tool_results},
                tools_used=tools_used,
            )
            self._log_result(request_id, intent, type(selection.provider).__name__, selection.model, True, started_at)
            return response
        except ModelUnavailableError:
            response = error_response(
                request_id=request_id,
                intent=intent,
                code="MODEL_UNAVAILABLE",
                message="Model AI yang diperlukan belum tersedia secara lokal.",
            )
        except (asyncio.TimeoutError, httpx.TimeoutException):
            response = error_response(
                request_id=request_id,
                intent=intent,
                code="AI_CORE_TIMEOUT",
                message="Layanan AI membutuhkan waktu terlalu lama.",
                retryable=True,
            )
        except ProviderUnavailableError:
            response = error_response(
                request_id=request_id, intent=intent, code="AI_CORE_UNAVAILABLE",
                message="Layanan AI sedang tidak tersedia.", retryable=True,
            )
        except Exception:
            logger.error("ai_request_unexpected_error request_id=%s intent=%s error_code=AI_SERVICE_ERROR", request_id, intent.value)
            response = error_response(
                request_id=request_id,
                intent=intent,
                code="AI_SERVICE_ERROR",
                message="Terjadi gangguan pada AI service.",
            )

        self._log_result(request_id, intent, type(selection.provider).__name__, selection.model, False, started_at)
        return response

    def _log_result(
        self,
        request_id: str,
        intent: Intent,
        provider: str | None,
        model: str | None,
        success: bool,
        started_at: float,
    ) -> None:
        latency_ms = round((time.perf_counter() - started_at) * 1000, 2)
        logger.info(
            "ai_request request_id=%s intent=%s provider=%s model=%s latency_ms=%s success=%s",
            request_id,
            intent.value,
            provider,
            model,
            latency_ms,
            success,
        )
