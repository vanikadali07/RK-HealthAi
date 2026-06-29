import os
import sys
import logging
from flask import Flask, jsonify, request, render_template
from dotenv import load_dotenv

# Import database helpers
import database

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, template_folder='templates', static_folder='static')

# Initialize DB on start
database.init_db()

# --- External API Setup ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

# Configure Gemini
has_gemini = False
if GEMINI_API_KEY:
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        has_gemini = True
        logger.info("Gemini AI successfully configured.")
    except Exception as e:
        logger.error(f"Error configuring Gemini AI: {e}")

# Configure Twilio
has_twilio = False
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER:
    try:
        from twilio.rest import Client
        twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        has_twilio = True
        logger.info("Twilio SMS client successfully configured.")
    except Exception as e:
        logger.error(f"Error configuring Twilio: {e}")

# --- Configuration Endpoints ---

@app.route('/api/config', methods=['GET'])
def api_get_config():
    global GEMINI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
    global has_gemini, has_twilio
    return jsonify({
        "has_gemini": has_gemini,
        "has_twilio": has_twilio,
        "has_twilio_token": bool(TWILIO_AUTH_TOKEN),
        "twilio_sid": TWILIO_ACCOUNT_SID if TWILIO_ACCOUNT_SID else "",
        "twilio_phone": TWILIO_PHONE_NUMBER if TWILIO_PHONE_NUMBER else ""
    }), 200

@app.route('/api/config', methods=['POST'])
def api_post_config():
    global GEMINI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
    global has_gemini, has_twilio, twilio_client
    
    try:
        data = request.get_json() or {}
        
        if data.get('reset'):
            GEMINI_API_KEY = None
            TWILIO_ACCOUNT_SID = None
            TWILIO_AUTH_TOKEN = None
            TWILIO_PHONE_NUMBER = None
            has_gemini = False
            has_twilio = False
            twilio_client = None
            logger.info("Configuration reset to simulation mode.")
            return jsonify({"success": True}), 200
            
        gemini_key = data.get('gemini_key', '').strip()
        twilio_sid = data.get('twilio_sid', '').strip()
        twilio_token = data.get('twilio_token', '').strip()
        twilio_phone = data.get('twilio_phone', '').strip()
        
        if gemini_key and gemini_key != "••••••••••••••••":
            GEMINI_API_KEY = gemini_key
            
        if twilio_sid:
            TWILIO_ACCOUNT_SID = twilio_sid
            
        if twilio_token and twilio_token != "••••••••••••••••":
            TWILIO_AUTH_TOKEN = twilio_token
            
        if twilio_phone:
            TWILIO_PHONE_NUMBER = twilio_phone
            
        if GEMINI_API_KEY:
            try:
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_API_KEY)
                has_gemini = True
                logger.info("Gemini AI successfully re-configured.")
            except Exception as e:
                has_gemini = False
                logger.error(f"Error re-configuring Gemini AI: {e}")
        else:
            has_gemini = False
            
        if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER:
            try:
                from twilio.rest import Client
                twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
                has_twilio = True
                logger.info("Twilio SMS client successfully re-configured.")
            except Exception as e:
                has_twilio = False
                logger.error(f"Error re-configuring Twilio: {e}")
        else:
            has_twilio = False
            
        return jsonify({"success": True}), 200
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# --- HTML Route ---
@app.route('/')
def index():
    return render_template('index.html')


# --- Appointments Endpoints ---

@app.route('/api/appointments', methods=['GET'])
def api_get_appointments():
    try:
        appointments = database.get_all_appointments()
        return jsonify(appointments), 200
    except Exception as e:
        logger.error(f"Error fetching appointments: {e}")
        return jsonify({"error": "Failed to fetch appointments"}), 500

@app.route('/api/appointments', methods=['POST'])
def api_add_appointment():
    try:
        data = request.get_json() or {}
        patient_name = data.get('patient_name')
        doctor_name = data.get('doctor_name')
        date = data.get('date')
        time = data.get('time')
        title = data.get('title')
        notes = data.get('notes', '')
        
        if not all([patient_name, doctor_name, date, time, title]):
            return jsonify({"error": "Missing required fields"}), 400
            
        new_id = database.add_appointment(patient_name, doctor_name, date, time, title, notes)
        
        # Return the created object
        return jsonify({
            "id": new_id,
            "patient_name": patient_name,
            "doctor_name": doctor_name,
            "date": date,
            "time": time,
            "title": title,
            "notes": notes,
            "status": "Pending"
        }), 201
    except Exception as e:
        logger.error(f"Error adding appointment: {e}")
        return jsonify({"error": "Failed to save appointment"}), 500

@app.route('/api/appointments/<int:id>/status', methods=['PUT'])
def api_update_appointment_status(id):
    try:
        data = request.get_json() or {}
        status = data.get('status')
        if not status:
            return jsonify({"error": "Status required"}), 400
            
        database.update_appointment_status(id, status)
        return jsonify({"message": "Status updated successfully", "id": id, "status": status}), 200
    except Exception as e:
        logger.error(f"Error updating appointment status: {e}")
        return jsonify({"error": "Failed to update status"}), 500

