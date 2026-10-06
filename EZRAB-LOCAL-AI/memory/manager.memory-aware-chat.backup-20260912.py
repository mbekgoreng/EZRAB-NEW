import json
import os
import uuid
from datetime import datetime, timezone


MEMORY_FILE = os.path.join(
    os.path.dirname(__file__),
    "storage.json"
)


def _load_memories():
    if not os.path.exists(MEMORY_FILE):
        return []

    try:
        with open(
            MEMORY_FILE,
            "r",
            encoding="utf-8"
        ) as f:
            return json.load(f)

    except (json.JSONDecodeError, OSError):
        return []


def _save_memories(memories):
    with open(
        MEMORY_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            memories,
            f,
            ensure_ascii=False,
            indent=2
        )


def save_memory(
    memory_type,
    key,
    value,
    scope="global",
    project_id=None,
    importance=0.5
):
    memories = _load_memories()

    memory = {
        "id": str(uuid.uuid4()),
        "type": memory_type,
        "scope": scope,
        "project_id": project_id,
        "key": key,
        "value": value,
        "importance": importance,
        "created_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat()
    }

    memories.append(memory)
    _save_memories(memories)

    return memory


def get_memories(
    memory_type=None,
    scope=None,
    project_id=None
):
    memories = _load_memories()

    results = []

    for memory in memories:

        if memory_type:
            if memory["type"] != memory_type:
                continue

        if scope:
            if memory["scope"] != scope:
                continue

        if project_id:
            if memory["project_id"] != project_id:
                continue

        results.append(memory)

    return results


def search_memory(query):
    memories = _load_memories()

    query = query.lower().strip()

    results = []

    for memory in memories:

        searchable = " ".join([
            str(memory.get("type", "")),
            str(memory.get("key", "")),
            str(memory.get("value", "")),
            str(memory.get("scope", "")),
            str(memory.get("project_id", ""))
        ]).lower()

        if query in searchable:
            results.append(memory)

    return results


def delete_memory(memory_id):
    memories = _load_memories()

    new_memories = [
        memory
        for memory in memories
        if memory["id"] != memory_id
    ]

    deleted = len(new_memories) != len(memories)

    if deleted:
        _save_memories(new_memories)

    return deleted