/**
 * SIRFE Frontend
 * Comunica con el backend Flask via API REST.
 * Comparacion facial con face-api.js · Mapa con Leaflet
 */

const API_BASE = "";

let modelsLoaded = false;
let currentCameraTarget = null;
let stream = null;
let regPhotoData = null;
let verAdultPhotoData = null;
let adPhotoData = null;
let selectedAdultId = null;
let authToken = null;
let mapInstance = null;
let mapInitialized = false;

const PLACEHOLDER_FACE =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<rect fill="#c5d4e8" width="200" height="200"/>' +
      '<circle cx="100" cy="75" r="40" fill="#8aa4c8"/>' +
      '<ellipse cx="100" cy="160" rx="55" ry="45" fill="#8aa4c8"/>' +
      "</svg>"
  );

const CENTROS = [
  {
    name: "Centro Temporal Esperanza – Zona Norte",
    lat: 19.497,
    lng: -99.1465,
    color: "#0d4f8b",
    desc: "Zona Norte · Capacidad media",
  },
  {
    name: "Refugio Municipal Unidos – Zona Centro",
    lat: 19.4326,
    lng: -99.1332,
    color: "#0a7c5a",
    desc: "Zona Centro · Capacidad alta",
  },
  {
    name: "Puesto de Avanzada Cruz Roja – Sector Este",
    lat: 19.4285,
    lng: -99.067,
    color: "#c47a00",
    desc: "Sector Este · Puesto de avanzada",
  },
  {
    name: "Escuela Temporal Nuevo Amanecer",
    lat: 19.391,
    lng: -99.162,
    color: "#5a6a7a",
    desc: "Zona Sur-Oeste · Espacio escolar adaptado",
  },
];

async function api(path, options) {
  options = options || {};
  var headers = Object.assign(
    { "Content-Type": "application/json" },
    authToken ? { Authorization: "Bearer " + authToken } : {},
    options.headers || {}
  );
  var res = await fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
  var data = await res.json().catch(function () {
    return {};
  });
  if (!res.ok) {
    throw new Error(data.error || "Error " + res.status);
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

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function (s) {
    s.classList.remove("active");
  });
  document.getElementById(id).classList.add("active");

  document.querySelectorAll("#mainNav button[data-screen]").forEach(function (b) {
    b.classList.toggle("active", b.dataset.screen === id);
  });

  if (id === "dashboard") renderDashboard();
  if (id === "verify") {
    populateMinorSelect();
    populateAdultSelect();
  }
  if (id === "settings") refreshSettingsStatus();
  if (id === "map") initMap();
}

function initNavigation() {
  document.getElementById("btnLogin").addEventListener("click", async function () {
    var status = document.getElementById("loginStatus");
    status.innerHTML = '<span class="dot loading"></span> Autenticando…';

    try {
      var res = await api("/api/login", {
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
        '<span class="dot" style="background:var(--danger)"></span> Error de conexion con el servidor. Esta corriendo el backend?';
      console.error(err);
    }
  });

  document.getElementById("btnLogout").addEventListener("click", function () {
    authToken = null;
    document.getElementById("mainNav").style.display = "none";
    showScreen("login");
  });

  document.querySelectorAll("#mainNav button[data-screen]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      showScreen(btn.dataset.screen);
    });
  });
}

async function loadModels() {
  if (modelsLoaded) return;

  var status = document.getElementById("verStatus");
  if (status) {
    status.innerHTML =
      '<span class="dot loading"></span> Cargando modelos de reconocimiento facial…';
  }

  try {
    var MODEL_URL =
      "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    if (status) {
      status.innerHTML =
        '<span class="dot"></span> Modelos de reconocimiento facial listos';
    }
    updateCompareButton();
  } catch (e) {
    console.error(e);
    if (status) {
      status.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error al cargar modelos de reconocimiento facial.';
    }
  }
}

async function openCamera(target) {
  currentCameraTarget = target;
  var overlay = document.getElementById("cameraOverlay");
  var video = document.getElementById("cameraVideo");

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    video.srcObject = stream;
    overlay.classList.add("show");
  } catch (err) {
    alert("No se pudo acceder a la camara. Use la imagen de referencia.");
    console.error(err);
  }
}

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(function (t) {
      t.stop();
    });
    stream = null;
  }
  document.getElementById("cameraOverlay").classList.remove("show");
  document.getElementById("cameraVideo").srcObject = null;
}

