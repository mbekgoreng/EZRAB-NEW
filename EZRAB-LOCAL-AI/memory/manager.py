import json
import os
import re
import uuid
from datetime import datetime, timezone


MEMORY_FILE = os.path.join(
    os.path.dirname(__file__),
    "storage.json"
)


STOPWORDS = {
    "ada", "adalah", "agar", "akan", "apa", "apakah", "atau", "bagaimana",
    "bagi", "dan", "dari", "dengan", "di", "dalam", "ini", "itu", "jika",
    "ke", "karena", "kami", "kamu", "mana", "pada", "saya", "sebaiknya",
    "sebuah", "serta", "tentang", "untuk", "yang",
}

# Istilah yang setara dalam percakapan EZRAB. Daftar ini sengaja terbatas
# agar perluasan istilah membantu pencarian tanpa memasukkan memory acak.
DOMAIN_TERMS = {
    "rab": {"rab", "rencana", "anggaran", "biaya", "estimasi"},
    "proyek": {"proyek", "project", "konstruksi", "pekerjaan"},
    "volume": {"volume", "kuantitas", "quantity", "takeoff"},
    "ahsp": {"ahsp", "analisa", "harga", "satuan"},
    "harga": {"harga", "biaya", "tarif", "cost"},
    "laporan": {"laporan", "report", "pelaporan"},
    "kurva_s": {"kurva", "schedule", "jadwal", "waktu", "progress"},
    "spreadsheet": {"spreadsheet", "worksheet", "tabel", "excel"},
    "rumus": {"rumus", "formula", "perhitungan", "terhubung"},
    "export": {"export", "ekspor", "excel", "pdf", "unduh"},
}


def _tokens(text):
    return {
        token
        for token in re.findall(r"[^\W_]+", str(text).lower(), flags=re.UNICODE)
        if token not in STOPWORDS and len(token) >= 3
    }


def _expanded_tokens(tokens):
    expanded = set(tokens)

    for terms in DOMAIN_TERMS.values():
        if tokens.intersection(terms):
            expanded.update(terms)

    return expanded


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


def search_memory(query, limit=None):
    """Cari memory berdasarkan istilah langsung dan istilah domain EZRAB terkait."""
    memories = _load_memories()

    query_tokens = _tokens(query)
    if not query_tokens:
        return []

    expanded_query_tokens = _expanded_tokens(query_tokens)
    scored_results = []

    for memory in memories:

        searchable = " ".join([
            str(memory.get("type", "")),
            str(memory.get("key", "")),
            str(memory.get("value", "")),
            str(memory.get("scope", "")),
            str(memory.get("project_id", ""))
        ])
        memory_tokens = _tokens(searchable)

        direct_matches = query_tokens.intersection(memory_tokens)
        related_matches = expanded_query_tokens.intersection(memory_tokens)
        if not related_matches:
            continue

        try:
            importance = float(memory.get("importance", 0.5))
        except (TypeError, ValueError):
            importance = 0.5

        importance = max(0.0, min(importance, 1.0))
        score = (len(direct_matches) * 3) + len(related_matches) + (importance * 0.25)
        scored_results.append((score, importance, memory))

    scored_results.sort(key=lambda item: (item[0], item[1]), reverse=True)
    results = [memory for _, _, memory in scored_results]
    return results[:limit] if limit is not None else results


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
