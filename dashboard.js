"use strict";

const csrfToken = document.querySelector("#csrf-token")?.value || "";
const portalSidebar = document.querySelector(".portal-sidebar");
const portalMenuToggle = document.querySelector("#portal-menu-toggle");

portalMenuToggle?.addEventListener("click", () => {
  const isOpen = portalSidebar.classList.toggle("mobile-nav-open");
  portalMenuToggle.setAttribute("aria-expanded", String(isOpen));
  portalMenuToggle.setAttribute("aria-label", isOpen ? "Close workspace navigation" : "Open workspace navigation");
});

portalSidebar?.querySelector("#portal-nav")?.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    portalSidebar.classList.remove("mobile-nav-open");
    portalMenuToggle?.setAttribute("aria-expanded", "false");
    portalMenuToggle?.setAttribute("aria-label", "Open workspace navigation");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && portalSidebar?.classList.contains("mobile-nav-open")) {
    portalSidebar.classList.remove("mobile-nav-open");
    portalMenuToggle?.setAttribute("aria-expanded", "false");
    portalMenuToggle?.setAttribute("aria-label", "Open workspace navigation");
    portalMenuToggle?.focus();
  }
});

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrfToken;
  } else if (options.method && options.method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken;
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function setStatus(id, message, isError = false) {
  const target = document.querySelector(`#${id}`);
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", isError);
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendCell(row, text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function addOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

document.querySelector("#logout-button")?.addEventListener("click", async (event) => {
  event.currentTarget.disabled = true;
  try {
    const result = await api("/api/logout", { method: "POST" });
    window.location.replace(result.redirect);
  } catch {
    window.location.replace("/login");
  }
});

document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const status = document.querySelector("#profile-status");
  submitButton.disabled = true;
  status.textContent = "Saving your profile…";
  status.classList.remove("error", "success");
  try {
    const { profile } = await api("/api/profile", {
      method: "PUT",
      body: Object.fromEntries(new FormData(form))
    });
    status.textContent = "Your profile has been saved.";
    status.classList.add("success");
    const displayName = profile.profile_name || profile.username;
    document.querySelector(".profile-hero-avatar").textContent = displayName.slice(0, 1).toUpperCase();
    document.querySelector(".profile-side-card h2").textContent = displayName;
    form.querySelector('[name="profileName"]').value = profile.profile_name;
    form.querySelector('[name="email"]').value = profile.email;
    form.querySelector('[name="phone"]').value = profile.phone;
    form.querySelector('[name="bio"]').value = profile.bio;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  } finally {
    submitButton.disabled = false;
  }
});

const usersPerPage = 10;
let adminUsers = [];
let currentUserPage = 1;
let pendingRemovalUserId = null;
let accountToastTimer;

function notifyUserAccounts(message, isError = false) {
  setStatus("user-status", message, isError);
  document.querySelector("#user-status")?.classList.toggle("success", !isError);
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  window.clearTimeout(accountToastTimer);
  accountToastTimer = window.setTimeout(() => toast.classList.remove("show", "error"), 3200);
}

function createPasswordControl(input) {
  const control = make("span", "password-control");
  const toggle = make("button", "password-toggle");
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Show password");
  toggle.setAttribute("aria-pressed", "false");
  toggle.title = "Show password";
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="m3 3 18 18"></path></svg>';
  control.append(input, toggle);
  return control;
}

function renderAdminUsers() {
  const list = document.querySelector("#users-list");
  if (!list) return [];
  const search = document.querySelector("#user-search")?.value.trim().toLocaleLowerCase() || "";
  const roleFilter = document.querySelector("#user-role-filter")?.value || "all";
  const filteredUsers = adminUsers.filter((user) =>
    user.username.toLocaleLowerCase().includes(search) &&
    (roleFilter === "all" || user.role === roleFilter)
  );
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  currentUserPage = totalPages === 0 ? 1 : Math.min(currentUserPage, totalPages);
  const pageUsers = filteredUsers.slice((currentUserPage - 1) * usersPerPage, currentUserPage * usersPerPage);
  const table = make("table", "data-table");
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  ["Username", "Role", "Status", "Created", "Actions"].forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    header.append(cell);
  });
  head.append(header);
  table.append(head);
  const body = document.createElement("tbody");

  pageUsers.forEach((user) => {
    const row = document.createElement("tr");
    appendCell(row, user.username);
    const roleCell = document.createElement("td");
    const roleSelect = document.createElement("select");
    roleSelect.className = "table-select";
    ["Admin", "Teacher", "Student"].forEach((role) => addOption(roleSelect, role, role));
    roleSelect.value = user.role;
    roleSelect.dataset.previousRole = user.role;
    if (user.id === window.currentUserId) {
      roleSelect.disabled = true;
      roleSelect.title = "You cannot change your own role.";
    } else {
      roleSelect.dataset.roleUserId = String(user.id);
    }
    roleCell.append(roleSelect);
    row.append(roleCell);
    const statusCell = document.createElement("td");
    const statusButton = make("button", `account-status ${user.status === "Active" ? "status-active" : "status-inactive"}`);
    statusButton.type = "button";
    statusButton.dataset.userStatusId = String(user.id);
    statusButton.dataset.nextStatus = user.status === "Active" ? "Inactive" : "Active";
    statusButton.disabled = user.id === window.currentUserId;
    statusButton.title = user.id === window.currentUserId ? "You cannot change your own account status." : `Set account ${statusButton.dataset.nextStatus.toLowerCase()}`;
    statusButton.append(make("span", "status-indicator"), document.createTextNode(user.status));
    statusCell.append(statusButton);
    row.append(statusCell);
    appendCell(row, new Date(`${user.created_at.replace(" ", "T")}Z`).toLocaleDateString());
    const actions = document.createElement("td");
    const resetPassword = document.createElement("input");
    resetPassword.type = "password";
    resetPassword.className = "reset-password-input";
    resetPassword.id = `reset-password-${user.id}`;
    resetPassword.placeholder = "New password";
    resetPassword.minLength = 12;
    resetPassword.maxLength = 1024;
    resetPassword.autocomplete = "new-password";
    resetPassword.setAttribute("aria-label", `New password for ${user.username}`);
    resetPassword.dataset.resetPasswordInput = String(user.id);
    resetPassword.disabled = user.id === window.currentUserId;
    const resetControl = createPasswordControl(resetPassword);
    const resetButton = make("button", "small-primary", "Reset");
    resetButton.type = "button";
    resetButton.dataset.resetPasswordId = String(user.id);
    resetButton.disabled = user.id === window.currentUserId;
    const deleteButton = make("button", "small-danger", "Remove");
    deleteButton.type = "button";
    deleteButton.dataset.deleteUserId = String(user.id);
    deleteButton.disabled = user.id === window.currentUserId;
    deleteButton.title = user.id === window.currentUserId ? "You cannot remove your own account." : "";
    actions.append(resetControl, resetButton, deleteButton);
    row.append(actions);
    body.append(row);
  });
  if (!filteredUsers.length) {
    const row = document.createElement("tr");
    const empty = document.createElement("td");
    empty.colSpan = 5;
    empty.className = "user-empty-state";
    empty.textContent = adminUsers.length ? "No accounts match your search and role filter." : "No user accounts found.";
    row.append(empty);
    body.append(row);
  }
  table.append(body);
  list.replaceChildren(table);
  document.querySelector("#user-count").textContent = `Showing ${filteredUsers.length} of ${adminUsers.length} accounts`;
  document.querySelector("#user-page-summary").textContent = totalPages
    ? `Page ${currentUserPage} of ${totalPages}`
    : "Page 0 of 0";
  const pageNumbers = document.querySelector("#user-page-numbers");
  pageNumbers.replaceChildren();
  for (let page = 1; page <= totalPages; page += 1) {
    const pageButton = make("button", page === currentUserPage ? "current-page" : "", String(page));
    pageButton.type = "button";
    pageButton.dataset.userPage = String(page);
    pageButton.setAttribute("aria-label", `Page ${page}`);
    if (page === currentUserPage) pageButton.setAttribute("aria-current", "page");
    pageNumbers.append(pageButton);
  }
  document.querySelector("#user-previous-page").disabled = currentUserPage <= 1 || totalPages === 0;
  document.querySelector("#user-next-page").disabled = currentUserPage >= totalPages || totalPages === 0;
  document.querySelector("#user-pagination").hidden = false;

  const teacherSelect = document.querySelector("#teacher-select");
  const studentSelect = document.querySelector("#student-select");
  if (teacherSelect && studentSelect) {
    teacherSelect.replaceChildren();
    studentSelect.replaceChildren();
    addOption(teacherSelect, "", "Unassigned");
    addOption(studentSelect, "", "Select a student");
    adminUsers.filter((user) => user.role === "Teacher" && user.status === "Active").forEach((user) => addOption(teacherSelect, String(user.id), user.username));
    adminUsers.filter((user) => user.role === "Student" && user.status === "Active").forEach((user) => addOption(studentSelect, String(user.id), user.username));
  }
  return filteredUsers;
}

