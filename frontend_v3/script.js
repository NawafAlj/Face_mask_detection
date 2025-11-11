// ========================
// 🎥 Element References
// ========================
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const uploadBtn = document.getElementById("uploadImage");
const detectBtn = document.getElementById("detectMask");
const fileInput = document.getElementById("fileInput");
const logPanel = document.getElementById("logPanel");
const muteAlert = document.getElementById("muteAlert");

const statWith = document.getElementById("statWith");
const statNo = document.getElementById("statNo");
const statIncorrect = document.getElementById("statIncorrect");
const statTotal = document.getElementById("statTotal");

const summaryList = document.getElementById("summaryList");
const exportBtn = document.getElementById("exportCsv");

const modelNameEl = document.getElementById("modelName");
const uptimeEl = document.getElementById("uptime");
const cpuEl = document.getElementById("cpuUsage");
const ramEl = document.getElementById("ramUsage");

const API_URL = "http://127.0.0.1:8000/detect/";
const STATUS_URL = "http://127.0.0.1:8000/status";

let liveRunning = false;
let detectionHistory = []; // for CSV export

// ========================
// 🧾 Logging Helper
// ========================
function log(message, type = "info") {
  const p = document.createElement("p");
  p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  p.style.color = type === "error" ? "#ff4444" : "#00c851";
  logPanel.appendChild(p);
  logPanel.scrollTop = logPanel.scrollHeight;
}

// ========================
// 🧠 Update summary list
// ========================
function updateSummary(detections) {
  summaryList.innerHTML = "";
  if (!detections || detections.length === 0) {
    summaryList.innerHTML = "<li>No detections.</li>";
    return;
  }
  detections.forEach(det => {
    const li = document.createElement("li");
    li.textContent = `${det.label} — ${(det.confidence * 100).toFixed(1)}%`;
    summaryList.appendChild(li);
  });
}

// ========================
// 📊 Update stat cards
// ========================
function bumpStats(detections) {
  let withMask = 0, noMask = 0, incorrect = 0;
  detections.forEach(det => {
    const label = det.label.toLowerCase();
    if (label.includes("no") || label.includes("without")) noMask++;
    else if (label.includes("incorrect") || label.includes("improper")) incorrect++;
    else if (label.includes("mask") || label.includes("with")) withMask++;
  });

  statWith.textContent = Number(statWith.textContent) + withMask;
  statNo.textContent = Number(statNo.textContent) + noMask;
  statIncorrect.textContent = Number(statIncorrect.textContent) + incorrect;
  statTotal.textContent = Number(statTotal.textContent) + detections.length;
}

// ========================
// 🧠 Draw Detections (Uploaded Image)
// ========================
function drawDetections(detections) {
  const ctx = canvas.getContext("2d");
  const img = document.getElementById("uploadedImage");

  canvas.width = img.clientWidth;
  canvas.height = img.clientHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  detections.forEach(det => {
    const [x1, y1, x2, y2] = det.bbox;
    const scaleX = canvas.width / img.naturalWidth;
    const scaleY = canvas.height / img.naturalHeight;

    const x = x1 * scaleX;
    const y = y1 * scaleY;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;

    let color = "#4C6FFF";
    const label = det.label.toLowerCase();

    if (label.includes("no") || label.includes("without")) color = "#ff5f73";      // 🔴 No mask
    else if (label.includes("incorrect") || label.includes("improper")) color = "#ff9f43"; // 🟠 Incorrect
    else if (label.includes("mask") || label.includes("with")) color = "#00c851";  // 🟢 Wearing mask

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = color;
    ctx.font = "16px Inter";
    ctx.fillText(`${det.label} ${(det.confidence * 100).toFixed(0)}%`, x + 5, y - 8);
  });
}

// ========================
// 🎥 Draw Live Detections
// ========================
function drawLiveDetections(detections) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  detections.forEach(det => {
    const [x1, y1, x2, y2] = det.bbox;
    const label = det.label.toLowerCase();

    let color = "#4C6FFF";
    if (label.includes("no") || label.includes("without")) color = "#ff5f73";
    else if (label.includes("incorrect") || label.includes("improper")) color = "#ff9f43";
    else if (label.includes("mask") || label.includes("with")) color = "#00c851";

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    ctx.fillStyle = color;
    ctx.font = "14px Inter";
    ctx.fillText(`${det.label} ${(det.confidence * 100).toFixed(0)}%`, x1 + 5, y1 - 8);
  });
}

// ========================
// 🎥 Camera Controls
// ========================
document.getElementById("startCamera").addEventListener("click", async () => {
  try {
    const oldStream = video.srcObject;
    if (oldStream) oldStream.getTracks().forEach(t => t.stop());

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.style.display = "block";
    document.getElementById("uploadedImage").style.display = "none";

    log("🎥 Camera started");
    startLiveDetection();
  } catch {
    log("❌ Camera access denied", "error");
  }
});

