// =====================
// TrackFast Front Page + Admin Login (Production Safe)
// =====================

// AUTO SELECT BASE URL
const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:5000"
  : "https://trackfast.onrender.com";

// ===== ELEMENTS =====
const trackBtn = document.getElementById("trackBtn");
const trackingInput = document.getElementById("trackingInput");
const result = document.getElementById("result");
const loader = document.getElementById("loader");

const adminBtn = document.getElementById("adminBtn");
const adminModal = document.getElementById("adminModal");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");

// =====================
// HELPERS
// =====================
function showResult() {
  if (result) result.style.display = "block";
}
function hideResult() {
  if (result) result.style.display = "none";
}
function showLoader() {
  if (loader) loader.style.display = "block";
}
function hideLoader() {
  if (loader) loader.style.display = "none";
}

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "—";
  }
}

function getSteps() {
  return [
    "Order Received",
    "Processing",
    "Dispatched",
    "In Transit",
    "Out for Delivery",
    "Delivered",
  ];
}

function getProgress(status) {
  const steps = getSteps();
  const idx = steps.indexOf(status);
  if (idx === -1) return 10;
  return Math.round(((idx + 1) / steps.length) * 100);
}

function statusTone(status = "") {
  const s = status.toLowerCase();
  if (s.includes("delivered")) return "success";
  if (s.includes("out for delivery")) return "info";
  if (s.includes("transit") || s.includes("dispatched")) return "warning";
  if (s.includes("processing")) return "neutral";
  return "neutral";
}

function iconForStatus(status = "") {
  const s = status.toLowerCase();
  if (s.includes("delivered")) return "✅";
  if (s.includes("out for delivery")) return "🛵";
  if (s.includes("transit")) return "🚚";
  if (s.includes("dispatched")) return "📦";
  if (s.includes("processing")) return "⚙️";
  if (s.includes("received")) return "🧾";
  return "📍";
}

function getCurrentLocation(parcel) {
  const tl = Array.isArray(parcel.timeline) ? parcel.timeline : [];
  return tl.length ? tl[tl.length - 1].location : parcel.origin || "—";
}

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return { message: await res.text() };
}

// =====================
// TRACK PARCEL
// =====================
async function trackParcel() {
  if (!trackingInput) return;

  hideResult();
  showLoader();

  const trackingId = trackingInput.value.trim();

  if (!trackingId) {
    hideLoader();
    showResult();
    if (result) result.innerHTML = "";
    showToast?.("Please enter a tracking ID", "warning", "Tracking");
    return;
  }

  try {
    const res = await fetch(
      `${BASE_URL}/api/parcels/${encodeURIComponent(trackingId)}`
    );

    const data = await safeJson(res);

    hideLoader();
    showResult();

    if (!res.ok) {
      const msg = data?.message || "Request failed";
      if (result)
        result.innerHTML = `<p class="error">❌ ${escapeHtml(msg)}</p>`;

      const type = res.status === 403 ? "warning" : "error";
      const title = res.status === 403 ? "Paused" : "Not Found";
      showToast?.(msg, type, title);
      return;
    }

    renderParcel(data);
    showToast?.("Tracking loaded", "success", "Success");
  } catch (err) {
    hideLoader();
    showResult();
    if (result)
      result.innerHTML = `<p class="error">❌ Server not reachable</p>`;
    showToast?.("Server unreachable. Try again.", "error", "Network");
  }
}

if (trackBtn) trackBtn.addEventListener("click", trackParcel);

// Enter key on tracking input
if (trackingInput) {
  trackingInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") trackParcel();
  });
}

