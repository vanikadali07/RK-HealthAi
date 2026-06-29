// Global States
let activePIN = localStorage.getItem("rk_security_pin") || "1234";
let enteredPIN = "";
let currentPatientName = localStorage.getItem("rk_patient_name") || "Demo Patient";
let appointments = [];
let medications = [];
let summaries = [];

// DOM Elements & Initialization
document.addEventListener("DOMContentLoaded", () => {
    // Save defaults
    localStorage.setItem("rk_security_pin", activePIN);
    localStorage.setItem("rk_patient_name", currentPatientName);
    
    // Set UI Profile Name
    updateUIProfileName();
    
    // Fill Settings inputs
    document.getElementById("settings-profile-input").value = currentPatientName;
    
    // Load config keys from backend
    loadActiveConfig();
    
    // Check lock status
    const isLocked = sessionStorage.getItem("rk_app_locked") !== "false";
    if (isLocked) {
        document.getElementById("lock-screen").classList.remove("hidden");
    } else {
        document.getElementById("lock-screen").classList.add("hidden");
        loadAllData();
    }
});

// --- Lock Screen Core Logic ---

function updateUIProfileName() {
    document.getElementById("profile-name").textContent = currentPatientName;
    document.getElementById("report-patient-name").textContent = currentPatientName;
    
    // Avatar initials
    const parts = currentPatientName.trim().split(" ");
    let initials = parts[0][0] || "P";
    if (parts.length > 1) {
        initials += parts[parts.length - 1][0];
    }
    document.getElementById("user-avatar").textContent = initials.toUpperCase();
}

function pressKey(num) {
    if (enteredPIN.length < 4) {
        enteredPIN += num;
        updatePinDisplay();
        
        if (enteredPIN.length === 4) {
            // Wait 150ms for visual dot fill
            setTimeout(verifyPIN, 150);
        }
    }
}

function clearPin() {
    enteredPIN = "";
    updatePinDisplay();
    document.getElementById("lock-error").classList.remove("visible");
}

function backspacePin() {
    if (enteredPIN.length > 0) {
        enteredPIN = enteredPIN.slice(0, -1);
        updatePinDisplay();
        document.getElementById("lock-error").classList.remove("visible");
    }
}

function updatePinDisplay() {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if (i < enteredPIN.length) {
            dot.classList.add("filled");
        } else {
            dot.classList.remove("filled");
        }
    }
}

function verifyPIN() {
    if (enteredPIN === activePIN) {
        sessionStorage.setItem("rk_app_locked", "false");
        document.getElementById("lock-screen").classList.add("hidden");
        clearPin();
        showToast("Access Granted", "Welcome to RK Health Portal.", "success");
        loadAllData();
    } else {
        const errLabel = document.getElementById("lock-error");
        errLabel.classList.add("visible");
        clearPin();
        // Shake animation re-triggering
        errLabel.style.animation = "none";
        setTimeout(() => {
            errLabel.style.animation = "shake 0.3s ease-in-out";
        }, 10);
    }
}

function lockApp() {
    sessionStorage.setItem("rk_app_locked", "true");
    document.getElementById("lock-screen").classList.remove("hidden");
    clearPin();
    showToast("Session Locked", "Your care logs are now secure.", "info");
}

// --- Navigation View Switcher ---

function switchTab(tabId, element) {
    // Hide all panels
    const panels = document.querySelectorAll(".tab-panel");
    panels.forEach(p => p.classList.remove("active"));
    
    // Deactivate all nav items
    const navs = document.querySelectorAll(".nav-item");
    navs.forEach(n => n.classList.remove("active"));
    
    // Activate targeted panel & nav item
    document.getElementById(`${tabId}-panel`).classList.add("active");
    if (element) {
        element.classList.add("active");
    }
    
    // Toggle sidebar status in mobile mode
    document.getElementById("sidebar").classList.remove("active");
    
    // Update Header title
    const headerTitleMap = {
        "dashboard": "Dashboard Overview",
        "appointments": "Patient Appointments Manager",
        "medications": "Medication Reminders & Adherence",
        "summaries": "AI Clinical Notes Summarizer",
        "reports": "Comprehensive Health Record Report",
        "settings": "System Portal Settings"
    };
    document.getElementById("page-header-title").textContent = headerTitleMap[tabId] || "Portal";
    
    // Custom triggers
    if (tabId === "reports") {
        compileHealthReport();
    }
    if (tabId === "summaries") {
        populateSummaryAppointmentDropdown();
    }
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("active");
}