async function loadAdminUsers() {
  const list = document.querySelector("#users-list");
  if (!list) return [];
  const { users } = await api("/api/admin/users");
  adminUsers = users;
  return renderAdminUsers();
}

async function loadAdminClasses() {
  const list = document.querySelector("#admin-classes");
  if (!list) return;
  const { classes, users } = await api("/api/admin/classes");
  const teacherUsers = users.filter((user) => user.role === "Teacher");
  const classSelect = document.querySelector("#class-select");
  classSelect.replaceChildren();
  addOption(classSelect, "", "Select a class");
  classes.forEach((item) => addOption(classSelect, String(item.id), item.name));

  if (classes.length === 0) {
    list.replaceChildren(make("p", "empty-data", "No classes yet. Create a class above to assign a teacher and enroll students."));
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  ["Class", "Subject", "Assigned teacher", "Students"].forEach((label) => appendCell(header, label));
  head.append(header);
  table.append(head);
  const body = document.createElement("tbody");
  classes.forEach((item) => {
    const row = document.createElement("tr");
    appendCell(row, item.name);
    appendCell(row, item.subject);
    const teacherCell = document.createElement("td");
    const teacherSelect = document.createElement("select");
    teacherSelect.className = "table-select";
    addOption(teacherSelect, "", "Unassigned");
    teacherUsers.forEach((user) => addOption(teacherSelect, String(user.id), user.username));
    teacherSelect.value = item.teacher_user_id === null ? "" : String(item.teacher_user_id);
    teacherSelect.dataset.classTeacherId = String(item.id);
    teacherCell.append(teacherSelect);
    row.append(teacherCell);
    appendCell(row, String(item.student_count));
    body.append(row);
  });
  table.append(body);
  list.replaceChildren(table);
}

document.querySelector("#create-user-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  try {
    await api("/api/admin/users", { method: "POST", body: data });
    form.reset();
    notifyUserAccounts("Account created successfully.");
    await loadAdminUsers();
    await loadAdminClasses();
  } catch (error) {
    notifyUserAccounts(error.message, true);
  }
});

