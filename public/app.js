// ── Solara Yoga Store — Frontend App ────────────────────────────────────────
// Connects to the Node.js/Express backend. Falls back to localStorage for
// cart & offline use, but auth, products, orders, and wishlist are server-backed.

// When hosted on GitHub Pages, connect to local backend
const API = window.location.hostname.includes("github.io")
  ? "http://localhost:3000"
  : "";

const storageKeys = {
  cart: "solaraCart",
  token: "solaraToken",
  user: "solaraUser"
};

// ── State ────────────────────────────────────────────────────────────────────
let products = [];
let cart = readJson(storageKeys.cart, []);
let wishlist = new Set();        // server-backed when logged in, else local
let token = localStorage.getItem(storageKeys.token) || "";
let user = readJson(storageKeys.user, null);
let backendOnline = false;

const filters = {
  category: "All", collection: "All", activity: "All", size: "All",
  query: "", sort: "featured"
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const productGrid = $("#productGrid");
const resultCount = $("#resultCount");
const activeFilterText = $("#activeFilterText");
const noResults = $("#noResults");
const productSearch = $("#productSearch");
const sortProducts = $("#sortProducts");
const categoryFilters = $("#categoryFilters");
const activityFilters = $("#activityFilters");
const sizeFilters = $("#sizeFilters");
const cartDrawer = $("#cartDrawer");
const cartItems = $("#cartItems");
const cartEmpty = $("#cartEmpty");
const cartCount = $("#cartCount");
const cartSubtotal = $("#cartSubtotal");
const cartShipping = $("#cartShipping");
const cartTotal = $("#cartTotal");
const freeShippingText = $("#freeShippingText");
const shippingProgress = $("#shippingProgress");
const checkoutNote = $("#checkoutNote");
const wishlistCount = $("#wishlistCount");
const mobileMenu = $("#mobileMenu");
const accountModal = $("#accountModal");
const productModal = $("#productModal");
const checkoutModal = $("#checkoutModal");
const productDetail = $("#productDetail");
const toast = $("#toast");
const backendStatus = $("#backendStatus");

// ── Helpers ──────────────────────────────────────────────────────────────────
function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function formatMoney(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}
function catImg(cat){
  const m={"Leggings":"prod-leggings","Sports Bras":"prod-bra","Tops":"prod-tank","Matching Sets":"prod-set","Shorts":"prod-shorts","Pants":"prod-pants","Layers":"prod-hoodie","Accessories":"prod-mat"};
  return "./assets/"+(m[cat]||"yoga-collection")+".svg";
}
function unique(arr) { return [...new Set(arr)]; }
function productImageStyle(p) {
  return `--image-position:${p.position}; --image-scale:${p.scale}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

// ── API helpers ──────────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function setAuth(t, u) {
  token = t;
  user = u;
  if (t) {
    localStorage.setItem(storageKeys.token, t);
    writeJson(storageKeys.user, u);
  } else {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
  }
  updateAccountUI();
}

async function login(email, password) {
  const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setAuth(data.token, data.user);
  await loadWishlist();
  return data;
}

async function register(name, email, password) {
  const data = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
  setAuth(data.token, data.user);
  await loadWishlist();
  return data;
}

function logout() {
  setAuth("", null);
  wishlist = new Set();
  renderWishlistCount();
  renderProducts();
  showToast("Signed out");
}

async function loadWishlist() {
  if (!token) return;
  try {
    const data = await api("/api/wishlist");
    wishlist = new Set(data.wishlist.map(p => p.id));
    renderWishlistCount();
    renderProducts();
  } catch { /* offline — keep local state */ }
}

function updateAccountUI() {
  const btn = $("#accountButton");
  const logoutBtn = $("#logoutButton");
  const status = $("#accountStatus");

  if (user) {
    btn.textContent = `Hi, ${user.name.split(" ")[0]}`;
    if (logoutBtn) logoutBtn.style.display = "";
    if (status) status.innerHTML = `<strong>Signed in as ${user.name}</strong><span>Your wishlist is saved to the cloud. <a href="/track.html">View your orders →</a></span>`;
  } else {
    btn.textContent = "Account";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (status) status.textContent = "Create an account to save wishlist items and view order history.";
  }
}

// ── Products ─────────────────────────────────────────────────────────────────
async function loadProducts() {
  try {
    const data = await api("/api/products");
    products = data.products;
    backendOnline = true;
    if (backendStatus) backendStatus.textContent = "✓ Connected to backend";
    if (backendStatus) backendStatus.style.color = "var(--success)";
  } catch (err) {
    console.warn("Backend not available, using static data:", err.message);
    backendOnline = false;
    if (backendStatus) backendStatus.textContent = "⚠ Offline mode — using sample data";
    if (backendStatus) backendStatus.style.color = "var(--clay)";
    loadStaticProducts();
  }
  renderFilterChips();
  renderProducts();
}

function loadStaticProducts() {
  products = [
    { id: "plum-flow-set", name: "Plum Flow Legging Set", category: "Matching Sets", activity: ["Yoga","Pilates"], price: 118, compareAt: 142, rating: 4.9, reviews: 284, badge: "Best Seller", sizes: ["XS","S","M","L","XL"], colors: ["Raisin Plum","Ivory"], swatches: ["#7a415d","#f7f0e6"], fabric: "AirLuxe", fit: "Light compression, high-rise, true to size.", description: "A coordinated legging and bra set made for smooth studio movement and polished everyday wear.", position: "25% 50%", scale: 1.2, image: catImg("Matching Sets"), release: 12 },
    { id: "sage-wrap", name: "Sage Studio Wrap Top", category: "Layers", activity: ["Yoga","Travel"], price: 64, rating: 4.8, reviews: 169, badge: "New Arrival", sizes: ["XS","S","M","L"], colors: ["Sage","Oat"], swatches: ["#7d8a75","#d9d0c4"], fabric: "CloudRib", fit: "Cropped wrap, soft rib, adjustable tie.", description: "A refined layer for warmups, cool-downs, and travel days after class.", position: "84% 24%", scale: 1.38, image: catImg("Layers"), release: 18 },
    { id: "ivory-ribbed-tank", name: "Ivory Ribbed Studio Tank", category: "Tops", activity: ["Pilates","Lounge"], price: 42, rating: 4.7, reviews: 112, badge: "Core", sizes: ["XS","S","M","L","XL"], colors: ["Ivory","Black"], swatches: ["#f7f0e6","#343232"], fabric: "CloudRib", fit: "Close fit with enough stretch for layering.", description: "A breathable ribbed tank that sits cleanly under jackets, wraps, and hoodies.", position: "51% 56%", scale: 1.46, image: catImg("Tops"), release: 9 },
    { id: "charcoal-sculpt-legging", name: "Charcoal Sculpt Legging", category: "Leggings", activity: ["Train","Pilates"], price: 78, compareAt: 98, rating: 4.8, reviews: 221, badge: "Final Few", sizes: ["S","M","L","XL"], colors: ["Charcoal","Plum"], swatches: ["#343232","#7a415d"], fabric: "SculptForm", fit: "Medium compression, no-roll waistband.", description: "Squat-proof sculpt leggings with a smooth, supportive feel for higher intensity days.", position: "78% 78%", scale: 1.45, image: catImg("Leggings"), release: 5 },
    { id: "align-crop-bra", name: "Align Crop Sports Bra", category: "Sports Bras", activity: ["Yoga","Pilates"], price: 58, rating: 4.9, reviews: 198, badge: "Best Seller", sizes: ["XS","S","M","L","XL"], colors: ["Raisin Plum","Sage","Black"], swatches: ["#7a415d","#7d8a75","#343232"], fabric: "AirLuxe", fit: "Medium support with removable cups.", description: "A smooth cross-back bra designed to support yoga, pilates, and low-impact training.", position: "44% 22%", scale: 1.55, image: catImg("Sports Bras"), release: 15 },
    { id: "travel-soft-pant", name: "Travel Soft Wide-Leg Pant", category: "Pants", activity: ["Travel","Lounge"], price: 92, rating: 4.6, reviews: 87, badge: "New Arrival", sizes: ["XS","S","M","L"], colors: ["Oat","Charcoal"], swatches: ["#d9d0c4","#343232"], fabric: "CloudKnit", fit: "Relaxed leg, mid-rise, draped hand feel.", description: "A soft wide-leg pant for airport days, slow mornings, and post-class recovery.", position: "18% 75%", scale: 1.36, image: catImg("Pants"), release: 20 },
    { id: "mesh-run-short", name: "Breeze Mesh Run Short", category: "Shorts", activity: ["Run","Train"], price: 54, compareAt: 68, rating: 4.5, reviews: 76, badge: "Sale", sizes: ["XS","S","M","L"], colors: ["Black","Sage"], swatches: ["#343232","#7d8a75"], fabric: "SculptForm", fit: "High-rise liner short with airy outer shell.", description: "Lightweight shorts with storage and ventilation for warm-weather movement.", position: "68% 70%", scale: 1.52, image: catImg("Shorts"), release: 2 },
    { id: "grip-yoga-mat", name: "Grounded Grip Yoga Mat", category: "Accessories", activity: ["Yoga","Pilates"], price: 72, rating: 4.7, reviews: 134, badge: "Core", sizes: ["One Size"], colors: ["Sage","Charcoal"], swatches: ["#7d8a75","#343232"], fabric: "Natural rubber blend", fit: "5 mm cushioned grip surface.", description: "A studio mat with steady grip, easy roll-up storage, and international shipping readiness.", position: "56% 86%", scale: 1.2, image: catImg("Accessories"), release: 7 }
  ];
}

// ── Filters & Rendering ──────────────────────────────────────────────────────
function filteredProducts() {
  const q = filters.query.trim().toLowerCase();
  const list = products.filter(p => {
    if (filters.category !== "All" && p.category !== filters.category) return false;
    const nb = (p.badge || "").replace(/s$/,"").toLowerCase();
    const nc = filters.collection.replace(/s$/,"").toLowerCase();
    const collMatch = filters.collection === "All" || nb === nc || (filters.collection === "Sale" && ["sale","final few"].includes((p.badge||"").toLowerCase()));
    if (!collMatch) return false;
    if (filters.activity !== "All" && !(p.activity||[]).includes(filters.activity)) return false;
    if (filters.size !== "All" && !(p.sizes||[]).includes(filters.size)) return false;
    if (q) {
      const hay = `${p.name} ${p.category} ${(p.activity||[]).join(" ")} ${p.description}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return list.sort((a, b) => {
    if (filters.sort === "new") return (b.release||0) - (a.release||0);
    if (filters.sort === "price-low") return a.price - b.price;
    if (filters.sort === "price-high") return b.price - a.price;
    if (filters.sort === "rating") return (b.rating||0) - (a.rating||0);
    return ((b.reviews||0) + (b.rating||0)*100) - ((a.reviews||0) + (a.rating||0)*100);
  });
}

function renderFilterChips() {
  const cats = ["All", ...unique(products.map(p => p.category))];
  const acts = ["All", ...unique(products.flatMap(p => p.activity||[]))];
  const sizes = ["All", "XS", "S", "M", "L", "XL", "One Size"];
  categoryFilters.innerHTML = cats.map(v => filterChip("category", v, filters.category === v)).join("");
  activityFilters.innerHTML = acts.map(v => filterChip("activity", v, filters.activity === v)).join("");
  sizeFilters.innerHTML = sizes.map(v => filterChip("size", v, filters.size === v)).join("");
}

function filterChip(type, value, active) {
  return `<button class="filter-chip ${active ? "is-active" : ""}" type="button" data-filter-type="${type}" data-filter-value="${value}">${value}</button>`;
}

function renderProducts() {
  const list = filteredProducts();
  resultCount.textContent = `${list.length} ${list.length === 1 ? "style" : "styles"}`;
  activeFilterText.textContent = [
    filters.collection !== "All" ? filters.collection : "",
    filters.category !== "All" ? filters.category : "All activewear",
    filters.activity !== "All" ? filters.activity : "",
    filters.size !== "All" ? filters.size : "",
    filters.query ? `"${filters.query}"` : ""
  ].filter(Boolean).join(" / ");
  noResults.classList.toggle("is-visible", list.length === 0);
  productGrid.innerHTML = list.map(renderProductCard).join("");
}

function renderProductCard(product) {
  const saved = wishlist.has(product.id);
  return `
    <article class="product-card">
      <div class="product-visual" style="${productImageStyle(product)}">
        <img src="${product.image}" alt="${product.name}" loading="lazy" />
        <span class="badge">${product.badge||"Core"}</span>
        <button class="save-button ${saved ? "is-saved" : ""}" type="button" data-wishlist="${product.id}">${saved ? "Saved" : "Save"}</button>
      </div>
      <div class="product-info">
        <div class="product-topline"><span>${product.category}</span><span>${product.rating||"—"} / ${product.reviews||0}</span></div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="swatches">${(product.swatches||[]).map(c => `<span style="--swatch:${c}"></span>`).join("")}</div>
        <label class="size-select"><span>Size</span><select data-size-for="${product.id}">${(product.sizes||[]).map(s => `<option value="${s}">${s}</option>`).join("")}</select></label>
        <div class="price-row"><span>${formatMoney(product.price)}</span>${product.compareAt ? `<del>${formatMoney(product.compareAt)}</del>` : ""}</div>
        <div class="product-actions">
          <button class="add-button" type="button" data-add="${product.id}">Add to Bag</button>
          <button class="quick-button" type="button" data-quick="${product.id}">Quick View</button>
        </div>
      </div>
    </article>`;
}

// ── Cart ─────────────────────────────────────────────────────────────────────
function renderCart() {
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const shipping = count === 0 || subtotal >= 120 ? 0 : 12;
  const total = subtotal + shipping;
  const remaining = Math.max(0, 120 - subtotal);
  const progress = Math.min(100, Math.round((subtotal / 120) * 100));

  cartCount.textContent = count;
  cartSubtotal.textContent = formatMoney(subtotal);
  cartShipping.textContent = shipping === 0 ? "Free" : formatMoney(shipping);
  cartTotal.textContent = formatMoney(total);
  freeShippingText.textContent = remaining === 0 ? "Free shipping unlocked" : `Add ${formatMoney(remaining)} for free shipping`;
  shippingProgress.style.width = `${progress}%`;
  cartEmpty.classList.toggle("is-visible", cart.length === 0);

  cartItems.innerHTML = cart.map(item => {
    const product = products.find(p => p.id === item.id);
    return `
      <article class="cart-item">
        <div class="cart-thumb" style="${productImageStyle(product||{})}"><img src="${product?.image||"./assets/yoga-collection.svg"}" alt="${product?.name||""}" /></div>
        <div>
          <div class="cart-item-title"><strong>${product?.name||item.id}</strong><button type="button" data-remove="${item.key}">Remove</button></div>
          <p>${item.size} / ${item.color} / ${formatMoney(item.price)}</p>
          <div class="qty-control">
            <button type="button" data-decrease="${item.key}" aria-label="Decrease">-</button><span>${item.quantity}</span><button type="button" data-increase="${item.key}" aria-label="Increase">+</button>
          </div>
        </div>
      </article>`;
  }).join("");

  writeJson(storageKeys.cart, cart);
}

function renderWishlistCount() {
  wishlistCount.textContent = wishlist.size;
}

function addToCart(id, sizeOverride) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  const sizeEl = document.querySelector(`[data-size-for="${id}"]`);
  const size = sizeOverride || sizeEl?.value || (product.sizes||[])[0] || "M";
  const color = (product.colors||[])[0] || "Default";
  const key = `${id}:${size}:${color}`;
  const existing = cart.find(i => i.key === key);
  if (existing) { existing.quantity += 1; }
  else { cart.push({ key, id, size, color, price: product.price, quantity: 1 }); }
  renderCart();
  if (productModal.classList.contains("is-open")) closeModal(productModal);
  openDrawer(cartDrawer);
  showToast(`${product.name} added to bag`);
}