// --- Toast Alerts Engine ---

function showToast(title, message, type = "success", duration = 4000) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const iconMap = {
        "success": "fa-circle-check",
        "error": "fa-circle-exclamation",
        "info": "fa-circle-info",
        "warning": "fa-triangle-exclamation"
    };
    const icon = iconMap[type] || "fa-bell";
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Automatic remove
    setTimeout(() => {
        toast.classList.add("hiding");
        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, duration);
}

// --- Data Fetching and Renders ---

function loadAllData() {
    fetchAppointments();
    fetchMedications();
    fetchSummaries();
}

function fetchAppointments() {
    fetch("/api/appointments")
        .then(res => res.json())
        .then(data => {
            appointments = data;
            renderAppointmentsTable(data);
            updateDashboardStats();
            populateSummaryAppointmentDropdown();
        })
        .catch(err => {
            console.error("Fetch Appt Error:", err);
            showToast("Connection Error", "Failed to retrieve appointment list.", "error");
        });
}

function fetchMedications() {
    fetch("/api/medications")
        .then(res => res.json())
        .then(data => {
            medications = data;
            renderMedicationsTable(data);
            updateDashboardStats();
        })
        .catch(err => {
            console.error("Fetch Meds Error:", err);
            showToast("Connection Error", "Failed to retrieve medication reminders.", "error");
        });
}

function fetchSummaries() {
    fetch("/api/summaries")
        .then(res => res.json())
        .then(data => {
            summaries = data;
            updateDashboardStats();
        })
        .catch(err => {
            console.error("Fetch Summaries Error:", err);
        });
}

// --- Appointments Rendering & CRUD ---

function renderAppointmentsTable(data) {
    const tbody = document.getElementById("appointments-table-body");
    tbody.innerHTML = "";
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No appointments logged. Add one using the button above.</td></tr>`;
        return;
    }
    
    data.forEach(appt => {
        const tr = document.createElement("tr");
        
        // Status Badge Style
        let badgeClass = "badge-pending";
        if (appt.status === "Checked In") badgeClass = "badge-completed";
        if (appt.status === "Missed") badgeClass = "badge-missed";
        
        // Google Calendar Event Link
        const calUrl = buildGoogleCalendarLink(appt);
        
        tr.innerHTML = `
            <td><strong>${escapeHTML(appt.patient_name)}</strong></td>
            <td>Dr. ${escapeHTML(appt.doctor_name)}</td>
            <td>
                <div><i class="fa-regular fa-calendar" style="color:var(--primary)"></i> ${appt.date}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;"><i class="fa-regular fa-clock"></i> ${appt.time}</div>
            </td>
            <td>
                <div style="font-weight:600;">${escapeHTML(appt.title)}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(appt.notes || "")}</div>
            </td>
            <td>
                <select onchange="updateAppointmentStatus(${appt.id}, this.value)" class="form-control" style="padding: 0.25rem 0.5rem; font-size:0.8rem; width:120px;">
                    <option value="Pending" ${appt.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Checked In" ${appt.status === 'Checked In' ? 'selected' : ''}>Checked In</option>
                    <option value="Missed" ${appt.status === 'Missed' ? 'selected' : ''}>Missed</option>
                </select>
            </td>
            <td>
                <div class="action-btn-group">
                    <a href="${calUrl}" target="_blank" class="icon-btn calendar-btn" title="Add to Google Calendar">
                        <i class="fa-solid fa-calendar-plus"></i>
                    </a>
                    <button onclick="deleteAppointment(${appt.id})" class="icon-btn delete-btn" title="Delete record">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function buildGoogleCalendarLink(appt) {
    // Formats appointment date-time for template Link
    // Input format: YYYY-MM-DD and HH:MM
    const dateClean = appt.date.replace(/-/g, ""); // YYYYMMDD
    const timeClean = appt.time.replace(/:/g, ""); // HHMM
    const startIso = `${dateClean}T${timeClean}00`;
    
    // Assume duration is 1 hour
    const [h, m] = appt.time.split(":");
    let endHr = parseInt(h) + 1;
    if (endHr < 10) endHr = "0" + endHr;
    if (endHr >= 24) endHr = "00";
    const endIso = `${dateClean}T${endHr}${m}00`;
    
    const title = encodeURIComponent(`Dr. ${appt.doctor_name} - ${appt.title}`);
    const details = encodeURIComponent(`Patient Name: ${appt.patient_name}\nNotes: ${appt.notes || "No notes logged."}\nScheduled via RK Health dashboard.`);
    
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=Doctor+Office`;
}

function updateAppointmentStatus(id, status) {
    fetch(`/api/appointments/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    })
    .then(res => res.json())
    .then(data => {
        showToast("Status Updated", `Appointment status updated to ${status}.`, "info");
        fetchAppointments();
    })
    .catch(err => {
        showToast("Error", "Failed to update appointment status.", "error");
    });
}

