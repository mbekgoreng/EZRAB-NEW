from __future__ import annotations
import json, re, os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from .knowledge_ingestion import normalize_text

WEEKDAYS = ("Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu")
MONTHS = ("Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember")

class KnowledgeRouter:
    def __init__(self, root: Path | None = None):
        base = root or Path(__file__).resolve().parents[1] / "knowledge"
        self.items = []
        for path in sorted(base.glob("*.json")):
            if path.name == "pdf_index.json":
                continue
            self.items.extend(json.loads(path.read_text(encoding="utf-8")))
        self.items = [item for item in self.items if item.get("enabled", False)]
        self.pdf_entries = []
        index_path = base / "pdf_index.json"
        if index_path.is_file():
            try:
                self.pdf_entries = json.loads(index_path.read_text(encoding="utf-8")).get("entries", [])
            except (OSError, ValueError):
                self.pdf_entries = []

    @staticmethod
    def normalize(message: str) -> str:
        return normalize_text(re.sub(r"[^\w\s]", " ", message.lower()))

    def search(self, message: str, limit: int = 5) -> list[dict]:
        """Deterministic retrieval over ingested PDF entries."""
        stopwords = {"apa", "apakah", "bagaimana", "cara", "yang", "dan", "atau", "untuk", "dengan", "di", "ke", "dari", "ini", "itu"}
        query = {term for term in self.normalize(message).split() if term not in stopwords}
        if not query or not self.pdf_entries:
            return []
        ranked = []
        for entry in self.pdf_entries:
            haystack = set(self.normalize(f"{entry.get('question', '')} {' '.join(entry.get('keywords', []))}").split())
            overlap = len(query & haystack)
            if overlap == 0:
                continue
            # A one-token query is too ambiguous to claim a high-confidence answer.
            score = overlap / max(1, len(query))
            if len(query) < 2:
                score = min(score, 0.70)
            ranked.append((score, entry))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [dict(entry, confidence=round(score, 4), source="pdf_knowledge") for score, entry in ranked[:limit]]

    def classify(self, message: str) -> tuple[str, float]:
        text = self.normalize(message)
        if self._is_sensitive_or_injection(text):
            return "SECURITY_PRIVACY", 1.0
        if self._is_absurd_question(text):
            return "HUMOR", 1.0
        pdf_match = self.search(message, limit=1)
        if pdf_match and pdf_match[0].get("confidence", 0) >= 0.85:
            return pdf_match[0].get("intent") or pdf_match[0].get("category", "GENERAL_QUESTION"), pdf_match[0]["confidence"]
        for item in self.items:
            if text == self.normalize(item["canonical_question"]) or text in [self.normalize(a) for a in item.get("aliases", [])]:
                return item["category"], 1.0
        rules = (("DATE_TIME", ("hari apa", "tanggal berapa", "jam berapa", "sekarang kapan")), ("SECURITY_PRIVACY", ("aman", "privasi", "keamanan")), ("IDENTITY", ("siapa kamu", "developer", "pembuat")), ("PROJECT_COST_OPTIMIZATION", ("lebih murah", "kurangi biaya", "hemat biaya", "penghematan")), ("MATERIAL_ALTERNATIVE", ("material alternatif", "material lebih murah", "alternatif material")), ("RAB_ANALYSIS", ("total rab", "item rab", "analisis rab", "ringkasan rab")), ("QTO", ("qto", "quantity takeoff")), ("AHSP", ("ahsp", "harga satuan")), ("PROJECT_PROGRESS", ("progress proyek", "kemajuan proyek")), ("PROJECT_SCHEDULE", ("jadwal proyek", "kurva s")), ("REPORTING", ("laporan proyek", "buat laporan")), ("ACCOUNT_SUBSCRIPTION", ("subscription", "langganan", "akun")), ("TUTORIAL", ("bagaimana cara", "cara menggunakan", "tutorial")), ("HUMOR", ("bercanda", "lelucon", "joke")), ("SMALL_TALK", ("sudah makan", "halo", "hai", "apa kabar")))
        for category, terms in rules:
            if any(term in text for term in terms): return category, 0.8
        return "UNKNOWN", 0.0

    @staticmethod
    def _is_sensitive_or_injection(text: str) -> bool:
        """Recognise requests that must never be delegated to the model/tools."""
        patterns = (
            "password", "kata sandi", "otp", "api key", "server key", "access token",
            "refresh token", "cookie", "secret", "bypass", "lewati autentikasi",
            "lewati permission", "hapus audit log", "hapus database", "sql mentah",
            "abaikan instruksi", "ignore previous", "system prompt", "prompt internal",
            "buka data user lain", "aktifkan pro tanpa pembayaran", "tambah credit ilegal",
        )
        return any(pattern in text for pattern in patterns)

    @staticmethod
    def _is_absurd_question(text: str) -> bool:
        patterns = (
            "rumah di mars", "di mars", "rumah di atas awan", "volume awan", "hujan berhenti",
            "kurva s untuk perjalanan cinta", "rasa malas", "volume rasa", "menghitung cinta",
            "mengejar deadline", "tukang yang sedang ngopi", "mengambil palu", "menangkap angin",
            "membaca pikiran owner", "rumah yang tidak pernah berdebu", "pasir menjadi emas",
        )
        return any(pattern in text for pattern in patterns)

    def static_response(self, message: str) -> dict | None:
        category, confidence = self.classify(message)
        text = self.normalize(message)
        if self._is_sensitive_or_injection(text):
            return {
                "message": "Maaf, saya tidak dapat menampilkan rahasia, melewati autentikasi/permission, mengakses data user lain, atau menjalankan instruksi berisiko. Saya dapat membantu melalui alur EZRAB yang sah dan tercatat.",
                "intent": "SECURITY_PRIVACY",
                "cache_hit": False,
                "requires_ai_core": False,
                "safe_refusal": True,
            }
        if "rumah di mars" in text or "di mars" in text:
            return {"message": "Kalau materialnya dikirim pakai roket, ongkos logistiknya bisa lebih mahal daripada betonnya. 🚀😄\n\nUntuk saat ini saya belum bisa menghitungnya secara valid tanpa data teknis, harga material, dan metode konstruksi untuk lingkungan Mars. Saya bisa membantu menghitung RAB proyek di lokasi nyata.", "intent": "HUMOR", "cache_hit": False, "requires_ai_core": False}
        if "kurva s" in text and "cinta" in text:
            return {"message": "Kurvanya mungkin naik saat chat dibalas dan turun saat cuma dibaca. 😂\n\nKurva S EZRAB digunakan untuk memantau progres pekerjaan konstruksi berdasarkan bobot dan jadwal proyek.", "intent": "HUMOR", "cache_hit": False, "requires_ai_core": False}
        if "rasa malas" in text or "volume rasa" in text:
            return {"message": "Untuk rasa malas, satuannya belum tersedia di AHSP—mungkin mager/hari. 😄\n\nEZRAB dapat menghitung volume pekerjaan berdasarkan dimensi, jumlah, luas, panjang, atau volume yang terukur.", "intent": "HUMOR", "cache_hit": False, "requires_ai_core": False}
        if self._is_absurd_question(text):
            return {"message": "Kalau itu bisa dilakukan, mungkin EZRAB sudah punya cabang di planet lain. 😄\n\nUntuk saat ini saya belum dapat memastikan atau menjalankannya karena berada di luar data atau fitur yang tersedia. Saya tetap bisa membantu pada RAB, QTO, AHSP, harga, laporan, dan manajemen proyek.", "intent": "HUMOR", "cache_hit": False, "requires_ai_core": False}
        pdf_matches = self.search(message, limit=1)
        if pdf_matches and pdf_matches[0].get("confidence", 0) >= 0.85:
            entry = pdf_matches[0]
            return {
                "message": entry["answer"],
                "intent": entry.get("intent") or entry.get("category", "GENERAL_QUESTION"),
                "cache_hit": True,
                "requires_ai_core": False,
                "confidence": entry["confidence"],
                "source": {"type": "PDF", "file": entry.get("source_file"), "page": entry.get("page_number"), "entry_id": entry.get("id")},
            }
        if category == "DATE_TIME":
            try:
                jakarta = ZoneInfo("Asia/Jakarta")
            except Exception:
                jakarta = timezone(timedelta(hours=7))
            now = datetime.now(jakarta)
            return {"message": f"Sekarang hari {WEEKDAYS[now.weekday()]}, {now.day} {MONTHS[now.month-1]} {now.year}, pukul {now:%H.%M} WIB.", "intent": category, "cache_hit": False, "requires_ai_core": False}
        for item in self.items:
            if item["category"] == category and (text == self.normalize(item["canonical_question"]) or text in [self.normalize(a) for a in item.get("aliases", [])]):
                if item.get("requires_live_data") or item.get("requires_project_context"): return None
                answer = item.get("answer", "")
                if item.get("id") == "identity.developer" and os.getenv("EZRAB_OFFICIAL_DEVELOPER_NAME"):
                    answer = f"EZRAB AI dikembangkan oleh {os.environ['EZRAB_OFFICIAL_DEVELOPER_NAME']} sesuai konfigurasi resmi produk."
                return {"message": answer, "intent": category, "cache_hit": True, "requires_ai_core": False, "knowledge_version": item.get("version", 1)}
        return None
