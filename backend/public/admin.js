// =====================
// TrackFast Admin Dashboard (JWT + Filters + Stats)
// =====================

// AUTO BASE URL
const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:5000"
  : "https://trackfast.onrender.com";

const statuses = [
  "Order Received",
  "Processing",
  "Dispatched",
  "In Transit",
  "Out for Delivery",
  "Delivered",
];

// ===== DOM =====
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const stateFilter = document.getElementById("stateFilter");
const table = document.getElementById("parcelTable");

// Stats DOM
const totalEl = document.getElementById("total");
const activeEl = document.getElementById("active");
const pausedEl = document.getElementById("paused");
const deliveredEl = document.getElementById("delivered");

// Update modal DOM
const updateModal = document.getElementById("updateModal");
const updateStatus = document.getElementById("updateStatus");
const updateLocation = document.getElementById("updateLocation");
const cancelUpdate = document.getElementById("cancelUpdate");
const saveUpdate = document.getElementById("saveUpdate");

// Edit modal DOM
const editModal = document.getElementById("editModal");
const editSender = document.getElementById("editSender");
const editReceiver = document.getElementById("editReceiver");
const editContact = document.getElementById("editContact");
const editOrigin = document.getElementById("editOrigin");
const editDestination = document.getElementById("editDestination");
const editEstimated = document.getElementById("editEstimated");
const editStatus = document.getElementById("editStatus");
const cancelEdit = document.getElementById("cancelEdit");
const saveEdit = document.getElementById("saveEdit");

// ===== STATE =====
let parcels = [];
let selectedParcelId = null;
let editParcelId = null;

// =====================
// AUTH HELPERS
// =====================
function getToken() {
  return localStorage.getItem("adminToken");
}

function logout(msg = "Session expired") {
  localStorage.removeItem("adminToken");
  window.showToast?.(msg, "warning", "Auth");
  window.location.replace("index.html");
}

function requireAuthOrRedirect() {
  if (!getToken()) {
    logout("Please login again");
    return false;
  }
  return true;
}

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return { message: await res.text() };
}

async function apiFetch(url, options = {}) {
  if (!requireAuthOrRedirect()) throw new Error("Not authenticated");

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${getToken()}`,
    },
  });

  const data = await safeJson(res);

  if (res.status === 401 || res.status === 403) {
    logout("Session expired. Login again.");
    throw new Error(data.message || "Unauthorized");
  }

  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// =====================
// HELPERS (LOCATION, STATS, FILTERS)
// =====================
function getCurrentLocation(p) {
  return p.timeline?.length
    ? p.timeline[p.timeline.length - 1].location
    : p.origin || "—";
}

function renderStats(list) {
  if (!totalEl) return;
  totalEl.innerText = list.length;
  activeEl.innerText = list.filter((p) => p.state === "active").length;
  pausedEl.innerText = list.filter((p) => p.state === "paused").length;
  deliveredEl.innerText = list.filter((p) => p.status === "Delivered").length;
}

function applyFilters() {
  let list = [...parcels];

  const term = (searchInput?.value || "").trim().toLowerCase();
  if (term)
    list = list.filter((p) =>
      String(p.id || "")
        .toLowerCase()
        .includes(term)
    );

  const st = statusFilter?.value || "";
  if (st) list = list.filter((p) => p.status === st);

  const state = stateFilter?.value || "";
  if (state) list = list.filter((p) => p.state === state);

  return list;
}

// =====================
// FETCH DATA
// =====================
async function fetchParcels() {
  parcels = await apiFetch(`${BASE_URL}/api/parcels`);
}

// =====================
// RENDER TABLE
// =====================
function renderDashboard() {
  if (!table) return;

  const list = applyFilters();
  renderStats(list);

  table.innerHTML = "";

  list.forEach((p) => {
    const row = document.createElement("tr");

    const isPaused = p.state === "paused";

    row.innerHTML = `
      <td>${p.id}</td>
      <td>${p.status}</td>
      <td>${getCurrentLocation(p)}</td>
      <td>${p.state}</td>
      <td class="actions">
        <button class="${isPaused ? "resume" : "pause"}">
          ${isPaused ? "Resume" : "Pause"}
        </button>
        <button class="update" ${isPaused ? "disabled" : ""}>Update</button>
        <button class="edit">Edit</button>
        <button class="delete">Delete</button>
      </td>
    `;

    table.appendChild(row);

    // Pause / Resume
    row.querySelector(".pause, .resume").onclick = async () => {
      try {
        const newState = isPaused ? "active" : "paused";

        await apiFetch(`${BASE_URL}/api/parcels/${p.id}/state`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: newState }),
        });

        window.showToast?.(`Parcel ${newState}`, "success", "Updated");
        await refresh();
      } catch (err) {
        window.showToast?.(err.message, "error", "Failed");
      }
    };

    // Update
    row.querySelector(".update").onclick = () => {
      if (isPaused) {
        window.showToast?.(
          "Parcel is paused. Resume first.",
          "warning",
          "Paused"
        );
        return;
      }
      openUpdateModal(p);
    };

    // Edit
    row.querySelector(".edit").onclick = () => openEditModal(p);

    // Delete (no ugly confirm)
    row.querySelector(".delete").onclick = async () => {
      try {
        window.showToast?.("Deleting parcel...", "warning", "Please wait");

        await apiFetch(`${BASE_URL}/api/parcels/${p.id}`, { method: "DELETE" });

        window.showToast?.("Parcel deleted", "success", "Done");
        await refresh();
      } catch (err) {
        window.showToast?.(err.message, "error", "Delete Failed");
      }
    };
  });
}

// =====================
// UPDATE MODAL
// =====================
function openUpdateModal(parcel) {
  selectedParcelId = parcel.id;

  updateStatus.innerHTML = statuses
    .map(
      (s) =>
        `<option value="${s}" ${
          s === parcel.status ? "selected" : ""
        }>${s}</option>`
    )
    .join("");

  updateLocation.value = getCurrentLocation(parcel);

  updateModal.style.display = "flex";
  updateLocation?.focus();
}

function closeUpdateModal() {
  selectedParcelId = null;
  updateModal.style.display = "none";
  updateLocation.value = "";
}

cancelUpdate?.addEventListener("click", closeUpdateModal);
updateModal?.addEventListener("click", (e) => {
  if (e.target === updateModal) closeUpdateModal();
});

saveUpdate?.addEventListener("click", async () => {
  try {
    const loc = updateLocation.value.trim();
    if (!loc) {
      window.showToast?.("Enter location", "warning", "Required");
      return;
    }

    await apiFetch(`${BASE_URL}/api/parcels/${selectedParcelId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: updateStatus.value,
        location: loc,
      }),
    });

    closeUpdateModal();
    window.showToast?.("Updated successfully", "success", "Done");
    await refresh();
  } catch (err) {
    window.showToast?.(err.message, "error", "Update Failed");
  }
});

