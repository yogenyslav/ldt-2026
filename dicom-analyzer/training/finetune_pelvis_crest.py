"""Fine-tune pelvis_crest (2 iliac crest points + presence head). Usage from dicom-analyzer/:
    python -m training.finetune_pelvis_crest --submissions <dir|file> --images <dir> [--weights models/pelvis_crest.pt] [--out-dir training_out]"""
import argparse

from . import common, heatmap_train

TASK = "pelvis_crest"
NAMES = ["crest_left", "crest_right"]


def main(argv=None) -> str:
    from qc.crest_models import KeypointHeatmapModel
    ap = argparse.ArgumentParser(description=__doc__)
    common.add_common_args(ap, TASK, "pelvis_crest.pt")
    heatmap_train.add_lr_args(ap)
    args = ap.parse_args(argv)
    return heatmap_train.finetune(args, KeypointHeatmapModel, NAMES, bone_mask=False, mirror_for=lambda s: False)


if __name__ == "__main__":
    main()
