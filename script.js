/* ===================================================
   SREE SHARAVAANI TUTORIALS
   Monthly Progress Report Generator - script.js
   Frontend only. Data persisted in LocalStorage.
=================================================== */

(function () {
  "use strict";

  /* ------------- Constants & state ------------- */
  const STORAGE_KEY = "sst_progress_reports_v2";
  const MAX_MARKS_KEY = "sst_max_marks_v1";
  const LOGO_KEY = "sst_tuition_logo_v1";
  const DEFAULT_MAX_MARKS = 100;
  const WEEKS = 5;
  const EXAMS_PER_WEEK = 2;

  /** Currently opened saved record id (null when creating a new report). */
  let currentRecordId = null;

  /** Tuition logo as a base64 data URL, persisted across sessions. */
  let currentLogo = null;

  /* ------------- Small DOM helpers ------------- */

  /** Shorthand for document.getElementById. */
  function el(id) {
    return document.getElementById(id);
  }

  /** Escape a string so it is safe to inject as HTML text. */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Show a temporary toast message at the bottom of the screen. */
  function toast(message, type) {
    let node = document.querySelector(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      document.body.appendChild(node);
    }
    node.className = "toast " + (type || "");
    node.textContent = message;
    // Force reflow so repeated toasts re-animate.
    void node.offsetWidth;
    node.classList.add("show");
    clearTimeout(node._timer);
    node._timer = setTimeout(function () {
      node.classList.remove("show");
    }, 2600);
  }

  /** Format "2026-08" into "August 2026"; returns "—" when empty. */
  function formatMonth(value) {
    if (!value) return "—";
    const parts = value.split("-");
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }

  /** Format an ISO timestamp into a readable date. */
  function formatDate(iso) {
    const date = iso ? new Date(iso) : new Date();
    return date.toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric"
    });
  }

  /** Create a reasonably unique record id. */
  function makeId() {
    return "R" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ------------- Row building ------------- */

  const DEFAULT_SUBJECT = "Mixed Subjects";

  /** Build the five editable week rows of the entry form.
   *  Each week has its own subject and its own maximum marks per exam. */
  function buildWeekRows() {
    const defaultMax = loadMaxMarks();
    let html = "";
    for (let i = 1; i <= WEEKS; i++) {
      html +=
        '<tr>' +
          '<td class="week-label">Week ' + i + '</td>' +
          '<td><input type="text" class="subject-input" id="w' + i + 'subject" ' +
            'value="' + escapeHtml(DEFAULT_SUBJECT) + '" placeholder="Subject"></td>' +
          '<td><input type="number" class="max-input" id="w' + i + 'max1" min="1" step="1" value="' + defaultMax + '" title="Max marks for Exam 1"></td>' +
          '<td><input type="number" id="w' + i + 'e1" min="0" step="1" placeholder="0"></td>' +
          '<td><input type="number" class="max-input" id="w' + i + 'max2" min="1" step="1" value="' + defaultMax + '" title="Max marks for Exam 2"></td>' +
          '<td><input type="number" id="w' + i + 'e2" min="0" step="1" placeholder="0"></td>' +
          '<td class="week-total" id="w' + i + 'total">0</td>' +
        '</tr>';
    }
    el("weekRows").innerHTML = html;
  }

  /** Build the five read-only week rows of the progress card preview. */
  function buildPreviewRows() {
    let html = "";
    for (let i = 1; i <= WEEKS; i++) {
      html +=
        '<tr>' +
          '<td>Week ' + i + '</td>' +
          '<td class="subject-cell" id="pw' + i + 'subject">' + escapeHtml(DEFAULT_SUBJECT) + '</td>' +
          '<td id="pw' + i + 'e1">0</td>' +
          '<td id="pw' + i + 'e2">0</td>' +
          '<td id="pw' + i + '">0</td>' +
        '</tr>';
    }
    el("pWeekRows").innerHTML = html;
  }

  /* ------------- Marks & validation ------------- */

  /** Clamp a numeric input between 0 and a maximum, flagging invalid values. */
  function clampInput(input, max) {
    let value = Number(input.value);
    if (input.value === "") return 0;
    if (isNaN(value)) value = 0;

    let corrected = value;
    if (value < 0) corrected = 0;
    if (value > max) corrected = max;

    if (corrected !== value) {
      input.value = corrected;
      input.classList.add("invalid");
      setTimeout(function () { input.classList.remove("invalid"); }, 1200);
      toast("Value adjusted to allowed range (0 - " + max + ")", "error");
    }
    return corrected;
  }

  /** Read a week's "maximum marks for this exam" field, defaulting sensibly. */
  function readMaxInput(input) {
    let value = Number(input.value);
    if (input.value === "" || isNaN(value) || value < 1) {
      value = DEFAULT_MAX_MARKS;
      input.value = value;
    }
    return value;
  }

  /** Read all weekly marks from the form. Every week can have its own subject
   *  and its own maximum marks per exam; the total is always Exam 1 + Exam 2. */
  function readMarks() {
    const weeks = [];

    for (let i = 1; i <= WEEKS; i++) {
      const subject = el("w" + i + "subject").value.trim() || DEFAULT_SUBJECT;
      const max1 = readMaxInput(el("w" + i + "max1"));
      const max2 = readMaxInput(el("w" + i + "max2"));
      const exam1 = clampInput(el("w" + i + "e1"), max1);
      const exam2 = clampInput(el("w" + i + "e2"), max2);
      const total = exam1 + exam2;

      const totalCell = el("w" + i + "total");
      if (totalCell) totalCell.textContent = total;

      weeks.push({
        subject: subject,
        max1: max1, exam1: exam1,
        max2: max2, exam2: exam2,
        total: total
      });
    }
    return weeks;
  }


  /** Return the performance grade for a percentage. */
  function gradeFor(percentage) {
    if (percentage >= 90) return "Excellent";
    if (percentage >= 75) return "Very Good";
    if (percentage >= 60) return "Good";
    if (percentage >= 40) return "Average";
    return "Needs Improvement";
  }

  /** Compute total possible marks, marks obtained, average, percentage and grade.
   *  Each week's exams can carry their own maximum, so the total possible marks
   *  is the sum of every individual exam's maximum rather than a single fixed value. */
  function computeSummary(weeks) {
    let grandTotal = 0;
    let maximumTotal = 0;
    weeks.forEach(function (week) {
      grandTotal += week.total;
      maximumTotal += week.max1 + week.max2;
    });

    const totalExams = WEEKS * EXAMS_PER_WEEK;
    const average = grandTotal / totalExams;
    const percentage = maximumTotal > 0 ? (grandTotal / maximumTotal) * 100 : 0;

    return {
      maximumTotal: maximumTotal,
      grandTotal: grandTotal,
      average: average,
      percentage: percentage,
      grade: gradeFor(percentage)
    };
  }

  /** Recalculate the summary panel from the current form values. */
  function refreshSummary() {
    const summary = computeSummary(readMarks());

    el("totalMarks").textContent = summary.maximumTotal;
    el("grandTotal").textContent = summary.grandTotal;
    el("average").textContent = summary.average.toFixed(2);
    el("percentage").textContent = summary.percentage.toFixed(2) + "%";
    el("grade").textContent = summary.grade;
    return summary;
  }

  /* ------------- Form <-> record ------------- */

  /** Collect the whole form into a plain report object. */
  function collectForm() {
    const weeks = readMarks();
    const summary = computeSummary(weeks);

    return {
      id: currentRecordId || makeId(),
      studentName: el("studentName").value.trim(),
      studentClass: el("studentClass").value.trim(),
      schoolName: el("schoolName").value.trim(),
      month: el("month").value,
      weeks: weeks,
      remarks: el("remarks").value.trim(),
      summary: summary,
      createdAt: new Date().toISOString()
    };
  }

  /** Fill the entry form from a saved report record. */
  function fillForm(record) {
    currentRecordId = record.id;
    el("studentName").value = record.studentName || "";
    el("studentClass").value = record.studentClass || "";
    el("schoolName").value = record.schoolName || "";
    el("month").value = record.month || "";
    el("remarks").value = record.remarks || "";

    for (let i = 1; i <= WEEKS; i++) {
      const defaults = { subject: DEFAULT_SUBJECT, max1: DEFAULT_MAX_MARKS, exam1: 0, max2: DEFAULT_MAX_MARKS, exam2: 0, total: 0 };
      const week = (record.weeks && record.weeks[i - 1]) || defaults;
      el("w" + i + "subject").value = week.subject || DEFAULT_SUBJECT;
      el("w" + i + "max1").value = week.max1 || DEFAULT_MAX_MARKS;
      el("w" + i + "e1").value = week.exam1;
      el("w" + i + "max2").value = week.max2 || DEFAULT_MAX_MARKS;
      el("w" + i + "e2").value = week.exam2;
    }

    refreshSummary();
    renderPreview(record);
  }

  /** Validate required fields before generating or saving. */
  function validateForm() {
    const checks = [
      { id: "studentName", label: "Student name" },
      { id: "studentClass", label: "Class" },
      { id: "month", label: "Month" }
    ];

    for (let i = 0; i < checks.length; i++) {
      const input = el(checks[i].id);
      if (!input.value.trim()) {
        input.classList.add("invalid");
        input.focus();
        setTimeout(function () { input.classList.remove("invalid"); }, 1500);
        toast(checks[i].label + " is required.", "error");
        return false;
      }
    }
    return true;
  }

  /* ------------- Progress card rendering ------------- */

  /** Render a record into the live preview card in the centre panel. */
  function renderPreview(record) {
    el("pName").textContent = record.studentName || "—";
    el("pHeadName").textContent = record.studentName || "—";
    el("pClass").textContent = record.studentClass || "—";
    el("pSchool").textContent = record.schoolName || "—";
    el("pMonth").textContent = formatMonth(record.month);
    applyLogo(el("pLogo"), currentLogo);

    for (let i = 1; i <= WEEKS; i++) {
      const week = record.weeks[i - 1];
      el("pw" + i + "subject").textContent = week.subject || DEFAULT_SUBJECT;
      el("pw" + i + "e1").textContent = week.exam1 + "/" + week.max1;
      el("pw" + i + "e2").textContent = week.exam2 + "/" + week.max2;
      el("pw" + i).textContent = week.total + "/" + (week.max1 + week.max2);
    }

    el("pTotalMarks").textContent = record.summary.maximumTotal;
    el("pGrand").textContent = record.summary.grandTotal;
    el("pAverage").textContent = record.summary.average.toFixed(2);
    el("pPercentage").textContent = record.summary.percentage.toFixed(2) + "%";
    el("pGrade").textContent = record.summary.grade;
    el("pRemarks").textContent = record.remarks || "—";
    el("pDate").textContent = formatDate(record.createdAt);
  }

  /** Build a standalone progress-card HTML string for printing a record. */
  function buildCardHtml(record) {
    let rows = "";
    for (let i = 0; i < WEEKS; i++) {
      const week = record.weeks[i] || { subject: DEFAULT_SUBJECT, max1: DEFAULT_MAX_MARKS, exam1: 0, max2: DEFAULT_MAX_MARKS, exam2: 0, total: 0 };
      rows +=
        "<tr><td>Week " + (i + 1) + "</td>" +
        "<td class=\"subject-cell\">" + escapeHtml(week.subject || DEFAULT_SUBJECT) + "</td>" +
        "<td>" + week.exam1 + "/" + week.max1 + "</td>" +
        "<td>" + week.exam2 + "/" + week.max2 + "</td>" +
        "<td>" + week.total + "/" + (week.max1 + week.max2) + "</td></tr>";
    }

    const logoHtml = currentLogo
      ? '<img class="sheet-logo" src="' + currentLogo + '" alt="Tuition logo">'
      : "";

    return (
      '<article class="card-sheet">' +
        '<div class="sheet-head">' + logoHtml + '<h2>SREE SHARAVAANI TUTORIALS</h2>' +
        '<p>Monthly Progress Report</p>' +
        '<p class="sheet-student"><b>' + escapeHtml(record.studentName || "—") + '</b></p></div>' +
        '<div class="sheet-meta">' +
          '<div><span>Student Name</span><b>' + escapeHtml(record.studentName || "—") + '</b></div>' +
          '<div><span>Class</span><b>' + escapeHtml(record.studentClass || "—") + '</b></div>' +
          '<div><span>Month</span><b>' + escapeHtml(formatMonth(record.month)) + '</b></div>' +
          '<div class="meta-full"><span>School</span><b>' + escapeHtml(record.schoolName || "—") + '</b></div>' +
        '</div>' +
        '<table class="sheet-table"><thead><tr><th>Week</th><th>Subject</th><th>Exam 1</th>' +
        '<th>Exam 2</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="sheet-summary">' +
          '<div><span>Total Marks</span><b>' + record.summary.maximumTotal + '</b></div>' +
          '<div><span>Marks Obtained</span><b>' + record.summary.grandTotal + '</b></div>' +
          '<div><span>Average</span><b>' + record.summary.average.toFixed(2) + '</b></div>' +
          '<div><span>Percentage</span><b>' + record.summary.percentage.toFixed(2) + '%</b></div>' +
          '<div><span>Grade</span><b>' + escapeHtml(record.summary.grade) + '</b></div>' +
        '</div>' +
        '<div class="sheet-remarks"><span>Remarks</span><p>' +
          escapeHtml(record.remarks || "—") + '</p></div>' +
        '<div class="sheet-signs">' +
          '<div><span class="sign-line"></span><small>Mother Signature</small></div>' +
          '<div><span class="sign-line"></span><small>Father Signature</small></div>' +
        '</div>' +
        '<p class="sheet-foot">Generated on ' + escapeHtml(formatDate(record.createdAt)) + '</p>' +
      '</article>'
    );
  }

  /** Build the print-area markup for one record, duplicated twice per A4 sheet
   *  (when two-up is enabled) with a dashed cut line between the two copies. */
  function buildPrintPage(record, twoUp) {
    if (!twoUp) return buildCardHtml(record);
    return (
      '<div class="print-pair">' +
        buildCardHtml(record) +
        '<div class="cut-line"></div>' +
        buildCardHtml(record) +
      '</div>'
    );
  }

  /* ------------- Tuition logo & max-marks persistence ------------- */

  /** Load the persisted tuition logo (data URL) from LocalStorage, if any. */
  function loadLogo() {
    try {
      return localStorage.getItem(LOGO_KEY) || null;
    } catch (error) {
      return null;
    }
  }

  /** Persist (or clear, when value is null) the tuition logo. */
  function saveLogo(dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(LOGO_KEY, dataUrl);
      else localStorage.removeItem(LOGO_KEY);
      return true;
    } catch (error) {
      toast("Could not save logo — it may be too large.", "error");
      return false;
    }
  }

  /** Show or hide an <img> element depending on whether a logo is set. */
  function applyLogo(imgEl, dataUrl) {
    if (!imgEl) return;
    if (dataUrl) {
      imgEl.src = dataUrl;
      imgEl.hidden = false;
    } else {
      imgEl.removeAttribute("src");
      imgEl.hidden = true;
    }
  }

  /** Refresh every place the logo is shown (entry form thumbnail + preview card). */
  function refreshLogoUi() {
    applyLogo(el("logoPreviewThumb"), currentLogo);
    applyLogo(el("pLogo"), currentLogo);
    el("btnRemoveLogo").hidden = !currentLogo;
  }

  /** Handle a new file chosen in the logo upload input. */
  function handleLogoUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file for the logo.", "error");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = function () {
      currentLogo = reader.result;
      if (saveLogo(currentLogo)) {
        refreshLogoUi();
        toast("Tuition logo updated.", "success");
      }
    };
    reader.onerror = function () {
      toast("Could not read that image.", "error");
    };
    reader.readAsDataURL(file);
  }

  /** Remove the stored tuition logo. */
  function removeLogo() {
    currentLogo = null;
    saveLogo(null);
    el("logoUpload").value = "";
    refreshLogoUi();
    toast("Logo removed.", "success");
  }

  /** Load the persisted "maximum marks per exam" value, defaulting when unset. */
  function loadMaxMarks() {
    try {
      const stored = localStorage.getItem(MAX_MARKS_KEY);
      const value = Number(stored);
      return stored && !isNaN(value) && value > 0 ? value : DEFAULT_MAX_MARKS;
    } catch (error) {
      return DEFAULT_MAX_MARKS;
    }
  }

  /** Persist the "maximum marks per exam" value so it survives reloads. */
  function saveMaxMarks(value) {
    try {
      localStorage.setItem(MAX_MARKS_KEY, String(value));
    } catch (error) {
      // Non-fatal: the value simply won't be remembered next time.
    }
  }

  /* ------------- LocalStorage queue ------------- */

  /** Load every saved report from LocalStorage. */
  function loadReports() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (error) {
      console.error("Unable to read saved reports:", error);
      return [];
    }
  }

  /** Persist the full list of reports to LocalStorage. */
  function persistReports(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (error) {
      console.error("Unable to save reports:", error);
      toast("Storage is full — could not save.", "error");
      return false;
    }
  }

  /** Find one saved report by its id. */
  function findReport(id) {
    return loadReports().filter(function (item) { return item.id === id; })[0] || null;
  }

  /** Append a brand-new record to the queue (never overwrites). */
  function saveReport() {
    if (!validateForm()) return;

    const record = collectForm();
    record.id = makeId();          // every save creates a new queue entry
    record.createdAt = new Date().toISOString();

    const list = loadReports();
    list.unshift(record);
    if (!persistReports(list)) return;

    currentRecordId = record.id;
    renderPreview(record);
    renderQueue();
    toast("Report saved to the queue.", "success");
  }

  /** Delete a single record after confirmation. */
  function deleteReport(id) {
    const record = findReport(id);
    if (!record) return;
    if (!window.confirm('Delete the report for "' + (record.studentName || "this student") + '"?')) return;

    const list = loadReports().filter(function (item) { return item.id !== id; });
    persistReports(list);
    if (currentRecordId === id) currentRecordId = null;
    renderQueue();
    toast("Report deleted.", "success");
  }

  /** Load a saved record back into the form and preview. */
  function openReport(id) {
    const record = findReport(id);
    if (!record) return;
    fillForm(record);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Loaded " + (record.studentName || "report") + ".");
  }

  /* ------------- Queue rendering & search ------------- */

  /** Filter saved reports by name, class or month. */
  function filterReports(list, term) {
    const query = term.trim().toLowerCase();
    if (!query) return list;

    return list.filter(function (item) {
      const haystack = [
        item.studentName,
        item.studentClass,
        item.month,
        formatMonth(item.month)
      ].join(" ").toLowerCase();
      return haystack.indexOf(query) !== -1;
    });
  }

  /** Render the saved-reports queue panel. */
  function renderQueue() {
    const list = filterReports(loadReports(), el("searchInput").value);
    const container = el("queueList");

    el("queueCount").textContent =
      list.length + (list.length === 1 ? " report" : " reports");

    if (!list.length) {
      container.innerHTML =
        '<li class="empty-state"><i class="fa-regular fa-folder-open"></i>' +
        "No saved reports found.</li>";
      return;
    }

    container.innerHTML = list.map(function (record) {
      return (
        '<li class="queue-item">' +
          "<h4>" + escapeHtml(record.studentName || "Unnamed student") + "</h4>" +
          "<p>" + escapeHtml(record.schoolName || "School not set") +
            " &middot; Saved " + escapeHtml(formatDate(record.createdAt)) + "</p>" +
          '<div class="queue-badges">' +
            '<span class="badge">Class ' + escapeHtml(record.studentClass || "—") + "</span>" +
            '<span class="badge">' + escapeHtml(formatMonth(record.month)) + "</span>" +
            '<span class="badge badge-grade">' + escapeHtml(record.summary.grade) + "</span>" +
          "</div>" +
          '<div class="queue-actions">' +
            '<button type="button" class="icon-btn" data-action="open" data-id="' + record.id +
              '" title="Open"><i class="fa-solid fa-folder-open"></i></button>' +
            '<button type="button" class="icon-btn" data-action="print" data-id="' + record.id +
              '" title="Print"><i class="fa-solid fa-print"></i></button>' +
            '<button type="button" class="icon-btn danger" data-action="delete" data-id="' + record.id +
              '" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
          "</div>" +
        "</li>"
      );
    }).join("");
  }

  /* ------------- Actions ------------- */

  /** Validate, recalculate and render the current form into the preview card. */
  function generateCard() {
    if (!validateForm()) return;
    const record = collectForm();
    renderPreview(record);
    toast("Progress card generated.", "success");
  }

  /** Print the report currently shown in the entry form / preview panel. */
  function printCurrent() {
    if (!validateForm()) return;
    generateCardSilently();
    printRecord(collectForm());
  }

  /** Refresh the preview card without showing a toast. */
  function generateCardSilently() {
    renderPreview(collectForm());
  }

  /** Print only one saved record, isolated from the dashboard. */
  function printReport(id) {
    const record = findReport(id);
    if (!record) return;
    printRecord(record);
  }

  /** Render a record into the hidden print area and open the print dialog.
   *  When the "2 cards / sheet" toggle is on, the card is duplicated once
   *  with a dashed cut line so two copies fit on a single A4 sheet — one to
   *  keep on file, one to hand to the student. */
  function printRecord(record) {
    const twoUp = el("twoUpToggle").checked;
    const area = el("printArea");
    area.innerHTML = buildPrintPage(record, twoUp);
    document.body.classList.add("printing-single");
    window.print();
    // Clean up shortly after the print dialog is dismissed.
    setTimeout(function () {
      document.body.classList.remove("printing-single");
      area.innerHTML = "";
    }, 800);
  }

  /** Clear the entry form only; saved reports stay untouched.
   *  The "default max marks" value is intentionally kept as-is — it stays
   *  remembered until the user changes it, and is used to prefill each week. */
  function clearForm() {
    if (!window.confirm("Clear the current form? Saved reports will not be deleted.")) return;

    const keepMaxMarks = el("maxMarks").value;
    el("reportForm").reset();
    el("maxMarks").value = keepMaxMarks;
    buildWeekRows(); // repopulates subject + max fields with the current default
    currentRecordId = null;
    refreshSummary();
    renderPreview(collectForm());
    toast("Form cleared.", "success");
  }

  /* ------------- Event wiring ------------- */

  /** Attach every event listener used by the application. */
  function bindEvents() {
    el("btnGenerate").addEventListener("click", generateCard);
    el("btnSave").addEventListener("click", saveReport);
    el("btnPrint").addEventListener("click", printCurrent);
    el("btnClear").addEventListener("click", clearForm);

    el("searchInput").addEventListener("input", renderQueue);
    el("maxMarks").addEventListener("input", function () {
      saveMaxMarks(el("maxMarks").value || DEFAULT_MAX_MARKS);
      refreshSummary();
    });

    el("logoUpload").addEventListener("change", handleLogoUpload);
    el("btnRemoveLogo").addEventListener("click", removeLogo);

    // Live summary + auto-calculated totals inside the marks table.
    el("weekRows").addEventListener("input", refreshSummary);

    // Queue actions (event delegation).
    el("queueList").addEventListener("click", function (event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "open") openReport(id);
      else if (button.dataset.action === "print") printReport(id);
      else if (button.dataset.action === "delete") deleteReport(id);
    });

    // Never leave the page stuck in single-print mode.
    window.addEventListener("afterprint", function () {
      document.body.classList.remove("printing-single");
      el("printArea").innerHTML = "";
    });
  }

  /** Bootstrap the application. */
  function init() {
    buildWeekRows();
    buildPreviewRows();
    el("maxMarks").value = String(loadMaxMarks());
    currentLogo = loadLogo();
    refreshLogoUi();
    bindEvents();
    refreshSummary();
    renderPreview(collectForm());
    renderQueue();
  }

  document.addEventListener("DOMContentLoaded", init);
})();