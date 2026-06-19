"use strict";

(function () {
const bootLog = window.__PT_LOG_BOOT || (() => {});
bootLog("CORE SCRIPT START");

if (!window.PresetArchive) {
  throw new Error("PresetArchive global is missing before flyer-builder-core.js ran.");
}

const { createPresetArchive, readPresetArchive, stringToBytes, bytesToString } = window.PresetArchive;

const SIZE_PRESETS = [
  { value: "2550x3300", label: "US Letter Portrait - 8.5 x 11 in - 2550 x 3300 px" },
  { value: "3300x2550", label: "US Letter Landscape - 11 x 8.5 in - 3300 x 2550 px" },
  { value: "2550x4200", label: "US Legal Portrait - 8.5 x 14 in - 2550 x 4200 px" },
  { value: "4200x2550", label: "US Legal Landscape - 14 x 8.5 in - 4200 x 2550 px" },
  { value: "1080x1080", label: "Social Square - 1080 x 1080 px" },
  { value: "3000x3000", label: "Social Square Print - 3000 x 3000 px" },
  { value: "3300x5100", label: "Tabloid Portrait - 11 x 17 in - 3300 x 5100 px" },
  { value: "5100x3300", label: "Ledger Landscape - 17 x 11 in - 5100 x 3300 px" },
  { value: "1650x2550", label: "Half Letter Portrait - 5.5 x 8.5 in - 1650 x 2550 px" },
  { value: "2550x1650", label: "Half Letter Landscape - 8.5 x 5.5 in - 2550 x 1650 px" },
  { value: "2480x3508", label: "A4 Portrait - 8.27 x 11.69 in - 2480 x 3508 px" },
  { value: "3508x2480", label: "A4 Landscape - 11.69 x 8.27 in - 3508 x 2480 px" },
  { value: "1200x1800", label: "4 x 6 Print - 1200 x 1800 px" },
  { value: "1500x2100", label: "5 x 7 Print - 1500 x 2100 px" },
  { value: "1700x2200", label: "US Letter Draft - 8.5 x 11 in - 1700 x 2200 px" },
  { value: "1275x1650", label: "US Letter Preview - 8.5 x 11 in - 1275 x 1650 px" },
  { value: "1080x1350", label: "Social Preview - 4:5 - 1080 x 1350 px" },
  { value: "custom", label: "Custom Size" }
];

const qrConfigs = [
  { version: 1, size: 21, data: 19, ec: 7, align: [] },
  { version: 2, size: 25, data: 34, ec: 10, align: [6, 18] },
  { version: 3, size: 29, data: 55, ec: 15, align: [6, 22] },
  { version: 4, size: 33, data: 80, ec: 20, align: [6, 26] },
  { version: 5, size: 37, data: 108, ec: 26, align: [6, 30] }
];

const makeGfTables = () => {
  const exp = Array(512).fill(0);
  const log = Array(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];
  return { exp, log };
};

const gf = makeGfTables();

const gfMul = (a, b) => {
  if (a === 0 || b === 0) return 0;
  return gf.exp[gf.log[a] + gf.log[b]];
};

const polyMultiply = (a, b) => {
  const product = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      product[i + j] ^= gfMul(a[i], b[j]);
    }
  }
  return product;
};

const rsGenerator = (degree) => {
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    generator = polyMultiply(generator, [1, gf.exp[i]]);
  }
  return generator;
};

const rsRemainder = (data, degree) => {
  const generator = rsGenerator(degree);
  const result = Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMul(generator[i + 1], factor);
    }
  });
  return result;
};

const appendBits = (bits, value, length) => {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
};

const makeDataCodewords = (text, config) => {
  const bytes = Array.from(new TextEncoder().encode(text));
  const capacityBits = config.data * 8;
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  if (bits.length > capacityBits) return null;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | bits[i + j];
    codewords.push(value);
  }
  let pad = 0xec;
  while (codewords.length < config.data) {
    codewords.push(pad);
    pad = pad === 0xec ? 0x11 : 0xec;
  }
  return codewords;
};

const setModule = (matrix, reserved, x, y, dark, reserve = true) => {
  if (x < 0 || y < 0 || y >= matrix.length || x >= matrix.length) return;
  matrix[y][x] = Boolean(dark);
  if (reserve) reserved[y][x] = true;
};

const drawFinder = (matrix, reserved, x, y) => {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(matrix, reserved, xx, yy, dark);
    }
  }
};

const drawAlignment = (matrix, reserved, cx, cy) => {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) === 2 || (dx === 0 && dy === 0);
      setModule(matrix, reserved, cx + dx, cy + dy, dark);
    }
  }
};

const formatBits = (mask) => {
  const ecl = 1;
  let data = (ecl << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
  return ((data << 10) | rem) ^ 0x5412;
};

const drawFormatBits = (matrix, reserved, mask) => {
  const bits = formatBits(mask);
  const size = matrix.length;
  for (let i = 0; i < 15; i += 1) {
    const bit = ((bits >>> i) & 1) === 1;
    if (i < 6) setModule(matrix, reserved, 8, i, bit);
    else if (i === 6) setModule(matrix, reserved, 8, 7, bit);
    else if (i === 7) setModule(matrix, reserved, 8, 8, bit);
    else if (i === 8) setModule(matrix, reserved, 7, 8, bit);
    else setModule(matrix, reserved, 14 - i, 8, bit);

    if (i < 8) setModule(matrix, reserved, size - 1 - i, 8, bit);
    else setModule(matrix, reserved, 8, size - 15 + i, bit);
  }
};

const reserveFormatAreas = (matrix, reserved) => {
  const size = matrix.length;
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      setModule(matrix, reserved, 8, i, false);
      setModule(matrix, reserved, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) setModule(matrix, reserved, size - 1 - i, 8, false);
  for (let i = 0; i < 7; i += 1) setModule(matrix, reserved, 8, size - 1 - i, false);
};

const makeQrMatrix = (text) => {
  const bytes = Array.from(new TextEncoder().encode(text));
  const config = qrConfigs.find((item) => bytes.length + 2 <= item.data);
  if (!config) throw new Error("QR link is too long for this local generator.");
  const dataCodewords = makeDataCodewords(text, config);
  if (!dataCodewords) throw new Error("QR link is too long.");
  const codewords = [...dataCodewords, ...rsRemainder(dataCodewords, config.ec)];
  const bits = [];
  codewords.forEach((codeword) => appendBits(bits, codeword, 8));
  const matrix = Array.from({ length: config.size }, () => Array(config.size).fill(false));
  const reserved = Array.from({ length: config.size }, () => Array(config.size).fill(false));
  const size = config.size;

  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, size - 7, 0);
  drawFinder(matrix, reserved, 0, size - 7);

  config.align.forEach((x) => {
    config.align.forEach((y) => {
      if (!reserved[y][x]) drawAlignment(matrix, reserved, x, y);
    });
  });

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    setModule(matrix, reserved, i, 6, dark);
    setModule(matrix, reserved, 6, i, dark);
  }

  reserveFormatAreas(matrix, reserved);
  setModule(matrix, reserved, 8, config.version * 4 + 9, true);

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let row = 0; row < size; row += 1) {
      const y = upward ? size - 1 - row : row;
      for (let col = 0; col < 2; col += 1) {
        const x = right - col;
        if (!reserved[y][x]) {
          const rawBit = bitIndex < bits.length ? bits[bitIndex] === 1 : false;
          const masked = rawBit !== ((x + y) % 2 === 0);
          setModule(matrix, reserved, x, y, masked, false);
          bitIndex += 1;
        }
      }
    }
    upward = !upward;
  }

  drawFormatBits(matrix, reserved, 0);
  return matrix;
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const fileToBytes = async (file) => new Uint8Array(await file.arrayBuffer());

const bytesToObjectUrl = (bytes, mimeType) => URL.createObjectURL(new Blob([bytes], { type: mimeType }));

const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = url;
});

const fileExtension = (name, fallback = "bin") => {
  const match = name.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : fallback;
};

const sanitizeFileName = (value, fallback) => {
  const clean = value.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return clean || fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const normalizeUrlInput = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const sanitizeFontName = (name) => {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9 _-]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "Imported Font";
};

const createFlyerBuilder = (config = {}) => {
  bootLog("CREATE BUILDER REQUEST", { mode: config.mode || "custom" });
  return new FlyerBuilder(config);
};

