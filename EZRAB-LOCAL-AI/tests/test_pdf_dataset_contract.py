import json
import unittest
from pathlib import Path

from ai.knowledge import KnowledgeRouter


class PdfDatasetContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.router = KnowledgeRouter()

    def test_both_datasets_are_indexed(self):
        files = {entry["source_file"] for entry in self.router.pdf_entries}
        self.assertEqual(files, {
            "EZRAB_1000_Pertanyaan_Jawaban_Co_Assistant.pdf",
            "EZRAB_200_Pertanyaan_Aneh_Jawaban_Humor.pdf",
        })

    def test_retrieval_returns_traceable_source(self):
        result = self.router.static_response("Apa fungsi QTO dan Pengukuran di EZRAB?")
        self.assertIsNotNone(result)
        self.assertEqual(result["source"]["type"], "PDF")
        self.assertGreaterEqual(result["confidence"], 0.85)
        self.assertTrue(result["source"]["page"] > 0)

    def test_humor_dataset_does_not_claim_live_capability(self):
        result = self.router.static_response("Bisa menghitung RAB rumah di Mars?")
        self.assertEqual(result["intent"], "HUMOR")
        self.assertIn("belum", result["message"].lower())


if __name__ == "__main__":
    unittest.main()
