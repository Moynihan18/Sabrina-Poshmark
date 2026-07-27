# Closet Inventory

A lightweight, local-only inventory manager for a Poshmark reselling closet. No
server, no build step, no account — it's a static site that runs entirely in
your browser and keeps its data in `localStorage`.

## Running it

Just open `index.html` in a browser, or serve the folder with any static
server, e.g.:

```
python3 -m http.server 8080
```

then visit `http://localhost:8080`.

The app comes pre-loaded with your existing Poshmark spreadsheet data (232
active listings, 241 sold items) on first load. After that, all changes are
saved to your browser's local storage automatically.

## Features

- **Inventory** — table of everything currently listed, with search, and
  filters by department/category, and sorting.
- **Add Item** — a form with every field from the original tracking sheet
  (SKU, title, department, category, subcategory, brand, size, material,
  color, dates, purchase/original/listing price, notes).
- **Mark as Sold** — one click from the inventory table opens a small form
  for sale price and sale date. Poshmark's fee is calculated automatically
  ($2.95 flat fee under $15, 20% commission at $15+) and shown before you
  confirm, and it's editable if your actual payout differs.
- **Sold** — history of everything sold, with profit and profit margin per
  item, searchable/filterable/sortable. Items can be relisted back to active
  inventory.
- **Insights** —
  - Average profit margin (profit ÷ net income after fees)
  - Top categories by units sold (what type of item sells most)
  - Top brands by units sold
  - Profit margin by department
  - Units sold per month

## Backup / transfer

Use **Export** in the top bar to download a full JSON backup of your data, and
**Import** to load a backup back in (this replaces the current data, with a
confirmation prompt first). This is also how you'd move your data to a
different browser or computer, since everything otherwise lives only in this
browser's local storage.

## Data model

Each item has the following fields, matching the original spreadsheet:

`sku, title, department, category, subcategory, brand, size, material, color,
dateListed, dateSold, purchasePrice, originalPrice, listingPrice, salePrice,
incomeAfterFees, profit, notes, status`

Fields like "days listed" or "days to sell" are computed live from the dates
rather than stored, so they're always accurate.

## Files

- `index.html` — page structure
- `styles.css` — styling (light/dark mode aware)
- `app.js` — all app logic (storage, rendering, forms)
- `data/seed-data.js` — the one-time seed data imported from the original
  spreadsheet (only used the first time the app loads, before local storage
  has any data)
