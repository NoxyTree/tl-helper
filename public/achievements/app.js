const STORAGE_KEY = "tl-achievement-tracker-progress-v1";

const state = {
  achievements: window.TL_ACHIEVEMENTS || [],
  meta: window.TL_ACHIEVEMENT_META || {},
  progress: loadProgress(),
  search: "",
  category: "all",
  status: "all",
  hideCompleted: false,
  sort: "category",
  page: 1,
  pageSize: 50,
  activeAchievementId: null,
};

const els = {
  achievementGrid: document.querySelector("#achievementGrid"),
  categoryList: document.querySelector("#categoryList"),
  searchInput: document.querySelector("#searchInput"),
  hideCompleted: document.querySelector("#hideCompleted"),
  clearFilters: document.querySelector("#clearFilters"),
  resultTitle: document.querySelector("#resultTitle"),
  sortSelect: document.querySelector("#sortSelect"),
  resetProgress: document.querySelector("#resetProgress"),
  completedCount: document.querySelector("#completedCount"),
  totalCount: document.querySelector("#totalCount"),
  openCount: document.querySelector("#openCount"),
  categoryCount: document.querySelector("#categoryCount"),
  completionPercent: document.querySelector("#completionPercent"),
  completionRing: document.querySelector("#completionRing"),
  emptyState: document.querySelector("#emptyState"),
  pageSummary: document.querySelector("#pageSummary"),
  pageSizeSelect: document.querySelector("#pageSizeSelect"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageIndicator: document.querySelector("#pageIndicator"),
  detailOverlay: document.querySelector("#detailOverlay"),
  detailBody: document.querySelector("#detailBody"),
  detailClose: document.querySelector("#detailClose"),
  toast: document.querySelector("#toast"),
};

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function getStageCount(achievement) {
  return Math.max(Array.isArray(achievement.stages) ? achievement.stages.length : 0, 1);
}

function getCompletedStageIndexes(achievement) {
  const entry = state.progress[achievement.id];
  const stageCount = getStageCount(achievement);

  if (!entry) return [];
  if (Array.isArray(entry.completedStageIndexes)) {
    return [...new Set(entry.completedStageIndexes)]
      .filter((index) => Number.isInteger(index) && index >= 0 && index < stageCount)
      .sort((a, b) => a - b);
  }
  if (entry.completed) {
    return Array.from({ length: stageCount }, (_, index) => index);
  }
  return [];
}

function getCompletedStageCount(achievement) {
  return getCompletedStageIndexes(achievement).length;
}

function getProgressPercent(achievement) {
  return Math.round((getCompletedStageCount(achievement) / getStageCount(achievement)) * 100);
}

function isDone(idOrAchievement) {
  const achievement = typeof idOrAchievement === "object"
    ? idOrAchievement
    : state.achievements.find((item) => item.id === idOrAchievement);
  if (!achievement) return false;
  return getCompletedStageCount(achievement) >= getStageCount(achievement);
}

function isStageDone(achievement, stageIndex) {
  return getCompletedStageIndexes(achievement).includes(stageIndex);
}

function setAchievementProgress(achievement, stageIndexes) {
  const stageCount = getStageCount(achievement);
  const normalized = [...new Set(stageIndexes)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < stageCount)
    .sort((a, b) => a - b);

  if (!normalized.length) {
    delete state.progress[achievement.id];
    return;
  }

  state.progress[achievement.id] = {
    completed: normalized.length >= stageCount,
    completedStageIndexes: normalized,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeText(value) {
  return value.toLowerCase().trim();
}

function getCategories() {
  const categories = new Map();
  for (const achievement of state.achievements) {
    const existing = categories.get(achievement.category) || {
      name: achievement.category,
      group: achievement.categoryGroup,
      total: 0,
      done: 0,
    };
    existing.total += 1;
    if (isDone(achievement)) existing.done += 1;
    categories.set(achievement.category, existing);
  }

  return [...categories.values()].sort((a, b) => {
    const groupSort = a.group.localeCompare(b.group);
    return groupSort || a.name.localeCompare(b.name);
  });
}

function getFilteredAchievements() {
  const query = normalizeText(state.search);
  let rows = state.achievements.filter((achievement) => {
    const done = isDone(achievement);
    const matchesSearch = !query
      || normalizeText(`${achievement.title} ${achievement.category} ${achievement.categoryGroup}`).includes(query);
    const matchesCategory = state.category === "all" || achievement.category === state.category;
    const matchesStatus = state.status === "all"
      || (state.status === "done" && done)
      || (state.status === "open" && !done);
    const matchesHidden = !state.hideCompleted || !done;
    return matchesSearch && matchesCategory && matchesStatus && matchesHidden;
  });

  rows = rows.sort((a, b) => {
    if (state.sort === "title") return a.title.localeCompare(b.title);
    if (state.sort === "progress") return getProgressPercent(a) - getProgressPercent(b) || a.title.localeCompare(b.title);
    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  });

  return rows;
}

function getPagedAchievements(rows) {
  const totalPages = getTotalPages(rows.length);
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const start = (state.page - 1) * state.pageSize;
  return rows.slice(start, start + state.pageSize);
}

function getTotalPages(totalRows) {
  return Math.max(Math.ceil(totalRows / state.pageSize), 1);
}

function resetPage() {
  state.page = 1;
}

function renderCategories() {
  const categories = getCategories();
  els.categoryList.innerHTML = "";

  const allButton = createCategoryButton({
    name: "All",
    group: "Chronicle",
    total: state.achievements.length,
    done: state.achievements.filter((achievement) => isDone(achievement)).length,
  }, "all");
  els.categoryList.append(allButton);

  for (const category of categories) {
    els.categoryList.append(createCategoryButton(category, category.name));
  }
}

function createCategoryButton(category, value) {
  const button = document.createElement("button");
  const percent = category.total ? Math.round((category.done / category.total) * 100) : 0;
  button.className = `category-button${state.category === value ? " active" : ""}`;
  button.type = "button";
  button.dataset.category = value;
  button.innerHTML = `
    <span>
      <strong>${escapeHtml(category.name)}</strong>
      <small>${escapeHtml(category.group)}</small>
    </span>
    <span class="category-meter" aria-label="${percent}% complete">
      <i style="width: ${percent}%"></i>
    </span>
    <em>${category.done}/${category.total}</em>
  `;
  button.addEventListener("click", () => {
    state.category = value;
    resetPage();
    render();
  });
  return button;
}

function renderAchievements() {
  const rows = getFilteredAchievements();
  const pageRows = getPagedAchievements(rows);
  els.achievementGrid.innerHTML = "";
  els.emptyState.hidden = rows.length > 0;
  els.resultTitle.textContent = state.category === "all" ? "All achievements" : state.category;
  renderPagination(rows.length);

  for (const achievement of pageRows) {
    const done = isDone(achievement);
    const completedStages = getCompletedStageCount(achievement);
    const stageCount = getStageCount(achievement);
    const progressPercent = getProgressPercent(achievement);
    const card = document.createElement("article");
    card.className = `achievement-card${done ? " done" : ""}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open details for ${achievement.title}`);
    card.innerHTML = `
      ${renderAchievementBadge(achievement, "achievement-icon")}
      <div class="achievement-content">
        <div class="achievement-meta">
          <span>${escapeHtml(achievement.categoryGroup)}</span>
          <span>${escapeHtml(achievement.category)}</span>
          <span>#${achievement.id}</span>
        </div>
        <h3>${escapeHtml(achievement.title)}</h3>
        <p>${escapeHtml(achievement.categoryGroup)} / ${escapeHtml(achievement.category)}</p>
        <div class="card-progress" aria-label="${progressPercent}% complete">
          <span><i style="width: ${progressPercent}%"></i></span>
          <em>${completedStages}/${stageCount} stages</em>
        </div>
      </div>
      <button class="check-button" type="button" aria-label="${done ? "Mark open" : "Mark complete"}">
        <span></span>
      </button>
    `;

    const toggle = card.querySelector(".check-button");
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleAchievement(achievement);
    });
    card.addEventListener("click", () => openDetails(achievement));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails(achievement);
      }
    });
    els.achievementGrid.append(card);
  }
}

