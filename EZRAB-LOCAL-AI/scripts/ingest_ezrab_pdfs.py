from __future__ import annotations

import argparse
from pathlib import Path

from ai.knowledge_ingestion import ingest_pdfs


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest EZRAB PDF datasets into searchable JSON knowledge.")
    parser.add_argument("pdf", nargs="+", help="PDF source paths")
    parser.add_argument("--output", default=str(Path(__file__).parents[1] / "knowledge" / "pdf_index.json"))
    args = parser.parse_args()
    print(ingest_pdfs(args.pdf, args.output))


if __name__ == "__main__":
    main()
