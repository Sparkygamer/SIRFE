"""
SIRFE Backend (Demo)
====================
Servidor Flask de demostración.
- No autenticación real
- Base de datos SQLite local (solo para la demo)
- Sin conexión a sistemas operativos reales
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime
import uuid

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)  # Solo para demo local

DB_PATH = os.path.join(os.path.dirname(__file__), "sirfe_demo.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS minors (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            sex TEXT,
            center TEXT,
            family TEXT,
            notes TEXT,
            photo TEXT,
            status TEXT DEFAULT 'pendiente',
            registered_at TEXT,
            reunified_at TEXT
        )
    """)
    conn.commit()
    conn.close()


# ---------- API ----------

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "SIRFE Demo API — prototipo ilustrativo",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })


@app.route("/api/login", methods=["POST"])
def login():
    """Login simulado. Siempre acepta las credenciales de demo."""
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    return jsonify({
        "success": True,
        "token": "demo-token-" + str(uuid.uuid4())[:8],
        "user": {
            "username": username or "operador.demo",
            "role": "operador_centro",
            "center": "Centro Temporal “Esperanza” – Zona Norte"
        },
        "message": "Acceso concedido (simulado)"
    })


@app.route("/api/minors", methods=["GET"])
def list_minors():
    status = request.args.get("status")
    conn = get_db()
    if status:
        rows = conn.execute(
            "SELECT * FROM minors WHERE status = ? ORDER BY registered_at DESC",
            (status,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM minors ORDER BY registered_at DESC"
        ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/minors", methods=["POST"])
def register_minor():
    data = request.get_json()
    if not data or not data.get("name") or not data.get("age"):
        return jsonify({"error": "name y age son obligatorios"}), 400

    minor_id = "M-" + uuid.uuid4().hex[:8].upper()
    now = datetime.utcnow().isoformat() + "Z"

    conn = get_db()
    conn.execute("""
        INSERT INTO minors (id, name, age, sex, center, family, notes, photo, status, registered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)
    """, (
        minor_id,
        data.get("name"),
        int(data.get("age")),
        data.get("sex", "O"),
        data.get("center", ""),
        data.get("family", ""),
        data.get("notes", ""),
        data.get("photo", ""),
        now
    ))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "id": minor_id,
        "message": f"Menor {data.get('name')} registrado correctamente"
    }), 201


@app.route("/api/minors/<minor_id>/status", methods=["PATCH"])
def update_status(minor_id):
    data = request.get_json() or {}
    new_status = data.get("status")
    if new_status not in ("pendiente", "reunificado"):
        return jsonify({"error": "status inválido"}), 400

    conn = get_db()
    reunified_at = datetime.utcnow().isoformat() + "Z" if new_status == "reunificado" else None
    cur = conn.execute(
        "UPDATE minors SET status = ?, reunified_at = ? WHERE id = ?",
        (new_status, reunified_at, minor_id)
    )
    conn.commit()
    conn.close()

    if cur.rowcount == 0:
        return jsonify({"error": "menor no encontrado"}), 404

    return jsonify({"success": True, "id": minor_id, "status": new_status})


@app.route("/api/verify", methods=["POST"])
def record_verification():
    data = request.get_json() or {}
    minor_id = data.get("minor_id")
    similarity = data.get("similarity")
    passed = data.get("passed", False)
    adult_name = data.get("adult_name", "")

    if not minor_id:
        return jsonify({"error": "minor_id requerido"}), 400

    if passed:
        conn = get_db()
        conn.execute(
            "UPDATE minors SET status = 'reunificado', reunified_at = ? WHERE id = ?",
            (datetime.utcnow().isoformat() + "Z", minor_id)
        )
        conn.commit()
        conn.close()

    return jsonify({
        "success": True,
        "minor_id": minor_id,
        "similarity": similarity,
        "passed": passed,
        "adult_name": adult_name,
        "message": "Verificación registrada en el sistema (demo)"
    })


@app.route("/api/admin/clear", methods=["DELETE"])
def clear_all_data():
    """Borra TODOS los menores y fotos de la base de datos de la demo."""
    conn = get_db()
    cur = conn.execute("DELETE FROM minors")
    deleted = cur.rowcount
    conn.commit()
    conn.close()
    return jsonify({
        "success": True,
        "deleted": deleted,
        "message": f"Se eliminaron {deleted} registros. Base de datos de la demo limpia."
    })


# Servir el frontend
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    init_db()
    print("=" * 60)
    print("  SIRFE Demo Backend")
    print("  Prototipo ilustrativo — sin datos reales")
    print("  Abre: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="127.0.0.1", port=5000, debug=True)