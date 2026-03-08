import sys
import os
sys.path.insert(0, os.path.abspath('.'))
from app.routers.chat import inject_citations

text = """| Feature | Bandwidth | Throughput |
|---|---|---|
| Definition | How much data *can* move in a time period | How much data *actually* moves in a time period |
| Matching | Bandwidth is a theoretical maximum | Throughput is often less than bandwidth |
| Influences |  | Data amount, data type, network delays |"""

sources = [{"text_preview": "Bandwidth is max while throughput is actual"}]
print("RESULT:")
print(repr(inject_citations(text, sources)))
