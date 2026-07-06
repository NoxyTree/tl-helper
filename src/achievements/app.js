import { createClient } from "@supabase/supabase-js";
import "./styles.css";
import { TL_ACHIEVEMENTS, TL_ACHIEVEMENT_META } from "./data/achievements.js";

const STORAGE_KEY = "tl-achievement-tracker-progress-v1";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
const GENERATED_ASSET_BASE = `${import.meta.env.BASE_URL}assets/generated/tlhelper-z/`;

const CATEGORY_VISUALS = {
  all: {
    image: "achievement-overview-strip.png",
    eyebrow: "Achievement Chronicle",
    title: "All achievements",
    body: "Filter by discipline, open achievement details, and keep your completion path moving.",
  },
  Adventure: {
    image: "adventure-codex-banner.png",
    eyebrow: "Adventure",
    title: "Regional exploration and story progress",
    body: "Track zone completion, regional objectives, and the codex work that turns wandering into progress.",
  },
  Content: {
    image: "content-banner.png",
    eyebrow: "Content",
    title: "Codex, dungeons, events and secret clears",
    body: "Keep long-form content achievements visible so nothing gets lost between dungeon runs and event rotations.",
  },
  Character: {
    image: "character-banner.png",
    eyebrow: "Character",
    title: "Growth, items and account progression",
    body: "Mark off the character milestones that quietly stack into a cleaner completion profile.",
  },
  Combat: {
    image: "combat-banner.png",
    eyebrow: "Combat",
    title: "Raids, PvP and challenge victories",
    body: "Separate the hard combat clears from the everyday checklist and see what still needs a group.",
  },
  Life: {
    image: "life-banner.png",
    eyebrow: "Life",
    title: "Crafting, cooking, fishing and gathering",
    body: "A quieter board for the life-skill achievements that build up through steady play.",
  },
  "Co-Op": {
    image: "coop-banner.png",
    eyebrow: "Co-Op",
    title: "Guild and group achievements",
    body: "Track the clears that need coordination, repeat runs, or a committed party.",
  },
  Special: {
    image: "special-achievements-banner.png",
    eyebrow: "Special",
    title: "Rare feats and event achievements",
    body: "Keep prestigious or time-sensitive achievements in their own spotlight.",
  },
  Unsorted: {
    image: "hidden-achievements-banner.png",
    eyebrow: "Hidden",
    title: "Mystery and uncategorized objectives",
    body: "Useful for achievements that do not fit the normal map yet, including odd seasonal or battleground entries.",
  },
};

