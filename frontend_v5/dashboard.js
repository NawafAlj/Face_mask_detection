// ========================
// CONFIG
// ========================
const API_BASE_URL = "http://127.0.0.1:8000";
const DETECT_URL = `${API_BASE_URL}/detect/`;
const STATUS_URL = `${API_BASE_URL}/status`;
const SUMMARY_URL = `${API_BASE_URL}/summary`;
const EXPORT_URL = `${API_BASE_URL}/export`;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const imgEl = document.getElementById("uploadedImage");
const imageInput = document.getElementById("imageInput");
const startLiveBtn = document.getElementById("startLiveBtn");
const stopLiveBtn = document.getElementById("stopLiveBtn");

let liveLoop = false;
let videoStream = null;
let detectionChart = null;

// ========================
// DARK MODE TOGGLE
// ========================
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
  });
}

// ========================
// TAB SWITCHING
// ========================
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-tab`).classList.add("active");
  });
});

// ========================
// DRAW DETECTIONS
// ========================
function drawDetections(detections, target = "image", scaleFix = null) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isLive = target === "live";
  const refWidth = isLive ? video.videoWidth : imgEl.naturalWidth;
  const refHeight = isLive ? video.videoHeight : imgEl.naturalHeight;

  const displayWidth = isLive ? video.clientWidth : imgEl.clientWidth;
  const displayHeight = isLive ? video.clientHeight : imgEl.clientHeight;

  canvas.width = displayWidth;
  canvas.height = displayHeight;

  const scaleX = scaleFix ? scaleFix.x : displayWidth / refWidth;
  const scaleY = scaleFix ? scaleFix.y : displayHeight / refHeight;

  detections.forEach((d) => {
    const [x1, y1, x2, y2] = d.bbox;
    const x = x1 * scaleX;
    const y = y1 * scaleY;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;

    let color = "#00c851";
    const label = d.label.toLowerCase();
    if (label.includes("no") || label.includes("without")) color = "#ff4444";
    else if (label.includes("incorrect")) color = "#ffbb33";

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.font = "14px Inter";
    ctx.fillText(`${d.label} ${(d.confidence * 100).toFixed(0)}%`, x + 5, y - 8);
  });
}

// ========================
// IMAGE DETECTION
// ========================
if (imageInput) {
  imageInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const imgURL = URL.createObjectURL(file);
    imgEl.src = imgURL;
    imgEl.style.display = "block";
    video.style.display = "none";

    await new Promise((resolve) => (imgEl.onload = resolve));

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(DETECT_URL, { method: "POST", body: fd });
      const data = await res.json();
      if (data.detections && data.detections.length > 0) {
        drawDetections(data.detections, "image");
        addToFeed(`🖼️ Image detection complete — ${data.detections.length} detected.`);
      } else {
        addToFeed("🖼️ No detections found in image.");
      }
    } catch (err) {
      console.error("Detection failed:", err);
      addToFeed("⚠️ Image detection failed.");
    }
  });
}

// ========================
// LIVE CAMERA DETECTION
// ========================
if (startLiveBtn) {
  startLiveBtn.addEventListener("click", async () => {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = videoStream;
      video.style.display = "block";
      imgEl.style.display = "none";

      await new Promise((res) => (video.onloadedmetadata = res));
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;

      startLiveBtn.style.display = "none";
      stopLiveBtn.style.display = "block";

      liveLoop = true;
      detectLiveFrame();
      addToFeed("🎥 Live detection started.");
    } catch (err) {
      console.error("Camera access denied or unavailable:", err);
      addToFeed("❌ Cannot access camera.");
    }
  });
}

if (stopLiveBtn) {
  stopLiveBtn.addEventListener("click", () => {
    liveLoop = false;
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = null;
    }

    video.srcObject = null;
    video.style.display = "none";
    startLiveBtn.style.display = "block";
    stopLiveBtn.style.display = "none";

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    addToFeed("🛑 Live detection stopped.");
  });
}

async function detectLiveFrame() {
  if (!liveLoop) return;

  const off = document.createElement("canvas");
  off.width = 320;
  off.height = 240;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(video, 0, 0, off.width, off.height);

  const blob = await new Promise((r) => off.toBlob(r, "image/jpeg", 0.6));
  const fd = new FormData();
  fd.append("file", blob, "frame.jpg");

  try {
    const res = await fetch(DETECT_URL, { method: "POST", body: fd });
    const data = await res.json();
    if (data.detections) {
      const scaleX = canvas.width / off.width;
      const scaleY = canvas.height / off.height;
      drawDetections(data.detections, "live", { x: scaleX, y: scaleY });
    }
  } catch (e) {
    console.error("Live detect error:", e);
  }

  if (liveLoop) requestAnimationFrame(detectLiveFrame);
}

// ========================
// ACTIVITY FEED
// ========================
function addToFeed(text) {
  const feed = document.getElementById("activityFeed");
  if (!feed) return;
  const item = document.createElement("div");
  item.className = "activity-item";
  item.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  feed.prepend(item);
}

// ========================
// STATUS + SUMMARY + RISK
// ========================
async function updateStatus() {
  try {
    const res = await fetch(STATUS_URL);
    const data = await res.json();
    document.getElementById("cpuLoad").textContent = `${data.cpu}%`;
    document.getElementById("cpuBar").style.width = `${data.cpu}%`;
    document.getElementById("gpuLoad").textContent = `${data.ram}%`;
    document.getElementById("gpuBar").style.width = `${data.ram}%`;
  } catch {
    console.warn("status fetch failed");
  }
}

async function updateSummary() {
  try {
    const res = await fetch(SUMMARY_URL);
    const s = await res.json();

    // Update counts
    document.getElementById("withMaskCount").textContent = s.with_mask;
    document.getElementById("noMaskCount").textContent = s.no_mask;
    document.getElementById("incorrectCount").textContent = s.incorrect;

    // 🧠 Update Risk Score Panel
    const riskValue = document.getElementById("riskScoreValue");
    const riskLabel = document.getElementById("riskLabel");
    const score = s.risk_score ?? 0;

    riskValue.textContent = score.toFixed(0);

    if (score < 30) {
      riskValue.className = "risk-safe";
      riskLabel.textContent = "🟢 Safe";
    } else if (score < 60) {
      riskValue.className = "risk-medium";
      riskLabel.textContent = "🟡 Moderate";
    } else {
      riskValue.className = "risk-high";
      riskLabel.textContent = "🔴 High Risk!";
      addToFeed("⚠️ High risk detected — please notify ICU manager!");
      try {
        const audio = new Audio("alert.mp3");
        audio.play();
      } catch {}
    }

    updateDetectionChart(s);
  } catch {
    console.warn("summary fetch failed");
  }
}

// Polling loop
setInterval(() => {
  updateStatus();
  updateSummary();
}, 5000);

// ========================
// REAL-TIME CHART
// ========================
(function initDetectionChart() {
  const el = document.getElementById("detectionChart");
  if (!el) return;
  const ctx = el.getContext("2d");
  detectionChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "With Mask", data: [], borderColor: "#00c851", backgroundColor: "rgba(0,200,81,0.12)", tension: 0.35 },
        { label: "No Mask", data: [], borderColor: "#ff4444", backgroundColor: "rgba(255,68,68,0.12)", tension: 0.35 },
        { label: "Incorrect", data: [], borderColor: "#ffbb33", backgroundColor: "rgba(255,187,51,0.12)", tension: 0.35 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#ccc" } } },
      scales: {
        x: { ticks: { color: "#aaa" } },
        y: { beginAtZero: true, ticks: { color: "#aaa" } },
      },
    },
  });
})();

function updateDetectionChart(summary) {
  if (!detectionChart) return;
  const now = new Date().toLocaleTimeString();
  detectionChart.data.labels.push(now);
  detectionChart.data.datasets[0].data.push(summary.with_mask);
  detectionChart.data.datasets[1].data.push(summary.no_mask);
  detectionChart.data.datasets[2].data.push(summary.incorrect);
  if (detectionChart.data.labels.length > 20) {
    detectionChart.data.labels.shift();
    detectionChart.data.datasets.forEach((ds) => ds.data.shift());
  }
  detectionChart.update();
}

// ========================
// EXPORT
// ========================
document.getElementById("exportCsvBtn")?.addEventListener("click", async () => {
  try {
    const res = await fetch(EXPORT_URL);
    if (!res.ok) {
      addToFeed("⚠️ No detections to export.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "detection_log.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addToFeed("📁 CSV exported.");
  } catch (err) {
    console.error(err);
    addToFeed("⚠️ CSV export failed.");
  }
});

document.getElementById("exportPdfBtn")?.addEventListener("click", () => {
  addToFeed("ℹ️ PDF export not implemented yet.");
  alert("PDF export is not implemented yet on the API.");
});