function deleteAppointment(id) {
    if (confirm("Are you sure you want to delete this appointment? This will also remove any saved summaries for it.")) {
        fetch(`/api/appointments/${id}`, { method: "DELETE" })
            .then(res => res.json())
            .then(data => {
                showToast("Deleted", "Appointment removed successfully.", "success");
                loadAllData();
            })
            .catch(err => {
                showToast("Error", "Failed to delete record.", "error");
            });
    }
}

function submitAppointmentForm(event) {
    event.preventDefault();
    const patient_name = document.getElementById("appt-patient-name").value.trim();
    const doctor_name = document.getElementById("appt-doctor-name").value.trim();
    const date = document.getElementById("appt-date").value;
    const time = document.getElementById("appt-time").value;
    const title = document.getElementById("appt-title").value.trim();
    const notes = document.getElementById("appt-notes").value.trim();
    
    fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_name, doctor_name, date, time, title, notes })
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
    })
    .then(data => {
        closeModal("appointment-modal");
        document.getElementById("appointment-form").reset();
        showToast("Scheduled", "Appointment successfully created.", "success");
        fetchAppointments();
    })
    .catch(err => {
        showToast("Error", "Failed to create appointment.", "error");
    });
}

function filterAppointments() {
    const query = document.getElementById("filter-appt-search").value.toLowerCase();
    const status = document.getElementById("filter-appt-status").value;
    
    const filtered = appointments.filter(appt => {
        const matchesQuery = appt.patient_name.toLowerCase().includes(query) || 
                             appt.doctor_name.toLowerCase().includes(query) || 
                             appt.title.toLowerCase().includes(query);
        const matchesStatus = status === "All" || appt.status === status;
        return matchesQuery && matchesStatus;
    });
    
    renderAppointmentsTable(filtered);
}

// --- Medications Rendering & CRUD ---

