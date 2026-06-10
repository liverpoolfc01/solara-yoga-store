const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { initDb, getDb, productToApi, queryAll, queryOne, execute, saveNow } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "solara-yoga-secret-change-in-production";

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
// Admin panel — explicit routing to avoid Express static redirect quirks
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));
app.get("/admin/", (req, res) => res.sendFile(path.join(__dirname, "admin", "index.html")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// ── Auth Middleware ───────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  });
}

// ── Auth Routes ──────────────────────────────────────────────────────────────

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: "Name, email, and password (min 6 chars) required" });
  }

  const existing = queryOne("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  try {
    execute("INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, 'customer')", [id, name, email, hash]);
  } catch {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const token = jwt.sign({ id, email, name, role: "customer" }, JWT_SECRET, { expiresIn: "7d" });
  saveNow();
  res.status(201).json({ token, user: { id, name, email, role: "customer" } });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const user = queryOne("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = queryOne("SELECT id, name, email, role, created_at FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// ── Product Routes ───────────────────────────────────────────────────────────

app.get("/api/products", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  const all = queryAll("SELECT * FROM products WHERE is_active = 1 ORDER BY release DESC");
  const total = all.length;
  // Manual pagination since sql.js doesn't support LIMIT/OFFSET in queryAll with params
  const paged = all.slice(offset, offset + limit);
  res.json({ products: paged.map(productToApi), total, page, limit });
});

app.get("/api/products/:id", (req, res) => {
  const product = queryOne("SELECT * FROM products WHERE id = ? AND is_active = 1", [req.params.id]);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product: productToApi(product) });
});

