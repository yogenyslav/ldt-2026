"""Dispatcher: python -m training <hip_keypoints|pelvis_crest|pelvis_presence|foreign_seg> [script options]"""
import importlib
import sys

MODELS = ("hip_keypoints", "pelvis_crest", "pelvis_presence", "foreign_seg")

if len(sys.argv) < 2 or sys.argv[1] not in MODELS:
    raise SystemExit(f"usage: python -m training <{'|'.join(MODELS)}> --submissions ... --images ...")
importlib.import_module(f"training.finetune_{sys.argv[1]}").main(sys.argv[2:])
