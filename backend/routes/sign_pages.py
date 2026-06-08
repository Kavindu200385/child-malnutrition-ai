import os
import uuid
from datetime import datetime

from flask import Blueprint, jsonify, request, send_from_directory
from flask_jwt_extended import verify_jwt_in_request
from werkzeug.utils import secure_filename

from backend.auth_utils_hierarchical import get_current_user, health_ministry_required
from backend.extensions import db
from backend.models_hierarchical import SignPageRecord

bp = Blueprint("sign_pages", __name__, url_prefix="/api/sign-pages")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "sign_pages")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
DEFAULT_SIGNIN_PHOTOS = [
    "https://images.unsplash.com/photo-1604599730009-fe273616197c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGhjYXJlJTIwbW90aGVyJTIwYmFieSUyMGNsaW5pY3xlbnwxfHx8fDE3NzAwMTY2NTF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1758691462164-100b5e356169?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlsZCUyMGhlYWx0aCUyMGNoZWNrdXAlMjBkb2N0b3J8ZW58MXx8fHwxNzcwMDE2NjUyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1594643781026-abcb610d394f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwZWRpYXRyaWMlMjBudXRyaXRpb24lMjBtZWFzdXJlbWVudHxlbnwxfHx8fDE3NzAwMTY2NTJ8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1610401162696-dad858f5b16d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtZWRpY2FsJTIwaGVhbHRoY2FyZSUyMHdvcmtlciUyMGJhYnl8ZW58MXx8fHwxNzcwMDE2NjUyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
    "https://images.unsplash.com/photo-1616408621653-6755190009a3?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGlsZHJlbiUyMGhlYWx0aCUyMGNsaW5pYyUyMGNhcmV8ZW58MXx8fHwxNzcwMDE2NjUzfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral",
]


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _save_uploaded_file(file_storage, side: str) -> str:
    original_name = secure_filename(file_storage.filename or "")
    ext = original_name.rsplit(".", 1)[1].lower()
    unique_name = f"{side}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex[:8]}.{ext}"
    abs_path = os.path.join(UPLOAD_DIR, unique_name)
    file_storage.save(abs_path)
    # Store URL path that can be fetched by frontend
    return f"/api/sign-pages/files/{unique_name}"


@bp.route("/upload", methods=["POST"])
@health_ministry_required
def upload_sign_pages():
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    front = request.files.get("frontImage")
    back = request.files.get("backImage")

    if not front or not back:
        return jsonify({"status": "error", "message": "Both frontImage and backImage are required"}), 400
    if not front.filename or not back.filename:
        return jsonify({"status": "error", "message": "Uploaded files must have valid names"}), 400
    if not _allowed_file(front.filename) or not _allowed_file(back.filename):
        return jsonify({"status": "error", "message": "Only png, jpg, jpeg, webp files are allowed"}), 400

    front_path = _save_uploaded_file(front, "front")
    back_path = _save_uploaded_file(back, "back")

    record = SignPageRecord(
        front_image_path=front_path,
        back_image_path=back_path,
        role=(request.form.get("role") or user.role or "health_ministry").strip(),
        uploaded_by_user_id=user.id,
    )
    db.session.add(record)
    db.session.commit()

    return jsonify({"status": "success", "record": record.to_dict()}), 201


@bp.route("", methods=["GET"])
@health_ministry_required
def list_sign_pages():
    records = (
        db.session.query(SignPageRecord)
        .order_by(SignPageRecord.created_at.desc())
        .all()
    )
    return jsonify(
        {"status": "success", "records": [r.to_dict() for r in records], "count": len(records)}
    ), 200


@bp.route("/import-signin-photos", methods=["POST"])
@health_ministry_required
def import_signin_photos():
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    photos = payload.get("photos") if isinstance(payload.get("photos"), list) else DEFAULT_SIGNIN_PHOTOS
    created = 0

    for url in photos:
        if not isinstance(url, str) or not url.strip():
            continue
        normalized = url.strip()
        existing = db.session.query(SignPageRecord).filter(
            SignPageRecord.front_image_path == normalized,
            SignPageRecord.back_image_path == normalized,
        ).first()
        if existing:
            continue
        db.session.add(
            SignPageRecord(
                front_image_path=normalized,
                back_image_path=normalized,
                role=user.role,
                uploaded_by_user_id=user.id,
            )
        )
        created += 1

    db.session.commit()
    return jsonify({"status": "success", "created": created}), 200


@bp.route("/<int:record_id>", methods=["DELETE"])
@health_ministry_required
def delete_sign_page(record_id: int):
    user = get_current_user()
    if not user:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    if not user.is_protected:
        return jsonify({"status": "error", "message": "Only superadmin can delete sign page records"}), 403

    record = db.session.get(SignPageRecord, record_id)
    if not record:
        return jsonify({"status": "error", "message": "Record not found"}), 404

    # Best-effort physical file cleanup
    for path in (record.front_image_path, record.back_image_path):
        filename = os.path.basename(path or "")
        if filename:
            abs_path = os.path.join(UPLOAD_DIR, filename)
            try:
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            except Exception:
                pass

    db.session.delete(record)
    db.session.commit()
    return jsonify({"status": "success", "message": "Sign page record deleted"}), 200


@bp.route("/files/<path:filename>", methods=["GET"])
def get_sign_page_file(filename: str):
    try:
        verify_jwt_in_request()
    except Exception:
        return jsonify({"status": "error", "message": "Authentication required"}), 401
    return send_from_directory(UPLOAD_DIR, filename)

