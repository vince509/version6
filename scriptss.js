let databaseName = "research-hub-library";
const databaseVersion = 1;
const databaseStore = "documents";
const maximumFileSize = 25 * 1024 * 1024;
const cards = [...document.querySelectorAll(".document-card")];
const searchInput = document.querySelector("#search-input");
const filterButtons = [...document.querySelectorAll(".filter-chip")];
const resultStatus = document.querySelector("#result-status");
const emptyState = document.querySelector("#empty-state");
const grid = document.querySelector("#document-grid");
const communityResearchGrid = document.querySelector("#community-research-grid");
const communityResearchStatus = document.querySelector("#community-research-status");
const communityResearchEmpty = document.querySelector("#community-research-empty");
const savedDocumentsElement = document.querySelector("#saved-documents");
let activeFilter = "all";
let toastTimer;
let savedDocuments = [];
let databasePromise;
let approvedSharedResearchPromise;

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support local document storage."));
  }

  if (!databasePromise) {
    databasePromise = fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Sign in to open your personal document library.");
        return response.json();
      })
      .then(({ user }) => {
        databaseName = `research-hub-library-user-${user.id}`;
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName, databaseVersion);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(databaseStore)) {
              request.result.createObjectStore(databaseStore, { keyPath: "id" });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error("Could not open the local document library."));
          request.onblocked = () => reject(new Error("Close other Research Hub tabs and try again."));
        });
      });
  }
  return databasePromise;
}

async function getSavedDocuments() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(databaseStore, "readonly");
    const request = transaction.objectStore(databaseStore).getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    request.onerror = () => reject(request.error || new Error("Could not load saved documents."));
  });
}

async function saveDocument(record) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(databaseStore, "readwrite");
    transaction.objectStore(databaseStore).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not save this document."));
    transaction.onabort = () => reject(transaction.error || new Error("Saving this document was cancelled."));
  });
}

async function removeDocument(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(databaseStore, "readwrite");
    transaction.objectStore(databaseStore).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not remove this document."));
    transaction.onabort = () => reject(transaction.error || new Error("Removing this document was cancelled."));
  });
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function searchableText(record) {
  return [
    record.title,
    record.author,
    record.year,
    record.category,
    record.abstract,
    record.textContent,
    record.fileName
  ].filter(Boolean).join(" ").toLowerCase();
}

function searchTerms(value) {
  const ignored = new Set(["a", "an", "and", "are", "can", "do", "does", "for", "from", "how", "i", "in", "is", "me", "of", "on", "or", "please", "the", "this", "to", "what", "with"]);
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 1 && !ignored.has(word)) || [];
}

function matchesQuery(text, query) {
  const terms = searchTerms(query);
  return terms.length === 0 || terms.some((term) => text.includes(term));
}

function updateResults() {
  if (!searchInput) return;
  if (!grid || !emptyState || !resultStatus) {
    renderSavedDocuments();
    return;
  }
  const query = searchInput.value.trim();
  let visibleCount = 0;

  cards.forEach((card) => {
    const matchesFilter = activeFilter === "all" || card.dataset.category === activeFilter;
    const text = `${card.dataset.search} ${card.querySelector("h3").textContent} ${card.querySelector("p").textContent}`.toLowerCase();
    const isVisible = matchesFilter && matchesQuery(text, query);
    card.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  });

  grid.hidden = visibleCount === 0;
  emptyState.hidden = visibleCount !== 0;
  resultStatus.textContent = query
    ? `${visibleCount} project ${visibleCount === 1 ? "reference" : "references"} matching “${query}”`
    : activeFilter !== "all" ? `${visibleCount} project ${visibleCount === 1 ? "reference" : "references"} in this topic` : "";
  renderCommunityResearch(query);
  renderSavedDocuments();
}

function searchFor(query) {
  if (!searchInput) {
    window.location.href = `library.html?q=${encodeURIComponent(query)}`;
    return;
  }
  searchInput.value = query;
  activeFilter = "all";
  filterButtons.forEach((button) => button.classList.toggle("selected", button.dataset.filter === "all"));
  updateResults();
  document.querySelector("#library")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getApprovedSharedResearch() {
  if (!approvedSharedResearchPromise) {
    approvedSharedResearchPromise = fetch("/api/shared-research", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || "Could not load approved shared research.");
        }
        const result = await response.json();
        if (!Array.isArray(result.approved)) throw new Error("The shared research response was invalid.");
        return result.approved.map((record) => ({ ...record, fileName: record.file_name }));
      })
      .catch((error) => {
        approvedSharedResearchPromise = null;
        throw error;
      });
  }
  return approvedSharedResearchPromise;
}

