/* ═══════════════════════════════════════════════════════════════════════════
   Solara Yoga — Admin Panel JS
   Dashboard, Products CRUD, Orders, Users, Reviews
   ═══════════════════════════════════════════════════════════════════════════ */

const API = "";
let token = localStorage.getItem("solaraAdminToken") || "";
let user = null;
let currentOrderFilter = "all";

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ═══════════════ Helpers ═══════════════
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.remove("visible"), 2400);
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

function formatMoney(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function statusBadge(status) {
  const map = {
    pending:    '<span class="badge badge-secondary">待处理</span>',
    confirmed:  '<span class="badge badge-info">已确认</span>',
    shipped:    '<span class="badge badge-warning">已发货</span>',
    delivered:  '<span class="badge badge-success">已完成</span>',
    cancelled:  '<span class="badge badge-danger">已取消</span>'
  };
  return map[status] || `<span class="badge badge-secondary">${status}</span>`;
}

function roleBadge(role) {
  return role === 'admin'
    ? '<span class="badge badge-warning">管理员</span>'
    : '<span class="badge badge-info">用户</span>';
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

// ═══════════════ Auth ═══════════════
async function adminLogin(email, password) {
  const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (data.user.role !== "admin") throw new Error("此账号不是管理员");
  token = data.token;
  user = data.user;
  localStorage.setItem("solaraAdminToken", token);
  updateUI();
  showPage("dashboard");
  loadDashboard();
}

function adminLogout() {
  token = ""; user = null;
  localStorage.removeItem("solaraAdminToken");
  showPage("login");
  updateUI();
}

function updateUI() {
  const name = user ? user.name : "未登录";
  $("#sidebarUserName").textContent = name;
  $("#adminAvatar").textContent = user ? user.name[0].toUpperCase() : "?";
  $("#sidebarUserRole").textContent = user ? (user.role === "admin" ? "管理员" : "用户") : "";
  $("#adminLogout").style.display = user ? "" : "none";
}

// ═══════════════ Navigation ═══════════════
function showPage(name) {
  $$(".page").forEach(p => p.classList.remove("active"));
  $$(".nav-item").forEach(a => a.classList.toggle("active", a.dataset.page === name));
  const page = $(`#page-${name}`);
  if (page) page.classList.add("active");

  // Update breadcrumb
  const titles = { dashboard:"仪表盘", products:"商品管理", orders:"订单管理", users:"用户管理", reviews:"评价管理" };
  $("#breadcrumb").textContent = titles[name] || name;

  // Close mobile sidebar if open
  $("#sidebar").classList.remove("open");

  if (name === "dashboard") loadDashboard();
  if (name === "products") loadProducts();
  if (name === "orders") loadOrders();
  if (name === "users") loadUsers();
  if (name === "reviews") loadReviews();
}

// ═══════════════ Dashboard ═══════════════
async function loadDashboard() {
  try {
    const { stats, recentOrders, ordersByStatus } = await api("/api/admin/stats");
    const lowStockClass = stats.lowStock > 0 ? "stat-change down" : "stat-change up";

    $("#statGrid").innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orders">📦</div>
        <div class="stat-value">${stats.totalOrders}</div>
        <div class="stat-label">总订单数</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon revenue">💰</div>
        <div class="stat-value">${formatMoney(stats.totalRevenue)}</div>
        <div class="stat-label">总收入</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon products">📋</div>
        <div class="stat-value">${stats.totalProducts}</div>
        <div class="stat-label">在售商品</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon users">👥</div>
        <div class="stat-value">${stats.totalUsers}</div>
        <div class="stat-label">注册用户</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon low">⚠️</div>
        <div class="stat-value">${stats.lowStock}</div>
        <div class="stat-label">低库存商品</div>
        <span class="${lowStockClass}">${stats.lowStock > 0 ? '需要补货' : '库存充足'}</span>
      </div>
    `;

    // Revenue chart (simple bars)
    const maxRev = stats.totalRevenue || 1;
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const now = new Date();
    const bars = months.map((m, i) => {
      const h = i <= now.getMonth() ? 25 + Math.random() * 75 : 0;
      return `<div class="chart-bar" style="height:${h}%" data-label="${m}"></div>`;
    }).join("");
    $("#chartBars").innerHTML = bars;

    // Orders by status
    const statusLabels = { pending: "待处理", confirmed: "已确认", shipped: "已发货", delivered: "已完成", cancelled: "已取消" };
    const totalOrders = ordersByStatus.reduce((s, o) => s + o.count, 0) || 1;
    $("#ordersByStatus").innerHTML = ordersByStatus.length === 0
      ? '<p style="color:var(--text-muted);padding:20px;">暂无订单数据</p>'
      : ordersByStatus.map(s => `
          <div class="status-item">
            <span class="status-dot ${s.status}">${statusLabels[s.status] || s.status}</span>
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:120px;height:6px;background:#f0ede8;border-radius:3px;overflow:hidden;">
                <div style="width:${(s.count/totalOrders*100)}%;height:100%;background:var(--primary);border-radius:3px;"></div>
              </div>
              <span class="status-count">${s.count}</span>
            </div>
          </div>
        `).join("");

    // Recent orders
    if (recentOrders.length === 0) {
      $("#recentOrders").innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">暂无订单</div>';
    } else {
      $("#recentOrders").innerHTML = `
        <table class="data-table">
          <thead><tr><th>订单号</th><th>客户</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>${recentOrders.map(o => `
            <tr>
              <td><strong>${o.id}</strong></td>
              <td>${o.customer_name}</td>
              <td>${formatMoney(o.total)}</td>
              <td>${statusBadge(o.status)}</td>
              <td>${formatDate(o.created_at)}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    }
  } catch (err) {
    $("#statGrid").innerHTML = `<div class="card" style="padding:40px;text-align:center;color:var(--danger);">加载失败: ${err.message}</div>`;
  }
}

// ═══════════════ Products ═══════════════
async function loadProducts() {
  try {
    const data = await api("/api/products");
    const products = data.products;

    // Populate category filter
    const cats = [...new Set(products.map(p => p.category))];
    const catFilter = $("#productCategoryFilter");
    if (catFilter) {
      catFilter.innerHTML = '<option value="">全部分类</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join("");
    }

    renderProductTable(products);
    window._allProducts = products;
  } catch (err) {
    $("#productTable").innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--danger);">加载失败: ${err.message}</td></tr>`;
  }
}

function renderProductTable(products) {
  if (products.length === 0) {
    $("#productTable").innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">暂无商品</td></tr>';
    return;
  }
  $("#productTable").innerHTML = products.map(p => `
    <tr>
      <td><img src="${p.image}" alt="" onerror="this.style.display='none'" /></td>
      <td><strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td>${formatMoney(p.price)}${p.compare_at ? ` <del style="color:var(--text-muted);font-size:12px;">${formatMoney(p.compare_at)}</del>` : ""}</td>
      <td>${p.stock < 20 ? `<span style="color:var(--danger);font-weight:700;">${p.stock}</span>` : p.stock}</td>
      <td>⭐ ${p.rating} <span style="color:var(--text-muted);">(${p.reviews})</span></td>
      <td>${p.is_active ? '<span class="badge badge-success">上架</span>' : '<span class="badge badge-secondary">下架</span>'}</td>
      <td>
        <div class="actions-cell">
          <button class="btn btn-secondary btn-sm" data-edit="${escapeHtml(p.id)}">编辑</button>
          <button class="btn btn-secondary btn-sm" data-toggle="${escapeHtml(p.id)}" data-active="${p.is_active ? 0 : 1}">${p.is_active ? '下架' : '上架'}</button>
        </div>
      </td>
    </tr>
  `).join("");

  $("#productPagination").textContent = `共 ${products.length} 件商品`;
}

// Search & filter
if ($("#productTableSearch")) {
  $("#productTableSearch").addEventListener("input", e => {
    const q = e.target.value.toLowerCase();
    const cat = $("#productCategoryFilter")?.value || "";
    const all = window._allProducts || [];
    const filtered = all.filter(p => {
      if (cat && p.category !== cat) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
      return true;
    });
    renderProductTable(filtered);
  });
}
if ($("#productCategoryFilter")) {
  $("#productCategoryFilter").addEventListener("change", e => {
    const cat = e.target.value;
    const q = ($("#productTableSearch")?.value || "").toLowerCase();
    const all = window._allProducts || [];
    const filtered = all.filter(p => {
      if (cat && p.category !== cat) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
    renderProductTable(filtered);
  });
}

function openAddProduct() {
  const form = $("#productEditForm");
  form.reset();
  form.querySelector('[name="id"]').value = "";
  $("#productEditTitle").textContent = "添加商品";
  $("#deleteProductBtn").style.display = "none";
  $("#productEditModal").classList.add("open");
}

async function editProduct(id) {
  try {
    const data = await api(`/api/products/${id}`);
    const p = data.product;
    const form = $("#productEditForm");
    form.querySelector('[name="id"]').value = p.id;
    form.querySelector('[name="name"]').value = p.name;
    form.querySelector('[name="category"]').value = p.category;
    form.querySelector('[name="price"]').value = p.price;
    form.querySelector('[name="compare_at"]').value = p.compare_at || "";
    form.querySelector('[name="activity"]').value = (p.activity || []).join(",");
    form.querySelector('[name="badge"]').value = p.badge || "";
    form.querySelector('[name="sizes"]').value = (p.sizes || []).join(",");
    form.querySelector('[name="colors"]').value = (p.colors || []).join(",");
    form.querySelector('[name="swatches"]').value = (p.swatches || []).join(",");
    form.querySelector('[name="fabric"]').value = p.fabric || "";
    form.querySelector('[name="stock"]').value = p.stock || 0;
    form.querySelector('[name="image"]').value = p.image || "";
    form.querySelector('[name="fit"]').value = p.fit || "";
    form.querySelector('[name="description"]').value = p.description || "";
    $("#productEditTitle").textContent = "编辑商品";
    $("#deleteProductBtn").style.display = "";
    $("#productEditModal").classList.add("open");
  } catch (err) {
    showToast("加载商品失败: " + err.message);
  }
}

function closeEditModal() {
  $("#productEditModal").classList.remove("open");
}

async function saveProduct(e) {
  e.preventDefault();
  const form = new FormData(e.currentTarget);
  const id = form.get("id");
  const payload = {
    name: form.get("name"),
    category: form.get("category"),
    price: parseInt(form.get("price")) || 0,
    compare_at: form.get("compare_at") ? parseInt(form.get("compare_at")) : null,
    activity: form.get("activity").split(",").map(s => s.trim()).filter(Boolean),
    badge: form.get("badge") || "Core",
    sizes: form.get("sizes").split(",").map(s => s.trim()).filter(Boolean),
    colors: form.get("colors").split(",").map(s => s.trim()).filter(Boolean),
    swatches: form.get("swatches").split(",").map(s => s.trim()).filter(Boolean),
    fabric: form.get("fabric") || "",
    fit: form.get("fit") || "",
    description: form.get("description") || "",
    stock: parseInt(form.get("stock")) || 0,
    image: form.get("image") || "./assets/yoga-collection.svg",
    position: "50% 50%",
    scale: 1.2,
    release: id ? null : Math.floor(Date.now() / 86400000)
  };

  try {
    if (id) {
      await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showToast("商品已更新");
    } else {
      await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      showToast("商品已添加");
    }
    closeEditModal();
    loadProducts();
  } catch (err) {
    showToast("保存失败: " + err.message);
  }
}

async function toggleProduct(id, active) {
  try {
    await api(`/api/products/${id}`, { method: "PUT", body: JSON.stringify({ is_active: active }) });
    showToast(active ? "商品已上架" : "商品已下架");
    loadProducts();
  } catch (err) {
    showToast("操作失败: " + err.message);
  }
}

async function deleteProduct() {
  const name = document.querySelector('[name="name"]')?.value || "此商品";
  const id = document.querySelector('[name="id"]')?.value;
  if (!id || !confirm(`确定要删除「${name}」吗？此操作不可撤销。`)) return;
  try {
    await api(`/api/products/${id}`, { method: "DELETE" });
    showToast("商品已删除");
    closeEditModal();
    loadProducts();
  } catch (err) {
    showToast("删除失败: " + err.message);
  }
}

// ═══════════════ Orders ═══════════════
async function loadOrders(statusFilter) {
  if (statusFilter) currentOrderFilter = statusFilter;
  try {
    const qs = currentOrderFilter === "all" ? "" : `?status=${currentOrderFilter}`;
    const data = await api(`/api/admin/orders${qs}`);
    const orders = data.orders;

    if (orders.length === 0) {
      $("#orderTable").innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">暂无订单</td></tr>`;
    } else {
      $("#orderTable").innerHTML = orders.map(o => `
        <tr>
          <td><strong>${o.id}</strong></td>
          <td>
            <div>${o.customer_name}</div>
            <div style="font-size:12px;color:var(--text-muted);">${o.customer_email}</div>
          </td>
          <td><strong>${formatMoney(o.total)}</strong></td>
          <td>
            <select class="status-select" data-status-change="${escapeHtml(o.id)}">
              <option value="pending" ${o.status==='pending'?'selected':''}>待处理</option>
              <option value="confirmed" ${o.status==='confirmed'?'selected':''}>已确认</option>
              <option value="shipped" ${o.status==='shipped'?'selected':''}>已发货</option>
              <option value="delivered" ${o.status==='delivered'?'selected':''}>已完成</option>
              <option value="cancelled" ${o.status==='cancelled'?'selected':''}>已取消</option>
            </select>
          </td>
          <td style="font-size:13px;color:var(--text-secondary);">${formatDate(o.created_at)}</td>
          <td><button class="btn btn-secondary btn-sm" data-view-order="${escapeHtml(o.id)}">详情</button></td>
        </tr>
      `).join("");
    }
  } catch (err) {
    $("#orderTable").innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger);">加载失败: ${err.message}</td></tr>`;
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/api/admin/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    const labels = { pending:"待处理", confirmed:"已确认", shipped:"已发货", delivered:"已完成", cancelled:"已取消" };
    showToast(`订单 ${orderId} → ${labels[status] || status}`);
  } catch (err) {
    showToast("更新失败: " + err.message);
  }
}

async function viewOrder(orderId) {
  try {
    const { order, items } = await api(`/api/admin/orders/${orderId}`);
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

    $("#orderDrawerBody").innerHTML = `
      <div style="margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:12px;">
          <div>
            <h4 style="font-size:16px;margin-bottom:4px;">订单 ${order.id}</h4>
            <p style="font-size:13px;color:var(--text-secondary);">${formatDate(order.created_at)}</p>
          </div>
          ${statusBadge(order.status)}
        </div>
      </div>

      <div style="display:grid;gap:12px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span>客户</span><strong>${order.customer_name}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span>邮箱</span><strong>${order.customer_email}</strong></div>
        <div style="display:flex;justify-content:space-between;font-size:14px;"><span>国家</span><strong>${order.country}</strong></div>
        ${order.address ? `<div style="display:flex;justify-content:space-between;font-size:14px;"><span>地址</span><strong>${order.address}, ${order.postal||''}</strong></div>` : ''}
      </div>

      <h4 style="margin-bottom:12px;">商品明细</h4>
      <table class="data-table" style="margin-bottom:16px;">
        <thead><tr><th>商品</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th></tr></thead>
        <tbody>${items.map(i => `
          <tr>
            <td>${i.product_name}</td>
            <td>${i.size} / ${i.color}</td>
            <td>×${i.quantity}</td>
            <td>${formatMoney(i.price)}</td>
            <td><strong>${formatMoney(i.price * i.quantity)}</strong></td>
          </tr>
        `).join("")}</tbody>
      </table>

      <div style="text-align:right;border-top:1px solid var(--border);padding-top:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>小计</span><span>${formatMoney(subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>运费</span><span>${order.shipping === 0 ? '免运费' : formatMoney(order.shipping)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:17px;margin-top:8px;"><span>合计</span><span>${formatMoney(order.total)}</span></div>
      </div>
    `;

    $("#orderDrawer").classList.add("open");
    $("#orderDrawerOverlay").classList.add("open");
  } catch (err) {
    showToast("加载订单详情失败: " + err.message);
  }
}

function closeOrderDrawer() {
  $("#orderDrawer").classList.remove("open");
  $("#orderDrawerOverlay").classList.remove("open");
}

// ═══════════════ Users ═══════════════
async function loadUsers() {
  try {
    const data = await api("/api/admin/users");
    const users = data.users;
    if (users.length === 0) {
      $("#userTable").innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--text-muted);">暂无用户</td></tr>';
    } else {
      $("#userTable").innerHTML = users.map(u => `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="avatar" style="background:${u.role==='admin'?'#e8a838':'#4a7ce5'};">${u.name[0].toUpperCase()}</div>
              <strong>${u.name}</strong>
            </div>
          </td>
          <td>${u.email}</td>
          <td>${roleBadge(u.role)}</td>
          <td style="font-size:13px;color:var(--text-secondary);">${formatDate(u.created_at)}</td>
        </tr>
      `).join("");
    }
  } catch (err) {
    $("#userTable").innerHTML = `<tr><td colspan="4" style="text-align:center;padding:40px;color:var(--danger);">加载失败: ${err.message}</td></tr>`;
  }
}

// ═══════════════ Reviews ═══════════════
async function loadReviews() {
  try {
    const data = await api("/api/admin/reviews");
    const reviews = data.reviews;
    if (reviews.length === 0) {
      $("#reviewTable").innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-muted);">暂无评价</td></tr>';
    } else {
      $("#reviewTable").innerHTML = reviews.map(r => `
        <tr>
          <td>${r.product_name || '—'}</td>
          <td>${r.user_name}</td>
          <td>${'⭐'.repeat(Math.round(r.rating))} <span style="color:var(--text-muted);">${r.rating}</span></td>
          <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.comment || '—'}</td>
          <td style="font-size:13px;color:var(--text-secondary);">${formatDate(r.created_at)}</td>
        </tr>
      `).join("");
    }
  } catch (err) {
    $("#reviewTable").innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--danger);">加载失败: ${err.message}</td></tr>`;
  }
}

// ═══════════════ Event Bindings ═══════════════
function initAdmin() {
  // Login form
  $("#adminLoginForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const errEl = $("#loginError");
    errEl.style.display = "none";
    try {
      await adminLogin(form.get("email").trim(), form.get("password"));
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = "block";
    }
  });

  // Logout
  $("#adminLogout")?.addEventListener("click", adminLogout);

  // Sidebar nav
  $$(".nav-item").forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      if (!token) { showToast("请先登录"); showPage("login"); return; }
      showPage(a.dataset.page);
    });
  });

  // Topbar links (also trigger page nav)
  document.addEventListener("click", e => {
    const link = e.target.closest("[data-page]");
    if (link && token) {
      e.preventDefault();
      showPage(link.dataset.page);
    }
  });

  // Product edit form
  $("#productEditForm")?.addEventListener("submit", saveProduct);
  $("#addProductBtn")?.addEventListener("click", openAddProduct);
  $("#deleteProductBtn")?.addEventListener("click", deleteProduct);

  // Close edit modal on backdrop click
  $("#productEditModal")?.addEventListener("click", e => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // Order drawer close
  $("#closeOrderDrawer")?.addEventListener("click", closeOrderDrawer);
  $("#orderDrawerOverlay")?.addEventListener("click", closeOrderDrawer);

  // Order filter tabs
  document.addEventListener("click", e => {
    const tab = e.target.closest("[data-order-filter]");
    if (tab) {
      $$("[data-order-filter]").forEach(b => b.classList.remove("active"));
      tab.classList.add("active");
      loadOrders(tab.dataset.orderFilter);
    }

    // Delegated: edit product
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { editProduct(editBtn.dataset.edit); return; }

    // Delegated: toggle product
    const toggleBtn = e.target.closest("[data-toggle]");
    if (toggleBtn) { toggleProduct(toggleBtn.dataset.toggle, parseInt(toggleBtn.dataset.active)); return; }

    // Delegated: view order
    const viewBtn = e.target.closest("[data-view-order]");
    if (viewBtn) { viewOrder(viewBtn.dataset.viewOrder); return; }
  });

  // Delegated: order status change
  document.addEventListener("change", e => {
    const sel = e.target.closest("[data-status-change]");
    if (sel) { updateOrderStatus(sel.dataset.statusChange, sel.value); }
  });

  // Mobile sidebar toggle
  $("#menuBtn")?.addEventListener("click", () => {
    $("#sidebar").classList.toggle("open");
  });

  // Sidebar collapse toggle
  $("#sidebarToggle")?.addEventListener("click", () => {
    const sidebar = $("#sidebar");
    const main = $("#mainContent");
    if (sidebar.style.width === "64px") {
      sidebar.style.width = "240px";
      main.style.marginLeft = "240px";
      $$(".nav-item span").forEach(s => s.style.display = "");
      $$(".logo strong, .logo small").forEach(s => s.style.display = "");
    } else {
      sidebar.style.width = "64px";
      main.style.marginLeft = "64px";
      $$(".nav-item span").forEach(s => s.style.display = "none");
      $$(".logo strong, .logo small").forEach(s => s.style.display = "none");
      $("#sidebarUserName").style.display = "none";
      $("#sidebarUserRole").style.display = "none";
    }
  });

  // Init
  if (token) {
    api("/api/auth/me").then(data => {
      user = data.user;
      if (user.role !== "admin") { adminLogout(); return; }
      updateUI();
      showPage("dashboard");
      loadDashboard();
    }).catch(() => {
      localStorage.removeItem("solaraAdminToken");
      token = "";
      showPage("login");
    });
  } else {
    showPage("login");
    updateUI();
  }
}

initAdmin();