app.post("/api/products", adminRequired, (req, res) => {
  const p = req.body;
  const id = p.id || uuidv4().slice(0, 12);

  execute(
    `INSERT INTO products (id, name, category, activity, price, compare_at, rating, reviews, badge, sizes, colors, swatches, fabric, fit, description, position, scale, image, release, stock, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, p.name, p.category, [p.activity].flat().join(","), p.price, p.compare_at || null,
     p.rating || 4.5, p.reviews || 0, p.badge || "Core",
     [p.sizes].flat().join(","), [p.colors].flat().join(","), [p.swatches].flat().join(","),
     p.fabric, p.fit, p.description, p.position || "50% 50%", p.scale || 1.2,
     p.image || "./assets/yoga-collection.svg", p.release || 0, p.stock || 100, p.is_active ?? 1]
  );

  saveNow();
  const created = queryOne("SELECT * FROM products WHERE id = ?", [id]);
  res.status(201).json({ product: productToApi(created) });
});

app.put("/api/products/:id", adminRequired, (req, res) => {
  const existing = queryOne("SELECT * FROM products WHERE id = ?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const p = req.body;
  execute(
    `UPDATE products SET name=?, category=?, activity=?, price=?, compare_at=?, rating=?, reviews=?, badge=?, sizes=?, colors=?, swatches=?, fabric=?, fit=?, description=?, position=?, scale=?, image=?, release=?, stock=?, is_active=?, updated_at=datetime('now')
     WHERE id=?`,
    [p.name ?? existing.name, p.category ?? existing.category,
     [p.activity ?? existing.activity].flat().join(","),
     p.price ?? existing.price, p.compare_at ?? existing.compare_at,
     p.rating ?? existing.rating, p.reviews ?? existing.reviews,
     p.badge ?? existing.badge, [p.sizes ?? existing.sizes].flat().join(","),
     [p.colors ?? existing.colors].flat().join(","), [p.swatches ?? existing.swatches].flat().join(","),
     p.fabric ?? existing.fabric, p.fit ?? existing.fit, p.description ?? existing.description,
     p.position ?? existing.position, p.scale ?? existing.scale, p.image ?? existing.image,
     p.release ?? existing.release, p.stock ?? existing.stock, p.is_active ?? existing.is_active,
     req.params.id]
  );

  saveNow();
  const updated = queryOne("SELECT * FROM products WHERE id = ?", [req.params.id]);
  res.json({ product: productToApi(updated) });
});

app.delete("/api/products/:id", adminRequired, (req, res) => {
  // Soft-delete: set is_active = 0 to preserve order references
  execute("UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  saveNow();
  res.json({ success: true });
});

// ── Cart & Checkout ──────────────────────────────────────────────────────────

app.post("/api/checkout", (req, res) => {
  const { customer, shippingAddress, items } = req.body;

  if (!customer?.email || !shippingAddress?.country || !items?.length) {
    return res.status(400).json({ error: "Email, country, and at least one item are required" });
  }

  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    const product = queryOne("SELECT * FROM products WHERE id = ? AND is_active = 1", [item.productId]);
    if (!product) return res.status(400).json({ error: `Product ${item.productId} not found` });
    if (product.stock < item.quantity) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    }
    subtotal += product.price * item.quantity;
    orderItems.push({
      product_id: product.id, product_name: product.name,
      size: item.size, color: item.color,
      price: product.price, quantity: item.quantity
    });
  }

  const shipping = subtotal >= 120 ? 0 : 12;
  const total = subtotal + shipping;
  const orderId = "SOL-" + uuidv4().slice(0, 8).toUpperCase();

  const user = queryOne("SELECT id FROM users WHERE email = ?", [customer.email]);

  // BEGIN TRANSACTION
  const db = getDb();
  db.run("BEGIN TRANSACTION");
  try {
    db.run(
      "INSERT INTO orders (id, user_id, customer_name, customer_email, country, postal, address, subtotal, shipping, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')",
      [orderId, user?.id || null, customer.name, customer.email, shippingAddress.country, shippingAddress.postal, shippingAddress.address, subtotal, shipping, total]
    );

    for (const item of orderItems) {
      db.run(
        "INSERT INTO order_items (order_id, product_id, product_name, size, color, price, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [orderId, item.product_id, item.product_name, item.size, item.color, item.price, item.quantity]
      );
      db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.product_id]);
    }

    db.run("COMMIT");
  } catch (err) {
    db.run("ROLLBACK");
    return res.status(500).json({ error: "Checkout failed. Please try again." });
  }

  saveNow();

  res.status(201).json({
    order: { id: orderId, subtotal, shipping, total, status: "confirmed" },
    trackingUrl: `/track.html?order=${orderId}&email=${encodeURIComponent(customer.email)}`
  });
});

// ── Order Tracking ───────────────────────────────────────────────────────────

app.get("/api/orders/track", (req, res) => {
  const { orderId, email } = req.query;
  if (!orderId || !email) {
    return res.status(400).json({ error: "Order ID and email are required" });
  }

  const order = queryOne("SELECT * FROM orders WHERE id = ? AND customer_email = ?", [orderId, email]);
  if (!order) return res.status(404).json({ error: "Order not found. Check your order ID and email." });

  const items = queryAll("SELECT * FROM order_items WHERE order_id = ?", [orderId]);
  res.json({ order, items });
});

// ── User Orders ──────────────────────────────────────────────────────────────

app.get("/api/orders", authRequired, (req, res) => {
  const orders = queryAll("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json({ orders });
});

app.get("/api/orders/:id", authRequired, (req, res) => {
  const order = queryOne("SELECT * FROM orders WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const items = queryAll("SELECT * FROM order_items WHERE order_id = ?", [req.params.id]);
  res.json({ order, items });
});

// ── Wishlist ─────────────────────────────────────────────────────────────────

app.get("/api/wishlist", authRequired, (req, res) => {
  const items = queryAll(
    `SELECT p.* FROM products p JOIN wishlists w ON w.product_id = p.id WHERE w.user_id = ? AND p.is_active = 1`,
    [req.user.id]
  );
  res.json({ wishlist: items.map(productToApi) });
});

app.post("/api/wishlist/:productId", authRequired, (req, res) => {
  const product = queryOne("SELECT id FROM products WHERE id = ? AND is_active = 1", [req.params.productId]);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const existing = queryOne("SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?", [req.user.id, req.params.productId]);
  if (existing) {
    execute("DELETE FROM wishlists WHERE user_id = ? AND product_id = ?", [req.user.id, req.params.productId]);
    saveNow();
    return res.json({ success: true, action: "removed" });
  }

  execute("INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)", [req.user.id, req.params.productId]);
  saveNow();
  res.status(201).json({ success: true, action: "added" });
});

// ── Newsletter ───────────────────────────────────────────────────────────────

app.post("/api/newsletter", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    execute("INSERT INTO newsletter (email) VALUES (?)", [email]);
    saveNow();
    res.status(201).json({ message: "Welcome to the list!" });
  } catch (err) {
    if (err.message && err.message.includes("UNIQUE")) {
      res.json({ message: "You're already on the list!" });
    } else {
      res.status(500).json({ error: "Failed to subscribe. Please try again." });
    }
  }
});

// ── Reviews ──────────────────────────────────────────────────────────────────

app.get("/api/products/:id/reviews", (req, res) => {
  const reviews = queryAll("SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC", [req.params.id]);
  res.json({ reviews });
});

app.post("/api/products/:id/reviews", authRequired, (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "Rating 1-5 is required" });
  }

  const product = queryOne("SELECT id FROM products WHERE id = ? AND is_active = 1", [req.params.id]);
  if (!product) return res.status(404).json({ error: "Product not found" });

  execute("INSERT INTO reviews (product_id, user_id, user_name, rating, comment) VALUES (?, ?, ?, ?, ?)",
    [req.params.id, req.user.id, req.user.name, rating, comment || ""]);

  // Update product average rating
  const stats = queryOne("SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE product_id = ?", [req.params.id]);
  if (stats) {
    execute("UPDATE products SET rating = ROUND(?, 1), reviews = ? WHERE id = ?",
      [Math.round(stats.avg * 10) / 10, stats.count, req.params.id]);
  }

  saveNow();
  res.status(201).json({ success: true });
});

// ── Admin Routes ─────────────────────────────────────────────────────────────

app.get("/api/admin/stats", adminRequired, (req, res) => {
  const totalOrders = queryOne("SELECT COUNT(*) AS c FROM orders")?.c || 0;
  const totalRevenue = queryOne("SELECT COALESCE(SUM(total), 0) AS r FROM orders WHERE status != 'cancelled'")?.r || 0;
  const totalUsers = queryOne("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'")?.c || 0;
  const totalProducts = queryOne("SELECT COUNT(*) AS c FROM products WHERE is_active = 1")?.c || 0;
  const lowStock = queryOne("SELECT COUNT(*) AS c FROM products WHERE is_active = 1 AND stock < 20")?.c || 0;
  const recentOrders = queryAll("SELECT * FROM orders ORDER BY created_at DESC LIMIT 10");
  const ordersByStatus = queryAll("SELECT status, COUNT(*) AS count FROM orders GROUP BY status");

  res.json({ stats: { totalOrders, totalRevenue, totalUsers, totalProducts, lowStock }, recentOrders, ordersByStatus });
});

app.get("/api/admin/orders", adminRequired, (req, res) => {
  const { status } = req.query;
  let orders;
  if (status) {
    orders = queryAll("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC", [status]);
  } else {
    orders = queryAll("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100");
  }
  res.json({ orders });
});

app.patch("/api/admin/orders/:id", adminRequired, (req, res) => {
  const { status } = req.body;
  const validStatuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Use: ${validStatuses.join(", ")}` });
  }

  execute("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, req.params.id]);
  saveNow();
  const order = queryOne("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

app.get("/api/admin/orders/:id", adminRequired, (req, res) => {
  const order = queryOne("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const items = queryAll("SELECT * FROM order_items WHERE order_id = ?", [req.params.id]);
  res.json({ order, items });
});

app.get("/api/admin/users", adminRequired, (req, res) => {
  const users = queryAll("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC");
  res.json({ users });
});

// Admin: all reviews
app.get("/api/admin/reviews", adminRequired, (req, res) => {
  const reviews = queryAll(`
    SELECT r.*, p.name AS product_name FROM reviews r
    JOIN products p ON p.id = r.product_id
    ORDER BY r.created_at DESC LIMIT 100
  `);
  res.json({ reviews });
});

// ── Serve SPA fallback ───────────────────────────────────────────────────────
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  // Let /admin/* paths fall through — static middleware already handled them
  if (req.path.startsWith("/admin")) {
    return res.status(404).send("Admin page not found");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`\n🧘 Solara Yoga Store running at http://localhost:${PORT}`);
    console.log(`🛒 Storefront: http://localhost:${PORT}`);
    console.log(`🔧 Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`👤 Admin login: admin@solara.com / admin123\n`);
  });
}

start().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