const state = {
  achievements: TL_ACHIEVEMENTS || [],
  meta: TL_ACHIEVEMENT_META || {},
  progress: loadProgress(),
  session: null,
  profile: null,
  syncTimer: null,
  syncing: false,
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
  categoryVisual: document.querySelector("#categoryVisual"),
  categoryVisualImage: document.querySelector("#categoryVisualImage"),
  categoryVisualEyebrow: document.querySelector("#categoryVisualEyebrow"),
  categoryVisualTitle: document.querySelector("#categoryVisualTitle"),
  categoryVisualBody: document.querySelector("#categoryVisualBody"),
  profileStatus: document.querySelector("#profileStatus"),
  profileMode: document.querySelector("#profileMode"),
  profileName: document.querySelector("#profileName"),
  profileCopy: document.querySelector("#profileCopy"),
  authPanel: document.querySelector("#authPanel"),
  profileActions: document.querySelector("#profileActions"),
  openAuthButton: document.querySelector("#openAuthButton"),
  authOverlay: document.querySelector("#authOverlay"),
  authClose: document.querySelector("#authClose"),
  googleLoginButton: document.querySelector("#googleLoginButton"),
  discordLoginButton: document.querySelector("#discordLoginButton"),
  usernameInput: document.querySelector("#usernameInput"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  syncProgressButton: document.querySelector("#syncProgressButton"),
  signOutButton: document.querySelector("#signOutButton"),
  syncStatus: document.querySelector("#syncStatus"),
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
  queueProgressSync();
}

function getRedirectUrl() {
  return new URL("/achievements/", window.location.origin).toString();
}

function normalizeUsername(value) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

function getDisplayName() {
  return state.profile?.display_name
    || state.profile?.username
    || state.session?.user?.email
    || "Wanderer";
}

function renderProfile() {
  if (!supabase) {
    els.profileStatus.textContent = "Local profile";
    els.profileMode.textContent = "Local profile";
    els.profileName.textContent = "Wanderer";
    els.profileCopy.textContent = "Add Supabase env vars to enable synced profiles.";
    els.authPanel.hidden = true;
    els.profileActions.hidden = true;
    els.syncStatus.textContent = "Local only";
    return;
  }

  if (!state.session) {
    els.profileStatus.textContent = "Not signed in";
    els.profileMode.textContent = "Cloud profiles";
    els.profileName.textContent = "Wanderer";
    els.profileCopy.textContent = "Sign in to sync local progress and create a public profile later.";
    els.authPanel.hidden = false;
    els.profileActions.hidden = true;
    els.syncStatus.textContent = "Local only";
    return;
  }

  els.profileStatus.textContent = "Synced profile";
  els.profileMode.textContent = "Signed in";
  els.profileName.textContent = getDisplayName();
  els.profileCopy.textContent = "Progress syncs to your TLHelper profile.";
  els.authPanel.hidden = true;
  els.profileActions.hidden = false;
  els.usernameInput.value = state.profile?.username || "";
  els.syncStatus.textContent = state.syncing ? "Syncing..." : "Cloud sync ready";
}

async function initSupabaseAuth() {
  if (!supabase) {
    renderProfile();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showToast(error.message);
  }

  state.session = data?.session || null;
  if (state.session) {
    await loadCloudProfileAndProgress();
  }
  renderProfile();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.profile = null;
    if (session) {
      await loadCloudProfileAndProgress();
      showToast("Profile connected");
    }
    renderProfile();
    render();
  });
}

function openAuthDialog() {
  els.authOverlay.hidden = false;
}

function closeAuthDialog() {
  els.authOverlay.hidden = true;
}

async function signInWithProvider(provider) {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: getRedirectUrl(),
    },
  });
  if (error) showToast(error.message);
}

async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  state.session = null;
  state.profile = null;
  renderProfile();
  showToast("Signed out");
}

async function loadCloudProfileAndProgress() {
  if (!supabase || !state.session) return;
  await loadProfile();
  await loadCloudProgress();
}

async function loadProfile() {
  const user = state.session.user;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_public, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    showToast(error.message);
    return;
  }

  if (data) {
    state.profile = data;
    return;
  }

  const fallbackName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Wanderer";
  const { data: created, error: createError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      display_name: fallbackName,
      username: null,
      avatar_url: user.user_metadata?.avatar_url || null,
    })
    .select("id, username, display_name, avatar_url, is_public, created_at")
    .single();

  if (createError) {
    showToast(createError.message);
    return;
  }

  state.profile = created;
}

async function saveProfile() {
  if (!supabase || !state.session) return;
  const username = normalizeUsername(els.usernameInput.value);
  if (username && username.length < 3) {
    showToast("Username needs at least 3 characters");
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ username: username || null })
    .eq("id", state.session.user.id)
    .select("id, username, display_name, avatar_url, is_public, created_at")
    .single();

  if (error) {
    showToast(error.message);
    return;
  }

  state.profile = data;
  renderProfile();
  showToast("Profile saved");
}

async function loadCloudProgress() {
  const { data, error } = await supabase
    .from("achievement_progress")
    .select("achievement_id, completed, completed_stage_indexes, updated_at")
    .eq("user_id", state.session.user.id);

  if (error) {
    showToast(error.message);
    return;
  }

  const merged = mergeProgress(state.progress, rowsToProgress(data || []));
  state.progress = merged;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  await syncProgressToCloud({ silent: true });
}

