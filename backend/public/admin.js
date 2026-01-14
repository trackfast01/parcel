// =====================
// TrackFast Admin (stable)
// =====================

const statuses = [
  "Order Received",
  "Processing",
  "Dispatched",
  "In Transit",
  "Out for Delivery",
  "Delivered",
];

// DOM elements
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const stateFilter = document.getElementById("stateFilter");
const table = document.getElementById("parcelTable");

// Stats elements
const totalEl = document.getElementById("total");
const activeEl = document.getElementById("active");
const pausedEl = document.getElementById("paused");
const deliveredEl = document.getElementById("delivered");

// UPDATE Modal elements
const updateModal = document.getElementById("updateModal");
const updateStatus = document.getElementById("updateStatus");
const updateLocation = document.getElementById("updateLocation");
const cancelUpdate = document.getElementById("cancelUpdate");
const saveUpdate = document.getElementById("saveUpdate");

// EDIT Modal elements
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

// Local cache
let parcels = [];
let selectedParcelId = null;
let editParcelId = null;

// ===== helpers =====
async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return { message: await res.text() };
}

async function fetchParcels() {
  const res = await fetch("/api/parcels");
  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.message || "Failed to fetch parcels");
  parcels = data;
}

function getCurrentLocation(parcel) {
  if (parcel.timeline && parcel.timeline.length) {
    return (
      parcel.timeline[parcel.timeline.length - 1].location ||
      parcel.origin ||
      "—"
    );
  }
  return parcel.origin || "—";
}

function renderStats(list) {
  if (!totalEl) return;

  totalEl.innerText = list.length;
  activeEl.innerText = list.filter((p) => p.state === "active").length;
  pausedEl.innerText = list.filter((p) => p.state === "paused").length;
  deliveredEl.innerText = list.filter((p) => p.status === "Delivered").length;
}

function applyFilters() {
  let filtered = [...parcels];

  const term = (searchInput?.value || "").trim().toLowerCase();
  if (term) {
    filtered = filtered.filter((p) =>
      String(p.id).toLowerCase().includes(term)
    );
  }

  const st = statusFilter?.value || "";
  if (st) filtered = filtered.filter((p) => p.status === st);

  const state = stateFilter?.value || "";
  if (state) filtered = filtered.filter((p) => p.state === state);

  return filtered;
}

// ===== MODALS =====
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
  updateLocation.focus();
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

function openEditModal(parcel) {
  editParcelId = parcel.id;

  editSender.value = parcel.sender || "";
  editReceiver.value = parcel.receiver || "";
  editContact.value = parcel.contact || "";
  editOrigin.value = parcel.origin || "";
  editDestination.value = parcel.destination || "";

  editEstimated.value = parcel.estimated_delivery
    ? String(parcel.estimated_delivery).slice(0, 10)
    : "";

  editStatus.innerHTML = statuses
    .map(
      (s) =>
        `<option value="${s}" ${
          s === parcel.status ? "selected" : ""
        }>${s}</option>`
    )
    .join("");

  editModal.style.display = "flex";
  editSender.focus();
}

function closeEditModal() {
  editParcelId = null;
  editModal.style.display = "none";
}

cancelEdit?.addEventListener("click", closeEditModal);
editModal?.addEventListener("click", (e) => {
  if (e.target === editModal) closeEditModal();
});

// ===== RENDER =====
function renderDashboard() {
  const list = applyFilters();
  renderStats(list);

  table.innerHTML = "";

  list.forEach((parcel) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${parcel.id}</td>
      <td>${parcel.status}</td>
      <td>${getCurrentLocation(parcel)}</td>
      <td>${parcel.state}</td>
      <td class="actions">
        <button class="${parcel.state === "active" ? "pause" : "resume"}">
          ${parcel.state === "active" ? "Pause" : "Resume"}
        </button>
        <button class="update" ${parcel.state === "paused" ? "disabled" : ""}>
          Add Update
        </button>
        <button class="edit">Edit</button>
        <button class="delete">Delete</button>
      </td>
    `;

    table.appendChild(row);

    // Pause/Resume
    row.querySelector(".pause, .resume").addEventListener("click", async () => {
      const nextState = parcel.state === "active" ? "paused" : "active";

      const res = await fetch(`/api/parcels/${parcel.id}/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: nextState }),
      });

      const data = await safeJson(res);
      if (!res.ok) return alert(data.message || "Failed to update state");

      await refresh();
    });

    // Add Update
    row.querySelector(".update").addEventListener("click", () => {
      if (parcel.state === "paused") {
        alert("This parcel is paused. Resume it before adding updates.");
        return;
      }
      openUpdateModal(parcel);
    });

    // Edit
    row.querySelector(".edit").addEventListener("click", () => {
      openEditModal(parcel);
    });

    // Delete
    row.querySelector(".delete").addEventListener("click", async () => {
      if (!confirm(`Delete parcel ${parcel.id}?`)) return;

      const res = await fetch(`/api/parcels/${parcel.id}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (!res.ok) return alert(data.message || "Failed to delete parcel");

      await refresh();
    });
  });
}

// ===== SAVE UPDATE =====
saveUpdate?.addEventListener("click", async () => {
  if (!selectedParcelId) return;

  const status = updateStatus.value;
  const location = updateLocation.value.trim();

  if (!status) return alert("Please select a status");
  if (!location) return alert("Please enter a location");

  const res = await fetch(`/api/parcels/${selectedParcelId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, location }),
  });

  const data = await safeJson(res);
  if (!res.ok) return alert(data.message || "Failed to add update");

  closeUpdateModal();
  await refresh();
});

// ===== SAVE EDIT =====
saveEdit?.addEventListener("click", async () => {
  if (!editParcelId) return;

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
    alert("Sender, Receiver, Origin and Destination are required.");
    return;
  }

  const res = await fetch(`/api/parcels/${editParcelId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(res);
  if (!res.ok) return alert(data.message || "Failed to edit parcel");

  closeEditModal();
  await refresh();
});

// ===== LISTENERS (IMPORTANT FIX) =====
// input for typing
searchInput?.addEventListener("input", renderDashboard);
// change for dropdowns
statusFilter?.addEventListener("change", renderDashboard);
stateFilter?.addEventListener("change", renderDashboard);

async function refresh() {
  try {
    await fetchParcels();
    renderDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// Init
refresh();
