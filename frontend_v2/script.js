

// =============================================================
// ICU Mask Detection Dashboard JS
// =============================================================

const video = document.getElementById("video");
const uploadedImg = document.getElementById("uploadedImage");
const startBtn = document.getElementById("startCamera");
const stopBtn = document.getElementById("stopCamera");
const uploadBtn = document.getElementById("uploadImage");
const detectBtn = document.getElementById("detectMask");
const fileInput = document.getElementById("fileInput");
const muteBtn = document.getElementById("muteAlert");

const summaryList = document.getElementById("summaryList");
const logPanel = document.getElementById("logPanel");

const maskCountEl = document.getElementById("maskCount");
const incorrectCountEl = document.getElementById("incorrectCount");
const noMaskCountEl = document.getElementById("noMaskCount");
const totalCountEl = document.getElementById("totalCount");

const statWith = document.getElementById("statWith");
const statNo = document.getElementById("statNo");
const statIncorrect = document.getElementById("statIncorrect");
const statTotal = document.getElementById("statTotal");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let stream;
let detectionInterval;
let muteActive = false;

// -------------------- logger --------------------
function logEvent(message, type = "info") {
  const time = new Date().toLocaleTimeString();
  const p = document.createElement("p");
  p.textContent = `[${time}] ${message}`;
  if (type === "error") p.style.color = "red";
  if (type === "warning") p.style.color = "orange";
  if (type === "success") p.style.color = "green";
  logPanel.appendChild(p);
  logPanel.scrollTop = logPanel.scrollHeight;

  // sync to backend (optional)
  fetch("http://127.0.0.1:8000/log/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).catch(() => {});
}

// -------------------- start camera --------------------
startBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.style.display = "block";
    uploadedImg.style.display = "none";
    logEvent("Camera started ✅", "success");

    detectionInterval = setInterval(captureAndSendFrame, 1000);
  } catch (err) {
    logEvent("Error accessing camera ❌", "error");
  }
});

// -------------------- stop camera --------------------
stopBtn.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    clearInterval(detectionInterval);
    logEvent("Camera stopped 📴", "warning");
  }
});

// -------------------- upload --------------------
uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.style.display = "none";
  uploadedImg.style.display = "block";
  uploadedImg.src = url;
  logEvent(`Image loaded: ${file.name}`, "info");
  sendToBackend(file);
});

// -------------------- manual detect --------------------
detectBtn.addEventListener("click", async () => {
  if (video.srcObject) {
    captureAndSendFrame();
  } else if (uploadedImg.src) {
    const res = await fetch(uploadedImg.src);
    const blob = await res.blob();
    const file = new File([blob], "uploaded.jpg", { type: "image/jpeg" });
    sendToBackend(file);
  } else {
    logEvent("No image or camera stream found ❌", "error");
  }
});

// -------------------- capture frame --------------------
async function captureAndSendFrame() {
  if (!video.videoWidth || !video.videoHeight || muteActive) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg"));
  const file = new File([blob], "frame.jpg", { type: "image/jpeg" });
  sendToBackend(file);
}

// -------------------- send to backend --------------------
async function sendToBackend(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await fetch("http://127.0.0.1:8000/detect/", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    drawDetections(data.detections);
    updateSummary(data.detections);
    updateStats(data.detections);
  } catch (err) {
    logEvent("Backend error: failed to communicate ❌", "error");
  }
}

// -------------------- draw boxes --------------------
function drawDetections(detections) {
  const src = video.srcObject ? video : uploadedImg;
  if (!src) return;

  const originalWidth = src.videoWidth || src.naturalWidth;
  const originalHeight = src.videoHeight || src.naturalHeight;
  const displayWidth = src.clientWidth;
  const displayHeight = src.clientHeight;

  canvas.width = displayWidth;
  canvas.height = displayHeight;
  ctx.drawImage(src, 0, 0, displayWidth, displayHeight);
  ctx.lineWidth = 2;
  ctx.font = "14px Arial";

  const scaleX = displayWidth / originalWidth;
  const scaleY = displayHeight / originalHeight;

  detections.forEach((det) => {
    const [x1, y1, x2, y2] = det.bbox;
    const label = det.label.toLowerCase();

    // robust color logic
    let color = "lime";
    if (
      label.includes("no_mask") ||
      label.includes("without_mask") ||
      label.includes("no mask") ||
      label.includes("unmasked") ||
      label.includes("none")
    ) {
      color = "red";
    } else if (
      label.includes("incorrect") ||
      label.includes("improper") ||
      label.includes("partial") ||
      label.includes("wrong")
    ) {
      color = "orange";
    } else if (label.includes("mask") || label.includes("with") || label.includes("wearing")) {
      color = "lime";
    }

    const x = x1 * scaleX;
    const y = y1 * scaleY;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;

    ctx.strokeStyle = color;
    ctx.strokeRect(x, y, w, h);

    const text = `${det.label} (${(det.confidence * 100).toFixed(1)}%)`;
    const textWidth = ctx.measureText(text).width;
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 18, textWidth + 6, 20);
    ctx.fillStyle = "black";
    ctx.fillText(text, x + 3, y - 5);
  });
}

// -------------------- summary list --------------------
function updateSummary(detections) {
  summaryList.innerHTML = "";
  if (!detections || detections.length === 0) {
    summaryList.innerHTML = "<li>No mask violations detected 😷</li>";
    return;
  }
  detections.forEach((det) => {
    const li = document.createElement("li");
    li.textContent = `${det.label} — ${(det.confidence * 100).toFixed(1)}%`;
    summaryList.appendChild(li);
  });
}

// -------------------- stats & cards --------------------
function updateStats(detections) {
  let withMask = 0;
  let incorrect = 0;
  let noMask = 0;

  detections.forEach((det) => {
    const label = det.label.toLowerCase();
    if (
      label.includes("no_mask") ||
      label.includes("without_mask") ||
      label.includes("no mask") ||
      label.includes("unmasked") ||
      label.includes("none")
    ) {
      noMask++;
    } else if (
      label.includes("incorrect") ||
      label.includes("improper") ||
      label.includes("partial") ||
      label.includes("wrong")
    ) {
      incorrect++;
    } else {
      withMask++;
    }
  });

  const total = withMask + incorrect + noMask;

  maskCountEl.textContent = withMask;
  incorrectCountEl.textContent = incorrect;
  noMaskCountEl.textContent = noMask;
  totalCountEl.textContent = total;

  // top cards
  statWith.textContent = withMask;
  statNo.textContent = noMask;
  statIncorrect.textContent = incorrect;
  statTotal.textContent = total;
}

// -------------------- mute alert --------------------
muteBtn.addEventListener("click", async () => {
  if (muteActive) return;
  muteActive = true;
  muteBtn.classList.add("active");
  muteBtn.textContent = "Muted (5:00)";
  logEvent("Alerts muted for 5 minutes", "warning");

  await fetch("http://127.0.0.1:8000/mute/", { method: "POST" });

  let remaining = 300;
  const timer = setInterval(() => {
    remaining--;
    const min = Math.floor(remaining / 60);
    const sec = (remaining % 60).toString().padStart(2, "0");
    muteBtn.textContent = `Muted (${min}:${sec})`;
    if (remaining <= 0) {
      clearInterval(timer);
      muteActive = false;
      muteBtn.classList.remove("active");
      muteBtn.textContent = "🔕 Mute Alert for 5 Minutes";
      logEvent("Alerts re-enabled 🔔", "success");
    }
  }, 1000);
});
