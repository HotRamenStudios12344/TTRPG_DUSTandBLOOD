
let rulesData = null;
let metadataData = null;
let changelogData = { changes: [] };

const content = document.getElementById("content");
const sidebar = document.getElementById("sidebar");
const breadcrumb = document.getElementById("breadcrumb-current");
const toc = document.getElementById("table-of-contents");
const search = document.getElementById("search");
const resultsBox = document.getElementById("search-results");

const escapeHTML = value =>
  String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);

// Load JSON without using stale browser cache entries.
async function loadJSON(path) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${path}${separator}_=${Date.now()}`;

  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Could not load ${path} (HTTP ${response.status})`
    );
  }

  return response.json();
}

// Load the rulebook and initialize the website.
async function loadRulebook() {
  try {
    const [loadedRules, loadedMetadata, loadedChanges] =
      await Promise.all([
        loadJSON("./data/rules.json"),
        loadJSON("./data/metadata.json"),
        loadJSON("./data/changelog.json")
      ]);

    if (!loadedRules || !Array.isArray(loadedRules.pages)) {
      throw new Error(
        "rules.json must contain a pages array. Run the Python parser."
      );
    }

    rulesData = loadedRules;
    metadataData = loadedMetadata || {};
    changelogData = loadedChanges || { changes: [] };

    updateEdition();
    renderNavigation();
    renderChangeLog();

    const initialPage =
      getPages().find(page => page.id === "overview") ||
      getPages()[0];

    if (initialPage) {
      renderPage(initialPage.id, false);
    } else {
      content.innerHTML = "<h1>No rules pages found</h1>";
    }
  } catch (error) {
    console.error("Failed to load Dust & Blood:", error);

    if (content) {
      content.innerHTML = `
        <h1>Unable to load rules</h1>
        <p>Check that the Python parser generated the JSON files
        inside the website/data folder. Open this page through
        your local web server, not directly as a file.</p>
        <p class="muted">${escapeHTML(error.message)}</p>
      `;
    }
  }
}

// Update edition labels.
function updateEdition() {
  const edition = metadataData?.currentEdition || "Edition unspecified";
  const status = metadataData?.publicationStatus || "";

  const editionLabel = document.getElementById("edition-label");

  if (editionLabel) {
    editionLabel.textContent = edition;
  }

  const footerEdition = document.getElementById("footer-edition");

  if (footerEdition) {
    footerEdition.textContent = status
      ? `${edition} · ${status}`
      : edition;
  }
}

// Get all loaded pages.
function getPages() {
  return rulesData?.pages || [];
}

// Find a page by its ID.
function findPage(id) {
  return getPages().find(page => page.id === id);
}

// Build the navigation, grouping all pages by category.
function renderNavigation() {
  const navigation = document.getElementById("navigation");

  if (!navigation) return;

  navigation.replaceChildren();

  const categories = new Map();

  for (const page of getPages()) {
    const category = String(page.category || "Rules").trim() || "Rules";

    if (!categories.has(category)) {
      categories.set(category, []);
    }

    categories.get(category).push(page);
  }

  for (const [category, pages] of categories) {
    const heading = document.createElement("div");
    heading.className = "nav-heading";
    heading.textContent = category;
    navigation.appendChild(heading);

    for (const page of pages) {
      const link = document.createElement("a");

      link.href = "#";
      link.className = "nav-link";
      link.dataset.page = page.id;
      link.textContent = page.title;

      link.addEventListener("click", event => {
        event.preventDefault();
        renderPage(page.id);
      });

      navigation.appendChild(link);
    }
  }
}

// Render page content.
// Supports both legacy HTML body pages and structured pages.
function renderPageBody(page) {
  if (typeof page.body === "string") {
    return page.body;
  }

  let html = "";

  if (page.summary) {
    html += `<p class="lead">${escapeHTML(page.summary)}</p>`;
  }

  for (const section of page.sections || []) {
    html += `<section id="${escapeHTML(section.id || "")}">`;
    html += `<h2>${escapeHTML(section.title || "")}</h2>`;

    for (const block of section.blocks || []) {
      if (block.type === "paragraph") {
        html += `<p>${escapeHTML(block.text)}</p>`;
      }

      if (block.type === "list") {
        html += "<ul>";

        for (const item of block.items || []) {
          html += `<li>${escapeHTML(item)}</li>`;
        }

        html += "</ul>";
      }

      if (block.type === "table") {
        html += '<div class="table-wrap"><table><thead><tr>';

        for (const heading of block.headers || []) {
          html += `<th>${escapeHTML(heading)}</th>`;
        }

        html += "</tr></thead><tbody>";

        for (const row of block.rows || []) {
          html += "<tr>";

          for (const cell of row) {
            html += `<td>${escapeHTML(cell)}</td>`;
          }

          html += "</tr>";
        }

        html += "</tbody></table></div>";
      }

      // HTML blocks are trusted content from your own rules source.
      if (block.type === "html") {
        html += block.html || "";
      }
    }

    html += "</section>";
  }

  return html;
}

