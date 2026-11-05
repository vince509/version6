"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);
async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash };
}

function destinationFor(role) {
  return role === "Admin" ? "/admin" : role === "Teacher" ? "/teacher" : "/student";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function pageTemplate(title, body, csrf) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17161f"><title>${escapeHtml(title)} · Research Hub</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/auth.css"></head><body><main class="auth-shell"><a class="auth-brand" href="/"><span class="auth-mark">✳</span><span>research<strong>hub</strong><small>STI COLLEGE ALAMINOS</small></span></a>${body}<footer>Private academic workspace · Secure sign-in required</footer></main><script src="/auth-client.js" defer></script><input type="hidden" id="csrf-token" value="${escapeHtml(csrf)}"></body></html>`;
}

function loginPage(csrf, error = "", username = "") {
  const body = `<section class="auth-card"><div class="auth-eyebrow">WELCOME BACK</div><h1>Sign in to<br>your workspace.</h1><p class="auth-intro">Use your username and password to access your academic workspace.</p><div class="form-error" id="form-error" role="alert" ${error ? "" : "hidden"}>${escapeHtml(error)}</div><form id="login-form"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><label>Username<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]+" autocomplete="username" value="${escapeHtml(username)}" autofocus></label><label>Password<input name="password" type="password" required minlength="12" maxlength="1024" autocomplete="current-password"></label><button type="submit">Sign in <span>→</span></button></form><div class="auth-switch">New to Research Hub? <a href="/register">Create a student account</a></div><div class="password-hint">If you cannot access your account, contact your system administrator.</div></section>`;
  return pageTemplate("Sign in", body, csrf);
}

function registerPage(csrf, error = "", username = "") {
  const body = `<section class="auth-card"><div class="auth-eyebrow">CREATE YOUR ACCOUNT</div><h1>Your research<br>starts here.</h1><p class="auth-intro">Register with a username and password. New accounts receive the Student role; an Admin can update roles.</p><div class="form-error" id="form-error" role="alert" ${error ? "" : "hidden"}>${escapeHtml(error)}</div><form id="register-form"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><label>Username<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]+" autocomplete="username" value="${escapeHtml(username)}" autofocus><small>3–32 letters, numbers, dots, underscores, or hyphens.</small></label><label>Password<input name="password" type="password" required minlength="12" maxlength="1024" autocomplete="new-password"><small>Use at least 12 characters.</small></label><label>Confirm password<input name="confirmPassword" type="password" required minlength="12" maxlength="1024" autocomplete="new-password"></label><button type="submit">Create student account <span>→</span></button></form><div class="auth-switch">Already registered? <a href="/login">Sign in</a></div><div class="password-hint">Role assignment is controlled by your administrator.</div></section>`;
  return pageTemplate("Create account", body, csrf);
}

function navForRole(role) {
  if (role === "Admin") return `<a href="/admin" aria-current="page">Admin dashboard</a><a href="/add-research.html">Add research</a><a href="/my-library.html">My library</a><a href="/shared-research.html">Shared research</a><a href="/about.html">Project information</a>`;
  if (role === "Teacher") return `<a href="/teacher" aria-current="page">Teacher dashboard</a><a href="/add-research.html">Add research</a><a href="/my-library.html">My library</a><a href="/shared-research.html">Shared research</a><a href="/about.html">Project information</a>`;
  return `<a href="/student" aria-current="page">My dashboard</a><a href="/add-research.html">Add research</a><a href="/my-library.html">My library</a><a href="/shared-research.html">Shared research</a><a href="/about.html">Project information</a>`;
}

