"use strict";

import { upload } from "@vercel/blob/client";

const csrfToken = document.querySelector("#csrf-token");
const sharedUploadForm = document.querySelector("#shared-upload-form");
const sharedSearch = document.querySelector("#shared-search");
let sharedRecords = { approved: [], mine: [], pending: [] };
let canReviewSharedResearch = false;
let blobUploadsEnabled = false;
let signedInUserId = null;

function sharedElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setSharedStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function sharedApi(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && options.method !== "GET") headers["X-CSRF-Token"] = csrfToken.value;
  const response = await fetch(url, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function formatSharedFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createSharedCard(record, options = {}) {
  const card = sharedElement("article", "shared-research-card");
  const heading = sharedElement("div", "shared-card-heading");
  const details = sharedElement("div");
  details.append(sharedElement("span", "shared-category", record.category));
  details.append(sharedElement("h3", "", record.title));
  heading.append(details);
  const status = sharedElement("span", `shared-review-status status-${record.status.toLowerCase()}`, record.status);
  heading.append(status);
  card.append(heading);

  const metadata = [record.author, record.year, `Submitted by ${record.submitted_by_username}`].filter(Boolean).join(" · ");
  card.append(sharedElement("p", "shared-card-meta", metadata));
  if (record.abstract) card.append(sharedElement("p", "shared-card-abstract", record.abstract));
  if (record.status === "Rejected" && record.reviewer_notes) {
    card.append(sharedElement("p", "shared-review-notes", `Reviewer feedback: ${record.reviewer_notes}`));
  }

  const actions = sharedElement("div", "shared-card-actions");
  const download = sharedElement("a", "shared-download-link", `Download ${record.file_name} · ${formatSharedFileSize(record.file_size)}`);
  download.href = record.fileUrl;
  download.setAttribute("download", "");
  actions.append(download);
  if (options.review) {
    const notes = document.createElement("textarea");
    notes.className = "shared-review-input";
    notes.rows = 2;
    notes.maxLength = 1000;
    notes.placeholder = "Reviewer notes (required when rejecting)";
    notes.setAttribute("aria-label", `Review notes for ${record.title}`);
    actions.append(notes);

    for (const [label, reviewStatus, className] of [
      ["Approve", "Approved", "shared-primary-button"],
      ["Reject", "Rejected", "shared-reject-button"]
    ]) {
      const button = sharedElement("button", className, label);
      button.type = "button";
      button.addEventListener("click", async () => {
        if (reviewStatus === "Rejected" && !notes.value.trim()) {
          notes.setCustomValidity("Add a short reason before rejecting this submission.");
          notes.reportValidity();
          return;
        }
        notes.setCustomValidity("");
        button.disabled = true;
        try {
          await sharedApi(`/api/shared-research/${record.id}/review`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: reviewStatus, notes: notes.value })
          });
          await loadSharedResearch();
        } catch (error) {
          button.disabled = false;
          setSharedStatus(document.querySelector("#shared-approved-status"), error.message, true);
        }
      });
      actions.append(button);
    }
  }
  card.append(actions);
  return card;
}

function renderSharedResearch() {
  const query = sharedSearch.value.trim().toLocaleLowerCase();
  const approved = sharedRecords.approved.filter((record) =>
    [record.title, record.author, record.category, record.abstract, record.year].join(" ").toLocaleLowerCase().includes(query)
  );
  const approvedList = document.querySelector("#shared-approved-list");
  approvedList.replaceChildren(...approved.map((record) => createSharedCard(record)));
  document.querySelector("#shared-approved-empty").hidden = approved.length > 0;
  document.querySelector("#shared-approved-status").textContent = `${approved.length} approved ${approved.length === 1 ? "submission" : "submissions"}`;

  const mineList = document.querySelector("#shared-mine-list");
  mineList.replaceChildren(...sharedRecords.mine.map((record) => createSharedCard(record)));
  document.querySelector("#shared-mine-empty").hidden = sharedRecords.mine.length > 0;

  const reviewPanel = document.querySelector("#shared-review-panel");
  reviewPanel.hidden = !canReviewSharedResearch;
  const reviewList = document.querySelector("#shared-review-list");
  reviewList.replaceChildren(...sharedRecords.pending.map((record) => createSharedCard(record, { review: true })));
  document.querySelector("#shared-review-empty").hidden = sharedRecords.pending.length > 0;
}

async function loadSharedResearch() {
  try {
    const result = await sharedApi("/api/shared-research");
    sharedRecords = result;
    canReviewSharedResearch = result.canReview;
    blobUploadsEnabled = result.uploadMode === true;
    renderSharedResearch();
  } catch (error) {
    setSharedStatus(document.querySelector("#shared-approved-status"), error.message, true);
  }
}

sharedUploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = sharedUploadForm.querySelector('button[type="submit"]');
  const status = document.querySelector("#shared-submit-status");
  button.disabled = true;
  setSharedStatus(status, "Uploading your submission…");
  try {
    const formData = new FormData(sharedUploadForm);
    if (blobUploadsEnabled) {
      const file = formData.get("file");
      if (!(file instanceof File) || !file.size) throw new Error("Choose a research file to upload.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const blobPathname = `shared-research/${signedInUserId}/${crypto.randomUUID()}.${extension}`;
      const blob = await upload(blobPathname, file, {
        access: "private",
        handleUploadUrl: "/api/shared-research/upload-token",
        headers: { "X-CSRF-Token": csrfToken.value },
        multipart: file.size > 5 * 1024 * 1024
      });
      try {
        await sharedApi("/api/shared-research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formData.get("title"),
            author: formData.get("author"),
            year: formData.get("year"),
            category: formData.get("category"),
            abstract: formData.get("abstract"),
            fileName: file.name,
            blobPathname: blob.pathname
          })
        });
      } catch (error) {
        try {
          await sharedApi("/api/shared-research/upload", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blobPathname: blob.pathname })
          });
        } catch (cleanupError) {
          console.error("Could not remove an unlinked research upload:", cleanupError);
        }
        throw error;
      }
    } else {
      await sharedApi("/api/shared-research", {
        method: "POST",
        body: formData
      });
    }
    sharedUploadForm.reset();
    setSharedStatus(status, "Your research was submitted for review.");
    await loadSharedResearch();
  } catch (error) {
    setSharedStatus(status, error.message, true);
  } finally {
    button.disabled = false;
  }
});

sharedSearch.addEventListener("input", renderSharedResearch);
sharedApi("/api/me").then(({ csrfToken: token, user }) => {
  csrfToken.value = token;
  signedInUserId = user.id;
  return loadSharedResearch();
}).catch((error) => {
  setSharedStatus(document.querySelector("#shared-approved-status"), error.message, true);
});