function renderMedicationsTable(data) {
    const tbody = document.getElementById("medications-table-body");
    tbody.innerHTML = "";
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No medication reminders logged.</td></tr>`;
        return;
    }
    
    data.forEach(med => {
        const tr = document.createElement("tr");
        
        tr.innerHTML = `
            <td><strong>${escapeHTML(med.name)}</strong></td>
            <td><i class="fa-solid fa-vial" style="color:var(--secondary)"></i> ${escapeHTML(med.dosage)}</td>
            <td><span class="badge badge-pending">${med.timing}</span></td>
            <td><i class="fa-solid fa-phone" style="color:var(--text-muted)"></i> ${med.phone}</td>
            <td>
                <div class="compliance-wrapper">
                    <input type="checkbox" id="med-check-${med.id}" class="compliance-checkbox" ${med.is_taken ? 'checked' : ''} onchange="toggleMedCompliance(${med.id}, this.checked)">
                    <label for="med-check-${med.id}" class="compliance-label">Mark Taken</label>
                </div>
            </td>
            <td>
                <button onclick="triggerSMSReminder(${med.id})" class="btn btn-secondary btn-sm" style="font-size:0.75rem; padding: 0.3rem 0.6rem;">
                    <i class="fa-solid fa-paper-plane" style="color:var(--warning)"></i> Send SMS
                </button>
            </td>
            <td>
                <button onclick="deleteMedication(${med.id})" class="icon-btn delete-btn" title="Delete record">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleMedCompliance(id, state) {
    fetch(`/api/medications/${id}/compliance`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_taken: state })
    })
    .then(res => res.json())
    .then(data => {
        const statusMsg = state ? "Medication marked as taken today." : "Medication marked as pending.";
        showToast("Compliance Updated", statusMsg, state ? "success" : "info");
        fetchMedications();
    })
    .catch(err => {
        showToast("Error", "Failed to update adherence status.", "error");
    });
}

function triggerSMSReminder(id) {
    showToast("Triggering SMS...", "Contacting notification API.", "info", 1500);
    
    fetch(`/api/medications/${id}/send-sms`, { method: "POST" })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                if (data.mode === "simulated") {
                    // Show simulation mobile display popup
                    document.getElementById("sms-sim-bubble").textContent = data.sms_details.body;
                    document.getElementById("sms-sim-phone").textContent = data.sms_details.recipient;
                    
                    const now = new Date();
                    document.getElementById("sms-sim-time").textContent = `Today, ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                    
                    openModal("sms-sim-modal");
                    showToast("Simulated SMS", "Reminder preview displayed.", "warning");
                } else {
                    showToast("SMS Delivered", "Twilio SMS delivered successfully.", "success");
                }
            } else {
                showToast("SMS Failed", data.message || "Twilio error encountered.", "error");
            }
        })
        .catch(err => {
            showToast("Connection Error", "Could not trigger SMS routing.", "error");
        });
}

function deleteMedication(id) {
    if (confirm("Remove this medication reminder?")) {
        fetch(`/api/medications/${id}`, { method: "DELETE" })
            .then(res => res.json())
            .then(data => {
                showToast("Deleted", "Medication reminder removed.", "success");
                fetchMedications();
            })
            .catch(err => {
                showToast("Error", "Failed to delete reminder.", "error");
            });
    }
}

function submitMedicationForm(event) {
    event.preventDefault();
    const name = document.getElementById("med-name").value.trim();
    const dosage = document.getElementById("med-dosage").value.trim();
    const timing = document.getElementById("med-timing").value;
    const phone = document.getElementById("med-phone").value.trim();
    
    fetch("/api/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dosage, timing, phone })
    })
    .then(res => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
    })
    .then(data => {
        closeModal("medication-modal");
        document.getElementById("medication-form").reset();
        showToast("Saved", "Medication reminder added successfully.", "success");
        fetchMedications();
    })
    .catch(err => {
        showToast("Error", "Failed to save medication reminder.", "error");
    });
}

function filterMedications() {
    const query = document.getElementById("filter-med-search").value.toLowerCase();
    const timing = document.getElementById("filter-med-timing").value;
    
    const filtered = medications.filter(med => {
        const matchesQuery = med.name.toLowerCase().includes(query);
        const matchesTiming = timing === "All" || med.timing === timing;
        return matchesQuery && matchesTiming;
    });
    
    renderMedicationsTable(filtered);
}

// --- Visit Summaries & AI Parser ---

function populateSummaryAppointmentDropdown() {
    const select = document.getElementById("summary-appointment-select");
    // Clear other than first option
    select.innerHTML = '<option value="" disabled selected>-- Select an Appointment --</option>';
    
    if (appointments.length === 0) {
        return;
    }
    
    appointments.forEach(appt => {
        const opt = document.createElement("option");
        opt.value = appt.id;
        opt.textContent = `${appt.date} - Dr. ${appt.doctor_name} (${appt.title})`;
        select.appendChild(opt);
    });
}

function generateAISummary(event) {
    event.preventDefault();
    
    const select = document.getElementById("summary-appointment-select");
    const appointment_id = parseInt(select.value);
    const raw_notes = document.getElementById("summary-raw-notes").value.trim();
    
    if (!appointment_id || !raw_notes) {
        showToast("Missing Fields", "Please complete all inputs.", "warning");
        return;
    }
    
    // Disable submit button & show loading state
    const btn = document.getElementById("btn-summary-generate");
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analyzing Notes & Generating Summary...`;
    
    fetch("/api/summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id, raw_notes })
    })
    .then(res => {
        if (!res.ok) throw new Error("API call error");
        return res.json();
    })
    .then(data => {
        // Render Markdown content parsed in JS
        renderGeneratedSummary(data);
        showToast("Care Summary Ready", "Structured notes generated.", "success");
        fetchSummaries(); // Refresh logs
    })
    .catch(err => {
        console.error("AI Summary Error:", err);
        showToast("AI Error", "Failed to compile summary. Check backend logs.", "error");
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = originalText;
    });
}

