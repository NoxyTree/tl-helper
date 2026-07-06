import { createClient } from "@supabase/supabase-js";
import "../achievements/styles.css";
import "./styles.css";
import { TL_ACHIEVEMENTS } from "../achievements/data/achievements.js";

const STORAGE_KEY = "tl-achievement-tracker-progress-v1";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const state = {
  achievements: TL_ACHIEVEMENTS || [],
  progress: loadProgress(),
  session: null,
  profile: null,
  syncing: false,
  usernameEditing: false,
};

const els = {
  profileStatus: document.querySelector("#profileStatus"),
  heroProfileName: document.querySelector("#heroProfileName"),
  heroProfileCopy: document.querySelector("#heroProfileCopy"),
  openAuthButton: document.querySelector("#openAuthButton"),
  signOutButton: document.querySelector("#signOutButton"),
  authOverlay: document.querySelector("#authOverlay"),
  authClose: document.querySelector("#authClose"),
  googleLoginButton: document.querySelector("#googleLoginButton"),
  discordLoginButton: document.querySelector("#discordLoginButton"),
  accountTitle: document.querySelector("#accountTitle"),
  accountCopy: document.querySelector("#accountCopy"),
  profileActions: document.querySelector("#profileActions"),
  currentUsername: document.querySelector("#currentUsername"),
  manageUsernameButton: document.querySelector("#manageUsernameButton"),
  usernameForm: document.querySelector("#usernameForm"),
  usernameInput: document.querySelector("#usernameInput"),
  saveProfileButton: document.querySelector("#saveProfileButton"),
  cancelUsernameButton: document.querySelector("#cancelUsernameButton"),
  completionRing: document.querySelector("#completionRing"),
  completionPercent: document.querySelector("#completionPercent"),
  completedCount: document.querySelector("#completedCount"),
  openCount: document.querySelector("#openCount"),
  totalCount: document.querySelector("#totalCount"),
  totalMeter: document.querySelector("#totalMeter"),
  shareHandle: document.querySelector("#shareHandle"),
  sharePercent: document.querySelector("#sharePercent"),
  shareStatus: document.querySelector("#shareStatus"),
  categoryProgress: document.querySelector("#categoryProgress"),
  recentAchievements: document.querySelector("#recentAchievements"),
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

function persistProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function getRedirectUrl() {
  return new URL("/profile/", window.location.origin).toString();
}

function normalizeUsername(value) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
}

function getSuggestedUsername() {
  const source = state.profile?.username
    || state.profile?.display_name
    || state.session?.user?.user_metadata?.full_name
    || state.session?.user?.email?.split("@")[0]
    || "wanderer";
  return normalizeUsername(source.replace(/\s+/g, "_")) || "wanderer";
}

function getDisplayName() {
  return state.profile?.username
    || (state.session ? "Choose username" : null)
    || "Wanderer";
}

function getHandle() {
  return normalizeUsername(state.profile?.username || getSuggestedUsername() || "wanderer");
}

function getProfileSaveErrorMessage(error) {
  if (error?.code === "23505" || /duplicate key|profiles_username_key|unique/i.test(error?.message || "")) {
    return "That username is already taken";
  }
  return error?.message || "Could not save username";
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

function isDone(achievement) {
  return getCompletedStageIndexes(achievement).length >= getStageCount(achievement);
}

function getProgressStats() {
  const total = state.achievements.length;
  const completed = state.achievements.filter((achievement) => isDone(achievement)).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, open: total - completed, percent };
}

function getCategoryStats() {
  const categories = new Map();
  for (const achievement of state.achievements) {
    const key = achievement.categoryGroup || "Other";
    const existing = categories.get(key) || { name: key, total: 0, completed: 0 };
    existing.total += 1;
    if (isDone(achievement)) existing.completed += 1;
    categories.set(key, existing);
  }
  return [...categories.values()].sort((a, b) => {
    const progressSort = (b.completed / b.total) - (a.completed / a.total);
    return progressSort || a.name.localeCompare(b.name);
  });
}

function getRecentCompleted() {
  return state.achievements
    .filter((achievement) => isDone(achievement))
    .map((achievement) => ({
      ...achievement,
      updatedAt: state.progress[achievement.id]?.updatedAt || "",
    }))
    .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0) || a.title.localeCompare(b.title))
    .slice(0, 8);
}