document.querySelector("#users-list")?.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-role-user-id]");
  if (!select) return;
  const previousRole = select.dataset.previousRole || "";
  select.dataset.previousRole = select.value;
  try {
    await api(`/api/admin/users/${select.dataset.roleUserId}/role`, { method: "PATCH", body: { role: select.value } });
    notifyUserAccounts("User role updated.");
    await loadAdminUsers();
  } catch (error) {
    notifyUserAccounts(error.message, true);
    if (previousRole) select.value = previousRole;
    else await loadAdminUsers();
  }
});

document.querySelector("#users-list")?.addEventListener("click", async (event) => {
  const visibilityButton = event.target.closest(".password-toggle");
  if (visibilityButton) {
    const input = visibilityButton.parentElement.querySelector("input");
    const showPassword = input.type === "password";
    input.type = showPassword ? "text" : "password";
    visibilityButton.setAttribute("aria-pressed", String(showPassword));
    visibilityButton.setAttribute("aria-label", showPassword ? "Hide password" : "Show password");
    visibilityButton.title = showPassword ? "Hide password" : "Show password";
    visibilityButton.classList.toggle("password-visible", showPassword);
    return;
  }
  const statusButton = event.target.closest("[data-user-status-id]");
  if (statusButton) {
    statusButton.disabled = true;
    try {
      const { user } = await api(`/api/admin/users/${statusButton.dataset.userStatusId}/status`, {
        method: "PATCH",
        body: { status: statusButton.dataset.nextStatus }
      });
      notifyUserAccounts(`${user.username} is now ${user.status.toLowerCase()}.`);
      await Promise.all([loadAdminUsers(), loadAdminClasses()]);
    } catch (error) {
      notifyUserAccounts(error.message, true);
      statusButton.disabled = false;
    }
    return;
  }
  const resetButton = event.target.closest("[data-reset-password-id]");
  if (resetButton) {
    const input = document.querySelector(`[data-reset-password-input="${resetButton.dataset.resetPasswordId}"]`);
    if (!input?.value) {
      notifyUserAccounts("Enter a new password of at least 12 characters.", true);
      input?.focus();
      return;
    }
    resetButton.disabled = true;
    try {
      await api(`/api/admin/users/${resetButton.dataset.resetPasswordId}/password`, {
        method: "PATCH",
        body: { password: input.value }
      });
      notifyUserAccounts("Password reset. The user’s other sessions have been signed out.");
      await loadAdminUsers();
    } catch (error) {
      notifyUserAccounts(error.message, true);
      resetButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-delete-user-id]");
  if (!button) return;
  const user = adminUsers.find((item) => item.id === Number(button.dataset.deleteUserId));
  if (!user) {
    notifyUserAccounts("That account is no longer available. Refresh the list and try again.", true);
    return;
  }
  pendingRemovalUserId = user.id;
  document.querySelector("#remove-user-username").textContent = user.username;
  document.querySelector("#remove-user-dialog").showModal();
});

document.querySelector("#create-user-form")?.addEventListener("click", (event) => {
  const visibilityButton = event.target.closest(".password-toggle");
  if (!visibilityButton) return;
  const input = visibilityButton.parentElement.querySelector("input");
  const showPassword = input.type === "password";
  input.type = showPassword ? "text" : "password";
  visibilityButton.setAttribute("aria-pressed", String(showPassword));
  visibilityButton.setAttribute("aria-label", showPassword ? "Hide temporary password" : "Show temporary password");
  visibilityButton.title = showPassword ? "Hide password" : "Show password";
  visibilityButton.classList.toggle("password-visible", showPassword);
});

document.querySelector("#user-search")?.addEventListener("input", () => {
  currentUserPage = 1;
  renderAdminUsers();
});
document.querySelector("#user-role-filter")?.addEventListener("change", () => {
  currentUserPage = 1;
  renderAdminUsers();
});
document.querySelector("#user-page-numbers")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-user-page]");
  if (!button) return;
  currentUserPage = Number(button.dataset.userPage);
  renderAdminUsers();
});
document.querySelector("#user-previous-page")?.addEventListener("click", () => {
  currentUserPage -= 1;
  renderAdminUsers();
});
document.querySelector("#user-next-page")?.addEventListener("click", () => {
  currentUserPage += 1;
  renderAdminUsers();
});
document.querySelector("#cancel-remove-user")?.addEventListener("click", () => {
  document.querySelector("#remove-user-dialog").close("cancel");
});
document.querySelector("#remove-user-dialog")?.addEventListener("close", () => {
  pendingRemovalUserId = null;
});
document.querySelector("#confirm-remove-user")?.addEventListener("click", async (event) => {
  if (pendingRemovalUserId === null) return;
  const button = event.currentTarget;
  const targetId = pendingRemovalUserId;
  button.disabled = true;
  try {
    const user = adminUsers.find((item) => item.id === targetId);
    await api(`/api/admin/users/${targetId}`, { method: "DELETE" });
    document.querySelector("#remove-user-dialog").close("removed");
    notifyUserAccounts(`${user?.username || "Account"} removed successfully.`);
    await Promise.all([loadAdminUsers(), loadAdminClasses()]);
  } catch (error) {
    document.querySelector("#remove-user-dialog").close("error");
    notifyUserAccounts(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#create-class-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/admin/classes", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.reset();
    setStatus("class-status", "Class created.");
    await loadAdminClasses();
  } catch (error) {
    setStatus("class-status", error.message, true);
  }
});

document.querySelector("#admin-classes")?.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-class-teacher-id]");
  if (!select) return;
  try {
    await api(`/api/admin/classes/${select.dataset.classTeacherId}/teacher`, { method: "PATCH", body: { teacherUserId: select.value || null } });
    setStatus("class-status", "Teacher assignment updated.");
    await loadAdminClasses();
  } catch (error) {
    setStatus("class-status", error.message, true);
    await loadAdminClasses();
  }
});

