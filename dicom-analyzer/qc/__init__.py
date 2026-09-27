"""Прототип пайплайна контроля качества DXA-снимков. Самодостаточная папка: математика лежит в vendor/ (копии рабочих модулей), модели — в models/."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(ROOT, "vendor")
MODELS_DIR = os.path.join(ROOT, "models")
if VENDOR not in sys.path:
    sys.path.insert(0, VENDOR)