class FlyerBuilder {
  constructor(config) {
    this.config = {
      mode: "custom",
      allowImageLayers: true,
      allowTextLayers: true,
      allowQrLayers: true,
      allowPresetSave: false,
      allowPresetLoad: false,
      sizePresets: SIZE_PRESETS,
      ...config
    };

    this.canvas = document.querySelector("#flyerCanvas");
    if (!this.canvas) {
      throw new Error("Required canvas element #flyerCanvas was not found.");
    }
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      throw new Error("Canvas 2D context could not be created.");
    }
    this.els = this.collectEls();
    this.validateRequiredElements();
    this.layers = [];
    this.guides = [];
    this.selectedLayerId = null;
    this.dragging = null;
    this.draggedStackLayerId = null;
    this.exportName = "promotion";
    this.qrUpdateTimer = null;
    this.importedFontCount = 0;
    this.debugEntries = [];
    this.importedFonts = new Map();
    this.objectUrls = new Set();
    this.bindGlobals();
    bootLog("BUILDER CONSTRUCTOR READY", {
      mode: this.config.mode,
      canvas: `${this.canvas.width}x${this.canvas.height}`
    });
    this.populateSizeOptions();
    this.attachEvents();
    this.logDebug("FLYER BUILDER LOADED", {
      canvas: `${this.canvas.width}x${this.canvas.height}`,
      mode: this.config.mode,
      userAgent: navigator.userAgent
    });
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.syncGuideInputLimits();
    this.renderGuideList();
    this.updateCustomSizeVisibility();
    this.drawCanvas();
  }

  collectEls() {
    return {
      formatSelect: document.querySelector("#formatSelect"),
      customSizeRow: document.querySelector("#customSizeRow"),
      customWidth: document.querySelector("#customWidth"),
      customHeight: document.querySelector("#customHeight"),
      applyCustomSizeBtn: document.querySelector("#applyCustomSizeBtn"),
      autoCanvasFromImageToggle: document.querySelector("#autoCanvasFromImageToggle"),
      canvasColor: document.querySelector("#canvasColor"),
      imageInput: document.querySelector("#imageInput"),
      addImageBtn: document.querySelector("#addImageBtn"),
      addTextBtn: document.querySelector("#addTextBtn"),
      addQrBtn: document.querySelector("#addQrBtn"),
      snapGuidesToggle: document.querySelector("#snapGuidesToggle"),
      guideOrientation: document.querySelector("#guideOrientation"),
      guideUnit: document.querySelector("#guideUnit"),
      guidePosition: document.querySelector("#guidePosition"),
      centerGuideBtn: document.querySelector("#centerGuideBtn"),
      addGuideBtn: document.querySelector("#addGuideBtn"),
      guideList: document.querySelector("#guideList"),
      presetSaveBtn: document.querySelector("#presetSaveBtn"),
      presetLoadBtn: document.querySelector("#presetLoadBtn"),
      presetInput: document.querySelector("#presetInput"),
      duplicateLayerBtn: document.querySelector("#duplicateLayerBtn"),
      qrLink: document.querySelector("#qrLink"),
      qrDark: document.querySelector("#qrDark"),
      qrLight: document.querySelector("#qrLight"),
      qrModuleShape: document.querySelector("#qrModuleShape"),
      qrFinderShape: document.querySelector("#qrFinderShape"),
      updateQrBtn: document.querySelector("#updateQrBtn"),
      selectedLayerLabel: document.querySelector("#selectedLayerLabel"),
      layerSettingsPanel: document.querySelector("#layerSettingsPanel"),
      shadowPanel: document.querySelector("#shadowPanel"),
      textPanel: document.querySelector("#textPanel"),
      qrPanel: document.querySelector("#qrPanel"),
      qrScale: document.querySelector("#qrScale"),
      qrScaleValue: document.querySelector("#qrScaleValue"),
      layerOpacity: document.querySelector("#layerOpacity"),
      layerOpacityValue: document.querySelector("#layerOpacityValue"),
      layerX: document.querySelector("#layerX"),
      layerXValue: document.querySelector("#layerXValue"),
      layerY: document.querySelector("#layerY"),
      layerYValue: document.querySelector("#layerYValue"),
      layerScale: document.querySelector("#layerScale"),
      layerScaleValue: document.querySelector("#layerScaleValue"),
      layerScaleRow: document.querySelector("#layerScaleRow"),
      layerHue: document.querySelector("#layerHue"),
      layerHueValue: document.querySelector("#layerHueValue"),
      layerSaturation: document.querySelector("#layerSaturation"),
      layerSaturationValue: document.querySelector("#layerSaturationValue"),
      layerBlur: document.querySelector("#layerBlur"),
      layerBlurValue: document.querySelector("#layerBlurValue"),
      textContent: document.querySelector("#textContent"),
      fontSelect: document.querySelector("#fontSelect"),
      fontImportInput: document.querySelector("#fontImportInput"),
      importFontBtn: document.querySelector("#importFontBtn"),
      fontWeight: document.querySelector("#fontWeight"),
      fontSize: document.querySelector("#fontSize"),
      fontSizeValue: document.querySelector("#fontSizeValue"),
      textColor: document.querySelector("#textColor"),
      strokeColor: document.querySelector("#strokeColor"),
      strokeWidth: document.querySelector("#strokeWidth"),
      strokeWidthValue: document.querySelector("#strokeWidthValue"),
      uppercaseToggle: document.querySelector("#uppercaseToggle"),
      boxToggle: document.querySelector("#boxToggle"),
      shadowToggle: document.querySelector("#shadowToggle"),
      shadowColor: document.querySelector("#shadowColor"),
      shadowBlur: document.querySelector("#shadowBlur"),
      shadowBlurValue: document.querySelector("#shadowBlurValue"),
      shadowOpacity: document.querySelector("#shadowOpacity"),
      shadowOpacityValue: document.querySelector("#shadowOpacityValue"),
      shadowX: document.querySelector("#shadowX"),
      shadowXValue: document.querySelector("#shadowXValue"),
      shadowY: document.querySelector("#shadowY"),
      shadowYValue: document.querySelector("#shadowYValue"),
      layerList: document.querySelector("#layerList"),
      deleteLayerBtn: document.querySelector("#deleteLayerBtn"),
      openOutputBtn: document.querySelector("#openOutputBtn"),
      outputModal: document.querySelector("#outputModal"),
      closeOutputBtn: document.querySelector("#closeOutputBtn"),
      exportFormat: document.querySelector("#exportFormat"),
      exportName: document.querySelector("#exportName"),
      exportFileBtn: document.querySelector("#exportFileBtn"),
      printLayout: document.querySelector("#printLayout"),
      printPageSize: document.querySelector("#printPageSize"),
      printCutLines: document.querySelector("#printCutLines"),
      printFromModalBtn: document.querySelector("#printFromModalBtn"),
      statusLine: document.querySelector("#statusLine"),
      debugLog: document.querySelector("#debugLog"),
      copyDebugBtn: document.querySelector("#copyDebugBtn"),
      canvasContextMenu: document.querySelector("#canvasContextMenu"),
      mobileLayerPicker: document.querySelector("#mobileLayerPicker"),
      mobileCenterHBtn: document.querySelector("#mobileCenterHBtn"),
      mobileCenterVBtn: document.querySelector("#mobileCenterVBtn"),
      mobileLockBtn: document.querySelector("#mobileLockBtn")
    };
  }

  validateRequiredElements() {
    const required = [
      ["formatSelect", this.els.formatSelect],
      ["canvasColor", this.els.canvasColor],
      ["guideOrientation", this.els.guideOrientation],
      ["guideUnit", this.els.guideUnit],
      ["guidePosition", this.els.guidePosition],
      ["guideList", this.els.guideList],
      ["layerList", this.els.layerList],
      ["statusLine", this.els.statusLine],
      ["selectedLayerLabel", this.els.selectedLayerLabel],
      ["debugLog", this.els.debugLog]
    ];
    const missing = required.filter((entry) => !entry[1]).map((entry) => entry[0]);
    if (missing.length) {
      throw new Error(`Required builder elements are missing: ${missing.join(", ")}`);
    }
    bootLog("REQUIRED ELEMENTS OK", { count: required.length });
  }

  bindGlobals() {
    window.addEventListener("error", (event) => {
      this.logDebug("RUNTIME ERROR", {
        message: event.message,
        file: event.filename,
        line: event.lineno,
        column: event.colno
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      this.logDebug("PROMISE ERROR", String(event.reason?.message || event.reason));
    });
  }

  populateSizeOptions() {
    if (!this.els.formatSelect) return;
    this.els.formatSelect.innerHTML = "";
    this.config.sizePresets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.value;
      option.textContent = preset.label;
      this.els.formatSelect.appendChild(option);
    });
    this.els.formatSelect.value = `${this.canvas.width}x${this.canvas.height}`;
  }

  newId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  setStatus(message) {
    if (this.els.statusLine) this.els.statusLine.textContent = message;
  }

  logDebug(message, details = null) {
    const time = new Date().toLocaleTimeString();
    let line = `[${time}] ${message}`;
    if (details !== null && details !== undefined) {
      if (typeof details === "string") line += ` ${details}`;
      else {
        try {
          line += ` ${JSON.stringify(details)}`;
        } catch {
          line += " [details unavailable]";
        }
      }
    }
    this.debugEntries.push(line);
    if (this.debugEntries.length > 120) this.debugEntries.shift();
    if (this.els.debugLog) {
      this.els.debugLog.textContent = this.debugEntries.join("\n");
      this.els.debugLog.scrollTop = this.els.debugLog.scrollHeight;
    }
  }

  trackObjectUrl(url) {
    this.objectUrls.add(url);
    return url;
  }

  revokeTrackedObjectUrls() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.objectUrls.clear();
  }

  selectedLayer() {
    return this.layers.find((layer) => layer.id === this.selectedLayerId) || null;
  }

  commonLayer(type, name) {
    return {
      id: this.newId(),
      type,
      name,
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
      scale: 100,
      opacity: 100,
      visible: true,
      locked: false,
      filters: { hue: 0, saturation: 100, blur: 0 },
      shadow: {
        enabled: type === "text",
        color: "#000000",
        blur: 18,
        opacity: 80,
        offsetX: 8,
        offsetY: 8
      }
    };
  }

  hexToRgba(hex, alphaPercent) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${clamp(alphaPercent, 0, 100) / 100})`;
  }

  rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  brightenHex(hex, amount = 0.2) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return this.rgbToHex(
      r + (255 - r) * amount,
      g + (255 - g) * amount,
      b + (255 - b) * amount
    );
  }

  darkenHex(hex, amount = 0.2) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return this.rgbToHex(
      r * (1 - amount),
      g * (1 - amount),
      b * (1 - amount)
    );
  }

  mixHex(hexA, hexB, amount = 0.5) {
    const cleanA = hexA.replace("#", "");
    const cleanB = hexB.replace("#", "");
    const valueA = parseInt(cleanA, 16);
    const valueB = parseInt(cleanB, 16);
    const rA = (valueA >> 16) & 255;
    const gA = (valueA >> 8) & 255;
    const bA = valueA & 255;
    const rB = (valueB >> 16) & 255;
    const gB = (valueB >> 8) & 255;
    const bB = valueB & 255;
    return this.rgbToHex(
      rA + (rB - rA) * amount,
      gA + (gB - gA) * amount,
      bA + (bB - bA) * amount
    );
  }

  extractArtworkAccent(image) {
    try {
      const sample = document.createElement("canvas");
      sample.width = 48;
      sample.height = 48;
      const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
      if (!sampleCtx) return null;
      sampleCtx.drawImage(image, 0, 0, sample.width, sample.height);
      const { data } = sampleCtx.getImageData(0, 0, sample.width, sample.height);
      let best = null;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 200) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const saturation = max === 0 ? 0 : (max - min) / max;
        const brightness = (r + g + b) / 3;
        if (saturation < 0.28) continue;
        if (brightness < 32 || brightness > 225) continue;
        const score = saturation * 180 + (255 - Math.abs(145 - brightness));
        if (!best || score > best.score) {
          best = { score, color: this.rgbToHex(r, g, b) };
        }
      }
      return best ? best.color : null;
    } catch (error) {
      this.logDebug("ARTWORK ACCENT FAILED", { message: error.message });
      return null;
    }
  }

  applyShadow(layer) {
    if (!layer.shadow?.enabled) {
      this.clearShadow();
      return;
    }
    this.ctx.shadowColor = this.hexToRgba(layer.shadow.color, layer.shadow.opacity);
    this.ctx.shadowBlur = layer.shadow.blur;
    this.ctx.shadowOffsetX = layer.shadow.offsetX;
    this.ctx.shadowOffsetY = layer.shadow.offsetY;
  }

  clearShadow() {
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }

  applyLayerFilters(layer) {
    const filters = layer.filters || { hue: 0, saturation: 100, blur: 0 };
    this.ctx.filter = `hue-rotate(${filters.hue}deg) saturate(${filters.saturation}%) blur(${filters.blur}px)`;
  }

  clearLayerFilters() {
    this.ctx.filter = "none";
  }

  wrapText(text, maxWidth) {
    const lines = [];
    text.split("\n").forEach((sourceLine) => {
      const words = sourceLine.split(" ");
      let line = "";
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (this.ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      });
      lines.push(line);
    });
    return lines;
  }

  getTextMetrics(layer) {
    const text = layer.uppercase ? layer.text.toUpperCase() : layer.text;
    const fontSize = layer.fontSize * (layer.scale / 100);
    const lineHeight = fontSize * 1.12;
    const maxWidth = layer.maxWidth || this.canvas.width * 0.86;
    this.ctx.font = `${layer.fontWeight} ${fontSize}px "${layer.fontFamily}", sans-serif`;
    const lines = this.wrapText(text, maxWidth);
    const width = Math.min(maxWidth, Math.max(...lines.map((line) => this.ctx.measureText(line).width), fontSize));
    const height = Math.max(lineHeight, lines.length * lineHeight);
    return { text, fontSize, lineHeight, maxWidth, lines, width, height };
  }

  layerBounds(layer) {
    if (layer.type === "text") {
      const metrics = this.getTextMetrics(layer);
      let anchorX = layer.x - metrics.width / 2;
      if (layer.align === "left") anchorX = layer.x;
      if (layer.align === "right") anchorX = layer.x - metrics.width;
      return {
        x: anchorX - 32,
        y: layer.y - metrics.height / 2 - 24,
        width: metrics.width + 64,
        height: metrics.height + 48
      };
    }
    if (layer.type === "image") {
      const width = layer.baseWidth * (layer.scale / 100);
      const height = layer.baseHeight * (layer.scale / 100);
      return { x: layer.x - width / 2, y: layer.y - height / 2, width, height };
    }
    const size = layer.baseSize * (layer.scale / 100);
    return { x: layer.x - size / 2, y: layer.y - size / 2, width: size, height: size };
  }

  drawTextLayer(layer) {
    const metrics = this.getTextMetrics(layer);
    const bounds = this.layerBounds(layer);
    this.ctx.save();
    this.ctx.globalAlpha = layer.opacity / 100;
    this.applyLayerFilters(layer);
    this.ctx.font = `${layer.fontWeight} ${metrics.fontSize}px "${layer.fontFamily}", sans-serif`;
    this.ctx.textAlign = layer.align || "center";
    this.ctx.textBaseline = "middle";
    if (layer.box) {
      this.clearShadow();
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
      this.ctx.fillRect(bounds.x + 4, bounds.y + 6, Math.max(0, bounds.width - 8), Math.max(0, bounds.height - 12));
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      this.ctx.lineWidth = Math.max(2, metrics.fontSize * 0.035);
      this.ctx.strokeRect(bounds.x + 4, bounds.y + 6, Math.max(0, bounds.width - 8), Math.max(0, bounds.height - 12));
    }
    this.applyShadow(layer);
    metrics.lines.forEach((line, index) => {
      const y = layer.y - metrics.height / 2 + metrics.lineHeight / 2 + index * metrics.lineHeight;
      if (layer.strokeWidth > 0) {
        this.ctx.lineJoin = "round";
        this.ctx.miterLimit = 2;
        this.ctx.strokeStyle = layer.stroke;
        this.ctx.lineWidth = layer.strokeWidth * (layer.scale / 100);
        this.ctx.strokeText(line, layer.x, y, metrics.maxWidth);
      }
      this.ctx.fillStyle = layer.fill;
      this.ctx.fillText(line, layer.x, y, metrics.maxWidth);
    });
    this.ctx.restore();
    this.clearLayerFilters();
  }

  drawImageLayer(layer) {
    const bounds = this.layerBounds(layer);
    this.ctx.save();
    this.ctx.globalAlpha = layer.opacity / 100;
    this.applyLayerFilters(layer);
    this.applyShadow(layer);
    if (layer.clipRadius) {
      this.traceRoundRect(bounds.x, bounds.y, bounds.width, bounds.height, layer.clipRadius * (layer.scale / 100));
      this.ctx.clip();
    }
    this.ctx.drawImage(layer.image, bounds.x, bounds.y, bounds.width, bounds.height);
    this.ctx.restore();
    this.clearLayerFilters();
  }

  traceRoundRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + width - r, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    this.ctx.lineTo(x + width, y + height - r);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    this.ctx.lineTo(x + r, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  roundRect(x, y, width, height, radius) {
    this.traceRoundRect(x, y, width, height, radius);
    this.ctx.fill();
  }

  strokeRoundRect(x, y, width, height, radius) {
    this.traceRoundRect(x, y, width, height, radius);
    this.ctx.stroke();
  }

  isFinderModule(matrixSize, x, y) {
    const inTopLeft = x <= 6 && y <= 6;
    const inTopRight = x >= matrixSize - 7 && y <= 6;
    const inBottomLeft = x <= 6 && y >= matrixSize - 7;
    return inTopLeft || inTopRight || inBottomLeft;
  }

  drawQrModule(x, y, size, style) {
    if (style === "dot") {
      this.ctx.beginPath();
      this.ctx.arc(x + size / 2, y + size / 2, size * 0.42, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }
    if (style === "rounded") {
      this.roundRect(x + size * 0.05, y + size * 0.05, size * 0.9, size * 0.9, size * 0.28);
      return;
    }
    this.ctx.fillRect(x, y, Math.ceil(size), Math.ceil(size));
  }

  drawQrLayer(layer) {
    const bounds = this.layerBounds(layer);
    const quiet = Math.max(8, bounds.width * 0.08);
    const moduleSize = bounds.width / layer.matrix.length;
    this.ctx.save();
    this.ctx.globalAlpha = layer.opacity / 100;
    this.applyLayerFilters(layer);
    this.applyShadow(layer);
    this.ctx.fillStyle = layer.light;
    this.ctx.fillRect(bounds.x - quiet, bounds.y - quiet, bounds.width + quiet * 2, bounds.height + quiet * 2);
    this.clearShadow();
    this.ctx.fillStyle = layer.dark;
    for (let y = 0; y < layer.matrix.length; y += 1) {
      for (let x = 0; x < layer.matrix.length; x += 1) {
        if (layer.matrix[y][x]) {
          const finder = this.isFinderModule(layer.matrix.length, x, y);
          this.drawQrModule(bounds.x + x * moduleSize, bounds.y + y * moduleSize, moduleSize, finder ? layer.finderShape : layer.moduleShape);
        }
      }
    }
    this.ctx.restore();
    this.clearLayerFilters();
  }

  drawPlaceholder() {
    const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
    gradient.addColorStop(0, "#121212");
    gradient.addColorStop(0.5, "#020202");
    gradient.addColorStop(1, "#160303");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = "rgba(255,255,255,0.18)";
    this.ctx.lineWidth = Math.max(2, this.canvas.width * 0.003);
    this.ctx.strokeRect(this.canvas.width * 0.05, this.canvas.height * 0.05, this.canvas.width * 0.9, this.canvas.height * 0.9);
    this.ctx.fillStyle = "rgba(255,255,255,0.55)";
    this.ctx.font = `${Math.max(24, this.canvas.width * 0.035)}px "Share Tech Mono", monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("ADD IMAGE OR TEXT", this.canvas.width / 2, this.canvas.height / 2);
  }

  drawSelection() {
    const layer = this.selectedLayer();
    if (!layer || !layer.visible) return;
    const bounds = this.layerBounds(layer);
    this.ctx.save();
    this.ctx.setLineDash([12, 8]);
    this.ctx.strokeStyle = "#39ff14";
    this.ctx.lineWidth = Math.max(2, this.canvas.width * 0.0025);
    this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.ctx.restore();
  }

  guideAxisSize(guide) {
    return guide.orientation === "vertical" ? this.canvas.width : this.canvas.height;
  }

  guidePositionPx(guide) {
    return guide.unit === "percent" ? this.guideAxisSize(guide) * (guide.value / 100) : guide.value;
  }

  drawGuides() {
    this.ctx.save();
    this.ctx.strokeStyle = "#39ff14";
    this.ctx.globalAlpha = 0.74;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "butt";
    this.ctx.setLineDash([16, 10]);
    const rendered = new Set();
    this.guides.filter((guide) => guide.visible).forEach((guide) => {
      const position = Math.round(this.guidePositionPx(guide)) + 0.5;
      const key = `${guide.orientation}:${position}`;
      if (rendered.has(key)) return;
      rendered.add(key);
      this.ctx.beginPath();
      if (guide.orientation === "vertical") {
        this.ctx.moveTo(position, 0);
        this.ctx.lineTo(position, this.canvas.height);
      } else {
        this.ctx.moveTo(0, position);
        this.ctx.lineTo(this.canvas.width, position);
      }
      this.ctx.stroke();
    });
    this.ctx.restore();
  }

  drawCanvas({ showSelection = true, showGuides = true } = {}) {
    this.ctx.fillStyle = this.els.canvasColor?.value || "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.layers.some((layer) => layer.visible)) this.drawPlaceholder();
    this.layers.forEach((layer) => {
      if (!layer.visible) return;
      if (layer.type === "text") this.drawTextLayer(layer);
      if (layer.type === "image") this.drawImageLayer(layer);
      if (layer.type === "qr") this.drawQrLayer(layer);
    });
    if (showGuides) this.drawGuides();
    if (showSelection) this.drawSelection();
  }

  clampGuideValue(orientation, unit, value) {
    if (unit === "percent") return clamp(value, 0, 100);
    const max = orientation === "vertical" ? this.canvas.width : this.canvas.height;
    return clamp(value, 0, max);
  }

  syncGuideInputLimits() {
    if (!this.els.guidePosition) return;
    const unit = this.els.guideUnit.value;
    const orientation = this.els.guideOrientation.value;
    this.els.guidePosition.min = 0;
    this.els.guidePosition.max = unit === "percent" ? 100 : orientation === "vertical" ? this.canvas.width : this.canvas.height;
    this.els.guidePosition.step = 1;
  }

  renderGuideList() {
    if (!this.els.guideList) return;
    this.els.guideList.innerHTML = "";
    if (!this.guides.length) {
      this.els.guideList.innerHTML = '<p class="empty-state">No guides</p>';
      return;
    }
    this.guides.forEach((guide) => {
      const row = document.createElement("div");
      row.className = "guide-item";
      const label = `${guide.orientation === "vertical" ? "V" : "H"} ${guide.value}${guide.unit === "percent" ? "%" : "px"}`;
      row.innerHTML = `
        <span>${label}</span>
        <label><input type="checkbox" data-guide-active="${guide.id}" ${guide.active ? "checked" : ""}> Active</label>
        <label><input type="checkbox" data-guide-visible="${guide.id}" ${guide.visible ? "checked" : ""}> Show</label>
        <button type="button" data-guide-delete="${guide.id}">Delete</button>
      `;
      this.els.guideList.appendChild(row);
    });
  }

  addGuide() {
    const orientation = this.els.guideOrientation.value;
    const unit = this.els.guideUnit.value;
    const rawValue = Number(this.els.guidePosition.value);
    const value = this.clampGuideValue(orientation, unit, Number.isFinite(rawValue) ? rawValue : 0);
    this.guides.push({ id: this.newId(), orientation, unit, value, active: true, visible: true });
    this.setStatus("GUIDE ADDED");
    this.renderGuideList();
    this.drawCanvas();
  }

  snapPointToGuides(x, y) {
    if (!this.els.snapGuidesToggle?.checked) return { x, y };
    const threshold = Math.max(12, Math.min(this.canvas.width, this.canvas.height) * 0.012);
    let snappedX = x;
    let snappedY = y;
    this.guides.forEach((guide) => {
      if (!guide.active) return;
      const position = this.guidePositionPx(guide);
      if (guide.orientation === "vertical" && Math.abs(x - position) <= threshold) snappedX = position;
      if (guide.orientation === "horizontal" && Math.abs(y - position) <= threshold) snappedY = position;
    });
    return { x: snappedX, y: snappedY };
  }

  layerLabel(layer, index) {
    if (layer.type === "text") return `TEXT ${index + 1}`;
    if (layer.type === "image") return `IMAGE ${index + 1}`;
    return `QR ${index + 1}`;
  }

  renderLayerList() {
    if (!this.els.layerList) return;
    this.els.layerList.innerHTML = "";
    if (!this.layers.length) {
      this.els.layerList.innerHTML = '<p class="empty-state">No layers</p>';
      return;
    }
    [...this.layers].reverse().forEach((layer, stackPosition) => {
      const index = this.layers.indexOf(layer);
      const stackLabel = stackPosition === 0 ? "TOP" : stackPosition === this.layers.length - 1 ? "BOTTOM" : `LEVEL ${this.layers.length - stackPosition}`;
      const row = document.createElement("div");
      row.className = "layer-row";
      row.innerHTML = `
        <button type="button" draggable="true" data-layer-id="${layer.id}" class="layer-item${layer.id === this.selectedLayerId ? " active" : ""}">
          <span class="layer-main">
            <strong>${stackLabel}</strong>
            <span>${this.layerLabel(layer, index)}</span>
          </span>
          <span class="layer-name">${layer.name.slice(0, 18)}</span>
        </button>
        <button type="button" class="mini-button layer-lock-btn${layer.locked ? " locked" : ""}" data-layer-lock="${layer.id}">${layer.locked ? "LOCKED" : "UNLOCKED"}</button>
        <button type="button" class="mini-button layer-visibility-btn" data-layer-visibility="${layer.id}">${layer.visible ? "HIDE" : "SHOW"}</button>
      `;
      const button = row.querySelector(".layer-item");
      button.addEventListener("click", () => {
        this.selectedLayerId = layer.id;
        this.syncControlsFromLayer();
        this.renderLayerList();
        this.drawCanvas();
      });
      const lockBtn = row.querySelector(".layer-lock-btn");
      lockBtn.addEventListener("click", () => {
        layer.locked = !layer.locked;
        this.syncControlsFromLayer();
        this.renderLayerList();
      });
      button.addEventListener("dragstart", (event) => {
        this.draggedStackLayerId = layer.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", layer.id);
        button.classList.add("dragging");
      });
      button.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        button.classList.add("drag-over");
      });
      button.addEventListener("dragleave", () => button.classList.remove("drag-over"));
      button.addEventListener("drop", (event) => {
        event.preventDefault();
        button.classList.remove("drag-over");
        const sourceId = event.dataTransfer.getData("text/plain") || this.draggedStackLayerId;
        this.reorderLayerStack(sourceId, layer.id);
      });
      button.addEventListener("dragend", () => {
        this.draggedStackLayerId = null;
        document.querySelectorAll(".layer-item.dragging, .layer-item.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
      });
      this.els.layerList.appendChild(row);
    });

    this.renderMobileLayerPicker();
  }

    renderMobileLayerPicker() {
      if (!this.els.mobileLayerPicker) return;
      this.els.mobileLayerPicker.innerHTML = "";
      [...this.layers].reverse().forEach((layer, index) => {
        const stackIndex = this.layers.length - 1 - index;
        const isActive = layer.id === this.selectedLayerId;
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "4px";

        if (isActive && this.layers.length > 1) {
          const moveLeft = document.createElement("button");
          moveLeft.type = "button";
          moveLeft.className = "mini-button";
          moveLeft.innerHTML = "â—‚";
          moveLeft.style.padding = "2px 6px";
          moveLeft.onclick = (e) => {
            e.stopPropagation();
            this.moveLayerInStack(layer.id, -1);
          };
          container.appendChild(moveLeft);
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.draggable = true;
        btn.className = `mini-button${isActive ? " active" : ""}`;
        btn.style.flexShrink = "0";
        btn.style.whiteSpace = "nowrap";
        btn.textContent = this.layerLabel(layer, stackIndex).slice(0, 12);
        
        btn.onclick = () => {
          this.selectedLayerId = layer.id;
          this.syncControlsFromLayer();
          this.renderLayerList();
          this.drawCanvas();
        };

        btn.addEventListener("dragstart", (event) => {
          this.draggedStackLayerId = layer.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", layer.id);
          btn.classList.add("dragging");
        });
        btn.addEventListener("dragover", (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          btn.classList.add("drag-over");
        });
        btn.addEventListener("dragleave", () => btn.classList.remove("drag-over"));
        btn.addEventListener("drop", (event) => {
          event.preventDefault();
          btn.classList.remove("drag-over");
          const sourceId = event.dataTransfer.getData("text/plain") || this.draggedStackLayerId;
          this.reorderLayerStack(sourceId, layer.id);
        });
        btn.addEventListener("dragend", () => {
          this.draggedStackLayerId = null;
          document.querySelectorAll(".mobile-layer-picker .mini-button.dragging, .mobile-layer-picker .mini-button.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over"));
        });

        container.appendChild(btn);

        if (isActive && this.layers.length > 1) {
          const moveRight = document.createElement("button");
          moveRight.type = "button";
          moveRight.className = "mini-button";
          moveRight.innerHTML = "â–¸";
          moveRight.style.padding = "2px 6px";
          moveRight.onclick = (e) => {
            e.stopPropagation();
            this.moveLayerInStack(layer.id, 1);
          };
          container.appendChild(moveRight);
        }

        this.els.mobileLayerPicker.appendChild(container);
      });
    }

    moveLayerInStack(layerId, direction) {
      const visualStack = [...this.layers].reverse();
      const index = visualStack.findIndex(l => l.id === layerId);
      if (index === -1) return;
      const newIndex = index + direction;
      if (newIndex < 0 || newIndex >= visualStack.length) return;
      
      const [movedLayer] = visualStack.splice(index, 1);
      visualStack.splice(newIndex, 0, movedLayer);
      
      this.layers = visualStack.reverse();
      this.renderLayerList();
      this.drawCanvas();
      this.setStatus("LAYER MOVED");
    }

  setPanelHidden(panel, hidden) {
    if (!panel) return;
    panel.classList.toggle("panel-hidden", hidden);
  }

  updateOutput(input, output) {
    if (output) output.value = input.value;
  }

  syncCommonControls(layer) {
    this.els.layerOpacity.value = layer.opacity;
    this.els.layerOpacityValue.value = layer.opacity;
    this.els.layerX.max = this.canvas.width;
    this.els.layerY.max = this.canvas.height;
    this.els.layerX.disabled = !!layer.locked;
    this.els.layerY.disabled = !!layer.locked;
    this.els.layerX.value = Math.round(layer.x);
    this.els.layerXValue.value = Math.round(layer.x);
    this.els.layerY.value = Math.round(layer.y);
    this.els.layerYValue.value = Math.round(layer.y);
    this.els.layerScale.value = Math.round(layer.scale);
    this.els.layerScaleValue.value = Math.round(layer.scale);
    this.setPanelHidden(this.els.layerScaleRow, layer.type === "qr");
    this.els.layerHue.value = layer.filters?.hue ?? 0;
    this.els.layerHueValue.value = layer.filters?.hue ?? 0;
    this.els.layerSaturation.value = layer.filters?.saturation ?? 100;
    this.els.layerSaturationValue.value = layer.filters?.saturation ?? 100;
    this.els.layerBlur.value = layer.filters?.blur ?? 0;
    this.els.layerBlurValue.value = layer.filters?.blur ?? 0;
    this.els.shadowToggle.checked = layer.shadow.enabled;
    this.els.shadowColor.value = layer.shadow.color;
    this.els.shadowBlur.value = layer.shadow.blur;
    this.els.shadowBlurValue.value = layer.shadow.blur;
    this.els.shadowOpacity.value = layer.shadow.opacity;
    this.els.shadowOpacityValue.value = layer.shadow.opacity;
    this.els.shadowX.value = layer.shadow.offsetX;
    this.els.shadowXValue.value = layer.shadow.offsetX;
    this.els.shadowY.value = layer.shadow.offsetY;
    this.els.shadowYValue.value = layer.shadow.offsetY;
  }

  syncTextControls(layer) {
    this.setPanelHidden(this.els.textPanel, layer.type !== "text");
    if (layer.type !== "text") return;
    this.els.textContent.value = layer.text;
    this.els.fontSelect.value = layer.fontFamily;
    this.els.fontWeight.value = layer.fontWeight;
    this.els.fontSize.value = layer.fontSize;
    this.els.fontSizeValue.value = layer.fontSize;
    this.els.textColor.value = layer.fill;
    this.els.strokeColor.value = layer.stroke;
    this.els.strokeWidth.value = layer.strokeWidth;
    this.els.strokeWidthValue.value = layer.strokeWidth;
    this.els.uppercaseToggle.checked = layer.uppercase;
    this.els.boxToggle.checked = layer.box;
  }

  syncQrControls(layer) {
    this.setPanelHidden(this.els.qrPanel, layer.type !== "qr");
    if (layer.type !== "qr") return;
    if (this.els.qrLink) this.els.qrLink.value = layer.link;
    if (this.els.qrDark) this.els.qrDark.value = layer.dark;
    if (this.els.qrLight) this.els.qrLight.value = layer.light;
    if (this.els.qrModuleShape) this.els.qrModuleShape.value = layer.moduleShape;
    if (this.els.qrFinderShape) this.els.qrFinderShape.value = layer.finderShape;
    if (this.els.qrScale) {
      this.els.qrScale.value = Math.round(layer.scale);
      if (this.els.qrScaleValue) this.els.qrScaleValue.value = Math.round(layer.scale);
    }
  }

  syncControlsFromLayer() {
    const layer = this.selectedLayer();
    const noSelection = !layer;
    if (noSelection) {
      this.els.selectedLayerLabel.textContent = "NO LAYER SELECTED";
      if (this.els.mobileLockBtn) {
        this.els.mobileLockBtn.textContent = "LOCK";
        this.els.mobileLockBtn.classList.remove("locked");
        this.els.mobileLockBtn.disabled = true;
      }
      this.setPanelHidden(this.els.layerSettingsPanel, true);
      this.setPanelHidden(this.els.shadowPanel, true);
      this.setPanelHidden(this.els.textPanel, true);
      this.setPanelHidden(this.els.qrPanel, true);
      return;
    }
    const index = this.layers.indexOf(layer);
    this.els.selectedLayerLabel.textContent = `${this.layerLabel(layer, index)} SELECTED`;
    if (this.els.mobileLockBtn) {
      this.els.mobileLockBtn.textContent = layer.locked ? "LOCKED" : "LOCK";
      this.els.mobileLockBtn.classList.toggle("locked", !!layer.locked);
      this.els.mobileLockBtn.disabled = false;
    }
    this.renderMobileLayerPicker();
    this.setPanelHidden(this.els.layerSettingsPanel, false);
    this.setPanelHidden(this.els.shadowPanel, !!layer.lockVisual);
    this.setPanelHidden(this.els.textPanel, layer.type !== "text");
    this.setPanelHidden(this.els.qrPanel, layer.type !== "qr");
    this.syncCommonControls(layer);
    this.syncTextControls(layer);
    this.syncQrControls(layer);
  }

  updateSelectedLayer(patch) {
    const layer = this.selectedLayer();
    if (!layer) return;
    Object.assign(layer, patch);

    // Regenerate QR Matrix if link or appearance changed
    if (layer.type === "qr" && (patch.link !== undefined || patch.dark !== undefined || patch.light !== undefined || patch.moduleShape !== undefined || patch.finderShape !== undefined)) {
      try {
        const link = normalizeUrlInput(layer.link);
        if (link) {
          layer.link = link;
          layer.matrix = makeQrMatrix(link);
        }
      } catch (e) {
        this.logDebug("QR REGEN FAILED", e.message);
      }
    }

    this.renderLayerList();
    this.syncControlsFromLayer();
    this.drawCanvas();
  }

  updateSelectedShadow(patch) {
    const layer = this.selectedLayer();
    if (!layer) return;
    Object.assign(layer.shadow, patch);
    this.syncControlsFromLayer();
    this.drawCanvas();
  }

  updateSelectedFilters(patch) {
    const layer = this.selectedLayer();
    if (!layer) return;
    layer.filters = { ...layer.filters, ...patch };
    this.syncControlsFromLayer();
    this.drawCanvas();
  }

  ensureImportedFontGroup() {
    let group = this.els.fontSelect.querySelector('optgroup[label="Imported"]');
    if (!group) {
      group = document.createElement("optgroup");
      group.label = "Imported";
      this.els.fontSelect.prepend(group);
    }
    return group;
  }

  async registerImportedFont({ familyName, fileName, mimeType, bytes }) {
    const fontUrl = this.trackObjectUrl(bytesToObjectUrl(bytes, mimeType));
    const face = new FontFace(familyName, `url("${fontUrl}")`);
    await face.load();
    document.fonts.add(face);
    this.importedFonts.set(familyName, { familyName, fileName, mimeType, bytes });
    const group = this.ensureImportedFontGroup();
    let option = [...group.querySelectorAll("option")].find((item) => item.value === familyName);
    if (!option) {
      option = document.createElement("option");
      option.value = familyName;
      option.textContent = familyName;
      group.appendChild(option);
    }
  }

  async importFontFile(file) {
    if (!file) return;
    this.importedFontCount += 1;
    const familyName = `${sanitizeFontName(file.name)} ${this.importedFontCount}`;
    try {
      const bytes = await fileToBytes(file);
      await this.registerImportedFont({
        familyName,
        fileName: file.name,
        mimeType: file.type || "font/ttf",
        bytes
      });
      this.els.fontSelect.value = familyName;
      if (this.selectedLayer()?.type === "text") this.updateSelectedLayer({ fontFamily: familyName });
      this.setStatus("FONT IMPORTED");
      this.logDebug("FONT IMPORTED", { file: file.name, family: familyName });
    } catch (error) {
      this.setStatus("FONT IMPORT FAILED");
      this.logDebug("FONT IMPORT FAILED", { file: file.name, message: error.message });
    } finally {
      this.els.fontImportInput.value = "";
    }
  }

  addTextLayer(defaults = {}) {
    const layer = {
      ...this.commonLayer("text", defaults.name || "Text"),
      text: defaults.text || "",
      fontFamily: defaults.fontFamily || "Orbitron",
      fontWeight: defaults.fontWeight || "900",
      fontSize: defaults.fontSize || 220,
      fill: defaults.fill || "#ffffff",
      stroke: defaults.stroke || "#000000",
      strokeWidth: defaults.strokeWidth ?? 4,
      uppercase: defaults.uppercase ?? true,
      align: defaults.align || "center",
      maxWidth: defaults.maxWidth || null,
      box: defaults.box ?? false,
      role: defaults.role || "text"
    };
    Object.assign(layer, defaults.common || {});
    this.layers.push(layer);
    this.selectedLayerId = layer.id;
    this.setStatus("TEXT LAYER ADDED");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
    return layer;
  }

  async readImageFile(file) {
    const bytes = await fileToBytes(file);
    return this.readImageBytes(bytes, file.type || "image/png", file.name);
  }

  async readImageBytes(bytes, mimeType, name) {
    const objectUrl = this.trackObjectUrl(bytesToObjectUrl(bytes, mimeType));
    const image = await loadImageFromUrl(objectUrl);
    return { image, bytes, mimeType, name };
  }

  async addImageLayerFromFile(file) {
    const asset = await this.readImageFile(file);
    return this.addImageLayerFromAsset(asset);
  }

  addImageLayerFromAsset(asset, defaults = {}) {
    const maxWidth = this.canvas.width * 0.82;
    const maxHeight = this.canvas.height * 0.82;
    const ratio = Math.min(maxWidth / asset.image.width, maxHeight / asset.image.height, 1);
    const layer = {
      ...this.commonLayer("image", defaults.name || asset.name.replace(/\.[^.]+$/, "") || "Image"),
      image: asset.image,
      baseWidth: defaults.baseWidth || asset.image.width * ratio,
      baseHeight: defaults.baseHeight || asset.image.height * ratio,
      sourceWidth: defaults.sourceWidth || asset.image.width,
      sourceHeight: defaults.sourceHeight || asset.image.height,
      sourceBytes: asset.bytes,
      sourceMimeType: asset.mimeType,
      sourceName: asset.name,
      clipRadius: defaults.clipRadius || 0,
      role: defaults.role || "image"
    };
    Object.assign(layer, defaults.common || {});
    if (defaults.lockVisual) {
      layer.filters = { hue: 0, saturation: 100, blur: 0 };
      layer.lockVisual = true;
      if (!defaults.common?.shadow) layer.shadow.enabled = false;
    }
    this.layers.push(layer);
    this.selectedLayerId = layer.id;
    this.exportName = layer.name || this.exportName;
    return layer;
  }

  addQrLayer(defaults = {}) {
    const rawLink = defaults.link || this.els.qrLink?.value.trim() || "https://example.com";
    const link = normalizeUrlInput(rawLink);
    if (!link) {
      this.setStatus("ENTER QR LINK");
      return null;
    }
    const parsed = new URL(link);
    const layer = {
      ...this.commonLayer("qr", defaults.name || "QR Code"),
      link: parsed.href,
      matrix: makeQrMatrix(parsed.href),
      dark: defaults.dark || this.els.qrDark?.value || "#000000",
      light: defaults.light || this.els.qrLight?.value || "#ffffff",
      moduleShape: defaults.moduleShape || this.els.qrModuleShape?.value || "square",
      finderShape: defaults.finderShape || this.els.qrFinderShape?.value || "square",
      baseSize: defaults.baseSize || Math.min(this.canvas.width, this.canvas.height) * 0.22,
      role: defaults.role || "qr"
    };
    Object.assign(layer, defaults.common || {});
    if (!defaults.common) {
      layer.x = this.canvas.width - layer.baseSize / 2 - this.canvas.width * 0.07;
      layer.y = this.canvas.height - layer.baseSize / 2 - this.canvas.width * 0.07;
    }
    if (!defaults.common?.shadow) layer.shadow.enabled = false;
    this.layers.push(layer);
    this.selectedLayerId = layer.id;
    this.setStatus("QR LAYER ADDED");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
    return layer;
  }

  canvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height
    };
  }

  getLayerAtPoint(point) {
    for (let i = this.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.layers[i];
      if (!layer.visible) continue;
      const bounds = this.layerBounds(layer);
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height) return layer;
    }
    return null;
  }

  reorderLayerStack(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const visualStack = [...this.layers].reverse();
    const sourceIndex = visualStack.findIndex((layer) => layer.id === sourceId);
    const targetIndex = visualStack.findIndex((layer) => layer.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const [sourceLayer] = visualStack.splice(sourceIndex, 1);
    visualStack.splice(targetIndex, 0, sourceLayer);
    this.layers = visualStack.reverse();
    this.selectedLayerId = sourceId;
    this.setStatus("LAYER STACK UPDATED");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
  }

  duplicateSelectedLayer() {
    const layer = this.selectedLayer();
    if (!layer) return;
    const copy = {
      ...layer,
      id: this.newId(),
      name: `${layer.name} copy`,
      x: layer.x + 36,
      y: layer.y + 36,
      filters: { ...layer.filters },
      shadow: { ...layer.shadow }
    };
    this.layers.push(copy);
    this.selectedLayerId = copy.id;
    this.setStatus("LAYER DUPLICATED");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
  }

  deleteSelectedLayer() {
    const layer = this.selectedLayer();
    if (!layer) return;
    this.layers = this.layers.filter((item) => item.id !== layer.id);
    this.selectedLayerId = this.layers.at(-1)?.id || null;
    this.setStatus("LAYER DELETED");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
  }

  moveSelectedLayerToEdge(edge) {
    const layer = this.selectedLayer();
    if (!layer) return;
    this.layers = this.layers.filter((item) => item.id !== layer.id);
    if (edge === "front") this.layers.push(layer);
    else this.layers.unshift(layer);
    this.setStatus(edge === "front" ? "MOVED TO FRONT" : "MOVED TO BACK");
    this.renderLayerList();
    this.drawCanvas();
  }

  centerSelectedLayer(axis) {
    const layer = this.selectedLayer();
    if (!layer) return;
    if (axis === "horizontal" || axis === "both") layer.x = this.canvas.width / 2;
    if (axis === "vertical" || axis === "both") layer.y = this.canvas.height / 2;
    this.setStatus(`CENTERED ${axis.toUpperCase()}`);
    this.syncControlsFromLayer();
    this.drawCanvas();
  }

  hideContextMenu() {
    if (!this.els.canvasContextMenu) return;
    this.els.canvasContextMenu.classList.remove("open");
    this.els.canvasContextMenu.setAttribute("aria-hidden", "true");
  }

  cleanCanvasDataUrl() {
    this.drawCanvas({ showSelection: false, showGuides: false });
    const dataUrl = this.canvas.toDataURL("image/png");
    this.drawCanvas();
    return dataUrl;
  }

  openOutputModal() {
    if (!this.els.outputModal) return;
    this.els.exportName.value = this.exportName || "promotion-graphic";
    this.els.outputModal.classList.add("open");
    this.els.outputModal.setAttribute("aria-hidden", "false");
  }

  closeOutputModal() {
    if (!this.els.outputModal) return;
    this.els.outputModal.classList.remove("open");
    this.els.outputModal.setAttribute("aria-hidden", "true");
  }

  exportCurrentFile() {
    const link = document.createElement("a");
    const filename = sanitizeFileName(this.els.exportName.value.trim() || this.exportName || "promotion-graphic", "promotion-graphic");
    link.download = `${filename}.png`;
    link.href = this.cleanCanvasDataUrl();
    link.click();
    this.setStatus("PNG EXPORTED");
  }

  printCurrentLayout() {
    const dataUrl = this.cleanCanvasDataUrl();
    const width = this.canvas.width;
    const height = this.canvas.height;
    const isCanvasLandscape = width > height;
    const layout = this.els.printLayout.value;
    const pageSize = this.els.printPageSize.value === "a4" ? "A4" : "Letter";
    const cutLines = this.els.printCutLines.checked;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      this.setStatus("PRINT WINDOW BLOCKED");
      return;
    }
    const sheetClass = layout === "four" ? "sheet four-up" : "sheet single-up";
    const items = layout === "four"
      ? Array.from({ length: 4 }, () => `<div class="cell"><img src="${dataUrl}" alt="Flyer"></div>`).join("")
      : `<div class="cell"><img src="${dataUrl}" alt="Flyer"></div>`;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Flyer</title>
        <style>
          @page { size: ${pageSize} ${layout === "single" && isCanvasLandscape ? "landscape" : "portrait"}; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; overflow: hidden; }
          .sheet { width: 100%; height: 100%; background: #fff; page-break-inside: avoid; }
          .single-up { display: flex; align-items: center; justify-content: center; }
          .four-up { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; height: 100%; }
          .cell { align-items: center; display: flex; justify-content: center; min-width: 0; min-height: 0; overflow: hidden; position: relative; width: 100%; height: 100%; }
          .four-up.cut-lines .cell { border: 0.5pt dashed #999; }
          img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
          @media print {
            html, body, .sheet { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
          }
        </style>
      </head>
      <body>
        <div class="${sheetClass}${cutLines ? " cut-lines" : ""}">${items}</div>
        <script>
          const images = Array.from(document.querySelectorAll("img"));
          Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => image.addEventListener("load", resolve, { once: true })))).then(() => {
            window.focus();
            window.print();
          });
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    this.setStatus(layout === "four" ? "4-UP PRINT READY" : "PRINT READY");
  }

  showContextMenu(event, layer) {
    this.selectedLayerId = layer.id;
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
    const panelRect = document.querySelector(".stage-panel").getBoundingClientRect();
    const menu = this.els.canvasContextMenu;
    menu.classList.add("open");
    menu.setAttribute("aria-hidden", "false");
    const menuWidth = menu.offsetWidth || 190;
    const menuHeight = menu.offsetHeight || 250;
    const x = Math.min(event.clientX - panelRect.left, panelRect.width - menuWidth - 8);
    const y = Math.min(event.clientY - panelRect.top, panelRect.height - menuHeight - 8);
    menu.style.left = `${Math.max(8, x)}px`;
    menu.style.top = `${Math.max(8, y)}px`;
  }

  applyCanvasSize(width, height, selectedValue = `${width}x${height}`) {
    const oldWidth = this.canvas.width;
    const oldHeight = this.canvas.height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.layers = this.layers.map((layer) => ({
      ...layer,
      x: (layer.x / oldWidth) * width,
      y: (layer.y / oldHeight) * height
    }));
    if (this.els.formatSelect) this.els.formatSelect.value = selectedValue;
    if (this.els.customWidth) this.els.customWidth.value = width;
    if (this.els.customHeight) this.els.customHeight.value = height;
    this.syncGuideInputLimits();
    this.renderGuideList();
    this.syncControlsFromLayer();
    this.updateCustomSizeVisibility();
    this.setStatus("CANVAS SIZE UPDATED");
    this.drawCanvas();
  }

  imageLayerSourceSize(layer) {
    const width = Math.round(Number(layer.sourceWidth || layer.image?.naturalWidth || layer.image?.width || layer.baseWidth) || 0);
    const height = Math.round(Number(layer.sourceHeight || layer.image?.naturalHeight || layer.image?.height || layer.baseHeight) || 0);
    return { width, height };
  }

  biggestImageLayer() {
    return this.layers
      .filter((layer) => layer.type === "image")
      .map((layer) => ({ layer, size: this.imageLayerSourceSize(layer) }))
      .filter((entry) => entry.size.width > 0 && entry.size.height > 0)
      .sort((a, b) => (b.size.width * b.size.height) - (a.size.width * a.size.height))[0] || null;
  }

  syncCanvasToBiggestImageLayer() {
    const entry = this.biggestImageLayer();
    if (!entry) {
      this.setStatus("ADD IMAGE LAYER FIRST");
      return false;
    }
    const width = entry.size.width;
    const height = entry.size.height;
    this.applyCanvasSize(width, height, "custom");
    const layer = this.layers.find((item) => item.id === entry.layer.id);
    if (layer) {
      layer.baseWidth = width;
      layer.baseHeight = height;
      layer.scale = 100;
      layer.x = width / 2;
      layer.y = height / 2;
      this.selectedLayerId = layer.id;
    }
    this.setStatus("CANVAS MATCHED BIGGEST IMAGE");
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.drawCanvas();
    return true;
  }

  updateCustomSizeVisibility() {
    const isCustom = this.els.formatSelect?.value === "custom";
    this.setPanelHidden(this.els.customSizeRow, !isCustom);
  }

  async savePreset() {
    const imageAssets = [];
    const fontAssets = [];
    const fontPaths = new Map();
    const usedFonts = new Set(this.layers.filter((layer) => layer.type === "text").map((layer) => layer.fontFamily));
    [...usedFonts].forEach((family) => {
      const asset = this.importedFonts.get(family);
      if (!asset) return;
      const path = `assets/fonts/${sanitizeFileName(asset.familyName, "font")}.${fileExtension(asset.fileName, "woff2")}`;
      fontPaths.set(family, path);
      fontAssets.push({ name: path, bytes: asset.bytes });
    });

    const layerManifest = this.layers.map((layer, index) => {
      const base = {
        id: layer.id,
        type: layer.type,
        name: layer.name,
        x: layer.x,
        y: layer.y,
        scale: layer.scale,
        opacity: layer.opacity,
        visible: layer.visible,
        locked: !!layer.locked,
        filters: layer.filters,
        shadow: layer.shadow,
        role: layer.role || null
      };
      if (layer.type === "text") {
        return {
          ...base,
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontWeight: layer.fontWeight,
          fontSize: layer.fontSize,
          fill: layer.fill,
          stroke: layer.stroke,
          strokeWidth: layer.strokeWidth,
          uppercase: layer.uppercase,
          align: layer.align,
          maxWidth: layer.maxWidth,
          box: layer.box,
          fontAssetPath: fontPaths.get(layer.fontFamily) || null
        };
      }
      if (layer.type === "image") {
        const path = `https://raw.githubusercontent.com/Moonfire-dreamwalkers/horrorcore-reshare-public-assets/main/images/${String(index + 1).padStart(2, "0")}-${sanitizeFileName(layer.sourceName || layer.name, "image")}.${fileExtension(layer.sourceName || layer.name, "png")}`;
        imageAssets.push({ name: path, bytes: layer.sourceBytes });
        return {
          ...base,
          baseWidth: layer.baseWidth,
          baseHeight: layer.baseHeight,
          sourceWidth: layer.sourceWidth || layer.image?.width || layer.baseWidth,
          sourceHeight: layer.sourceHeight || layer.image?.height || layer.baseHeight,
          sourceName: layer.sourceName,
          sourceMimeType: layer.sourceMimeType,
          assetPath: path,
          clipRadius: layer.clipRadius || 0,
          lockVisual: !!layer.lockVisual
        };
      }
      return {
        ...base,
        link: layer.link,
        dark: layer.dark,
        light: layer.light,
        moduleShape: layer.moduleShape,
        finderShape: layer.finderShape,
        baseSize: layer.baseSize
      };
    });

    const manifest = {
      version: 1,
      mode: this.config.mode,
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        background: this.els.canvasColor.value,
        sizeValue: this.els.formatSelect.value
      },
      output: {
        exportName: this.exportName,
        snapGuides: !!this.els.snapGuidesToggle?.checked
      },
      guides: this.guides,
      layers: layerManifest
    };

    const archive = createPresetArchive([
      { name: "manifest.json", bytes: stringToBytes(JSON.stringify(manifest, null, 2)) },
      ...imageAssets,
      ...fontAssets
    ]);
    const link = document.createElement("a");
    const url = URL.createObjectURL(archive);
    link.href = url;
    link.download = `${sanitizeFileName(this.exportName || "promotion-project", "promotion-project")}.ptpreset`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.setStatus("PRESET SAVED");
    this.logDebug("PRESET SAVED", { layers: this.layers.length, guides: this.guides.length });
  }

  async loadPreset(file) {
    const files = await readPresetArchive(file);
    const manifestBytes = files.get("manifest.json");
    if (!manifestBytes) throw new Error("Preset manifest not found.");
    const manifest = JSON.parse(bytesToString(manifestBytes));
    this.revokeTrackedObjectUrls();
    this.layers = [];
    this.guides = manifest.guides || [];
    this.selectedLayerId = null;
    this.exportName = manifest.output?.exportName || "promotion";
    this.els.canvasColor.value = manifest.canvas?.background || "#000000";
    this.applyCanvasSize(manifest.canvas.width, manifest.canvas.height, manifest.canvas.sizeValue || `${manifest.canvas.width}x${manifest.canvas.height}`);
    if (this.els.snapGuidesToggle) this.els.snapGuidesToggle.checked = !!manifest.output?.snapGuides;

    for (const layer of manifest.layers || []) {
      if (layer.fontAssetPath) {
        const fontBytes = files.get(layer.fontAssetPath);
        if (fontBytes) {
          await this.registerImportedFont({
            familyName: layer.fontFamily,
            fileName: layer.fontAssetPath.split("/").at(-1),
            mimeType: `font/${fileExtension(layer.fontAssetPath, "woff2")}`,
            bytes: fontBytes
          });
        }
      }
    }

    for (const layer of manifest.layers || []) {
      if (layer.type === "text") {
        this.addTextLayer({
          name: layer.name,
          text: layer.text,
          fontFamily: layer.fontFamily,
          fontWeight: layer.fontWeight,
          fontSize: layer.fontSize,
          fill: layer.fill,
          stroke: layer.stroke,
          strokeWidth: layer.strokeWidth,
          uppercase: layer.uppercase,
          box: layer.box,
          common: layer,
          role: layer.role
        });
      } else if (layer.type === "image") {
        const bytes = files.get(layer.assetPath);
        if (!bytes) continue;
        const asset = await this.readImageBytes(bytes, layer.sourceMimeType || "image/png", layer.sourceName || layer.name);
        this.addImageLayerFromAsset(asset, {
          name: layer.name,
          baseWidth: layer.baseWidth,
          baseHeight: layer.baseHeight,
          sourceWidth: layer.sourceWidth,
          sourceHeight: layer.sourceHeight,
          common: layer,
          role: layer.role,
          lockVisual: layer.lockVisual
        });
      } else if (layer.type === "qr") {
        this.addQrLayer({
          name: layer.name,
          link: layer.link,
          dark: layer.dark,
          light: layer.light,
          moduleShape: layer.moduleShape,
          finderShape: layer.finderShape,
          baseSize: layer.baseSize,
          common: layer,
          role: layer.role
        });
      }
    }
    this.selectedLayerId = this.layers.at(-1)?.id || null;
    this.syncControlsFromLayer();
    this.renderLayerList();
    this.renderGuideList();
    this.drawCanvas();
    this.setStatus("PRESET LOADED");
    this.logDebug("PRESET LOADED", { layers: this.layers.length, guides: this.guides.length });
  }

  updateQrLayerFromControls() {
    const layer = this.selectedLayer();
    if (!layer || layer.type !== "qr") {
      this.setStatus("SELECT QR LAYER");
      return;
    }
    const rawLink = this.els.qrLink.value.trim();
    const link = normalizeUrlInput(rawLink || layer.link);
    try {
      const parsed = new URL(link);
      layer.link = parsed.href;
      layer.matrix = makeQrMatrix(parsed.href);
      layer.dark = this.els.qrDark.value;
      layer.light = this.els.qrLight.value;
      layer.moduleShape = this.els.qrModuleShape.value;
      layer.finderShape = this.els.qrFinderShape.value;
      this.els.qrLink.value = parsed.href;
      this.setStatus("QR LAYER UPDATED");
      this.renderLayerList();
      this.drawCanvas();
    } catch (error) {
      this.logDebug("QR UPDATE FAILED", { message: error.message });
      this.setStatus(error.message.includes("long") ? "QR LINK TOO LONG" : "INVALID QR LINK");
    }
  }

  scheduleQrUpdate() {
    window.clearTimeout(this.qrUpdateTimer);
    this.qrUpdateTimer = window.setTimeout(() => {
      const layer = this.selectedLayer();
      if (layer?.type === "qr") this.updateQrLayerFromControls();
    }, 650);
  }

  toggleLayerVisibility(layerId) {
    const layer = this.layers.find((item) => item.id === layerId);
    if (!layer) return;
    layer.visible = !layer.visible;
    this.renderLayerList();
    this.drawCanvas();
  }

  attachEvents() {
    bootLog("ATTACH EVENTS START", { mode: this.config.mode });
    this.els.formatSelect?.addEventListener("change", () => {
      this.updateCustomSizeVisibility();
      if (this.els.formatSelect.value === "custom") return;
      const [width, height] = this.els.formatSelect.value.split("x").map(Number);
      this.applyCanvasSize(width, height, this.els.formatSelect.value);
    });
    this.els.applyCustomSizeBtn?.addEventListener("click", () => {
      const width = clamp(Number(this.els.customWidth.value) || this.canvas.width, 64, 10000);
      const height = clamp(Number(this.els.customHeight.value) || this.canvas.height, 64, 10000);
      this.applyCanvasSize(width, height, "custom");
    });
    this.els.autoCanvasFromImageToggle?.addEventListener("change", () => {
      if (this.els.autoCanvasFromImageToggle.checked) this.syncCanvasToBiggestImageLayer();
    });
    this.els.canvasColor?.addEventListener("input", () => this.drawCanvas());
    this.els.addImageBtn?.addEventListener("click", () => this.els.imageInput.click());
    this.els.addTextBtn?.addEventListener("click", () => this.addTextLayer());
    this.els.addQrBtn?.addEventListener("click", () => this.addQrLayer());
    this.els.guideOrientation?.addEventListener("change", () => this.syncGuideInputLimits());
    this.els.guideUnit?.addEventListener("change", () => {
      this.syncGuideInputLimits();
      this.els.guidePosition.value = this.els.guideUnit.value === "percent" ? 50 : Math.round((this.els.guideOrientation.value === "vertical" ? this.canvas.width : this.canvas.height) / 2);
    });
    this.els.centerGuideBtn?.addEventListener("click", () => {
      this.els.guidePosition.value = this.els.guideUnit.value === "percent" ? 50 : Math.round((this.els.guideOrientation.value === "vertical" ? this.canvas.width : this.canvas.height) / 2);
    });
    this.els.addGuideBtn?.addEventListener("click", () => this.addGuide());
    this.els.guideList?.addEventListener("change", (event) => {
      const activeId = event.target.dataset.guideActive;
      const visibleId = event.target.dataset.guideVisible;
      if (activeId) {
        const guide = this.guides.find((item) => item.id === activeId);
        if (guide) guide.active = event.target.checked;
      }
      if (visibleId) {
        const guide = this.guides.find((item) => item.id === visibleId);
        if (guide) guide.visible = event.target.checked;
      }
      this.drawCanvas();
    });
    this.els.guideList?.addEventListener("click", (event) => {
      const deleteId = event.target.dataset.guideDelete;
      if (!deleteId) return;
      this.guides = this.guides.filter((guide) => guide.id !== deleteId);
      this.renderGuideList();
      this.drawCanvas();
    });
    this.els.presetSaveBtn?.addEventListener("click", () => this.savePreset().catch((error) => {
      this.setStatus("PRESET SAVE FAILED");
      this.logDebug("PRESET SAVE FAILED", error.message);
    }));
    this.els.presetLoadBtn?.addEventListener("click", () => this.els.presetInput?.click());
    this.els.presetInput?.addEventListener("change", async () => {
      const file = this.els.presetInput.files?.[0];
      if (!file) return;
      try {
        await this.loadPreset(file);
      } catch (error) {
        this.setStatus("PRESET LOAD FAILED");
        this.logDebug("PRESET LOAD FAILED", error.message);
      } finally {
        this.els.presetInput.value = "";
      }
    });

    this.els.mobileCenterHBtn?.addEventListener("click", () => this.centerSelectedLayer("horizontal"));
    this.els.mobileCenterVBtn?.addEventListener("click", () => this.centerSelectedLayer("vertical"));
    this.els.mobileLockBtn?.addEventListener("click", () => {
      const layer = this.selectedLayer();
      if (!layer) return;
      layer.locked = !layer.locked;
      this.syncControlsFromLayer();
      this.renderLayerList();
    });

    this.els.duplicateLayerBtn?.addEventListener("click", () => this.duplicateSelectedLayer());
    this.els.updateQrBtn?.addEventListener("click", () => this.updateQrLayerFromControls());
    this.els.qrLink?.addEventListener("input", () => this.scheduleQrUpdate());
    this.els.qrLink?.addEventListener("blur", () => {
      window.clearTimeout(this.qrUpdateTimer);
      if (this.selectedLayer()?.type === "qr") this.updateQrLayerFromControls();
    });
    this.els.qrDark?.addEventListener("input", () => {
      const layer = this.selectedLayer();
      if (!layer || layer.type !== "qr") return;
      layer.dark = this.els.qrDark.value;
      this.drawCanvas();
    });
    this.els.qrLight?.addEventListener("input", () => {
      const layer = this.selectedLayer();
      if (!layer || layer.type !== "qr") return;
      layer.light = this.els.qrLight.value;
      this.drawCanvas();
    });
    this.els.qrModuleShape?.addEventListener("change", () => {
      const layer = this.selectedLayer();
      if (!layer || layer.type !== "qr") return;
      layer.moduleShape = this.els.qrModuleShape.value;
      this.drawCanvas();
    });
    this.els.qrFinderShape?.addEventListener("change", () => {
      const layer = this.selectedLayer();
      if (!layer || layer.type !== "qr") return;
      layer.finderShape = this.els.qrFinderShape.value;
      this.drawCanvas();
    });
    this.els.copyDebugBtn?.addEventListener("click", async () => {
      const text = this.debugEntries.join("\n");
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(text);
        this.setStatus("DEBUG LOG COPIED");
        this.logDebug("DEBUG LOG COPIED");
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(this.els.debugLog);
        selection.removeAllRanges();
        selection.addRange(range);
        this.setStatus("DEBUG LOG SELECTED");
        this.logDebug("DEBUG COPY FALLBACK SELECTED TEXT");
      }
    });
    this.els.imageInput?.addEventListener("change", async () => {
      const files = Array.from(this.els.imageInput.files || []);
      if (!files.length) return;
      try {
        for (const file of files) await this.addImageLayerFromFile(file);
        if (this.els.autoCanvasFromImageToggle?.checked) {
          this.syncCanvasToBiggestImageLayer();
        } else {
          this.setStatus(`${files.length} IMAGE LAYER${files.length === 1 ? "" : "S"} ADDED`);
          this.syncControlsFromLayer();
          this.renderLayerList();
          this.drawCanvas();
        }
      } catch (error) {
        this.setStatus("IMAGE IMPORT FAILED");
        this.logDebug("IMAGE IMPORT FAILED", error.message);
      } finally {
        this.els.imageInput.value = "";
      }
    });

    this.els.layerList?.addEventListener("click", (event) => {
      const layerId = event.target.dataset.layerVisibility;
      if (layerId) this.toggleLayerVisibility(layerId);
    });

    this.els.layerOpacity?.addEventListener("input", () => { this.updateOutput(this.els.layerOpacity, this.els.layerOpacityValue); this.updateSelectedLayer({ opacity: Number(this.els.layerOpacity.value) }); });
    this.els.layerX?.addEventListener("input", () => { this.updateOutput(this.els.layerX, this.els.layerXValue); this.updateSelectedLayer({ x: Number(this.els.layerX.value) }); });
    this.els.layerY?.addEventListener("input", () => { this.updateOutput(this.els.layerY, this.els.layerYValue); this.updateSelectedLayer({ y: Number(this.els.layerY.value) }); });
    this.els.layerScale?.addEventListener("input", () => { this.updateOutput(this.els.layerScale, this.els.layerScaleValue); this.updateSelectedLayer({ scale: Number(this.els.layerScale.value) }); });
    this.els.qrScale?.addEventListener("input", () => { this.updateOutput(this.els.qrScale, this.els.qrScaleValue); this.updateSelectedLayer({ scale: Number(this.els.qrScale.value) }); });
    this.els.layerHue?.addEventListener("input", () => { this.updateOutput(this.els.layerHue, this.els.layerHueValue); this.updateSelectedFilters({ hue: Number(this.els.layerHue.value) }); });
    this.els.layerSaturation?.addEventListener("input", () => { this.updateOutput(this.els.layerSaturation, this.els.layerSaturationValue); this.updateSelectedFilters({ saturation: Number(this.els.layerSaturation.value) }); });
    this.els.layerBlur?.addEventListener("input", () => { this.updateOutput(this.els.layerBlur, this.els.layerBlurValue); this.updateSelectedFilters({ blur: Number(this.els.layerBlur.value) }); });
    this.els.textContent?.addEventListener("input", () => this.updateSelectedLayer({ text: this.els.textContent.value }));
    this.els.fontSelect?.addEventListener("change", () => this.updateSelectedLayer({ fontFamily: this.els.fontSelect.value }));
    this.els.importFontBtn?.addEventListener("click", () => this.els.fontImportInput.click());
    this.els.fontImportInput?.addEventListener("change", () => this.importFontFile(this.els.fontImportInput.files?.[0]));
    this.els.fontWeight?.addEventListener("change", () => this.updateSelectedLayer({ fontWeight: this.els.fontWeight.value }));
    this.els.fontSize?.addEventListener("input", () => { this.updateOutput(this.els.fontSize, this.els.fontSizeValue); this.updateSelectedLayer({ fontSize: Number(this.els.fontSize.value) }); });
    this.els.textColor?.addEventListener("input", () => this.updateSelectedLayer({ fill: this.els.textColor.value }));
    this.els.strokeColor?.addEventListener("input", () => this.updateSelectedLayer({ stroke: this.els.strokeColor.value }));
    this.els.strokeWidth?.addEventListener("input", () => { this.updateOutput(this.els.strokeWidth, this.els.strokeWidthValue); this.updateSelectedLayer({ strokeWidth: Number(this.els.strokeWidth.value) }); });
    this.els.uppercaseToggle?.addEventListener("change", () => this.updateSelectedLayer({ uppercase: this.els.uppercaseToggle.checked }));
    this.els.boxToggle?.addEventListener("change", () => this.updateSelectedLayer({ box: this.els.boxToggle.checked }));
    this.els.shadowToggle?.addEventListener("change", () => this.updateSelectedShadow({ enabled: this.els.shadowToggle.checked }));
    this.els.shadowColor?.addEventListener("input", () => this.updateSelectedShadow({ color: this.els.shadowColor.value }));
    this.els.shadowBlur?.addEventListener("input", () => { this.updateOutput(this.els.shadowBlur, this.els.shadowBlurValue); this.updateSelectedShadow({ blur: Number(this.els.shadowBlur.value) }); });
    this.els.shadowOpacity?.addEventListener("input", () => { this.updateOutput(this.els.shadowOpacity, this.els.shadowOpacityValue); this.updateSelectedShadow({ opacity: Number(this.els.shadowOpacity.value) }); });
    this.els.shadowX?.addEventListener("input", () => { this.updateOutput(this.els.shadowX, this.els.shadowXValue); this.updateSelectedShadow({ offsetX: Number(this.els.shadowX.value) }); });
    this.els.shadowY?.addEventListener("input", () => { this.updateOutput(this.els.shadowY, this.els.shadowYValue); this.updateSelectedShadow({ offsetY: Number(this.els.shadowY.value) }); });
    this.els.deleteLayerBtn?.addEventListener("click", () => this.deleteSelectedLayer());
    this.els.openOutputBtn?.addEventListener("click", () => this.openOutputModal());
    this.els.closeOutputBtn?.addEventListener("click", () => this.closeOutputModal());
    this.els.exportFileBtn?.addEventListener("click", () => this.exportCurrentFile());
    this.els.printFromModalBtn?.addEventListener("click", () => this.printCurrentLayout());
    this.els.outputModal?.addEventListener("click", (event) => { if (event.target === this.els.outputModal) this.closeOutputModal(); });

    this.canvas.addEventListener("pointerdown", (event) => {
      this.hideContextMenu();

      this.activePointers = this.activePointers || new Map();
      this.activePointers.set(event.pointerId, event);

      if (this.activePointers.size === 2) {
        const selected = this.selectedLayer();
        if (selected && !selected.locked) {
          const pts = Array.from(this.activePointers.values());
          const dx = pts[0].clientX - pts[1].clientX;
          const dy = pts[0].clientY - pts[1].clientY;
          this.initialPinchDist = Math.hypot(dx, dy);
          this.initialLayerScale = selected.scale;
          this.dragging = null;
        }
        return;
      }
      if (this.activePointers.size > 2) return;

      const point = this.canvasPoint(event);
      const layer = this.getLayerAtPoint(point);

      // Double Action Check (Standard for desktop, helps with touch too)
      const now = Date.now();
      const isDouble = (now - (this.lastPointerDownTime || 0)) < 300;
      this.lastPointerDownTime = now;

      if (isDouble && layer) {
        if (layer.type === "qr") {
          const newUrl = prompt("Enter new URL for QR code:", layer.link || "");
          if (newUrl !== null && newUrl !== undefined) {
            this.updateSelectedLayer({ link: newUrl });
            this.syncControlsFromLayer();
            this.drawCanvas();
            this.setStatus("QR LINK UPDATED");
          }
          return;
        } else if (layer.type === "text") {
          const newText = prompt("Enter new text content:", layer.text || "");
          if (newText !== null && newText !== undefined) {
            this.updateSelectedLayer({ text: newText });
            this.syncControlsFromLayer();
            this.drawCanvas();
            this.setStatus("TEXT UPDATED");
          }
          return;
        }
      }

      if (!layer) return;
      this.selectedLayerId = layer.id;
      this.syncControlsFromLayer();
      this.renderLayerList();
      if (layer.locked) return;
      this.dragging = {
        id: layer.id,
        offsetX: point.x - layer.x,
        offsetY: point.y - layer.y
      };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const point = this.canvasPoint(event);
      const layer = this.getLayerAtPoint(point);
      if (!layer) {
        this.hideContextMenu();
        return;
      }
      this.showContextMenu(event, layer);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.activePointers?.has(event.pointerId)) {
        this.activePointers.set(event.pointerId, event);
      }

      if (this.activePointers?.size === 2 && this.initialPinchDist) {
        const layer = this.selectedLayer();
        if (!layer || layer.locked) return;
        const pts = Array.from(this.activePointers.values());
        const dx = pts[0].clientX - pts[1].clientX;
        const dy = pts[0].clientY - pts[1].clientY;
        const dist = Math.hypot(dx, dy);
        const ratio = dist / this.initialPinchDist;
        const newScale = clamp(this.initialLayerScale * ratio, 10, 250);
        layer.scale = newScale;
        this.syncCommonControls(layer);
        if (layer.type === "qr" && this.els.qrScale) {
          this.els.qrScale.value = Math.round(layer.scale);
          if (this.els.qrScaleValue) this.els.qrScaleValue.value = Math.round(layer.scale);
        }
        this.drawCanvas();
        return;
      }

      if (!this.dragging) return;
      const layer = this.layers.find((item) => item.id === this.dragging.id);
      if (!layer) return;
      const point = this.canvasPoint(event);
      const snapped = this.snapPointToGuides(point.x - this.dragging.offsetX, point.y - this.dragging.offsetY);
      layer.x = clamp(snapped.x, 0, this.canvas.width);
      layer.y = clamp(snapped.y, 0, this.canvas.height);
      this.syncCommonControls(layer);
      this.drawCanvas();
    });
    this.canvas.addEventListener("pointerup", (event) => {
      this.activePointers?.delete(event.pointerId);
      if (!this.activePointers || this.activePointers.size < 2) {
        this.initialPinchDist = null;
        this.initialLayerScale = null;
      }
      if (!this.dragging) return;
      this.dragging = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointercancel", (event) => { 
      this.activePointers?.delete(event.pointerId);
      if (!this.activePointers || this.activePointers.size < 2) {
        this.initialPinchDist = null;
        this.initialLayerScale = null;
      }
      this.dragging = null; 
    });
    this.els.canvasContextMenu?.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const action = button.dataset.action;
      if (action === "center-horizontal") this.centerSelectedLayer("horizontal");
      if (action === "center-vertical") this.centerSelectedLayer("vertical");
      if (action === "center-both") this.centerSelectedLayer("both");
      if (action === "duplicate") this.duplicateSelectedLayer();
      if (action === "delete") this.deleteSelectedLayer();
      if (action === "front") this.moveSelectedLayerToEdge("front");
      if (action === "back") this.moveSelectedLayerToEdge("back");
      this.hideContextMenu();
    });
    document.addEventListener("click", (event) => {
      if (!this.els.canvasContextMenu?.contains(event.target)) this.hideContextMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.hideContextMenu();
    });
    window.addEventListener("scroll", () => this.hideContextMenu(), true);
    window.addEventListener("resize", () => this.hideContextMenu());

    bootLog("ATTACH EVENTS COMPLETE", { mode: this.config.mode });
  }
}

window.PromotionTool = {
  SIZE_PRESETS,
  createFlyerBuilder
};

bootLog("CORE SCRIPT READY");
})();
