"""
AI-Powered Layout Detection using Hugging Face Models (Offline)

Uses YOLO-DocLayNet model to detect document regions:
Title, Section-header, Text, List-item, Table, Figure, Caption, etc.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# DocLayNet label mapping (from the YOLO-DocLayNet model)
DOCLAYNET_LABELS = {
    0: "Caption",
    1: "Footnote",
    2: "Formula",
    3: "List-item",
    4: "Page-footer",
    5: "Page-header",
    6: "Picture",
    7: "Section-header",
    8: "Table",
    9: "Text",
    10: "Title",
}


class LayoutDetector:
    """
    Detects document layout regions using a YOLO model trained on DocLayNet.
    Falls back to empty results if the model is not available.
    """

    def __init__(self, model_name: str = "hantian/yolo-doclaynet"):
        self.model_name = model_name
        self.model = None
        self._load_attempted = False

    def _ensure_model(self):
        """Lazy-load the model on first use."""
        if self._load_attempted:
            return

        self._load_attempted = True
        try:
            from ultralytics import YOLO
            from huggingface_hub import hf_hub_download

            # Download model from Hugging Face
            model_path = hf_hub_download(
                repo_id=self.model_name,
                filename="best.pt"
            )
            self.model = YOLO(model_path)
            logger.info(f"Layout detection model loaded: {self.model_name}")
        except ImportError as e:
            logger.warning(f"Layout detection unavailable (missing dependency): {e}")
            logger.warning("Install with: pip install ultralytics huggingface-hub")
        except Exception as e:
            logger.warning(f"Layout detection model failed to load: {e}")
            logger.warning("Layout detection will be skipped. Font-based extraction will still work.")

    def detect(self, image) -> List[Dict[str, Any]]:
        """
        Detect layout regions in a page image.

        Args:
            image: PIL Image of a PDF page

        Returns:
            List of detected regions with bbox, label, and confidence
        """
        self._ensure_model()

        if self.model is None:
            return []

        try:
            results = self.model(image, verbose=False)

            detections = []
            for result in results:
                boxes = result.boxes
                if boxes is None:
                    continue

                for i in range(len(boxes)):
                    box = boxes[i]
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])

                    label = DOCLAYNET_LABELS.get(cls_id, f"Unknown-{cls_id}")

                    detections.append({
                        "bbox": (x1, y1, x2, y2),
                        "label": label,
                        "confidence": conf,
                        "class_id": cls_id,
                    })

            # Sort by Y position (top to bottom)
            detections.sort(key=lambda d: d["bbox"][1])

            logger.debug(f"Detected {len(detections)} layout regions")
            return detections

        except Exception as e:
            logger.error(f"Layout detection failed: {e}")
            return []

    def detect_from_pdf(self, pdf_path: str, dpi: int = 200) -> List[List[Dict[str, Any]]]:
        """
        Detect layouts for all pages in a PDF.

        Returns:
            List of detection results, one per page
        """
        self._ensure_model()

        if self.model is None:
            return []

        try:
            from pdf2image import convert_from_path

            images = convert_from_path(pdf_path, dpi=dpi)
            all_detections = []

            for page_num, image in enumerate(images):
                detections = self.detect(image)
                # Add page info and scale factors
                for d in detections:
                    d["page"] = page_num + 1
                    d["image_width"] = image.width
                    d["image_height"] = image.height
                all_detections.append(detections)

            return all_detections

        except ImportError:
            logger.warning("pdf2image not available. Cannot convert PDF to images for layout detection.")
            return []
        except Exception as e:
            logger.error(f"PDF layout detection failed: {e}")
            return []

    @property
    def is_available(self) -> bool:
        """Check if the model is loaded and available."""
        self._ensure_model()
        return self.model is not None
