console.log("capture.ts 已加载");
const canvas = document.getElementById("capture-canvas");
const ctx = canvas.getContext("2d");
const tipEl = document.getElementById("capture-tip");
let backgroundImage = null;
let scaleFactor = 1;
let isSelecting = false;
let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
function setCanvasSize(width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}
function onContextMenu(e) {
  console.log("触发 contextmenu 事件，关闭截图窗口");
  e.preventDefault();
  window.close();
}
function onDocumentMouseDown(e) {
  console.log("触发文档 mousedown 事件，按键：", e.button);
  if (e.button === 2) {
    e.preventDefault();
    window.close();
  }
}
document.addEventListener("contextmenu", onContextMenu);
document.addEventListener("mousedown", onDocumentMouseDown, { capture: true });
function getSelectionRect() {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  return { x, y, width, height };
}
function draw() {
  if (!backgroundImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
  if (isSelecting) {
    const { x, y, width, height } = getSelectionRect();
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(x, y, width, height);
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
    ctx.restore();
    if (tipEl) {
      tipEl.textContent = `区域：${Math.round(width)} × ${Math.round(height)}（Esc/右键取消）`;
    }
  }
  requestAnimationFrame(draw);
}
function setBackground(dataUrl, displaySize, displayScaleFactor) {
  scaleFactor = typeof displayScaleFactor === "number" && Number.isFinite(displayScaleFactor) ? displayScaleFactor : 1;
  const width = displaySize && typeof displaySize.width === "number" && Number.isFinite(displaySize.width) ? displaySize.width : window.innerWidth;
  const height = displaySize && typeof displaySize.height === "number" && Number.isFinite(displaySize.height) ? displaySize.height : window.innerHeight;
  setCanvasSize(width, height);
  backgroundImage = new Image();
  backgroundImage.src = dataUrl;
  backgroundImage.onload = onBackgroundLoaded;
}
function onBackgroundLoaded() {
  if (tipEl) {
    tipEl.textContent = "按住左键拖动选择区域，松开完成截图，Esc/右键取消";
  }
  draw();
}
function finishSelection() {
  if (!backgroundImage) {
    window.close();
    return;
  }
  const { x, y, width, height } = getSelectionRect();
  if (width < 5 || height < 5) {
    window.close();
    return;
  }
  const sx = Math.round(x * scaleFactor);
  const sy = Math.round(y * scaleFactor);
  const sw = Math.round(width * scaleFactor);
  const sh = Math.round(height * scaleFactor);
  const output = document.createElement("canvas");
  output.width = sw;
  output.height = sh;
  const octx = output.getContext("2d");
  octx.drawImage(backgroundImage, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = output.toDataURL("image/png");
  window.captureApi.saveImageToClipboard(dataUrl);
  window.captureApi.saveImage(dataUrl).catch((err) => {
    console.error("save image failed", err);
  });
  window.close();
}
let activeInput = null;
let activePointerId = null;
let isGlobalPointerListening = false;
let isGlobalMouseListening = false;
function attachGlobalMouseListeners() {
  if (isGlobalMouseListening) return;
  isGlobalMouseListening = true;
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}
function detachGlobalMouseListeners() {
  if (!isGlobalMouseListening) return;
  isGlobalMouseListening = false;
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
}
function attachGlobalPointerListeners() {
  if (isGlobalPointerListening) return;
  isGlobalPointerListening = true;
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp, { passive: false });
  window.addEventListener("pointercancel", onPointerCancel, { passive: false });
}
function detachGlobalPointerListeners() {
  if (!isGlobalPointerListening) return;
  isGlobalPointerListening = false;
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerCancel);
}
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width ? canvas.width / rect.width : 1;
  const scaleY = rect.height ? canvas.height / rect.height : 1;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const clampedX = Math.max(0, Math.min(canvas.width, x));
  const clampedY = Math.max(0, Math.min(canvas.height, y));
  return { x: clampedX, y: clampedY };
}
function onMouseDown(event) {
  console.log("触发画布 mouse 按下事件，按键：", event.button, "位置：", event.clientX, event.clientY);
  if (activeInput === "pointer") return;
  if (event.button === 2) {
    window.close();
    return;
  }
  if (event.button !== 0) return;
  event.preventDefault();
  activeInput = "mouse";
  isSelecting = true;
  attachGlobalMouseListeners();
  const p = getCanvasPoint(event);
  startX = p.x;
  startY = p.y;
  currentX = startX;
  currentY = startY;
}
function onMouseMove(event) {
  console.log("触发画布 mouse 移动事件，位置：", event.clientX, event.clientY);
  if (activeInput !== "mouse") return;
  if (!isSelecting) return;
  const p = getCanvasPoint(event);
  currentX = p.x;
  currentY = p.y;
}
function onMouseUp(_event) {
  console.log("触发画布 mouse 抬起事件，结束框选");
  if (activeInput !== "mouse") return;
  endSelection();
}
function onPointerDown(event) {
  console.log("触发画布 pointer 按下事件，按键：", event.button, "位置：", event.clientX, event.clientY);
  if (event.button === 2) {
    window.close();
    return;
  }
  if (event.button !== 0) return;
  event.preventDefault();
  activeInput = "pointer";
  activePointerId = event.pointerId;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
  }
  isSelecting = true;
  attachGlobalPointerListeners();
  const p = getCanvasPoint(event);
  startX = p.x;
  startY = p.y;
  currentX = startX;
  currentY = startY;
}
function onPointerMove(event) {
  console.log("触发画布 pointer 移动事件，位置：", event.clientX, event.clientY);
  if (activeInput !== "pointer") return;
  if (!isSelecting) return;
  if (activePointerId !== null && event.pointerId !== activePointerId) return;
  event.preventDefault();
  const p = getCanvasPoint(event);
  currentX = p.x;
  currentY = p.y;
}
function endSelection() {
  if (!isSelecting) return;
  isSelecting = false;
  activeInput = null;
  activePointerId = null;
  detachGlobalPointerListeners();
  detachGlobalMouseListeners();
  finishSelection();
}
function onPointerUp(event) {
  console.log("触发画布 pointer 抬起事件");
  if (activeInput !== "pointer") return;
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
    }
  }
  endSelection();
}
function onPointerCancel(event) {
  console.log("触发画布 pointer 取消事件，关闭截图窗口");
  if (activeInput !== "pointer") return;
  if (activePointerId !== null && event.pointerId === activePointerId) {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
    }
  }
  detachGlobalPointerListeners();
  activeInput = null;
  detachGlobalMouseListeners();
  window.close();
}
canvas.addEventListener("mousedown", onMouseDown);
canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
function onKeyDown(event) {
  console.log("触发键盘按下事件，按键：", event.key);
  if (event.key === "Escape") {
    window.close();
  }
}
window.addEventListener("keydown", onKeyDown);
function onWindowLoad() {
  console.log("触发窗口 load 事件，窗口获取焦点");
  window.focus();
}
window.addEventListener("load", onWindowLoad);
function onWindowResize() {
  console.log("触发窗口 resize 事件，新尺寸：", window.innerWidth, window.innerHeight);
  setCanvasSize(window.innerWidth, window.innerHeight);
}
window.addEventListener("resize", onWindowResize);
function onCaptureSetBackground(payload) {
  console.log("收到主进程下发截图背景数据事件，payload：", payload);
  if (!payload || typeof payload !== "object") return;
  const { dataUrl, displaySize, scaleFactor: displayScaleFactor } = payload;
  if (typeof dataUrl !== "string" || !displaySize) return;
  setBackground(dataUrl, displaySize, displayScaleFactor);
}
window.captureApi.onSetBackground(onCaptureSetBackground);