let activeSummaryText = "";

function renderGeneratedSummary(summaryObj) {
    activeSummaryText = summaryObj.summary_content;
    
    // Set badge indicator
    const badge = document.getElementById("summary-status-badge");
    badge.textContent = `Generated: ${summaryObj.mode.toUpperCase()}`;
    
    // Toggle UI views
    document.getElementById("summary-empty-view").style.display = "none";
    const contentBox = document.getElementById("summary-html-content");
    contentBox.style.display = "block";
    
    // Parse Markdown to HTML and inject
    contentBox.innerHTML = parseMarkdown(summaryObj.summary_content);
    
    // Enable Actions
    document.getElementById("btn-summary-copy").removeAttribute("disabled");
    document.getElementById("btn-summary-print").removeAttribute("disabled");
}

function parseMarkdown(md) {
    if (!md) return "";
    
    let html = md;
    
    // 1. Replace headers: ### Heading
    html = html.replace(/###\s+(.*)/g, "<h3>$1</h3>");
    
    // 2. Replace Bold text: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    
    // 3. Match Bullet list lines
    // We want to match bullet lists and group them. Since it's quick, standard lines is fine:
    const lines = html.split('\n');
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line.startsWith("- ") || line.startsWith("* ")) {
            let content = line.substring(2);
            if (!inList) {
                lines[i] = "<ul><li>" + content + "</li>";
                inList = true;
            } else {
                lines[i] = "<li>" + content + "</li>";
            }
        } else {
            if (inList) {
                lines[i] = "</ul>" + (line ? "<p>" + line + "</p>" : "");
                inList = false;
            } else if (line) {
                // If it isn't an HTML tag, wrap in p
                if (!line.startsWith("<h3") && !line.startsWith("<ul") && !line.startsWith("<li")) {
                    lines[i] = "<p>" + line + "</p>";
                }
            }
        }
    }
    
    if (inList) {
        lines.push("</ul>");
    }
    
    return lines.join('\n');
}

function copySummaryText() {
    if (!activeSummaryText) return;
    
    navigator.clipboard.writeText(activeSummaryText)
        .then(() => {
            showToast("Copied", "Clinical notes copied to clipboard.", "success");
        })
        .catch(err => {
            showToast("Failed to copy", "Clipboard permissions error.", "error");
        });
}

function printSingleSummary() {
    // Navigate to Health Report view to print properly, or use direct window print on report
    // Let's implement a neat single-summary print using report tab
    switchTab("reports", document.getElementById("nav-reports"));
    // Compile report, then print
    setTimeout(() => {
        window.print();
    }, 250);
}

