(() => {
  "use strict";

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  const demoTests = [
    { id: "demo-test-001", title: "Fractions Checkpoint", subject: "Mathematics", date: "2026-09-18", className: "Grade 7", marks: 20, url: "https://docs.google.com/forms/" },
    { id: "demo-test-002", title: "Plants and Their Uses", subject: "Science", date: "2026-09-12", className: "Grade 7", marks: 15, url: "https://docs.google.com/forms/" }
  ];

  function showMessage(message, state = "success") {
    const old = document.querySelector(".toast-message");
    if (old) old.remove();
    const toast = document.createElement("p");
    toast.className = "toast-message";
    toast.dataset.state = state;
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.append(toast);
    window.setTimeout(() => toast.remove(), 4200);
  }

  function formatDate(value) {
    if (!value) return "Not scheduled";
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function getTests() {
    const saved = storage.get("cepTests", null);
    if (!saved) { storage.set("cepTests", demoTests); return demoTests; }
    return saved;
  }

  function setTests(tests) { storage.set("cepTests", tests); }

  function initLogin() {
    const form = document.querySelector("#login-form");
    if (!form) return;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const selectedRole = form.querySelector('input[name="role"]:checked')?.value;
      const user = { role: selectedRole, loginId: form.elements.login_id.value.trim() };
      storage.set("cepCurrentUser", user);
      window.location.href = selectedRole === "admin" ? "admin-dashboard.html" : "teacher-dashboard.html";
    });
  }

  function initAttendance() {
    const form = document.querySelector("#attendance-form");
    if (!form) return;
    const selectAll = document.querySelector("#select-all-present");
    selectAll?.addEventListener("change", () => {
      if (!selectAll.checked) return;
      form.querySelectorAll('input[type="radio"][value="present"]').forEach((input) => { input.checked = true; });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const entries = [...form.querySelectorAll("tbody tr[data-student-id]")].map((row) => ({
        studentId: row.dataset.studentId,
        status: row.querySelector('input[type="radio"]:checked')?.value || "absent"
      }));
      storage.set("cepAttendance", { date: form.elements.attendance_date.value, className: form.elements.class_name.value, entries });
      const success = document.querySelector("#attendance-success-message");
      if (success) success.hidden = false;
      showMessage("Attendance submitted successfully. This demo record is saved in this browser.");
    });
  }

  function initTestForm() {
    const form = document.querySelector("#test-form");
    if (!form) return;
    const queryTestId = new URLSearchParams(window.location.search).get("test");
    const existing = getTests().find((test) => test.id === queryTestId);
    if (existing) {
      form.elements.title.value = existing.title;
      form.elements.subject.value = existing.subject;
      form.elements.test_date.value = existing.date;
      form.elements.total_marks.value = existing.marks;
      form.elements.google_form_url.value = existing.url;
      document.querySelector("#save-test").textContent = "Save Changes";
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const tests = getTests();
      const test = {
        id: queryTestId || `local-test-${Date.now()}`,
        title: form.elements.title.value.trim(),
        subject: form.elements.subject.value.trim(),
        date: form.elements.test_date.value,
        className: form.elements.class_name.value,
        marks: Number(form.elements.total_marks.value),
        questions: Number(form.elements.question_count.value),
        url: form.elements.google_form_url.value.trim(),
        description: form.elements.description.value.trim()
      };
      const updated = existing ? tests.map((item) => item.id === test.id ? test : item) : [test, ...tests];
      setTests(updated);
      const success = document.querySelector("#test-success-message");
      if (success) success.hidden = false;
      showMessage(existing ? "Test details updated successfully." : "Test saved successfully.");
      window.setTimeout(() => { window.location.href = "teacher-test-records.html"; }, 700);
    });
  }

  function renderTeacherTestRecords() {
    const table = document.querySelector("#test-records-table tbody");
    if (!table) return;
    const tests = getTests();
    table.innerHTML = "";
    tests.forEach((test) => {
      const row = document.createElement("tr");
      row.dataset.testId = test.id;
      row.innerHTML = `<th scope="row"></th><td></td><td><time></time></td><td></td><td></td><td><a target="_blank" rel="noopener" data-action="open-google-form">Open form</a></td><td><a data-action="edit-test">Edit</a> <button type="button" data-action="copy-test-link">Copy link</button> <button type="button" data-action="delete-test">Delete</button></td>`;
      row.querySelector("th").textContent = test.title;
      row.children[1].textContent = test.subject;
      const time = row.querySelector("time"); time.dateTime = test.date; time.textContent = formatDate(test.date);
      row.children[3].textContent = test.className;
      row.children[4].textContent = test.marks;
      const open = row.querySelector('[data-action="open-google-form"]'); open.href = test.url;
      row.querySelector('[data-action="edit-test"]').href = `teacher-test.html?test=${encodeURIComponent(test.id)}`;
      table.append(row);
    });
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      showMessage("Google Form link copied to clipboard.");
    } catch {
      window.prompt("Copy this Google Form link:", value);
    }
  }

  function initTestRecordActions() {
    const table = document.querySelector("#test-records-table");
    if (!table) return;
    renderTeacherTestRecords();
    table.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const row = button.closest("tr[data-test-id]");
      const test = getTests().find((item) => item.id === row?.dataset.testId);
      if (!test) return;
      if (button.dataset.action === "copy-test-link") copyText(test.url);
      if (button.dataset.action === "delete-test") {
        if (!window.confirm(`Delete “${test.title}” from this browser demo?`)) return;
        setTests(getTests().filter((item) => item.id !== test.id));
        renderTeacherTestRecords();
        showMessage("Test record deleted.");
      }
    });
  }

  function initClassDetails() {
    const page = document.querySelector(".class-details-page");
    if (!page) return;
    const classValue = new URLSearchParams(window.location.search).get("class");
    if (!classValue) return;
    const readableName = classValue.replace("grade-", "Grade ");
    page.dataset.classId = classValue;
    document.querySelectorAll('[data-class-name="grade-7"]').forEach((element) => { element.textContent = readableName; });
    document.title = `${readableName} Details`;
  }

  function initGenericForms() {
    document.querySelectorAll(".filter-form").forEach((form) => {
      form.addEventListener("submit", (event) => { event.preventDefault(); showMessage("Filters are ready. Live data will be connected in the Flask stage."); });
    });
    const profile = document.querySelector("#profile-form");
    profile?.addEventListener("submit", (event) => { event.preventDefault(); if (profile.reportValidity()) showMessage("Profile saved in the prototype."); });
    const password = document.querySelector("#change-password-form");
    password?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!password.reportValidity()) return;
      if (password.elements.new_password.value !== password.elements.confirm_password.value) { showMessage("New passwords do not match.", "error"); return; }
      showMessage("Password update request recorded for the prototype.");
      password.reset();
    });
    const reset = document.querySelector("#reset-password-form");
    reset?.addEventListener("submit", (event) => { event.preventDefault(); if (reset.reportValidity()) showMessage("Password reset request submitted for the prototype."); });
    document.querySelectorAll('[data-action="generate-report"]').forEach((button) => {
      button.addEventListener("click", () => showMessage("Report generation will be connected to Flask in a later stage."));
    });
  }

  function initLogout() {
    document.querySelector('[data-action="logout"]')?.addEventListener("click", () => storage.set("cepCurrentUser", null));
  }

  function initCurrentUser() {
    const user = storage.get("cepCurrentUser", null);
    if (!user?.loginId) return;
    document.querySelectorAll("[data-profile-name]").forEach((element) => { element.textContent = user.loginId; });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initLogin();
    initAttendance();
    initTestForm();
    initTestRecordActions();
    initClassDetails();
    initGenericForms();
    initLogout();
    initCurrentUser();
  });
})();