document.getElementById("stopCamera").addEventListener("click", () => {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  stopLiveDetection();
  log("Camera stopped 🛑");
});

// ========================
// ⚡ Optimized Live Detection Loop
// ========================
async function startLiveDetection() {
  if (liveRunning) return;
  liveRunning = true;

  async function detectFrame() {
    if (!liveRunning || !video.srcObject) return;

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");
    const targetWidth = 320;
    const targetHeight = 240;
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;

    tempCtx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise(resolve =>
      tempCanvas.toBlob(resolve, "image/jpeg", 0.5)
    );

    const formData = new FormData();
    formData.append("file", blob, "frame.jpg");

    try {
      const response = await fetch(API_URL, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Backend error");
      const result = await response.json();

      if (result && Array.isArray(result.detections)) {
        const scaleX = videoWidth / targetWidth;
        const scaleY = videoHeight / targetHeight;

        const scaledDetections = result.detections.map(det => {
          const [x1, y1, x2, y2] = det.bbox;
          return {
            ...det,
            bbox: [x1 * scaleX, y1 * scaleY, x2 * scaleX, y2 * scaleY]
          };
        });

        canvas.width = videoWidth;
        canvas.height = videoHeight;
        drawLiveDetections(scaledDetections);
        updateSummary(scaledDetections);
        bumpStats(scaledDetections);

        // push to history
        detectionHistory.push({
          time: new Date().toISOString(),
          count: scaledDetections.length,
          labels: scaledDetections.map(d => d.label).join(", ")
        });
      }
    } catch (err) {
      console.error("Live detection error:", err);
    }

    if (liveRunning) requestAnimationFrame(detectFrame);
  }

  detectFrame();
}

function stopLiveDetection() {
  liveRunning = false;
}

// ========================
// 🖼 Upload + Single Detection
// ========================
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const img = document.getElementById("uploadedImage");
  img.src = URL.createObjectURL(file);
  img.style.display = "block";
  video.style.display = "none";
  stopLiveDetection();
  log(`📤 Image uploaded: ${file.name}`);
});

detectBtn.addEventListener("click", async () => {
  const file = fileInput.files[0];
  if (!file) return log("⚠️ No file uploaded!", "error");

  if (!file.type.startsWith("image/")) {
    return log("❌ Only image files are supported for now!", "error");
  }

  const formData = new FormData();
  formData.append("file", file);

  log("🔍 Running detection...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) throw new Error("Backend error");
    const result = await response.json();

    log(`✅ Detection complete`);
    console.log(result);

    if (result && Array.isArray(result.detections) && result.detections.length > 0) {
      drawDetections(result.detections);
      updateSummary(result.detections);
      bumpStats(result.detections);

      detectionHistory.push({
        time: new Date().toISOString(),
        count: result.detections.length,
        labels: result.detections.map(d => d.label).join(", ")
      });
    } else {
      log("⚠️ No detections found");
    }
  } catch (err) {
    log(`❌ Detection failed: ${err.message}`, "error");
  }
});

// ========================
// 🔕 Mute Alerts
// ========================
muteAlert.addEventListener("click", () => {
  muteAlert.textContent = "🔇 Muted for 5 Minutes";
  muteAlert.style.background = "#555";
  log("Alerts muted for 5 minutes ⏱");

  setTimeout(() => {
    muteAlert.textContent = "🔕 Mute Alert (5 min)";
    muteAlert.style.background = "#ff5f73";
  }, 300000);
});

// ========================
// 🟣 System status polling
// ========================
async function pollStatus() {
  try {
    const res = await fetch(STATUS_URL);
    if (!res.ok) return;
    const data = await res.json();

    if (data.model_name) modelNameEl.textContent = "Model: " + data.model_name;
    if (data.uptime) uptimeEl.textContent = "Uptime: " + data.uptime;
    if (data.cpu) cpuEl.textContent = data.cpu.toFixed(1) + "%";
    if (data.ram) ramEl.textContent = data.ram.toFixed(1) + "%";
  } catch (err) {
    // ignore
  }
}
setInterval(pollStatus, 5000);
pollStatus();

// ========================
// 📥 Export detection history
// ========================
exportBtn.addEventListener("click", () => {
  if (detectionHistory.length === 0) {
    log("No detections to export.");
    return;
  }

  const header = "time,count,labels\n";
  const rows = detectionHistory
    .map(r => `${r.time},${r.count},"${r.labels}"`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "detection_history.csv";
  a.click();
  URL.revokeObjectURL(url);

  log("📁 CSV exported.");
});
