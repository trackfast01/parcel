// =====================
// TrackFast Admin Dashboard (RBAC + Agents + Chat)
// =====================

const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:5000"
  : "https://trackfast.onrender.com";

const API = (path) => `${BASE_URL}${path}`;
const STATUSES = ["Order Received","Processing","Dispatched","In Transit","Out for Delivery","Delivered"];

// ===== DOM - Navigation =====
const navLinks = {
  dashboard: document.getElementById("nav-dashboard"),
  parcels: document.getElementById("nav-parcels"),
  agents: document.getElementById("nav-agents"),
  messages: document.getElementById("nav-messages"),
};
const sections = {
  dashboard: document.getElementById("dashboard-section"),
  parcels: document.getElementById("parcels-section"),
  agents: document.getElementById("agents-section"),
  messages: document.getElementById("messages-section"),
};
const pageTitle = document.getElementById("page-title");
const roleBadge = document.getElementById("user-role-badge");

// ===== DOM - Parcels =====
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const stateFilter = document.getElementById("stateFilter");
const table = document.getElementById("parcelTable");
const totalEl = document.getElementById("total");
const activeEl = document.getElementById("active");
const pausedEl = document.getElementById("paused");
const deliveredEl = document.getElementById("delivered");

// ===== DOM - Agents =====
const agentsTable = document.getElementById("agentsTable");
const agentModal = document.getElementById("agentModal");
const agentEmail = document.getElementById("agentEmail");
const agentPassword = document.getElementById("agentPassword");
const saveAgentBtn = document.getElementById("saveAgentBtn");

// ===== DOM - Chat =====
const chatSessionsList = document.getElementById("chat-sessions-list");
const adminChatMsgs = document.getElementById("admin-chat-msgs");
const adminChatInput = document.getElementById("admin-chat-input");
const adminChatSend = document.getElementById("admin-chat-send");
const msgBadge = document.getElementById("msg-badge");

// ===== STATE =====
let parcels = [];
let agents = [];
let currentUser = null; // { adminId, email, role }
let socket = null;
let currentSessionId = null; 
let sessions = new Map(); // sessionId -> { lastMsg, unread }

// =====================
// AUTH & INIT
// =====================
function getToken() { return localStorage.getItem("adminToken"); }

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

function init() {
  const token = getToken();
  console.log("Init Admin. Token exists?", !!token);
  
  if (!token) {
    console.log("No token, redirecting to index");
    return window.location.replace("index.html");
  }

  currentUser = parseJwt(token);
  console.log("Parsed User:", currentUser);

  if (!currentUser) {
    console.log("Invalid token, logging out");
    return logout();
  }

  // Set Role Badge
  roleBadge.innerText = currentUser.role === "superadmin" ? "SUPER ADMIN" : "AGENT";
  roleBadge.style.background = currentUser.role === "superadmin" ? "#f59e0b" : "#334155";
  roleBadge.style.color = currentUser.role === "superadmin" ? "#000" : "#fff";

  // Show "Agents" Link if Super Admin
  if (currentUser.role === "superadmin") {
    navLinks.agents.classList.remove("hidden");
  }

  // Initial Load
  refreshDashboard();
  initSocket();
  
  // Default View
  showSection('dashboard');
}

