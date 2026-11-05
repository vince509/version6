"use strict";

const csrfInput = document.querySelector("#csrf-token");
const csrfToken = csrfInput?.value || "";

function showFormError(message) {
  const error = document.querySelector("#form-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

async function submitAuthForm(form, endpoint) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const body = Object.fromEntries(new FormData(form));
  delete body.csrf;
  if (endpoint === "/api/register" && body.password !== body.confirmPassword) {
    showFormError("The passwords do not match.");
    button.disabled = false;
    return;
  }
  delete body.confirmPassword;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) {
      showFormError(result.error || "Unable to complete the request.");
      button.disabled = false;
      return;
    }
    window.location.replace(result.redirect);
  } catch {
    showFormError("The server could not be reached. Check that Research Hub is running and try again.");
    button.disabled = false;
  }
}

document.querySelector("#login-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuthForm(event.currentTarget, "/api/login");
});

document.querySelector("#register-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuthForm(event.currentTarget, "/api/register");
});

function updateWorkspaceNavigation() {
  const path = window.location.pathname;
  const currentHref = path.endsWith("/my-library.html") ? "my-library.html"
    : path.endsWith("/add-research.html") ? "add-research.html"
      : path.endsWith("/library.html") ? "library.html"
        : path.endsWith("/shared-research.html") ? "shared-research.html"
          : path.endsWith("/about.html") ? "about.html"
            : "version1.html";

  document.querySelectorAll(".side-nav .nav-link").forEach((link) => {
    const isCurrent = link.getAttribute("href") === currentHref;
    link.classList.toggle("active", isCurrent);
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

const globalSearchInput = document.querySelector("#global-search-input");
if (globalSearchInput) {
  globalSearchInput.value = new URLSearchParams(window.location.search).get("q") || "";
}

updateWorkspaceNavigation();
window.addEventListener("hashchange", updateWorkspaceNavigation);

async function connectWorkspaceControls() {
  if (!document.querySelector(".app-shell")) return;
  try {
    const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      window.location.replace("/login");
      return;
    }
    const { user, csrfToken: sessionCsrf } = await response.json();
    const profile = document.querySelector(".profile");
    if (profile) {
      profile.href = "/profile";
      profile.setAttribute("aria-label", "Open your profile");
      profile.querySelector("strong").textContent = user.username;
      profile.querySelector("small").textContent = user.role;
    }
    const actions = document.querySelector(".top-actions");
    if (actions) {
      const logout = document.createElement("button");
      logout.type = "button";
      logout.className = "sign-in";
      logout.textContent = "Log out";
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
          const result = await fetch("/api/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: { "X-CSRF-Token": sessionCsrf }
          });
          if (!result.ok) throw new Error("Could not end session.");
          window.location.replace("/login");
        } catch {
          logout.disabled = false;
          if (document.querySelector("#form-error")) showFormError("Could not log out. Please try again.");
          else {
            const toast = document.querySelector("#toast");
            if (toast) {
              toast.textContent = "Could not log out. Please try again.";
              toast.classList.add("show");
            }
          }
        }
      });
      actions.append(logout);
    }
  } catch {
    window.location.replace("/login");
  }
}

connectWorkspaceControls();
