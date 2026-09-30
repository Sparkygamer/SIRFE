/**
 * SIRFE Frontend
 * Comunica con el backend Flask vía API REST.
 * Comparación facial con face-api.js · Mapa con Leaflet
 */

const API_BASE = "";

let modelsLoaded = false;
let currentCameraTarget = null;
let stream = null;
let regPhotoData = null;
let verAdultPhotoData = null;
let authToken = null;
let mapInstance = null;
let mapInitialized = false;

// Imagen de referencia abstracta (silueta)
const PLACEHOLDER_FACE =
  "data:image/svg+xml;base64," +
  btoa(`
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect fill="#c5d4e8" width="200" height="200"/>
    <circle cx="100" cy="75" r="40" fill="#8aa4c8"/>
    <ellipse cx="100" cy="160" rx="55" ry="45" fill="#8aa4c8"/>
  </svg>
`);

// Centros de acopio con coordenadas (zona de ejemplo: Ciudad de México)
const CENTROS = [
  {
    name: 'Centro Temporal “Esperanza” – Zona Norte',
    lat: 19.4970,
    lng: -99.1465,
    color: "#0d4f8b",
    desc: "Zona Norte · Capacidad media"
  },
  {
    name: 'Refugio Municipal “Unidos” – Zona Centro',
    lat: 19.4326,
    lng: -99.1332,
    color: "#0a7c5a",
    desc: "Zona Centro · Capacidad alta"
  },
  {
    name: "Puesto de Avanzada Cruz Roja – Sector Este",
    lat: 19.4285,
    lng: -99.0670,
    color: "#c47a00",
    desc: "Sector Este · Puesto de avanzada"
  },
  {
    name: 'Escuela Temporal “Nuevo Amanecer”',
    lat: 19.3910,
    lng: -99.1620,
    color: "#5a6a7a",
    desc: "Zona Sur-Oeste · Espacio escolar adaptado"
  }
];