function renderProfile() {
  const stats = getProgressStats();
  const signedIn = Boolean(state.session);
  const displayName = getDisplayName();
  const handle = getHandle();

  els.profileStatus.textContent = !supabase
    ? "Local profile"
    : signedIn
      ? displayName
      : "Not signed in";
  els.profileStatus.hidden = !signedIn;
  els.heroProfileName.textContent = displayName;
  els.heroProfileCopy.textContent = signedIn
    ? state.profile?.username
      ? `@${state.profile.username} is yours on TLHelper.`
      : "Choose a unique username to finish the account setup."
    : "Track completion locally, then sign in to sync and prepare a public profile.";

  els.openAuthButton.hidden = signedIn || !supabase;
  els.signOutButton.hidden = !signedIn;
  els.profileActions.hidden = !signedIn;
  els.accountTitle.textContent = signedIn ? "Username" : "Local profile";
  els.accountCopy.textContent = !supabase
    ? "Supabase environment variables are not configured for this build."
    : signedIn
      ? "This is the name reserved for your TLHelper profile."
      : "Progress is saved in this browser. Sign in with Google or Discord to sync it.";
  if (signedIn) {
    els.currentUsername.textContent = `@${handle}`;
    els.usernameForm.hidden = !state.usernameEditing;
    els.manageUsernameButton.hidden = state.usernameEditing;
    if (state.usernameEditing) {
      els.usernameInput.value = state.profile?.username || handle;
    }
  }

  els.completedCount.textContent = stats.completed;
  els.openCount.textContent = stats.open;
  els.totalCount.textContent = stats.total;
  els.completionPercent.textContent = `${stats.percent}%`;
  els.completionRing.style.setProperty("--progress", stats.percent);
  els.totalMeter.style.width = `${stats.percent}%`;
  els.shareHandle.textContent = `@${handle}`;
  els.sharePercent.textContent = `${stats.percent}% complete`;
  els.shareStatus.textContent = signedIn && state.profile?.username
    ? "Public profile URL is reserved for the next profile-sharing pass."
    : "Private until profile sharing is enabled.";
  els.syncStatus.textContent = !supabase
    ? "Local only"
    : state.syncing
      ? "Syncing..."
      : signedIn
        ? "Cloud ready"
        : "Local only";

  renderCategories();
  renderRecent();
}

function renderCategories() {
  const categories = getCategoryStats();
  els.categoryProgress.innerHTML = categories.map((category) => {
    const percent = category.total ? Math.round((category.completed / category.total) * 100) : 0;
    return `
      <article class="profile-category-row">
        <div>
          <strong>${escapeHtml(category.name)}</strong>
          <span>${category.completed}/${category.total}</span>
        </div>
        <span class="profile-wide-meter" aria-label="${percent}% complete"><i style="width: ${percent}%"></i></span>
      </article>
    `;
  }).join("");
}

function renderRecent() {
  const recent = getRecentCompleted();
  if (!recent.length) {
    els.recentAchievements.innerHTML = `
      <div class="empty-profile-state">
        <p>No completed achievements yet.</p>
        <a class="text-action-button profile-link-button" href="/achievements/">Start tracking</a>
      </div>
    `;
    return;
  }

  els.recentAchievements.innerHTML = recent.map((achievement) => `
    <article class="recent-achievement">
      <div>
        <strong>${escapeHtml(achievement.title)}</strong>
        <span>${escapeHtml(achievement.categoryGroup)} / ${escapeHtml(achievement.category)}</span>
      </div>
      <em>#${achievement.id}</em>
    </article>
  `).join("");
}

async function initSupabaseAuth() {
  if (!supabase) {
    renderProfile();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) showToast(error.message);
  state.session = data?.session || null;
  if (state.session) {
    await loadCloudProfileAndProgress();
  }
  renderProfile();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.profile = null;
    state.usernameEditing = false;
    closeAuthDialog();
    if (session) {
      await loadCloudProfileAndProgress();
      showToast("Profile connected");
    }
    renderProfile();
  });
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
  els.usernameInput.value = username;
  if (username.length < 3) {
    showToast("Username needs at least 3 characters");
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ username, display_name: username })
    .eq("id", state.session.user.id)
    .select("id, username, display_name, avatar_url, is_public, created_at")
    .single();

  if (error) {
    showToast(getProfileSaveErrorMessage(error));
    return;
  }

  state.profile = data;
  state.usernameEditing = false;
  renderProfile();
  showToast("Username changed");
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

  state.progress = mergeProgress(state.progress, rowsToProgress(data || []));
  persistProgress();
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

async function syncProgressToCloud({ silent = false } = {}) {
  if (!supabase || !state.session || state.syncing) return;
  state.syncing = true;
  renderProfile();

  try {
    const rows = progressToRows();
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
  state.usernameEditing = false;
  renderProfile();
  showToast("Signed out");
}

function openAuthDialog() {
  els.authOverlay.hidden = false;
}

function closeAuthDialog() {
  els.authOverlay.hidden = true;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1800);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

els.openAuthButton.addEventListener("click", openAuthDialog);
els.authClose.addEventListener("click", closeAuthDialog);
els.authOverlay.addEventListener("click", (event) => {
  if (event.target === els.authOverlay) closeAuthDialog();
});
els.googleLoginButton.addEventListener("click", () => {
  void signInWithProvider("google");
});
els.discordLoginButton.addEventListener("click", () => {
  void signInWithProvider("discord");
});
els.saveProfileButton.addEventListener("click", () => {
  void saveProfile();
});
els.manageUsernameButton.addEventListener("click", () => {
  state.usernameEditing = true;
  renderProfile();
  window.setTimeout(() => els.usernameInput.focus(), 0);
});
els.cancelUsernameButton.addEventListener("click", () => {
  state.usernameEditing = false;
  renderProfile();
});
els.usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void saveProfile();
  }
});
els.signOutButton.addEventListener("click", () => {
  void signOut();
});

renderProfile();
void initSupabaseAuth();
