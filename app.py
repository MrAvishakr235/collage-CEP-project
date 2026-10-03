"""Flask backend for the Community Engaging Project school portal prototype."""

from __future__ import annotations

import os
import sqlite3
from datetime import date
from pathlib import Path
from typing import Any

from flask import Flask, abort, g, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "school_management.db"
PAGES = {
    "login.html", "reset-password.html", "logout.html", "profile.html", "change-password.html",
    "teacher-dashboard.html", "teacher-attendance.html", "teacher-attendance-records.html",
    "teacher-test.html", "teacher-test-records.html", "admin-dashboard.html", "admin-classes.html",
    "admin-class-details.html", "admin-teachers.html", "admin-students.html", "admin-attendance.html",
    "admin-tests.html", "admin-reports.html",
}
TEACHER_PAGES = {"teacher-dashboard.html", "teacher-attendance.html", "teacher-attendance-records.html", "teacher-test.html", "teacher-test-records.html"}
ADMIN_PAGES = {"admin-dashboard.html", "admin-classes.html", "admin-class-details.html", "admin-teachers.html", "admin-students.html", "admin-attendance.html", "admin-tests.html", "admin-reports.html"}


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_: Any = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def current_user() -> sqlite3.Row | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ? AND active = 1", (user_id,)).fetchone()


def api_user(*roles: str) -> sqlite3.Row:
    user = current_user()
    if user is None:
        abort(401, "Please log in first.")
    if roles and user["role"] not in roles:
        abort(403, "You do not have permission for this action.")
    return user


def class_for_teacher(user_id: int) -> sqlite3.Row | None:
    return get_db().execute("SELECT * FROM classes WHERE class_teacher_id = ? AND active = 1", (user_id,)).fetchone()


def request_payload() -> dict[str, Any]:
    return request.get_json(silent=True) or request.form.to_dict()


def as_active(value: Any, default: bool = True) -> int:
    if value is None:
        return 1 if default else 0
    return 1 if str(value).lower() in {"1", "true", "yes", "on"} else 0


def assign_class_teacher(db: sqlite3.Connection, class_id: int, teacher_id: int | None) -> None:
    """A class has one active class teacher and a teacher can lead one active class."""
    if teacher_id is not None:
        teacher = db.execute("SELECT id FROM users WHERE id = ? AND role = 'teacher' AND active = 1", (teacher_id,)).fetchone()
        if teacher is None:
            abort(400, "Choose an active teacher for this class.")
        db.execute("UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ?", (teacher_id,))
    db.execute("UPDATE classes SET class_teacher_id = ? WHERE id = ?", (teacher_id, class_id))


def ensure_demo_staff(db: sqlite3.Connection) -> None:
    """Keep the clearly labelled demonstration school at 18 teachers."""
    current_count = db.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'").fetchone()["count"]
    for number in range(current_count + 1, 19):
        db.execute(
            """INSERT OR IGNORE INTO users (login_id, password_hash, full_name, role, teacher_id)
               VALUES (?, ?, ?, 'teacher', ?)""",
            (f"teacher{number:02d}", generate_password_hash("teacher123"), f"Class Teacher {number:02d} Placeholder", f"TCH-{number:03d}"),
        )
    staff = db.execute("SELECT id FROM users WHERE role = 'teacher' ORDER BY id").fetchall()
    classes = db.execute("SELECT id, code FROM classes ORDER BY id").fetchall()
    for index, class_row in enumerate(classes):
        teacher = staff[0] if class_row["code"] == "grade-7" else staff[(index + 1) % len(staff)]
        db.execute("UPDATE classes SET class_teacher_id = ? WHERE id = ?", (teacher["id"], class_row["id"]))


def migrate_schema(db: sqlite3.Connection) -> None:
    """Apply safe additive migrations to databases created by earlier prototypes."""
    user_columns = {row["name"] for row in db.execute("PRAGMA table_info(users)").fetchall()}
    if "active" not in user_columns:
        db.execute("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1")
    class_columns = {row["name"] for row in db.execute("PRAGMA table_info(classes)").fetchall()}
    if "active" not in class_columns:
        db.execute("ALTER TABLE classes ADD COLUMN active INTEGER NOT NULL DEFAULT 1")


