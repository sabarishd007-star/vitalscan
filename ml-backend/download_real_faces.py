"""
download_real_faces.py — fetch a small real-face corpus for robustness testing.

Phase A validation uses real photographic faces (not synthetic renders) to check
that the full production pipeline (decode -> face crop -> CLAHE -> bilateral ->
FaceMesh -> zone-masked CV metrics -> MobileNetV2 distilled model) runs
robustly and produces plausible, finite, in-range scores on genuine faces.

The corpus is a hand-picked set of faces bundled as test/sample data with
open-source computer-vision projects. Each image stays in the public repos it
came from; this script only downloads them for local testing and the images are
gitignored (see ml-backend/.gitignore). Human likenesses remain the property of
their respective rights holders; this project does not redistribute them.

Sources:
  - dlib  (Boost Software License 1.0) — examples/faces, face-detection samples
  - OpenCV (Apache License 2.0) — samples/data, face sample images
  - face_recognition (MIT License) — examples, political-figure sample images
"""
from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
IMG_DIR = BASE / "real_faces" / "images"
MANIFEST_PATH = BASE / "real_faces" / "manifest.json"

CORPUS = [
    # (filename, url, source_repo, license, note)
    ("dlib_2007_007763.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2007_007763.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_001009.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_001009.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_001322.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_001322.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_002079.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_002079.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_002470.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_002470.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_002506.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_002506.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_004176.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_004176.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2008_007676.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2008_007676.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_2009_004587.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/2009_004587.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_Tom_Cruise_avp_2014_4.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/Tom_Cruise_avp_2014_4.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subject)"),
    ("dlib_bald_guys.jpg", "https://raw.githubusercontent.com/davisking/dlib/master/examples/faces/bald_guys.jpg", "dlib", "BSL-1.0", "dlib face-detection sample (LFW subjects)"),
    ("opencv_lena.jpg", "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg", "opencv", "Apache-2.0", "classic Lena test image"),
    ("opencv_messi5.jpg", "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/messi5.jpg", "opencv", "Apache-2.0", "OpenCV sample portrait (Lionel Messi)"),
    ("facerec_obama.jpg", "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/obama.jpg", "face_recognition", "MIT", "public-domain White House photo sample"),
    ("facerec_obama2.jpg", "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/obama2.jpg", "face_recognition", "MIT", "public-domain White House photo sample"),
    ("facerec_biden.jpg", "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/biden.jpg", "face_recognition", "MIT", "public-domain White House photo sample"),
    ("facerec_lin_manuel_miranda.png", "https://raw.githubusercontent.com/ageitgey/face_recognition/master/examples/lin-manuel-miranda.png", "face_recognition", "MIT", "promotional still sample (Lin-Manuel Miranda)"),
]


def download(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "vitalscan-real-validation"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if len(data) < 1000:
        raise RuntimeError(f"suspiciously small payload for {url} ({len(data)} bytes)")
    dest.write_bytes(data)
    return True


def main() -> int:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"generated_at": "", "note": "", "images": []}
    ok = 0
    for filename, url, source, license_name, note in CORPUS:
        dest = IMG_DIR / filename
        status = "exists"
        try:
            if not dest.exists() or dest.stat().st_size < 1000:
                download(url, dest)
                status = "downloaded"
            manifest["images"].append({
                "filename": filename,
                "url": url,
                "source_repo": source,
                "license": license_name,
                "note": note,
            })
            ok += 1
            print(f"  {status:11} {filename}")
        except Exception as err:
            print(f"  FAIL        {filename}: {err}")
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\n{ok}/{len(CORPUS)} images available in {IMG_DIR}")
    print(f"manifest written to {MANIFEST_PATH}")
    return 0 if ok == len(CORPUS) else 1


if __name__ == "__main__":
    raise SystemExit(main())
