"""
RPCA56 Reunion — Upload server
Photos are uploaded to Cloudinary CDN.
All data (likes, comments, posts) is stored in Firestore directly from the browser.
"""
import os
import io
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image, ExifTags
import cloudinary
import cloudinary.uploader

# ── Config ────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
PUBLIC_DIR = BASE_DIR / "public"
PORT       = int(os.environ.get("PORT", 3000))

MAX_PIXELS  = 1920
JPEG_QUALITY = 82
MAX_FILE_MB  = 50

app = Flask(__name__, static_folder=str(PUBLIC_DIR))
CORS(app)

def configure_cloudinary():
    cloudinary.config(
        cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key    = os.environ.get("CLOUDINARY_API_KEY"),
        api_secret = os.environ.get("CLOUDINARY_API_SECRET"),
        secure     = True
    )

# ── Image helpers ─────────────────────────────────────────────────────────────

def fix_orientation(img):
    try:
        exif = img._getexif()
        if not exif:
            return img
        orient_tag = next((k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None)
        if not orient_tag or orient_tag not in exif:
            return img
        rotations = {3: 180, 6: 270, 8: 90}
        orientation = exif[orient_tag]
        if orientation in rotations:
            img = img.rotate(rotations[orientation], expand=True)
    except Exception:
        pass
    return img

def process_image(file_stream):
    img = Image.open(file_stream)
    img = fix_orientation(img)
    if img.mode in ("RGBA", "P", "LA"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if img.mode == "P":
            img = img.convert("RGBA")
        background.paste(img, mask=img.split()[-1] if img.mode in ("RGBA", "LA") else None)
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")
    if img.width > MAX_PIXELS or img.height > MAX_PIXELS:
        img.thumbnail((MAX_PIXELS, MAX_PIXELS), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    out.seek(0)
    return out

# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory(str(PUBLIC_DIR), "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(str(PUBLIC_DIR), filename)

@app.route("/api/upload", methods=["POST"])
def upload_photos():
    files = request.files.getlist("photos")
    files = [f for f in files if f and f.filename][:10]

    if not files:
        return jsonify({"error": "No photos received"}), 400

    urls = []
    for file in files:
        mime = file.mimetype or "image/jpeg"
        if not mime.startswith("image/"):
            continue
        file.stream.seek(0, 2)
        size_mb = file.stream.tell() / (1024 * 1024)
        file.stream.seek(0)
        if size_mb > MAX_FILE_MB:
            print(f"Skipping {file.filename}: {size_mb:.1f} MB exceeds limit")
            continue
        try:
            jpeg_bytes = process_image(file.stream)
            result = cloudinary.uploader.upload(
                jpeg_bytes,
                folder="rpca56-reunion",
                resource_type="image"
            )
            urls.append(result["secure_url"])
            print(f"Uploaded to Cloudinary: {result['secure_url']}")
        except Exception as e:
            print(f"Upload error for {file.filename}: {e}")

    if not urls:
        return jsonify({"error": "All uploads failed"}), 500

    return jsonify({"urls": urls})

@app.route("/api/health", methods=["GET"])
def health():
    cloud_ok = bool(os.environ.get("CLOUDINARY_CLOUD_NAME"))
    return jsonify({"status": "ok", "cloudinary": cloud_ok})

# ── Start ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"'))

    configure_cloudinary()
    print(f"\n  RPCA56 Upload Server running at http://localhost:{PORT}")
    cloud_ok = bool(os.environ.get("CLOUDINARY_CLOUD_NAME"))
    print(f"  Cloudinary: {'OK' if cloud_ok else 'NOT configured - check .env'}")
    print(f"  Max photo size: {MAX_FILE_MB} MB -> resized to {MAX_PIXELS}px\n")
    app.run(host="0.0.0.0", port=PORT, debug=False)