// Display a selected rulebook page.
function renderPage(id, scroll = true) {
  const page = findPage(id);

  if (!page) {
    console.warn(`Unknown rules page: ${id}`);
    return;
  }

  if (!content) return;

  if (typeof page.body === "string") {
    content.innerHTML = page.body;
  } else {
    content.innerHTML =
      `<h1>${escapeHTML(page.title)}</h1>` +
      renderPageBody(page);
  }

  if (breadcrumb) {
    breadcrumb.textContent = page.title;
  }

  document.title = `${page.title} — Dust & Blood`;

  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.toggle("active", link.dataset.page === id);
  });

  // Build the table of contents.
  if (toc) {
    const headings = [
      ...content.querySelectorAll("h2, h3")
    ];

    toc.innerHTML = headings.length
      ? headings.map((heading, index) => {
          if (!heading.id) {
            heading.id = `section-${index}`;
          }

          return (
            `<a class="toc-link" href="#${escapeHTML(heading.id)}">` +
            `${escapeHTML(heading.textContent)}</a>`
          );
        }).join("")
      : '<span class="muted">No sections</span>';
  }

  // Support links inside rule content that point to other pages.
  content.querySelectorAll("a[data-page]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      renderPage(link.dataset.page);
    });
  });

  if (scroll) {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  sidebar?.classList.remove("open");
}

// Convert HTML into searchable plain text.
function plainText(html) {
  const temporary = document.createElement("div");
  temporary.innerHTML = html;

  return temporary.textContent || temporary.innerText || "";
}

// Prepare search entries for every page.
function allSearchEntries() {
  return getPages().map(page => ({
    id: page.id,
    title: page.title,
    text: plainText(renderPageBody(page))
  }));
}

// Search the rulebook.
function runSearch(query) {
  if (!resultsBox) return;

  const q = query.trim().toLowerCase();

  if (!q) {
    resultsBox.classList.add("hidden");
    resultsBox.innerHTML = "";
    return;
  }

  const matches = allSearchEntries()
    .map(page => ({
      ...page,
      score:
        (page.title.toLowerCase().includes(q) ? 5 : 0) +
        (page.text.toLowerCase().includes(q) ? 1 : 0)
    }))
    .filter(page => page.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  resultsBox.classList.remove("hidden");

  if (!matches.length) {
    resultsBox.innerHTML =
      '<div class="no-results">No matching rules found.</div>';
    return;
  }

  resultsBox.innerHTML = matches.map(page => {
    const text = page.text.toLowerCase();
    const index = text.indexOf(q);

    const excerpt = index >= 0
      ? page.text.slice(
          Math.max(0, index - 50),
          index + 110
        )
      : page.text.slice(0, 130);

    return `
      <a class="search-result" href="#"
         data-result-page="${escapeHTML(page.id)}">
        <strong>${escapeHTML(page.title)}</strong>
        <small>${escapeHTML(excerpt.trim())}…</small>
      </a>
    `;
  }).join("");

  resultsBox.querySelectorAll("[data-result-page]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();

      renderPage(link.dataset.resultPage);
      resultsBox.classList.add("hidden");

      if (search) {
        search.value = "";
      }
    });
  });
}

// Display the change history.
function renderChangeLog() {
  const container = document.getElementById("changelog-content");

  if (!container) return;

  const changes = changelogData?.changes || [];

  if (!changes.length) {
    container.innerHTML = "<p>No changes have been recorded yet.</p>";
    return;
  }

  container.innerHTML = changes.map(change => `
    <article class="change-entry">
      <div class="change-edition">${escapeHTML(change.edition)}</div>
      <h3>${escapeHTML(change.title)}</h3>
      <time datetime="${escapeHTML(change.date)}">
        ${escapeHTML(change.date)}
      </time>
      <p>${escapeHTML(change.description)}</p>
      <small>Section: ${escapeHTML(change.section)}</small>
    </article>
  `).join("");
}

// Open or close the changelog modal.
function setHistoryOpen(open) {
  const modal = document.getElementById("changelog-modal");

  if (!modal) return;

  modal.classList.toggle("hidden", !open);
}

document.getElementById("changelog-open")
  ?.addEventListener("click", () => setHistoryOpen(true));

document.getElementById("changelog-close")
  ?.addEventListener("click", () => setHistoryOpen(false));

document.querySelectorAll("[data-close-modal]").forEach(element => {
  element.addEventListener("click", () => setHistoryOpen(false));
});

// Search field events.
search?.addEventListener("input", () => {
  runSearch(search.value);
});

search?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    search.value = "";

    resultsBox?.classList.add("hidden");
  }

  if (event.key === "Enter") {
    resultsBox?.querySelector("[data-result-page]")?.click();
  }
});

// Close search results when clicking elsewhere.
document.addEventListener("click", event => {
  if (!event.target.closest(".search-wrap")) {
    resultsBox?.classList.add("hidden");
  }
});

// Mobile navigation toggle.
document.getElementById("mobile-menu")
  ?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
  });

// Keyboard shortcuts.
document.addEventListener("keydown", event => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA"].includes(
      document.activeElement?.tagName
    )
  ) {
    event.preventDefault();
    search?.focus();
  }

  if (event.key === "Escape") {
    setHistoryOpen(false);
  }
});

// Initialize the website.
loadRulebook();
