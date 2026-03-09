#!/usr/bin/env python3
"""
Smart Pipeline Test Script

Tests the multi-method extraction pipeline on INPUT.pdf and
saves the result as Markdown.
"""

import sys
import os
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s"
)


def main():
    """Run the smart pipeline on the input file."""
    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)

    # Find input file
    input_file = None
    supported = [".pdf", ".pptx"]
    for f in Path(".").iterdir():
        if f.name.upper().startswith("INPUT") and f.suffix.lower() in supported:
            input_file = f
            break

    if not input_file:
        print("❌ No INPUT file found (PDF or PPTX)")
        sys.exit(1)

    print(f"📄 Found: {input_file}")
    print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    # Check for --no-ai flag
    use_ai = "--no-ai" not in sys.argv

    if not use_ai:
        print("⚠️  AI models disabled (--no-ai flag)")

    # Run pipeline
    from app.processing.smart_pipeline import SmartPipeline

    pipeline = SmartPipeline(
        use_layout_detection=use_ai,
        use_table_transformer=use_ai,
    )

    try:
        print("\n🚀 Running Smart Pipeline...")
        markdown = pipeline.process(str(input_file))

        # Save Markdown
        md_file = output_dir / "OUTPUT_smart.md"
        with open(md_file, "w", encoding="utf-8") as f:
            f.write(markdown)

        print(f"\n✅ Done!")
        print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print(f"   Output: {md_file}")

        # Print quality summary
        lines = markdown.split("\n")
        headings = [l for l in lines if l.startswith("#")]
        lists = [l for l in lines if l.strip().startswith("- ") or l.strip().startswith("1. ")]
        tables = [l for l in lines if l.strip().startswith("|")]
        body = [l for l in lines if l.strip() and not l.startswith("#") and not l.strip().startswith("-") and not l.strip().startswith("1.") and not l.strip().startswith("|")]

        print(f"\n📊 Quality Metrics:")
        print(f"   Headings:   {len(headings)}")
        print(f"   List items: {len(lists)}")
        print(f"   Table rows: {len(tables)}")
        print(f"   Body text:  {len(body)}")
        print(f"   Total lines: {len(lines)}")

        # Preview first 30 lines
        print(f"\n📝 Preview (first 30 lines):")
        print(f"{'─' * 50}")
        for line in lines[:30]:
            print(f"  {line}")
        if len(lines) > 30:
            print(f"  ... ({len(lines) - 30} more lines)")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