function toggleAchievement(achievement) {
  const next = !isDone(achievement);
  const stageIndexes = next
    ? Array.from({ length: getStageCount(achievement) }, (_, index) => index)
    : [];
  setAchievementProgress(achievement, stageIndexes);
  saveProgress();
  if (next) showToast(`Claimed: ${achievement.title}`);
  render();
}

function toggleStage(achievement, stageIndex) {
  const stageIndexes = new Set(getCompletedStageIndexes(achievement));
  if (stageIndexes.has(stageIndex)) {
    stageIndexes.delete(stageIndex);
  } else {
    stageIndexes.add(stageIndex);
  }

  setAchievementProgress(achievement, [...stageIndexes]);
  saveProgress();

  if (isDone(achievement)) showToast(`Claimed: ${achievement.title}`);
  render();
}

function renderPagination(totalRows) {
  const totalPages = getTotalPages(totalRows);
  const start = totalRows === 0 ? 0 : (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, totalRows);

  els.pageSummary.textContent = totalRows
    ? `Showing ${start}-${end} of ${totalRows}`
    : "Showing 0 achievements";
  els.pageIndicator.textContent = `${state.page} / ${totalPages}`;
  els.prevPage.disabled = state.page <= 1;
  els.nextPage.disabled = state.page >= totalPages;
  els.pageSizeSelect.value = String(state.pageSize);
}

