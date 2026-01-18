// =====================
// TrackFast Front Page + Admin Login + CRAZY UPDATES
// =====================

const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:5000"
  : "https://trackfast.onrender.com"; // Adjust if needed

// ===== ELEMENTS =====
const trackBtn = document.getElementById("trackBtn");
const trackingInput = document.getElementById("trackingInput");
const result = document.getElementById("result");
const loader = document.getElementById("loader");

// Admin
const adminModal = document.getElementById("adminModal");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminEmail = document.getElementById("adminEmail");
const adminPassword = document.getElementById("adminPassword");
const adminTrigger = document.getElementById("adminTrigger");

// Chat
const chatWidget = document.getElementById("chat-widget");
const chatToggle = document.getElementById("chat-toggle");
const chatBox = document.getElementById("chat-box");
const chatClose = document.getElementById("chat-close");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatMessages = document.getElementById("chat-messages");

let socket;
let sessionId = localStorage.getItem("chatSessionId");
if (!sessionId) {
  sessionId = Math.random().toString(36).substr(2, 9);
  localStorage.setItem("chatSessionId", sessionId);
}

// =====================
// INIT
// =====================
let currentTrackingId = null; // Track context

document.addEventListener("DOMContentLoaded", () => {
document.addEventListener("DOMContentLoaded", () => {
  // initGlobe removed
});
  // initSocket(); // Replaced by initChat, called on toggle
});

// ...

// =====================
// SUPPORT CHAT
// =====================
// (Variables socket, sessionId, chatWidget etc already declared at top)

// File Input for Images
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

// Paperclip
const attachBtn = document.createElement("button");
attachBtn.innerHTML = "📎";
attachBtn.style.cssText = "background:none; border:none; color:white; font-size:18px; cursor:pointer;";
// Insert before input if not already there
if (chatInput && !chatInput.previousSibling?.isSameNode(attachBtn)) {
  chatInput.parentNode.insertBefore(attachBtn, chatInput);
}

attachBtn.onclick = () => fileInput.click();

fileInput.onchange = async () => {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      sendMessage(null, base64);
    };
    reader.readAsDataURL(file);
  }
};

function initChat() {
  if (window.io && !socket) {
    socket = io();
    socket.emit("join_user", sessionId);

    socket.on("admin_reply", (msg) => {
      addMessageToUI(msg.content, "admin", msg.image);
      window.showToast?.("New reply from support", "info");
      // Auto-show if hidden?
      if (chatWidget.classList.contains("hidden")) {
          toggleChat();
      }
    });

    socket.on("message_sent", () => {});
  }
}

function toggleChat() {
  if (!currentTrackingId) {
    return window.showToast?.("Please track a parcel first", "warning");
  }
  chatBox.classList.toggle("hidden");
  if (!chatBox.classList.contains("hidden")) {
    initChat();
    // Scroll to bottom
    const chatBody = document.getElementById("chat-messages"); // Fixed ID ref
    if(chatBody) chatBody.scrollTop = chatBody.scrollHeight;
  }
}

// Bind Header Click
const chatHeader = document.querySelector(".chat-header");
if (chatHeader) chatHeader.onclick = toggleChat;

// Bind Toggle Button Explicitly
const chatToggleBtn = document.getElementById("chat-toggle");
if (chatToggleBtn) {
  chatToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleChat();
  });
}

function sendMessage(textOverride, imageBase64) {
  const content = textOverride || chatInput.value.trim();
  if (!content && !imageBase64) return;

  addMessageToUI(content || "Sent an image", "user", imageBase64);
  chatInput.value = "";

  if (!socket) initChat();
  
  if (socket) {
    socket.emit("send_message_user", { 
      sessionId, 
      content: content || "Sent an image", 
      image: imageBase64,
      trackingId: currentTrackingId 
    });
  }
}

if (chatSend) chatSend.onclick = () => sendMessage();
chatInput?.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

function addMessageToUI(text, type, imgData) {
  const chatBody = document.getElementById("chat-messages"); // Corrected ID
  if (!chatBody) return;

  const div = document.createElement("div");
  div.className = `msg ${type}`;
  
  if (imgData) {
    const img = document.createElement("img");
    img.src = imgData;
    img.style.maxWidth = "100%";
    img.style.borderRadius = "8px";
    img.style.marginTop = "5px";
    div.appendChild(img);
  }
  
  if (text && text !== "Sent an image") {
     const p = document.createElement("p");
     p.innerText = text;
     p.style.margin = "0";
     div.appendChild(p);
  }

  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}
