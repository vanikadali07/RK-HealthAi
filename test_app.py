import unittest
import json
import os
import sys

# Add current path to sys path to import app and database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import app
import database

class RKHealthTestCase(unittest.TestCase):

    def setUp(self):
        # Configure app for testing
        app.app.config['TESTING'] = True
        self.client = app.app.test_client()
        
        # Reset globals in app.py to prevent test pollution
        app.GEMINI_API_KEY = None
        app.TWILIO_ACCOUNT_SID = None
        app.TWILIO_AUTH_TOKEN = None
        app.TWILIO_PHONE_NUMBER = None
        app.has_gemini = False
        app.has_twilio = False
        app.twilio_client = None
        
        # Make sure we use a clean database structure for testing
        # We override DATABASE_PATH in database module to use a test db file
        self.original_db = database.DATABASE_PATH
        database.DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'test_database.db')
        
        # Init test DB tables
        database.init_db()

    def tearDown(self):
        # Clean up database file after test
        if os.path.exists(database.DATABASE_PATH):
            try:
                os.remove(database.DATABASE_PATH)
            except PermissionError:
                pass
        database.DATABASE_PATH = self.original_db

    def test_index_route(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'RK Health', response.data)

    def test_appointment_crud(self):
        # 1. Verify table is empty initially
        response = self.client.get('/api/appointments')
        self.assertEqual(response.status_code, 200)
        appts = json.loads(response.data.decode('utf-8'))
        self.assertEqual(len(appts), 0)

        # 2. Add an appointment
        appt_payload = {
            "patient_name": "John Doe",
            "doctor_name": "Smith",
            "date": "2026-07-01",
            "time": "10:30",
            "title": "General Consultation",
            "notes": "Feeling minor headache and sinus pain."
        }
        response = self.client.post('/api/appointments', 
                                    data=json.dumps(appt_payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 201)
        created = json.loads(response.data.decode('utf-8'))
        self.assertIn("id", created)
        self.assertEqual(created["patient_name"], "John Doe")
        self.assertEqual(created["status"], "Pending")
        appt_id = created["id"]

        # 3. Check Status Update
        status_payload = { "status": "Checked In" }
        response = self.client.put(f'/api/appointments/{appt_id}/status',
                                   data=json.dumps(status_payload),
                                   content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        # Verify status changed
        response = self.client.get('/api/appointments')
        appts = json.loads(response.data.decode('utf-8'))
        self.assertEqual(len(appts), 1)
        self.assertEqual(appts[0]["status"], "Checked In")

        # 4. Clean up / Delete
        response = self.client.delete(f'/api/appointments/{appt_id}')
        self.assertEqual(response.status_code, 200)
        
        # Verify deletion
        response = self.client.get('/api/appointments')
        appts = json.loads(response.data.decode('utf-8'))
        self.assertEqual(len(appts), 0)

    def test_medication_crud_and_sms(self):
        # 1. Add medication
        med_payload = {
            "name": "Ibuprofen",
            "dosage": "400mg",
            "timing": "Afternoon",
            "phone": "+12345678900"
        }
        response = self.client.post('/api/medications', 
                                    data=json.dumps(med_payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 201)
        created = json.loads(response.data.decode('utf-8'))
        med_id = created["id"]
        self.assertEqual(created["name"], "Ibuprofen")
        self.assertEqual(created["is_taken"], 0)

        # 2. Check compliance toggle
        compliance_payload = { "is_taken": True }
        response = self.client.put(f'/api/medications/{med_id}/compliance',
                                   data=json.dumps(compliance_payload),
                                   content_type='application/json')
        self.assertEqual(response.status_code, 200)

        # Verify compliance updated
        response = self.client.get('/api/medications')
        meds = json.loads(response.data.decode('utf-8'))
        self.assertEqual(meds[0]["is_taken"], 1)

        # 3. Test send SMS simulation
        response = self.client.post(f'/api/medications/{med_id}/send-sms')
        self.assertEqual(response.status_code, 200)
        sms_data = json.loads(response.data.decode('utf-8'))
        self.assertTrue(sms_data["success"])
        self.assertEqual(sms_data["mode"], "simulated") # Default without env keys

    def test_ai_summary_generation_and_fallback(self):
        # 1. Add an appointment to reference
        appt_payload = {
            "patient_name": "Jane Doe",
            "doctor_name": "Alice",
            "date": "2026-07-02",
            "time": "14:00",
            "title": "Diabetes Follow-up",
            "notes": "Patient reports blood sugars are stable."
        }
        response = self.client.post('/api/appointments', 
                                    data=json.dumps(appt_payload),
                                    content_type='application/json')
        created = json.loads(response.data.decode('utf-8'))
        appt_id = created["id"]

        # 2. Generate summary using raw notes (triggers heuristic generator fallback)
        summary_payload = {
            "appointment_id": appt_id,
            "raw_notes": "Patient discussed type 2 diabetes. Instructions: take metformin 500mg daily. Follow up next week."
        }
        response = self.client.post('/api/summaries',
                                    data=json.dumps(summary_payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        summary_data = json.loads(response.data.decode('utf-8'))
        self.assertEqual(summary_data["appointment_id"], appt_id)
        self.assertIn("### Visit Overview", summary_data["summary_content"])
        self.assertIn("### Medicine Instructions", summary_data["summary_content"])
        self.assertIn("metformin 500mg daily", summary_data["summary_content"])

    def test_config_endpoints(self):
        # Test Get Config
        response = self.client.get('/api/config')
        self.assertEqual(response.status_code, 200)
        config = json.loads(response.data.decode('utf-8'))
        self.assertIn("has_gemini", config)
        self.assertIn("has_twilio", config)

        # Test Save Config
        config_payload = {
            "gemini_key": "AIzaTestKey123",
            "twilio_sid": "ACtestaccount",
            "twilio_token": "testtoken",
            "twilio_phone": "+15555555555"
        }
        response = self.client.post('/api/config',
                                    data=json.dumps(config_payload),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        result = json.loads(response.data.decode('utf-8'))
        self.assertTrue(result["success"])

if __name__ == '__main__':
    unittest.main()
