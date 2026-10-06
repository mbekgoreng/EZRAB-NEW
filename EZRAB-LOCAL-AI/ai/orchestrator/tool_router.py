from ai.tools import ToolRegistry

from .intent import Intent


class ToolRouter:
    """Selects registered tools when EZRAB data integrations become available."""

    def __init__(self, registry: ToolRegistry):
        self._registry = registry

    def select(self, intent: Intent) -> list[str]:
        routes = {Intent.PROJECT_QUESTION:["get_project_summary"], Intent.PROJECT_SUMMARY:["get_project_summary"], Intent.RAB_QUESTION:["get_rab_summary"], Intent.RAB_ANALYSIS:["get_rab_summary"], Intent.PROJECT_COST_OPTIMIZATION:["get_rab_summary","search_rab_items","calculate_rab_summary"], Intent.MATERIAL_ALTERNATIVE:["get_rab_summary","search_rab_items"], Intent.CALCULATION:["calculate_rab_summary"], Intent.AHSP_QUESTION:["search_ahsp"], Intent.AHSP:["search_ahsp"], Intent.QTO_QUESTION:["get_qto_summary"], Intent.QTO:["get_qto_summary"], Intent.REPORT_QUESTION:["get_report_summary"], Intent.REPORTING:["get_report_summary"], Intent.PROJECT_PROGRESS:["get_project_progress"], Intent.PROJECT_SCHEDULE:["get_project_progress","get_project_schedule"], Intent.SCHEDULE_QUESTION:["get_project_progress","get_project_schedule"]}
        return [name for name in routes.get(intent, []) if self._registry.get(name) is not None]
