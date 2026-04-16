#!/usr/bin/env python3
"""
Smart Pipeline Test Script

Tests the multi-method extraction pipeline on a file inside the `input` directory
and saves the result and detailed debug logs to the `output` directory.
"""

import sys
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

def configure_logging(log_file: Path):
    """Set up logging to go to both console and a debug log file."""
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)

    # Clear existing handlers
    logger.handlers.clear()

    # File handler (detailed debug)
    fh = logging.FileHandler(log_file, mode="w", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logger.addHandler(fh)

    # Console handler (clean info)
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(ch)

def main():
    """Run the smart pipeline on the input file."""
    # Ensure directories exist
    base_dir = Path(__file__).parent
    input_dir = base_dir / "input"
    output_dir = base_dir / "output"
    input_dir.mkdir(exist_ok=True)
    output_dir.mkdir(exist_ok=True)

    log_file = output_dir / "debug_log.txt"
    configure_logging(log_file)

    load_dotenv()

    # Find all input files
    supported = [".pdf", ".pptx"]
    input_files = []
    # Search recursively for supported files
    for f in input_dir.rglob("*"):
        if f.is_file() and f.suffix.lower() in supported and not f.name.startswith("~"):
            input_files.append(f)

    if not input_files:
        logging.error(f"❌ No supported files (PDF or PPTX) found in {input_dir}")
        sys.exit(1)

    logging.info(f"📄 Found {len(input_files)} files to process in {input_dir}")
    logging.info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    # Check for --vision flag to enable Gemini Vision mode
    use_vision = "--vision" in sys.argv
    gemini_key = os.getenv("GEMINI_API_KEY")

    if use_vision and not gemini_key:
        logging.warning("⚠️  --vision requested but GEMINI_API_KEY is missing. Falling back to local.")
    elif not use_vision:
        logging.info("💡 Running local heuristic path (use --vision to test Gemini Vision).")

    # Initialize pipeline
    from app.processing.smart_pipeline import SmartPipeline
    
    pipeline = SmartPipeline(
        use_vision=use_vision and bool(gemini_key),
        gemini_api_key=gemini_key,
    )

    for i, input_file in enumerate(input_files, 1):
        try:
            logging.info(f"\n🚀 [{i}/{len(input_files)}] Running Smart Pipeline on: {input_file.name}")
            markdown = pipeline.process(str(input_file))

            # Save Markdown
            md_file = output_dir / f"OUTPUT_{input_file.stem}_smart.md"
            with open(md_file, "w", encoding="utf-8") as f:
                f.write(markdown)

            logging.info(f"\n✅ Done with {input_file.name}!")
            logging.info(f"   Markdown Output: {md_file}")

            # Print quality summary
            lines = markdown.split("\n")
            headings = [l for l in lines if l.startswith("#")]
            lists = [l for l in lines if l.strip().startswith("- ") or l.strip().startswith("1. ")]
            tables = [l for l in lines if l.strip().startswith("|")]
            body = [l for l in lines if l.strip() and not l.startswith("#") and not l.strip().startswith("-") and not l.strip().startswith("1.") and not l.strip().startswith("|")]

            logging.info(f"📊 Quality Metrics:")
            logging.info(f"   Headings:   {len(headings)}")
            logging.info(f"   List items: {len(lists)}")
            logging.info(f"   Table rows: {len(tables)}")
            logging.info(f"   Body text:  {len(body)}")
            logging.info(f"   Total lines: {len(lines)}")
            logging.info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

        except Exception as e:
            logging.error(f"\n❌ Error processing {input_file.name}: {e}", exc_info=True)
            logging.info(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            continue

if __name__ == "__main__":
    main()