function renderStats() {
  const total = state.achievements.length;
  const completed = state.achievements.filter((achievement) => isDone(achievement)).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const categoryCount = new Set(state.achievements.map((achievement) => achievement.category)).size;

  els.totalCount.textContent = total;
  els.completedCount.textContent = completed;
  els.openCount.textContent = total - completed;
  els.categoryCount.textContent = categoryCount;
  els.completionPercent.textContent = `${percent}%`;
  els.completionRing.style.setProperty("--progress", percent);
}

function renderFilterChips() {
  document.querySelectorAll(".filter-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.status === state.status);
  });
}

function render() {
  renderStats();
  renderFilterChips();
  renderCategories();
  renderAchievements();
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1800);
}

async function openDetails(achievement) {
  state.activeAchievementId = achievement.id;
  els.detailOverlay.hidden = false;
  document.body.classList.add("details-open");
  renderDetailLoading(achievement);

  if (hasCachedDetails(achievement)) {
    renderDetail(achievement, achievement);
    return;
  }

  renderDetailError(achievement, new Error("Details are not available in the local achievement data yet."));
}

function hasCachedDetails(achievement) {
  return Boolean(
    achievement.description
    || (Array.isArray(achievement.stages) && achievement.stages.length)
    || achievement.categoryPath
  );
}

function closeDetails() {
  els.detailOverlay.hidden = true;
  document.body.classList.remove("details-open");
  els.detailBody.innerHTML = "";
  state.activeAchievementId = null;
}

function renderDetailLoading(achievement) {
  els.detailBody.innerHTML = `
    <div class="detail-loading">
      ${renderAchievementBadge(achievement, "detail-icon")}
      <p class="panel-label">Loading achievement</p>
      <h2 id="detailTitle">${escapeHtml(achievement.title)}</h2>
    </div>
  `;
}

function renderDetail(achievement, detail) {
  const title = detail.title || achievement.title;
  const categoryPath = detail.categoryPath || `${achievement.categoryGroup}/${achievement.category}`;
  const stages = Array.isArray(detail.stages) ? detail.stages : [];
  const detailAchievement = {
    ...achievement,
    ...detail,
    id: achievement.id,
    stages,
  };
  const activeRows = getFilteredAchievements();
  const activeIndex = activeRows.findIndex((item) => item.id === achievement.id);
  const previousAchievement = activeRows[activeIndex - 1];
  const nextAchievement = activeRows[activeIndex + 1];
  const completedStages = getCompletedStageCount(detailAchievement);
  const stageCount = getStageCount(detailAchievement);
  const progressPercent = getProgressPercent(detailAchievement);
  els.detailBody.innerHTML = `
    <div class="detail-nav">
      <button class="detail-nav-button" type="button" data-detail-nav="prev" ${previousAchievement ? "" : "disabled"}>Previous</button>
      <span>${activeIndex + 1} of ${activeRows.length}</span>
      <button class="detail-nav-button" type="button" data-detail-nav="next" ${nextAchievement ? "" : "disabled"}>Next</button>
    </div>

    <div class="detail-header">
      ${renderAchievementBadge(detailAchievement, "detail-icon")}
      <div>
        <p class="panel-label">${escapeHtml(categoryPath)}</p>
        <h2 id="detailTitle">${escapeHtml(title)}</h2>
        <p class="detail-subtitle">Achievement #${achievement.id}</p>
      </div>
    </div>

    ${detail.description ? `<p class="detail-description">${escapeHtml(detail.description)}</p>` : ""}

    <div class="detail-progress" aria-label="${progressPercent}% complete">
      <span><i style="width: ${progressPercent}%"></i></span>
      <em>${completedStages}/${stageCount} stages complete</em>
    </div>

    <div class="detail-actions">
      <button class="detail-complete-button" type="button">${isDone(detailAchievement) ? "Mark all open" : "Mark all complete"}</button>
    </div>

    <section class="stage-list" aria-label="Achievement objectives">
      <p class="panel-label">Objectives</p>
      ${stages.length ? stages.map((stage, index) => renderStage(detailAchievement, stage, index)).join("") : `<div class="stage-card"><p>No staged objectives found for this achievement.</p></div>`}
    </section>
  `;

  const completeButton = els.detailBody.querySelector(".detail-complete-button");
  completeButton.addEventListener("click", () => {
    toggleAchievement(detailAchievement);
    renderDetail(detailAchievement, detailAchievement);
  });

  els.detailBody.querySelectorAll("[data-stage-index]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleStage(detailAchievement, Number(button.dataset.stageIndex));
      renderDetail(detailAchievement, detailAchievement);
    });
  });

  els.detailBody.querySelector('[data-detail-nav="prev"]')?.addEventListener("click", () => {
    if (previousAchievement) openDetails(previousAchievement);
  });
  els.detailBody.querySelector('[data-detail-nav="next"]')?.addEventListener("click", () => {
    if (nextAchievement) openDetails(nextAchievement);
  });
}