@app.route('/api/appointments/<int:id>', methods=['DELETE'])
def api_delete_appointment(id):
    try:
        database.delete_appointment(id)
        return jsonify({"message": "Appointment deleted successfully", "id": id}), 200
    except Exception as e:
        logger.error(f"Error deleting appointment: {e}")
        return jsonify({"error": "Failed to delete appointment"}), 500


# --- Medications Endpoints ---

@app.route('/api/medications', methods=['GET'])
def api_get_medications():
    try:
        medications = database.get_all_medications()
        return jsonify(medications), 200
    except Exception as e:
        logger.error(f"Error fetching medications: {e}")
        return jsonify({"error": "Failed to fetch medications"}), 500

@app.route('/api/medications', methods=['POST'])
def api_add_medication():
    try:
        data = request.get_json() or {}
        name = data.get('name')
        dosage = data.get('dosage')
        timing = data.get('timing')
        phone = data.get('phone')
        
        if not all([name, dosage, timing, phone]):
            return jsonify({"error": "Missing required fields"}), 400
            
        new_id = database.add_medication(name, dosage, timing, phone)
        return jsonify({
            "id": new_id,
            "name": name,
            "dosage": dosage,
            "timing": timing,
            "phone": phone,
            "is_taken": 0
        }), 201
    except Exception as e:
        logger.error(f"Error adding medication: {e}")
        return jsonify({"error": "Failed to save medication"}), 500

@app.route('/api/medications/<int:id>/compliance', methods=['PUT'])
def api_update_medication_compliance(id):
    try:
        data = request.get_json() or {}
        is_taken = data.get('is_taken')
        if is_taken is None:
            return jsonify({"error": "is_taken state required"}), 400
            
        database.update_medication_compliance(id, is_taken)
        return jsonify({"message": "Compliance updated successfully", "id": id, "is_taken": is_taken}), 200
    except Exception as e:
        logger.error(f"Error updating medication compliance: {e}")
        return jsonify({"error": "Failed to update compliance"}), 500

@app.route('/api/medications/<int:id>', methods=['DELETE'])
def api_delete_medication(id):
    try:
        database.delete_medication(id)
        return jsonify({"message": "Medication deleted successfully", "id": id}), 200
    except Exception as e:
        logger.error(f"Error deleting medication: {e}")
        return jsonify({"error": "Failed to delete medication"}), 500

@app.route('/api/medications/<int:id>/send-sms', methods=['POST'])
def api_send_medication_sms(id):
    try:
        # Find medication from DB
        meds = database.get_all_medications()
        med = next((m for m in meds if m['id'] == id), None)
        if not med:
            return jsonify({"error": "Medication not found"}), 404
            
        sms_text = f"RK Health Reminder: Please take your medication '{med['name']}' ({med['dosage']}) scheduled for the {med['timing']}."
        
        # Verify phone format (simple check)
        phone = med['phone'].strip()
        if not phone.startswith('+'):
            # Assume local US/India for validation, or log warn
            pass
            
        # Send via Twilio if active
        if has_twilio:
            try:
                message = twilio_client.messages.create(
                    body=sms_text,
                    from_=TWILIO_PHONE_NUMBER,
                    to=phone
                )
                logger.info(f"SMS sent successfully to {phone}. SID: {message.sid}")
                return jsonify({
                    "success": True,
                    "mode": "real",
                    "sid": message.sid,
                    "message": f"Real SMS sent successfully to {phone}."
                }), 200
            except Exception as tw_err:
                logger.error(f"Twilio API Error: {tw_err}")
                return jsonify({
                    "success": False,
                    "mode": "real",
                    "error": f"Twilio API Error: {str(tw_err)}",
                    "message": "Failed to send SMS using Twilio. Check settings/credits."
                }), 500
        else:
            # Fallback to simulation mode
            logger.info(f"[SIMULATED SMS] To: {phone} | Body: {sms_text}")
            return jsonify({
                "success": True,
                "mode": "simulated",
                "message": f"Simulated SMS reminder triggered successfully for {phone}.",
                "sms_details": {
                    "recipient": phone,
                    "body": sms_text,
                    "simulation_note": "Twilio API keys not configured. Running in local simulation mode."
                }
            }), 200
    except Exception as e:
        logger.error(f"Error sending SMS: {e}")
        return jsonify({"error": "Failed to process SMS reminder request"}), 500


# --- Summaries Endpoints ---

@app.route('/api/summaries', methods=['GET'])
def api_get_summaries():
    try:
        summaries = database.get_all_summaries()
        return jsonify(summaries), 200
    except Exception as e:
        logger.error(f"Error fetching summaries: {e}")
        return jsonify({"error": "Failed to fetch summaries"}), 500

