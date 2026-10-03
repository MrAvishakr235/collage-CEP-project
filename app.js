(() => {
  "use strict";
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
    return payload;
  };
  function showMessage(message, state = "success") {
    document.querySelector(".toast-message")?.remove();
    const toast = document.createElement("p"); toast.className = "toast-message"; toast.dataset.state = state; toast.setAttribute("role", "status"); toast.textContent = message;
    document.body.append(toast); window.setTimeout(() => toast.remove(), 4500);
  }
  function formatDate(value) { const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  function testPayload(form) { return { title: form.elements.title.value.trim(), subject: form.elements.subject.value.trim(), test_date: form.elements.test_date.value, total_marks: Number(form.elements.total_marks.value), question_count: Number(form.elements.question_count.value), google_form_url: form.elements.google_form_url.value.trim(), description: form.elements.description.value.trim() }; }
  async function loadTests() { return (await api("/api/tests")).tests; }

  function initLogin() {
    const form = document.querySelector("#login-form"); if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const submit = form.querySelector("button[type=submit]"); submit.disabled = true;
      try {
        const result = await api("/api/login", { method: "POST", body: JSON.stringify({ login_id: form.elements.login_id.value, password: form.elements.password.value, role: form.querySelector('input[name="role"]:checked')?.value }) });
        window.location.assign(result.redirect);
      } catch (error) { showMessage(error.message, "error"); } finally { submit.disabled = false; }
    });
  }

  async function loadAttendanceRoster() {
    const body = document.querySelector("#attendance-form tbody"); if (!body) return;
    try {
      const result = await api("/api/students"); body.replaceChildren();
      result.students.forEach((student) => {
        const row = document.createElement("tr"); row.dataset.studentId = student.id;
        const roll = document.createElement("td"); roll.textContent = String(student.roll_number).padStart(2, "0");
        const name = document.createElement("th"); name.scope = "row"; name.textContent = student.full_name;
        const status = document.createElement("td");
        status.innerHTML = `<label><input type="radio" name="attendance[${student.id}]" value="present" checked> Present</label><label><input type="radio" name="attendance[${student.id}]" value="absent"> Absent</label>`;
        row.append(roll, name, status); body.append(row);
      });
    } catch (_) { /* The labelled five-row demo roster remains available before login. */ }
  }

  function initAttendance() {
    const form = document.querySelector("#attendance-form"); if (!form) return;
    document.querySelector("#select-all-present")?.addEventListener("change", (event) => { if (event.target.checked) form.querySelectorAll('input[type="radio"][value="present"]').forEach((input) => { input.checked = true; }); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const entries = [...form.querySelectorAll("tbody tr[data-student-id]")].map((row) => ({ studentId: Number(row.dataset.studentId.replace("demo-g7-", "")), status: row.querySelector('input[type="radio"]:checked')?.value || "absent" }));
      try { await api("/api/attendance", { method: "POST", body: JSON.stringify({ attendance_date: form.elements.attendance_date.value, entries }) }); document.querySelector("#attendance-success-message").hidden = false; showMessage("Attendance submitted successfully."); }
      catch (error) { showMessage(error.message, "error"); }
    });
  }

  async function initTestForm() {
    const form = document.querySelector("#test-form"); if (!form) return;
    const testId = new URLSearchParams(window.location.search).get("test");
    if (/^\d+$/.test(testId || "")) {
      try {
        const item = (await loadTests()).find((test) => String(test.id) === testId);
        if (item) { form.elements.title.value = item.title; form.elements.subject.value = item.subject; form.elements.test_date.value = item.test_date; form.elements.total_marks.value = item.total_marks; form.elements.question_count.value = item.question_count; form.elements.google_form_url.value = item.google_form_url; form.elements.description.value = item.description || ""; document.querySelector("#save-test").textContent = "Save Changes"; }
      } catch (error) { showMessage(error.message, "error"); }
    }
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      try {
        await api(/^\d+$/.test(testId || "") ? `/api/tests/${testId}` : "/api/tests", { method: /^\d+$/.test(testId || "") ? "PUT" : "POST", body: JSON.stringify(testPayload(form)) });
        showMessage(testId ? "Test details updated successfully." : "Test saved successfully."); window.setTimeout(() => window.location.assign("teacher-test-records.html"), 600);
      } catch (error) { showMessage(error.message, "error"); }
    });
  }

  async function renderTeacherTestRecords() {
    const body = document.querySelector("#test-records-table tbody"); if (!body) return;
    try {
      const tests = await loadTests(); body.replaceChildren();
      tests.forEach((test) => {
        const row = document.createElement("tr"); row.dataset.testId = test.id;
        row.innerHTML = `<th scope="row"></th><td></td><td><time></time></td><td></td><td></td><td><a target="_blank" rel="noopener">Open form</a></td><td><a data-action="edit-test">Edit</a> <button type="button" data-action="copy-test-link">Copy link</button> <button type="button" data-action="delete-test">Delete</button></td>`;
        row.querySelector("th").textContent = test.title; row.children[1].textContent = test.subject;
        const time = row.querySelector("time"); time.dateTime = test.test_date; time.textContent = formatDate(test.test_date);
        row.children[3].textContent = test.class_name; row.children[4].textContent = test.total_marks;
        row.querySelector("a[target=_blank]").href = test.google_form_url; row.querySelector('[data-action="edit-test"]').href = `teacher-test.html?test=${test.id}`;
        body.append(row);
      });
    } catch (error) { showMessage(error.message, "error"); }
  }

  function initTestRecordActions() {
    const table = document.querySelector("#test-records-table"); if (!table) return;
    renderTeacherTestRecords();
    table.addEventListener("click", async (event) => {
      const button = event.target.closest("button"); if (!button) return;
      const row = button.closest("tr[data-test-id]"); if (!row) return;
      if (button.dataset.action === "copy-test-link") {
        const link = row.querySelector("a[target=_blank]").href;
        try { await navigator.clipboard.writeText(link); showMessage("Google Form link copied to clipboard."); } catch { window.prompt("Copy this Google Form link:", link); }
      }
      if (button.dataset.action === "delete-test") {
        if (!window.confirm("Delete this test record?")) return;
        try { await api(`/api/tests/${row.dataset.testId}`, { method: "DELETE" }); await renderTeacherTestRecords(); showMessage("Test record deleted."); } catch (error) { showMessage(error.message, "error"); }
      }
    });
  }

  async function loadAttendanceRecords() {
    const body = document.querySelector("#daily-attendance-table tbody"); if (!body) return;
    try {
      const result = await api("/api/attendance"); if (!result.records.length) return; body.replaceChildren();
      result.records.forEach((record) => { const row = document.createElement("tr"); row.innerHTML = `<th scope="row"><time></time></th><td></td><td></td><td></td><td>Submitted</td>`; const time = row.querySelector("time"); time.dateTime = record.attendance_date; time.textContent = formatDate(record.attendance_date); row.children[1].textContent = record.present_count || 0; row.children[2].textContent = record.absent_count || 0; row.children[3].textContent = record.submitted_by; body.append(row); });
    } catch (_) { /* Static demo data remains visible until authentication. */ }
  }

  async function loadDashboard() {
    if (!document.querySelectorAll("[data-stat]").length) return;
    try {
      const data = await api("/api/dashboard");
      const values = { "class-strength": data.students, "total-students": data.students, "total-teachers": data.teachers, "total-classes": data.classes, "tests-conducted": data.tests, "tests-this-month": data.tests };
      Object.entries(values).forEach(([key, value]) => { if (value !== undefined) document.querySelectorAll(`[data-stat="${key}"] h2`).forEach((element) => { element.textContent = value; }); });
    } catch (_) { /* Static demo values remain visible until login. */ }
  }

  async function initClassDetails() {
    const page = document.querySelector(".class-details-page"); const code = new URLSearchParams(window.location.search).get("class"); if (!page || !code) return;
    try {
      const data = await api(`/api/admin/classes/code/${encodeURIComponent(code)}`); const record = data.class_record; page.dataset.classId = record.code;
      document.title = `${record.name} Details`; document.querySelector("#class-detail-name").textContent = record.name;
      document.querySelector("#class-detail-description").textContent = record.active ? `Current records for ${record.name}.` : `${record.name} is inactive; its historical records are retained.`;
      document.querySelector("#class-student-count").textContent = record.student_count;
      document.querySelector("#class-test-count").textContent = data.tests.length;
      document.querySelector("#class-teacher-name").textContent = record.teacher_name || "Not assigned";
      document.querySelector("#class-teacher-detail").textContent = record.teacher_name ? "Class teacher assignment is active." : "Assign a teacher from Grade Management.";
      const attendance = data.latest_attendance; const present = attendance?.present_count || 0; const absent = attendance?.absent_count || 0; const total = present + absent;
      document.querySelector("#class-present-count").textContent = attendance ? present : "—"; document.querySelector("#class-attendance-rate").textContent = total ? `${Math.round((present / total) * 100)}%` : "—";
      document.querySelector("#class-attendance-summary").textContent = attendance ? `${formatDate(attendance.attendance_date)}: ${present} present and ${absent} absent.` : "No attendance session has been submitted for this grade yet.";
      ["attendance", "tests", "students"].forEach((area) => { const link = document.querySelector(`#class-${area}-link`); if (link) link.href = `${area === "attendance" ? "admin-attendance" : `admin-${area}`}.html?class=${encodeURIComponent(record.code)}`; });
      const testBody = document.querySelector("#class-tests-table tbody"); testBody.replaceChildren(); data.tests.forEach((test) => { const row = document.createElement("tr"); row.innerHTML = '<th scope="row"></th><td></td><td></td><td></td><td></td>'; row.querySelector("th").textContent = test.title; row.children[1].textContent = test.subject; row.children[2].textContent = formatDate(test.test_date); row.children[3].textContent = test.total_marks; const link = document.createElement("a"); link.href = test.google_form_url; link.target = "_blank"; link.rel = "noopener"; link.textContent = "Open form"; row.children[4].append(link); testBody.append(row); });
      if (!data.tests.length) testBody.innerHTML = '<tr><td colspan="5">No tests have been saved for this grade.</td></tr>';
      const studentBody = document.querySelector("#class-students-table tbody"); studentBody.replaceChildren(); data.students.forEach((student) => { const row = document.createElement("tr"); const roll = document.createElement("td"); roll.textContent = String(student.roll_number).padStart(2, "0"); const name = document.createElement("th"); name.scope = "row"; name.textContent = student.full_name; row.append(roll, name); studentBody.append(row); });
      if (!data.students.length) studentBody.innerHTML = '<tr><td colspan="2">No active students are assigned to this grade.</td></tr>';
    } catch (error) { showMessage(error.message, "error"); }
  }

  function initGenericForms() {
    document.querySelectorAll(".filter-form:not(#teacher-filter):not(#student-filter)").forEach((form) => form.addEventListener("submit", (event) => { event.preventDefault(); showMessage("Filters are ready for the next live-data enhancement."); }));
    const profile = document.querySelector("#profile-form");
    profile?.addEventListener("submit", async (event) => { event.preventDefault(); if (!profile.reportValidity()) return; try { await api("/api/profile", { method: "PUT", body: JSON.stringify({ full_name: profile.elements.full_name.value, email: profile.elements.email.value, phone: profile.elements.phone.value }) }); showMessage("Profile updated."); } catch (error) { showMessage(error.message, "error"); } });
    const password = document.querySelector("#change-password-form");
    password?.addEventListener("submit", async (event) => { event.preventDefault(); if (!password.reportValidity()) return; if (password.elements.new_password.value !== password.elements.confirm_password.value) { showMessage("New passwords do not match.", "error"); return; } try { await api("/api/change-password", { method: "POST", body: JSON.stringify({ current_password: password.elements.current_password.value, new_password: password.elements.new_password.value }) }); password.reset(); showMessage("Password changed."); } catch (error) { showMessage(error.message, "error"); } });
    const reset = document.querySelector("#reset-password-form");
    reset?.addEventListener("submit", async (event) => { event.preventDefault(); if (!reset.reportValidity()) return; try { showMessage((await api("/api/reset-password", { method: "POST", body: JSON.stringify({ login_id: reset.elements.login_id.value }) })).message); } catch (error) { showMessage(error.message, "error"); } });
    document.querySelectorAll('[data-action="generate-report"]').forEach((button) => button.addEventListener("click", () => showMessage("Report generation endpoint is ready for the next reporting enhancement.")));
    document.querySelector('[data-action="logout"]')?.addEventListener("click", async (event) => { event.preventDefault(); try { await api("/api/logout", { method: "POST" }); } finally { window.location.assign("login.html"); } });
  }

  const management = { classes: [], teachers: [], students: [] };

  function option(select, value, label, selected = false) {
    const item = document.createElement("option"); item.value = value; item.textContent = label; item.selected = selected; select.append(item);
  }
  function gradeOptions(select, selected = "", includeBlank = true) {
    if (!select) return; select.replaceChildren(); if (includeBlank) option(select, "", "All grades");
    management.classes.filter((item) => item.active).forEach((item) => option(select, item.code, item.name, item.code === selected));
  }
  function teacherOptions(select, selected = "") {
    if (!select) return; select.replaceChildren(); option(select, "", "Not assigned");
    management.teachers.filter((item) => item.active).forEach((item) => option(select, item.id, `${item.full_name} (${item.teacher_id})`, String(item.id) === String(selected)));
  }
  function statusCell(active) { const pill = document.createElement("span"); pill.className = `status-pill${active ? "" : " inactive"}`; pill.textContent = active ? "Active" : "Inactive"; return pill; }
  function actionButton(label, action, id) { const button = document.createElement("button"); button.type = "button"; button.dataset.action = action; button.dataset.id = id; button.textContent = label; return button; }
  function openDialog(id) { document.querySelector(`#${id}`)?.showModal(); }
  function closeDialog(id) { document.querySelector(`#${id}`)?.close(); }

  async function refreshClasses() {
    const result = await api("/api/admin/classes"); management.classes = result.classes;
    gradeOptions(document.querySelector("#teacher-class-filter"));
    gradeOptions(document.querySelector("#teacher-class"), "", true);
    gradeOptions(document.querySelector("#student-class-filter"));
    gradeOptions(document.querySelector("#student-grade"), "", false);
    renderClasses();
  }
  function renderClasses() {
    const body = document.querySelector("#classes-table tbody"); if (!body) return; body.replaceChildren();
    management.classes.forEach((record) => {
      const row = document.createElement("tr"); row.dataset.id = record.id;
      const grade = document.createElement("th"); grade.scope = "row"; grade.textContent = record.name;
      const teacher = document.createElement("td"); teacher.textContent = record.teacher_name ? `${record.teacher_name}${record.teacher_id ? ` (${record.teacher_id})` : ""}` : "Not assigned";
      const students = document.createElement("td"); students.textContent = record.student_count;
      const state = document.createElement("td"); state.append(statusCell(record.active));
      const actions = document.createElement("td"); actions.className = "table-actions";
      const open = document.createElement("a"); open.href = `admin-class-details.html?class=${record.code}`; open.textContent = "Open"; actions.append(open, actionButton("Edit", "edit-class", record.id));
      if (record.active) actions.append(actionButton("Deactivate", "deactivate-class", record.id)); else actions.append(actionButton("Reactivate", "edit-class", record.id));
      row.append(grade, teacher, students, state, actions); body.append(row);
    });
  }

  async function refreshTeachers() {
    const form = document.querySelector("#teacher-filter"); const params = new URLSearchParams();
    if (form?.elements.query.value.trim()) params.set("query", form.elements.query.value.trim()); if (form?.elements.class.value) params.set("class", form.elements.class.value);
    const result = await api(`/api/admin/teachers${params.size ? `?${params}` : ""}`); management.teachers = result.teachers;
    teacherOptions(document.querySelector("#class-teacher")); renderTeachers();
  }
  function renderTeachers() {
    const body = document.querySelector("#teachers-table tbody"); if (!body) return; body.replaceChildren();
    management.teachers.forEach((record) => {
      const row = document.createElement("tr"); row.dataset.id = record.id;
      const id = document.createElement("td"); id.textContent = record.teacher_id;
      const name = document.createElement("th"); name.scope = "row"; name.textContent = record.full_name;
      const login = document.createElement("td"); login.textContent = record.login_id;
      const assigned = document.createElement("td"); if (record.class_code) { const link = document.createElement("a"); link.href = `admin-class-details.html?class=${record.class_code}`; link.textContent = record.class_name; assigned.append(link); } else assigned.textContent = "Not assigned";
      const state = document.createElement("td"); state.append(statusCell(record.active));
      const actions = document.createElement("td"); actions.className = "table-actions"; actions.append(actionButton("Edit", "edit-teacher", record.id)); if (record.active) actions.append(actionButton("Deactivate", "deactivate-teacher", record.id));
      row.append(id, name, login, assigned, state, actions); body.append(row);
    });
    if (!management.teachers.length) { const row = document.createElement("tr"); row.innerHTML = '<td colspan="6">No teachers match the selected filters.</td>'; body.append(row); }
  }
  function showTeacher(record = null) {
    const form = document.querySelector("#teacher-form"); if (!form) return; form.reset();
    document.querySelector("#teacher-dialog-title").textContent = record ? "Edit Teacher" : "Add Teacher";
    form.elements.id.value = record?.id || ""; form.elements.full_name.value = record?.full_name || ""; form.elements.teacher_id.value = record?.teacher_id || ""; form.elements.login_id.value = record?.login_id || "";
    form.elements.email.value = record?.email || ""; form.elements.phone.value = record?.phone || ""; form.elements.active.checked = record ? Boolean(record.active) : true;
    form.elements.password.required = !record; document.querySelector("#teacher-password-help").textContent = record ? "Leave blank to keep the current password" : "Required for a new account";
    gradeOptions(form.elements.class_code, record?.class_code || "", true); openDialog("teacher-dialog");
  }

  async function refreshStudents() {
    const form = document.querySelector("#student-filter"); const params = new URLSearchParams();
    if (form?.elements.query.value.trim()) params.set("query", form.elements.query.value.trim()); if (form?.elements.class.value) params.set("class", form.elements.class.value);
    const result = await api(`/api/admin/students${params.size ? `?${params}` : ""}`); management.students = result.students; renderStudents();
  }
  function renderStudents() {
    const body = document.querySelector("#students-table tbody"); if (!body) return; body.replaceChildren();
    management.students.forEach((record) => {
      const row = document.createElement("tr"); row.dataset.id = record.id;
      const roll = document.createElement("td"); roll.textContent = String(record.roll_number).padStart(2, "0");
      const name = document.createElement("th"); name.scope = "row"; name.textContent = record.full_name;
      const grade = document.createElement("td"); const link = document.createElement("a"); link.href = `admin-class-details.html?class=${record.class_code}`; link.textContent = record.class_name; grade.append(link);
      const state = document.createElement("td"); state.append(statusCell(record.active));
      const actions = document.createElement("td"); actions.className = "table-actions"; actions.append(actionButton("Edit", "edit-student", record.id)); if (record.active) actions.append(actionButton("Deactivate", "deactivate-student", record.id));
      row.append(roll, name, grade, state, actions); body.append(row);
    });
    if (!management.students.length) { const row = document.createElement("tr"); row.innerHTML = '<td colspan="5">No students match the selected filters.</td>'; body.append(row); }
  }
  function showStudent(record = null) {
    const form = document.querySelector("#student-form"); if (!form) return; form.reset();
    document.querySelector("#student-dialog-title").textContent = record ? "Edit Student" : "Add Student";
    form.elements.id.value = record?.id || ""; form.elements.full_name.value = record?.full_name || ""; form.elements.roll_number.value = record?.roll_number || ""; form.elements.active.checked = record ? Boolean(record.active) : true;
    gradeOptions(form.elements.class_code, record?.class_code || "", false); openDialog("student-dialog");
  }
  function showClass(record = null) {
    const form = document.querySelector("#class-form"); if (!form) return; form.reset();
    document.querySelector("#class-dialog-title").textContent = record ? "Edit Grade" : "Reactivate Grade";
    form.elements.id.value = record?.id || ""; form.elements.code.value = record?.code || "grade-1"; form.elements.code.disabled = Boolean(record); form.elements.name.value = record?.name || form.elements.code.options[form.elements.code.selectedIndex].text;
    form.elements.active.checked = record ? Boolean(record.active) : true; teacherOptions(form.elements.teacher_id, record?.class_teacher_id || ""); openDialog("class-dialog");
  }

  function wireAdminManagement() {
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => closeDialog(button.dataset.closeDialog)));
    document.querySelector("#add-teacher-button")?.addEventListener("click", () => showTeacher());
    document.querySelector("#add-student-button")?.addEventListener("click", () => showStudent());
    document.querySelector("#add-class-button")?.addEventListener("click", () => showClass());
    document.querySelector("#teacher-filter")?.addEventListener("submit", async (event) => { event.preventDefault(); try { await refreshTeachers(); } catch (error) { showMessage(error.message, "error"); } });
    document.querySelector("#student-filter")?.addEventListener("submit", async (event) => { event.preventDefault(); try { await refreshStudents(); } catch (error) { showMessage(error.message, "error"); } });
    document.querySelector("#teachers-table")?.addEventListener("click", async (event) => { const button = event.target.closest("button"); if (!button) return; const record = management.teachers.find((item) => String(item.id) === button.dataset.id); if (!record) return; if (button.dataset.action === "edit-teacher") showTeacher(record); if (button.dataset.action === "deactivate-teacher" && window.confirm(`Deactivate ${record.full_name}'s login account?`)) { try { await api(`/api/admin/teachers/${record.id}`, { method: "DELETE" }); await refreshClasses(); await refreshTeachers(); showMessage("Teacher account deactivated."); } catch (error) { showMessage(error.message, "error"); } } });
    document.querySelector("#students-table")?.addEventListener("click", async (event) => { const button = event.target.closest("button"); if (!button) return; const record = management.students.find((item) => String(item.id) === button.dataset.id); if (!record) return; if (button.dataset.action === "edit-student") showStudent(record); if (button.dataset.action === "deactivate-student" && window.confirm(`Deactivate ${record.full_name}'s student record?`)) { try { await api(`/api/admin/students/${record.id}`, { method: "DELETE" }); await refreshStudents(); showMessage("Student record deactivated."); } catch (error) { showMessage(error.message, "error"); } } });
    document.querySelector("#classes-table")?.addEventListener("click", async (event) => { const button = event.target.closest("button"); if (!button) return; const record = management.classes.find((item) => String(item.id) === button.dataset.id); if (!record) return; if (button.dataset.action === "edit-class") showClass(record); if (button.dataset.action === "deactivate-class" && window.confirm(`Deactivate ${record.name}? Its student history will be retained.`)) { try { await api(`/api/admin/classes/${record.id}`, { method: "DELETE" }); await refreshClasses(); await refreshTeachers(); showMessage("Grade deactivated."); } catch (error) { showMessage(error.message, "error"); } } });
    document.querySelector("#teacher-form")?.addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const id = form.elements.id.value; const data = { full_name: form.elements.full_name.value, teacher_id: form.elements.teacher_id.value, login_id: form.elements.login_id.value, password: form.elements.password.value, email: form.elements.email.value, phone: form.elements.phone.value, class_code: form.elements.class_code.value, active: form.elements.active.checked }; try { await api(id ? `/api/admin/teachers/${id}` : "/api/admin/teachers", { method: id ? "PUT" : "POST", body: JSON.stringify(data) }); closeDialog("teacher-dialog"); await refreshClasses(); await refreshTeachers(); showMessage(id ? "Teacher updated successfully." : "Teacher added successfully."); } catch (error) { showMessage(error.message, "error"); } });
    document.querySelector("#student-form")?.addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const id = form.elements.id.value; const data = { full_name: form.elements.full_name.value, roll_number: form.elements.roll_number.value, class_code: form.elements.class_code.value, active: form.elements.active.checked }; try { await api(id ? `/api/admin/students/${id}` : "/api/admin/students", { method: id ? "PUT" : "POST", body: JSON.stringify(data) }); closeDialog("student-dialog"); await refreshClasses(); await refreshStudents(); showMessage(id ? "Student updated successfully." : "Student added successfully."); } catch (error) { showMessage(error.message, "error"); } });
    document.querySelector("#class-form")?.addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; const id = form.elements.id.value; const data = { code: form.elements.code.value, name: form.elements.name.value, teacher_id: form.elements.teacher_id.value, active: form.elements.active.checked }; try { await api(id ? `/api/admin/classes/${id}` : "/api/admin/classes", { method: id ? "PUT" : "POST", body: JSON.stringify(data) }); closeDialog("class-dialog"); await refreshClasses(); await refreshTeachers(); showMessage(id ? "Grade updated successfully." : "Grade activated successfully."); } catch (error) { showMessage(error.message, "error"); } });
  }
  async function initAdminManagement() {
    if (!document.querySelector("#teachers-table, #students-table, #classes-table")) return;
    try { await refreshClasses(); await refreshTeachers(); await refreshStudents(); wireAdminManagement(); } catch (error) { showMessage(error.message, "error"); }
  }

  document.addEventListener("DOMContentLoaded", () => { initLogin(); initAttendance(); loadAttendanceRoster(); initTestForm(); initTestRecordActions(); loadAttendanceRecords(); loadDashboard(); initClassDetails(); initGenericForms(); initAdminManagement(); });
})();
