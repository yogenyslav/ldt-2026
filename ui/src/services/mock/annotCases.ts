/* Frames for the annotation desk.
   Real model output on real DICOMs, exported by
   dicom-analyzer/examples/annotation/export_for_ui.py.
   All coordinates are original-frame pixels, as the annotation contract
   requires: the SVG viewBox equals cols x rows, so a marker sits exactly
   where a real submission would put it. */

import type { IAnnotCase } from '@/types'

export const ANNOT_CASES: IAnnotCase[] = [
  {
    key: "hip_left",
    task: "hip_keypoints",
    file: "CR000002.dcm",
    region: "hip_left",
    rows: 263,
    cols: 280,
    png: "/assets/annot/hip_left.png",
    scale: 3,
    items: [
      {
        name: "greater_trochanter_apex",
        reviewed: true,
        title: "Большой вертел",
        allowed_box: [105,36.2,255,183.7],
        prefill: {"x":175,"y":85,"present":true,"confidence":1},
      },
      {
        name: "femoral_neck",
        reviewed: true,
        title: "Шейка бедра",
        allowed_box: [57.5,43.7,210,178.7],
        prefill: {"x":120,"y":95,"present":true,"confidence":1},
      },
      {
        name: "ischium",
        reviewed: true,
        title: "Седалищная кость",
        allowed_box: [0,61.2,140,233.7],
        prefill: {"x":42.5,"y":137.5,"present":true,"confidence":0.98},
      },
    ],
  },
  {
    key: "hip_right",
    task: "hip_keypoints",
    file: "CR000004.dcm",
    region: "hip_right",
    rows: 235,
    cols: 280,
    png: "/assets/annot/hip_right.png",
    scale: 3,
    items: [
      {
        name: "greater_trochanter_apex",
        reviewed: true,
        title: "Большой вертел",
        allowed_box: [24,22.5,174,170],
        prefill: {"x":85.2,"y":78.8,"present":true,"confidence":1},
      },
      {
        name: "femoral_neck",
        reviewed: false,
        title: "Шейка бедра",
        allowed_box: [69,30,221.5,165],
        prefill: {"x":140.2,"y":90,"present":true,"confidence":1},
      },
      {
        name: "ischium",
        reviewed: false,
        title: "Седалищная кость",
        allowed_box: [139,47.5,279,220],
        prefill: {"x":219,"y":133.8,"present":true,"confidence":1},
      },
    ],
  },
  {
    key: "spine_ok",
    task: "pelvis_crest",
    file: "CR000000.dcm",
    region: "spine",
    rows: 289,
    cols: 300,
    png: "/assets/annot/spine_ok.png",
    scale: 3,
    items: [
      {
        name: "crest_left",
        reviewed: true,
        title: "Гребень слева",
        allowed_box: [0,155.4,123.2,288],
        prefill: {"x":34.8,"y":245.1,"present":true,"confidence":1},
      },
      {
        name: "crest_right",
        reviewed: true,
        title: "Гребень справа",
        allowed_box: [176.8,155.4,299,288],
        prefill: {"x":287.9,"y":239.7,"present":true,"confidence":1},
      },
    ],
  },
  {
    key: "spine_bad",
    task: "pelvis_crest",
    file: "CR000000.dcm",
    region: "spine",
    rows: 263,
    cols: 300,
    png: "/assets/annot/spine_bad.png",
    scale: 3,
    items: [
      {
        name: "crest_left",
        reviewed: true,
        title: "Гребень слева",
        allowed_box: [0,142,123.2,262],
        prefill: {"x":80.4,"y":258.5,"present":false,"confidence":0.05},
      },
      {
        name: "crest_right",
        reviewed: true,
        title: "Гребень справа",
        allowed_box: [176.8,142,299,262],
        prefill: {"x":286.6,"y":246.4,"present":false,"confidence":0.95},
      },
    ],
  },
  {
    key: "spine_foreign",
    task: "foreign_seg",
    file: "CR000008.dcm",
    region: "spine",
    rows: 287,
    cols: 300,
    png: "/assets/annot/spine_foreign.png",
    scale: 3,
    verdict: "ПРЕДМЕТ",
    polygons: [
      { cls: "wire", points: [[226,0],[228,5],[231,7],[237,8],[250,14],[262,17],[276,17],[277,15],[275,12],[270,10],[256,9],[246,6],[237,0]] },
      { cls: "wire", points: [[120,0],[112,0],[103,6],[72,14],[56,16],[38,16],[19,11],[13,11],[12,16],[38,23],[66,22],[103,13],[112,8],[117,7],[119,5]] },
      { cls: "object", points: [[181,0],[181,16],[184,44],[187,49],[195,50],[198,47],[201,35],[203,5],[201,0]] },
    ],
  },
]
