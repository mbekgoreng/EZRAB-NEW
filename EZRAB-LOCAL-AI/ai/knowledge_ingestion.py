from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader


QUESTION_RE = re.compile(r"(?m)^\s*(\d{1,4})\.\s+(.+?)\s*$")
ANSWER_RE = re.compile(r"(?is)\bJawaban:\s*(.+?)(?=\n\s*\d{1,4}\.\s+|\Z)")
PAGE_MARKER_RE = re.compile(r"\s*EZRAB AI Co Assistant\s*-.*?Halaman\s+\d+", re.I)


@dataclass(frozen=True)
class KnowledgeEntry:
    id: str
    document_id: str
    source_file: str
    page_number: int
    section: str
    category: str
    question: str
    answer: str
    keywords: list[str]
    synonyms: list[str]
    intent: str
    language: str = "id"
    version: int = 1
    status: str = "ACTIVE"
    created_at: str = ""
    updated_at: str = ""


def normalize_text(value: str) -> str:
    value = value.replace("\ufffd", " ").replace("\\n", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" -\n\r")


def _keywords(question: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9À-ÿ]+", question.lower())
    stopwords = {"yang", "dan", "atau", "untuk", "dengan", "dari", "pada", "apa", "apakah", "bagaimana", "cara", "di", "ke"}
    return list(dict.fromkeys(word for word in words if len(word) > 2 and word not in stopwords))[:20]


def _section_for_question(question: str) -> str:
    # Dataset 1000 uses a section heading before groups of questions.
    return normalize_text(question.split("?")[0]) if "?" not in question else ""


def _category(question: str, source_file: str) -> tuple[str, str]:
    text = question.lower()
    rules = (
        ("SECURITY_PRIVACY", ("keamanan", "password", "otp", "akun")),
        ("SUBSCRIPTION_INFORMATION", ("subscription", "kredit", "qris", "pembayaran", "trial", "pro")),
        ("QTO", ("qto", "pengukuran", "quantity takeoff")),
        ("RAB", ("rab", "anggaran")),
        ("AHSP", ("ahsp", "harga satuan")),
        ("VOLUME_CALCULATION", ("volume", "dimensi")),
        ("PROJECT_PROGRESS", ("progres", "progress", "kurva s", "jadwal")),
        ("DOCUMENT_ANALYSIS", ("pdf", "dokumen", "ded", "magic ai")),
        ("HUMOR", ("mars", "awan", "galau", "cinta", "ngopi", "gosip", "superhero", "naga")),
    )
    for intent, terms in rules:
        if any(re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text) for term in terms):
            return intent, intent
    return ("HUMOR" if "200_Pertanyaan_Aneh" in source_file else "GENERAL_QUESTION"), "GENERAL_QUESTION"


def _parse_document(path: Path) -> list[KnowledgeEntry]:
    reader = PdfReader(str(path))
    document_id = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    now = datetime.now(timezone.utc).isoformat()
    entries: list[KnowledgeEntry] = []
    pages = [PAGE_MARKER_RE.sub("", page.extract_text() or "") for page in reader.pages]
    full_text = "\n\n".join(pages)
    page_offsets = []
    offset = 0
    for page_number, page_text in enumerate(pages, start=1):
        page_offsets.append((offset, page_number))
        offset += len(page_text) + 2
    questions = list(QUESTION_RE.finditer(full_text))
    for index, match in enumerate(questions):
        question = normalize_text(match.group(2))
        chunk_end = questions[index + 1].start() if index + 1 < len(questions) else len(full_text)
        chunk = full_text[match.end():chunk_end]
        answer_match = ANSWER_RE.search(chunk)
        if not answer_match:
            continue
        answer = normalize_text(answer_match.group(1))
        page_number = max(page for start, page in page_offsets if start <= match.start())
        category, intent = _category(question, path.name)
        entry_id = f"pdf-{document_id}-{match.group(1)}"
        entries.append(KnowledgeEntry(
            id=entry_id,
            document_id=document_id,
            source_file=path.name,
            page_number=page_number,
            section=category,
            category=category,
            question=question,
            answer=answer,
            keywords=_keywords(question),
            synonyms=[],
            intent=intent,
            created_at=now,
            updated_at=now,
        ))
    return entries


def ingest_pdfs(pdf_paths: Iterable[str | Path], output_path: str | Path) -> dict:
    paths = [Path(path) for path in pdf_paths]
    missing = [str(path) for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(", ".join(missing))
    entries: list[KnowledgeEntry] = []
    documents = []
    for path in paths:
        entries.extend(_parse_document(path))
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        documents.append({"document_id": digest[:16], "source_file": path.name, "sha256": digest, "status": "ACTIVE"})
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"documents": documents, "entries": [asdict(entry) for entry in entries]}, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"documents": len(documents), "entries": len(entries), "output": str(output)}