// --- Dashboard Statistics Calculation ---

function updateDashboardStats() {
    // 1. Appointment Count
    document.getElementById("stat-appt-count").textContent = appointments.length;
    
    // Today's Date String YYYY-MM-DD
    const todayStr = getTodayDateString();
    
    // Today appt count
    const apptsToday = appointments.filter(a => a.date === todayStr);
    document.getElementById("stat-appt-trend").innerHTML = apptsToday.length > 0 
        ? `<i class="fa-solid fa-circle-check" style="color:var(--success)"></i> ${apptsToday.length} checkups scheduled today`
        : `<i class="fa-solid fa-calendar-day"></i> No doctor appointments today`;
        
    // 2. Medications count
    document.getElementById("stat-med-count").textContent = medications.filter(m => !m.is_taken).length;
    
    // 3. Active summaries count
    document.getElementById("stat-summary-count").textContent = summaries.length;
    
    // 4. Medication compliance Adherence rate
    const adherence = calculateComplianceRate();
    document.getElementById("stat-compliance-rate").textContent = `${adherence}%`;
    document.getElementById("stat-compliance-trend").innerHTML = adherence > 80 
        ? `<i class="fa-solid fa-face-smile" style="color:var(--success)"></i> Excellent clinical adherence!`
        : adherence > 50 
            ? `<i class="fa-solid fa-face-meh" style="color:var(--warning)"></i> Moderate compliance. Track meds!`
            : `<i class="fa-solid fa-face-frown" style="color:var(--danger)"></i> Alert: Low dosage compliance.`;
            
    // 5. Today's Checklist Schedule Rendering
    renderTodayChecklist(todayStr);
}

function getTodayDateString() {
    const d = new Date();
    const y = d.getFullYear();
    let m = d.getMonth() + 1;
    let r = d.getDate();
    if (m < 10) m = "0" + m;
    if (r < 10) r = "0" + r;
    return `${y}-${m}-${r}`;
}

function calculateComplianceRate() {
    if (medications.length === 0) return 100;
    const taken = medications.filter(m => m.is_taken).length;
    return Math.round((taken / medications.length) * 100);
}

function renderTodayChecklist(todayDate) {
    const checklistBox = document.getElementById("today-schedule-checklist");
    checklistBox.innerHTML = "";
    
    const items = [];
    
    // Gather today appointments
    appointments.forEach(appt => {
        if (appt.date === todayDate) {
            items.push({
                type: "appointment",
                id: appt.id,
                time: appt.time,
                title: `Doctor Visit: Dr. ${appt.doctor_name}`,
                desc: appt.title,
                status: appt.status
            });
        }
    });
    
    // Gather all medications (since medications are daily reminders)
    medications.forEach(med => {
        items.push({
            type: "medication",
            id: med.id,
            time: getMedSortTiming(med.timing),
            title: `Take ${med.name} (${med.dosage})`,
            desc: `Scheduled timing: ${med.timing}`,
            is_taken: med.is_taken
        });
    });
    
    if (items.length === 0) {
        checklistBox.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; text-align:center; padding:1.5rem 0;">No tasks or events logged for today.</p>`;
        return;
    }
    
    // Sort items by time code
    items.sort((a, b) => a.time.localeCompare(b.time));
    
    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "stat-card";
        div.style.padding = "0.75rem 1rem";
        div.style.margin = "0";
        div.style.background = "rgba(255, 255, 255, 0.01)";
        div.style.borderRadius = "var(--border-radius-sm)";
        
        if (item.type === "appointment") {
            let statusLabel = `<span class="badge badge-pending">PENDING</span>`;
            if (item.status === "Checked In") statusLabel = `<span class="badge badge-completed">CHECKED IN</span>`;
            if (item.status === "Missed") statusLabel = `<span class="badge badge-missed">MISSED</span>`;
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--primary); font-weight:600;"><i class="fa-solid fa-clock"></i> ${item.time}</div>
                        <div style="font-size:0.875rem; font-weight:600;">${escapeHTML(item.title)}</div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHTML(item.desc)}</div>
                    </div>
                    <div>${statusLabel}</div>
                </div>
            `;
        } else {
            // Medication checkbox checklist item
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="opacity: ${item.is_taken ? 0.6 : 1}">
                        <div style="font-size:0.75rem; color:var(--secondary); font-weight:600;"><i class="fa-solid fa-bell"></i> ${item.desc}</div>
                        <div style="font-size:0.875rem; font-weight:600; text-decoration: ${item.is_taken ? 'line-through' : 'none'}">${escapeHTML(item.title)}</div>
                    </div>
                    <div class="compliance-wrapper">
                        <input type="checkbox" id="chk-checklist-${item.id}" class="compliance-checkbox" ${item.is_taken ? 'checked' : ''} onchange="toggleMedCompliance(${item.id}, this.checked)">
                        <label for="chk-checklist-${item.id}" class="compliance-label" style="padding-left: 20px; font-size: 0px;"></label>
                    </div>
                </div>
            `;
        }
        checklistBox.appendChild(div);
    });
}