@app.route('/api/summaries', methods=['POST'])
def api_generate_summary():
    try:
        data = request.get_json() or {}
        appointment_id = data.get('appointment_id')
        raw_notes = data.get('raw_notes')
        
        if not appointment_id or not raw_notes:
            return jsonify({"error": "appointment_id and raw_notes are required"}), 400
            
        # Get appointment details
        appointments = database.get_all_appointments()
        appt = next((a for a in appointments if a['id'] == appointment_id), None)
        if not appt:
            return jsonify({"error": "Associated appointment not found"}), 404
            
        summary_content = ""
        mode = "mock"
        
        if has_gemini:
            try:
                import google.generativeai as genai
                prompt = f"""
You are an expert clinical AI assistant. Summarize the following doctor visit notes into a patient-friendly summary.
The response MUST be written in structured markdown and cover four specific headings:

### Visit Overview
A simple, plain-English summary of what happened during the appointment with Doctor {appt['doctor_name']} for {appt['patient_name']}.

### Diagnosis-style Explanation
A brief, easy-to-understand explanation of the diagnosis or symptoms discussed.

### Medicine Instructions
Clear instructions on what medicines to take, including dosage and when to take them. If none are listed, mention this.

### Follow-up Advice
Next steps, upcoming appointments, and warning signs to watch out for.

Doctor Visit Notes:
{raw_notes}
"""
                model = genai.GenerativeModel('gemini-pro')
                response = model.generate_content(prompt)
                summary_content = response.text
                mode = "ai"
            except Exception as ai_err:
                logger.error(f"Gemini generation error: {ai_err}")
                # Fall through to mock generator
        
        if not summary_content:
            # Fallback heuristic summary generator
            logger.info("Using heuristic/fallback summary generator.")
            summary_content = generate_heuristic_summary(appt, raw_notes)
            mode = "fallback"
            
        # Save to DB
        summary_id = database.add_summary(appointment_id, raw_notes, summary_content)
        
        return jsonify({
            "id": summary_id,
            "appointment_id": appointment_id,
            "raw_notes": raw_notes,
            "summary_content": summary_content,
            "mode": mode,
            "patient_name": appt['patient_name'],
            "doctor_name": appt['doctor_name'],
            "appointment_title": appt['title'],
            "appointment_date": appt['date']
        }), 200
    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        return jsonify({"error": f"Failed to generate summary: {str(e)}"}), 500


def generate_heuristic_summary(appt, notes):
    """
    A smart rule-based parser that reads raw notes and compiles a beautiful structured markdown summary
    if the Gemini API is not configured.
    """
    notes_lower = notes.lower()
    
    # 1. Overview
    overview = f"Patient **{appt['patient_name']}** met with **Dr. {appt['doctor_name']}** on **{appt['date']}** for the consultation '{appt['title']}'. "
    if appt['notes']:
        overview += f"Initial visit note details: \"{appt['notes']}\"."
    
    # 2. Diagnosis detection
    diagnosis = "No specific diagnosis was explicitly detected in the brief logs, but standard health monitoring was recommended."
    diag_keywords = {
        "fever": "Mild viral fever / pyrexia. Rest and hydration are advised.",
        "diabetes": "Type 2 Diabetes Mellitus. Requires blood glucose tracking and dietary control.",
        "hypertension": "High blood pressure (Hypertension). Decreased sodium intake and regular tracking are advised.",
        "flu": "Influenza / Common Cold. Symptomatic treatment and chest monitoring.",
        "headache": "Tension headaches or migraine. Rest in dark environments and hydration.",
        "cough": "Upper respiratory tract congestion. Steam inhalation and throat soothing recommended.",
        "allergy": "Allergic reaction / hypersensitivity. Antihistamines advised, avoid allergens."
    }
    for kw, desc in diag_keywords.items():
        if kw in notes_lower:
            diagnosis = f"Symptoms or diagnosis related to **{kw.capitalize()}** detected: {desc}"
            break
            
    # 3. Medicine instructions extraction
    medicines = []
    lines = notes.split('\n')
    for line in lines:
        line_lower = line.lower()
        if any(keyword in line_lower for keyword in ["mg", "tablet", "pill", "capsule", "syrup", "dose", "take", "twice", "daily"]):
            medicines.append(line.strip())
            
    if medicines:
        meds_text = "Based on the visit notes, the following medication instructions were identified:\n"
        for m in medicines:
            meds_text += f"- **{m}**\n"
    else:
        meds_text = "No specific prescription instructions were detected in the text. Please follow your standard medication dashboard schedules, or clarify with Dr. " + appt['doctor_name'] + "."
        
    # 4. Follow up advice
    follow_up = "Schedule a routine check-up in 2-4 weeks if symptoms persist."
    if "follow up" in notes_lower or "return" in notes_lower or "next week" in notes_lower:
        follow_up = "A follow-up visit is recommended as noted in the doctor logs. Please keep an eye on symptoms and report updates."
    if "emergency" in notes_lower or "severe" in notes_lower or "chest pain" in notes_lower:
        follow_up = "**WARNING:** If you experience severe chest pains, extreme difficulty breathing, or high fevers, seek emergency clinical care immediately."

    summary = f"""### Visit Overview
{overview}

### Diagnosis-style Explanation
{diagnosis}

### Medicine Instructions
{meds_text}

### Follow-up Advice
{follow_up}

*(Note: This summary was created using the RK Health smart rule-based parser as the Gemini API Key is not configured in .env)*"""
    return summary


if __name__ == '__main__':
    # Start web server on port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)
