import asyncio
import unittest

from ai.tools import ExecutionContext, ToolDefinition, ToolExecutor, ToolRegistry, register_read_only_tools
from ai.tools.errors import DuplicateToolError, ToolInputError, ToolNotFoundError, ToolSafetyError
from ai.tools.models import ProjectIdArguments


def project_context(project_id="PRJ-1", rab_available=True):
    return {
        "project": {"available": True, "id": project_id, "name": "Proyek Uji", "status": "in_progress", "progress": 30},
        "rab": {"available": rab_available, "total": 1500 if rab_available else None, "item_count": 2 if rab_available else None,
                "items": [{"id": "R1", "description": "Beton", "category": "Struktur", "amount": 1000}, {"id": "R2", "description": "Bata", "category": "Arsitektur", "amount": 500}] if rab_available else []},
        "work_items": {"available": False, "items": []}, "qto": {"available": False, "items": []},
        "schedule": {"available": False, "items": []}, "data_access": {"read_only": True, "source": "frontend_project_context"},
    }


class ToolRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = ToolRegistry()
        register_read_only_tools(self.registry)
        self.context = ExecutionContext(request_id="req-1", project_id="PRJ-1", source="frontend_project_context", authorization_status="local_development", read_only=True, project_context=project_context())
        self.executor = ToolExecutor(self.registry)

    def test_register_and_duplicate_rejection(self):
        self.assertIsNotNone(self.registry.get("get_project_summary"))
        with self.assertRaises(DuplicateToolError):
            self.registry.register(self.registry.get("get_project_summary"))

    def test_unregistered_and_invalid_input_are_rejected(self):
        with self.assertRaises(ToolNotFoundError):
            asyncio.run(self.executor.execute("missing", {}, self.context))
        with self.assertRaises(ToolInputError):
            self.registry.validate_arguments("get_project_summary", {"project_id": 9})

    def test_read_only_rab_tools_and_no_mutation(self):
        before = repr(self.context.project_context)
        result = asyncio.run(self.executor.execute("get_rab_summary", {"project_id": "PRJ-1"}, self.context))
        self.assertTrue(result["success"])
        self.assertEqual(result["data"]["context_total"], 1500)
        searched = asyncio.run(self.executor.execute("search_rab_items", {"project_id": "PRJ-1", "query": "beton", "limit": 5}, self.context))
        self.assertEqual(searched["data"]["result_count"], 1)
        self.assertEqual(before, repr(self.context.project_context))

    def test_unavailable_context_and_ahsp_are_not_connected(self):
        unavailable = ExecutionContext(request_id="req-2", project_id="PRJ-1", source="frontend_project_context", authorization_status="local_development", read_only=True, project_context=project_context(rab_available=False))
        result = asyncio.run(self.executor.execute("get_rab_summary", {"project_id": "PRJ-1"}, unavailable))
        self.assertEqual(result["availability"], "not_connected")
        ahsp = asyncio.run(self.executor.execute("search_ahsp", {"project_id": "PRJ-1", "query": "beton", "limit": 5}, self.context))
        self.assertEqual(ahsp["availability"], "not_connected")

    def test_mutation_project_mismatch_and_limits_are_rejected(self):
        mutation = ToolDefinition(name="unsafe", description="unsafe", category="test", input_model=ProjectIdArguments, handler=lambda *_: {}, mutates_data=True)
        self.registry.register(mutation)
        with self.assertRaises(ToolSafetyError):
            asyncio.run(self.executor.execute("unsafe", {"project_id": "PRJ-1"}, self.context))
        with self.assertRaises(ToolSafetyError):
            asyncio.run(self.executor.execute("get_rab_summary", {"project_id": "PRJ-OTHER"}, self.context))

    def test_timeout_output_and_input_limits(self):
        async def slow(_arguments, _context):
            await asyncio.sleep(0.1)
            return {"success": True}
        self.registry.register(ToolDefinition(name="slow", description="slow", category="test", input_model=ProjectIdArguments, handler=slow, timeout_seconds=0.001))
        timed = asyncio.run(self.executor.execute("slow", {"project_id": "PRJ-1"}, self.context))
        self.assertEqual(timed["availability"], "timeout")
        with self.assertRaises(ToolInputError):
            asyncio.run(self.executor.execute("get_rab_summary", {"project_id": "PRJ-1", "padding": "x" * 20000}, self.context))


if __name__ == "__main__":
    unittest.main()