// ========== API ==========
async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...options.headers,
  };
  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}`);
  }
  return data;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ========== NAVIGATION ==========
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelectorAll("#mainNav button[data-screen]").forEach((b) => {
    b.classList.toggle("active", b.dataset.screen === id);
  });

  if (id === "dashboard") renderDashboard();
  if (id === "verify") populateMinorSelect();
  if (id === "settings") refreshSettingsStatus();
  if (id === "map") initMap();
}

function initNavigation() {
  document.getElementById("btnLogin").addEventListener("click", async () => {
    const status = document.getElementById("loginStatus");
    status.innerHTML = '<span class="dot loading"></span> Autenticando…';

    try {
      const res = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("loginUser").value,
          password: "operador",
        }),
      });
      authToken = res.token;
      document.getElementById("login").classList.remove("active");
      document.getElementById("mainNav").style.display = "flex";
      showScreen("dashboard");
      loadModels();
    } catch (err) {
      status.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error de conexión con el servidor. ¿Está corriendo el backend?';
      console.error(err);
    }
  });

  document.getElementById("btnLogout").addEventListener("click", () => {
    authToken = null;
    document.getElementById("mainNav").style.display = "none";
    showScreen("login");
  });

  document.querySelectorAll("#mainNav button[data-screen]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(btn.dataset.screen));
  });
}

// ========== FACE-API ==========
async function loadModels() {
  if (modelsLoaded) return;

  const status = document.getElementById("verStatus");
  status.innerHTML =
    '<span class="dot loading"></span> Cargando modelos de reconocimiento facial…';

  try {
    const MODEL_URL =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    status.innerHTML =
      '<span class="dot"></span> Modelos de reconocimiento facial listos';
    updateCompareButton();
  } catch (e) {
    console.error(e);
    status.innerHTML =
      '<span class="dot" style="background:var(--danger)"></span> Error al cargar modelos de reconocimiento facial.';
  }
}

// ========== CAMERA ==========
async function openCamera(target) {
  currentCameraTarget = target;
  const overlay = document.getElementById("cameraOverlay");
  const video = document.getElementById("cameraVideo");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    overlay.classList.add("show");
  } catch (err) {
    alert("No se pudo acceder a la cámara. Use la imagen de referencia.");
    console.error(err);
  }
}

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  document.getElementById("cameraOverlay").classList.remove("show");
  document.getElementById("cameraVideo").srcObject = null;
}

function initCamera() {
  document.getElementById("btnCapture").addEventListener("click", () => {
    const video = document.getElementById("cameraVideo");
    const canvas = document.getElementById("cameraCanvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    closeCamera();

    if (currentCameraTarget === "reg") {
      setRegPhoto(dataUrl);
    } else if (currentCameraTarget === "ver") {
      setVerAdultPhoto(dataUrl);
    }
  });

  document.getElementById("btnCancelCam").addEventListener("click", closeCamera);
}

// ========== REGISTER ==========
function setRegPhoto(dataUrl) {
  regPhotoData = dataUrl;
  const preview = document.getElementById("regPhotoPreview");
  preview.classList.remove("placeholder");
  preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = "photo-preview";
  img.alt = "Foto del menor";
  preview.appendChild(img);
}

function clearRegForm() {
  document.getElementById("regName").value = "";
  document.getElementById("regAge").value = "";
  document.getElementById("regFamily").value = "";
  document.getElementById("regNotes").value = "";
  regPhotoData = null;
  const preview = document.getElementById("regPhotoPreview");
  preview.className = "photo-preview placeholder";
  preview.innerHTML = "Sin foto";
  document.getElementById("regStatus").innerHTML = "";
}

function initRegister() {
  document
    .getElementById("btnRegCamera")
    .addEventListener("click", () => openCamera("reg"));
  document
    .getElementById("btnRegPlaceholder")
    .addEventListener("click", () => setRegPhoto(PLACEHOLDER_FACE));
  document.getElementById("btnClearReg").addEventListener("click", clearRegForm);

  document.getElementById("btnSaveMinor").addEventListener("click", async () => {
    const name = document.getElementById("regName").value.trim();
    const age = document.getElementById("regAge").value;

    if (!name || !age) {
      alert("Complete al menos nombre y edad.");
      return;
    }
    if (!regPhotoData) {
      alert("Capture o seleccione una fotografía.");
      return;
    }

    const statusEl = document.getElementById("regStatus");
    statusEl.innerHTML =
      '<span class="dot loading"></span> Enviando al servidor…';

    try {
      const res = await api("/api/minors", {
        method: "POST",
        body: JSON.stringify({
          name,
          age: parseInt(age, 10),
          sex: document.getElementById("regSex").value,
          center: document.getElementById("regCenter").value,
          family: document.getElementById("regFamily").value.trim(),
          notes: document.getElementById("regNotes").value.trim(),
          photo: regPhotoData,
        }),
      });

      statusEl.innerHTML = `<span class="dot"></span> Menor <strong>${escapeHtml(
        name
      )}</strong> registrado (ID: ${res.id})`;
      clearRegForm();
      setTimeout(() => showScreen("dashboard"), 900);
    } catch (err) {
      statusEl.innerHTML = `<span class="dot" style="background:var(--danger)"></span> Error: ${err.message}`;
      console.error(err);
    }
  });
}

// ========== DASHBOARD ==========
async function renderDashboard() {
  const container = document.getElementById("dashboardContent");
  container.innerHTML =
    '<div class="empty"><span class="dot loading"></span> Cargando…</div>';

  try {
    const minors = await api("/api/minors");

    if (minors.length === 0) {
      container.innerHTML = `
        <div class="empty">
          <span>📋</span>
          No hay menores registrados aún.<br>
          Use el panel de “Registro de menor” para agregar un caso.
        </div>`;
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Foto</th>
            <th>ID</th>
            <th>Nombre</th>
            <th>Edad</th>
            <th>Centro de acopio</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>`;

    minors.forEach((m) => {
      const badge =
        m.status === "reunificado"
          ? '<span class="badge badge-reunified">Reunificado</span>'
          : '<span class="badge badge-pending">Pendiente</span>';

      html += `
        <tr>
          <td><img class="thumb" src="${m.photo || PLACEHOLDER_FACE}" alt=""></td>
          <td>${m.id}</td>
          <td>${escapeHtml(m.name)}</td>
          <td>${m.age}</td>
          <td>${escapeHtml(m.center || "")}</td>
          <td>${badge}</td>
          <td>
            ${
              m.status === "pendiente"
                ? `<button class="btn btn-outline" style="padding:4px 10px;font-size:0.8rem;" data-id="${m.id}">Marcar reunificado</button>`
                : "—"
            }
          </td>
        </tr>`;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    container.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/minors/${btn.dataset.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "reunificado" }),
          });
          renderDashboard();
        } catch (err) {
          alert("Error al actualizar estado: " + err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `
      <div class="empty">
        <span>⚠️</span>
        No se pudo conectar con el servidor.<br>
        Asegúrese de que el backend esté corriendo.
      </div>`;
    console.error(err);
  }
}