// ...

// =====================
// TRACK PARCEL
// =====================
// =====================
// TRACK PARCEL
// =====================
async function trackParcel() {
  hideResult();
  showLoader();

  const trackingId = trackingInput.value.trim();
  if (!trackingId) {
    hideLoader();
    showResult();
    result.innerHTML = "";
    showToast?.("Enter tracking ID", "warning", "Tracking");
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/api/parcels/${encodeURIComponent(trackingId)}`);
    const data = await safeJson(res);

    hideLoader();
    showResult();

    if (!res.ok) {
      currentTrackingId = null; // Clear if not found
      result.innerHTML = `<p class="error">❌ ${escapeHtml(data.message || "Not found")}</p>`;
      if (chatWidget) chatWidget.style.display = "none"; // Hide chat on error
      return;
    }
    
    currentTrackingId = data.id; // Capture ID
    renderParcel(data);
    
    // --- NEW: SESSION MGMT ---
    // 1. Derive Session ID for this parcel
    const key = `chat_session_${currentTrackingId}`;
    let stored = localStorage.getItem(key);
    if (!stored) {
        stored = Math.random().toString(36).substr(2, 9);
        localStorage.setItem(key, stored);
    }
    sessionId = stored; // Update global var

    // 2. Clear previous msgs
    const chatBody = document.getElementById("chat-messages");
    if (chatBody) chatBody.innerHTML = "";

    // 3. Switch Socket Room if connected
    if (socket) {
        socket.emit("join_user", sessionId);
    }
    
    // 4. Fetch History
    loadUserHistory(sessionId);

    // Show Chat Widget
    if (chatWidget) {
        chatWidget.style.display = "flex";
        window.showToast?.("Support is available for this shipment", "info");
    }

  } catch (err) {
    console.error(err);
    currentTrackingId = null;
    hideLoader();
    showResult();
    result.innerHTML = `<p class="error">❌ Server not reachable</p>`;
    if (chatWidget) chatWidget.style.display = "none"; // Hide chat on error
  }
}

async function loadUserHistory(sid) {
    try {
        const res = await fetch(`${BASE_URL}/api/chat/${sid}`);
        if(res.ok) {
            const msgs = await res.json();
            const chatBody = document.getElementById("chat-messages");
            if(chatBody) chatBody.innerHTML = ""; // Ensure clean
            msgs.forEach(m => addMessageToUI(m.content, m.sender, m.image));
        }
    } catch(e) { console.error("History fetch failed", e); }
}

trackBtn?.addEventListener("click", trackParcel);
trackingInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") trackParcel();
});

// =====================
// RENDER PARCEL (Fixed)
// =====================
function renderParcel(parcel) {
  const id = escapeHtml(parcel.id);
  const status = escapeHtml(parcel.status);
  const created = fmtDate(parcel.createdAt);
  const origin = escapeHtml(parcel.origin);
  const destination = escapeHtml(parcel.destination);
  const currentLoc = escapeHtml(getCurrentLocation(parcel));
  const delivered = isDelivered(parcel.status);
  const progress = delivered ? 100 : getProgress(parcel.status);

  // 🎉 TRIGGER CONFETTI IF DELIVERED 🎉
  if (delivered && window.confetti) {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  }

  const pausedBanner = parcel.paused
    ? `
      <div class="tf-banner paused">
        <div class="tf-banner-left">
          <div class="tf-banner-icon">⏸️</div>
          <div>
            <div class="tf-banner-title">Shipment Paused</div>
            <div class="tf-banner-sub">
              ${escapeHtml(parcel.pauseMessage || "Temporarily on hold")}
            </div>
            ${
              parcel.pauseLocation
                ? `<div class="tf-mini">Paused at <b>${escapeHtml(parcel.pauseLocation)}</b></div>`
                : ""
            }
          </div>
        </div>
        <div class="tf-banner-chip">Paused</div>
      </div>
    `
    : "";

  const timeline = [...(parcel.timeline || [])].reverse();

  result.innerHTML = `
    <div class="tf-wrap">
      <div class="tf-card">
        <div class="tf-head">
          <div>
            <div class="tf-kicker">Tracking ID</div>
            <div class="tf-id">${id}</div>
          </div>
          <div class="tf-head-right">
            <span class="tf-badge ${
              delivered ? "success" : parcel.paused ? "warning" : "info"
            }">
              ${iconForStatus(parcel.status)} ${status}
            </span>
            <div class="tf-sub">Created: ${escapeHtml(created)}</div>
          </div>
        </div>

        ${pausedBanner}

        <div class="tf-route">
          <div class="tf-route-box">
            <div class="tf-mini">From</div>
            <div class="tf-route-main">${origin}</div>
          </div>
          <div class="tf-route-mid">
            <div class="tf-mini">Current</div>
            <div class="tf-loc-pill">${currentLoc}</div>
          </div>
          <div class="tf-route-box">
            <div class="tf-mini">To</div>
            <div class="tf-route-main">${destination}</div>
          </div>
        </div>

        <div class="tf-progress">
          <div class="tf-mini">Delivery progress</div>
          <div class="tf-bar">
            <div class="tf-fill" style="width:${progress}%"></div>
          </div>
        </div>

        <div class="tf-history">
          <div class="tf-section-title">Tracking history</div>
          ${
            timeline.length
              ? timeline
                  .map(
                    (t, i) => `
                <div class="tf-event ${i === 0 ? "latest" : ""}">
                  <div class="tf-event-dot"></div>
                  <div class="tf-event-card compact">
                    <div class="tf-event-top">
                      <div class="tf-event-status">
                        ${iconForStatus(t.status)} ${escapeHtml(t.status)}
                        ${i === 0 ? `<span class="tf-chip">Latest</span>` : ""}
                      </div>
                      <div class="tf-event-time">${fmtDate(t.time)}</div>
                    </div>
                    <div class="tf-event-loc">📍 ${escapeHtml(t.location)}</div>
                  </div>
                </div>
              `
                  )
                  .join("")
              : `<div class="tf-empty">No tracking history yet</div>`
          }
        </div>
      </div>
    </div>
  `;
}

// =====================
// ADMIN LOGIN
// =====================
// (Variables already declared at top)

adminTrigger?.addEventListener("click", (e) => {
  e.preventDefault(); // Prevent jump
  const token = localStorage.getItem("adminToken");
  if (token) window.location.href = "admin.html";
  else adminModal.style.display = "flex";
});

adminModal?.addEventListener("click", (e) => {
  if (e.target === adminModal) adminModal.style.display = "none";
});

adminLoginBtn?.addEventListener("click", loginAdmin);
[adminEmail, adminPassword].forEach((el) =>
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginAdmin();
  })
);

async function loginAdmin() {
  const email = adminEmail.value.trim();
  const password = adminPassword.value.trim();
  if (!email || !password) return;

  try {
    adminLoginBtn.disabled = true;
    const res = await fetch(`${BASE_URL}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.message);

    localStorage.setItem("adminToken", data.token);
    window.location.href = "admin.html";
  } catch (err) {
    console.error("Login Error:", err);
    showToast?.(err.message || "Login failed", "error");
  } finally {
    adminLoginBtn.disabled = false;
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

// =====================
// MISSING HELPERS
// =====================

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showLoader() {
  if (loader) loader.style.display = "block";
}

function hideLoader() {
  if (loader) loader.style.display = "none";
}

function showResult() {
  if (result) result.style.display = "block";
}

function hideResult() {
  if (result) {
    result.style.display = "none";
    result.innerHTML = "";
  }
}

function iconForStatus(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("delivered")) return "✅";
  if (s.includes("transit")) return "🚚";
  if (s.includes("dispatch")) return "📦";
  if (s.includes("processing")) return "⚙️";
  return "📍";
}

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString();
}

function getCurrentLocation(parcel) {
  if (parcel.timeline && parcel.timeline.length > 0) {
    return parcel.timeline[parcel.timeline.length - 1].location;
  }
  return parcel.origin;
}

function isDelivered(status) {
  return (status || "").toLowerCase() === "delivered";
}

function getProgress(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("received")) return 20;
  if (s.includes("processing")) return 40;
  if (s.includes("dispatch")) return 60;
  if (s.includes("transit")) return 80;
  if (s.includes("delivered")) return 100;
  return 10;
}


// (No globe init)


