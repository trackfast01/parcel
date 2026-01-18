// toast.js
(function () {
  function ensureRoot() {
    let root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      document.body.appendChild(root);
    }
    return root;
  }

  // title optional, type: "success" | "error" | "warning" | "info"
  window.showToast = function (
    message,
    type = "info",
    title = "",
    duration = 3200
  ) {
    const root = ensureRoot();

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    toast.innerHTML = `
      <div class="bar"></div>
      <div class="content">
        ${title ? `<strong>${title}</strong>` : ""}
        <span>${message}</span>
      </div>
    `;

    root.appendChild(toast);

    const timer = setTimeout(() => {
      toast.style.animation = "toastOut 0.2s ease-in forwards";
      setTimeout(() => toast.remove(), 220);
    }, duration);

    // click to dismiss
    toast.addEventListener("click", () => {
      clearTimeout(timer);
      toast.style.animation = "toastOut 0.2s ease-in forwards";
      setTimeout(() => toast.remove(), 220);
    });
  };
})();