function createCommunityResearchCard(record) {
  const card = document.createElement("article");
  card.className = "document-card community-document-card";
  card.dataset.search = searchableText(record);

  const top = document.createElement("div");
  top.className = "card-top";
  const type = document.createElement("span");
  type.className = "doc-type type-blue";
  type.textContent = `✓ ${record.category || "APPROVED RESEARCH"}`;
  top.append(type);
  card.append(top);

  const title = document.createElement("h3");
  title.textContent = record.title;
  const abstract = document.createElement("p");
  abstract.textContent = record.abstract || "An academic research submission approved for the STI College Alaminos community.";
  card.append(title, abstract);

  const footer = document.createElement("div");
  footer.className = "card-footer";
  const metadata = document.createElement("span");
  metadata.textContent = [record.author, record.year, `Shared by ${record.submitted_by_username}`].filter(Boolean).join(" · ");
  const download = document.createElement("a");
  download.className = "read-time community-download";
  download.href = record.fileUrl;
  download.textContent = "Download";
  download.setAttribute("download", "");
  footer.append(metadata, download);
  card.append(footer);
  return card;
}

function renderCommunityResearch(query = searchInput?.value.trim() || "") {
  if (!communityResearchGrid || !communityResearchStatus || !communityResearchEmpty) return;
  if (!approvedSharedResearchPromise) return;
  getApprovedSharedResearch().then((records) => {
    const matches = records.filter((record) => matchesQuery(searchableText(record), query));
    communityResearchGrid.replaceChildren(...matches.map(createCommunityResearchCard));
    communityResearchStatus.textContent = query
      ? `${matches.length} of ${records.length} approved ${records.length === 1 ? "submission" : "submissions"} matching “${query}”`
      : `${records.length} approved ${records.length === 1 ? "submission" : "submissions"}`;
    communityResearchEmpty.hidden = matches.length > 0;
    const heading = communityResearchEmpty.querySelector("h3");
    const message = communityResearchEmpty.querySelector("p");
    heading.textContent = records.length === 0 ? "No approved shared research yet" : "No matching shared research";
    message.textContent = records.length === 0
      ? "Approved community submissions will appear here."
      : "Try another search to find approved research.";
  }).catch((error) => {
    communityResearchGrid.replaceChildren();
    communityResearchEmpty.hidden = true;
    communityResearchStatus.textContent = `Could not load approved shared research: ${error.message}`;
    communityResearchStatus.classList.add("error");
  });
}

if (communityResearchGrid) {
  void getApprovedSharedResearch()
    .then(() => renderCommunityResearch())
    .catch((error) => {
      communityResearchStatus.textContent = `Could not load approved shared research: ${error.message}`;
      communityResearchStatus.classList.add("error");
    });
}

function renderSavedDocuments() {
  if (!savedDocumentsElement) return;
  const query = searchInput?.value.trim() || "";
  const matchingDocuments = savedDocuments.filter((record) => matchesQuery(searchableText(record), query));
  const count = document.querySelector("#saved-count");
  const empty = document.querySelector("#saved-empty");
  const searchResults = document.querySelector("#personal-search-results");
  if (count) count.textContent = String(savedDocuments.length);
  if (searchResults) searchResults.hidden = !query;
  if (empty) empty.hidden = matchingDocuments.length > 0 || (!searchResults && savedDocuments.length > 0 && Boolean(query));
  savedDocumentsElement.replaceChildren();

  if (savedDocuments.length > 0 && matchingDocuments.length === 0 && query) {
    const noMatches = document.createElement("p");
    noMatches.className = "saved-no-matches";
    noMatches.textContent = "No saved documents match this search.";
    savedDocumentsElement.append(noMatches);
  }

  matchingDocuments.forEach((record) => {
    const item = document.createElement("article");
    item.className = "saved-document";

    const icon = document.createElement("div");
    icon.className = "saved-document-icon";
    icon.textContent = record.fileName.toLowerCase().endsWith(".pdf") ? "PDF" : record.fileName.toLowerCase().endsWith(".docx") ? "DOC" : "TXT";

    const details = document.createElement("div");
    details.className = "saved-document-details";
    const title = document.createElement("h3");
    title.textContent = record.title;
    const metadata = document.createElement("p");
    metadata.textContent = [record.author, record.year, record.category, record.fileName, formatFileSize(record.fileSize)].filter(Boolean).join(" · ");
    details.append(title, metadata);
    if (record.abstract) {
      const abstract = document.createElement("p");
      abstract.className = "saved-document-abstract";
      abstract.textContent = record.abstract;
      details.append(abstract);
    }

    const actions = document.createElement("div");
    actions.className = "saved-document-actions";
    const openLink = document.createElement("a");
    openLink.className = "file-action";
    openLink.href = URL.createObjectURL(record.file);
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "Open";
    openLink.setAttribute("aria-label", `Open ${record.title}`);
    const downloadLink = document.createElement("a");
    downloadLink.className = "file-action";
    downloadLink.href = URL.createObjectURL(record.file);
    downloadLink.download = record.fileName;
    downloadLink.textContent = "Download";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "file-action delete-document";
    deleteButton.dataset.deleteId = record.id;
    deleteButton.textContent = "Remove";
    deleteButton.setAttribute("aria-label", `Remove ${record.title}`);
    actions.append(openLink, downloadLink, deleteButton);
    item.append(icon, details, actions);
    savedDocumentsElement.append(item);
  });
}