// =====================
// PREMIUM RENDER UI
// =====================
function renderParcel(parcel) {
  const id = escapeHtml(parcel.id || "—");
  const statusRaw = parcel.status || "—";
  const status = escapeHtml(statusRaw);
  const tone = statusTone(statusRaw);
  const progress = getProgress(statusRaw);

  const origin = escapeHtml(parcel.origin || "—");
  const destination = escapeHtml(parcel.destination || "—");
  const currentLoc = escapeHtml(getCurrentLocation(parcel) || "—");

  const created = fmtDate(parcel.createdAt);
  const eta = parcel.estimated_delivery
    ? escapeHtml(String(parcel.estimated_delivery).slice(0, 10))
    : "—";

  const sender = escapeHtml(parcel.sender || "—");
  const receiver = escapeHtml(parcel.receiver || "—");
  const contact = escapeHtml(parcel.contact || "—");

  const timeline = Array.isArray(parcel.timeline)
    ? parcel.timeline.slice()
    : [];
  const tl = timeline.reverse(); // newest first

  const steps = getSteps();
  const activeIndex = steps.indexOf(statusRaw);

  const stepPills = steps
    .map((s, i) => {
      const done = activeIndex >= i && activeIndex !== -1;
      const current = activeIndex === i;
      return `
        <div class="tf-step ${done ? "done" : ""} ${current ? "current" : ""}">
          <span class="tf-step-dot"></span>
          <span class="tf-step-label">${escapeHtml(s)}</span>
        </div>
      `;
    })
    .join("");

  const historyHtml = tl.length
    ? `
      <div class="tf-timeline">
        ${tl
          .map((t, idx) => {
            const isLatest = idx === 0;
            const tStatus = escapeHtml(t.status || "—");
            const tLoc = escapeHtml(t.location || "—");
            const tTime = fmtDate(t.time);

            return `
              <div class="tf-event ${isLatest ? "latest" : ""}">
                <div class="tf-event-rail">
                  <span class="tf-event-dot"></span>
                  <span class="tf-event-line"></span>
                </div>
                <div class="tf-event-card">
                  <div class="tf-event-top">
                    <div class="tf-event-status">
                      <span class="tf-emoji">${iconForStatus(
                        t.status || ""
                      )}</span>
                      <span>${tStatus}</span>
                      ${isLatest ? `<span class="tf-chip">Latest</span>` : ""}
                    </div>
                    <div class="tf-event-time">${escapeHtml(tTime)}</div>
                  </div>
                  <div class="tf-event-loc">📍 ${tLoc}</div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `
    : `
      <div class="tf-empty">
        <div class="tf-empty-title">No tracking updates yet</div>
        <div class="tf-empty-sub">Once the parcel moves, updates will appear here.</div>
      </div>
    `;

  if (!result) return;

  result.innerHTML = `
    <div class="tf-wrap">
      <div class="tf-card">
        <div class="tf-head">
          <div>
            <div class="tf-kicker">Tracking ID</div>
            <div class="tf-id">${id}</div>
          </div>

          <div class="tf-head-right">
            <span class="tf-badge ${tone}">
              ${iconForStatus(statusRaw)} ${status}
            </span>
            <div class="tf-sub">Created: <b>${escapeHtml(created)}</b></div>
          </div>
        </div>

        <div class="tf-route">
          <div class="tf-route-box">
            <div class="tf-mini">From</div>
            <div class="tf-route-main">${origin}</div>
          </div>

          <div class="tf-route-mid">
            <div class="tf-plane">➜</div>
            <div class="tf-loc">
              <span class="tf-mini">Current</span>
              <span class="tf-loc-pill">${currentLoc}</span>
            </div>
          </div>

          <div class="tf-route-box">
            <div class="tf-mini">To</div>
            <div class="tf-route-main">${destination}</div>
          </div>
        </div>

        <div class="tf-meta">
          <div class="tf-meta-card">
            <div class="tf-mini">Estimated delivery</div>
            <div class="tf-meta-big">${eta}</div>
          </div>

          <div class="tf-meta-card">
            <div class="tf-mini">Progress</div>
            <div class="tf-meta-big">${progress}%</div>
          </div>

          <div class="tf-meta-card">
            <div class="tf-mini">Receiver contact</div>
            <div class="tf-meta-big">${contact}</div>
          </div>
        </div>

        <div class="tf-progress">
          <div class="tf-progress-top">
            <div class="tf-mini">Delivery progress</div>
            <div class="tf-progress-text"><b>${status}</b></div>
          </div>
          <div class="tf-bar">
            <div class="tf-fill" style="width:${progress}%"></div>
          </div>

          <div class="tf-steps">
            ${stepPills}
          </div>
        </div>

        <div class="tf-ship">
          <div class="tf-section-title">Shipment details</div>
          <div class="tf-rows">
            <div class="tf-row"><span>Sender</span><b>${sender}</b></div>
            <div class="tf-row"><span>Receiver</span><b>${receiver}</b></div>
          </div>
        </div>

        <div class="tf-history">
          <div class="tf-section-title">Tracking history</div>
          ${historyHtml}
        </div>
      </div>
    </div>
  `;
}

// =====================
// ADMIN LOGIN MODAL + LOGIN
// =====================
function openAdminModal() {
  if (!adminModal) return;
  adminModal.style.display = "flex";
  setTimeout(() => adminEmail?.focus(), 50);
}

function closeAdminModal() {
  if (!adminModal) return;
  adminModal.style.display = "none";
}

if (adminBtn) {
  adminBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const token = localStorage.getItem("adminToken");
    if (token) {
      window.location.href = "admin.html";
      return;
    }
    openAdminModal();
  });
}

if (adminModal) {
  adminModal.addEventListener("click", (e) => {
    if (e.target === adminModal) closeAdminModal();
  });
}

async function loginAdmin() {
  if (!adminEmail || !adminPassword || !adminLoginBtn) return;

  const email = adminEmail.value.trim();
  const password = adminPassword.value.trim();

  if (!email || !password) {
    showToast?.("Enter email and password", "warning", "Login");
    return;
  }

  try {
    adminLoginBtn.disabled = true;
    adminLoginBtn.textContent = "Logging in...";

    const res = await fetch(`${BASE_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await safeJson(res);

    if (!res.ok) {
      showToast?.(data.message || "Login failed", "error", "Denied");
      return;
    }

    localStorage.setItem("adminToken", data.token);

    showToast?.("Login successful", "success", "Welcome");
    closeAdminModal();

    adminEmail.value = "";
    adminPassword.value = "";

    setTimeout(() => {
      window.location.href = "admin.html";
    }, 450);
  } catch (err) {
    showToast?.("Server unreachable", "error", "Network");
  } finally {
    adminLoginBtn.disabled = false;
    adminLoginBtn.textContent = "Login";
  }
}

if (adminLoginBtn) adminLoginBtn.addEventListener("click", loginAdmin);

// Enter key triggers login
[adminEmail, adminPassword].forEach((el) => {
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginAdmin();
  });
});