function adminManagementSections() {
  return `<section class="dashboard-section"><div class="section-title"><div><span class="eyebrow">ADMINISTRATION</span><h2>User accounts</h2><p>Create accounts, assign roles, reset passwords, or control access.</p></div></div>
    <form id="create-user-form" class="inline-form"><label>Username<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._\\-]+"></label><label>Temporary password<span class="password-control"><input name="password" type="password" required minlength="12" maxlength="1024" autocomplete="new-password"><button class="password-toggle" type="button" aria-label="Show temporary password" aria-pressed="false" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle><path class="eye-slash" d="m3 3 18 18"></path></svg></button></span></label><label>Role<select name="role"><option>Student</option><option>Teacher</option><option>Admin</option></select></label><button type="submit">Create account</button></form>
    <p class="inline-status" id="user-status" role="status"></p>
    <div class="user-table-controls"><label>Search username<input id="user-search" type="search" placeholder="Type a username..." autocomplete="off"></label><label>Filter by role<select id="user-role-filter"><option value="all">All roles</option><option>Admin</option><option>Teacher</option><option>Student</option></select></label><p id="user-count" class="user-count"></p></div>
    <div id="users-list" class="data-list" aria-live="polite"></div>
    <div class="user-pagination" id="user-pagination"><p id="user-page-summary" aria-live="polite"></p><div id="user-page-numbers" class="user-page-numbers"></div><div class="user-page-arrows"><button type="button" id="user-previous-page">Previous</button><button type="button" id="user-next-page">Next</button></div></div>
    <dialog class="confirm-dialog" id="remove-user-dialog" aria-labelledby="remove-user-title"><form method="dialog"><button class="dialog-close" value="cancel" aria-label="Cancel account removal">×</button></form><span class="eyebrow">CONFIRM ACCOUNT REMOVAL</span><h2 id="remove-user-title">Remove account?</h2><p>Remove <strong id="remove-user-username"></strong>? This action cannot be undone and will revoke the account’s active sessions.</p><div class="confirm-dialog-actions"><button type="button" class="dialog-cancel" id="cancel-remove-user">Cancel</button><button type="button" class="small-danger" id="confirm-remove-user">Confirm removal</button></div></dialog>
    </section>
    <section class="dashboard-section"><div class="section-title"><div><span class="eyebrow">CLASS SETUP</span><h2>Classes &amp; assignments</h2><p>Assign teachers, then enroll student accounts.</p></div></div><form id="create-class-form" class="inline-form"><label>Class name<input name="name" required maxlength="100" placeholder="e.g. BSIT 3A"></label><label>Subject<input name="subject" required maxlength="120" placeholder="e.g. Capstone Project"></label><label>Teacher<select name="teacherUserId" id="teacher-select"><option value="">Unassigned</option></select></label><button>Create class</button></form><form id="enroll-student-form" class="inline-form compact-form"><label>Class<select name="classId" id="class-select" required><option value="">Select a class</option></select></label><label>Student<select name="studentUserId" id="student-select" required><option value="">Select a student</option></select></label><button>Enroll student</button></form><p class="inline-status" id="class-status" role="status"></p><div id="admin-classes" class="data-list" aria-live="polite"></div></section>`;
}

function dashboardPage(user, csrf) {
  const role = user.role;
  let content = "";
  if (role === "Admin") {
    content = adminManagementSections();
  } else if (role === "Teacher") {
    content = `<section class="dashboard-section"><div class="section-title"><div><span class="eyebrow">YOUR TEACHING SPACE</span><h2>Assigned classes</h2><p>View enrolled students and maintain their academic records.</p></div></div><div id="teacher-classes" class="class-grid" aria-live="polite"></div><div id="class-roster" class="roster-container"></div></section>`;
  } else {
    content = `<section class="dashboard-section"><div class="section-title"><div><span class="eyebrow">YOUR ACADEMIC SPACE</span><h2>My academic information</h2><p>View class enrollment and records shared by your teachers.</p></div></div><div id="student-records" class="data-list" aria-live="polite"></div></section>`;
  }
  const body = `<div class="portal-shell"><aside class="portal-sidebar"><a class="auth-brand" href="/"><span class="auth-mark">✳</span><span>research<strong>hub</strong><small>STI COLLEGE ALAMINOS</small></span></a><button class="portal-menu-toggle" id="portal-menu-toggle" type="button" aria-controls="portal-nav" aria-expanded="false">Menu <span aria-hidden="true">☰</span></button><nav class="portal-nav" id="portal-nav" aria-label="Workspace navigation">${navForRole(role)}</nav><div class="portal-profile"><a class="portal-account" href="/profile" aria-label="Edit your profile"><span class="profile-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(user.username)}</strong><small>${escapeHtml(role)} · Edit profile</small></span></a><button id="logout-button" type="button">Log out</button></div></aside><main class="portal-main"><header class="portal-header"><div><span class="eyebrow">${escapeHtml(role.toUpperCase())} WORKSPACE</span><h1>${role === "Admin" ? "Administration" : role === "Teacher" ? "Teacher dashboard" : "Student dashboard"}</h1></div><form class="global-search" action="/library.html" method="get" role="search"><label class="visually-hidden" for="global-search-input">Search all research</label><input id="global-search-input" type="search" name="q" placeholder="Search research..." autocomplete="off"><button type="submit" aria-label="Search">⌕</button></form><span class="security-indicator"><i></i> Secure session</span></header><div class="welcome-card"><div><span class="eyebrow">SIGNED IN AS ${escapeHtml(role.toUpperCase())}</span><h2>Welcome, ${escapeHtml(user.username)}.</h2><p>${role === "Admin" ? "Manage accounts, assign roles, and organize classes." : role === "Teacher" ? "Your class list and student records are available below." : "Your personal class and academic records are available below."}</p></div><span class="welcome-symbol">${role === "Admin" ? "⚙" : role === "Teacher" ? "▤" : "◎"}</span></div>${content}<section class="dashboard-section repository-links"><div class="section-title"><div><span class="eyebrow">ACADEMIC RESOURCES</span><h2>Research Hub</h2><p>Browse shared project information and proposal references.</p></div></div><div class="resource-links"><a href="/version1.html">Discover research <span>→</span></a><a href="/library.html">Open research library <span>→</span></a><a href="/shared-research.html">Shared research <span>→</span></a><a href="/about.html">About the project <span>→</span></a></div></section></main><input id="csrf-token" type="hidden" value="${escapeHtml(csrf)}"></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17161f"><title>${escapeHtml(role)} Dashboard · Research Hub</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/auth.css"></head><body>${body}<div class="toast" id="toast" role="status" aria-live="polite"></div><script src="/dashboard.js" defer></script></body></html>`;
}

