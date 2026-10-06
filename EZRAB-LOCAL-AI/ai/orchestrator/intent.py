from enum import StrEnum


class Intent(StrEnum):
    GREETING = "GREETING"
    HOW_ARE_YOU = "HOW_ARE_YOU"
    BASIC_QUESTION = "BASIC_QUESTION"
    HELP_REQUEST = "HELP_REQUEST"
    IDENTITY = "IDENTITY"
    DATE_TIME = "DATE_TIME"
    EZRAB_CAPABILITIES = "EZRAB_CAPABILITIES"
    PROJECT_COST_OPTIMIZATION = "PROJECT_COST_OPTIMIZATION"
    MATERIAL_ALTERNATIVE = "MATERIAL_ALTERNATIVE"
    RAB_ANALYSIS = "RAB_ANALYSIS"
    QTO = "QTO"
    AHSP = "AHSP"
    PROJECT_SUMMARY = "PROJECT_SUMMARY"
    PROJECT_PROGRESS = "PROJECT_PROGRESS"
    PROJECT_SCHEDULE = "PROJECT_SCHEDULE"
    REPORTING = "REPORTING"
    SECURITY_PRIVACY = "SECURITY_PRIVACY"
    ACCOUNT_SUBSCRIPTION = "ACCOUNT_SUBSCRIPTION"
    TUTORIAL = "TUTORIAL"
    SMALL_TALK = "SMALL_TALK"
    HUMOR = "HUMOR"
    OFF_TOPIC = "OFF_TOPIC"
    THANKS = "THANKS"
    GOODBYE = "GOODBYE"
    GENERAL_CHAT = "general_chat"
    PROJECT_QUESTION = "project_question"
    RAB_QUESTION = "rab_question"
    AHSP_QUESTION = "ahsp_question"
    QTO_QUESTION = "qto_question"
    REPORT_QUESTION = "report_question"
    SCHEDULE_QUESTION = "schedule_question"
    CALCULATION = "calculation"
    DOCUMENT_ANALYSIS = "document_analysis"
    VISION_ANALYSIS = "vision_analysis"
    MUTATION_REQUEST = "mutation_request"
    UNKNOWN = "unknown"


class IntentDetector:
    """Deterministic intent detector for EZRAB AI Core."""

    _how_are_you_terms = (
        "apa kabar", "apakabar", "gimana kabarnya", "kabarnya bagaimana",
        "kamu apa kabar", "sehat", "are you okay", "how are you",
        "bagaimana keadaanmu", "lagi apa", "sedang apa", "lagi ngapain"
    )

    _greeting_terms = (
        "halo", "hallo", "hai", "selamat pagi", "selamat siang", "selamat sore", "selamat malam",
        "assalamualaikum", "assalamu'alaikum", "permisi", "tes", "test", "ping", "p", "cek"
    )

    _thanks_terms = (
        "terima kasih", "terimakasih", "makasih", "thanks", "thank you", "matur nuwun", "syukran"
    )

    _goodbye_terms = (
        "sampai jumpa", "dadah", "bye", "goodbye", "selamat tinggal", "pamit"
    )

    _rules = (
        (Intent.VISION_ANALYSIS, ("gambar", "drawing", "denah", "foto")),
        (Intent.DOCUMENT_ANALYSIS, ("pdf", "dokumen", "docx", "xlsx", "ded")),
        (Intent.MUTATION_REQUEST, ("tambahkan", "tambah", "ubah", "update", "hapus", "delete", "masukkan", "buatkan")),
        (Intent.AHSP_QUESTION, ("ahsp", "analisa harga satuan")),
        (Intent.QTO_QUESTION, ("qto", "quantity takeoff", "takeoff")),
        (Intent.REPORT_QUESTION, ("laporan", "report")),
        (Intent.SCHEDULE_QUESTION, ("kurva s", "schedule", "jadwal proyek", "time schedule")),
        (Intent.CALCULATION, ("hitung", "kalkulasi", "volume")),
        (Intent.RAB_QUESTION, ("rab", "rencana anggaran", "biaya proyek")),
        (Intent.PROJECT_QUESTION, ("proyek", "project")),
    )

    def detect(self, message: str) -> Intent:
        normalized = message.lower().strip().replace("?", "").replace("!", "")
        
        # 1. How are you / Apa kabar
        if any(term in normalized for term in self._how_are_you_terms):
            return Intent.HOW_ARE_YOU

        # 2. Greetings
        if any(normalized == g or normalized.startswith(g + " ") for g in self._greeting_terms):
            return Intent.GREETING

        # 3. Thanks
        if any(term in normalized for term in self._thanks_terms):
            return Intent.THANKS

        # 4. Goodbye
        if any(term in normalized for term in self._goodbye_terms):
            return Intent.GOODBYE

        # 5. Domain Rules
        for intent, terms in self._rules:
            if any(term in normalized for term in terms):
                return intent

        return Intent.UNKNOWN

