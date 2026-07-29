(function () {
  "use strict";

  var STORAGE_KEY = "poshmark-inventory-v1";
  var THEME_KEY = "poshmark-inventory-theme";
  var state = { items: [], editingId: null, soldTargetId: null, priceTargetId: null, selectedAlertIds: new Set() };

  // ---------- theme ----------

  function applyTheme(choice) {
    if (choice === "light" || choice === "dark") {
      document.documentElement.setAttribute("data-theme", choice);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    document.querySelectorAll(".theme-toggle button").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.themeChoice === choice);
    });
  }

  function initTheme() {
    var saved = localStorage.getItem(THEME_KEY) || "system";
    applyTheme(saved);
    document.querySelectorAll(".theme-toggle button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var choice = btn.dataset.themeChoice;
        localStorage.setItem(THEME_KEY, choice);
        applyTheme(choice);
      });
    });
  }

  // ---------- persistence ----------

  function normalizeItem(it) {
    if (it.lastUpdate === undefined) it.lastUpdate = null;
    if (it.lastAcknowledgedMilestone === undefined) it.lastAcknowledgedMilestone = 0;
    if (it.priceHistory === undefined) it.priceHistory = [];
    return it;
  }

  function load() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        state.items = (parsed.items || []).map(normalizeItem);
        return;
      } catch (e) {
        console.warn("Could not parse saved data, reseeding.", e);
      }
    }
    seedFromDefaults();
  }

  function seedFromDefaults() {
    var seed = window.SEED_ITEMS || [];
    state.items = seed.map(function (it, i) {
      return normalizeItem(Object.assign({ id: "seed-" + i }, it));
    });
    save();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items }));
  }

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function nextSku() {
    var max = 0;
    state.items.forEach(function (it) {
      var n = Number(it.sku);
      if (!isNaN(n) && n > max) max = n;
    });
    return Math.floor(max) + 1;
  }

  // ---------- fee / profit math ----------

  function poshmarkFee(salePrice) {
    salePrice = Number(salePrice) || 0;
    return salePrice < 15 ? 2.95 : salePrice * 0.2;
  }

  function calcIncome(salePrice) {
    var fee = poshmarkFee(salePrice);
    return Math.round((salePrice - fee) * 100) / 100;
  }

  function calcProfit(income, purchasePrice) {
    var p = Number(purchasePrice) || 0;
    return Math.round((income - p) * 100) / 100;
  }

  function marginOf(item) {
    if (item.status !== "sold") return null;
    var income = Number(item.incomeAfterFees);
    var profit = Number(item.profit);
    if (!income) return null;
    return profit / income;
  }

  // ---------- date helpers ----------

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function daysBetween(a, b) {
    if (!a || !b) return null;
    var da = new Date(a);
    var db = new Date(b);
    if (isNaN(da) || isNaN(db)) return null;
    return Math.round((db - da) / 86400000);
  }

  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || n === "" || isNaN(n)) return "—";
    return "$" + Number(n).toFixed(2);
  }

  function fmtSku(sku) {
    if (sku === null || sku === undefined || sku === "") return "—";
    var n = Number(sku);
    if (!isNaN(n) && Number.isInteger(n)) return String(n);
    return String(sku);
  }

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------- tabs ----------

  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("active"); });
        document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
        btn.classList.add("active");
        document.getElementById("view-" + btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "dashboard") renderDashboard();
        if (btn.dataset.tab === "alerts") renderAlerts();
        if (btn.dataset.tab === "inventory") renderInventory();
        if (btn.dataset.tab === "sold") renderSold();
        if (btn.dataset.tab === "add" && !state.editingId) clearForm();
      });
    });
  }

  function goToTab(tab) {
    document.querySelector('.tab[data-tab="' + tab + '"]').click();
  }

  // ---------- distinct value helpers for filters/datalists ----------

  function distinct(field) {
    var set = new Set();
    state.items.forEach(function (it) {
      if (it[field]) set.add(it[field]);
    });
    return Array.from(set).sort();
  }

  function populateFilterSelect(select, values, placeholder) {
    var current = select.value;
    select.innerHTML = '<option value="">' + placeholder + '</option>';
    values.forEach(function (v) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if (values.indexOf(current) !== -1) select.value = current;
  }

  function populateDatalists() {
    var map = {
      "dl-department": "department",
      "dl-category": "category",
      "dl-subcategory": "subcategory",
      "dl-brand": "brand"
    };
    Object.keys(map).forEach(function (id) {
      var dl = document.getElementById(id);
      dl.innerHTML = "";
      distinct(map[id]).forEach(function (v) {
        var opt = document.createElement("option");
        opt.value = v;
        dl.appendChild(opt);
      });
    });
  }

  // ---------- paste-from-Poshmark parser ----------

  var PASTE_FIELD_LABELS = {
    title: "title",
    brand: "brand",
    size: "size",
    color: "color",
    listingPrice: "listing price",
    originalPrice: "original price",
    notes: "notes"
  };
  var PASTE_ALWAYS_CHECK = ["department", "category", "subcategory"];

  function extractJsonLdProduct(raw) {
    var re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    var match;
    while ((match = re.exec(raw))) {
      var data;
      try {
        data = JSON.parse(match[1]);
      } catch (e) {
        continue;
      }
      var nodes = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var type = node && node["@type"];
        if (type === "Product" || (Array.isArray(type) && type.indexOf("Product") !== -1)) {
          return node;
        }
      }
    }
    return null;
  }

  function sanitizeHtmlForText(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  }

  function htmlToText(html) {
    var div = document.createElement("div");
    div.style.cssText = "position:absolute; left:-99999px; top:-99999px;";
    div.innerHTML = sanitizeHtmlForText(html);
    document.body.appendChild(div);
    var text = div.innerText;
    document.body.removeChild(div);
    return text;
  }

  function containsBrand(text, brand) {
    var lowerText = text.toLowerCase();
    var lowerBrand = brand.toLowerCase();
    var idx = lowerText.indexOf(lowerBrand);
    if (idx === -1) return false;
    var before = idx > 0 ? lowerText[idx - 1] : " ";
    var afterIdx = idx + lowerBrand.length;
    var after = afterIdx < lowerText.length ? lowerText[afterIdx] : " ";
    var isWordChar = function (c) { return /[a-z0-9]/i.test(c); };
    return !isWordChar(before) && !isWordChar(after);
  }

  function findKnownBrand(text) {
    var brands = distinct("brand").slice().sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < brands.length; i++) {
      if (containsBrand(text, brands[i])) return brands[i];
    }
    return null;
  }

  function classifyPrices(text) {
    var lines = text.split(/\r?\n/);
    var listing = null, original = null, unlabeled = [];
    lines.forEach(function (line) {
      var re = /\$\s?([\d][\d,]*(?:\.\d{1,2})?)/g;
      var m;
      while ((m = re.exec(line))) {
        var amount = Number(m[1].replace(/,/g, ""));
        if (isNaN(amount)) continue;
        if (/original|retail|msrp|value/i.test(line)) {
          if (original === null) original = amount;
        } else if (/list(ing)?|asking/i.test(line)) {
          if (listing === null) listing = amount;
        } else {
          unlabeled.push(amount);
        }
      }
    });
    var ambiguous = null;
    if (listing === null && original === null) {
      if (unlabeled.length === 1) {
        listing = unlabeled[0];
        ambiguous = "listing price (unlabeled $" + unlabeled[0] + " - please confirm)";
      } else if (unlabeled.length > 1) {
        ambiguous = "price (found " + unlabeled.map(function (a) { return "$" + a; }).join(" and ") + " - couldn't tell which is which)";
      }
    }
    return { listingPrice: listing, originalPrice: original, ambiguous: ambiguous };
  }

  function parsePoshmarkPaste(raw) {
    raw = (raw || "").trim();
    if (!raw) return { fields: {}, filled: [], check: [], empty: true };

    var fields = {};
    var filled = [];
    var check = PASTE_ALWAYS_CHECK.slice();

    var product = extractJsonLdProduct(raw);
    if (product) {
      if (product.name) { fields.title = String(product.name); filled.push("title"); }
      var brandName = product.brand && (product.brand.name || product.brand);
      if (brandName) { fields.brand = String(brandName); filled.push("brand"); }
      if (product.description) { fields.notes = String(product.description).slice(0, 500); filled.push("notes"); }
      var price = product.offers && (product.offers.price || (product.offers[0] && product.offers[0].price));
      if (price !== undefined) {
        var n = Number(price);
        if (!isNaN(n)) { fields.listingPrice = n; filled.push("listingPrice"); }
      }
    }

    var looksLikeHtml = /<[a-z][\s\S]*>/i.test(raw);
    var text = looksLikeHtml ? htmlToText(raw) : raw;

    if (!fields.title) {
      var titleSizeMatch = text.match(/^(.*\S)\s*[-–—]\s*Size\s*:?\s*([A-Za-z0-9.\/]+(?:\s?\/\s?[A-Za-z0-9]+)?)\s*$/im);
      if (titleSizeMatch) {
        fields.title = titleSizeMatch[1].trim();
        fields.size = titleSizeMatch[2].trim();
        filled.push("title");
        filled.push("size");
      }
    }

    if (!fields.size) {
      var sizeMatch = text.match(/\bsize[:\s]{1,3}([A-Za-z0-9.\/]{1,12})\b/i);
      if (sizeMatch) {
        fields.size = sizeMatch[1].replace(/[.,;]+$/, "");
        check.push("size");
      }
    }

    if (!fields.brand) {
      var brand = findKnownBrand(text);
      if (brand) { fields.brand = brand; filled.push("brand"); }
    }

    var colorMatch = text.match(/^color[:\s]+([A-Za-z][A-Za-z ,\/-]{1,25})/im);
    if (colorMatch) { fields.color = colorMatch[1].trim(); filled.push("color"); }

    if (fields.listingPrice === undefined) {
      var prices = classifyPrices(text);
      if (prices.listingPrice !== null) {
        fields.listingPrice = prices.listingPrice;
        if (prices.ambiguous) check.push(prices.ambiguous); else filled.push("listingPrice");
      }
      if (prices.originalPrice !== null) {
        fields.originalPrice = prices.originalPrice;
        filled.push("originalPrice");
      }
      if (prices.listingPrice === null && prices.originalPrice === null && prices.ambiguous) {
        check.push(prices.ambiguous);
      }
    }

    if (!fields.notes) {
      var descMatch = text.match(/^description\s*:?\s*\n?(.+)$/im);
      if (descMatch && descMatch[1].trim()) {
        fields.notes = descMatch[1].trim().slice(0, 500);
        filled.push("notes");
      }
    }

    return { fields: fields, filled: filled, check: check, empty: false };
  }

  function applyParsedFields(fields) {
    var applied = [];
    Object.keys(fields).forEach(function (key) {
      var el = document.getElementById("f-" + key);
      if (!el) return;
      if (el.value.trim() !== "") return;
      el.value = fields[key];
      applied.push(key);
    });
    return applied;
  }

  function labelList(keys) {
    return keys.map(function (k) { return PASTE_FIELD_LABELS[k] || k; }).join(", ");
  }

  function handlePasteParse() {
    var raw = document.getElementById("paste-input").value;
    var result = parsePoshmarkPaste(raw);
    var summaryEl = document.getElementById("paste-result");
    summaryEl.hidden = false;

    if (result.empty) {
      summaryEl.textContent = "Paste something from your Poshmark listing first.";
      return;
    }

    var applied = applyParsedFields(result.fields);
    var appliedLabels = result.filled.filter(function (k) { return applied.indexOf(k) !== -1; });
    var recognizedButSkipped = Object.keys(result.fields).filter(function (k) { return applied.indexOf(k) === -1; });
    var uniqueCheck = Array.from(new Set(result.check));
    var foundNothingAtAll = !Object.keys(result.fields).length && uniqueCheck.length === PASTE_ALWAYS_CHECK.length;

    if (foundNothingAtAll) {
      summaryEl.textContent = "Couldn't find any recognizable listing data in that text - please fill in the form manually.";
      return;
    }

    var parts = [];
    if (appliedLabels.length) parts.push("Filled: " + labelList(appliedLabels) + ".");
    if (recognizedButSkipped.length) parts.push("Found " + labelList(recognizedButSkipped) + " too, but those fields already had a value so they were left as-is.");
    if (uniqueCheck.length) parts.push("Please check: " + uniqueCheck.map(function (k) { return PASTE_FIELD_LABELS[k] || k; }).join(", ") + ".");
    summaryEl.textContent = parts.join(" ");
  }

  function clearPasteBox() {
    document.getElementById("paste-input").value = "";
    document.getElementById("paste-result").hidden = true;
  }

  // ---------- dashboard / insights ----------

  function renderStatTile(label, value, sub) {
    var div = document.createElement("div");
    div.className = "stat-tile";
    div.innerHTML =
      '<div class="label">' + esc(label) + "</div>" +
      '<div class="value">' + value + "</div>" +
      (sub ? '<div class="sub">' + esc(sub) + "</div>" : "");
    return div;
  }

  var INSIGHTS_SCOPE_KEY = "poshmark-inventory-insights-scope";

  function getInsightsScope() {
    return localStorage.getItem(INSIGHTS_SCOPE_KEY) === "all" ? "all" : "year";
  }

  function setInsightsScope(scope) {
    localStorage.setItem(INSIGHTS_SCOPE_KEY, scope);
    renderDashboard();
  }

  function syncInsightsScopeToggle(scope) {
    document.querySelectorAll('#insights-scope-toggle button[data-insights-scope]').forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.insightsScope === scope);
    });
  }

  function renderBarList(container, rows, opts) {
    opts = opts || {};
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = '<p class="empty-note">Not enough data yet.</p>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    rows.forEach(function (r) {
      var row = document.createElement("div");
      row.className = "bar-row";
      var pct = max > 0 ? (r.value / max) * 100 : 0;
      row.innerHTML =
        '<div class="bar-label" title="' + esc(r.label) + '">' + esc(r.label) + "</div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="bar-value">' + esc(r.display) + "</div>";
      container.appendChild(row);
    });
  }

  function renderVerticalBars(container, rows) {
    container.innerHTML = "";
    if (!rows.length) {
      container.innerHTML = '<p class="empty-note">Not enough data yet.</p>';
      return;
    }
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }));
    rows.forEach(function (r) {
      var col = document.createElement("div");
      col.className = "vbar-col";
      var pct = max > 0 ? Math.max((r.value / max) * 100, 3) : 3;
      col.innerHTML =
        '<div class="bar-value">' + r.value + "</div>" +
        '<div class="vbar" style="height:' + pct + '%" title="' + esc(r.label) + ": " + r.value + '"></div>' +
        '<div class="vbar-label">' + esc(r.label) + "</div>";
      container.appendChild(col);
    });
  }

  function renderDashboardBanner() {
    var banner = document.getElementById("dashboard-banner");
    var stale = getStaleItems();
    if (!stale.length) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.innerHTML =
      "<span><strong>" + stale.length + "</strong> item" + (stale.length === 1 ? "" : "s") +
      " haven't sold in 30+ days.</span>" +
      '<button type="button" class="btn btn-sm btn-primary" id="banner-review">Review alerts</button>';
    document.getElementById("banner-review").addEventListener("click", function () { goToTab("alerts"); });
  }

  function renderDashboard() {
    renderDashboardBanner();
    var scope = getInsightsScope();
    syncInsightsScopeToggle(scope);

    var sold = state.items.filter(function (it) { return it.status === "sold"; });
    var active = state.items.filter(function (it) { return it.status === "active"; });
    var currentYear = new Date().getFullYear();
    var soldInScope = scope === "all" ? sold : sold.filter(function (it) {
      if (!it.dateSold) return false;
      var d = new Date(it.dateSold);
      return !isNaN(d) && d.getFullYear() === currentYear;
    });
    var scopeLabel = scope === "all" ? "All-time" : "This year";

    var totalProfit = soldInScope.reduce(function (s, it) { return s + (Number(it.profit) || 0); }, 0);
    var margins = soldInScope.map(marginOf).filter(function (m) { return m !== null && isFinite(m); });
    var avgMargin = margins.length ? margins.reduce(function (a, b) { return a + b; }, 0) / margins.length : null;
    var activeValue = active.reduce(function (s, it) { return s + (Number(it.listingPrice) || 0); }, 0);

    var statRow = document.getElementById("stat-row");
    statRow.innerHTML = "";
    statRow.appendChild(renderStatTile("Items Sold", soldInScope.length, scopeLabel));
    statRow.appendChild(renderStatTile("Active Inventory", active.length, fmtMoney(activeValue) + " in listing value"));
    statRow.appendChild(renderStatTile("Total Profit", fmtMoney(totalProfit), "After Poshmark fees · " + scopeLabel.toLowerCase()));
    statRow.appendChild(renderStatTile(
      "Average Profit Margin",
      avgMargin !== null ? (avgMargin * 100).toFixed(1) + "%" : "—",
      "Profit ÷ net income, per item"
    ));

    // top categories by units sold
    var catCounts = {};
    soldInScope.forEach(function (it) {
      var c = it.category || "Uncategorized";
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    var catRows = Object.keys(catCounts)
      .map(function (k) { return { label: k, value: catCounts[k], display: catCounts[k] + " sold" }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
    renderBarList(document.getElementById("chart-categories"), catRows);

    // top brands by units sold
    var brandCounts = {};
    soldInScope.forEach(function (it) {
      var b = it.brand;
      if (!b) return;
      brandCounts[b] = (brandCounts[b] || 0) + 1;
    });
    var brandRows = Object.keys(brandCounts)
      .map(function (k) { return { label: k, value: brandCounts[k], display: brandCounts[k] + " sold" }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
    renderBarList(document.getElementById("chart-brands"), brandRows);

    // profit margin by department
    var deptMargins = {};
    soldInScope.forEach(function (it) {
      var d = it.department || "Other";
      var m = marginOf(it);
      if (m === null || !isFinite(m)) return;
      if (!deptMargins[d]) deptMargins[d] = [];
      deptMargins[d].push(m);
    });
    var deptRows = Object.keys(deptMargins)
      .map(function (k) {
        var arr = deptMargins[k];
        var avg = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
        return { label: k, value: avg, display: (avg * 100).toFixed(0) + "%" };
      })
      .sort(function (a, b) { return b.value - a.value; });
    renderBarList(document.getElementById("chart-departments"), deptRows);

    // sales over time (last 12 months with sales, within the selected scope)
    var monthCounts = {};
    soldInScope.forEach(function (it) {
      if (!it.dateSold) return;
      var d = new Date(it.dateSold);
      if (isNaN(d)) return;
      var key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    var monthKeys = Object.keys(monthCounts).sort().slice(-12);
    var monthRows = monthKeys.map(function (k) {
      var parts = k.split("-");
      var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      return { label: label, value: monthCounts[k] };
    });
    renderVerticalBars(document.getElementById("chart-timeline"), monthRows);
  }

  // ---------- inventory (active) ----------

  function getFilteredActive() {
    var q = document.getElementById("inv-search").value.trim().toLowerCase();
    var skuQuery = document.getElementById("inv-filter-sku").value.trim().toLowerCase();
    var dept = document.getElementById("inv-filter-dept").value;
    var cat = document.getElementById("inv-filter-cat").value;
    var sort = document.getElementById("inv-sort").value;

    var rows = state.items.filter(function (it) { return it.status === "active"; });
    if (q) {
      rows = rows.filter(function (it) {
        return (
          (it.title && it.title.toLowerCase().indexOf(q) !== -1) ||
          (it.brand && it.brand.toLowerCase().indexOf(q) !== -1) ||
          (String(it.sku).toLowerCase().indexOf(q) !== -1)
        );
      });
    }
    if (skuQuery) {
      rows = rows.filter(function (it) { return String(it.sku).toLowerCase().indexOf(skuQuery) !== -1; });
    }
    if (dept) rows = rows.filter(function (it) { return it.department === dept; });
    if (cat) rows = rows.filter(function (it) { return it.category === cat; });

    var parts = sort.split("-");
    var field = parts[0], dir = parts[1];
    rows.sort(function (a, b) {
      var av = a[field], bv = b[field];
      if (field === "listingPrice") { av = Number(av) || 0; bv = Number(bv) || 0; }
      if (av === undefined || av === null) av = "";
      if (bv === undefined || bv === null) bv = "";
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function renderInventory() {
    populateFilterSelect(document.getElementById("inv-filter-dept"), distinct("department"), "All departments");
    populateFilterSelect(document.getElementById("inv-filter-cat"), distinct("category"), "All categories");

    var rows = getFilteredActive();
    document.getElementById("inv-count").textContent = rows.length + " item" + (rows.length === 1 ? "" : "s");

    var tbody = document.getElementById("inv-tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-note">No items match.</td></tr>';
      return;
    }
    var today = todayStr();
    rows.forEach(function (it) {
      var tr = document.createElement("tr");
      var days = daysBetween(it.dateListed, today);
      var milestone = getPendingMilestone(it);
      var staleBadge = milestone ? '<span class="stale-badge">' + milestone + '+</span>' : "";
      tr.innerHTML =
        "<td>" + esc(fmtSku(it.sku)) + "</td>" +
        '<td class="title-cell" title="' + esc(it.title) + '">' + esc(it.title) + "</td>" +
        "<td>" + esc(it.department || "—") + "</td>" +
        "<td>" + esc(it.category || "—") + "</td>" +
        "<td>" + esc(it.brand || "—") + "</td>" +
        "<td>" + esc(it.size || "—") + "</td>" +
        "<td>" + fmtDate(it.dateListed) + "</td>" +
        '<td class="num">' + (days !== null ? days : "—") + staleBadge + "</td>" +
        '<td class="num">' + fmtMoney(it.listingPrice) + "</td>" +
        '<td class="row-actions">' +
        '<button class="btn btn-sm btn-primary" data-action="sell" data-id="' + it.id + '">Mark Sold</button>' +
        '<button class="btn btn-sm" data-action="edit" data-id="' + it.id + '">Edit</button>' +
        '<button class="btn btn-sm btn-danger" data-action="delete" data-id="' + it.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  // ---------- sold ----------

  function getFilteredSold() {
    var q = document.getElementById("sold-search").value.trim().toLowerCase();
    var dept = document.getElementById("sold-filter-dept").value;
    var cat = document.getElementById("sold-filter-cat").value;
    var sort = document.getElementById("sold-sort").value;

    var rows = state.items.filter(function (it) { return it.status === "sold"; });
    if (q) {
      rows = rows.filter(function (it) {
        return (
          (it.title && it.title.toLowerCase().indexOf(q) !== -1) ||
          (it.brand && it.brand.toLowerCase().indexOf(q) !== -1) ||
          (String(it.sku).toLowerCase().indexOf(q) !== -1)
        );
      });
    }
    if (dept) rows = rows.filter(function (it) { return it.department === dept; });
    if (cat) rows = rows.filter(function (it) { return it.category === cat; });

    var parts = sort.split("-");
    var field = parts[0], dir = parts[1];
    rows.sort(function (a, b) {
      var av, bv;
      if (field === "margin") {
        av = marginOf(a) || 0; bv = marginOf(b) || 0;
      } else if (field === "profit") {
        av = Number(a.profit) || 0; bv = Number(b.profit) || 0;
      } else {
        av = a[field] || ""; bv = b[field] || "";
      }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }

  function renderSold() {
    populateFilterSelect(document.getElementById("sold-filter-dept"), distinct("department"), "All departments");
    populateFilterSelect(document.getElementById("sold-filter-cat"), distinct("category"), "All categories");

    var rows = getFilteredSold();
    document.getElementById("sold-count").textContent = rows.length + " item" + (rows.length === 1 ? "" : "s");

    var tbody = document.getElementById("sold-tbody");
    tbody.innerHTML = "";
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-note">No items match.</td></tr>';
      return;
    }
    rows.forEach(function (it) {
      var tr = document.createElement("tr");
      tr.className = "sold-row";
      var days = daysBetween(it.dateListed, it.dateSold);
      var margin = marginOf(it);
      var profit = Number(it.profit);
      var profitClass = isNaN(profit) ? "" : profit >= 0 ? "profit-pos" : "profit-neg";
      tr.innerHTML =
        "<td>" + esc(fmtSku(it.sku)) + "</td>" +
        '<td class="title-cell" title="' + esc(it.title) + '">' + esc(it.title) + "</td>" +
        "<td>" + esc(it.department || "—") + "</td>" +
        "<td>" + esc(it.category || "—") + "</td>" +
        "<td>" + esc(it.brand || "—") + "</td>" +
        "<td>" + fmtDate(it.dateSold) + "</td>" +
        '<td class="num">' + (days !== null ? days : "—") + "</td>" +
        '<td class="num">' + fmtMoney(it.salePrice) + "</td>" +
        '<td class="num">' + fmtMoney(it.incomeAfterFees) + "</td>" +
        '<td class="num ' + profitClass + '">' + fmtMoney(it.profit) + "</td>" +
        '<td class="num">' + (margin !== null ? (margin * 100).toFixed(0) + "%" : "—") + "</td>" +
        '<td class="row-actions">' +
        '<button class="btn btn-sm" data-action="edit" data-id="' + it.id + '">Edit</button>' +
        '<button class="btn btn-sm" data-action="relist" data-id="' + it.id + '">Relist</button>' +
        '<button class="btn btn-sm btn-danger" data-action="delete" data-id="' + it.id + '">Delete</button>' +
        "</td>";
      tbody.appendChild(tr);
    });
  }

  // ---------- add / edit form ----------

  var FORM_FIELDS = [
    "sku", "title", "department", "category", "subcategory", "brand",
    "size", "material", "color", "dateListed", "purchasePrice", "originalPrice",
    "listingPrice", "notes"
  ];

  function clearForm() {
    document.getElementById("f-id").value = "";
    FORM_FIELDS.forEach(function (f) {
      var el = document.getElementById("f-" + f);
      el.value = "";
    });
    document.getElementById("f-dateListed").value = todayStr();
    document.getElementById("f-sku").value = nextSku();
    document.getElementById("form-title").textContent = "Add New Item";
    document.getElementById("f-submit").textContent = "Add Item";
    document.getElementById("f-cancel").hidden = true;
    state.editingId = null;
    populateDatalists();
    clearPasteBox();
  }

  function loadItemIntoForm(item) {
    document.getElementById("f-id").value = item.id;
    FORM_FIELDS.forEach(function (f) {
      var el = document.getElementById("f-" + f);
      el.value = item[f] !== undefined && item[f] !== null ? item[f] : "";
    });
    document.getElementById("form-title").textContent = "Edit Item";
    document.getElementById("f-submit").textContent = "Save Changes";
    document.getElementById("f-cancel").hidden = false;
    state.editingId = item.id;
  }

  function handleFormSubmit(e) {
    e.preventDefault();
    var id = document.getElementById("f-id").value;
    var data = {};
    FORM_FIELDS.forEach(function (f) {
      var el = document.getElementById("f-" + f);
      var v = el.value.trim();
      if (["purchasePrice", "originalPrice", "listingPrice"].indexOf(f) !== -1) {
        data[f] = v === "" ? null : Number(v);
      } else {
        data[f] = v === "" ? null : v;
      }
    });

    if (id) {
      var idx = state.items.findIndex(function (it) { return it.id === id; });
      if (idx !== -1) {
        var oldItem = state.items[idx];
        if (data.listingPrice !== null && Number(data.listingPrice) !== Number(oldItem.listingPrice)) {
          oldItem.priceHistory = (oldItem.priceHistory || []).concat([{
            date: todayStr(),
            oldPrice: oldItem.listingPrice,
            newPrice: data.listingPrice,
            source: "manual-edit"
          }]);
        }
        state.items[idx] = Object.assign({}, oldItem, data);
      }
      showToast("Item updated.");
    } else {
      var newItem = normalizeItem(Object.assign({
        id: uid(),
        dateSold: null,
        salePrice: null,
        incomeAfterFees: null,
        profit: null,
        status: "active"
      }, data));
      state.items.unshift(newItem);
      showToast("Item added to inventory.");
    }
    save();
    clearForm();
    renderAlerts();
    goToTab("inventory");
  }

  // ---------- stale inventory alerts ----------

  var STALE_MILESTONES = [90, 60, 30];

  function getPendingMilestone(item) {
    if (item.status !== "active" || !item.dateListed) return null;
    var days = daysBetween(item.dateListed, todayStr());
    if (days === null) return null;
    var acknowledged = item.lastAcknowledgedMilestone || 0;
    for (var i = 0; i < STALE_MILESTONES.length; i++) {
      var m = STALE_MILESTONES[i];
      if (days >= m && m > acknowledged) return m;
    }
    return null;
  }

  function getStaleItems() {
    return state.items
      .filter(function (it) { return getPendingMilestone(it) !== null; })
      .sort(function (a, b) {
        var ma = getPendingMilestone(a), mb = getPendingMilestone(b);
        if (mb !== ma) return mb - ma;
        return daysBetween(b.dateListed, todayStr()) - daysBetween(a.dateListed, todayStr());
      });
  }

  function updateAlertsBadge() {
    var count = getStaleItems().length;
    var badge = document.getElementById("alerts-badge");
    if (count > 0) {
      badge.textContent = String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function getStaleGroups() {
    var all = getStaleItems();
    return {
      mid: all.filter(function (it) { var m = getPendingMilestone(it); return m === 30 || m === 60; }),
      late: all.filter(function (it) { return getPendingMilestone(it) === 90; })
    };
  }

  function alertCardHtml(it) {
    var milestone = getPendingMilestone(it);
    var days = daysBetween(it.dateListed, todayStr());
    var checked = state.selectedAlertIds.has(it.id) ? "checked" : "";
    return (
      '<label class="alert-card-checkbox-wrap"><input type="checkbox" class="alert-card-checkbox" data-id="' + it.id + '" ' + checked + " /></label>" +
      '<div class="alert-card-info">' +
      '<div class="alert-card-title">' + esc(it.title) + "</div>" +
      '<div class="alert-card-meta">SKU ' + esc(fmtSku(it.sku)) + (it.brand ? " · " + esc(it.brand) : "") +
      " · listed <strong>" + days + " days ago</strong> · " + milestone + "-day mark · " +
      "<strong>" + fmtMoney(it.listingPrice) + "</strong></div>" +
      "</div>" +
      '<div class="alert-card-actions">' +
      '<button class="btn btn-sm" data-action="alert-price" data-id="' + it.id + '">Change Price</button>' +
      '<button class="btn btn-sm" data-action="alert-renew" data-id="' + it.id + '">Mark as Re-listed</button>' +
      '<button class="btn btn-sm btn-ghost" data-action="alert-dismiss" data-id="' + it.id + '">Dismiss</button>' +
      "</div>"
    );
  }

  function bulkBarHtml(count) {
    return (
      '<span class="bulk-count">' + count + " selected</span>" +
      '<div class="price-preset-row">' +
      '<button type="button" class="btn btn-sm" data-bulk-preset="10">10% off</button>' +
      '<button type="button" class="btn btn-sm" data-bulk-preset="15">15% off</button>' +
      '<button type="button" class="btn btn-sm" data-bulk-preset="20">20% off</button>' +
      "</div>" +
      '<input type="number" class="input bulk-pct" placeholder="% off" min="0" max="100" />' +
      '<input type="number" class="input bulk-dollars" placeholder="$ off" min="0" step="0.01" />' +
      '<button type="button" class="btn btn-primary btn-sm bulk-apply-price">Apply Price to Selected</button>' +
      '<button type="button" class="btn btn-sm bulk-renew">Mark Selected as Re-listed</button>' +
      '<button type="button" class="btn btn-sm btn-ghost bulk-dismiss">Dismiss Selected</button>'
    );
  }

  function renderAlertsSection(section, items, emptyMessage) {
    document.getElementById("alerts-" + section + "-count").textContent =
      items.length + " item" + (items.length === 1 ? "" : "s");

    var selectAllCb = document.querySelector('.select-all-checkbox[data-section="' + section + '"]');
    selectAllCb.checked = items.length > 0 && items.every(function (it) { return state.selectedAlertIds.has(it.id); });
    selectAllCb.disabled = items.length === 0;

    var selectedCount = items.filter(function (it) { return state.selectedAlertIds.has(it.id); }).length;
    var bulkBar = document.getElementById("bulk-bar-" + section);
    if (selectedCount > 0) {
      bulkBar.hidden = false;
      bulkBar.innerHTML = bulkBarHtml(selectedCount);
    } else {
      bulkBar.hidden = true;
      bulkBar.innerHTML = "";
    }

    var list = document.getElementById("alerts-list-" + section);
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = '<p class="empty-alerts">' + esc(emptyMessage) + "</p>";
      return;
    }
    items.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "alert-card";
      card.innerHTML = alertCardHtml(it);
      list.appendChild(card);
    });
  }

  function renderAlerts() {
    updateAlertsBadge();
    var groups = getStaleGroups();
    var validIds = new Set(groups.mid.concat(groups.late).map(function (it) { return it.id; }));
    Array.from(state.selectedAlertIds).forEach(function (id) {
      if (!validIds.has(id)) state.selectedAlertIds.delete(id);
    });
    renderAlertsSection("mid", groups.mid, "Nothing in the 30-60 day range right now.");
    renderAlertsSection("late", groups.late, "Nothing at the 90+ day mark right now.");
  }

  function touchItem(item, milestone) {
    item.lastUpdate = todayStr();
    if (milestone) item.lastAcknowledgedMilestone = milestone;
  }

  function dismissAlert(id) {
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    var milestone = getPendingMilestone(item);
    touchItem(item, milestone);
    save();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Dismissed for now.");
  }

  function renewListing(id) {
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    if (!confirm('Mark "' + item.title + '" as re-listed? This resets the 30/60/90-day clock back to today.')) return;
    item.dateListed = todayStr();
    item.lastAcknowledgedMilestone = 0;
    item.lastUpdate = todayStr();
    save();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Listing renewed — clock reset.");
  }

  function selectedIdsInSection(section) {
    return Array.from(document.querySelectorAll("#alerts-list-" + section + " .alert-card-checkbox:checked"))
      .map(function (cb) { return cb.dataset.id; });
  }

  function bulkApplyPrice(ids, percentOff, dollarsOff) {
    if (!ids.length) return;
    ids.forEach(function (id) {
      var item = state.items.find(function (it) { return it.id === id; });
      if (!item) return;
      var oldPrice = item.listingPrice;
      var newPrice = computeNewPrice(oldPrice, percentOff, dollarsOff);
      if (newPrice !== oldPrice) {
        item.priceHistory = (item.priceHistory || []).concat([{
          date: todayStr(),
          oldPrice: oldPrice,
          newPrice: newPrice,
          source: "stale-alert-bulk"
        }]);
        item.listingPrice = newPrice;
      }
      touchItem(item, getPendingMilestone(item));
      state.selectedAlertIds.delete(id);
    });
    save();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Updated price on " + ids.length + " item" + (ids.length === 1 ? "" : "s") + ".");
  }

  function bulkDismiss(ids) {
    if (!ids.length) return;
    ids.forEach(function (id) {
      var item = state.items.find(function (it) { return it.id === id; });
      if (!item) return;
      touchItem(item, getPendingMilestone(item));
      state.selectedAlertIds.delete(id);
    });
    save();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Dismissed " + ids.length + " item" + (ids.length === 1 ? "" : "s") + ".");
  }

  function bulkRenew(ids) {
    if (!ids.length) return;
    if (!confirm("Mark " + ids.length + " item" + (ids.length === 1 ? "" : "s") + " as re-listed? This resets their 30/60/90-day clock back to today.")) return;
    ids.forEach(function (id) {
      var item = state.items.find(function (it) { return it.id === id; });
      if (!item) return;
      item.dateListed = todayStr();
      item.lastAcknowledgedMilestone = 0;
      item.lastUpdate = todayStr();
      state.selectedAlertIds.delete(id);
    });
    save();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Renewed " + ids.length + " listing" + (ids.length === 1 ? "" : "s") + ".");
  }

  function handleAlertsClick(e) {
    var actionBtn = e.target.closest("button[data-action]");
    if (actionBtn) {
      var id = actionBtn.dataset.id;
      var action = actionBtn.dataset.action;
      if (action === "alert-dismiss") dismissAlert(id);
      else if (action === "alert-renew") renewListing(id);
      else if (action === "alert-price") openPriceModal(id);
      return;
    }

    var presetBtn = e.target.closest("button[data-bulk-preset]");
    if (presetBtn) {
      var bar = presetBtn.closest(".bulk-bar");
      bar.querySelector(".bulk-pct").value = presetBtn.dataset.bulkPreset;
      bar.querySelector(".bulk-dollars").value = "";
      return;
    }

    var applyBtn = e.target.closest(".bulk-apply-price");
    if (applyBtn) {
      var applySection = applyBtn.closest(".alerts-section").dataset.section;
      var applyBar = applyBtn.closest(".bulk-bar");
      var pct = applyBar.querySelector(".bulk-pct").value;
      var dollars = applyBar.querySelector(".bulk-dollars").value;
      bulkApplyPrice(selectedIdsInSection(applySection), pct, dollars);
      return;
    }

    var dismissBtn = e.target.closest(".bulk-dismiss");
    if (dismissBtn) {
      var dismissSection = dismissBtn.closest(".alerts-section").dataset.section;
      bulkDismiss(selectedIdsInSection(dismissSection));
      return;
    }

    var renewBtn = e.target.closest(".bulk-renew");
    if (renewBtn) {
      var renewSection = renewBtn.closest(".alerts-section").dataset.section;
      bulkRenew(selectedIdsInSection(renewSection));
      return;
    }
  }

  function handleAlertsChange(e) {
    var target = e.target;
    if (target.classList.contains("select-all-checkbox")) {
      var section = target.dataset.section;
      var items = getStaleGroups()[section];
      items.forEach(function (it) {
        if (target.checked) state.selectedAlertIds.add(it.id);
        else state.selectedAlertIds.delete(it.id);
      });
      renderAlerts();
    } else if (target.classList.contains("alert-card-checkbox")) {
      var id = target.dataset.id;
      if (target.checked) state.selectedAlertIds.add(id);
      else state.selectedAlertIds.delete(id);
      renderAlerts();
    }
  }

  // ---------- price change modal ----------

  function openPriceModal(id) {
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    state.priceTargetId = id;
    document.getElementById("price-modal-item").textContent = item.title + " (SKU " + fmtSku(item.sku) + ")";
    document.getElementById("pm-id").value = id;
    document.getElementById("pm-milestone").value = getPendingMilestone(item) || "";
    document.getElementById("pm-current-price").textContent = fmtMoney(item.listingPrice);
    document.getElementById("pm-percent-off").value = "";
    document.getElementById("pm-dollars-off").value = "";
    updatePricePreview();
    document.getElementById("price-modal-backdrop").hidden = false;
  }

  function closePriceModal() {
    document.getElementById("price-modal-backdrop").hidden = true;
    state.priceTargetId = null;
  }

  function computeNewPrice(currentPrice, percentOff, dollarsOff) {
    var price = Number(currentPrice) || 0;
    if (dollarsOff) {
      price = price - Number(dollarsOff);
    } else if (percentOff) {
      price = price * (1 - Number(percentOff) / 100);
    }
    return Math.max(1, Math.round(price * 100) / 100);
  }

  function updatePricePreview() {
    var id = document.getElementById("pm-id").value;
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    var percentOff = document.getElementById("pm-percent-off").value;
    var dollarsOff = document.getElementById("pm-dollars-off").value;
    var newPrice = computeNewPrice(item.listingPrice, percentOff, dollarsOff);
    document.getElementById("pm-new-price").textContent = fmtMoney(newPrice);
  }

  function applyPricePreset(pct) {
    document.getElementById("pm-percent-off").value = pct;
    document.getElementById("pm-dollars-off").value = "";
    updatePricePreview();
  }

  function handlePriceModalSubmit(e) {
    e.preventDefault();
    var id = document.getElementById("pm-id").value;
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    var percentOff = document.getElementById("pm-percent-off").value;
    var dollarsOff = document.getElementById("pm-dollars-off").value;
    var newPrice = computeNewPrice(item.listingPrice, percentOff, dollarsOff);
    var oldPrice = item.listingPrice;

    if (newPrice !== oldPrice) {
      item.priceHistory = (item.priceHistory || []).concat([{
        date: todayStr(),
        oldPrice: oldPrice,
        newPrice: newPrice,
        source: "stale-alert"
      }]);
      item.listingPrice = newPrice;
    }
    var milestone = Number(document.getElementById("pm-milestone").value) || getPendingMilestone(item);
    touchItem(item, milestone);
    save();
    closePriceModal();
    renderAlerts();
    renderInventory();
    renderDashboardBanner();
    showToast("Price updated to " + fmtMoney(newPrice) + ".");
  }

  // ---------- mark as sold modal ----------

  function openSoldModal(id) {
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;
    state.soldTargetId = id;
    document.getElementById("sold-modal-item").textContent = item.title + " (SKU " + fmtSku(item.sku) + ")";
    document.getElementById("sm-id").value = id;
    document.getElementById("sm-dateSold").value = todayStr();
    var suggestedPrice = item.listingPrice || "";
    document.getElementById("sm-salePrice").value = suggestedPrice;
    updateFeeHint();
    document.getElementById("sold-modal-backdrop").hidden = false;
  }

  function closeSoldModal() {
    document.getElementById("sold-modal-backdrop").hidden = true;
    state.soldTargetId = null;
  }

  function updateFeeHint() {
    var price = Number(document.getElementById("sm-salePrice").value) || 0;
    var income = calcIncome(price);
    document.getElementById("sm-income").value = income;
    var fee = poshmarkFee(price);
    document.getElementById("sm-fee-hint").textContent =
      "Poshmark fee: " + fmtMoney(fee) + (price < 15 ? " (flat fee, sales under $15)" : " (20% commission)");
  }

  function handleSoldSubmit(e) {
    e.preventDefault();
    var id = document.getElementById("sm-id").value;
    var idx = state.items.findIndex(function (it) { return it.id === id; });
    if (idx === -1) return;
    var item = state.items[idx];
    var salePrice = Number(document.getElementById("sm-salePrice").value) || 0;
    var income = Number(document.getElementById("sm-income").value);
    if (isNaN(income)) income = calcIncome(salePrice);
    var profit = calcProfit(income, item.purchasePrice);

    state.items[idx] = Object.assign({}, item, {
      status: "sold",
      dateSold: document.getElementById("sm-dateSold").value || todayStr(),
      salePrice: salePrice,
      incomeAfterFees: income,
      profit: profit
    });
    save();
    closeSoldModal();
    renderInventory();
    renderDashboard();
    showToast("Marked as sold.");
  }

  // ---------- table action delegation ----------

  function handleTableClick(e) {
    var btn = e.target.closest("button[data-action]");
    if (!btn) return;
    var id = btn.dataset.id;
    var action = btn.dataset.action;
    var item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;

    if (action === "sell") {
      openSoldModal(id);
    } else if (action === "edit") {
      loadItemIntoForm(item);
      goToTab("add");
    } else if (action === "delete") {
      if (confirm('Delete "' + item.title + '"? This cannot be undone.')) {
        state.items = state.items.filter(function (it) { return it.id !== id; });
        save();
        renderInventory();
        renderSold();
        renderDashboard();
        showToast("Item deleted.");
      }
    } else if (action === "relist") {
      if (confirm('Relist "' + item.title + '" as active inventory?')) {
        item.status = "active";
        item.dateSold = null;
        item.salePrice = null;
        item.incomeAfterFees = null;
        item.profit = null;
        item.dateListed = todayStr();
        save();
        renderSold();
        renderDashboard();
        showToast("Item relisted.");
      }
    }
  }

  // ---------- import / export ----------

  function exportData() {
    var blob = new Blob([JSON.stringify({ items: state.items }, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "poshmark-inventory-backup-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.items)) throw new Error("Invalid file format.");
        if (!confirm("Import " + parsed.items.length + " items? This will replace your current data.")) return;
        state.items = parsed.items;
        save();
        renderDashboard();
        renderInventory();
        renderSold();
        showToast("Import complete.");
      } catch (err) {
        alert("Could not import file: " + err.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- toast ----------

  var toastTimer = null;
  function showToast(msg) {
    var el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2500);
  }

  // ---------- wire up ----------

  function init() {
    initTheme();
    load();
    initTabs();
    renderDashboard();
    updateAlertsBadge();

    document.getElementById("view-alerts").addEventListener("click", handleAlertsClick);
    document.getElementById("view-alerts").addEventListener("change", handleAlertsChange);
    document.getElementById("insights-scope-toggle").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-insights-scope]");
      if (btn) setInsightsScope(btn.dataset.insightsScope);
    });

    document.getElementById("price-form").addEventListener("submit", handlePriceModalSubmit);
    document.getElementById("pm-cancel").addEventListener("click", closePriceModal);
    document.getElementById("pm-percent-off").addEventListener("input", function () {
      document.getElementById("pm-dollars-off").value = "";
      updatePricePreview();
    });
    document.getElementById("pm-dollars-off").addEventListener("input", function () {
      document.getElementById("pm-percent-off").value = "";
      updatePricePreview();
    });
    document.querySelectorAll(".price-preset-row button[data-preset-pct]").forEach(function (btn) {
      btn.addEventListener("click", function () { applyPricePreset(btn.dataset.presetPct); });
    });
    document.getElementById("price-modal-backdrop").addEventListener("click", function (e) {
      if (e.target === this) closePriceModal();
    });

    document.getElementById("inv-search").addEventListener("input", renderInventory);
    document.getElementById("inv-filter-sku").addEventListener("input", renderInventory);
    document.getElementById("inv-filter-dept").addEventListener("change", renderInventory);
    document.getElementById("inv-filter-cat").addEventListener("change", renderInventory);
    document.getElementById("inv-sort").addEventListener("change", renderInventory);
    document.getElementById("inv-tbody").addEventListener("click", handleTableClick);

    document.getElementById("sold-search").addEventListener("input", renderSold);
    document.getElementById("sold-filter-dept").addEventListener("change", renderSold);
    document.getElementById("sold-filter-cat").addEventListener("change", renderSold);
    document.getElementById("sold-sort").addEventListener("change", renderSold);
    document.getElementById("sold-tbody").addEventListener("click", handleTableClick);

    document.getElementById("item-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("f-cancel").addEventListener("click", clearForm);
    document.getElementById("paste-parse").addEventListener("click", handlePasteParse);
    document.getElementById("paste-clear").addEventListener("click", clearPasteBox);
    clearForm();

    document.getElementById("sold-form").addEventListener("submit", handleSoldSubmit);
    document.getElementById("sm-cancel").addEventListener("click", closeSoldModal);
    document.getElementById("sm-salePrice").addEventListener("input", updateFeeHint);
    document.getElementById("sold-modal-backdrop").addEventListener("click", function (e) {
      if (e.target === this) closeSoldModal();
    });

    document.getElementById("btn-export").addEventListener("click", exportData);
    document.getElementById("btn-import").addEventListener("click", function () {
      document.getElementById("file-import").click();
    });
    document.getElementById("file-import").addEventListener("change", function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