function getMedSortTiming(timing) {
    // Maps timing labels to mock string times for sorting checklist
    const map = {
        "Morning": "08:00",
        "Afternoon": "13:00",
        "Evening": "17:00",
        "Night": "21:00"
    };
    return map[timing] || "12:00";
}

// --- Health Report Compilation ---

function compileHealthReport() {
    const today = new Date();
    document.getElementById("report-generated-date").textContent = today.toLocaleString();
    
    // Update profile
    document.getElementById("report-patient-name").textContent = currentPatientName;
    const compliance = calculateComplianceRate();
    document.getElementById("report-patient-compliance").textContent = `${compliance}%`;
    
    // Fill Appointments
    const apptsBody = document.getElementById("report-appointments-tbody");
    apptsBody.innerHTML = "";
    if (appointments.length === 0) {
        apptsBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No appointment records saved.</td></tr>`;
    } else {
        appointments.forEach(appt => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${appt.date} (${appt.time})</td>
                <td>Dr. ${escapeHTML(appt.doctor_name)}</td>
                <td><strong>${escapeHTML(appt.title)}</strong><br><small>${escapeHTML(appt.notes || "")}</small></td>
                <td>${appt.status}</td>
            `;
            apptsBody.appendChild(tr);
        });
    }
    
    // Fill Medications
    const medsBody = document.getElementById("report-medications-tbody");
    medsBody.innerHTML = "";
    if (medications.length === 0) {
        medsBody.innerHTML = `<tr><td colspan="4" style="text-align: center;">No medication logs found.</td></tr>`;
    } else {
        medications.forEach(med => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapeHTML(med.name)}</strong></td>
                <td>${escapeHTML(med.dosage)}</td>
                <td>${med.timing}</td>
                <td>${med.is_taken ? 'TAKEN / COMPLIANT' : 'PENDING'}</td>
            `;
            medsBody.appendChild(tr);
        });
    }
    
    // Fill Summaries
    const summariesContainer = document.getElementById("report-summaries-container");
    summariesContainer.innerHTML = "";
    if (summaries.length === 0) {
        summariesContainer.innerHTML = `<p style="color: var(--text-muted); font-size:0.85rem; font-style:italic;">No AI generated clinical summaries saved.</p>`;
    } else {
        summaries.forEach(s => {
            const div = document.createElement("div");
            div.className = "report-summary-block";
            
            // Format MD text block briefly
            const parsedHTML = parseMarkdown(s.summary_content);
            
            div.innerHTML = `
                <h4>
                    <span>Doctor Visit Summary (Dr. ${escapeHTML(s.doctor_name)})</span>
                    <small style="font-weight:normal; font-size:0.75rem; color:#64748b;">Visit Date: ${s.appointment_date}</small>
                </h4>
                <div class="report-summary-block-text">${parsedHTML}</div>
            `;
            summariesContainer.appendChild(div);
        });
    }
}

function printReport() {
    window.print();
}

// --- Settings Form Submits ---

function updateSecurityPin(event) {
    event.preventDefault();
    const currentInput = document.getElementById("settings-current-pin").value;
    const newInput = document.getElementById("settings-new-pin").value;
    
    if (currentInput !== activePIN) {
        showToast("Incorrect PIN", "The current security PIN is invalid.", "error");
        return;
    }
    
    if (newInput.length !== 4 || isNaN(newInput)) {
        showToast("Invalid Input", "New PIN must be exactly 4 digits.", "warning");
        return;
    }
    
    activePIN = newInput;
    localStorage.setItem("rk_security_pin", activePIN);
    document.getElementById("settings-pin-form").reset();
    showToast("PIN Updated", "Security access PIN has been updated successfully.", "success");
}

function updateProfileName(event) {
    event.preventDefault();
    const nameInput = document.getElementById("settings-profile-input").value.trim();
    if (!nameInput) return;
    
    currentPatientName = nameInput;
    localStorage.setItem("rk_patient_name", currentPatientName);
    updateUIProfileName();
    showToast("Profile Updated", `Active patient profile changed to ${currentPatientName}.`, "success");
}

// --- API Connections Storage Setup ---

function saveAPIKeys(event) {
    event.preventDefault();
    const gemini_key = document.getElementById("settings-gemini-key").value.trim();
    const twilio_sid = document.getElementById("settings-twilio-sid").value.trim();
    const twilio_token = document.getElementById("settings-twilio-token").value.trim();
    const twilio_phone = document.getElementById("settings-twilio-phone").value.trim();
    
    const body = { gemini_key, twilio_sid, twilio_token, twilio_phone };
    
    showToast("Configuring connections...", "Sending credentials to backend service.", "info", 1500);
    
    fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast("Connections Saved", "System APIs re-configured successfully.", "success");
            loadActiveConfig();
            
            // Re-fetch since statuses changes
            loadAllData();
        } else {
            showToast("Failed to Save", data.error || "Verification issue.", "error");
        }
    })
    .catch(err => {
        showToast("Error", "Could not route config packet to server.", "error");
    });
}

function clearSavedAPIKeys() {
    if (confirm("Reset connection settings? This restores local simulation modes.")) {
        fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reset: true })
        })
        .then(res => res.json())
        .then(data => {
            showToast("Configuration Reset", "Simulation values successfully restored.", "info");
            document.getElementById("api-keys-form").reset();
            loadActiveConfig();
            loadAllData();
        })
        .catch(err => {
            showToast("Error", "Could not request configurations reset.", "error");
        });
    }
}

function loadActiveConfig() {
    fetch("/api/config")
        .then(res => res.json())
        .then(config => {
            // Fill values if present
            document.getElementById("settings-gemini-key").value = config.has_gemini ? "••••••••••••••••" : "";
            document.getElementById("settings-twilio-sid").value = config.twilio_sid || "";
            document.getElementById("settings-twilio-token").value = config.has_twilio_token ? "••••••••••••••••" : "";
            document.getElementById("settings-twilio-phone").value = config.twilio_phone || "";
            
            // Set header badge indicator
            const badge = document.getElementById("api-status-badge");
            const badgeText = document.getElementById("api-status-text");
            
            if (config.has_gemini && config.has_twilio) {
                badge.className = "status-badge active";
                badgeText.textContent = "Server: Active Integration";
            } else if (config.has_gemini || config.has_twilio) {
                badge.className = "status-badge simulate";
                badgeText.textContent = "Server: Semi-Simulated";
            } else {
                badge.className = "status-badge simulate";
                badgeText.textContent = "Server: Simulation Mode";
            }
        })
        .catch(err => console.error("Config fetch error:", err));
}

// --- Utilities ---

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function openModal(id) {
    document.getElementById(id).classList.add("active");
}

function closeModal(id) {
    document.getElementById(id).classList.remove("active");
}