document.querySelector("#enroll-student-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/admin/enrollments", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    setStatus("class-status", "Student enrolled.");
    await loadAdminClasses();
  } catch (error) {
    setStatus("class-status", error.message, true);
  }
});

async function loadTeacherClasses() {
  const container = document.querySelector("#teacher-classes");
  if (!container) return;
  const { classes } = await api("/api/teacher/classes");
  if (!classes.length) {
    container.replaceChildren(make("p", "empty-data", "No classes are assigned to you yet. Contact an Admin to be assigned to a class."));
    return;
  }
  container.replaceChildren(...classes.map((item) => {
    const button = make("button", "class-card");
    button.type = "button";
    button.dataset.classId = String(item.id);
    button.append(make("span", "class-subject", item.subject), make("strong", "", item.name), make("span", "class-count", `${item.student_count} enrolled · View records →`));
    return button;
  }));
}

async function loadClassRoster(classId) {
  const container = document.querySelector("#class-roster");
  const { class: classInfo, students } = await api(`/api/teacher/classes/${classId}/records`);
  const heading = make("div", "roster-heading");
  heading.append(make("div", "", `${classInfo.name} · ${classInfo.subject}`));
  const table = document.createElement("table");
  table.className = "data-table roster-table";
  const head = document.createElement("thead");
  const header = document.createElement("tr");
  ["Student", "Grade", "Academic notes", "Save"].forEach((label) => appendCell(header, label));
  head.append(header);
  table.append(head);
  const body = document.createElement("tbody");
  students.forEach((student) => {
    const row = document.createElement("tr");
    appendCell(row, student.username);
    const gradeCell = document.createElement("td");
    const grade = document.createElement("input");
    grade.className = "record-input";
    grade.value = student.grade;
    grade.maxLength = 32;
    grade.setAttribute("aria-label", `Grade for ${student.username}`);
    gradeCell.append(grade);
    row.append(gradeCell);
    const notesCell = document.createElement("td");
    const notes = document.createElement("textarea");
    notes.className = "record-input notes-input";
    notes.value = student.notes;
    notes.maxLength = 2000;
    notes.rows = 2;
    notes.setAttribute("aria-label", `Academic notes for ${student.username}`);
    notesCell.append(notes);
    row.append(notesCell);
    const actions = document.createElement("td");
    const save = make("button", "small-primary", "Save");
    save.type = "button";
    save.dataset.saveRecord = String(student.student_id);
    save.dataset.classId = String(classId);
    actions.append(save);
    row.append(actions);
    body.append(row);
  });
  table.append(body);
  container.replaceChildren(heading, table);
  if (!students.length) container.append(make("p", "empty-data", "No students are enrolled in this class yet. Ask an Admin to enroll students."));
}

