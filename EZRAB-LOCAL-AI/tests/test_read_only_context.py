import unittest

from ai.context.builder import ContextBuilder
from ai.orchestrator.service import AIOrchestrator


class ReadOnlyContextTests(unittest.TestCase):
    def _payload(self):
        return {
            "source": "frontend_project_context",
            "project": {"available": True, "id": "PRJ-1", "name": "Proyek Uji"},
            "rab": {"available": True, "items": [{"id": "RAB-1", "description": "Beton"}], "total": 1000},
            "work_items": {"available": False, "items": []},
            "qto": {"available": False, "items": []},
            "schedule": {"available": False, "items": []},
            "metadata": {"is_read_only": True, "generated_at": "2026-09-13T00:00:00.000Z", "contract_version": "1.0"},
        }

    def test_provided_project_context_is_exposed_without_mutation_tools(self):
        payload = self._payload()
        context = ContextBuilder().build(message="Berapa total RAB?", project_id="PRJ-1", project_context=payload)
        self.assertTrue(context["project"]["available"])
        self.assertEqual(context["rab"]["total"], 1000)
        self.assertTrue(context["data_access"]["read_only"])
        self.assertEqual(context["tools"], [])

    def test_missing_context_is_explicitly_unavailable(self):
        context = ContextBuilder().build(message="Berapa total RAB?", project_id="PRJ-1")
        self.assertFalse(context["project"]["available"])
        self.assertIn("belum tersedia", context["project"]["reason"].lower())
        self.assertFalse(context["rab"]["available"])

    def test_orchestrator_prompt_contains_supplied_context_and_no_data_tools(self):
        class Provider:
            default_model = "test-model"

            async def generate(self, prompt, model=None):
                self.prompt = prompt
                return {"response": "Total RAB konteks adalah Rp 1.000."}

        provider = Provider()
        response = __import__('asyncio').run(AIOrchestrator(provider).handle_request(
            message="Berapa total RAB?", project_id="PRJ-1", project_context=self._payload()
        ))
        self.assertTrue(response["success"])
        self.assertIn("Proyek Uji", provider.prompt)
        self.assertIn("1000", provider.prompt)
        self.assertEqual(response["tools_used"], ["get_rab_summary"])


if __name__ == "__main__":
    unittest.main()