function rowsToProgress(rows) {
  return rows.reduce((progress, row) => {
    progress[row.achievement_id] = {
      completed: Boolean(row.completed),
      completedStageIndexes: Array.isArray(row.completed_stage_indexes) ? row.completed_stage_indexes : [],
      updatedAt: row.updated_at,
    };
    return progress;
  }, {});
}

function mergeProgress(localProgress, cloudProgress) {
  const merged = { ...localProgress };
  for (const [id, cloudEntry] of Object.entries(cloudProgress)) {
    const localEntry = merged[id];
    const localTime = localEntry?.updatedAt ? Date.parse(localEntry.updatedAt) : 0;
    const cloudTime = cloudEntry?.updatedAt ? Date.parse(cloudEntry.updatedAt) : 0;
    if (!localEntry || cloudTime > localTime) {
      merged[id] = cloudEntry;
    }
  }
  return merged;
}

function progressToRows() {
  if (!state.session) return [];
  return Object.entries(state.progress).map(([achievementId, entry]) => ({
    user_id: state.session.user.id,
    achievement_id: Number(achievementId),
    completed: Boolean(entry.completed),
    completed_stage_indexes: Array.isArray(entry.completedStageIndexes) ? entry.completedStageIndexes : [],
    updated_at: entry.updatedAt || new Date().toISOString(),
  }));
}

function queueProgressSync() {
  if (!supabase || !state.session) return;
  window.clearTimeout(state.syncTimer);
  state.syncTimer = window.setTimeout(() => {
    void syncProgressToCloud({ silent: true });
  }, 600);
}

async function syncProgressToCloud({ silent = false } = {}) {
  if (!supabase || !state.session || state.syncing) return;
  const rows = progressToRows();
  state.syncing = true;
  renderProfile();

  try {
    const { error: deleteError } = await supabase
      .from("achievement_progress")
      .delete()
      .eq("user_id", state.session.user.id);
    if (deleteError) throw deleteError;

    if (rows.length) {
      const { error } = await supabase
        .from("achievement_progress")
        .upsert(rows, { onConflict: "user_id,achievement_id" });
      if (error) throw error;
    }
    if (!silent) showToast("Progress synced");
  } catch (error) {
    showToast(error.message || "Could not sync progress");
  } finally {
    state.syncing = false;
    renderProfile();
  }
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

function renderCategoryVisual() {
  const category = state.category === "all"
    ? null
    : state.achievements.find((achievement) => achievement.category === state.category);
  const visual = CATEGORY_VISUALS[category?.categoryGroup || "all"] || CATEGORY_VISUALS.all;
  els.categoryVisualImage.src = `${GENERATED_ASSET_BASE}${visual.image}`;
  els.categoryVisualImage.alt = "";
  els.categoryVisualEyebrow.textContent = visual.eyebrow;
  els.categoryVisualTitle.textContent = state.category === "all" ? visual.title : state.category;
  els.categoryVisualBody.textContent = visual.body;
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
  renderCategoryVisual();
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
els.authClose.addEventListener("click", closeAuthDialog);
els.authOverlay.addEventListener("click", (event) => {
  if (event.target === els.authOverlay) closeAuthDialog();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!els.detailOverlay.hidden) closeDetails();
  if (!els.authOverlay.hidden) closeAuthDialog();
});
els.openAuthButton.addEventListener("click", openAuthDialog);
els.googleLoginButton.addEventListener("click", () => {
  closeAuthDialog();
  void signInWithProvider("google");
});
els.discordLoginButton.addEventListener("click", () => {
  closeAuthDialog();
  void signInWithProvider("discord");
});
els.saveProfileButton.addEventListener("click", saveProfile);
els.syncProgressButton.addEventListener("click", () => syncProgressToCloud());
els.signOutButton.addEventListener("click", signOut);

render();
void initSupabaseAuth();