def initialise_database() -> None:
    db = get_db()
    db.executescript((BASE_DIR / "schema.sql").read_text(encoding="utf-8"))
    migrate_schema(db)
    existing = db.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
    if existing:
        db.commit()
        return

    db.execute(
        """INSERT INTO users (login_id, password_hash, full_name, role, teacher_id)
           VALUES (?, ?, ?, 'admin', ?)""",
        ("admin01", generate_password_hash("admin123"), "Principal Placeholder", "ADM-001"),
    )
    db.execute(
        """INSERT INTO users (login_id, password_hash, full_name, role, teacher_id)
           VALUES (?, ?, ?, 'teacher', ?)""",
        ("teacher01", generate_password_hash("teacher123"), "Mrs. Teacher Placeholder", "TCH-001"),
    )
    teacher_id = db.execute("SELECT id FROM users WHERE login_id = 'teacher01'").fetchone()["id"]
    for grade in range(1, 11):
        db.execute(
            "INSERT INTO classes (code, name, class_teacher_id) VALUES (?, ?, ?)",
            (f"grade-{grade}", f"Grade {grade}", teacher_id if grade == 7 else None),
        )

    sample_names = ["Aarav Placeholder", "Bhavna Placeholder", "Chirag Placeholder", "Divya Placeholder", "Eshan Placeholder"]
    for grade in range(1, 11):
        class_id = db.execute("SELECT id FROM classes WHERE code = ?", (f"grade-{grade}",)).fetchone()["id"]
        for roll in range(1, 43):
            name = sample_names[roll - 1] if grade == 7 and roll <= len(sample_names) else f"Grade {grade} Student {roll:02d}"
            db.execute("INSERT INTO students (class_id, roll_number, full_name) VALUES (?, ?, ?)", (class_id, roll, name))

    grade_7 = db.execute("SELECT id FROM classes WHERE code = 'grade-7'").fetchone()["id"]
    db.execute(
        """INSERT INTO tests (class_id, created_by, title, subject, test_date, total_marks, question_count, google_form_url, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (grade_7, teacher_id, "Fractions Checkpoint", "Mathematics", "2026-09-18", 20, 10, "https://docs.google.com/forms/", "Demo test record"),
    )
    db.execute(
        """INSERT INTO tests (class_id, created_by, title, subject, test_date, total_marks, question_count, google_form_url, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (grade_7, teacher_id, "Plants and Their Uses", "Science", "2026-09-12", 15, 8, "https://docs.google.com/forms/", "Demo test record"),
    )
    ensure_demo_staff(db)
    db.commit()


def create_app() -> Flask:
    app = Flask(__name__, template_folder=str(BASE_DIR))
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "change-this-prototype-secret-before-deployment"),
        DATABASE=str(DATABASE_PATH),
        JSON_SORT_KEYS=False,
    )
    app.teardown_appcontext(close_db)
    with app.app_context():
        initialise_database()

    @app.errorhandler(401)
    @app.errorhandler(403)
    @app.errorhandler(404)
    def handle_api_error(error: Any):
        if request.path.startswith("/api/"):
            return jsonify(error=str(error.description)), error.code
        return render_template("login.html"), error.code

    @app.get("/")
    def index():
        return redirect(url_for("page", page="login.html"))

    @app.get("/styles.css")
    def stylesheet():
        return send_from_directory(BASE_DIR, "styles.css", mimetype="text/css")

    @app.get("/app.js")
    def javascript():
        return send_from_directory(BASE_DIR, "app.js", mimetype="application/javascript")

    @app.get("/<page>")
    def page(page: str):
        if page not in PAGES:
            abort(404)
        user = current_user()
        if page in TEACHER_PAGES and (user is None or user["role"] != "teacher"):
            return redirect(url_for("page", page="login.html"))
        if page in ADMIN_PAGES and (user is None or user["role"] != "admin"):
            return redirect(url_for("page", page="login.html"))
        if page in {"profile.html", "change-password.html"} and user is None:
            return redirect(url_for("page", page="login.html"))
        return render_template(page)

    @app.post("/api/login")
    def login():
        payload = request.get_json(silent=True) or request.form
        login_id = str(payload.get("login_id", "")).strip().lower()
        password = str(payload.get("password", ""))
        selected_role = str(payload.get("role", ""))
        user = get_db().execute("SELECT * FROM users WHERE login_id = ?", (login_id,)).fetchone()
        if user is None or not user["active"] or not check_password_hash(user["password_hash"], password):
            return jsonify(error="Invalid login ID or password."), 401
        if selected_role and user["role"] != selected_role:
            return jsonify(error="The selected role does not match this account."), 403
        session.clear()
        session["user_id"] = user["id"]
        return jsonify(user={"id": user["id"], "name": user["full_name"], "role": user["role"]}, redirect="admin-dashboard.html" if user["role"] == "admin" else "teacher-dashboard.html")

    @app.post("/api/logout")
    def logout():
        session.clear()
        return jsonify(message="Logged out.")

    @app.get("/api/me")
    def me():
        user = api_user()
        class_row = class_for_teacher(user["id"]) if user["role"] == "teacher" else None
        return jsonify(user={"id": user["id"], "login_id": user["login_id"], "name": user["full_name"], "role": user["role"], "teacher_id": user["teacher_id"], "class": row_dict(class_row)})

    @app.route("/api/profile", methods=["GET", "PUT"])
    def profile():
        user = api_user()
        if request.method == "GET":
            return jsonify(user=row_dict(user))
        payload = request.get_json(silent=True) or request.form
        full_name = str(payload.get("full_name", "")).strip()
        if not full_name:
            return jsonify(error="Full name is required."), 400
        get_db().execute("UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?", (full_name, payload.get("email") or None, payload.get("phone") or None, user["id"]))
        get_db().commit()
        return jsonify(message="Profile updated.")

    @app.post("/api/change-password")
    def change_password():
        user = api_user()
        payload = request.get_json(silent=True) or request.form
        if not check_password_hash(user["password_hash"], str(payload.get("current_password", ""))):
            return jsonify(error="Current password is incorrect."), 400
        new_password = str(payload.get("new_password", ""))
        if len(new_password) < 8:
            return jsonify(error="New password must contain at least 8 characters."), 400
        get_db().execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(new_password), user["id"]))
        get_db().commit()
        return jsonify(message="Password changed.")

    @app.post("/api/reset-password")
    def reset_password():
        # Deliberately generic: production should use a verified school-admin reset workflow.
        return jsonify(message="If the login ID is registered, a reset request has been recorded.")

    @app.route("/api/admin/teachers", methods=["GET", "POST"])
    def admin_teachers():
        api_user("admin")
        db = get_db()
        if request.method == "GET":
            query_text = request.args.get("query", "").strip()
            class_code = request.args.get("class", "").strip()
            query = """SELECT u.id, u.login_id, u.full_name, u.teacher_id, u.email, u.phone, u.active,
                              c.code AS class_code, c.name AS class_name
                       FROM users u LEFT JOIN classes c ON c.class_teacher_id = u.id
                       WHERE u.role = 'teacher'"""
            params: list[Any] = []
            if query_text:
                query += " AND (u.full_name LIKE ? OR u.teacher_id LIKE ? OR u.login_id LIKE ?)"
                params.extend([f"%{query_text}%"] * 3)
            if class_code:
                query += " AND c.code = ?"
                params.append(class_code)
            query += " ORDER BY u.active DESC, u.full_name COLLATE NOCASE"
            return jsonify(teachers=[dict(row) for row in db.execute(query, params).fetchall()])

        payload = request_payload()
        full_name = str(payload.get("full_name", "")).strip()
        login_id = str(payload.get("login_id", "")).strip().lower()
        password = str(payload.get("password", ""))
        teacher_id = str(payload.get("teacher_id", "")).strip()
        if not full_name or not login_id or len(password) < 8:
            return jsonify(error="Name, login ID, and a password of at least 8 characters are required."), 400
        if not teacher_id:
            number = db.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'teacher'").fetchone()["count"] + 1
            teacher_id = f"TCH-{number:03d}"
        try:
            cursor = db.execute(
                """INSERT INTO users (login_id, password_hash, full_name, role, teacher_id, email, phone, active)
                   VALUES (?, ?, ?, 'teacher', ?, ?, ?, 1)""",
                (login_id, generate_password_hash(password), full_name, teacher_id, payload.get("email") or None, payload.get("phone") or None),
            )
            class_code = str(payload.get("class_code", "")).strip()
            if class_code:
                class_row = db.execute("SELECT id FROM classes WHERE code = ? AND active = 1", (class_code,)).fetchone()
                if class_row is None:
                    db.rollback()
                    return jsonify(error="Choose an active Grade 1-10 class."), 400
                assign_class_teacher(db, class_row["id"], cursor.lastrowid)
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="Teacher ID or login ID already exists."), 409
        return jsonify(message="Teacher added successfully.", id=cursor.lastrowid), 201

    @app.route("/api/admin/teachers/<int:teacher_id>", methods=["PUT", "DELETE"])
    def admin_teacher_detail(teacher_id: int):
        admin = api_user("admin")
        db = get_db()
        teacher = db.execute("SELECT * FROM users WHERE id = ? AND role = 'teacher'", (teacher_id,)).fetchone()
        if teacher is None:
            abort(404, "Teacher not found.")
        if request.method == "DELETE":
            db.execute("UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ?", (teacher_id,))
            db.execute("UPDATE users SET active = 0 WHERE id = ?", (teacher_id,))
            db.commit()
            return jsonify(message="Teacher account deactivated.")

        payload = request_payload()
        full_name = str(payload.get("full_name", teacher["full_name"])).strip()
        login_id = str(payload.get("login_id", teacher["login_id"])).strip().lower()
        new_teacher_id = str(payload.get("teacher_id", teacher["teacher_id"])).strip()
        if not full_name or not login_id or not new_teacher_id:
            return jsonify(error="Name, login ID, and teacher ID are required."), 400
        try:
            db.execute(
                """UPDATE users SET full_name=?, login_id=?, teacher_id=?, email=?, phone=?, active=? WHERE id=?""",
                (full_name, login_id, new_teacher_id, payload.get("email") or None, payload.get("phone") or None, as_active(payload.get("active"), bool(teacher["active"])), teacher_id),
            )
            password = str(payload.get("password", ""))
            if password:
                if len(password) < 8:
                    db.rollback()
                    return jsonify(error="Replacement password must contain at least 8 characters."), 400
                db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (generate_password_hash(password), teacher_id))
            class_code = str(payload.get("class_code", "")).strip()
            db.execute("UPDATE classes SET class_teacher_id = NULL WHERE class_teacher_id = ?", (teacher_id,))
            if class_code and as_active(payload.get("active"), bool(teacher["active"])):
                class_row = db.execute("SELECT id FROM classes WHERE code = ? AND active = 1", (class_code,)).fetchone()
                if class_row is None:
                    db.rollback()
                    return jsonify(error="Choose an active Grade 1-10 class."), 400
                assign_class_teacher(db, class_row["id"], teacher_id)
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="Teacher ID or login ID already exists."), 409
        return jsonify(message="Teacher updated successfully.")

    @app.route("/api/admin/classes", methods=["GET", "POST"])
    def admin_classes():
        api_user("admin")
        db = get_db()
        if request.method == "GET":
            rows = db.execute(
                """SELECT c.id, c.code, c.name, c.active, c.class_teacher_id, u.full_name AS teacher_name,
                          u.teacher_id, COUNT(s.id) AS student_count
                   FROM classes c
                   LEFT JOIN users u ON u.id = c.class_teacher_id
                   LEFT JOIN students s ON s.class_id = c.id AND s.active = 1
                   GROUP BY c.id ORDER BY c.id"""
            ).fetchall()
            return jsonify(classes=[dict(row) for row in rows])
        payload = request_payload()
        code = str(payload.get("code", "")).strip().lower()
        if code not in {f"grade-{number}" for number in range(1, 11)}:
            return jsonify(error="Classes must use one of the existing Grade 1-10 codes."), 400
        name = str(payload.get("name", code.replace("grade-", "Grade "))).strip()
        existing = db.execute("SELECT * FROM classes WHERE code = ?", (code,)).fetchone()
        if existing and existing["active"]:
            return jsonify(error="That grade already exists. Edit it instead."), 409
        if existing:
            db.execute("UPDATE classes SET name = ?, active = 1 WHERE id = ?", (name, existing["id"]))
            class_id = existing["id"]
        else:
            class_id = db.execute("INSERT INTO classes (code, name, active) VALUES (?, ?, 1)", (code, name)).lastrowid
        teacher_value = str(payload.get("teacher_id", "")).strip()
        if teacher_value:
            assign_class_teacher(db, class_id, int(teacher_value))
        db.commit()
        return jsonify(message="Grade activated successfully.", id=class_id), 201

    @app.route("/api/admin/classes/<int:class_id>", methods=["GET", "PUT", "DELETE"])
    def admin_class_detail(class_id: int):
        api_user("admin")
        db = get_db()
        class_row = db.execute("SELECT * FROM classes WHERE id = ?", (class_id,)).fetchone()
        if class_row is None:
            abort(404, "Class not found.")
        if request.method == "GET":
            details = db.execute(
                """SELECT c.id, c.code, c.name, c.active, c.class_teacher_id, u.full_name AS teacher_name,
                          COUNT(s.id) AS student_count
                   FROM classes c LEFT JOIN users u ON u.id = c.class_teacher_id
                   LEFT JOIN students s ON s.class_id = c.id AND s.active = 1
                   WHERE c.id = ? GROUP BY c.id""", (class_id,)
            ).fetchone()
            students = db.execute(
                "SELECT id, roll_number, full_name FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_number LIMIT 12",
                (class_id,),
            ).fetchall()
            tests = db.execute(
                "SELECT title, subject, test_date, total_marks, google_form_url FROM tests WHERE class_id = ? ORDER BY test_date DESC, id DESC LIMIT 8",
                (class_id,),
            ).fetchall()
            latest_attendance = db.execute(
                """SELECT attendance_date,
                          SUM(CASE WHEN ae.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                          SUM(CASE WHEN ae.status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                   FROM attendance_sessions a LEFT JOIN attendance_entries ae ON ae.attendance_session_id = a.id
                   WHERE a.class_id = ? GROUP BY a.id ORDER BY attendance_date DESC LIMIT 1""",
                (class_id,),
            ).fetchone()
            return jsonify(class_record=dict(details), students=[dict(row) for row in students], tests=[dict(row) for row in tests], latest_attendance=row_dict(latest_attendance))
        if request.method == "DELETE":
            db.execute("UPDATE classes SET active = 0, class_teacher_id = NULL WHERE id = ?", (class_id,))
            db.commit()
            return jsonify(message="Grade deactivated. Student records were retained.")
        payload = request_payload()
        name = str(payload.get("name", class_row["name"])).strip()
        if not name:
            return jsonify(error="Grade name is required."), 400
        active = as_active(payload.get("active"), bool(class_row["active"]))
        db.execute("UPDATE classes SET name = ?, active = ? WHERE id = ?", (name, active, class_id))
        teacher_value = str(payload.get("teacher_id", "")).strip()
        if teacher_value and active:
            assign_class_teacher(db, class_id, int(teacher_value))
        elif not teacher_value:
            db.execute("UPDATE classes SET class_teacher_id = NULL WHERE id = ?", (class_id,))
        db.commit()
        return jsonify(message="Grade updated successfully.")

    @app.get("/api/admin/classes/code/<class_code>")
    def admin_class_by_code(class_code: str):
        api_user("admin")
        class_row = get_db().execute("SELECT id FROM classes WHERE code = ?", (class_code,)).fetchone()
        if class_row is None:
            abort(404, "Class not found.")
        return admin_class_detail(class_row["id"])

    @app.route("/api/admin/students", methods=["GET", "POST"])
    def admin_students():
        api_user("admin")
        db = get_db()
        if request.method == "GET":
            class_code = request.args.get("class", "").strip()
            query_text = request.args.get("query", "").strip()
            query = """SELECT s.id, s.roll_number, s.full_name, s.active, c.id AS class_id, c.code AS class_code, c.name AS class_name
                       FROM students s JOIN classes c ON c.id = s.class_id WHERE 1 = 1"""
            params: list[Any] = []
            if class_code:
                query += " AND c.code = ?"
                params.append(class_code)
            if query_text:
                query += " AND (s.full_name LIKE ? OR CAST(s.roll_number AS TEXT) LIKE ?)"
                params.extend([f"%{query_text}%"] * 2)
            query += " ORDER BY s.active DESC, c.id, s.roll_number"
            return jsonify(students=[dict(row) for row in db.execute(query, params).fetchall()])
        payload = request_payload()
        class_row = db.execute("SELECT id FROM classes WHERE code = ? AND active = 1", (str(payload.get("class_code", "")).strip(),)).fetchone()
        full_name = str(payload.get("full_name", "")).strip()
        try:
            roll_number = int(payload.get("roll_number", 0))
        except (TypeError, ValueError):
            roll_number = 0
        if class_row is None or not full_name or roll_number < 1:
            return jsonify(error="Student name, an active grade, and a valid roll number are required."), 400
        try:
            student_id = db.execute("INSERT INTO students (class_id, roll_number, full_name, active) VALUES (?, ?, ?, 1)", (class_row["id"], roll_number, full_name)).lastrowid
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="That roll number is already used in this grade."), 409
        return jsonify(message="Student added successfully.", id=student_id), 201

    @app.route("/api/admin/students/<int:student_id>", methods=["PUT", "DELETE"])
    def admin_student_detail(student_id: int):
        api_user("admin")
        db = get_db()
        student = db.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
        if student is None:
            abort(404, "Student not found.")
        if request.method == "DELETE":
            db.execute("UPDATE students SET active = 0 WHERE id = ?", (student_id,))
            db.commit()
            return jsonify(message="Student record deactivated.")
        payload = request_payload()
        class_row = db.execute("SELECT id FROM classes WHERE code = ? AND active = 1", (str(payload.get("class_code", "")).strip(),)).fetchone()
        full_name = str(payload.get("full_name", "")).strip()
        try:
            roll_number = int(payload.get("roll_number", 0))
        except (TypeError, ValueError):
            roll_number = 0
        if class_row is None or not full_name or roll_number < 1:
            return jsonify(error="Student name, an active grade, and a valid roll number are required."), 400
        try:
            db.execute("UPDATE students SET class_id = ?, roll_number = ?, full_name = ?, active = ? WHERE id = ?", (class_row["id"], roll_number, full_name, as_active(payload.get("active"), bool(student["active"])), student_id))
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return jsonify(error="That roll number is already used in this grade."), 409
        return jsonify(message="Student updated successfully.")

    @app.get("/api/students")
    def students():
        user = api_user("teacher", "admin")
        if user["role"] == "teacher":
            class_row = class_for_teacher(user["id"])
        else:
            class_row = get_db().execute("SELECT * FROM classes WHERE code = ?", (request.args.get("class", "grade-7"),)).fetchone()
        if class_row is None:
            return jsonify(error="Class not found."), 404
        roster = get_db().execute(
            "SELECT id, roll_number, full_name FROM students WHERE class_id = ? AND active = 1 ORDER BY roll_number",
            (class_row["id"],),
        ).fetchall()
        return jsonify(class_name=class_row["name"], students=[dict(row) for row in roster])

    @app.route("/api/attendance", methods=["GET", "POST"])
    def attendance():
        user = api_user("teacher", "admin")
        db = get_db()
        if request.method == "GET":
            class_code = request.args.get("class", "grade-7" if user["role"] == "teacher" else "")
            params: list[Any] = []
            query = """SELECT a.attendance_date, c.name AS class_name, u.full_name AS submitted_by,
                         SUM(CASE WHEN ae.status = 'present' THEN 1 ELSE 0 END) AS present_count,
                         SUM(CASE WHEN ae.status = 'absent' THEN 1 ELSE 0 END) AS absent_count
                       FROM attendance_sessions a
                       JOIN classes c ON c.id = a.class_id
                       JOIN users u ON u.id = a.submitted_by
                       LEFT JOIN attendance_entries ae ON ae.attendance_session_id = a.id"""
            if class_code:
                query += " WHERE c.code = ?"
                params.append(class_code)
            query += " GROUP BY a.id ORDER BY a.attendance_date DESC"
            return jsonify(records=[dict(row) for row in db.execute(query, params).fetchall()])
        if user["role"] == "teacher":
            class_row = class_for_teacher(user["id"])
        else:
            class_row = db.execute("SELECT * FROM classes WHERE name = ?", ((request.get_json(silent=True) or request.form).get("class_name", ""),)).fetchone()
        if class_row is None:
            return jsonify(error="No class is assigned to this teacher."), 400
        payload = request.get_json(silent=True) or {}
        attendance_date = str(payload.get("attendance_date", date.today().isoformat()))
        entries = payload.get("entries", [])
        if not entries:
            return jsonify(error="At least one attendance entry is required."), 400
        session_row = db.execute("SELECT id FROM attendance_sessions WHERE class_id = ? AND attendance_date = ? AND session_name = 'Morning'", (class_row["id"], attendance_date)).fetchone()
        if session_row:
            attendance_id = session_row["id"]
            db.execute("DELETE FROM attendance_entries WHERE attendance_session_id = ?", (attendance_id,))
            db.execute("UPDATE attendance_sessions SET submitted_by = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?", (user["id"], attendance_id))
        else:
            cursor = db.execute("INSERT INTO attendance_sessions (class_id, attendance_date, submitted_by) VALUES (?, ?, ?)", (class_row["id"], attendance_date, user["id"]))
            attendance_id = cursor.lastrowid
        student_ids = {row["id"] for row in db.execute("SELECT id FROM students WHERE class_id = ?", (class_row["id"],)).fetchall()}
        clean_entries = [(attendance_id, int(entry["studentId"]), entry["status"]) for entry in entries if int(entry.get("studentId", 0)) in student_ids and entry.get("status") in {"present", "absent"}]
        db.executemany("INSERT INTO attendance_entries (attendance_session_id, student_id, status) VALUES (?, ?, ?)", clean_entries)
        db.commit()
        return jsonify(message="Attendance submitted successfully.", attendance_id=attendance_id)

    @app.route("/api/tests", methods=["GET", "POST"])
    def tests():
        user = api_user("teacher", "admin")
        db = get_db()
        if request.method == "GET":
            query = """SELECT t.*, c.name AS class_name, c.code AS class_code, u.full_name AS teacher_name
                       FROM tests t JOIN classes c ON c.id = t.class_id JOIN users u ON u.id = t.created_by"""
            params: list[Any] = []
            if user["role"] == "teacher":
                query += " WHERE t.created_by = ?"
                params.append(user["id"])
            query += " ORDER BY t.test_date DESC, t.id DESC"
            return jsonify(tests=[dict(row) for row in db.execute(query, params).fetchall()])
        if user["role"] != "teacher":
            abort(403, "Only class teachers can create tests.")
        payload = request.get_json(silent=True) or {}
        class_row = class_for_teacher(user["id"])
        required = ("title", "subject", "test_date", "total_marks", "question_count", "google_form_url")
        if class_row is None or any(not payload.get(field) for field in required):
            return jsonify(error="Please complete every required test field."), 400
        cursor = db.execute(
            """INSERT INTO tests (class_id, created_by, title, subject, test_date, total_marks, question_count, google_form_url, description)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (class_row["id"], user["id"], payload["title"].strip(), payload["subject"].strip(), payload["test_date"], int(payload["total_marks"]), int(payload["question_count"]), payload["google_form_url"].strip(), payload.get("description", "").strip()),
        )
        db.commit()
        return jsonify(message="Test saved successfully.", id=cursor.lastrowid), 201

    @app.route("/api/tests/<int:test_id>", methods=["PUT", "DELETE"])
    def test_detail(test_id: int):
        user = api_user("teacher")
        db = get_db()
        test = db.execute("SELECT * FROM tests WHERE id = ? AND created_by = ?", (test_id, user["id"])).fetchone()
        if test is None:
            abort(404, "Test record not found.")
        if request.method == "DELETE":
            db.execute("DELETE FROM tests WHERE id = ?", (test_id,))
            db.commit()
            return jsonify(message="Test record deleted.")
        payload = request.get_json(silent=True) or {}
        db.execute(
            """UPDATE tests SET title=?, subject=?, test_date=?, total_marks=?, question_count=?, google_form_url=?, description=? WHERE id=?""",
            (payload["title"].strip(), payload["subject"].strip(), payload["test_date"], int(payload["total_marks"]), int(payload["question_count"]), payload["google_form_url"].strip(), payload.get("description", "").strip(), test_id),
        )
        db.commit()
        return jsonify(message="Test details updated.")

    @app.get("/api/dashboard")
    def dashboard():
        user = api_user()
        db = get_db()
        if user["role"] == "teacher":
            class_row = class_for_teacher(user["id"])
            if class_row is None:
                return jsonify(class_name=None, students=0, tests=db.execute("SELECT COUNT(*) AS c FROM tests WHERE created_by = ?", (user["id"],)).fetchone()["c"], assignment_message="No active grade is currently assigned to this teacher.")
            return jsonify(class_name=class_row["name"], students=db.execute("SELECT COUNT(*) AS c FROM students WHERE class_id = ? AND active = 1", (class_row["id"],)).fetchone()["c"], tests=db.execute("SELECT COUNT(*) AS c FROM tests WHERE created_by = ?", (user["id"],)).fetchone()["c"])
        return jsonify(students=db.execute("SELECT COUNT(*) AS c FROM students WHERE active = 1").fetchone()["c"], teachers=db.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'teacher' AND active = 1").fetchone()["c"], classes=db.execute("SELECT COUNT(*) AS c FROM classes WHERE active = 1").fetchone()["c"], tests=db.execute("SELECT COUNT(*) AS c FROM tests").fetchone()["c"])

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
