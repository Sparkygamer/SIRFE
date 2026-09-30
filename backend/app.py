"""
SIRFE Backend
====================
Servidor Flask.
- Base de datos SQLite local
- API REST para menores y adultos
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime
import uuid

app = Flask(__name__, static_folder="../frontend", static_url_path="")
CORS(app)

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
    conn.execute("""
        CREATE TABLE IF NOT EXISTS adults (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            document_id TEXT,
            phone TEXT,
            relation_sought TEXT,
            child_name_sought TEXT,
            center TEXT,
            notes TEXT,
            photo TEXT,
            status TEXT DEFAULT 'buscando',
            registered_at TEXT
        )
    """)
    conn.commit()
    conn.close()


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "message": "SIRFE API",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    })


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "")
    return jsonify({
        "success": True,
        "token": "token-" + str(uuid.uuid4())[:8],
        "user": {
            "username": username or "operador.centro",
            "role": "operador_centro",
            "center": "Centro Temporal Esperanza - Zona Norte"
        },
        "message": "Acceso concedido"
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
        return jsonify({"error": "status invalido"}), 400

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


@app.route("/api/adults", methods=["GET"])
def list_adults():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM adults ORDER BY registered_at DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/adults", methods=["POST"])
def register_adult():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "name es obligatorio"}), 400

    adult_id = "A-" + uuid.uuid4().hex[:8].upper()
    now = datetime.utcnow().isoformat() + "Z"

    conn = get_db()
    conn.execute("""
        INSERT INTO adults (
            id, name, document_id, phone, relation_sought,
            child_name_sought, center, notes, photo, status, registered_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'buscando', ?)
    """, (
        adult_id,
        data.get("name"),
        data.get("document_id", ""),
        data.get("phone", ""),
        data.get("relation_sought", ""),
        data.get("child_name_sought", ""),
        data.get("center", ""),
        data.get("notes", ""),
        data.get("photo", ""),
        now
    ))
    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "id": adult_id,
        "message": f"Adulto {data.get('name')} registrado correctamente"
    }), 201


@app.route("/api/verify", methods=["POST"])
def record_verification():
    data = request.get_json() or {}
    minor_id = data.get("minor_id")
    similarity = data.get("similarity")
    passed = data.get("passed", False)
    adult_name = data.get("adult_name", "")
    adult_id = data.get("adult_id")

    if not minor_id:
        return jsonify({"error": "minor_id requerido"}), 400

    if passed:
        conn = get_db()
        conn.execute(
            "UPDATE minors SET status = 'reunificado', reunified_at = ? WHERE id = ?",
            (datetime.utcnow().isoformat() + "Z", minor_id)
        )
        if adult_id:
            conn.execute(
                "UPDATE adults SET status = 'reunificado' WHERE id = ?",
                (adult_id,)
            )
        conn.commit()
        conn.close()

    return jsonify({
        "success": True,
        "minor_id": minor_id,
        "adult_id": adult_id,
        "similarity": similarity,
        "passed": passed,
        "adult_name": adult_name,
        "message": "Verificacion registrada en el sistema"
    })


@app.route("/api/admin/clear", methods=["DELETE"])
def clear_all_data():
    conn = get_db()
    cur_m = conn.execute("DELETE FROM minors")
    cur_a = conn.execute("DELETE FROM adults")
    deleted = cur_m.rowcount + cur_a.rowcount
    conn.commit()
    conn.close()
    return jsonify({
        "success": True,
        "deleted": deleted,
        "message": f"Se eliminaron {deleted} registros. Base de datos limpia."
    })


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 60)
    print("  SIRFE Backend")
    print(f"  http://0.0.0.0:{port}")
    print("=" * 60)
    app.run(host="0.0.0.0", port=port, debug=False)