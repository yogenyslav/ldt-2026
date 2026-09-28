"""Fine-tune hip_keypoints (3 hip points + presence head). Usage from dicom-analyzer/:
    python -m training.finetune_hip_keypoints --submissions <dir|file> --images <dir> [--weights models/hip_keypoints.pt] [--out-dir training_out]"""
import argparse

from . import common, heatmap_train

TASK = "hip_keypoints"
NAMES = ["greater_trochanter_apex", "femoral_neck", "ischium"]      # fixed order of the model's channels


def main(argv=None) -> str:
    from qc.kp_model import KeypointHeatmapModel
    ap = argparse.ArgumentParser(description=__doc__)
    common.add_common_args(ap, TASK, "hip_keypoints.pt")
    heatmap_train.add_lr_args(ap)
    args = ap.parse_args(argv)
    # the model works in the canonical orientation "lateral side on the right": hip_right frames are mirrored
    return heatmap_train.finetune(args, KeypointHeatmapModel, NAMES, bone_mask=True, mirror_for=lambda s: s["image"]["region"] == "hip_right")


if __name__ == "__main__":
    main()
