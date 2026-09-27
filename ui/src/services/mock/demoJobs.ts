/* Demo data, assembled from real qc_prototype/examples results: the overlay
 * geometry is genuine and matches the scans in public/assets.
 * Used only in mock mode (VITE_USE_MOCKS=true). */
import type { IJobInfo } from '@/types'

export const DEMO_JOBS: IJobInfo[] = [
  {
    "id": "7c1f4a20",
    "dicom_id": "d41f8a63",
    "study_id": "1.2.643.5.1.13.2026.0912",
    "patient_ref": "P-10428",
    "created_at": "2026-09-27T09:12:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [],
          "details": {
            "verdict": "чисто"
          },
          "note": ""
        }
      },
      "verdict": 1,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0912",
      "patient_ref": "P-10428",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "1e5b8c47",
    "dicom_id": "f03d2a71",
    "study_id": "1.2.643.5.1.13.2026.0912",
    "patient_ref": "P-10428",
    "created_at": "2026-09-27T09:12:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 1,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              73.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 7.665000000000001,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {
            "greater_trochanter_apex": [
              209.15624246910545,
              96.13392857142857
            ],
            "femoral_neck": [
              155.89285152976805,
              113.02232142857142
            ],
            "ischium": [
              77.94642576488403,
              157.19196428571428
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": ""
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 1,
          "source": "math",
          "value": 2.64,
          "unit": "mm",
          "points": {},
          "regions": [
            [
              [
                139.0,
                162.0
              ],
              [
                138.0,
                163.0
              ],
              [
                138.0,
                165.0
              ],
              [
                136.0,
                167.0
              ],
              [
                136.0,
                168.0
              ],
              [
                134.0,
                170.0
              ],
              [
                134.0,
                172.0
              ],
              [
                133.0,
                173.0
              ],
              [
                133.0,
                185.0
              ],
              [
                134.0,
                186.0
              ],
              [
                134.0,
                187.0
              ],
              [
                135.0,
                188.0
              ],
              [
                135.0,
                189.0
              ],
              [
                147.0,
                201.0
              ],
              [
                147.0,
                202.0
              ],
              [
                148.0,
                203.0
              ],
              [
                154.0,
                203.0
              ],
              [
                154.0,
                200.0
              ],
              [
                153.0,
                199.0
              ],
              [
                153.0,
                192.0
              ],
              [
                152.0,
                191.0
              ],
              [
                152.0,
                185.0
              ],
              [
                151.0,
                184.0
              ],
              [
                151.0,
                180.0
              ],
              [
                150.0,
                179.0
              ],
              [
                150.0,
                177.0
              ],
              [
                149.0,
                176.0
              ],
              [
                149.0,
                174.0
              ],
              [
                148.0,
                173.0
              ],
              [
                148.0,
                172.0
              ],
              [
                147.0,
                171.0
              ],
              [
                147.0,
                170.0
              ],
              [
                145.0,
                168.0
              ],
              [
                145.0,
                167.0
              ],
              [
                143.0,
                165.0
              ],
              [
                143.0,
                164.0
              ],
              [
                142.0,
                163.0
              ],
              [
                143.0,
                162.0
              ]
            ]
          ],
          "details": {
            "status": "норма",
            "implant": false
          },
          "note": ""
        }
      },
      "verdict": 1,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0912",
      "patient_ref": "P-10428",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "8b2e9d55",
    "dicom_id": "a7c3e011",
    "study_id": "1.2.643.5.1.13.2026.0931",
    "patient_ref": "P-10429",
    "created_at": "2026-09-27T09:31:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [
      "Посторонние предметы или артефакты"
    ],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 0,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [
            [
              [
                166,
                0
              ],
              [
                165,
                1
              ],
              [
                165,
                7
              ],
              [
                167,
                9
              ],
              [
                167,
                10
              ],
              [
                171,
                14
              ],
              [
                172,
                14
              ],
              [
                174,
                16
              ],
              [
                175,
                16
              ],
              [
                176,
                17
              ],
              [
                177,
                17
              ],
              [
                178,
                18
              ],
              [
                179,
                18
              ],
              [
                180,
                19
              ],
              [
                180,
                20
              ],
              [
                181,
                20
              ],
              [
                182,
                21
              ],
              [
                183,
                21
              ],
              [
                184,
                22
              ],
              [
                185,
                22
              ],
              [
                186,
                23
              ],
              [
                187,
                23
              ],
              [
                188,
                24
              ],
              [
                189,
                24
              ],
              [
                191,
                26
              ],
              [
                192,
                26
              ],
              [
                199,
                33
              ],
              [
                199,
                34
              ],
              [
                198,
                35
              ],
              [
                198,
                37
              ],
              [
                199,
                38
              ],
              [
                201,
                38
              ],
              [
                203,
                40
              ],
              [
                204,
                40
              ],
              [
                205,
                41
              ],
              [
                206,
                41
              ],
              [
                208,
                43
              ],
              [
                209,
                43
              ],
              [
                210,
                44
              ],
              [
                211,
                44
              ],
              [
                212,
                45
              ],
              [
                213,
                45
              ],
              [
                214,
                46
              ],
              [
                216,
                46
              ],
              [
                217,
                47
              ],
              [
                219,
                47
              ],
              [
                220,
                48
              ],
              [
                222,
                48
              ],
              [
                223,
                49
              ],
              [
                224,
                49
              ],
              [
                225,
                50
              ],
              [
                226,
                50
              ],
              [
                227,
                51
              ],
              [
                229,
                51
              ],
              [
                230,
                52
              ],
              [
                233,
                52
              ],
              [
                234,
                53
              ],
              [
                235,
                53
              ],
              [
                236,
                54
              ],
              [
                238,
                54
              ],
              [
                239,
                55
              ],
              [
                240,
                55
              ],
              [
                242,
                57
              ],
              [
                240,
                59
              ],
              [
                240,
                62
              ],
              [
                241,
                62
              ],
              [
                242,
                63
              ],
              [
                244,
                63
              ],
              [
                245,
                64
              ],
              [
                249,
                64
              ],
              [
                250,
                65
              ],
              [
                259,
                65
              ],
              [
                260,
                66
              ],
              [
                269,
                66
              ],
              [
                270,
                67
              ],
              [
                282,
                67
              ],
              [
                283,
                68
              ],
              [
                284,
                68
              ],
              [
                285,
                67
              ],
              [
                286,
                67
              ],
              [
                288,
                65
              ],
              [
                288,
                61
              ],
              [
                289,
                60
              ],
              [
                289,
                55
              ],
              [
                286,
                52
              ],
              [
                279,
                52
              ],
              [
                278,
                51
              ],
              [
                268,
                51
              ],
              [
                267,
                50
              ],
              [
                264,
                50
              ],
              [
                263,
                49
              ],
              [
                255,
                49
              ],
              [
                254,
                48
              ],
              [
                252,
                48
              ],
              [
                251,
                47
              ],
              [
                246,
                47
              ],
              [
                245,
                46
              ],
              [
                242,
                46
              ],
              [
                241,
                45
              ],
              [
                240,
                45
              ],
              [
                239,
                44
              ],
              [
                239,
                43
              ],
              [
                236,
                40
              ],
              [
                236,
                39
              ],
              [
                234,
                37
              ],
              [
                234,
                36
              ],
              [
                233,
                35
              ],
              [
                231,
                35
              ],
              [
                230,
                34
              ],
              [
                227,
                34
              ],
              [
                226,
                33
              ],
              [
                225,
                33
              ],
              [
                224,
                32
              ],
              [
                223,
                32
              ],
              [
                222,
                31
              ],
              [
                221,
                31
              ],
              [
                220,
                30
              ],
              [
                218,
                30
              ],
              [
                217,
                29
              ],
              [
                215,
                29
              ],
              [
                214,
                28
              ],
              [
                212,
                28
              ],
              [
                211,
                27
              ],
              [
                210,
                27
              ],
              [
                209,
                26
              ],
              [
                208,
                26
              ],
              [
                207,
                25
              ],
              [
                206,
                25
              ],
              [
                204,
                23
              ],
              [
                203,
                23
              ],
              [
                202,
                22
              ],
              [
                201,
                22
              ],
              [
                200,
                21
              ],
              [
                199,
                21
              ],
              [
                198,
                20
              ],
              [
                197,
                20
              ],
              [
                194,
                17
              ],
              [
                193,
                17
              ],
              [
                192,
                16
              ],
              [
                191,
                16
              ],
              [
                189,
                14
              ],
              [
                188,
                14
              ],
              [
                187,
                13
              ],
              [
                186,
                13
              ],
              [
                184,
                11
              ],
              [
                183,
                11
              ],
              [
                181,
                9
              ],
              [
                180,
                9
              ],
              [
                177,
                6
              ],
              [
                176,
                6
              ],
              [
                173,
                3
              ],
              [
                172,
                3
              ],
              [
                170,
                1
              ],
              [
                168,
                1
              ],
              [
                167,
                0
              ]
            ],
            [
              [
                111,
                0
              ],
              [
                110,
                1
              ],
              [
                110,
                2
              ],
              [
                108,
                4
              ],
              [
                107,
                4
              ],
              [
                104,
                7
              ],
              [
                103,
                7
              ],
              [
                101,
                9
              ],
              [
                100,
                9
              ],
              [
                97,
                12
              ],
              [
                96,
                12
              ],
              [
                95,
                13
              ],
              [
                94,
                13
              ],
              [
                92,
                15
              ],
              [
                91,
                15
              ],
              [
                89,
                17
              ],
              [
                88,
                17
              ],
              [
                87,
                18
              ],
              [
                86,
                18
              ],
              [
                85,
                19
              ],
              [
                84,
                19
              ],
              [
                83,
                20
              ],
              [
                82,
                20
              ],
              [
                81,
                21
              ],
              [
                80,
                21
              ],
              [
                79,
                22
              ],
              [
                78,
                22
              ],
              [
                77,
                23
              ],
              [
                76,
                23
              ],
              [
                75,
                24
              ],
              [
                74,
                24
              ],
              [
                73,
                25
              ],
              [
                65,
                25
              ],
              [
                64,
                26
              ],
              [
                64,
                27
              ],
              [
                60,
                31
              ],
              [
                59,
                31
              ],
              [
                58,
                32
              ],
              [
                56,
                32
              ],
              [
                55,
                33
              ],
              [
                53,
                33
              ],
              [
                52,
                34
              ],
              [
                50,
                34
              ],
              [
                48,
                36
              ],
              [
                48,
                37
              ],
              [
                47,
                38
              ],
              [
                47,
                40
              ],
              [
                46,
                41
              ],
              [
                46,
                43
              ],
              [
                47,
                44
              ],
              [
                52,
                44
              ],
              [
                53,
                43
              ],
              [
                54,
                43
              ],
              [
                55,
                42
              ],
              [
                58,
                42
              ],
              [
                59,
                41
              ],
              [
                64,
                41
              ],
              [
                65,
                42
              ],
              [
                63,
                44
              ],
              [
                62,
                44
              ],
              [
                61,
                45
              ],
              [
                60,
                45
              ],
              [
                58,
                47
              ],
              [
                57,
                47
              ],
              [
                56,
                48
              ],
              [
                53,
                48
              ],
              [
                52,
                49
              ],
              [
                47,
                49
              ],
              [
                46,
                50
              ],
              [
                45,
                50
              ],
              [
                44,
                51
              ],
              [
                43,
                51
              ],
              [
                42,
                52
              ],
              [
                39,
                52
              ],
              [
                38,
                53
              ],
              [
                34,
                53
              ],
              [
                33,
                54
              ],
              [
                31,
                54
              ],
              [
                30,
                55
              ],
              [
                29,
                55
              ],
              [
                28,
                56
              ],
              [
                27,
                56
              ],
              [
                26,
                57
              ],
              [
                26,
                58
              ],
              [
                25,
                59
              ],
              [
                25,
                62
              ],
              [
                26,
                63
              ],
              [
                26,
                66
              ],
              [
                27,
                67
              ],
              [
                27,
                69
              ],
              [
                31,
                69
              ],
              [
                32,
                68
              ],
              [
                38,
                68
              ],
              [
                39,
                67
              ],
              [
                42,
                67
              ],
              [
                43,
                66
              ],
              [
                44,
                66
              ],
              [
                47,
                63
              ],
              [
                48,
                63
              ],
              [
                49,
                62
              ],
              [
                50,
                62
              ],
              [
                51,
                61
              ],
              [
                52,
                61
              ],
              [
                54,
                59
              ],
              [
                55,
                59
              ],
              [
                56,
                58
              ],
              [
                57,
                58
              ],
              [
                58,
                57
              ],
              [
                59,
                57
              ],
              [
                61,
                55
              ],
              [
                62,
                55
              ],
              [
                63,
                54
              ],
              [
                64,
                54
              ],
              [
                65,
                53
              ],
              [
                66,
                53
              ],
              [
                67,
                52
              ],
              [
                68,
                52
              ],
              [
                69,
                51
              ],
              [
                70,
                51
              ],
              [
                71,
                50
              ],
              [
                72,
                50
              ],
              [
                73,
                49
              ],
              [
                74,
                49
              ],
              [
                75,
                48
              ],
              [
                76,
                48
              ],
              [
                77,
                47
              ],
              [
                78,
                47
              ],
              [
                79,
                46
              ],
              [
                80,
                46
              ],
              [
                81,
                45
              ],
              [
                82,
                45
              ],
              [
                83,
                44
              ],
              [
                84,
                44
              ],
              [
                86,
                42
              ],
              [
                87,
                42
              ],
              [
                90,
                39
              ],
              [
                91,
                39
              ],
              [
                92,
                38
              ],
              [
                93,
                38
              ],
              [
                94,
                37
              ],
              [
                95,
                37
              ],
              [
                96,
                36
              ],
              [
                97,
                36
              ],
              [
                99,
                34
              ],
              [
                100,
                34
              ],
              [
                102,
                32
              ],
              [
                102,
                31
              ],
              [
                103,
                30
              ],
              [
                102,
                29
              ],
              [
                91,
                29
              ],
              [
                90,
                28
              ],
              [
                90,
                27
              ],
              [
                91,
                26
              ],
              [
                92,
                26
              ],
              [
                95,
                23
              ],
              [
                96,
                23
              ],
              [
                98,
                21
              ],
              [
                99,
                21
              ],
              [
                102,
                18
              ],
              [
                103,
                18
              ],
              [
                106,
                15
              ],
              [
                107,
                15
              ],
              [
                108,
                14
              ],
              [
                109,
                14
              ],
              [
                110,
                13
              ],
              [
                111,
                13
              ],
              [
                114,
                10
              ],
              [
                115,
                10
              ],
              [
                119,
                6
              ],
              [
                119,
                5
              ],
              [
                121,
                3
              ],
              [
                121,
                2
              ],
              [
                122,
                1
              ],
              [
                122,
                0
              ]
            ]
          ],
          "details": {
            "verdict": "ПРЕДМЕТ"
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0931",
      "patient_ref": "P-10429",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "4c9d2e63",
    "dicom_id": "1b7e9f04",
    "study_id": "1.2.643.5.1.13.2026.0931",
    "patient_ref": "P-10429",
    "created_at": "2026-09-27T09:31:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [
      "Неправильная ротация бедра (малый вертел)"
    ],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 1,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              73.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 7.665000000000001,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {
            "greater_trochanter_apex": [
              209.15624246910545,
              96.13392857142857
            ],
            "femoral_neck": [
              155.89285152976805,
              113.02232142857142
            ],
            "ischium": [
              77.94642576488403,
              157.19196428571428
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": ""
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 0,
          "source": "math",
          "value": 8.5479298771043,
          "unit": "mm",
          "points": {},
          "regions": [
            [
              [
                139.0,
                162.0
              ],
              [
                138.0,
                163.0
              ],
              [
                138.0,
                165.0
              ],
              [
                136.0,
                167.0
              ],
              [
                136.0,
                168.0
              ],
              [
                134.0,
                170.0
              ],
              [
                134.0,
                172.0
              ],
              [
                133.0,
                173.0
              ],
              [
                133.0,
                185.0
              ],
              [
                134.0,
                186.0
              ],
              [
                134.0,
                187.0
              ],
              [
                135.0,
                188.0
              ],
              [
                135.0,
                189.0
              ],
              [
                147.0,
                201.0
              ],
              [
                147.0,
                202.0
              ],
              [
                148.0,
                203.0
              ],
              [
                154.0,
                203.0
              ],
              [
                154.0,
                200.0
              ],
              [
                153.0,
                199.0
              ],
              [
                153.0,
                192.0
              ],
              [
                152.0,
                191.0
              ],
              [
                152.0,
                185.0
              ],
              [
                151.0,
                184.0
              ],
              [
                151.0,
                180.0
              ],
              [
                150.0,
                179.0
              ],
              [
                150.0,
                177.0
              ],
              [
                149.0,
                176.0
              ],
              [
                149.0,
                174.0
              ],
              [
                148.0,
                173.0
              ],
              [
                148.0,
                172.0
              ],
              [
                147.0,
                171.0
              ],
              [
                147.0,
                170.0
              ],
              [
                145.0,
                168.0
              ],
              [
                145.0,
                167.0
              ],
              [
                143.0,
                165.0
              ],
              [
                143.0,
                164.0
              ],
              [
                142.0,
                163.0
              ],
              [
                143.0,
                162.0
              ]
            ]
          ],
          "details": {
            "status": "плохой",
            "implant": false
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0931",
      "patient_ref": "P-10429",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "2f7a1c08",
    "dicom_id": "b902f4de",
    "study_id": "1.2.643.5.1.13.2026.0948",
    "patient_ref": "P-10431",
    "created_at": "2026-09-27T09:48:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [
      "Посторонние предметы или артефакты"
    ],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 0,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [
            [
              [
                166,
                0
              ],
              [
                165,
                1
              ],
              [
                165,
                7
              ],
              [
                167,
                9
              ],
              [
                167,
                10
              ],
              [
                171,
                14
              ],
              [
                172,
                14
              ],
              [
                174,
                16
              ],
              [
                175,
                16
              ],
              [
                176,
                17
              ],
              [
                177,
                17
              ],
              [
                178,
                18
              ],
              [
                179,
                18
              ],
              [
                180,
                19
              ],
              [
                180,
                20
              ],
              [
                181,
                20
              ],
              [
                182,
                21
              ],
              [
                183,
                21
              ],
              [
                184,
                22
              ],
              [
                185,
                22
              ],
              [
                186,
                23
              ],
              [
                187,
                23
              ],
              [
                188,
                24
              ],
              [
                189,
                24
              ],
              [
                191,
                26
              ],
              [
                192,
                26
              ],
              [
                199,
                33
              ],
              [
                199,
                34
              ],
              [
                198,
                35
              ],
              [
                198,
                37
              ],
              [
                199,
                38
              ],
              [
                201,
                38
              ],
              [
                203,
                40
              ],
              [
                204,
                40
              ],
              [
                205,
                41
              ],
              [
                206,
                41
              ],
              [
                208,
                43
              ],
              [
                209,
                43
              ],
              [
                210,
                44
              ],
              [
                211,
                44
              ],
              [
                212,
                45
              ],
              [
                213,
                45
              ],
              [
                214,
                46
              ],
              [
                216,
                46
              ],
              [
                217,
                47
              ],
              [
                219,
                47
              ],
              [
                220,
                48
              ],
              [
                222,
                48
              ],
              [
                223,
                49
              ],
              [
                224,
                49
              ],
              [
                225,
                50
              ],
              [
                226,
                50
              ],
              [
                227,
                51
              ],
              [
                229,
                51
              ],
              [
                230,
                52
              ],
              [
                233,
                52
              ],
              [
                234,
                53
              ],
              [
                235,
                53
              ],
              [
                236,
                54
              ],
              [
                238,
                54
              ],
              [
                239,
                55
              ],
              [
                240,
                55
              ],
              [
                242,
                57
              ],
              [
                240,
                59
              ],
              [
                240,
                62
              ],
              [
                241,
                62
              ],
              [
                242,
                63
              ],
              [
                244,
                63
              ],
              [
                245,
                64
              ],
              [
                249,
                64
              ],
              [
                250,
                65
              ],
              [
                259,
                65
              ],
              [
                260,
                66
              ],
              [
                269,
                66
              ],
              [
                270,
                67
              ],
              [
                282,
                67
              ],
              [
                283,
                68
              ],
              [
                284,
                68
              ],
              [
                285,
                67
              ],
              [
                286,
                67
              ],
              [
                288,
                65
              ],
              [
                288,
                61
              ],
              [
                289,
                60
              ],
              [
                289,
                55
              ],
              [
                286,
                52
              ],
              [
                279,
                52
              ],
              [
                278,
                51
              ],
              [
                268,
                51
              ],
              [
                267,
                50
              ],
              [
                264,
                50
              ],
              [
                263,
                49
              ],
              [
                255,
                49
              ],
              [
                254,
                48
              ],
              [
                252,
                48
              ],
              [
                251,
                47
              ],
              [
                246,
                47
              ],
              [
                245,
                46
              ],
              [
                242,
                46
              ],
              [
                241,
                45
              ],
              [
                240,
                45
              ],
              [
                239,
                44
              ],
              [
                239,
                43
              ],
              [
                236,
                40
              ],
              [
                236,
                39
              ],
              [
                234,
                37
              ],
              [
                234,
                36
              ],
              [
                233,
                35
              ],
              [
                231,
                35
              ],
              [
                230,
                34
              ],
              [
                227,
                34
              ],
              [
                226,
                33
              ],
              [
                225,
                33
              ],
              [
                224,
                32
              ],
              [
                223,
                32
              ],
              [
                222,
                31
              ],
              [
                221,
                31
              ],
              [
                220,
                30
              ],
              [
                218,
                30
              ],
              [
                217,
                29
              ],
              [
                215,
                29
              ],
              [
                214,
                28
              ],
              [
                212,
                28
              ],
              [
                211,
                27
              ],
              [
                210,
                27
              ],
              [
                209,
                26
              ],
              [
                208,
                26
              ],
              [
                207,
                25
              ],
              [
                206,
                25
              ],
              [
                204,
                23
              ],
              [
                203,
                23
              ],
              [
                202,
                22
              ],
              [
                201,
                22
              ],
              [
                200,
                21
              ],
              [
                199,
                21
              ],
              [
                198,
                20
              ],
              [
                197,
                20
              ],
              [
                194,
                17
              ],
              [
                193,
                17
              ],
              [
                192,
                16
              ],
              [
                191,
                16
              ],
              [
                189,
                14
              ],
              [
                188,
                14
              ],
              [
                187,
                13
              ],
              [
                186,
                13
              ],
              [
                184,
                11
              ],
              [
                183,
                11
              ],
              [
                181,
                9
              ],
              [
                180,
                9
              ],
              [
                177,
                6
              ],
              [
                176,
                6
              ],
              [
                173,
                3
              ],
              [
                172,
                3
              ],
              [
                170,
                1
              ],
              [
                168,
                1
              ],
              [
                167,
                0
              ]
            ],
            [
              [
                111,
                0
              ],
              [
                110,
                1
              ],
              [
                110,
                2
              ],
              [
                108,
                4
              ],
              [
                107,
                4
              ],
              [
                104,
                7
              ],
              [
                103,
                7
              ],
              [
                101,
                9
              ],
              [
                100,
                9
              ],
              [
                97,
                12
              ],
              [
                96,
                12
              ],
              [
                95,
                13
              ],
              [
                94,
                13
              ],
              [
                92,
                15
              ],
              [
                91,
                15
              ],
              [
                89,
                17
              ],
              [
                88,
                17
              ],
              [
                87,
                18
              ],
              [
                86,
                18
              ],
              [
                85,
                19
              ],
              [
                84,
                19
              ],
              [
                83,
                20
              ],
              [
                82,
                20
              ],
              [
                81,
                21
              ],
              [
                80,
                21
              ],
              [
                79,
                22
              ],
              [
                78,
                22
              ],
              [
                77,
                23
              ],
              [
                76,
                23
              ],
              [
                75,
                24
              ],
              [
                74,
                24
              ],
              [
                73,
                25
              ],
              [
                65,
                25
              ],
              [
                64,
                26
              ],
              [
                64,
                27
              ],
              [
                60,
                31
              ],
              [
                59,
                31
              ],
              [
                58,
                32
              ],
              [
                56,
                32
              ],
              [
                55,
                33
              ],
              [
                53,
                33
              ],
              [
                52,
                34
              ],
              [
                50,
                34
              ],
              [
                48,
                36
              ],
              [
                48,
                37
              ],
              [
                47,
                38
              ],
              [
                47,
                40
              ],
              [
                46,
                41
              ],
              [
                46,
                43
              ],
              [
                47,
                44
              ],
              [
                52,
                44
              ],
              [
                53,
                43
              ],
              [
                54,
                43
              ],
              [
                55,
                42
              ],
              [
                58,
                42
              ],
              [
                59,
                41
              ],
              [
                64,
                41
              ],
              [
                65,
                42
              ],
              [
                63,
                44
              ],
              [
                62,
                44
              ],
              [
                61,
                45
              ],
              [
                60,
                45
              ],
              [
                58,
                47
              ],
              [
                57,
                47
              ],
              [
                56,
                48
              ],
              [
                53,
                48
              ],
              [
                52,
                49
              ],
              [
                47,
                49
              ],
              [
                46,
                50
              ],
              [
                45,
                50
              ],
              [
                44,
                51
              ],
              [
                43,
                51
              ],
              [
                42,
                52
              ],
              [
                39,
                52
              ],
              [
                38,
                53
              ],
              [
                34,
                53
              ],
              [
                33,
                54
              ],
              [
                31,
                54
              ],
              [
                30,
                55
              ],
              [
                29,
                55
              ],
              [
                28,
                56
              ],
              [
                27,
                56
              ],
              [
                26,
                57
              ],
              [
                26,
                58
              ],
              [
                25,
                59
              ],
              [
                25,
                62
              ],
              [
                26,
                63
              ],
              [
                26,
                66
              ],
              [
                27,
                67
              ],
              [
                27,
                69
              ],
              [
                31,
                69
              ],
              [
                32,
                68
              ],
              [
                38,
                68
              ],
              [
                39,
                67
              ],
              [
                42,
                67
              ],
              [
                43,
                66
              ],
              [
                44,
                66
              ],
              [
                47,
                63
              ],
              [
                48,
                63
              ],
              [
                49,
                62
              ],
              [
                50,
                62
              ],
              [
                51,
                61
              ],
              [
                52,
                61
              ],
              [
                54,
                59
              ],
              [
                55,
                59
              ],
              [
                56,
                58
              ],
              [
                57,
                58
              ],
              [
                58,
                57
              ],
              [
                59,
                57
              ],
              [
                61,
                55
              ],
              [
                62,
                55
              ],
              [
                63,
                54
              ],
              [
                64,
                54
              ],
              [
                65,
                53
              ],
              [
                66,
                53
              ],
              [
                67,
                52
              ],
              [
                68,
                52
              ],
              [
                69,
                51
              ],
              [
                70,
                51
              ],
              [
                71,
                50
              ],
              [
                72,
                50
              ],
              [
                73,
                49
              ],
              [
                74,
                49
              ],
              [
                75,
                48
              ],
              [
                76,
                48
              ],
              [
                77,
                47
              ],
              [
                78,
                47
              ],
              [
                79,
                46
              ],
              [
                80,
                46
              ],
              [
                81,
                45
              ],
              [
                82,
                45
              ],
              [
                83,
                44
              ],
              [
                84,
                44
              ],
              [
                86,
                42
              ],
              [
                87,
                42
              ],
              [
                90,
                39
              ],
              [
                91,
                39
              ],
              [
                92,
                38
              ],
              [
                93,
                38
              ],
              [
                94,
                37
              ],
              [
                95,
                37
              ],
              [
                96,
                36
              ],
              [
                97,
                36
              ],
              [
                99,
                34
              ],
              [
                100,
                34
              ],
              [
                102,
                32
              ],
              [
                102,
                31
              ],
              [
                103,
                30
              ],
              [
                102,
                29
              ],
              [
                91,
                29
              ],
              [
                90,
                28
              ],
              [
                90,
                27
              ],
              [
                91,
                26
              ],
              [
                92,
                26
              ],
              [
                95,
                23
              ],
              [
                96,
                23
              ],
              [
                98,
                21
              ],
              [
                99,
                21
              ],
              [
                102,
                18
              ],
              [
                103,
                18
              ],
              [
                106,
                15
              ],
              [
                107,
                15
              ],
              [
                108,
                14
              ],
              [
                109,
                14
              ],
              [
                110,
                13
              ],
              [
                111,
                13
              ],
              [
                114,
                10
              ],
              [
                115,
                10
              ],
              [
                119,
                6
              ],
              [
                119,
                5
              ],
              [
                121,
                3
              ],
              [
                121,
                2
              ],
              [
                122,
                1
              ],
              [
                122,
                0
              ]
            ]
          ],
          "details": {
            "verdict": "проверить"
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0948",
      "patient_ref": "P-10431",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "6f2a0d19",
    "dicom_id": "3c8a15bb",
    "study_id": "1.2.643.5.1.13.2026.0948",
    "patient_ref": "P-10431",
    "created_at": "2026-09-27T09:48:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 1,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              73.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 7.665000000000001,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {
            "greater_trochanter_apex": [
              209.15624246910545,
              96.13392857142857
            ],
            "femoral_neck": [
              155.89285152976805,
              113.02232142857142
            ],
            "ischium": [
              77.94642576488403,
              157.19196428571428
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": ""
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 1,
          "source": "math",
          "value": 4.81,
          "unit": "mm",
          "points": {},
          "regions": [
            [
              [
                139.0,
                162.0
              ],
              [
                138.0,
                163.0
              ],
              [
                138.0,
                165.0
              ],
              [
                136.0,
                167.0
              ],
              [
                136.0,
                168.0
              ],
              [
                134.0,
                170.0
              ],
              [
                134.0,
                172.0
              ],
              [
                133.0,
                173.0
              ],
              [
                133.0,
                185.0
              ],
              [
                134.0,
                186.0
              ],
              [
                134.0,
                187.0
              ],
              [
                135.0,
                188.0
              ],
              [
                135.0,
                189.0
              ],
              [
                147.0,
                201.0
              ],
              [
                147.0,
                202.0
              ],
              [
                148.0,
                203.0
              ],
              [
                154.0,
                203.0
              ],
              [
                154.0,
                200.0
              ],
              [
                153.0,
                199.0
              ],
              [
                153.0,
                192.0
              ],
              [
                152.0,
                191.0
              ],
              [
                152.0,
                185.0
              ],
              [
                151.0,
                184.0
              ],
              [
                151.0,
                180.0
              ],
              [
                150.0,
                179.0
              ],
              [
                150.0,
                177.0
              ],
              [
                149.0,
                176.0
              ],
              [
                149.0,
                174.0
              ],
              [
                148.0,
                173.0
              ],
              [
                148.0,
                172.0
              ],
              [
                147.0,
                171.0
              ],
              [
                147.0,
                170.0
              ],
              [
                145.0,
                168.0
              ],
              [
                145.0,
                167.0
              ],
              [
                143.0,
                165.0
              ],
              [
                143.0,
                164.0
              ],
              [
                142.0,
                163.0
              ],
              [
                143.0,
                162.0
              ]
            ]
          ],
          "details": {
            "status": "проверить",
            "implant": false
          },
          "note": ""
        }
      },
      "verdict": 1,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.0948",
      "patient_ref": "P-10431",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "5d0c7b31",
    "dicom_id": "c15a7b22",
    "study_id": "1.2.643.5.1.13.2026.1002",
    "patient_ref": "P-10433",
    "created_at": "2026-09-27T10:02:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [
      "Ось позвоночника отклонена более чем на 5°"
    ],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 0,
          "source": "math",
          "value": -8.4,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [],
          "details": {
            "verdict": "чисто"
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.1002",
      "patient_ref": "P-10433",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "0b6c3f92",
    "dicom_id": "7d21e4a5",
    "study_id": "1.2.643.5.1.13.2026.1002",
    "patient_ref": "P-10433",
    "created_at": "2026-09-27T10:02:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [
      "Область интереса: верх < 3 см"
    ],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 0,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              32.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 1.92,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {
            "greater_trochanter_apex": [
              209.15624246910545,
              96.13392857142857
            ],
            "femoral_neck": [
              155.89285152976805,
              113.02232142857142
            ],
            "ischium": [
              77.94642576488403,
              157.19196428571428
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": ""
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 1,
          "source": "math",
          "value": 2.71,
          "unit": "mm",
          "points": {},
          "regions": [
            [
              [
                139.0,
                162.0
              ],
              [
                138.0,
                163.0
              ],
              [
                138.0,
                165.0
              ],
              [
                136.0,
                167.0
              ],
              [
                136.0,
                168.0
              ],
              [
                134.0,
                170.0
              ],
              [
                134.0,
                172.0
              ],
              [
                133.0,
                173.0
              ],
              [
                133.0,
                185.0
              ],
              [
                134.0,
                186.0
              ],
              [
                134.0,
                187.0
              ],
              [
                135.0,
                188.0
              ],
              [
                135.0,
                189.0
              ],
              [
                147.0,
                201.0
              ],
              [
                147.0,
                202.0
              ],
              [
                148.0,
                203.0
              ],
              [
                154.0,
                203.0
              ],
              [
                154.0,
                200.0
              ],
              [
                153.0,
                199.0
              ],
              [
                153.0,
                192.0
              ],
              [
                152.0,
                191.0
              ],
              [
                152.0,
                185.0
              ],
              [
                151.0,
                184.0
              ],
              [
                151.0,
                180.0
              ],
              [
                150.0,
                179.0
              ],
              [
                150.0,
                177.0
              ],
              [
                149.0,
                176.0
              ],
              [
                149.0,
                174.0
              ],
              [
                148.0,
                173.0
              ],
              [
                148.0,
                172.0
              ],
              [
                147.0,
                171.0
              ],
              [
                147.0,
                170.0
              ],
              [
                145.0,
                168.0
              ],
              [
                145.0,
                167.0
              ],
              [
                143.0,
                165.0
              ],
              [
                143.0,
                164.0
              ],
              [
                142.0,
                163.0
              ],
              [
                143.0,
                162.0
              ]
            ]
          ],
          "details": {
            "status": "норма",
            "implant": false
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.1002",
      "patient_ref": "P-10433",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "9a3e6f14",
    "dicom_id": "e8b1c390",
    "study_id": "1.2.643.5.1.13.2026.1020",
    "patient_ref": "P-10436",
    "created_at": "2026-09-27T10:20:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [
      "Верхние края подвздошных костей не в кадре"
    ],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 0,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.11
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": false
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [],
          "details": {
            "verdict": "чисто"
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.1020",
      "patient_ref": "P-10436",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "3a8f5e07",
    "dicom_id": "9e4b6c18",
    "study_id": "1.2.643.5.1.13.2026.1020",
    "patient_ref": "P-10436",
    "created_at": "2026-09-27T10:20:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [
      "Не найдены ключевые точки бедра",
      "Неправильная ротация бедра (малый вертел)"
    ],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 1,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              73.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 7.665000000000001,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 0,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": "оценка присутствия ниже порога"
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 0,
          "source": "gate",
          "value": 0.0,
          "unit": "mm",
          "points": {},
          "regions": [],
          "details": {
            "status": "не измерен",
            "implant": false
          },
          "note": "три ключевые точки не найдены — ротацию не измеряли"
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.1020",
      "patient_ref": "P-10436",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "c704b1a8",
    "dicom_id": "5f9c02e7",
    "study_id": "1.2.643.5.1.13.2026.1205",
    "patient_ref": "P-10440",
    "created_at": "2026-09-27T12:05:04",
    "status": "processing",
    "anatomical_region": null,
    "confidence": null,
    "violations": [],
    "duration_ms": null,
    "metadata": {
      "study_id": "1.2.643.5.1.13.2026.1205",
      "patient_ref": "P-10440",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "d918e2b5",
    "dicom_id": "6a0d73f1",
    "study_id": "1.2.643.5.1.13.2026.1205",
    "patient_ref": "P-10440",
    "created_at": "2026-09-27T12:05:11",
    "status": "pending",
    "anatomical_region": null,
    "confidence": null,
    "violations": [],
    "duration_ms": null,
    "metadata": {
      "study_id": "1.2.643.5.1.13.2026.1205",
      "patient_ref": "P-10440",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": ""
  },
  {
    "id": "e26a7c93",
    "dicom_id": "84be1d02",
    "study_id": "1.2.643.5.1.13.2026.1205",
    "patient_ref": "P-10440",
    "created_at": "2026-09-27T12:05:18",
    "status": "failed",
    "anatomical_region": null,
    "confidence": null,
    "violations": [],
    "duration_ms": 412,
    "metadata": {
      "study_id": "1.2.643.5.1.13.2026.1205",
      "patient_ref": "P-10440",
      "study_date": "2026-09-27",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": null,
    "comment": "",
    "specialist_name": "",
    "error": "ValueError: не определена сторона бедра (нет ни ответа сети, ни кости в верхней части кадра)"
  },
  {
    "id": "b537d0c1",
    "dicom_id": "2e6f8a94",
    "study_id": "1.2.643.5.1.13.2026.2610",
    "patient_ref": "P-10390",
    "created_at": "2026-09-26T15:10:04",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [],
          "details": {
            "verdict": "чисто"
          },
          "note": ""
        }
      },
      "verdict": 1,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.2610",
      "patient_ref": "P-10390",
      "study_date": "2026-09-26",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": "approved",
    "comment": "",
    "specialist_name": "Соколова М. И."
  },
  {
    "id": "f1c49a26",
    "dicom_id": "0d5b3e77",
    "study_id": "1.2.643.5.1.13.2026.2610",
    "patient_ref": "P-10390",
    "created_at": "2026-09-26T15:10:11",
    "status": "completed",
    "anatomical_region": "hip_left",
    "confidence": 0.8935806155204773,
    "violations": [
      "Неправильная ротация бедра (малый вертел)"
    ],
    "duration_ms": 6461,
    "metadata": {
      "shape": [
        291,
        280
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "hip",
          "mask": "hip",
          "width": "hip"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 2,
        "cnn_confidence": 0.7871612310409546
      },
      "criteria": {
        "hip_margins": {
          "name": "hip_margins",
          "ok": 1,
          "source": "math",
          "value": null,
          "unit": "cm",
          "points": {
            "apex": [
              198.0,
              73.0
            ],
            "lateral": [
              230.0,
              125.5
            ],
            "ischium": [
              52.0,
              187.0
            ]
          },
          "regions": [],
          "details": {
            "top_cm": 7.665000000000001,
            "bottom_cm": 10.815000000000001,
            "side_cm": 2.94,
            "implant": false
          },
          "note": ""
        },
        "hip_keypoints": {
          "name": "hip_keypoints",
          "ok": 1,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {
            "greater_trochanter_apex": [
              209.15624246910545,
              96.13392857142857
            ],
            "femoral_neck": [
              155.89285152976805,
              113.02232142857142
            ],
            "ischium": [
              77.94642576488403,
              157.19196428571428
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "greater_trochanter_apex": 1.0,
              "femoral_neck": 1.0,
              "ischium": 0.9996742010116577
            }
          },
          "note": ""
        },
        "lesser_trochanter": {
          "name": "lesser_trochanter",
          "ok": 0,
          "source": "math",
          "value": 8.5479298771043,
          "unit": "mm",
          "points": {},
          "regions": [
            [
              [
                139.0,
                162.0
              ],
              [
                138.0,
                163.0
              ],
              [
                138.0,
                165.0
              ],
              [
                136.0,
                167.0
              ],
              [
                136.0,
                168.0
              ],
              [
                134.0,
                170.0
              ],
              [
                134.0,
                172.0
              ],
              [
                133.0,
                173.0
              ],
              [
                133.0,
                185.0
              ],
              [
                134.0,
                186.0
              ],
              [
                134.0,
                187.0
              ],
              [
                135.0,
                188.0
              ],
              [
                135.0,
                189.0
              ],
              [
                147.0,
                201.0
              ],
              [
                147.0,
                202.0
              ],
              [
                148.0,
                203.0
              ],
              [
                154.0,
                203.0
              ],
              [
                154.0,
                200.0
              ],
              [
                153.0,
                199.0
              ],
              [
                153.0,
                192.0
              ],
              [
                152.0,
                191.0
              ],
              [
                152.0,
                185.0
              ],
              [
                151.0,
                184.0
              ],
              [
                151.0,
                180.0
              ],
              [
                150.0,
                179.0
              ],
              [
                150.0,
                177.0
              ],
              [
                149.0,
                176.0
              ],
              [
                149.0,
                174.0
              ],
              [
                148.0,
                173.0
              ],
              [
                148.0,
                172.0
              ],
              [
                147.0,
                171.0
              ],
              [
                147.0,
                170.0
              ],
              [
                145.0,
                168.0
              ],
              [
                145.0,
                167.0
              ],
              [
                143.0,
                165.0
              ],
              [
                143.0,
                164.0
              ],
              [
                142.0,
                163.0
              ],
              [
                143.0,
                162.0
              ]
            ]
          ],
          "details": {
            "status": "плохой",
            "implant": false
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.2610",
      "patient_ref": "P-10390",
      "study_date": "2026-09-26",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": "rejected",
    "comment": "Ротация бедра вне нормы, исследование переснято.",
    "specialist_name": "Соколова М. И."
  },
  {
    "id": "a0e83b54",
    "dicom_id": "cc71f9d3",
    "study_id": "1.2.643.5.1.13.2026.2610",
    "patient_ref": "P-10390",
    "created_at": "2026-09-26T15:10:18",
    "status": "completed",
    "anatomical_region": "spine",
    "confidence": 0.9949420094490051,
    "violations": [
      "Посторонние предметы или артефакты"
    ],
    "duration_ms": 2391,
    "metadata": {
      "shape": [
        317,
        300
      ],
      "classification": {
        "source": "vote",
        "votes": {
          "cnn": "spine",
          "mask": "spine",
          "width": "spine"
        },
        "agreement": 1.0,
        "unanimous": true,
        "n_peaks": 13,
        "cnn_confidence": 0.9898840188980103
      },
      "criteria": {
        "spine_axis": {
          "name": "spine_axis",
          "ok": 1,
          "source": "math",
          "value": -1.9978798564766747,
          "unit": "deg",
          "points": {
            "top_left": [
              126.0,
              7.5
            ],
            "top_right": [
              179.0,
              7.5
            ],
            "bottom_left": [
              100.0,
              308.5
            ],
            "bottom_right": [
              184.0,
              308.5
            ]
          },
          "regions": [],
          "details": {},
          "note": ""
        },
        "pelvis_crest": {
          "name": "pelvis_crest",
          "ok": 1,
          "source": "vote",
          "value": null,
          "unit": "",
          "points": {
            "crest_left": [
              45.285714439956514,
              263.2232142857143
            ],
            "crest_right": [
              280.20535809723094,
              274.54464285714283
            ]
          },
          "regions": [],
          "details": {
            "confidence": {
              "left": 0.9999996423721313,
              "right": 0.9999580383300781
            },
            "square": {
              "width_px": 108.0,
              "height_px": 106.0,
              "left_ok": true,
              "right_ok": true
            }
          },
          "note": ""
        },
        "foreign_objects": {
          "name": "foreign_objects",
          "ok": 0,
          "source": "model",
          "value": null,
          "unit": "",
          "points": {},
          "regions": [
            [
              [
                166,
                0
              ],
              [
                165,
                1
              ],
              [
                165,
                7
              ],
              [
                167,
                9
              ],
              [
                167,
                10
              ],
              [
                171,
                14
              ],
              [
                172,
                14
              ],
              [
                174,
                16
              ],
              [
                175,
                16
              ],
              [
                176,
                17
              ],
              [
                177,
                17
              ],
              [
                178,
                18
              ],
              [
                179,
                18
              ],
              [
                180,
                19
              ],
              [
                180,
                20
              ],
              [
                181,
                20
              ],
              [
                182,
                21
              ],
              [
                183,
                21
              ],
              [
                184,
                22
              ],
              [
                185,
                22
              ],
              [
                186,
                23
              ],
              [
                187,
                23
              ],
              [
                188,
                24
              ],
              [
                189,
                24
              ],
              [
                191,
                26
              ],
              [
                192,
                26
              ],
              [
                199,
                33
              ],
              [
                199,
                34
              ],
              [
                198,
                35
              ],
              [
                198,
                37
              ],
              [
                199,
                38
              ],
              [
                201,
                38
              ],
              [
                203,
                40
              ],
              [
                204,
                40
              ],
              [
                205,
                41
              ],
              [
                206,
                41
              ],
              [
                208,
                43
              ],
              [
                209,
                43
              ],
              [
                210,
                44
              ],
              [
                211,
                44
              ],
              [
                212,
                45
              ],
              [
                213,
                45
              ],
              [
                214,
                46
              ],
              [
                216,
                46
              ],
              [
                217,
                47
              ],
              [
                219,
                47
              ],
              [
                220,
                48
              ],
              [
                222,
                48
              ],
              [
                223,
                49
              ],
              [
                224,
                49
              ],
              [
                225,
                50
              ],
              [
                226,
                50
              ],
              [
                227,
                51
              ],
              [
                229,
                51
              ],
              [
                230,
                52
              ],
              [
                233,
                52
              ],
              [
                234,
                53
              ],
              [
                235,
                53
              ],
              [
                236,
                54
              ],
              [
                238,
                54
              ],
              [
                239,
                55
              ],
              [
                240,
                55
              ],
              [
                242,
                57
              ],
              [
                240,
                59
              ],
              [
                240,
                62
              ],
              [
                241,
                62
              ],
              [
                242,
                63
              ],
              [
                244,
                63
              ],
              [
                245,
                64
              ],
              [
                249,
                64
              ],
              [
                250,
                65
              ],
              [
                259,
                65
              ],
              [
                260,
                66
              ],
              [
                269,
                66
              ],
              [
                270,
                67
              ],
              [
                282,
                67
              ],
              [
                283,
                68
              ],
              [
                284,
                68
              ],
              [
                285,
                67
              ],
              [
                286,
                67
              ],
              [
                288,
                65
              ],
              [
                288,
                61
              ],
              [
                289,
                60
              ],
              [
                289,
                55
              ],
              [
                286,
                52
              ],
              [
                279,
                52
              ],
              [
                278,
                51
              ],
              [
                268,
                51
              ],
              [
                267,
                50
              ],
              [
                264,
                50
              ],
              [
                263,
                49
              ],
              [
                255,
                49
              ],
              [
                254,
                48
              ],
              [
                252,
                48
              ],
              [
                251,
                47
              ],
              [
                246,
                47
              ],
              [
                245,
                46
              ],
              [
                242,
                46
              ],
              [
                241,
                45
              ],
              [
                240,
                45
              ],
              [
                239,
                44
              ],
              [
                239,
                43
              ],
              [
                236,
                40
              ],
              [
                236,
                39
              ],
              [
                234,
                37
              ],
              [
                234,
                36
              ],
              [
                233,
                35
              ],
              [
                231,
                35
              ],
              [
                230,
                34
              ],
              [
                227,
                34
              ],
              [
                226,
                33
              ],
              [
                225,
                33
              ],
              [
                224,
                32
              ],
              [
                223,
                32
              ],
              [
                222,
                31
              ],
              [
                221,
                31
              ],
              [
                220,
                30
              ],
              [
                218,
                30
              ],
              [
                217,
                29
              ],
              [
                215,
                29
              ],
              [
                214,
                28
              ],
              [
                212,
                28
              ],
              [
                211,
                27
              ],
              [
                210,
                27
              ],
              [
                209,
                26
              ],
              [
                208,
                26
              ],
              [
                207,
                25
              ],
              [
                206,
                25
              ],
              [
                204,
                23
              ],
              [
                203,
                23
              ],
              [
                202,
                22
              ],
              [
                201,
                22
              ],
              [
                200,
                21
              ],
              [
                199,
                21
              ],
              [
                198,
                20
              ],
              [
                197,
                20
              ],
              [
                194,
                17
              ],
              [
                193,
                17
              ],
              [
                192,
                16
              ],
              [
                191,
                16
              ],
              [
                189,
                14
              ],
              [
                188,
                14
              ],
              [
                187,
                13
              ],
              [
                186,
                13
              ],
              [
                184,
                11
              ],
              [
                183,
                11
              ],
              [
                181,
                9
              ],
              [
                180,
                9
              ],
              [
                177,
                6
              ],
              [
                176,
                6
              ],
              [
                173,
                3
              ],
              [
                172,
                3
              ],
              [
                170,
                1
              ],
              [
                168,
                1
              ],
              [
                167,
                0
              ]
            ],
            [
              [
                111,
                0
              ],
              [
                110,
                1
              ],
              [
                110,
                2
              ],
              [
                108,
                4
              ],
              [
                107,
                4
              ],
              [
                104,
                7
              ],
              [
                103,
                7
              ],
              [
                101,
                9
              ],
              [
                100,
                9
              ],
              [
                97,
                12
              ],
              [
                96,
                12
              ],
              [
                95,
                13
              ],
              [
                94,
                13
              ],
              [
                92,
                15
              ],
              [
                91,
                15
              ],
              [
                89,
                17
              ],
              [
                88,
                17
              ],
              [
                87,
                18
              ],
              [
                86,
                18
              ],
              [
                85,
                19
              ],
              [
                84,
                19
              ],
              [
                83,
                20
              ],
              [
                82,
                20
              ],
              [
                81,
                21
              ],
              [
                80,
                21
              ],
              [
                79,
                22
              ],
              [
                78,
                22
              ],
              [
                77,
                23
              ],
              [
                76,
                23
              ],
              [
                75,
                24
              ],
              [
                74,
                24
              ],
              [
                73,
                25
              ],
              [
                65,
                25
              ],
              [
                64,
                26
              ],
              [
                64,
                27
              ],
              [
                60,
                31
              ],
              [
                59,
                31
              ],
              [
                58,
                32
              ],
              [
                56,
                32
              ],
              [
                55,
                33
              ],
              [
                53,
                33
              ],
              [
                52,
                34
              ],
              [
                50,
                34
              ],
              [
                48,
                36
              ],
              [
                48,
                37
              ],
              [
                47,
                38
              ],
              [
                47,
                40
              ],
              [
                46,
                41
              ],
              [
                46,
                43
              ],
              [
                47,
                44
              ],
              [
                52,
                44
              ],
              [
                53,
                43
              ],
              [
                54,
                43
              ],
              [
                55,
                42
              ],
              [
                58,
                42
              ],
              [
                59,
                41
              ],
              [
                64,
                41
              ],
              [
                65,
                42
              ],
              [
                63,
                44
              ],
              [
                62,
                44
              ],
              [
                61,
                45
              ],
              [
                60,
                45
              ],
              [
                58,
                47
              ],
              [
                57,
                47
              ],
              [
                56,
                48
              ],
              [
                53,
                48
              ],
              [
                52,
                49
              ],
              [
                47,
                49
              ],
              [
                46,
                50
              ],
              [
                45,
                50
              ],
              [
                44,
                51
              ],
              [
                43,
                51
              ],
              [
                42,
                52
              ],
              [
                39,
                52
              ],
              [
                38,
                53
              ],
              [
                34,
                53
              ],
              [
                33,
                54
              ],
              [
                31,
                54
              ],
              [
                30,
                55
              ],
              [
                29,
                55
              ],
              [
                28,
                56
              ],
              [
                27,
                56
              ],
              [
                26,
                57
              ],
              [
                26,
                58
              ],
              [
                25,
                59
              ],
              [
                25,
                62
              ],
              [
                26,
                63
              ],
              [
                26,
                66
              ],
              [
                27,
                67
              ],
              [
                27,
                69
              ],
              [
                31,
                69
              ],
              [
                32,
                68
              ],
              [
                38,
                68
              ],
              [
                39,
                67
              ],
              [
                42,
                67
              ],
              [
                43,
                66
              ],
              [
                44,
                66
              ],
              [
                47,
                63
              ],
              [
                48,
                63
              ],
              [
                49,
                62
              ],
              [
                50,
                62
              ],
              [
                51,
                61
              ],
              [
                52,
                61
              ],
              [
                54,
                59
              ],
              [
                55,
                59
              ],
              [
                56,
                58
              ],
              [
                57,
                58
              ],
              [
                58,
                57
              ],
              [
                59,
                57
              ],
              [
                61,
                55
              ],
              [
                62,
                55
              ],
              [
                63,
                54
              ],
              [
                64,
                54
              ],
              [
                65,
                53
              ],
              [
                66,
                53
              ],
              [
                67,
                52
              ],
              [
                68,
                52
              ],
              [
                69,
                51
              ],
              [
                70,
                51
              ],
              [
                71,
                50
              ],
              [
                72,
                50
              ],
              [
                73,
                49
              ],
              [
                74,
                49
              ],
              [
                75,
                48
              ],
              [
                76,
                48
              ],
              [
                77,
                47
              ],
              [
                78,
                47
              ],
              [
                79,
                46
              ],
              [
                80,
                46
              ],
              [
                81,
                45
              ],
              [
                82,
                45
              ],
              [
                83,
                44
              ],
              [
                84,
                44
              ],
              [
                86,
                42
              ],
              [
                87,
                42
              ],
              [
                90,
                39
              ],
              [
                91,
                39
              ],
              [
                92,
                38
              ],
              [
                93,
                38
              ],
              [
                94,
                37
              ],
              [
                95,
                37
              ],
              [
                96,
                36
              ],
              [
                97,
                36
              ],
              [
                99,
                34
              ],
              [
                100,
                34
              ],
              [
                102,
                32
              ],
              [
                102,
                31
              ],
              [
                103,
                30
              ],
              [
                102,
                29
              ],
              [
                91,
                29
              ],
              [
                90,
                28
              ],
              [
                90,
                27
              ],
              [
                91,
                26
              ],
              [
                92,
                26
              ],
              [
                95,
                23
              ],
              [
                96,
                23
              ],
              [
                98,
                21
              ],
              [
                99,
                21
              ],
              [
                102,
                18
              ],
              [
                103,
                18
              ],
              [
                106,
                15
              ],
              [
                107,
                15
              ],
              [
                108,
                14
              ],
              [
                109,
                14
              ],
              [
                110,
                13
              ],
              [
                111,
                13
              ],
              [
                114,
                10
              ],
              [
                115,
                10
              ],
              [
                119,
                6
              ],
              [
                119,
                5
              ],
              [
                121,
                3
              ],
              [
                121,
                2
              ],
              [
                122,
                1
              ],
              [
                122,
                0
              ]
            ]
          ],
          "details": {
            "verdict": "ПРЕДМЕТ"
          },
          "note": ""
        }
      },
      "verdict": 0,
      "models": {
        "region": "подключена",
        "hip_keypoints": "подключена",
        "pelvis_crest": "подключена",
        "pelvis_presence": "подключена",
        "foreign_seg": "подключена"
      },
      "settings": {
        "trochanter_center_mm": 2.7,
        "trochanter_tol_percent": 63.0,
        "trochanter_yellow_percent": 30.0
      },
      "study_id": "1.2.643.5.1.13.2026.2610",
      "patient_ref": "P-10390",
      "study_date": "2026-09-26",
      "device": "Lunar Prodigy Advance"
    },
    "specialist_decision": "force_approved",
    "comment": "Артефакт вне зоны интереса, на измерение не влияет.",
    "specialist_name": "Громов П. А."
  }
]

/* dicom_id -> scan file. In the real system this is the GET /dicom/{id}/image response. */
export const DEMO_SCANS: Record<string, string> = {
  "d41f8a63": "/assets/scan-spine.png",
  "f03d2a71": "/assets/scan-hip-left.png",
  "a7c3e011": "/assets/scan-spine.png",
  "1b7e9f04": "/assets/scan-hip-left.png",
  "b902f4de": "/assets/scan-spine.png",
  "3c8a15bb": "/assets/scan-hip-left.png",
  "c15a7b22": "/assets/scan-spine.png",
  "7d21e4a5": "/assets/scan-hip-left.png",
  "e8b1c390": "/assets/scan-spine.png",
  "9e4b6c18": "/assets/scan-hip-left.png",
  "5f9c02e7": "/assets/scan-hip-right.png",
  "6a0d73f1": "/assets/scan-hip-right.png",
  "84be1d02": "/assets/scan-hip-right.png",
  "2e6f8a94": "/assets/scan-spine.png",
  "0d5b3e77": "/assets/scan-hip-left.png",
  "cc71f9d3": "/assets/scan-spine.png"
}