// =====================
// EDIT MODAL
// =====================
function openEditModal(p) {
  editParcelId = p.id;

  editSender.value = p.sender || "";
  editReceiver.value = p.receiver || "";
  editContact.value = p.contact || "";
  editOrigin.value = p.origin || "";
  editDestination.value = p.destination || "";
  editEstimated.value = p.estimated_delivery
    ? String(p.estimated_delivery).slice(0, 10)
    : "";

  editStatus.innerHTML = statuses
    .map(
      (s) =>
        `<option value="${s}" ${s === p.status ? "selected" : ""}>${s}</option>`
    )
    .join("");

  editModal.style.display = "flex";
  editSender?.focus();
}

function closeEditModal() {
  editParcelId = null;
  editModal.style.display = "none";
}

cancelEdit?.addEventListener("click", closeEditModal);
editModal?.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});

saveEdit?.addEventListener("click", async () => {
  try {
    const payload = {
      sender: editSender.value.trim(),
      receiver: editReceiver.value.trim(),
      contact: editContact.value.trim(),
      origin: editOrigin.value.trim(),
      destination: editDestination.value.trim(),
      estimated_delivery: editEstimated.value,
      status: editStatus.value,
    };

    if (
      !payload.sender ||
      !payload.receiver ||
      !payload.origin ||
      !payload.destination
    ) {
      window.showToast?.(
        "Fill Sender, Receiver, Origin, Destination",
        "warning",
        "Missing"
      );
      return;
    }

    await apiFetch(`${BASE_URL}/api/parcels/${editParcelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    closeEditModal();
    window.showToast?.("Changes saved", "success", "Done");
    await refresh();
  } catch (err) {
    window.showToast?.(err.message, "error", "Save Failed");
  }
});

// =====================
// REFRESH
// =====================
async function refresh() {
  await fetchParcels();
  renderDashboard();
}

// IMPORTANT: filters must listen properly
searchInput?.addEventListener("input", renderDashboard);
statusFilter?.addEventListener("change", renderDashboard);
stateFilter?.addEventListener("change", renderDashboard);

// Init
if (requireAuthOrRedirect()) refresh();
