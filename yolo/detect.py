"""Run YOLO object detection on an image, a video, a folder or a webcam.

Uses a pre-trained Ultralytics model (COCO, 80 classes) out of the box —
no training needed to try it.

Examples
--------
    python detect.py --source bus.jpg
    python detect.py --source my_photos/ --conf 0.5
    python detect.py --source clip.mp4 --model yolov8s.pt
    python detect.py --source 0 --show          # webcam, live window
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

# Ultralytics downloads these automatically on first use.
# n = nano (fastest), s = small, m = medium, l = large, x = extra large.
DEFAULT_MODEL = "yolov8n.pt"


def parse_args():
    p = argparse.ArgumentParser(description="YOLO detection on images / video / webcam")
    p.add_argument(
        "--source",
        required=True,
        help="Image, video, folder, glob, URL, or a camera index such as 0",
    )
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Model weights (default: {DEFAULT_MODEL})")
    p.add_argument("--conf", type=float, default=0.25, help="Confidence threshold (0-1)")
    p.add_argument("--imgsz", type=int, default=640, help="Inference image size")
    p.add_argument("--device", default=None, help="'cpu', '0' for the first GPU, or leave empty to auto-pick")
    p.add_argument("--classes", type=int, nargs="+", default=None, help="Keep only these class ids, e.g. --classes 0 2")
    p.add_argument("--show", action="store_true", help="Open a live preview window")
    p.add_argument("--no-save", action="store_true", help="Do not write annotated files to disk")
    p.add_argument("--project", default=None, help="Output directory (default: Ultralytics' runs/detect)")
    p.add_argument("--name", default="predict", help="Sub-folder name inside --project")
    return p.parse_args()


def main():
    args = parse_args()

    # A bare number means a camera index, and Ultralytics wants it as an int.
    source = int(args.source) if args.source.isdigit() else args.source

    model = YOLO(args.model)

    results = model.predict(
        source=source,
        conf=args.conf,
        imgsz=args.imgsz,
        device=args.device,
        classes=args.classes,
        show=args.show,
        save=not args.no_save,
        project=args.project,
        name=args.name,
        exist_ok=True,
        stream=True,  # generator: keeps memory flat on videos and large folders
    )

    total = 0
    save_dir = None
    for frame_idx, result in enumerate(results):
        save_dir = result.save_dir
        boxes = result.boxes
        total += len(boxes)
        counts = {}
        for cls_id in boxes.cls.tolist():
            label = model.names[int(cls_id)]
            counts[label] = counts.get(label, 0) + 1

        where = Path(result.path).name if isinstance(result.path, str) else f"frame {frame_idx}"
        summary = ", ".join(f"{n}x {label}" for label, n in sorted(counts.items())) or "nothing found"
        print(f"{where}: {summary}")

    print(f"\n{total} object(s) detected in total.")
    if not args.no_save and save_dir:
        print(f"Annotated output saved under: {save_dir}")


if __name__ == "__main__":
    main()