async function refreshSavedDocuments() {
  if (!savedDocumentsElement) return;
  try {
    savedDocuments = await getSavedDocuments();
    renderSavedDocuments();
  } catch (error) {
    const status = document.querySelector("#upload-status");
    const message = `Local document storage is unavailable: ${error.message}`;
    if (status) status.textContent = message;
    else showToast(message);
  }
}

const uploadForm = document.querySelector("#document-upload-form");
uploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status = document.querySelector("#upload-status");
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  const formData = new FormData(uploadForm);
  const file = formData.get("file");
  const title = String(formData.get("title") || "").trim();

  if (!(file instanceof File) || file.size === 0) {
    status.textContent = "Choose a non-empty PDF, DOCX, or TXT file.";
    return;
  }
  if (file.size > maximumFileSize) {
    status.textContent = "This file is larger than 25 MB. Choose a smaller file.";
    return;
  }
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) {
    status.textContent = "Only PDF, DOCX, and TXT files are supported.";
    return;
  }

  status.textContent = "Saving your document in this browser…";
  submitButton.disabled = true;
  try {
    const record = {
      id: window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      author: String(formData.get("author") || "").trim(),
      year: String(formData.get("year") || "").trim(),
      category: String(formData.get("category") || "General"),
      abstract: String(formData.get("abstract") || "").trim(),
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || "application/octet-stream",
      file,
      textContent: /\.txt$/i.test(file.name) ? await file.text() : "",
      createdAt: new Date().toISOString()
    };
    await saveDocument(record);
    uploadForm.reset();
    status.textContent = `${record.title} was added to this browser’s library.`;
    await refreshSavedDocuments();
  } catch (error) {
    status.textContent = `Could not save the file: ${error.message}`;
  } finally {
    submitButton.disabled = false;
  }
});

savedDocumentsElement?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await removeDocument(button.dataset.deleteId);
    await refreshSavedDocuments();
    showToast("Document removed from this browser.");
  } catch (error) {
    button.disabled = false;
    showToast(`Could not remove the document: ${error.message}`);
  }
});

document.querySelector("#search-form")?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (searchInput && !savedDocumentsElement) {
    window.location.href = `library.html?q=${encodeURIComponent(searchInput.value.trim())}`;
    return;
  }
  updateResults();
  document.querySelector("#library")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

searchInput?.addEventListener("input", updateResults);
document.querySelectorAll("button[data-query]").forEach((button) => button.addEventListener("click", () => searchFor(button.dataset.query)));

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filter) => filter.classList.toggle("selected", filter === button));
    updateResults();
  });
});

document.querySelector("#clear-search")?.addEventListener("click", () => {
  if (!searchInput) return;
  searchInput.value = "";
  activeFilter = "all";
  filterButtons.forEach((button) => button.classList.toggle("selected", button.dataset.filter === "all"));
  updateResults();
  searchInput.focus();
});

let bookmarkKey;
async function updateBookmarks() {
  let saved = [];
  try {
    const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("Sign in to load saved topics.");
    const { user } = await response.json();
    bookmarkKey = `research-hub-bookmarks-${user.id}`;
    saved = JSON.parse(localStorage.getItem(bookmarkKey) || "[]");
  } catch (error) {
    showToast(`Could not load saved topics: ${error.message}`);
    return;
  }
  document.querySelectorAll(".bookmark").forEach((button) => {
    const isSaved = saved.includes(button.getAttribute("aria-label"));
    button.classList.toggle("saved", isSaved);
    button.textContent = isSaved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(isSaved));
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".bookmark");
  if (!button) return;
  void (async () => {
    try {
      if (!bookmarkKey) {
        const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Sign in to save topics.");
        const { user } = await response.json();
        bookmarkKey = `research-hub-bookmarks-${user.id}`;
      }
    const saved = new Set(JSON.parse(localStorage.getItem(bookmarkKey) || "[]"));
    const label = button.getAttribute("aria-label");
    const isSaved = !saved.has(label);
    if (isSaved) saved.add(label);
    else saved.delete(label);
    localStorage.setItem(bookmarkKey, JSON.stringify([...saved]));
    button.classList.toggle("saved", isSaved);
    button.textContent = isSaved ? "♥" : "♡";
    button.setAttribute("aria-pressed", String(isSaved));
    showToast(isSaved ? "Topic saved in this browser." : "Topic removed from saved topics.");
    } catch (error) {
      showToast(`Could not update saved topics: ${error.message}`);
    }
  })();
});
if (document.querySelector(".bookmark")) updateBookmarks();