function initCamera() {
  document.getElementById("btnCapture").addEventListener("click", function () {
    var video = document.getElementById("cameraVideo");
    var canvas = document.getElementById("cameraCanvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    closeCamera();

    if (currentCameraTarget === "reg") {
      setRegPhoto(dataUrl);
    } else if (currentCameraTarget === "ver") {
      setVerAdultPhoto(dataUrl);
    } else if (currentCameraTarget === "ad") {
      setAdPhoto(dataUrl);
    }
  });

  document.getElementById("btnCancelCam").addEventListener("click", closeCamera);
}

function setRegPhoto(dataUrl) {
  regPhotoData = dataUrl;
  var preview = document.getElementById("regPhotoPreview");
  preview.classList.remove("placeholder");
  preview.innerHTML = "";
  var img = document.createElement("img");
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
  var preview = document.getElementById("regPhotoPreview");
  preview.className = "photo-preview placeholder";
  preview.innerHTML = "Sin foto";
  document.getElementById("regStatus").innerHTML = "";
}

function initRegister() {
  document.getElementById("btnRegCamera").addEventListener("click", function () {
    openCamera("reg");
  });
  document.getElementById("btnRegPlaceholder").addEventListener("click", function () {
    setRegPhoto(PLACEHOLDER_FACE);
  });
  document.getElementById("btnClearReg").addEventListener("click", clearRegForm);

  document.getElementById("btnSaveMinor").addEventListener("click", async function () {
    var name = document.getElementById("regName").value.trim();
    var age = document.getElementById("regAge").value;

    if (!name || !age) {
      alert("Complete al menos nombre y edad.");
      return;
    }
    if (!regPhotoData) {
      alert("Capture o seleccione una fotografia.");
      return;
    }

    var statusEl = document.getElementById("regStatus");
    statusEl.innerHTML = '<span class="dot loading"></span> Enviando al servidor…';

    try {
      var res = await api("/api/minors", {
        method: "POST",
        body: JSON.stringify({
          name: name,
          age: parseInt(age, 10),
          sex: document.getElementById("regSex").value,
          center: document.getElementById("regCenter").value,
          family: document.getElementById("regFamily").value.trim(),
          notes: document.getElementById("regNotes").value.trim(),
          photo: regPhotoData,
        }),
      });

      statusEl.innerHTML =
        '<span class="dot"></span> Menor <strong>' +
        escapeHtml(name) +
        "</strong> registrado (ID: " +
        res.id +
        ")";
      clearRegForm();
      setTimeout(function () {
        showScreen("dashboard");
      }, 900);
    } catch (err) {
      statusEl.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error: ' +
        err.message;
      console.error(err);
    }
  });
}

async function renderDashboard() {
  var container = document.getElementById("dashboardContent");
  container.innerHTML =
    '<div class="empty"><span class="dot loading"></span> Cargando…</div>';

  try {
    var minors = await api("/api/minors");
    var html = "";

    if (minors.length === 0) {
      html =
        '<div class="empty"><span>📋</span>No hay menores registrados aun.<br>' +
        'Use el panel de Registro de menor para agregar un caso.</div>';
    } else {
      html =
        "<table><thead><tr>" +
        "<th>Foto</th><th>ID</th><th>Nombre</th><th>Edad</th>" +
        "<th>Centro de acopio</th><th>Estado</th><th>Accion</th>" +
        "</tr></thead><tbody>";

      minors.forEach(function (m) {
        var badge =
          m.status === "reunificado"
            ? '<span class="badge badge-reunified">Reunificado</span>'
            : '<span class="badge badge-pending">Pendiente</span>';
        var action =
          m.status === "pendiente"
            ? '<button class="btn btn-outline" style="padding:4px 10px;font-size:0.8rem;" data-id="' +
              m.id +
              '">Marcar reunificado</button>'
            : "—";
        html +=
          "<tr>" +
          '<td><img class="thumb" src="' +
          (m.photo || PLACEHOLDER_FACE) +
          '" alt=""></td>' +
          "<td>" +
          m.id +
          "</td>" +
          "<td>" +
          escapeHtml(m.name) +
          "</td>" +
          "<td>" +
          m.age +
          "</td>" +
          "<td>" +
          escapeHtml(m.center || "") +
          "</td>" +
          "<td>" +
          badge +
          "</td>" +
          "<td>" +
          action +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table>";
    }

    var adults = [];
    try {
      adults = await api("/api/adults");
    } catch (e) {
      adults = [];
    }

    if (adults.length > 0) {
      html +=
        '<h3 style="margin-top:28px;color:var(--primary);">Adultos registrados</h3>' +
        "<table><thead><tr>" +
        "<th>Foto</th><th>ID</th><th>Nombre</th><th>Busca a</th>" +
        "<th>Parentesco</th><th>Centro</th><th>Estado</th>" +
        "</tr></thead><tbody>";

      adults.forEach(function (a) {
        var badge =
          a.status === "reunificado"
            ? '<span class="badge badge-reunified">Reunificado</span>'
            : '<span class="badge badge-pending">Buscando</span>';
        html +=
          "<tr>" +
          '<td><img class="thumb" src="' +
          (a.photo || PLACEHOLDER_FACE) +
          '" alt=""></td>' +
          "<td>" +
          a.id +
          "</td>" +
          "<td>" +
          escapeHtml(a.name) +
          "</td>" +
          "<td>" +
          escapeHtml(a.child_name_sought || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(a.relation_sought || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(a.center || "") +
          "</td>" +
          "<td>" +
          badge +
          "</td>" +
          "</tr>";
      });
      html += "</tbody></table>";
    }

    container.innerHTML = html;

    container.querySelectorAll("button[data-id]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        try {
          await api("/api/minors/" + btn.dataset.id + "/status", {
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
    container.innerHTML =
      '<div class="empty"><span>⚠️</span>No se pudo conectar con el servidor.<br>' +
      "Asegurese de que el backend este corriendo.</div>";
    console.error(err);
  }
}

function setAdPhoto(dataUrl) {
  adPhotoData = dataUrl;
  var preview = document.getElementById("adPhotoPreview");
  if (!preview) return;
  preview.classList.remove("placeholder");
  preview.innerHTML = "";
  var img = document.createElement("img");
  img.src = dataUrl;
  img.className = "photo-preview";
  img.alt = "Foto del adulto";
  preview.appendChild(img);
}

function clearAdForm() {
  ["adName", "adDoc", "adPhone", "adChildSought", "adNotes"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = "";
  });
  adPhotoData = null;
  var preview = document.getElementById("adPhotoPreview");
  if (preview) {
    preview.className = "photo-preview placeholder";
    preview.innerHTML = "Sin foto";
  }
  var st = document.getElementById("adStatus");
  if (st) st.innerHTML = "";
}

function initRegisterAdult() {
  var cam = document.getElementById("btnAdCamera");
  var ph = document.getElementById("btnAdPlaceholder");
  var clearBtn = document.getElementById("btnClearAd");
  var save = document.getElementById("btnSaveAdult");
  if (!save) return;

  if (cam)
    cam.addEventListener("click", function () {
      openCamera("ad");
    });
  if (ph)
    ph.addEventListener("click", function () {
      setAdPhoto(PLACEHOLDER_FACE);
    });
  if (clearBtn) clearBtn.addEventListener("click", clearAdForm);

  save.addEventListener("click", async function () {
    var name = document.getElementById("adName").value.trim();
    if (!name) {
      alert("Complete al menos el nombre del adulto.");
      return;
    }
    if (!adPhotoData) {
      alert("Capture o seleccione una fotografia del adulto.");
      return;
    }

    var statusEl = document.getElementById("adStatus");
    statusEl.innerHTML = '<span class="dot loading"></span> Enviando al servidor…';

    try {
      var res = await api("/api/adults", {
        method: "POST",
        body: JSON.stringify({
          name: name,
          document_id: document.getElementById("adDoc").value.trim(),
          phone: document.getElementById("adPhone").value.trim(),
          relation_sought: document.getElementById("adRelation").value,
          child_name_sought: document.getElementById("adChildSought").value.trim(),
          center: document.getElementById("adCenter").value,
          notes: document.getElementById("adNotes").value.trim(),
          photo: adPhotoData,
        }),
      });

      statusEl.innerHTML =
        '<span class="dot"></span> Adulto <strong>' +
        escapeHtml(name) +
        "</strong> registrado (ID: " +
        res.id +
        ")";
      clearAdForm();
      setTimeout(function () {
        showScreen("dashboard");
      }, 900);
    } catch (err) {
      statusEl.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error: ' +
        err.message;
      console.error(err);
    }
  });
}

async function populateAdultSelect() {
  var sel = document.getElementById("verifyAdultSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">— Cargando… —</option>';
  try {
    var adults = await api("/api/adults");
    sel.innerHTML = '<option value="">— Seleccione un adulto registrado —</option>';
    adults
      .filter(function (a) {
        return a.status === "buscando";
      })
      .forEach(function (a) {
        var opt = document.createElement("option");
        opt.value = a.id;
        opt.textContent = a.name + " — " + a.id;
        opt.dataset.photo = a.photo || "";
        opt.dataset.name = a.name || "";
        opt.dataset.doc = a.document_id || "";
        opt.dataset.phone = a.phone || "";
        opt.dataset.relation = a.relation_sought || "";
        sel.appendChild(opt);
      });
  } catch (err) {
    sel.innerHTML = '<option value="">Error al cargar adultos</option>';
    console.error(err);
  }
}

async function populateMinorSelect() {
  var sel = document.getElementById("verifyMinorSelect");
  sel.innerHTML = '<option value="">— Cargando… —</option>';

  try {
    var minors = await api("/api/minors?status=pendiente");
    sel.innerHTML = '<option value="">— Seleccione un menor registrado —</option>';
    minors.forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name + " (" + m.age + " años) — " + m.id;
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
  selectedAdultId = null;

  var ap = document.getElementById("verAdultPreview");
  ap.className = "photo-preview placeholder";
  ap.innerHTML = "Sin foto";

  document.getElementById("btnCompare").disabled = true;
  document
    .getElementById("compareResult")
    .classList.remove("show", "success", "fail");
}

function setVerAdultPhoto(dataUrl) {
  verAdultPhotoData = dataUrl;
  var preview = document.getElementById("verAdultPreview");
  preview.classList.remove("placeholder");
  preview.innerHTML = "";
  var img = document.createElement("img");
  img.src = dataUrl;
  img.className = "photo-preview";
  img.alt = "Foto del adulto";
  preview.appendChild(img);
  updateCompareButton();
}

function updateCompareButton() {
  var hasMinor = document.getElementById("verifyMinorSelect").value;
  document.getElementById("btnCompare").disabled = !(
    hasMinor &&
    verAdultPhotoData &&
    modelsLoaded
  );
}

function initVerify() {
  var adultSel = document.getElementById("verifyAdultSelect");
  if (adultSel) {
    adultSel.addEventListener("change", function () {
      var opt = this.options[this.selectedIndex];
      selectedAdultId = opt && opt.value ? opt.value : null;
      if (opt && opt.value) {
        document.getElementById("verAdultName").value = opt.dataset.name || "";
        if (opt.dataset.photo) setVerAdultPhoto(opt.dataset.photo);
        var rel = document.getElementById("verRelation");
        if (rel && opt.dataset.relation) {
          for (var i = 0; i < rel.options.length; i++) {
            if (rel.options[i].text === opt.dataset.relation) {
              rel.value = rel.options[i].value;
              break;
            }
          }
        }
        var doc = document.getElementById("verDoc");
        if (doc) doc.value = opt.dataset.doc || "";
        var phone = document.getElementById("verPhone");
        if (phone) phone.value = opt.dataset.phone || "";
      }
      updateCompareButton();
    });
  }

  document
    .getElementById("verifyMinorSelect")
    .addEventListener("change", function () {
      var opt = this.options[this.selectedIndex];
      var img = document.getElementById("verMinorPhoto");
      var ph = document.getElementById("verMinorPlaceholder");

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

  document.getElementById("btnVerCamera").addEventListener("click", function () {
    openCamera("ver");
  });

  document.getElementById("btnCompare").addEventListener("click", async function () {
    var resultBox = document.getElementById("compareResult");
    var status = document.getElementById("verStatus");
    resultBox.classList.remove("show", "success", "fail");
    status.innerHTML = '<span class="dot loading"></span> Analizando rostros…';

    var minorId = document.getElementById("verifyMinorSelect").value;
    var selectedOpt = document.getElementById("verifyMinorSelect").selectedOptions[0];
    var minorPhoto = selectedOpt ? selectedOpt.dataset.photo : null;

    if (!minorId || !verAdultPhotoData || !minorPhoto) return;

    try {
      var img1 = await faceapi.fetchImage(minorPhoto);
      var img2 = await faceapi.fetchImage(verAdultPhotoData);

      var det1 = await faceapi
        .detectSingleFace(img1)
        .withFaceLandmarks()
        .withFaceDescriptor();
      var det2 = await faceapi
        .detectSingleFace(img2)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!det1 || !det2) {
        status.innerHTML =
          '<span class="dot" style="background:var(--danger)"></span> No se detecto un rostro claro en una de las imagenes.';
        resultBox.classList.add("show", "fail");
        document.getElementById("resultTitle").textContent =
          "No se pudo completar la comparacion";
        document.getElementById("resultPct").textContent = "—";
        document.getElementById("resultMsg").textContent =
          "Asegurese de que ambas fotos muestren un rostro frontal bien iluminado.";
        return;
      }

      var distance = faceapi.euclideanDistance(det1.descriptor, det2.descriptor);
      var similarity = Math.max(0, Math.min(100, (1 - distance) * 100));
      if (distance < 0.4) similarity = Math.min(100, similarity + 5);

      var pct = Math.round(similarity);
      var passed = distance < 0.55;

      resultBox.classList.add("show", passed ? "success" : "fail");
      document.getElementById("resultTitle").textContent = passed
        ? "Verificacion superada"
        : "Verificacion fallida — requiere revision manual";
      document.getElementById("resultPct").textContent = pct + "%";
      document.getElementById("resultMsg").textContent = passed
        ? "Similitud facial estimada: " + pct + "%. Resultado registrado."
        : "Similitud facial estimada: " +
          pct +
          "%. Distancia: " +
          distance.toFixed(3) +
          ". Se recomienda verificacion manual.";

      status.innerHTML =
        '<span class="dot"></span> Comparacion finalizada · Resultado enviado al servidor';

      try {
        await api("/api/verify", {
          method: "POST",
          body: JSON.stringify({
            minor_id: minorId,
            adult_id: selectedAdultId || null,
            similarity: pct,
            passed: passed,
            adult_name: document.getElementById("verAdultName").value.trim(),
          }),
        });
      } catch (e) {
        console.warn("No se pudo registrar la verificacion:", e);
      }
    } catch (err) {
      console.error(err);
      status.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error durante la comparacion.';
      resultBox.classList.add("show", "fail");
      document.getElementById("resultTitle").textContent = "Error tecnico";
      document.getElementById("resultPct").textContent = "—";
      document.getElementById("resultMsg").textContent =
        "No se pudo procesar las imagenes. Intente con fotos mas claras.";
    }
  });
}

function initMap() {
  if (mapInitialized && mapInstance) {
    setTimeout(function () {
      mapInstance.invalidateSize();
    }, 100);
    return;
  }

  var container = document.getElementById("mapContainer");
  if (!container) return;

  mapInstance = L.map("mapContainer").setView([19.4326, -99.1332], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(mapInstance);

  var legendEl = document.getElementById("mapLegend");
  legendEl.innerHTML = "";

  CENTROS.forEach(function (c) {
    var icon = L.divIcon({
      className: "",
      html:
        '<div style="width:18px;height:18px;border-radius:50%;background:' +
        c.color +
        ';border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    L.marker([c.lat, c.lng], { icon: icon })
      .addTo(mapInstance)
      .bindPopup("<strong>" + c.name + "</strong><br>" + c.desc);

    legendEl.innerHTML +=
      '<div class="map-legend-item">' +
      '<span class="map-legend-dot" style="background:' +
      c.color +
      '"></span>' +
      "<span>" +
      c.name +
      "</span></div>";
  });

  mapInitialized = true;
  setTimeout(function () {
    mapInstance.invalidateSize();
  }, 200);
}

async function refreshSettingsStatus() {
  var el = document.getElementById("settingsDbStatus");
  el.innerHTML = '<span class="dot loading"></span> Consultando…';
  try {
    var minors = await api("/api/minors");
    var adults = await api("/api/adults");
    el.innerHTML =
      '<span class="dot"></span> ' +
      minors.length +
      " menor(es) y " +
      adults.length +
      " adulto(s) en el sistema.";
  } catch (err) {
    el.innerHTML =
      '<span class="dot" style="background:var(--danger)"></span> No se pudo conectar con el servidor.';
  }
}

function initSettings() {
  document.getElementById("btnClearAll").addEventListener("click", async function () {
    var confirmed = confirm(
      "Esta seguro de que desea BORRAR TODOS los datos?\n\nSe eliminaran todos los menores y adultos registrados y sus fotografias.\nEsta accion no se puede deshacer."
    );
    if (!confirmed) return;

    var status = document.getElementById("clearStatus");
    status.innerHTML = '<span class="dot loading"></span> Eliminando datos…';

    try {
      var res = await api("/api/admin/clear", { method: "DELETE" });
      status.innerHTML = '<span class="dot"></span> ' + res.message;
      refreshSettingsStatus();
    } catch (err) {
      status.innerHTML =
        '<span class="dot" style="background:var(--danger)"></span> Error: ' +
        err.message;
      console.error(err);
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initNavigation();
  initCamera();
  initRegister();
  initRegisterAdult();
  initVerify();
  initSettings();
});
