/* Real model output on real DICOMs, exported by
   dicom-analyzer/examples/annotation/export_for_ui.py.
   All coordinates are original-frame pixels, as the contract requires. */
window.ANNOT = [
  {
    "key": "hip_left",
    "task": "hip_keypoints",
    "file": "CR000002.dcm",
    "region": "hip_left",
    "rows": 263,
    "cols": 280,
    "png": "assets/annot/hip_left.png",
    "scale": 3,
    "threshold": 0.3,
    "items": [
      {
        "name": "greater_trochanter_apex",
        "title": "Большой вертел",
        "allowed_box": [
          105.0,
          36.2,
          255.0,
          183.7
        ],
        "prefill": {
          "x": 175.0,
          "y": 85.0,
          "present": true,
          "confidence": 1.0
        }
      },
      {
        "name": "femoral_neck",
        "title": "Шейка бедра",
        "allowed_box": [
          57.5,
          43.7,
          210.0,
          178.7
        ],
        "prefill": {
          "x": 120.0,
          "y": 95.0,
          "present": true,
          "confidence": 1.0
        }
      },
      {
        "name": "ischium",
        "title": "Седалищная кость",
        "allowed_box": [
          0,
          61.2,
          140.0,
          233.7
        ],
        "prefill": {
          "x": 42.5,
          "y": 137.5,
          "present": true,
          "confidence": 0.98
        }
      }
    ]
  },
  {
    "key": "hip_right",
    "task": "hip_keypoints",
    "file": "CR000004.dcm",
    "region": "hip_right",
    "rows": 235,
    "cols": 280,
    "png": "assets/annot/hip_right.png",
    "scale": 3,
    "threshold": 0.3,
    "items": [
      {
        "name": "greater_trochanter_apex",
        "title": "Большой вертел",
        "allowed_box": [
          24.0,
          22.5,
          174.0,
          170.0
        ],
        "prefill": {
          "x": 85.2,
          "y": 78.8,
          "present": true,
          "confidence": 1.0
        }
      },
      {
        "name": "femoral_neck",
        "title": "Шейка бедра",
        "allowed_box": [
          69.0,
          30.0,
          221.5,
          165.0
        ],
        "prefill": {
          "x": 140.2,
          "y": 90.0,
          "present": true,
          "confidence": 1.0
        }
      },
      {
        "name": "ischium",
        "title": "Седалищная кость",
        "allowed_box": [
          139.0,
          47.5,
          279,
          220.0
        ],
        "prefill": {
          "x": 219.0,
          "y": 133.8,
          "present": true,
          "confidence": 1.0
        }
      }
    ]
  },
  {
    "key": "spine_ok",
    "task": "pelvis_crest",
    "file": "CR000000.dcm",
    "region": "spine",
    "rows": 289,
    "cols": 300,
    "png": "assets/annot/spine_ok.png",
    "scale": 3,
    "placement": "0.0",
    "threshold": 0.97,
    "presence_threshold": 0.7,
    "items": [
      {
        "name": "crest_left",
        "title": "Гребень слева",
        "allowed_box": [
          0,
          155.4,
          123.2,
          288
        ],
        "prefill": {
          "x": 34.8,
          "y": 245.1,
          "present": true,
          "confidence": 1.0
        }
      },
      {
        "name": "crest_right",
        "title": "Гребень справа",
        "allowed_box": [
          176.8,
          155.4,
          299,
          288
        ],
        "prefill": {
          "x": 287.9,
          "y": 239.7,
          "present": true,
          "confidence": 1.0
        }
      }
    ],
    "windows": {
      "left": {
        "box": [
          0,
          192,
          107,
          288
        ],
        "p": 1.0,
        "visible": true
      },
      "right": {
        "box": [
          192,
          192,
          299,
          288
        ],
        "p": 1.0,
        "visible": true
      }
    }
  },
  {
    "key": "spine_bad",
    "task": "pelvis_crest",
    "file": "CR000000.dcm",
    "region": "spine",
    "rows": 263,
    "cols": 300,
    "png": "assets/annot/spine_bad.png",
    "scale": 3,
    "placement": "1.0",
    "threshold": 0.97,
    "presence_threshold": 0.7,
    "items": [
      {
        "name": "crest_left",
        "title": "Гребень слева",
        "allowed_box": [
          0,
          142.0,
          123.2,
          262
        ],
        "prefill": {
          "x": 80.4,
          "y": 258.5,
          "present": false,
          "confidence": 0.05
        }
      },
      {
        "name": "crest_right",
        "title": "Гребень справа",
        "allowed_box": [
          176.8,
          142.0,
          299,
          262
        ],
        "prefill": {
          "x": 286.6,
          "y": 246.4,
          "present": false,
          "confidence": 0.95
        }
      }
    ],
    "windows": {
      "left": {
        "box": [
          0,
          175,
          107,
          262
        ],
        "p": 0.0,
        "visible": false
      },
      "right": {
        "box": [
          192,
          175,
          299,
          262
        ],
        "p": 0.0,
        "visible": false
      }
    }
  },
  {
    "key": "spine_foreign",
    "task": "foreign_seg",
    "file": "CR000008.dcm",
    "region": "spine",
    "rows": 287,
    "cols": 300,
    "png": "assets/annot/spine_foreign.png",
    "scale": 3,
    "top_h": 115,
    "verdict": "ПРЕДМЕТ",
    "wire_px": 1488,
    "object_px": 1148,
    "polygons": [
      {
        "cls": "wire",
        "points": [
          [
            226.0,
            0.0
          ],
          [
            228.0,
            5.0
          ],
          [
            231.0,
            7.0
          ],
          [
            237.0,
            8.0
          ],
          [
            250.0,
            14.0
          ],
          [
            262.0,
            17.0
          ],
          [
            276.0,
            17.0
          ],
          [
            277.0,
            15.0
          ],
          [
            275.0,
            12.0
          ],
          [
            270.0,
            10.0
          ],
          [
            256.0,
            9.0
          ],
          [
            246.0,
            6.0
          ],
          [
            237.0,
            0.0
          ]
        ]
      },
      {
        "cls": "wire",
        "points": [
          [
            120.0,
            0.0
          ],
          [
            112.0,
            0.0
          ],
          [
            103.0,
            6.0
          ],
          [
            72.0,
            14.0
          ],
          [
            56.0,
            16.0
          ],
          [
            38.0,
            16.0
          ],
          [
            19.0,
            11.0
          ],
          [
            13.0,
            11.0
          ],
          [
            12.0,
            16.0
          ],
          [
            38.0,
            23.0
          ],
          [
            66.0,
            22.0
          ],
          [
            103.0,
            13.0
          ],
          [
            112.0,
            8.0
          ],
          [
            117.0,
            7.0
          ],
          [
            119.0,
            5.0
          ]
        ]
      },
      {
        "cls": "object",
        "points": [
          [
            181.0,
            0.0
          ],
          [
            181.0,
            16.0
          ],
          [
            184.0,
            44.0
          ],
          [
            187.0,
            49.0
          ],
          [
            195.0,
            50.0
          ],
          [
            198.0,
            47.0
          ],
          [
            201.0,
            35.0
          ],
          [
            203.0,
            5.0
          ],
          [
            201.0,
            0.0
          ]
        ]
      }
    ]
  }
];