function logout(msg) {
  localStorage.removeItem("adminToken");
  if (msg) alert(msg);
  window.location.replace("index.html");
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  if (!token) { logout(); throw new Error("No token"); }

  const res = await fetch(API(path), {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` }
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) logout("Session expired");
    throw new Error(data.message || "Unauthorized");
  }
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// =====================
// NAVIGATION
// =====================
window.showSection = function(id) {
  // Update Nav
  Object.values(navLinks).forEach(el => el && el.classList.remove("active"));
  if (navLinks[id]) navLinks[id].classList.add("active");

  // Update Section
  Object.values(sections).forEach(el => el && el.classList.add("hidden"));
  if (sections[id]) sections[id].classList.remove("hidden");

  // Title
  pageTitle.innerText = id.charAt(0).toUpperCase() + id.slice(1);

  // Refresh data if needed
  if (id === 'parcels') refreshDashboard();
  if (id === 'agents') loadAgents();
  if (id === 'messages') loadChatSessions(); // refresh sessions
};


// =====================
// DATA - PARCELS
// =====================
async function refreshDashboard() {
  try {
    parcels = await apiFetch("/api/parcels");
    renderStats();
    renderParcels();
  } catch(err) {
    console.error(err);
  }
}

function renderStats() {
  totalEl.innerText = parcels.length;
  activeEl.innerText = parcels.filter((p) => p.state === "active").length;
  pausedEl.innerText = parcels.filter((p) => p.state === "paused").length;
  deliveredEl.innerText = parcels.filter((p) => p.status === "Delivered").length;
}

function renderParcels() {
  const term = (searchInput.value || "").toLowerCase();
  const st = statusFilter.value;
  const pd = stateFilter.value;

  const list = parcels.filter(p => {
    return (
      (p.id.toLowerCase().includes(term) || p.receiver.toLowerCase().includes(term)) &&
      (!st || p.status === st) &&
      (!pd || p.state === pd)
    );
  });

  table.innerHTML = "";
  list.forEach(p => {
    const isPaused = p.state === "paused";
    const bg = isPaused ? "color:orange" : "";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.id}</td>
      <td>${p.status}</td>
      <td>${getLoc(p)}</td>
      <td style="${bg}">${p.state.toUpperCase()}</td>
      <td class="actions">
        <button onclick="toggleState('${p.id}', '${p.state}')" class="${isPaused ? 'resume' : 'pause'}">
          ${isPaused ? "Resume" : "Pause"}
        </button>
        <button onclick="editParcel('${p.id}')" class="edit">Edit</button>
        <button onclick="deleteParcel('${p.id}')" class="delete">Delete</button>
        <button onclick="updateStatus('${p.id}')" class="update">Update</button>
      </td>
    `;
    table.appendChild(row);
  });
}

function getLoc(p) {
  return p.timeline.length ? p.timeline[p.timeline.length-1].location : p.origin;
}

// Search Listeners
searchInput.addEventListener("input", renderParcels);
statusFilter.addEventListener("change", renderParcels);
stateFilter.addEventListener("change", renderParcels);

// =====================
// PARCEL ACTIONS (Attached to window for inline onclicks)
// =====================
let tempParcelId = null;

// Modals
const updateModal = document.getElementById("updateModal");
const editModal = document.getElementById("editModal");
const pauseModal = document.getElementById("pauseModal");
const deleteModal = document.getElementById("deleteModal");

// Close logic
document.querySelectorAll(".modal-x, .btn-soft").forEach(btn => {
  btn.addEventListener("click", () => {
    updateModal.style.display = "none";
    editModal.style.display = "none";
    pauseModal.style.display = "none";
    deleteModal.style.display = "none";
    agentModal.style.display = "none";
  });
});

// Update Status
window.updateStatus = function(id) {
  const p = parcels.find(x => x.id === id);
  if(!p) return;
  tempParcelId = id;
  
  const sel = document.getElementById("updateStatus");
  sel.innerHTML = STATUSES.map(s => `<option ${s === p.status ? 'selected':''}>${s}</option>`).join("");
  document.getElementById("updateLocation").value = getLoc(p);
  
  updateModal.style.display = "flex";
}