function addMessage(text, kind) {
  const messages = document.querySelector("#chat-messages");
  if (!messages) return null;
  const message = document.createElement("div");
  message.className = `message ${kind}-message`;
  message.textContent = text;
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
  return message;
}

function rankMatches(query, records) {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return records.map((record) => {
    const text = searchableText(record);
    const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
    return { record, score };
  }).filter((match) => match.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
}

async function searchLibrary(query) {
  const projectRecords = cards.map((card) => ({
    title: card.querySelector("h3").textContent,
    category: card.querySelector(".doc-type").textContent.trim(),
    abstract: card.querySelector("p").textContent,
    textContent: card.dataset.search,
    fileName: "Project reference"
  }));
  let localRecords;
  try {
    localRecords = await getSavedDocuments();
  } catch (error) {
    throw new Error(`The local document library could not be searched: ${error.message}`);
  }
  let sharedRecords;
  try {
    sharedRecords = await getApprovedSharedResearch();
  } catch (error) {
    throw new Error(`Approved shared research could not be searched: ${error.message}`);
  }
  const sources = rankMatches(query, [...localRecords, ...projectRecords, ...sharedRecords]).map(({ record }) => ({
    title: record.title,
    author: record.author || "",
    category: record.category || "",
    abstract: record.abstract || "",
    excerpt: (record.textContent || record.abstract || "").slice(0, 1800)
  }));
  const sessionResponse = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
  if (!sessionResponse.ok) throw new Error("Your session has expired. Sign in again to use the research assistant.");
  const { csrfToken } = await sessionResponse.json();
  const response = await fetch("/api/ai/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
    body: JSON.stringify({ question: query, sources })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The AI request failed. Please try again.");
  return result.answer;
}

const chatPanel = document.querySelector("#chat-panel");
const chatInput = document.querySelector("#chat-input");
const chatLauncher = document.querySelector("#chat-launcher");
const aiStatusLabel = document.querySelector("#ai-status-label");
const aiStatusDot = document.querySelector("#ai-status-dot");
if (aiStatusLabel) {
  fetch("/api/ai/status", { credentials: "same-origin", cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not check the Groq AI configuration.");
      const status = await response.json();
      aiStatusLabel.textContent = status.enabled ? `Groq AI ready · ${status.model}` : "Groq AI not configured";
      aiStatusDot?.classList.toggle("ai-disabled", !status.enabled);
    })
    .catch(() => {
      aiStatusLabel.textContent = "Groq AI status unavailable";
      aiStatusDot?.classList.add("ai-disabled");
    });
}
chatLauncher?.addEventListener("click", () => {
  chatPanel.hidden = !chatPanel.hidden;
  if (!chatPanel.hidden) chatInput?.focus();
});
document.querySelector("#chat-close")?.addEventListener("click", () => {
  chatPanel.hidden = true;
  chatLauncher?.focus();
});
document.querySelector("#chat-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput?.value.trim();
  if (!question) {
    chatInput?.focus();
    return;
  }
  addMessage(question, "user");
  chatInput.value = "";
  const submitButton = event.currentTarget.querySelector('button[type="submit"], button:not([type])');
  if (submitButton) submitButton.disabled = true;
  const pendingMessage = addMessage("Thinking…", "assistant");
  try {
    const reply = await searchLibrary(question);
    if (pendingMessage) pendingMessage.textContent = reply;
  } catch (error) {
    if (pendingMessage) pendingMessage.textContent = error.message;
  } finally {
    if (submitButton) submitButton.disabled = false;
    chatInput?.focus();
  }
});

const sidebar = document.querySelector("#sidebar");
const menuToggle = document.querySelector("#menu-toggle");
menuToggle?.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});
document.addEventListener("click", (event) => {
  if (sidebar?.classList.contains("open") && !sidebar.contains(event.target) && !menuToggle.contains(event.target)) {
    sidebar.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Open navigation");
  }
});

if (searchInput) {
  const initialQuery = new URLSearchParams(window.location.search).get("q");
  if (initialQuery) searchInput.value = initialQuery;
  updateResults();
}
refreshSavedDocuments();
