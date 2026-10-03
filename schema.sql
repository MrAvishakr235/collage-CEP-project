PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'admin')),
  teacher_id TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class_teacher_id INTEGER REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  roll_number INTEGER NOT NULL,
  full_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(class_id, roll_number)
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  attendance_date TEXT NOT NULL,
  session_name TEXT NOT NULL DEFAULT 'Morning',
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, attendance_date, session_name)
);

CREATE TABLE IF NOT EXISTS attendance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
  UNIQUE(attendance_session_id, student_id)
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  created_by INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,
  test_date TEXT NOT NULL,
  total_marks INTEGER NOT NULL CHECK (total_marks > 0),
  question_count INTEGER NOT NULL CHECK (question_count > 0),
  google_form_url TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assessment_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  marks_obtained REAL NOT NULL,
  UNIQUE(test_id, student_id)
);
