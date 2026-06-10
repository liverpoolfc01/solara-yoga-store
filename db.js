const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const DB_PATH = path.join(__dirname, "solara.db");

let db = null;
let saveTimer = null;

// ── Save to disk periodically ────────────────────────────────────────────────
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (db) {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    }
  }, 500);
}

function saveNow() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function initDb() {
  const SQL = await initSqlJs();

  // Load existing or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior (not truly supported in sql.js, but pragmas help)
  db.run("PRAGMA foreign_keys = ON");

  // ── Schema ──────────────────────────────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'customer' CHECK(role IN ('customer','admin')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      activity TEXT NOT NULL,
      price INTEGER NOT NULL,
      compare_at INTEGER,
      rating REAL DEFAULT 4.5,
      reviews INTEGER DEFAULT 0,
      badge TEXT DEFAULT 'Core',
      sizes TEXT NOT NULL,
      colors TEXT NOT NULL,
      swatches TEXT NOT NULL,
      fabric TEXT NOT NULL,
      fit TEXT NOT NULL,
      description TEXT NOT NULL,
      position TEXT DEFAULT '50% 50%',
      scale REAL DEFAULT 1.2,
      image TEXT DEFAULT './assets/yoga-collection.svg',
      release INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 100,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      country TEXT NOT NULL,
      postal TEXT,
      address TEXT,
      subtotal INTEGER NOT NULL,
      shipping INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
      payment_provider TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      price INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS newsletter (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      user_id TEXT,
      user_name TEXT NOT NULL,
      rating REAL NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  scheduleSave();

  // ── Seed if empty ───────────────────────────────────────────────────────────
  const count = db.exec("SELECT COUNT(*) AS c FROM products");
  const rowCount = count.length > 0 ? count[0].values[0][0] : 0;

  if (rowCount === 0) {
    console.log("🌱 Seeding database with products and admin user...");
    seedData();
    saveNow();
    console.log("✅ Seeded 8 products");
    console.log("✅ Admin account: admin@solara.com / admin123");
  }

  return db;
}

function seedData() {
  // Admin user (password: admin123)
  const adminId = uuidv4();
  const adminHash = bcrypt.hashSync("admin123", 10);
  db.run("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
    [adminId, "Admin", "admin@solara.com", adminHash, "admin"]);

  const products = [
    { id: "plum-flow-set", name: "Plum Flow Legging Set", category: "Matching Sets", activity: "Yoga,Pilates", price: 118, compareAt: 142, rating: 4.9, reviews: 284, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "Raisin Plum,Ivory", swatches: "#7a415d,#f7f0e6", fabric: "AirLuxe", fit: "Light compression, high-rise, true to size.", desc: "A coordinated legging and bra set made for smooth studio movement and polished everyday wear.", pos: "25% 50%", scale: 1.2, release: 12, stock: 85 },
    { id: "sage-wrap", name: "Sage Studio Wrap Top", category: "Layers", activity: "Yoga,Travel", price: 64, compareAt: null, rating: 4.8, reviews: 169, badge: "New Arrival", sizes: "XS,S,M,L", colors: "Sage,Oat", swatches: "#7d8a75,#d9d0c4", fabric: "CloudRib", fit: "Cropped wrap, soft rib, adjustable tie.", desc: "A refined layer for warmups, cool-downs, and travel days after class.", pos: "84% 24%", scale: 1.38, release: 18, stock: 60 },
    { id: "ivory-ribbed-tank", name: "Ivory Ribbed Studio Tank", category: "Tops", activity: "Pilates,Lounge", price: 42, compareAt: null, rating: 4.7, reviews: 112, badge: "Core", sizes: "XS,S,M,L,XL", colors: "Ivory,Black", swatches: "#f7f0e6,#343232", fabric: "CloudRib", fit: "Close fit with enough stretch for layering.", desc: "A breathable ribbed tank that sits cleanly under jackets, wraps, and hoodies.", pos: "51% 56%", scale: 1.46, release: 9, stock: 120 },
    { id: "charcoal-sculpt-legging", name: "Charcoal Sculpt Legging", category: "Leggings", activity: "Train,Pilates", price: 78, compareAt: 98, rating: 4.8, reviews: 221, badge: "Final Few", sizes: "S,M,L,XL", colors: "Charcoal,Plum", swatches: "#343232,#7a415d", fabric: "SculptForm", fit: "Medium compression, no-roll waistband.", desc: "Squat-proof sculpt leggings with a smooth, supportive feel for higher intensity days.", pos: "78% 78%", scale: 1.45, release: 5, stock: 35 },
    { id: "align-crop-bra", name: "Align Crop Sports Bra", category: "Sports Bras", activity: "Yoga,Pilates", price: 58, compareAt: null, rating: 4.9, reviews: 198, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "Raisin Plum,Sage,Black", swatches: "#7a415d,#7d8a75,#343232", fabric: "AirLuxe", fit: "Medium support with removable cups.", desc: "A smooth cross-back bra designed to support yoga, pilates, and low-impact training.", pos: "44% 22%", scale: 1.55, release: 15, stock: 95 },
    { id: "travel-soft-pant", name: "Travel Soft Wide-Leg Pant", category: "Pants", activity: "Travel,Lounge", price: 92, compareAt: null, rating: 4.6, reviews: 87, badge: "New Arrival", sizes: "XS,S,M,L", colors: "Oat,Charcoal", swatches: "#d9d0c4,#343232", fabric: "CloudKnit", fit: "Relaxed leg, mid-rise, draped hand feel.", desc: "A soft wide-leg pant for airport days, slow mornings, and post-class recovery.", pos: "18% 75%", scale: 1.36, release: 20, stock: 50 },
    { id: "mesh-run-short", name: "Breeze Mesh Run Short", category: "Shorts", activity: "Run,Train", price: 54, compareAt: 68, rating: 4.5, reviews: 76, badge: "Sale", sizes: "XS,S,M,L", colors: "Black,Sage", swatches: "#343232,#7d8a75", fabric: "SculptForm", fit: "High-rise liner short with airy outer shell.", desc: "Lightweight shorts with storage and ventilation for warm-weather movement.", pos: "68% 70%", scale: 1.52, release: 2, stock: 40 },
    { id: "grip-yoga-mat", name: "Grounded Grip Yoga Mat", category: "Accessories", activity: "Yoga,Pilates", price: 72, compareAt: null, rating: 4.7, reviews: 134, badge: "Core", sizes: "One Size", colors: "Sage,Charcoal", swatches: "#7d8a75,#343232", fabric: "Natural rubber blend", fit: "5 mm cushioned grip surface.", desc: "A studio mat with steady grip, easy roll-up storage, and international shipping readiness.", pos: "56% 86%", scale: 1.2, release: 7, stock: 70 },
    // Batch 2 — 22 more products
    { id: "midnight-legging", name: "Midnight High-Rise Legging", category: "Leggings", activity: "Yoga,Pilates", price: 88, compareAt: 108, rating: 4.7, reviews: 156, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "Midnight,Charcoal", swatches: "#1a1a2e,#343232", fabric: "AirLuxe", fit: "High-rise, 7/8 length, second-skin feel.", desc: "A weightless high-rise legging with a no-slip waistband that stays put through every inversion.", pos: "30% 60%", scale: 1.3, release: 25, stock: 110 },
    { id: "earthy-rib-legging", name: "Earthy Rib 7/8 Legging", category: "Leggings", activity: "Yoga,Lounge", price: 72, compareAt: null, rating: 4.6, reviews: 98, badge: "Core", sizes: "XS,S,M,L,XL", colors: "Clay,Sage,Oat", swatches: "#a66f55,#7d8a75,#d9d0c4", fabric: "CloudRib", fit: "Ribbed texture, gentle compression.", desc: "Textured ribbed leggings with a soft hand feel perfect for yin, meditation, and slow days.", pos: "55% 40%", scale: 1.35, release: 22, stock: 75 },
    { id: "powerhold-legging", name: "PowerHold Pocket Legging", category: "Leggings", activity: "Run,Train", price: 96, compareAt: 118, rating: 4.8, reviews: 203, badge: "New Arrival", sizes: "XS,S,M,L,XL", colors: "Black,Plum", swatches: "#343232,#7a415d", fabric: "SculptForm", fit: "High compression, side pockets, squat-proof.", desc: "Training legging with deep side pockets for phone and keys, plus locked-in compression.", pos: "40% 70%", scale: 1.28, release: 28, stock: 65 },
    { id: "racerback-bra", name: "Racerback Flow Bra", category: "Sports Bras", activity: "Yoga,Pilates", price: 52, compareAt: null, rating: 4.9, reviews: 178, badge: "Best Seller", sizes: "XS,S,M,L", colors: "Ivory,Sage,Black", swatches: "#f7f0e6,#7d8a75,#343232", fabric: "AirLuxe", fit: "Light support, racerback, removable cups.", desc: "A barely-there racerback bra with an elegant open back design for unrestricted movement.", pos: "60% 30%", scale: 1.42, release: 24, stock: 90 },
    { id: "zip-front-bra", name: "SculptForm Zip-Front Bra", category: "Sports Bras", activity: "Train,Run", price: 62, compareAt: 78, rating: 4.5, reviews: 87, badge: "Sale", sizes: "S,M,L,XL", colors: "Charcoal,Clay", swatches: "#343232,#a66f55", fabric: "SculptForm", fit: "Medium-high support, front zip closure.", desc: "Easy on-and-off zip-front bra with locked-in support for high-intensity sessions.", pos: "45% 25%", scale: 1.5, release: 14, stock: 55 },
    { id: "crop-muscle-tank", name: "Breeze Cropped Muscle Tank", category: "Tops", activity: "Yoga,Pilates,Lounge", price: 38, compareAt: null, rating: 4.6, reviews: 134, badge: "Core", sizes: "XS,S,M,L,XL", colors: "White,Sage,Plum", swatches: "#ffffff,#7d8a75,#7a415d", fabric: "CloudKnit", fit: "Cropped, boxy, dropped armholes.", desc: "An airy cropped tank with open armholes for max ventilation during hot studio sessions.", pos: "35% 55%", scale: 1.38, release: 19, stock: 130 },
    { id: "longline-henley", name: "Longline Studio Henley", category: "Tops", activity: "Yoga,Travel", price: 68, compareAt: null, rating: 4.7, reviews: 145, badge: "New Arrival", sizes: "XS,S,M,L", colors: "Oat,Charcoal,Ivory", swatches: "#d9d0c4,#343232,#f7f0e6", fabric: "CloudRib", fit: "Slim through body, thumbhole cuffs.", desc: "A refined long-sleeve henley with thumbholes that layers beautifully before and after class.", pos: "50% 45%", scale: 1.32, release: 27, stock: 80 },
    { id: "open-back-tee", name: "Open-Back Yoga Tee", category: "Tops", activity: "Yoga,Lounge", price: 46, compareAt: null, rating: 4.8, reviews: 192, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "White,Black,Sage", swatches: "#ffffff,#343232,#7d8a75", fabric: "AirLuxe", fit: "Draped front, open back with tie detail.", desc: "A graceful open-back tee that flows through sun salutations and looks chic at the juice bar.", pos: "28% 48%", scale: 1.36, release: 21, stock: 100 },
    { id: "studio-hoodie", name: "Studio To Street Hoodie", category: "Layers", activity: "Travel,Lounge,Yoga", price: 108, compareAt: 138, rating: 4.9, reviews: 231, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "Charcoal,Oat,Sage", swatches: "#343232,#d9d0c4,#7d8a75", fabric: "CloudKnit", fit: "Oversized, dropped shoulders, kangaroo pocket.", desc: "An oversized cloud-soft hoodie you will live in from warm-up to weekend brunch.", pos: "48% 65%", scale: 1.24, release: 26, stock: 70 },
    { id: "wind-layer-jacket", name: "Packable Wind Layer Jacket", category: "Layers", activity: "Run,Travel", price: 128, compareAt: null, rating: 4.4, reviews: 63, badge: "New Arrival", sizes: "XS,S,M,L", colors: "Sage,Charcoal", swatches: "#7d8a75,#343232", fabric: "AirLuxe", fit: "Relaxed, packable into own pocket.", desc: "Ultra-light wind shell that folds into its pocket for post-class walks and travel days.", pos: "70% 35%", scale: 1.18, release: 29, stock: 45 },
    { id: "gentle-jogger", name: "Gentle Jogger Pant", category: "Pants", activity: "Lounge,Travel", price: 82, compareAt: null, rating: 4.7, reviews: 167, badge: "Core", sizes: "XS,S,M,L,XL", colors: "Charcoal,Oat,Sage", swatches: "#343232,#d9d0c4,#7d8a75", fabric: "CloudKnit", fit: "Mid-rise, elastic waist, tapered ankle.", desc: "A soft cuffed jogger that transitions seamlessly from restorative class to the couch.", pos: "62% 72%", scale: 1.3, release: 16, stock: 85 },
    { id: "wide-crop-pant", name: "Align Wide-Leg Crop Pant", category: "Pants", activity: "Yoga,Pilates", price: 76, compareAt: 94, rating: 4.5, reviews: 89, badge: "Sale", sizes: "XS,S,M,L", colors: "Black,Plum", swatches: "#343232,#7a415d", fabric: "SculptForm", fit: "High-rise, wide cropped leg.", desc: "Cropped wide-leg pant with sculpting fabric for studio sessions and street-style moments.", pos: "38% 68%", scale: 1.34, release: 8, stock: 40 },
    { id: "bike-short", name: "Flow High-Rise Bike Short", category: "Shorts", activity: "Yoga,Pilates,Run", price: 48, compareAt: null, rating: 4.7, reviews: 143, badge: "Core", sizes: "XS,S,M,L,XL", colors: "Black,Sage,Plum", swatches: "#343232,#7d8a75,#7a415d", fabric: "AirLuxe", fit: "High-rise, 8-inch inseam, no-roll hem.", desc: "An 8-inch bike short with a stay-put silicone hem for hot yoga and summer runs.", pos: "42% 58%", scale: 1.44, release: 23, stock: 95 },
    { id: "trailblaze-short", name: "TrailBlaze 2-in-1 Short", category: "Shorts", activity: "Run,Train", price: 58, compareAt: 72, rating: 4.3, reviews: 54, badge: "Sale", sizes: "XS,S,M,L", colors: "Charcoal,Clay", swatches: "#343232,#a66f55", fabric: "SculptForm", fit: "Compression liner + loose outer shell.", desc: "Performance 2-in-1 with compression base and breezy outer layer plus a secure zip pocket.", pos: "58% 62%", scale: 1.48, release: 6, stock: 35 },
    { id: "ivory-sculpt-set", name: "Ivory Sculpt Bra + Legging Set", category: "Matching Sets", activity: "Yoga,Pilates", price: 126, compareAt: 158, rating: 4.8, reviews: 176, badge: "Best Seller", sizes: "XS,S,M,L,XL", colors: "Ivory,Sage", swatches: "#f7f0e6,#7d8a75", fabric: "SculptForm", fit: "Medium compression bra + high-rise legging.", desc: "A matching sculpt set in creamy ivory that looks as good at the studio as it does on the street.", pos: "35% 42%", scale: 1.26, release: 30, stock: 60 },
    { id: "clay-lounge-set", name: "Clay CloudRib Lounge Set", category: "Matching Sets", activity: "Lounge,Travel", price: 134, compareAt: null, rating: 4.9, reviews: 98, badge: "New Arrival", sizes: "XS,S,M,L", colors: "Clay,Charcoal", swatches: "#a66f55,#343232", fabric: "CloudRib", fit: "Relaxed tank + wide-leg pant.", desc: "A head-to-toe ribbed lounge set in earthy clay tones for slow Sundays and travel days.", pos: "55% 38%", scale: 1.22, release: 31, stock: 50 },
    { id: "yoga-block", name: "Alignment Yoga Block", category: "Accessories", activity: "Yoga,Pilates", price: 22, compareAt: null, rating: 4.8, reviews: 245, badge: "Core", sizes: "One Size", colors: "Sage,Clay,Charcoal", swatches: "#7d8a75,#a66f55,#343232", fabric: "High-density EVA foam", fit: "9x6x4 inch standard block.", desc: "Non-slip cork-textured block for deep stretches, support, and alignment in any practice.", pos: "60% 80%", scale: 1.0, release: 10, stock: 200 },
    { id: "yoga-strap", name: "Grounding Cotton Yoga Strap", category: "Accessories", activity: "Yoga", price: 16, compareAt: null, rating: 4.6, reviews: 132, badge: "Core", sizes: "One Size", colors: "Sage,Oat", swatches: "#7d8a75,#d9d0c4", fabric: "100% organic cotton", fit: "8-foot with D-ring buckle.", desc: "An organic cotton strap with secure D-ring buckle to deepen stretches and improve flexibility.", pos: "75% 85%", scale: 1.0, release: 4, stock: 180 },
    { id: "water-bottle", name: "Solara Insulated Water Bottle", category: "Accessories", activity: "Yoga,Run,Travel", price: 38, compareAt: null, rating: 4.5, reviews: 89, badge: "Core", sizes: "One Size", colors: "Sage,Plum,Charcoal", swatches: "#7d8a75,#7a415d,#343232", fabric: "Stainless steel", fit: "24 oz / 710 ml, vacuum insulated.", desc: "Double-wall insulated bottle that keeps water cold through hot yoga and afternoon hikes.", pos: "80% 50%", scale: 1.0, release: 11, stock: 150 },
    { id: "yoga-towel", name: "Microfiber Hot Yoga Towel", category: "Accessories", activity: "Yoga,Pilates", price: 28, compareAt: 34, rating: 4.7, reviews: 178, badge: "Best Seller", sizes: "One Size", colors: "Sage,Charcoal,Plum", swatches: "#7d8a75,#343232,#7a415d", fabric: "Ultra-absorbent microfiber", fit: "72x26 inch mat-sized.", desc: "Grip-top microfiber towel that absorbs sweat and prevents slipping during heated practices.", pos: "50% 90%", scale: 1.0, release: 17, stock: 120 },
    { id: "mat-bag", name: "Canvas Yoga Mat Bag", category: "Accessories", activity: "Yoga,Travel", price: 44, compareAt: null, rating: 4.4, reviews: 76, badge: "Core", sizes: "One Size", colors: "Oat,Sage", swatches: "#d9d0c4,#7d8a75", fabric: "Organic canvas with leather trim", fit: "Fits standard mats, zip pocket.", desc: "An organic canvas carrier with adjustable strap and zip pocket for keys, phone, and studio card.", pos: "65% 55%", scale: 1.0, release: 3, stock: 90 },
    { id: "grip-socks", name: "Studio Grip Socks", category: "Accessories", activity: "Yoga,Pilates", price: 14, compareAt: null, rating: 4.3, reviews: 210, badge: "Core", sizes: "S,M,L", colors: "Sage,Plum,Charcoal,Oat", swatches: "#7d8a75,#7a415d,#343232,#d9d0c4", fabric: "Organic cotton + silicone grips", fit: "True to size, silicone dot sole.", desc: "Non-slip grip socks with arch support for barre, pilates, and studio sessions without a mat.", pos: "70% 92%", scale: 1.0, release: 1, stock: 250 }
  ];

  const stmt = db.prepare("INSERT INTO products (id, name, category, activity, price, compare_at, rating, reviews, badge, sizes, colors, swatches, fabric, fit, description, position, scale, image, release, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

  for (const p of products) {
    stmt.run([p.id, p.name, p.category, p.activity, p.price, p.compareAt, p.rating, p.reviews, p.badge, p.sizes, p.colors, p.swatches, p.fabric, p.fit, p.desc, p.pos, p.scale, "./assets/yoga-collection.svg", p.release, p.stock]);
  }
  stmt.free();
}

// ── Get DB ───────────────────────────────────────────────────────────────────
function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

// ── Helper: transform DB row to API format ───────────────────────────────────
function productToApi(p) {
  // p is an object from sql.js (column names as keys)
  const obj = {};
  for (const key of Object.keys(p)) {
    obj[key] = p[key];
  }
  return {
    ...obj,
    activity: (obj.activity || "").split(","),
    sizes: (obj.sizes || "").split(","),
    colors: (obj.colors || "").split(","),
    swatches: (obj.swatches || "").split(","),
    is_active: undefined
  };
}

// ── Helper: sql.js result to array of objects ────────────────────────────────
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  scheduleSave();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  db.run(sql, params);
  scheduleSave();
}

// ── Graceful shutdown ────────────────────────────────────────────────────────
function closeDb() {
  if (saveTimer) clearTimeout(saveTimer);
  saveNow();
  if (db) db.close();
}

// Handle process exit
process.on("exit", closeDb);
process.on("SIGINT", () => { closeDb(); process.exit(0); });
process.on("SIGTERM", () => { closeDb(); process.exit(0); });

module.exports = { initDb, getDb, productToApi, queryAll, queryOne, execute, saveNow };
