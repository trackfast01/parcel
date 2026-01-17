const BASE_URL = window.location.hostname.includes("localhost")
  ? "http://localhost:5000"
  : "https://trackfast.onrender.com";

const form = document.getElementById("parcelForm");
const submitBtn = form.querySelector("button[type='submit']");

function getToken() {
  return localStorage.getItem("adminToken");
}

async function safeJson(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json")
    ? res.json()
    : { message: await res.text() };
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  if (!token) window.location.replace("index.html");

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await safeJson(res);
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const payload = {
    sender: form.sender.value.trim(),
    receiver: form.receiver.value.trim(),
    contact: form.contact.value.trim(),
    description: form.description.value.trim(),
    origin: form.origin.value.trim(),
    destination: form.destination.value.trim(),
    status: form.status.value,
    estimated_delivery: form.estimated_delivery.value,
  };

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating...";

    const parcel = await apiFetch(`${BASE_URL}/api/parcels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    showToast(`Parcel created! ID: ${parcel.id}`, "success");
    form.reset();
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Create Parcel";
  }
});