// ========== VERIFY ==========
async function populateMinorSelect() {
  const sel = document.getElementById("verifyMinorSelect");
  sel.innerHTML = '<option value="">— Cargando… —</option>';

  try {
    const minors = await api("/api/minors?status=pendiente");
    sel.innerHTML =
      '<option value="">— Seleccione un menor registrado —</option>';
    minors.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.age} años) — ${m.id}`;
      opt.dataset.photo = m.photo || "";
      sel.appendChild(opt);
    });
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar menores</option>';
    console.error(err);
  }

  document.getElementById("verMinorPhoto").style.display = "none";
  document.getElementById("verMinorPlaceholder").style.display = "flex";
  verAdultPhotoData = null;

  const ap = document.getElementById("verAdultPreview");
  ap.className = "photo-preview placeholder";
  ap.innerHTML = "Sin foto";

  document.getElementById("btnCompare").disabled = true;
  document
    .getElementById("compareResult")
    .classList.remove("show", "success", "fail");
}

function setVerAdultPhoto(dataUrl) {
  verAdultPhotoData = dataUrl;
  const preview = document.getElementById("verAdultPreview");
  preview.classList.remove("placeholder");
  preview.innerHTML = "";
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = "photo-preview";
  img.alt = "Foto del adulto";
  preview.appendChild(img);
  updateCompareButton();
}

function updateCompareButton() {
  const hasMinor = document.getElementById("verifyMinorSelect").value;
  document.getElementById("btnCompare").disabled = !(
    hasMinor &&
    verAdultPhotoData &&
    modelsLoaded
  );
}

function initVerify() {
  document
    .getElementById("verifyMinorSelect")
    .addEventListener("change", function () {
      const opt = this.options[this.selectedIndex];
      const img = document.getElementById("verMinorPhoto");
      const ph = document.getElementById("verMinorPlaceholder");

      if (opt && opt.value && opt.dataset.photo) {
        img.src = opt.dataset.photo;
        img.style.display = "block";
        ph.style.display = "none";
      } else {
        img.style.display = "none";
        ph.style.display = "flex";
      }
      updateCompareButton();
    });

  document
    .getElementById("btnVerCamera")
    .addEventListener("click", () => openCamera("ver"));

  document.getElementById("btnCompare").addEventListener("click", async () => {
    const resultBox = document.getElementById("compareResult");
    const status = document.getElementById("verStatus");
    resultBox.classList.remove("show", "success", "fail");
    status.innerHTML =
      '<span class="dot loading"></span> Analizando rostros…';

    const minorId = document.getElementById("verifyMinorSelect").value;
    const selectedOpt =
      document.getElementById("verifyMinorSelect").selectedOptions[0];
    const minorPhoto = selectedOpt ? selectedOpt.dataset.photo : null;

    if (!minorId || !verAdultPhotoData || !minorPhoto) return;

    try {
      const img1 = await faceapi.fetchImage(minorPhoto);
      const img2 = await faceapi.fetchImage(verAdultPhotoData);

      const det1 = await faceapi
        .detectSingleFace(img1)
        .withFaceLandmarks()
        .withFaceDescriptor();
      const det2 = await faceapi
        .detectSingleFace(img2)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det1 || !det2) {
        status.innerHTML =
          '<span class="dot" style="background:var(--danger)"></span> No se detectó un rostro claro en una de las imágenes.';
        resultBox.classList.add("show", "fail");
        document.getElementById("resultTitle").textContent =
          "No se pudo completar la comparación";
        document.getElementById("resultPct").textContent = "—";
        document.getElementById("resultMsg").textContent =
          "Asegúrese de que ambas fotos muestren un rostro frontal bien iluminado. Se recomienda revisión manual.";
        return;
      }

      const distance = faceapi.euclideanDistance(
        det1.descriptor,
        det2.descriptor
      );
      let similarity = Math.max(0, Math.min(100, (1 - distance) * 100));
      if (distance < 0.4) similarity = Math.min(100, similarity + 5);

      const pct = Math.round(similarity);
      const passed = distance < 0.55;

      resultBox.classList.add("show", passed ? "success" : "fail");
      document.getElementById("resultTitle").textContent = passed
        ? "✓ Verificación superada"
        : "✗ Verificación fallida — requiere revisión manual";
      document.getElementById("resultPct").textContent = pct + "%";
      document.getElementById("resultMsg").textContent = passed
        ? `Similitud facial estimada: ${pct}%. Resultado registrado en el sistema.`
        : `Similitud facial estimada: ${pct}%. Distancia euclidiana: ${distance.toFixed(
            3
          )}. Se recomienda verificación manual.`;

      status.innerHTML =
        '<span class="dot"></span> Comparación finalizada · Resultado enviado al servidor';

      try {
        await api("/api/verify", {
          method: "POST",
          body: JSON.stringify({
            minor_id: minorId,
            similarity: pct,
            passed,
            adult_name: document.getElementById("verAdultName").value.trim(),
          }),
        });
      } catch (e) {
        console.warn("No se pudo registrar la verificación:", e);
      }
    } catch (err) {
      console.error(err);
      status.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error durante la comparación.';
      resultBox.classList.add("show", "fail");
      document.getElementById("resultTitle").textContent = "Error técnico";
      document.getElementById("resultPct").textContent = "—";
      document.getElementById("resultMsg").textContent =
        "No se pudo procesar las imágenes. Intente con fotos más claras.";
    }
  });
}

// ========== MAPA ==========
function initMap() {
  if (mapInitialized && mapInstance) {
    setTimeout(() => mapInstance.invalidateSize(), 100);
    return;
  }

  const container = document.getElementById("mapContainer");
  if (!container) return;

  mapInstance = L.map("mapContainer").setView([19.4326, -99.1332], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapInstance);

  const legendEl = document.getElementById("mapLegend");
  legendEl.innerHTML = "";

  CENTROS.forEach((c) => {
    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:${c.color};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
      "></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    L.marker([c.lat, c.lng], { icon })
      .addTo(mapInstance)
      .bindPopup(`<strong>${c.name}</strong><br>${c.desc}`);

    legendEl.innerHTML += `
      <div class="map-legend-item">
        <span class="map-legend-dot" style="background:${c.color}"></span>
        <span>${c.name}</span>
      </div>`;
  });

  mapInitialized = true;
  setTimeout(() => mapInstance.invalidateSize(), 200);
}

// ========== SETTINGS ==========
async function refreshSettingsStatus() {
  const el = document.getElementById("settingsDbStatus");
  el.innerHTML = '<span class="dot loading"></span> Consultando…';
  try {
    const minors = await api("/api/minors");
    el.innerHTML = `<span class="dot"></span> Hay <strong>${minors.length}</strong> menor(es) registrado(s) en el sistema.`;
  } catch (err) {
    el.innerHTML =
      '<span class="dot" style="background:var(--danger)"></span> No se pudo conectar con el servidor.';
  }
}

function initSettings() {
  document.getElementById("btnClearAll").addEventListener("click", async () => {
    const confirmed = confirm(
      "¿Está seguro de que desea BORRAR TODOS los datos?\n\nSe eliminarán todos los menores registrados y sus fotografías.\nEsta acción no se puede deshacer."
    );
    if (!confirmed) return;

    const status = document.getElementById("clearStatus");
    status.innerHTML = '<span class="dot loading"></span> Eliminando datos…';

    try {
      const res = await api("/api/admin/clear", { method: "DELETE" });
      status.innerHTML = `<span class="dot"></span> ${res.message}`;
      refreshSettingsStatus();
    } catch (err) {
      status.innerHTML = `<span class="dot" style="background:var(--danger)"></span> Error: ${err.message}`;
      console.error(err);
    }
  });
}

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initCamera();
  initRegister();
  initVerify();
  initSettings();
});