function changeCartItem(key, amount) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) cart = cart.filter(i => i.key !== key);
  renderCart();
}

function removeCartItem(key) {
  cart = cart.filter(i => i.key !== key);
  renderCart();
}

// ── Wishlist ─────────────────────────────────────────────────────────────────
async function toggleWishlist(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;

  if (token && backendOnline) {
    try {
      const data = await api(`/api/wishlist/${id}`, { method: "POST" });
      if (data.action === "added") { wishlist.add(id); showToast(`${product.name} saved to wishlist`); }
      else { wishlist.delete(id); showToast(`${product.name} removed from wishlist`); }
    } catch (err) {
      showToast("Wishlist sync failed. Try signing in again.");
      return;
    }
  } else {
    // Local fallback
    if (wishlist.has(id)) { wishlist.delete(id); showToast(`${product.name} removed from wishlist`); }
    else { wishlist.add(id); showToast(`${product.name} saved to wishlist`); }
  }

  renderWishlistCount();
  renderProducts();
}

// ── Drawers & Modals ─────────────────────────────────────────────────────────
function openDrawer(drawer) { drawer.classList.add("is-open"); drawer.setAttribute("aria-hidden", "false"); }
function closeDrawer(drawer) { drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); }
function openModal(modal) { modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); }
function closeModal(modal) { modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }

function showProductDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  productDetail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-image" style="${productImageStyle(product)}"><img src="${product.image}" alt="${product.name}" /></div>
      <div class="detail-copy">
        <p class="eyebrow">${product.badge||"Core"}</p>
        <h2>${product.name}</h2>
        <div class="detail-rating">${product.rating||"—"} rating from ${product.reviews||0} reviews</div>
        <p>${product.description}</p>
        <div class="detail-specs">
          <div><strong>Fabric</strong><span>${product.fabric}</span></div>
          <div><strong>Fit</strong><span>${product.fit}</span></div>
          <div><strong>Activity</strong><span>${(product.activity||[]).join(", ")}</span></div>
        </div>
        <label class="size-select wide"><span>Select size</span><select id="detailSize">${(product.sizes||[]).map(s => `<option value="${s}">${s}</option>`).join("")}</select></label>
        <div class="price-row detail-price"><span>${formatMoney(product.price)}</span>${product.compareAt ? `<del>${formatMoney(product.compareAt)}</del>` : ""}</div>
        <button class="add-button" type="button" data-detail-add="${product.id}">Add to Bag</button>
      </div>
    </div>`;
  openModal(productModal);
}

// ── Checkout ─────────────────────────────────────────────────────────────────
async function submitCheckout(event) {
  event.preventDefault();
  if (cart.length === 0) { showToast("Your bag is empty"); return; }

  const form = new FormData(event.currentTarget);
  const status = $("#checkoutStatus");
  const payload = {
    customer: { name: form.get("name").trim(), email: form.get("email").trim() },
    shippingAddress: {
      name: form.get("name").trim(), email: form.get("email").trim(),
      country: form.get("country"), postal: form.get("postal").trim(), address: form.get("address").trim()
    },
    items: cart.map(i => ({ productId: i.id, size: i.size, color: i.color, quantity: i.quantity }))
  };

  status.textContent = "Creating your order...";

  try {
    const data = await api("/api/checkout", { method: "POST", body: JSON.stringify(payload) });
    cart = [];
    renderCart();
    closeDrawer(cartDrawer);
    status.innerHTML = `Order <strong>${data.order.id}</strong> created! <a href="${data.trackingUrl}">Track your order →</a>`;
    showToast(`Order ${data.order.id} placed!`);
    event.currentTarget.reset();
    await loadProducts();  // refresh stock
    renderProducts();
  } catch (err) {
    status.textContent = `${err.message}. Make sure the backend server is running (npm start).`;
  }
}

function setFilter(type, value) {
  filters[type] = value;
  if (type === "category") filters.collection = "All";
  renderFilterChips();
  renderProducts();
  $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
}

function routeShopFilter(value) {
  const cats = unique(products.map(p => p.category));
  if (value === "All" || cats.includes(value)) { setFilter("category", value); return; }
  filters.collection = value; filters.category = "All";
  renderFilterChips();
  renderProducts();
  $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearFilters() {
  filters.category = "All"; filters.collection = "All"; filters.activity = "All";
  filters.size = "All"; filters.query = ""; filters.sort = "featured";
  productSearch.value = ""; sortProducts.value = "featured";
  renderFilterChips();
  renderProducts();
}

// ── Events ───────────────────────────────────────────────────────────────────
function initEvents() {
  document.addEventListener("click", e => {
    const fb = e.target.closest("[data-filter-type]");
    const nf = e.target.closest("[data-nav-filter]");
    const af = e.target.closest("[data-activity-filter]");
    const mf = e.target.closest("[data-mobile-filter]");
    const ab = e.target.closest("[data-add]");
    const da = e.target.closest("[data-detail-add]");
    const wb = e.target.closest("[data-wishlist]");
    const qb = e.target.closest("[data-quick]");
    const inc = e.target.closest("[data-increase]");
    const dec = e.target.closest("[data-decrease]");
    const rem = e.target.closest("[data-remove]");
    const prov = e.target.closest("[data-provider]");
    const cm = e.target.closest("[data-close-modal]");
    const ao = e.target.closest("[data-open-account]");

    if (fb) setFilter(fb.dataset.filterType, fb.dataset.filterValue);
    if (nf) routeShopFilter(nf.dataset.navFilter);
    if (af) setFilter("activity", af.dataset.activityFilter);
    if (mf) { routeShopFilter(mf.dataset.mobileFilter); closeDrawer(mobileMenu); }
    if (ab) addToCart(ab.dataset.add);
    if (da) addToCart(da.dataset.detailAdd, $("#detailSize")?.value);
    if (wb) toggleWishlist(wb.dataset.wishlist);
    if (qb) showProductDetail(qb.dataset.quick);
    if (inc) changeCartItem(inc.dataset.increase, 1);
    if (dec) changeCartItem(dec.dataset.decrease, -1);
    if (rem) removeCartItem(rem.dataset.remove);
    if (prov) {
      if (prov.dataset.provider === "paypal") {
        checkoutNote.textContent = "PayPal integration — add your PayPal client ID in production.";
        showToast("PayPal checkout: add your live credentials");
      }
    }
    if (cm) closeModal(document.querySelector(`#${cm.dataset.closeModal}`));
    if (ao) {
      setAccountTab(ao.dataset.openAccount);
      openModal(accountModal);
    }
  });

  $("#openCart").addEventListener("click", () => openDrawer(cartDrawer));
  $("#closeCart").addEventListener("click", () => closeDrawer(cartDrawer));
  $("#menuButton").addEventListener("click", () => openDrawer(mobileMenu));
  $("#closeMenu").addEventListener("click", () => closeDrawer(mobileMenu));
  $("#accountButton").addEventListener("click", () => { setAccountTab("login"); openModal(accountModal); });
  $("#searchFocus").addEventListener("click", () => {
    $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => productSearch.focus(), 400);
  });
  $("#wishlistButton").addEventListener("click", () => {
    if (wishlist.size === 0) { showToast("No wishlist items yet"); return; }
    clearFilters();
    renderProducts();
    // Filter to show only wishlist items
    productGrid.innerHTML = products.filter(p => wishlist.has(p.id)).map(renderProductCard).join("");
    resultCount.textContent = `${wishlist.size} saved ${wishlist.size === 1 ? "style" : "styles"}`;
    activeFilterText.textContent = "Your Wishlist";
    noResults.classList.toggle("is-visible", wishlist.size === 0);
    $("#shop").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`${wishlist.size} saved item${wishlist.size > 1 ? "s" : ""}`);
  });
  $("#openWishlistFooter").addEventListener("click", () => $("#wishlistButton").click());
  $("#openCheckout").addEventListener("click", () => openModal(checkoutModal));
  $("#clearFilters").addEventListener("click", clearFilters);
  $("#trackOrder").addEventListener("click", () => { window.location.href = "/track.html"; });

  $("#logoutButton")?.addEventListener("click", () => {
    logout();
    closeModal(accountModal);
  });

  // Close drawers/modals on backdrop click
  [cartDrawer, mobileMenu].forEach(d => {
    d.addEventListener("click", e => { if (e.target === d) closeDrawer(d); });
  });
  [accountModal, productModal, checkoutModal].forEach(m => {
    m.addEventListener("click", e => { if (e.target === m) closeModal(m); });
  });

  productSearch.addEventListener("input", e => { filters.query = e.target.value; renderProducts(); });
  sortProducts.addEventListener("change", e => { filters.sort = e.target.value; renderProducts(); });

  $$("[data-account-tab]").forEach(b => b.addEventListener("click", () => setAccountTab(b.dataset.accountTab)));

  // Register
  $("#registerForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const errEl = $("#registerError");
    errEl.style.display = "none";
    try {
      if (backendOnline) {
        await register(form.get("name").trim(), form.get("email").trim(), form.get("password"));
        showToast("Account created! Welcome to Solara.");
        closeModal(accountModal);
      } else {
        // offline fallback
        user = { name: form.get("name").trim(), email: form.get("email").trim(), role: "customer" };
        writeJson(storageKeys.user, user);
        updateAccountUI();
        showToast("Account created (offline mode)");
        closeModal(accountModal);
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "";
    }
  });

  // Login
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const errEl = $("#loginError");
    errEl.style.display = "none";
    try {
      if (backendOnline) {
        await login(form.get("email").trim(), form.get("password"));
        showToast("Welcome back!");
        closeModal(accountModal);
      } else {
        // offline fallback
        const stored = readJson(storageKeys.user, null);
        if (stored && stored.email === form.get("email").trim()) {
          user = stored;
          updateAccountUI();
          showToast("Signed in (offline mode)");
          closeModal(accountModal);
        } else {
          errEl.textContent = "No account found. Create one or start the backend.";
          errEl.style.display = "";
        }
      }
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "";
    }
  });

  // Newsletter
  $("#newsletterForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = $("#newsletterEmail").value.trim();
    if (!email) return;
    const msgEl = $("#newsletterMessage");
    try {
      if (backendOnline) {
        const data = await api("/api/newsletter", { method: "POST", body: JSON.stringify({ email }) });
        msgEl.textContent = data.message;
      } else {
        msgEl.textContent = "You're on the list. Welcome offer incoming!";
      }
    } catch (err) {
      msgEl.textContent = err.message || "Failed to subscribe. Please try again.";
      msgEl.style.color = "var(--danger)";
      return;
    }
    msgEl.style.color = "";
    e.currentTarget.reset();
  });

  // Checkout
  $("#checkoutForm").addEventListener("submit", submitCheckout);
}

function setAccountTab(tab) {
  $$("[data-account-tab]").forEach(b => b.classList.toggle("is-active", b.dataset.accountTab === tab));
  $("#loginForm").classList.toggle("is-hidden", tab !== "login");
  $("#registerForm").classList.toggle("is-hidden", tab !== "register");
  $("#accountTitle").textContent = tab === "login" ? "Welcome back" : "Create your Solara account";
  updateAccountUI();
  // Clear errors
  const le = $("#loginError"); if (le) le.style.display = "none";
  const re = $("#registerError"); if (re) re.style.display = "none";
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadProducts();
  renderCart();
  renderWishlistCount();
  if (token) {
    // Verify token & load server wishlist
    try {
      const data = await api("/api/auth/me");
      user = data.user;
      setAuth(token, user);
      await loadWishlist();
    } catch {
      // Token expired or invalid
      setAuth("", null);
      wishlist = new Set();
    }
  }
  updateAccountUI();
  initEvents();
}

init();
