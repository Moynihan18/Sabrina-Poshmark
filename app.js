(function () {
  "use strict";

  var STORAGE_KEY = "poshmark-inventory-v1";
  var THEME_KEY = "poshmark-inventory-theme";
  var state = { items: [], editingId: null, soldTargetId: null };

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

  function load() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        state.items = parsed.items || [];
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
      return Object.assign({ id: "seed-" + i }, it);
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

  function renderDashboard() {
    var sold = state.items.filter(function (it) { return it.status === "sold"; });
    var active = state.items.filter(function (it) { return it.status === "active"; });

    var totalRevenue = sold.reduce(function (s, it) { return s + (Number(it.salePrice) || 0); }, 0);
    var totalIncome = sold.reduce(function (s, it) { return s + (Number(it.incomeAfterFees) || 0); }, 0);
    var totalProfit = sold.reduce(function (s, it) { return s + (Number(it.profit) || 0); }, 0);
    var margins = sold.map(marginOf).filter(function (m) { return m !== null && isFinite(m); });
    var avgMargin = margins.length ? margins.reduce(function (a, b) { return a + b; }, 0) / margins.length : null;
    var activeValue = active.reduce(function (s, it) { return s + (Number(it.listingPrice) || 0); }, 0);

    var statRow = document.getElementById("stat-row");
    statRow.innerHTML = "";
    statRow.appendChild(renderStatTile("Items Sold", sold.length, "All-time"));
    statRow.appendChild(renderStatTile("Active Inventory", active.length, fmtMoney(activeValue) + " in listing value"));
    statRow.appendChild(renderStatTile("Total Profit", fmtMoney(totalProfit), "After Poshmark fees"));
    statRow.appendChild(renderStatTile(
      "Average Profit Margin",
      avgMargin !== null ? (avgMargin * 100).toFixed(1) + "%" : "—",
      "Profit ÷ net income, per item"
    ));

    // top categories by units sold
    var catCounts = {};
    sold.forEach(function (it) {
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
    sold.forEach(function (it) {
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
    sold.forEach(function (it) {
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

    // sales over time (last 12 months with sales)
    var monthCounts = {};
    sold.forEach(function (it) {
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
      tr.innerHTML =
        "<td>" + esc(fmtSku(it.sku)) + "</td>" +
        '<td class="title-cell" title="' + esc(it.title) + '">' + esc(it.title) + "</td>" +
        "<td>" + esc(it.department || "—") + "</td>" +
        "<td>" + esc(it.category || "—") + "</td>" +
        "<td>" + esc(it.brand || "—") + "</td>" +
        "<td>" + esc(it.size || "—") + "</td>" +
        "<td>" + fmtDate(it.dateListed) + "</td>" +
        '<td class="num">' + (days !== null ? days : "—") + "</td>" +
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
      if (idx !== -1) state.items[idx] = Object.assign({}, state.items[idx], data);
      showToast("Item updated.");
    } else {
      var newItem = Object.assign({
        id: uid(),
        dateSold: null,
        salePrice: null,
        incomeAfterFees: null,
        profit: null,
        status: "active"
      }, data);
      state.items.unshift(newItem);
      showToast("Item added to inventory.");
    }
    save();
    clearForm();
    goToTab("inventory");
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

    document.getElementById("inv-search").addEventListener("input", renderInventory);
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