document.querySelector("#teacher-classes")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-class-id]");
  if (!button) return;
  try {
    await loadClassRoster(button.dataset.classId);
  } catch (error) {
    document.querySelector("#class-roster")?.replaceChildren(make("p", "empty-data error", error.message));
  }
});

document.querySelector("#class-roster")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-save-record]");
  if (!button) return;
  const row = button.closest("tr");
  button.disabled = true;
  try {
    await api(`/api/teacher/classes/${button.dataset.classId}/records/${button.dataset.saveRecord}`, {
      method: "PUT",
      body: { grade: row.querySelector(".record-input").value, notes: row.querySelector(".notes-input").value }
    });
    button.textContent = "Saved";
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = "Save";
    }, 1800);
  } catch (error) {
    document.querySelector("#class-roster")?.replaceChildren(make("p", "empty-data error", error.message));
  } finally {
    button.disabled = false;
  }
});

async function loadStudentRecords() {
  const container = document.querySelector("#student-records");
  if (!container) return;
  const { records } = await api("/api/student/records");
  if (!records.length) {
    container.replaceChildren(make("p", "empty-data", "No class records are available yet. When you are enrolled in a class, your teacher’s records will appear here."));
    return;
  }
  records.forEach((record) => {
    const card = make("article", "student-record-card");
    card.append(make("span", "class-subject", record.subject), make("h3", "", record.class_name));
    const grade = document.createElement("p");
    grade.append(make("strong", "", "Grade: "), document.createTextNode(record.grade || "Not yet recorded"));
    const teacher = document.createElement("p");
    teacher.append(make("strong", "", "Teacher: "), document.createTextNode(record.teacher_name || "Not assigned"));
    const notes = document.createElement("p");
    notes.append(make("strong", "", "Academic notes: "), document.createTextNode(record.notes || "No notes recorded."));
    card.append(grade, teacher, notes);
    container.append(card);
  });
}

async function initializeDashboard() {
  try {
    if (document.querySelector("#users-list")) {
      window.currentUserId = (await api("/api/me")).user.id;
      await Promise.all([loadAdminUsers(), loadAdminClasses()]);
    } else if (document.querySelector("#teacher-classes")) {
      await loadTeacherClasses();
    } else if (document.querySelector("#student-records")) {
      await loadStudentRecords();
    }
  } catch (error) {
    const container = document.querySelector("#users-list, #teacher-classes, #student-records");
    if (container) container.replaceChildren(make("p", "empty-data error", error.message));
  }
}

initializeDashboard();