document.getElementById("saveUpdate").onclick = async () => {
  try {
    const status = document.getElementById("updateStatus").value;
    const location = document.getElementById("updateLocation").value;
    await apiFetch(`/api/parcels/${tempParcelId}/status`, {
      method: "PUT",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ status, location })
    });
    updateModal.style.display = "none";
    refreshDashboard();
    window.showToast?.("Updated", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// Edit
window.editParcel = function(id) {
  const p = parcels.find(x => x.id === id);
  if(!p) return;
  tempParcelId = id;

  document.getElementById("editSender").value = p.sender;
  document.getElementById("editReceiver").value = p.receiver;
  document.getElementById("editContact").value = p.contact||"";
  document.getElementById("editOrigin").value = p.origin;
  document.getElementById("editDestination").value = p.destination;
  document.getElementById("editEstimated").value = p.estimated_delivery ? p.estimated_delivery.substr(0,10) : "";
  
  const sel = document.getElementById("editStatus");
  sel.innerHTML = STATUSES.map(s => `<option ${s === p.status ? 'selected':''}>${s}</option>`).join("");
  
  editModal.style.display = "flex";
}

document.getElementById("saveEdit").onclick = async () => {
  try {
    const body = {
      sender: document.getElementById("editSender").value,
      receiver: document.getElementById("editReceiver").value,
      contact: document.getElementById("editContact").value,
      origin: document.getElementById("editOrigin").value,
      destination: document.getElementById("editDestination").value,
      status: document.getElementById("editStatus").value,
      estimated_delivery: document.getElementById("editEstimated").value,
    };
    await apiFetch(`/api/parcels/${tempParcelId}`, {
      method: "PUT", body: JSON.stringify(body), headers: {"Content-Type":"application/json"}
    });
    editModal.style.display = "none";
    refreshDashboard();
    window.showToast?.("Saved", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// Pause/Resume
window.toggleState = function(id, currentState) {
  if (currentState === "paused") {
    // Resume immediately
    apiFetch(`/api/parcels/${id}/state`, {
      method: "PUT", body: JSON.stringify({state:"active"}), headers: {"Content-Type":"application/json"}
    }).then(() => {
      refreshDashboard();
      window.showToast?.("Resumed", "success");
    });
  } else {
    // Open Pause modal
    tempParcelId = id;
    document.getElementById("pauseParcelId").innerText = id;
    document.getElementById("pauseMessage").value = "";
    pauseModal.style.display = "flex";
  }
}

document.getElementById("confirmPause").onclick = async () => {
  try {
    const msg = document.getElementById("pauseMessage").value;
    await apiFetch(`/api/parcels/${tempParcelId}/state`, {
        method: "PUT", 
        body: JSON.stringify({state:"paused", pauseMessage: msg}), 
        headers: {"Content-Type":"application/json"}
    });
    pauseModal.style.display = "none";
    refreshDashboard();
    window.showToast?.("Paused", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// Delete Parcel
window.deleteParcel = function(id) {
  tempParcelId = id;
  document.getElementById("deleteParcelId").innerText = id;
  deleteModal.style.display = "flex";
}
document.getElementById("confirmDelete").onclick = async () => {
  try {
    await apiFetch(`/api/parcels/${tempParcelId}`, { method: "DELETE" });
    deleteModal.style.display = "none";
    refreshDashboard();
    window.showToast?.("Deleted", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// =====================
// AGENTS MANAGEMENT
// =====================
window.openAgentModal = function() {
  document.getElementById("agentEmail").value = "";
  document.getElementById("agentPassword").value = "";
  document.getElementById("agentModal").style.display = "flex";
}
window.closeAgentModal = function() {
  document.getElementById("agentModal").style.display = "none";
}

async function loadAgents() {
  if (currentUser.role !== 'superadmin') return;
  try {
    agents = await apiFetch("/api/admin/agents");
    agentsTable.innerHTML = agents.map(a => `
      <tr>
        <td>${a.email}</td>
        <td><span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px;">${a.role}</span></td>
        <td>${new Date(a.createdAt).toLocaleDateString()}</td>
        <td>
          <button onclick="removeAgent('${a._id}')" class="delete" style="padding:6px 10px;">Remove</button>
        </td>
      </tr>
    `).join("");
  } catch(e) { console.error(e); }
}

saveAgentBtn.onclick = async () => {
  try {
    const email = agentEmail.value;
    const password = agentPassword.value;
    await apiFetch("/api/admin/create-agent", {
      method: "POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({email, password})
    });
    closeAgentModal();
    loadAgents();
    window.showToast?.("Agent created", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// =====================
// AGENT DELETION MODAL LOGIC
// =====================
const agentDeleteModal = document.getElementById("agentDeleteModal");
let tempAgentId = null;

// Close listeners for new modal
document.querySelectorAll('[data-close="agentDeleteModal"]').forEach(btn => {
  btn.onclick = () => agentDeleteModal.style.display = "none";
});

window.removeAgent = function(id) {
  // Find agent email to show in modal
  const agent = agents.find(a => a._id === id);
  if (!agent) return;

  tempAgentId = id;
  document.getElementById("deleteAgentEmail").innerText = agent.email;
  agentDeleteModal.style.display = "flex";
}

document.getElementById("confirmAgentDelete").onclick = async () => {
  try {
    await apiFetch(`/api/admin/agents/${tempAgentId}`, { method: "DELETE" });
    agentDeleteModal.style.display = "none";
    loadAgents();
    window.showToast?.("Agent removed", "success");
  } catch(e) { window.showToast?.(e.message, "error"); }
};

// =====================
// LIVE CHAT LOGIC
// =====================
// =====================
// LIVE CHAT LOGIC
// =====================
function initSocket() {
  const token = getToken();
  if (!token) return;

  socket = io(); 

  socket.on("connect", () => {
    socket.emit("join_admin", token); // Send token for identification
  });

  // New message from any user
  socket.on("new_message", (msg) => {
    loadChatSessions(); 
    
    // If viewing this session, append
    if (currentSessionId === msg.sessionId) {
      appendMsg(msg);
    } else {
      window.showToast?.("New support message", "info");
      msgBadge.style.display = "inline-block";
    }
  });

  socket.on("admin_reply_broadcast", (msg) => {
      if (currentSessionId === msg.sessionId) {
          appendMsg(msg);
      }
  });
}

async function loadChatSessions() {
  try {
    const list = await apiFetch("/api/chat/sessions");
    chatSessionsList.innerHTML = list.map(item => `
      <div 
        class="session-item ${currentSessionId === item._id ? 'active' : ''}" 
        onclick="openSession('${item._id}')"
      >
        <div style="font-weight:bold; font-size:13px;">User ${item._id.substr(0,4)}</div>
        <div style="font-size:11px; color:#aaa; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
           ${item.lastMsg.content}
        </div>
        <div style="font-size:10px; color:#666; margin-top:4px;">
           ${new Date(item.lastMsg.createdAt).toLocaleTimeString()}
        </div>
      </div>
    `).join("");
  } catch(e) {
      chatSessionsList.innerHTML = `<div style="padding:15px; color:red;">Error loading chats</div>`;
  }
}

window.openSession = async function(sid) {
  currentSessionId = sid;
  adminChatInput.disabled = false;
  adminChatSend.disabled = false;
  document.getElementById("chat-active-header").innerText = `Chat with User ${sid.substr(0,4)}`;
  
  loadChatSessions(); // redraw
  
  try {
      const history = await apiFetch(`/api/chat/${sid}`);
      adminChatMsgs.innerHTML = "";
      history.forEach(appendMsg);
      scrollToBottom();
  } catch(e) { console.error(e); }
}

function appendMsg(msg) {
  const div = document.createElement("div");
  div.className = `msg ${msg.sender}`;
  
  if (msg.image) {
    const img = document.createElement("img");
    img.src = msg.image;
    img.style.maxWidth = "200px";
    img.style.borderRadius = "8px";
    img.style.marginBottom = "5px";
    img.style.display = "block";
    div.appendChild(img);
  }
  
  if (msg.content && msg.content !== "Sent an image") {
    const p = document.createElement("span");
    p.innerText = msg.content;
    div.appendChild(p);
  }
  
  adminChatMsgs.appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  adminChatMsgs.scrollTop = adminChatMsgs.scrollHeight;
}

// Send Reply
async function sendAdminReply() {
    const text = adminChatInput.value.trim();
    if (!text || !currentSessionId) return;
    
    // Emit socket event
    socket.emit("send_message_admin", {
        sessionId: currentSessionId,
        content: text,
        adminId: currentUser.adminId // or from token
    });
    
    // Optimistic append is handled by broadcast listener usually, 
    // but we can do it here if we want instant feedback?
    // Actually server broadcasts 'admin_reply_broadcast', so we wait for that.
    
    adminChatInput.value = "";
}

adminChatSend.onclick = sendAdminReply;
adminChatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendAdminReply();
});


// Init Main
init();
