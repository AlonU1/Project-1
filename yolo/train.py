"""Fine-tune a pre-trained YOLO model on your own dataset.

Point --data at a dataset YAML (see data/example_dataset.yaml) and start from
pre-trained weights — that converges far faster than training from scratch.

Examples
--------
    python train.py --data data/example_dataset.yaml --epochs 50
    python train.py --data data/example_dataset.yaml --model yolov8s.pt --batch 8 --device 0
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

DEFAULT_MODEL = "yolov8n.pt"


def parse_args():
    p = argparse.ArgumentParser(description="Fine-tune YOLO on a custom dataset")
    p.add_argument("--data", required=True, help="Path to the dataset YAML")
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Starting weights (default: {DEFAULT_MODEL})")
    p.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    p.add_argument("--imgsz", type=int, default=640, help="Training image size")
    p.add_argument("--batch", type=int, default=16, help="Batch size (-1 lets Ultralytics auto-pick)")
    p.add_argument("--device", default=None, help="'cpu', '0' for the first GPU, or leave empty to auto-pick")
    p.add_argument("--workers", type=int, default=4, help="Dataloader worker processes")
    p.add_argument("--patience", type=int, default=20, help="Stop early after this many epochs without improvement")
    p.add_argument("--project", default=None, help="Output directory (default: Ultralytics' runs/detect)")
    p.add_argument("--name", default="exp", help="Sub-folder name inside --project")
    p.add_argument("--resume", action="store_true", help="Resume an interrupted run from its last checkpoint")
    return p.parse_args()


def main():
    args = parse_args()

    model = YOLO(args.model)

    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        workers=args.workers,
        patience=args.patience,
        project=args.project,
        name=args.name,
        exist_ok=True,
        resume=args.resume,
    )

    # Validation on the dataset's val split, using the best checkpoint of this run.
    metrics = model.val()
    print("\n--- Validation results ---")
    print(f"mAP50-95: {metrics.box.map:.4f}")
    print(f"mAP50:    {metrics.box.map50:.4f}")
    print(f"mAP75:    {metrics.box.map75:.4f}")
    print(f"\nBest weights: {Path(model.trainer.save_dir) / 'weights' / 'best.pt'}")


if __name__ == "__main__":
    main()