function profilePage(user, csrf, profileOverride) {
  const profile = profileOverride;
  const roleDashboard = destinationFor(user.role);
  const dashboardLabel = user.role === "Admin" ? "Admin dashboard" : "your workspace";
  const profileNavigation = user.role === "Admin"
    ? `<nav class="profile-page-nav" aria-label="Admin navigation"><a href="/admin">Admin dashboard</a><a href="/profile#profile-details" aria-current="page">My profile</a><a href="/add-research.html">Add research</a><a href="/my-library.html">My library</a><a href="/shared-research.html">Shared research</a><a href="/about.html">Project information</a></nav>`
    : `<a class="back-to-workspace" href="${roleDashboard}">Back to ${dashboardLabel} <span>→</span></a>`;
  const avatarText = (profile.profile_name || profile.username).slice(0, 1).toUpperCase();
  const body = `<main class="profile-page">
    <header class="profile-page-header"><a class="auth-brand" href="/"><span class="auth-mark">✳</span><span>research<strong>hub</strong><small>STI COLLEGE ALAMINOS</small></span></a><form class="global-search" action="/library.html" method="get" role="search"><label class="visually-hidden" for="global-search-input">Search all research</label><input id="global-search-input" type="search" name="q" placeholder="Search research..." autocomplete="off"><button type="submit" aria-label="Search">⌕</button></form>${profileNavigation}</header>
    <section class="profile-hero"><div class="profile-hero-avatar">${escapeHtml(avatarText)}</div><div><span class="eyebrow">YOUR ACCOUNT</span><h1>My profile</h1><p>Keep your contact details and introduction up to date.</p></div><span class="profile-role-badge">${escapeHtml(profile.role)}</span></section>
    <div class="profile-layout" id="profile-details"><section class="profile-edit-card"><div class="section-title"><div><span class="eyebrow">PERSONAL DETAILS</span><h2>Edit your profile</h2><p>Your username and role are managed separately and cannot be changed here.</p></div></div>
      <div class="profile-status" id="profile-status" role="status" aria-live="polite"></div>
      <form id="profile-form" class="profile-form">
        <label>Username <input value="${escapeHtml(profile.username)}" readonly aria-describedby="username-note"></label><small class="field-help" id="username-note">Usernames cannot be changed.</small>
        <label>Display name <input name="profileName" maxlength="80" autocomplete="name" value="${escapeHtml(profile.profile_name)}" placeholder="How should we address you?"></label>
        <div class="profile-fields-row"><label>Email address <input name="email" type="email" maxlength="254" autocomplete="email" value="${escapeHtml(profile.email)}" placeholder="you@example.com"></label><label>Phone number <input name="phone" type="tel" maxlength="32" autocomplete="tel" value="${escapeHtml(profile.phone)}" placeholder="+63 900 000 0000"></label></div>
        <label>Bio <textarea name="bio" rows="5" maxlength="1000" placeholder="Tell your academic community a little about yourself.">${escapeHtml(profile.bio)}</textarea><small class="field-help">Up to 1,000 characters.</small></label>
        <div class="profile-form-actions"><span>Only you can view and update these details.</span><button type="submit">Save profile</button></div>
      </form>
    </section>
    <aside class="profile-side-card"><span class="eyebrow">ACCOUNT</span><h2>${escapeHtml(profile.profile_name || profile.username)}</h2><p class="profile-side-username">@${escapeHtml(profile.username)}</p><span class="profile-side-role">${escapeHtml(profile.role)}</span><div class="profile-side-divider"></div><p>Your email, phone number, and bio are private account details. They are only returned to your own signed-in session.</p><a href="${roleDashboard}">Return to ${dashboardLabel} <span>→</span></a></aside></div>
    <footer class="profile-page-footer"><a href="/profile">My profile</a><button id="logout-button" type="button">Log out</button></footer>
    <input id="csrf-token" type="hidden" value="${escapeHtml(csrf)}">
  </main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#17161f"><title>My Profile · Research Hub</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/auth.css"></head><body>${body}<div class="toast" id="toast" role="status" aria-live="polite"></div><script src="/dashboard.js" defer></script></body></html>`;
}
module.exports = {
  hashPassword,
  destinationFor,
  loginPage,
  registerPage,
  dashboardPage,
  profilePage
};