function renderStage(achievement, stage, index) {
  const rewards = Array.isArray(stage.rewards) ? stage.rewards : [];
  const done = isStageDone(achievement, index);
  return `
    <article class="stage-card${done ? " done" : ""}">
      <button class="stage-check" type="button" data-stage-index="${index}" aria-label="${done ? "Mark stage open" : "Mark stage complete"}">
        <span></span>
      </button>
      <div>
        <h3>${escapeHtml(stage.objective)}</h3>
        ${rewards.length ? `<ul>${rewards.map((reward) => `<li>${escapeHtml(reward)}</li>`).join("")}</ul>` : ""}
      </div>
    </article>
  `;
}

function renderDetailError(achievement, error) {
  els.detailBody.innerHTML = `
    <div class="detail-header">
      ${renderAchievementBadge(achievement, "detail-icon")}
      <div>
        <p class="panel-label">${escapeHtml(achievement.categoryGroup)} / ${escapeHtml(achievement.category)}</p>
        <h2 id="detailTitle">${escapeHtml(achievement.title)}</h2>
        <p class="detail-subtitle">Achievement #${achievement.id}</p>
      </div>
    </div>
    <p class="detail-description">${escapeHtml(error.message || "Could not load details.")}</p>
    <div class="detail-actions">
      <button class="detail-complete-button" type="button">${isDone(achievement) ? "Mark all open" : "Mark all complete"}</button>
    </div>
  `;

  const completeButton = els.detailBody.querySelector(".detail-complete-button");
  completeButton.addEventListener("click", () => {
    toggleAchievement(achievement);
    renderDetailError(achievement, error);
  });
}

function renderAchievementBadge(achievement, className) {
  return `
    <div class="${className}" aria-hidden="true">
      <span>${escapeHtml(getAchievementInitials(achievement))}</span>
    </div>
  `;
}

function getAchievementInitials(achievement) {
  const words = `${achievement.category || achievement.categoryGroup || achievement.title}`
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join("");
  return initials || "TL";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

els.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  resetPage();
  render();
});

els.hideCompleted.addEventListener("change", (event) => {
  state.hideCompleted = event.target.checked;
  resetPage();
  render();
});

els.clearFilters.addEventListener("click", () => {
  state.search = "";
  state.category = "all";
  state.status = "all";
  state.hideCompleted = false;
  resetPage();
  els.searchInput.value = "";
  els.hideCompleted.checked = false;
  render();
});

document.querySelectorAll(".filter-chip").forEach((button) => {
  button.addEventListener("click", () => {
    state.status = button.dataset.status;
    resetPage();
    render();
  });
});

els.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  resetPage();
  render();
});

els.pageSizeSelect.addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value);
  resetPage();
  render();
});

els.prevPage.addEventListener("click", () => {
  state.page = Math.max(state.page - 1, 1);
  render();
});

els.nextPage.addEventListener("click", () => {
  const totalPages = getTotalPages(getFilteredAchievements().length);
  state.page = Math.min(state.page + 1, totalPages);
  render();
});

els.resetProgress.addEventListener("click", () => {
  const hasProgress = Object.keys(state.progress).length > 0;
  if (!hasProgress) return;
  const confirmed = window.confirm("Reset all local achievement progress?");
  if (!confirmed) return;
  state.progress = {};
  saveProgress();
  showToast("Local progress reset");
  render();
});

els.detailClose.addEventListener("click", closeDetails);
els.detailOverlay.addEventListener("click", (event) => {
  if (event.target === els.detailOverlay) closeDetails();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.detailOverlay.hidden) closeDetails();
});

render();
