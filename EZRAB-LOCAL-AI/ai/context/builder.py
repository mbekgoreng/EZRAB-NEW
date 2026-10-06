from typing import Any

from memory.manager import search_memory


class ContextBuilder:
    """Builds only context that is connected to a real EZRAB data source."""

    def build(
        self,
        *,
        message: str,
        user_id: str | None = None,
        project_id: str | None = None,
        conversation_id: str | None = None,
        project_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        project_unavailable = "Data proyek aktif belum tersedia."
        read_only_context = self._validated_read_only_context(project_context, project_id)
        if read_only_context is not None:
            return {
                "user": {"available": user_id is not None, "id": user_id},
                "project": read_only_context["project"],
                "rab": read_only_context["rab"],
                "work_items": read_only_context["work_items"],
                "qto": read_only_context["qto"],
                "schedule": read_only_context["schedule"],
                # Do not query the legacy global JSON memory store in this
                # scoped bridge: it cannot yet enforce project/user isolation.
                "memory": {"available": False, "items": []},
                "conversation": {
                    "available": False,
                    "id": conversation_id,
                    "reason": "Data percakapan belum tersedia pada konteks proyek saat ini.",
                },
                "ahsp": {"available": False, "reason": "Data AHSP belum tersedia pada konteks proyek saat ini."},
                "data_access": {"read_only": True, "source": "frontend_project_context"},
                "tools": [],
            }

        memories = search_memory(message, limit=5)

        return {
            "user": {"available": user_id is not None, "id": user_id},
            "project": {
                "available": False,
                "id": project_id,
                "reason": project_unavailable,
            },
            "memory": {
                "available": bool(memories),
                "items": memories,
            },
            "conversation": {
                "available": False,
                "id": conversation_id,
                "reason": "EZRAB conversation service is not connected yet.",
            },
            "rab": {"available": False, "reason": project_unavailable},
            "ahsp": {"available": False, "reason": "EZRAB AHSP data service is not connected yet."},
            "work_items": {"available": False, "items": [], "reason": project_unavailable},
            "qto": {"available": False, "items": [], "reason": project_unavailable},
            "schedule": {"available": False, "items": [], "reason": project_unavailable},
            "data_access": {"read_only": True, "source": None},
            "tools": [],
        }

    @staticmethod
    def _validated_read_only_context(
        project_context: dict[str, Any] | None,
        project_id: str | None,
    ) -> dict[str, Any] | None:
        if not isinstance(project_context, dict):
            return None
        project = project_context.get("project")
        metadata = project_context.get("metadata")
        required = ("rab", "work_items", "qto", "schedule")
        if (
            project_context.get("source") != "frontend_project_context"
            or not isinstance(project, dict)
            or project.get("available") is not True
            or project.get("id") != project_id
            or not isinstance(metadata, dict)
            or metadata.get("is_read_only") is not True
            or any(not isinstance(project_context.get(key), dict) for key in required)
        ):
            return None
        return project_context
