const LANGUAGE_OPTIONS = [
  { value: "", label: "Default" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "nl", label: "Dutch" },
  { value: "sv", label: "Swedish" },
  { value: "ru", label: "Russian" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
];

const DEFAULT_THEME_OPTIONS = [
  { value: "", label: "Inherit" },
  { value: "sense", label: "Sense" },
  { value: "card", label: "Card" },
  { value: "breeze", label: "Breeze" },
  { value: "horizon", label: "Horizon" },
];

let themeOptions = [...DEFAULT_THEME_OPTIONS];

const UI_DEFINITIONS = [
  {
    id: "analyticsselections",
    label: "analytics/selections",
    ui: "analytics/selections",
    kind: "single",
    supports: { theme: true, identity: true, language: false, interactions: false, preview: false },
  },
  {
    id: "analyticsfield",
    label: "analytics/field",
    ui: "analytics/field",
    kind: "single",
    supports: { theme: true, identity: true, language: false, interactions: false, preview: false },
  },
  {
    id: "classicapp",
    label: "classic/app",
    ui: "classic/app",
    kind: "sheet",
    supports: { theme: true, identity: true, language: true, interactions: false, preview: false },
  },
  {
    id: "analyticssheet",
    label: "analytics/sheet",
    ui: "analytics/sheet",
    kind: "sheet",
    supports: { theme: true, identity: true, language: false, interactions: true, preview: true },
  },
  {
    id: "classicchart",
    label: "classic/chart",
    ui: "classic/chart",
    kind: "object",
    supports: { theme: true, identity: true, language: true, interactions: false, preview: false, iframe: true },
  },
  {
    id: "analyticschart",
    label: "analytics/chart",
    ui: "analytics/chart",
    kind: "object",
    supports: { theme: true, identity: true, language: false, interactions: true, preview: true },
  },
];

const DEFAULT_FIELD_ID = "$Field";
const DEFAULT_CONFIG = {
  theme: "",
  language: "",
  identity: "",
  preview: false,
  iframe: false,
  interactions: { active: true, passive: true, select: true },
};
const DEFAULT_CONFIG_COLLAPSED = true;

const state = {
  appConfig: null,
  assets: { sheets: [], objects: [] },
  items: new Map(),
  selected: new Set(),
  configs: new Map(),
  filter: "",
  activeConfigItem: null,
  embedReady: false,
  configCollapsed: true,
  collapsedSections: new Set(),
  pendingUrlState: null,
  isApplyingUrlState: false,
  /** Bumps qlik-embed `identity` to force a new engine session without a full reload. */
  connectionIdentityBump: 0,
};

const dom = {};

async function buildError(response, fallbackMessage) {
  const err = new Error(fallbackMessage);
  err.status = response.status;
  try {
    err.detail = await response.text();
  } catch {
    err.detail = "";
  }
  return err;
}

function uint8ToBinary(input) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < input.length; index += chunkSize) {
    const chunk = input.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
}

