import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'database.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Appointments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_name TEXT NOT NULL,
            doctor_name TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL,
            title TEXT NOT NULL,
            notes TEXT,
            status TEXT DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create Medications table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS medications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            dosage TEXT NOT NULL,
            timing TEXT NOT NULL,
            phone TEXT NOT NULL,
            is_taken INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create Summaries table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            appointment_id INTEGER NOT NULL,
            raw_notes TEXT NOT NULL,
            summary_content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE
        )
    ''')
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

# --- Appointments Helpers ---

def get_all_appointments():
    conn = get_db_connection()
    appointments = conn.execute('SELECT * FROM appointments ORDER BY date ASC, time ASC').fetchall()
    conn.close()
    return [dict(a) for a in appointments]

def add_appointment(patient_name, doctor_name, date, time, title, notes):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO appointments (patient_name, doctor_name, date, time, title, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, 'Pending')
    ''', (patient_name, doctor_name, date, time, title, notes))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def update_appointment_status(appointment_id, status):
    conn = get_db_connection()
    conn.execute('UPDATE appointments SET status = ? WHERE id = ?', (status, appointment_id))
    conn.commit()
    conn.close()

def delete_appointment(appointment_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM appointments WHERE id = ?', (appointment_id,))
    conn.commit()
    conn.close()

# --- Medications Helpers ---

def get_all_medications():
    conn = get_db_connection()
    medications = conn.execute('SELECT * FROM medications ORDER BY created_at DESC').fetchall()
    conn.close()
    return [dict(m) for m in medications]

def add_medication(name, dosage, timing, phone):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO medications (name, dosage, timing, phone, is_taken)
        VALUES (?, ?, ?, ?, 0)
    ''', (name, dosage, timing, phone))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return new_id

def update_medication_compliance(medication_id, is_taken):
    conn = get_db_connection()
    conn.execute('UPDATE medications SET is_taken = ? WHERE id = ?', (1 if is_taken else 0, medication_id))
    conn.commit()
    conn.close()

def delete_medication(medication_id):
    conn = get_db_connection()
    conn.execute('DELETE FROM medications WHERE id = ?', (medication_id,))
    conn.commit()
    conn.close()

# --- Summaries Helpers ---

def get_all_summaries():
    conn = get_db_connection()
    # Join with appointment details to show patient and doctor name in the summaries tab
    summaries = conn.execute('''
        SELECT s.*, a.patient_name, a.doctor_name, a.title as appointment_title, a.date as appointment_date
        FROM summaries s
        JOIN appointments a ON s.appointment_id = a.id
        ORDER BY s.created_at DESC
    ''').fetchall()
    conn.close()
    return [dict(s) for s in summaries]

def add_summary(appointment_id, raw_notes, summary_content):
    conn = get_db_connection()
    cursor = conn.cursor()
    # Check if a summary already exists for this appointment
    existing = conn.execute('SELECT id FROM summaries WHERE appointment_id = ?', (appointment_id,)).fetchone()
    if existing:
        cursor.execute('''
            UPDATE summaries 
            SET raw_notes = ?, summary_content = ?, created_at = CURRENT_TIMESTAMP
            WHERE appointment_id = ?
        ''', (raw_notes, summary_content, appointment_id))
        summary_id = existing['id']
    else:
        cursor.execute('''
            INSERT INTO summaries (appointment_id, raw_notes, summary_content)
            VALUES (?, ?, ?)
        ''', (appointment_id, raw_notes, summary_content))
        summary_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return summary_id

if __name__ == '__main__':
    init_db()