function binaryToUint8(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeState(payload) {
  const json = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(json);
  const base64 = btoa(uint8ToBinary(utf8Bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeState(encoded) {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(normalized);
  const bytes = binaryToUint8(binary);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

function compactConfig(config) {
  const compact = {};
  if (config.theme !== DEFAULT_CONFIG.theme) {
    compact.t = config.theme;
  }
  if (config.language !== DEFAULT_CONFIG.language) {
    compact.l = config.language;
  }
  if (config.identity !== DEFAULT_CONFIG.identity) {
    compact.i = config.identity;
  }
  if (config.preview !== DEFAULT_CONFIG.preview) {
    compact.p = config.preview;
  }
  if (config.iframe !== DEFAULT_CONFIG.iframe) {
    compact.if = config.iframe;
  }
  if (config.interactions.active !== DEFAULT_CONFIG.interactions.active) {
    compact.ia = config.interactions.active;
  }
  if (config.interactions.passive !== DEFAULT_CONFIG.interactions.passive) {
    compact.ip = config.interactions.passive;
  }
  if (config.interactions.select !== DEFAULT_CONFIG.interactions.select) {
    compact.is = config.interactions.select;
  }
  return compact;
}

function expandConfig(compact, existing) {
  const merged = {
    theme: existing.theme,
    language: existing.language,
    identity: existing.identity,
    preview: existing.preview,
    iframe: existing.iframe,
    interactions: { ...existing.interactions },
  };

  if (Object.prototype.hasOwnProperty.call(compact, "t")) {
    merged.theme = compact.t;
  }
  if (Object.prototype.hasOwnProperty.call(compact, "l")) {
    merged.language = compact.l;
  }
  if (Object.prototype.hasOwnProperty.call(compact, "i")) {
    merged.identity = compact.i;
  }
  if (Object.prototype.hasOwnProperty.call(compact, "p")) {
    merged.preview = Boolean(compact.p);
  }
  if (Object.prototype.hasOwnProperty.call(compact, "if")) {
    merged.iframe = Boolean(compact.if);
  }
  if (Object.prototype.hasOwnProperty.call(compact, "ia")) {
    merged.interactions.active = Boolean(compact.ia);
  }
  if (Object.prototype.hasOwnProperty.call(compact, "ip")) {
    merged.interactions.passive = Boolean(compact.ip);
  }
  if (Object.prototype.hasOwnProperty.call(compact, "is")) {
    merged.interactions.select = Boolean(compact.is);
  }

  return merged;
}

function buildShareState() {
  const selected = Array.from(state.selected).sort();
  const configs = {};

  selected.forEach((itemId) => {
    if (!state.configs.has(itemId)) {
      return;
    }
    const compact = compactConfig(state.configs.get(itemId));
    if (Object.keys(compact).length > 0) {
      configs[itemId] = compact;
    }
  });

  const payload = {
    v: 1,
    s: selected,
  };

  if (Object.keys(configs).length > 0) {
    payload.c = configs;
  }
  if (state.filter) {
    payload.f = state.filter;
  }
  if (state.collapsedSections.size > 0) {
    payload.h = Array.from(state.collapsedSections);
  }
  if (state.activeConfigItem) {
    payload.a = state.activeConfigItem;
  }
  if (state.configCollapsed !== DEFAULT_CONFIG_COLLAPSED) {
    payload.x = state.configCollapsed ? 1 : 0;
  }

  return payload;
}

function hasMeaningfulState(payload) {
  return (
    (Array.isArray(payload.s) && payload.s.length > 0)
    || Boolean(payload.f)
    || Boolean(payload.h && payload.h.length > 0)
    || Boolean(payload.a)
    || Boolean(payload.c && Object.keys(payload.c).length > 0)
  );
}

function syncStateToUrl() {
  if (state.isApplyingUrlState) {
    return;
  }

  const url = new URL(window.location.href);
  const payload = buildShareState();

  if (!hasMeaningfulState(payload)) {
    url.searchParams.delete("state");
  } else {
    url.searchParams.set("state", encodeState(payload));
  }

  history.replaceState(null, "", url.toString());
}

function parseStateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("state");
  if (!encoded) {
    return null;
  }

  try {
    return decodeState(encoded);
  } catch (error) {
    console.warn("Unable to parse share state from URL.", error);
    return null;
  }
}

function applyStatePayload(payload) {
  if (!payload || !Array.isArray(payload.s)) {
    return;
  }

  state.isApplyingUrlState = true;

  state.filter = typeof payload.f === "string" ? payload.f : "";
  dom.filterInput.value = state.filter;

  state.collapsedSections.clear();
  if (Array.isArray(payload.h)) {
    payload.h.forEach((sectionId) => {
      if (getSectionDefinition(sectionId)) {
        state.collapsedSections.add(sectionId);
      }
    });
  }

  state.selected.clear();
  payload.s.forEach((itemId) => {
    if (state.items.has(itemId)) {
      state.selected.add(itemId);
    }
  });

  if (payload.c && typeof payload.c === "object") {
    Object.entries(payload.c).forEach(([itemId, compact]) => {
      if (!state.items.has(itemId) || !compact || typeof compact !== "object") {
        return;
      }
      const existing = getItemConfig(itemId);
      state.configs.set(itemId, expandConfig(compact, existing));
    });
  }

  if (payload.a && state.items.has(payload.a)) {
    state.activeConfigItem = payload.a;
  } else {
    state.activeConfigItem = null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "x")) {
    state.configCollapsed = Boolean(payload.x);
  } else {
    state.configCollapsed = DEFAULT_CONFIG_COLLAPSED;
  }
  state.isApplyingUrlState = false;
}

async function rotateServerSession() {
  const response = await fetch("/session/rotate", {
    method: "POST",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  return response.ok;
}

async function recoverSessionAndReload() {
  await rotateServerSession();
  window.location.reload();
}

function handleAuthError(error) {
  if (error?.status === 401) {
    recoverSessionAndReload();
    return true;
  }
  return false;
}

function bumpConnectionIdentity() {
  state.connectionIdentityBump += 1;
  Array.from(state.selected).forEach((itemId) => {
    rerenderItem(itemId);
  });
}

async function getAccessToken() {
  const fetchToken = () =>
    fetch("/access-token", {
      method: "POST",
      credentials: "include",
      mode: "same-origin",
      redirect: "follow",
    });

  let response = await fetchToken();
  if (response.status === 401) {
    const rotated = await rotateServerSession();
    if (rotated) {
      await refreshAppConfig();
      state.connectionIdentityBump = 0;
      Array.from(state.selected).forEach((itemId) => {
        rerenderItem(itemId);
      });
      response = await fetchToken();
    }
  }
  if (response.status === 200) {
    return response.text();
  }
  if (response.status === 401) {
    if (state.connectionIdentityBump < 2) {
      bumpConnectionIdentity();
      response = await fetchToken();
      if (response.status === 200) {
        return response.text();
      }
    }
    await recoverSessionAndReload();
    throw await buildError(response, "Session recovery in progress");
  }
  throw await buildError(response, "Unexpected serverside authentication error");
}

window.getAccessToken = getAccessToken;
window.bumpQlikEmbedConnectionIdentity = bumpConnectionIdentity;

async function getSheets() {
  const response = await fetch("/assets", {
    method: "GET",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.json();
  }
  throw await buildError(response, "Unexpected error");
}

async function getConfig() {
  const response = await fetch("/config", {
    method: "GET",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.json();
  }
  throw await buildError(response, "Unexpected error");
}

async function refreshAppConfig() {
  try {
    const next = await getConfig();
    state.appConfig = state.appConfig ? { ...state.appConfig, ...next } : next;
    return true;
  } catch {
    return false;
  }
}

async function getThemes() {
  const response = await fetch("/themes", {
    method: "GET",
    credentials: "include",
    mode: "same-origin",
    redirect: "follow",
  });
  if (response.status === 200) {
    return response.json();
  }
  throw await buildError(response, "Unexpected error");
}

function normalizeThemeOptions(themeResponse) {
  const normalizeThemeLabel = (value) => value
    .replace(/^Themes\.Qlik\./i, "")
    .replace(/^Themes\./i, "")
    .trim();

  const liveThemes = Array.isArray(themeResponse?.data)
    ? themeResponse.data
      .filter((theme) => theme && theme.id)
      .map((theme) => ({
        value: theme.id,
        label: normalizeThemeLabel(theme.name || theme.id),
      }))
    : [];

  const merged = new Map();
  DEFAULT_THEME_OPTIONS.forEach((theme) => merged.set(theme.value, theme));
  liveThemes.forEach((theme) => merged.set(theme.value, theme));

  return [
    { value: "", label: "Inherit" },
    ...Array.from(merged.values())
      .filter((theme) => theme.value !== "")
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];
}

async function ensureQlikEmbedHead() {
  if (state.embedReady) {
    return;
  }
  const appConfig = await getConfig();
  state.appConfig = appConfig;

  const existingScript = document.querySelector("script[src*='@qlik/embed-web-components']");
  if (existingScript) {
    await new Promise((resolve, reject) => {
      if (existingScript.dataset.loaded === "true") {
        resolve();
        return;
      }
      existingScript.addEventListener("load", () => {
        existingScript.dataset.loaded = "true";
        resolve();
      }, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
    });
    state.embedReady = true;
    return;
  }

  const qlikEmbedScript = document.createElement("script");
  qlikEmbedScript.setAttribute("crossorigin", "anonymous");
  qlikEmbedScript.setAttribute("type", "application/javascript");
  qlikEmbedScript.setAttribute(
    "src",
    "https://cdn.jsdelivr.net/npm/@qlik/embed-web-components@1/dist/index.min.js",
  );
  qlikEmbedScript.setAttribute("data-host", appConfig.host);
  qlikEmbedScript.setAttribute("data-client-id", appConfig.clientId);
  qlikEmbedScript.setAttribute("data-get-access-token", "getAccessToken");
  qlikEmbedScript.setAttribute("data-auth-type", "Oauth2");
  await new Promise((resolve, reject) => {
    qlikEmbedScript.addEventListener("load", () => {
      qlikEmbedScript.dataset.loaded = "true";
      resolve();
    }, { once: true });
    qlikEmbedScript.addEventListener("error", reject, { once: true });
    document.head.appendChild(qlikEmbedScript);
  });
  state.embedReady = true;
}

function appendMetaRow(container, label, value) {
  if (!value) {
    return;
  }
  const row = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  row.appendChild(strong);
  row.append(" ", value);
  container.appendChild(row);
}

function setAssetsStatus(message, tone = "idle") {
  dom.assetsStatus.textContent = message;
  dom.assetsStatus.dataset.tone = tone;
}

function buildItems() {
  state.items.clear();
  UI_DEFINITIONS.forEach((section) => {
    if (section.kind === "single") {
      const itemId = `${section.id}::single`;
      state.items.set(itemId, {
        id: itemId,
        sectionId: section.id,
        label: section.label,
        name: section.label,
        ui: section.ui,
        sheetId: null,
        objectId: null,
        fieldId: section.id === "analyticsfield" ? DEFAULT_FIELD_ID : null,
      });
    }

    if (section.kind === "sheet") {
      state.assets.sheets.forEach((sheet) => {
        const itemId = `${section.id}::${sheet.id}`;
        state.items.set(itemId, {
          id: itemId,
          sectionId: section.id,
          label: sheet.name,
          name: sheet.name,
          ui: section.ui,
          sheetId: sheet.id,
          objectId: null,
          fieldId: null,
        });
      });
    }

    if (section.kind === "object") {
      state.assets.objects.forEach((obj) => {
        const itemId = `${section.id}::${obj.id}`;
        state.items.set(itemId, {
          id: itemId,
          sectionId: section.id,
          label: obj.name,
          name: obj.name,
          ui: section.ui,
          sheetId: null,
          objectId: obj.id,
          fieldId: null,
        });
      });
    }
  });
}

function getSectionDefinition(sectionId) {
  return UI_DEFINITIONS.find((section) => section.id === sectionId);
}

function getItemConfig(itemId) {
  if (!state.configs.has(itemId)) {
    state.configs.set(itemId, {
      theme: DEFAULT_CONFIG.theme,
      language: DEFAULT_CONFIG.language,
      identity: DEFAULT_CONFIG.identity,
      preview: DEFAULT_CONFIG.preview,
      iframe: DEFAULT_CONFIG.iframe,
      interactions: { ...DEFAULT_CONFIG.interactions },
    });
  }
  return state.configs.get(itemId);
}

function updateEmptyState() {
  const hasSelection = state.selected.size > 0;
  dom.emptyState.classList.toggle("hidden", hasSelection);
}

function createOption(option) {
  const element = document.createElement("option");
  element.value = option.value;
  element.textContent = option.label;
  return element;
}

function renderSectionsList() {
  dom.sectionsList.innerHTML = "";
  UI_DEFINITIONS.forEach((section) => {
    const sectionItems = Array.from(state.items.values()).filter(
      (item) => item.sectionId === section.id,
    );
    const selectedCount = sectionItems.filter((item) => state.selected.has(item.id)).length;
    const allSelected = sectionItems.length > 0 && selectedCount === sectionItems.length;

    const filterValue = state.filter.trim().toLowerCase();
    const visibleItems = sectionItems.filter((item) =>
      item.name.toLowerCase().includes(filterValue),
    );
    const selectedVisibleCount = visibleItems.filter((item) => state.selected.has(item.id)).length;

    const sectionWrapper = document.createElement("div");
    sectionWrapper.className = "section-group";
    if (state.collapsedSections.has(section.id)) {
      sectionWrapper.classList.add("is-collapsed");
    }

    const header = document.createElement("div");
    header.className = "section-group__header";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "section-group__title section-group__collapse";
    title.textContent = section.label;
    title.addEventListener("click", () => {
      toggleSectionCollapsed(section.id);
    });

    const rightSide = document.createElement("div");
    rightSide.className = "section-group__actions";

    const meta = document.createElement("div");
    meta.className = "section-group__meta";
    meta.textContent = `${selectedVisibleCount}/${sectionItems.length}`;

    const toggleSelection = document.createElement("button");
    toggleSelection.type = "button";
    toggleSelection.className = "section-group__action";
    toggleSelection.textContent = allSelected ? "Clear" : "Select";
    toggleSelection.addEventListener("click", () => {
      toggleSectionSelection(section.id);
    });

    rightSide.appendChild(meta);
    rightSide.appendChild(toggleSelection);
    header.appendChild(title);
    header.appendChild(rightSide);
    sectionWrapper.appendChild(header);

    const list = document.createElement("div");
    list.className = "section-group__list";

    if (visibleItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "section-group__empty";
      empty.textContent = state.filter ? "No matches" : "No items";
      list.appendChild(empty);
    }

    visibleItems.forEach((item) => {
      const row = document.createElement("label");
      row.className = "section-item";
      row.dataset.itemId = item.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = state.selected.has(item.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          state.selected.add(item.id);
        } else {
          state.selected.delete(item.id);
        }
        updateSectionMeta();
        renderSelectedItems();
        syncStateToUrl();
      });

      const name = document.createElement("span");
      name.textContent = item.name;

      const action = document.createElement("button");
      action.className = "section-item__action";
      action.type = "button";
      action.textContent = "Configure";
      action.addEventListener("click", (event) => {
        event.preventDefault();
        toggleConfigForItem(item.id);
      });

      row.appendChild(checkbox);
      row.appendChild(name);
      row.appendChild(action);
      list.appendChild(row);
    });

    sectionWrapper.appendChild(list);
    dom.sectionsList.appendChild(sectionWrapper);
  });
}

function toggleSectionSelection(sectionId) {
  const sectionItems = Array.from(state.items.values()).filter((item) => item.sectionId === sectionId);
  const allSelected = sectionItems.length > 0 && sectionItems.every((item) => state.selected.has(item.id));

  if (allSelected) {
    sectionItems.forEach((item) => state.selected.delete(item.id));
  } else {
    sectionItems.forEach((item) => state.selected.add(item.id));
  }

  renderSectionsList();
  updateSectionMeta();
  renderSelectedItems();
  syncStateToUrl();
}

function toggleSectionCollapsed(sectionId) {
  if (state.collapsedSections.has(sectionId)) {
    state.collapsedSections.delete(sectionId);
  } else {
    state.collapsedSections.add(sectionId);
  }
  renderSectionsList();
  syncStateToUrl();
}

function updateSectionMeta() {
  UI_DEFINITIONS.forEach((section) => {
    const sectionItems = Array.from(state.items.values()).filter(
      (item) => item.sectionId === section.id,
    );
    const count = Array.from(state.selected).filter((itemId) =>
      itemId.startsWith(`${section.id}::`),
    ).length;
    const meta = document.getElementById(`meta-${section.id}`);
    if (meta) {
      meta.textContent = `${count}/${sectionItems.length}`;
    }
  });
  updateEmptyState();
}

function renderSelectedItems() {
  const renderedItems = [];

  UI_DEFINITIONS.forEach((section) => {
    const sectionContainer = document.getElementById(section.id);
    const body = document.getElementById(`body-${section.id}`);
    if (!body) {
      return;
    }
    body.innerHTML = "";
    const selectedItems = Array.from(state.selected)
      .map((itemId) => state.items.get(itemId))
      .filter((item) => item && item.sectionId === section.id);

    if (sectionContainer) {
      sectionContainer.classList.toggle("section-hidden", selectedItems.length === 0);
    }

    if (selectedItems.length === 0) {
      return;
    }

    const grid = document.createElement("div");
    grid.className = "embed-list";
    selectedItems.forEach((item) => {
      renderedItems.push(item);
      grid.appendChild(buildEmbedCard(item));
    });
    body.appendChild(grid);
  });

  renderShortcuts(renderedItems);
}

function buildEmbedCard(item) {
  const card = document.createElement("div");
  card.className = "embed-card";
  card.dataset.itemId = item.id;
  card.id = `render-${toDomId(item.id)}`;

  const header = document.createElement("div");
  header.className = "embed-card__header";
  const title = document.createElement("div");
  title.className = "embed-card__title";
  title.textContent = item.name;
  const subtitle = document.createElement("div");
  subtitle.className = "embed-card__subtitle";
  subtitle.textContent = item.ui;
  header.appendChild(title);
  header.appendChild(subtitle);

  const embedWrapper = document.createElement("div");
  embedWrapper.className = "embed-card__body";
  embedWrapper.dataset.ui = item.ui;
  embedWrapper.appendChild(createEmbedNode(item));

  card.appendChild(header);
  card.appendChild(embedWrapper);
  return card;
}

function toDomId(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function renderShortcuts(renderedItems) {
  if (!dom.jumpLinks || !dom.shortcutsMeta) {
    return;
  }

  dom.jumpLinks.innerHTML = "";

  if (renderedItems.length === 0) {
    dom.shortcutsMeta.textContent = "No rendered content";
    return;
  }

  const renderedSections = new Set(renderedItems.map((item) => item.sectionId));
  renderedSections.forEach((sectionId) => {
    const sectionDef = getSectionDefinition(sectionId);
    if (!sectionDef) {
      return;
    }
    const link = document.createElement("a");
    link.className = "jump-link jump-link--section";
    link.href = `#${sectionId}`;
    link.textContent = sectionDef.label;
    dom.jumpLinks.appendChild(link);
  });

  renderedItems.forEach((item) => {
    const link = document.createElement("a");
    link.className = "jump-link jump-link--item";
    link.href = `#render-${toDomId(item.id)}`;
    link.textContent = `${item.name} (${item.ui})`;
    dom.jumpLinks.appendChild(link);
  });

  dom.shortcutsMeta.textContent = `${renderedSections.size} sections, ${renderedItems.length} items`;
}

function createEmbedNode(item) {
  const config = getItemConfig(item.id);
  const embed = document.createElement("qlik-embed");

  embed.setAttribute("ui", item.ui);
  embed.setAttribute("app-id", state.appConfig.appId);
  if (item.sheetId) {
    embed.setAttribute("sheet-id", item.sheetId);
  }
  if (item.objectId) {
    embed.setAttribute("object-id", item.objectId);
  }
  if (item.fieldId) {
    embed.setAttribute("field-id", item.fieldId);
  }
  if (config.theme) {
    embed.setAttribute("theme", config.theme);
  }
  if (config.language) {
    embed.setAttribute("language", config.language);
  }
  const sessionIdentity = state.appConfig?.sessionIdentity || "";
  let identity = config.identity || sessionIdentity;
  if (state.connectionIdentityBump > 0) {
    identity = identity
      ? `${identity}-r${state.connectionIdentityBump}`
      : `r${state.connectionIdentityBump}`;
  }
  if (identity) {
    embed.setAttribute("identity", identity);
  }
  if (typeof config.preview === "boolean" && supportsParam(item.ui, "preview")) {
    embed.setAttribute("preview", String(config.preview));
  }
  if (typeof config.iframe === "boolean" && supportsParam(item.ui, "iframe")) {
    embed.setAttribute("iframe", String(config.iframe));
  }
  if (supportsParam(item.ui, "interactions")) {
    const interactions = config.interactions || DEFAULT_CONFIG.interactions;
    const context = { interactions };
    embed.setAttribute("context___json", JSON.stringify(context));
  }

  return embed;
}

function supportsParam(ui, param) {
  const definition = UI_DEFINITIONS.find((section) => section.ui === ui);
  return definition?.supports?.[param] === true;
}

function setActiveConfigItem(itemId) {
  state.activeConfigItem = itemId;
  renderConfigPanel();
  syncStateToUrl();
}

function setConfigPanelCollapsed(collapsed) {
  state.configCollapsed = collapsed;
  dom.configPanel.classList.toggle("collapsed", collapsed);
  dom.mainApp.classList.toggle("config-collapsed", collapsed);
  dom.toggleConfig.textContent = collapsed ? "Show" : "Hide";
  dom.reopenConfig.classList.toggle("visible", collapsed);
  syncStateToUrl();
}

function toggleConfigForItem(itemId) {
  if (state.configCollapsed) {
    setConfigPanelCollapsed(false);
    setActiveConfigItem(itemId);
    return;
  }

  if (state.activeConfigItem === itemId) {
    setConfigPanelCollapsed(true);
    return;
  }

  setActiveConfigItem(itemId);
}

function renderConfigPanel() {
  const item = state.items.get(state.activeConfigItem);
  dom.configPanelBody.innerHTML = "";

  if (!item) {
    dom.configSummary.textContent = "Select a chart or sheet to configure parameters.";
    return;
  }

  const config = getItemConfig(item.id);
  dom.configSummary.textContent = `${item.name} (${item.ui})`;

  const meta = document.createElement("div");
  meta.className = "config-meta";
  appendMetaRow(meta, "App", state.appConfig.appId);
  appendMetaRow(meta, "Sheet", item.sheetId);
  appendMetaRow(meta, "Object", item.objectId);
  appendMetaRow(meta, "Field", item.fieldId);
  dom.configPanelBody.appendChild(meta);

  if (supportsParam(item.ui, "theme")) {
    dom.configPanelBody.appendChild(
      buildSelectControl("Theme", "theme", config.theme, themeOptions, (value) => {
        config.theme = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  if (supportsParam(item.ui, "language")) {
    dom.configPanelBody.appendChild(
      buildSelectControl("Language", "language", config.language, LANGUAGE_OPTIONS, (value) => {
        config.language = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  if (supportsParam(item.ui, "identity")) {
    dom.configPanelBody.appendChild(
      buildTextControl("Identity", "identity", config.identity, (value) => {
        config.identity = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  if (supportsParam(item.ui, "preview")) {
    dom.configPanelBody.appendChild(
      buildToggleControl("Preview", "preview", config.preview, (value) => {
        config.preview = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  if (supportsParam(item.ui, "iframe")) {
    dom.configPanelBody.appendChild(
      buildToggleControl("Iframe", "iframe", config.iframe, (value) => {
        config.iframe = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  if (supportsParam(item.ui, "interactions")) {
    dom.configPanelBody.appendChild(
      buildToggleControl("Interactions: active", "interactions-active", config.interactions.active, (value) => {
        config.interactions.active = value;
        onItemConfigChanged(item.id);
      }),
    );
    dom.configPanelBody.appendChild(
      buildToggleControl("Interactions: passive", "interactions-passive", config.interactions.passive, (value) => {
        config.interactions.passive = value;
        onItemConfigChanged(item.id);
      }),
    );
    dom.configPanelBody.appendChild(
      buildToggleControl("Interactions: select", "interactions-select", config.interactions.select, (value) => {
        config.interactions.select = value;
        onItemConfigChanged(item.id);
      }),
    );
  }

  const applyRow = document.createElement("div");
  applyRow.className = "config-apply-row";
  const applyNow = document.createElement("button");
  applyNow.type = "button";
  applyNow.className = "panel-button secondary";
  applyNow.textContent = `Apply config to all ${item.ui}`;
  applyNow.addEventListener("click", () => {
    applyConfigToRenderedUiType(item.id);
  });
  applyRow.appendChild(applyNow);
  dom.configPanelBody.appendChild(applyRow);
}

function onItemConfigChanged(itemId) {
  rerenderItem(itemId);
  syncStateToUrl();
}

function applyConfigToRenderedUiType(sourceItemId) {
  const sourceItem = state.items.get(sourceItemId);
  if (!sourceItem) {
    return;
  }

  const sourceConfig = getItemConfig(sourceItemId);
  const sourceDefinition = getSectionDefinition(sourceItem.sectionId);
  Array.from(state.selected)
    .filter((targetId) => {
      if (targetId === sourceItemId) {
        return false;
      }
      const targetItem = state.items.get(targetId);
      return targetItem && targetItem.sectionId === sourceItem.sectionId;
    })
    .forEach((targetId) => {
      const targetConfig = getItemConfig(targetId);
      const nextConfig = {
        theme: sourceDefinition?.supports?.theme ? sourceConfig.theme : targetConfig.theme,
        language: sourceDefinition?.supports?.language ? sourceConfig.language : targetConfig.language,
        identity: sourceDefinition?.supports?.identity ? sourceConfig.identity : targetConfig.identity,
        preview: sourceDefinition?.supports?.preview ? sourceConfig.preview : targetConfig.preview,
        iframe: sourceDefinition?.supports?.iframe ? sourceConfig.iframe : targetConfig.iframe,
        interactions: sourceDefinition?.supports?.interactions
          ? { ...sourceConfig.interactions }
          : { ...targetConfig.interactions },
      };

      state.configs.set(targetId, {
        ...nextConfig,
      });
      rerenderItem(targetId);
    });

  syncStateToUrl();
}

function buildSelectControl(label, name, value, options, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "config-control";
  const title = document.createElement("span");
  title.textContent = label;
  const select = document.createElement("select");
  select.name = name;
  options.forEach((option) => select.appendChild(createOption(option)));
  select.value = value;
  select.addEventListener("change", (event) => onChange(event.target.value));
  wrapper.appendChild(title);
  wrapper.appendChild(select);
  return wrapper;
}

function buildTextControl(label, name, value, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "config-control";
  const title = document.createElement("span");
  title.textContent = label;
  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.placeholder = "Optional";
  input.value = value;
  input.addEventListener("input", (event) => onChange(event.target.value));
  wrapper.appendChild(title);
  wrapper.appendChild(input);
  return wrapper;
}

function buildToggleControl(label, name, value, onChange, disabled = false) {
  const wrapper = document.createElement("label");
  wrapper.className = "config-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = name;
  input.checked = Boolean(value);
  input.disabled = disabled;
  input.addEventListener("change", (event) => onChange(event.target.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.appendChild(input);
  wrapper.appendChild(text);
  return wrapper;
}

function rerenderItem(itemId) {
  if (!state.selected.has(itemId)) {
    return;
  }
  const item = state.items.get(itemId);
  if (!item) {
    return;
  }

  const cards = document.querySelectorAll(".embed-card");
  let card = null;
  cards.forEach((node) => {
    if (node.dataset.itemId === itemId) {
      card = node;
    }
  });

  if (!card) {
    return;
  }

  const nextCard = buildEmbedCard(item);
  card.replaceWith(nextCard);
}

function selectFilteredItems() {
  const filterValue = state.filter.trim().toLowerCase();
  const visibleItems = Array.from(state.items.values()).filter((item) =>
    item.name.toLowerCase().includes(filterValue),
  );
  state.selected.clear();
  visibleItems.forEach((item) => state.selected.add(item.id));
  renderSectionsList();
  updateSectionMeta();
  renderSelectedItems();
  syncStateToUrl();
}

function clearSelections() {
  state.selected.clear();
  renderSectionsList();
  updateSectionMeta();
  renderSelectedItems();
  syncStateToUrl();
}

async function loadAssets() {
  setAssetsStatus("Loading...", "loading");
  await ensureQlikEmbedHead();
  try {
    const tenantThemes = await getThemes();
    themeOptions = normalizeThemeOptions(tenantThemes);
  } catch (error) {
    console.warn("Unable to load tenant themes. Using default theme list.", error);
    themeOptions = [...DEFAULT_THEME_OPTIONS];
  }

  const sheetDefs = await getSheets();
  const sheets = sheetDefs.map((sheet) => ({
    id: sheet.qMeta.id,
    name: sheet.qMeta.title,
  }));
  const objectsMap = new Map();
  sheetDefs.forEach((obj) => {
    obj.qData.cells.forEach((cell) => {
      if (!objectsMap.has(cell.name)) {
        objectsMap.set(cell.name, { id: cell.name, name: cell.type });
      }
    });
  });
  const objects = Array.from(objectsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  state.assets = {
    sheets: sheets.sort((a, b) => a.name.localeCompare(b.name)),
    objects,
  };
  buildItems();
  applyStatePayload(state.pendingUrlState);
  setConfigPanelCollapsed(state.configCollapsed);
  renderSectionsList();
  updateSectionMeta();
  renderSelectedItems();
  renderConfigPanel();
  syncStateToUrl();
  setAssetsStatus(`Loaded ${state.assets.sheets.length} sheets and ${state.assets.objects.length} objects`, "ready");
}

function bindDom() {
  dom.mainApp = document.getElementById("main-app");
  dom.configPanel = document.getElementById("config-panel");
  dom.toggleConfig = document.getElementById("toggle-config");
  dom.reopenConfig = document.getElementById("reopen-config");
  dom.sectionsList = document.getElementById("sections-list");
  dom.configPanelBody = document.getElementById("config-panel-body");
  dom.configSummary = document.getElementById("config-summary");
  dom.assetsStatus = document.getElementById("assets-status");
  dom.filterInput = document.getElementById("filter-input");
  dom.filterClear = document.getElementById("filter-clear");
  dom.selectAll = document.getElementById("select-all");
  dom.clearAll = document.getElementById("clear-all");
  dom.emptyState = document.getElementById("empty-state");
  dom.jumpLinks = document.getElementById("jump-links");
  dom.shortcutsMeta = document.getElementById("shortcuts-meta");
}

function bindEvents() {
  dom.toggleConfig.addEventListener("click", () => {
    setConfigPanelCollapsed(!state.configCollapsed);
  });

  dom.reopenConfig.addEventListener("click", () => {
    setConfigPanelCollapsed(false);
  });

  dom.filterInput.addEventListener("input", (event) => {
    state.filter = event.target.value;
    renderSectionsList();
    syncStateToUrl();
  });

  dom.filterClear.addEventListener("click", () => {
    state.filter = "";
    dom.filterInput.value = "";
    renderSectionsList();
    syncStateToUrl();
  });

  dom.selectAll.addEventListener("click", () => {
    selectFilteredItems();
  });

  dom.clearAll.addEventListener("click", () => {
    clearSelections();
  });
}

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (!reason || typeof reason !== "object") {
    return;
  }
  if (reason.status !== 401) {
    return;
  }
  if (state.connectionIdentityBump < 3) {
    bumpConnectionIdentity();
  } else {
    recoverSessionAndReload();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  state.pendingUrlState = parseStateFromUrl();
  bindDom();
  bindEvents();
  renderSectionsList();
  updateSectionMeta();
  renderConfigPanel();
  loadAssets().catch((error) => {
    if (handleAuthError(error)) {
      return;
    }
    setAssetsStatus("Failed to load assets", "error");
    console.error(error);
  });
});
