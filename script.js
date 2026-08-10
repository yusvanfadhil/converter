// === Konfigurasi PDF.js ===
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// === State Aplikasi ===
const state = {
  files: [] // Menyimpan objek: { id, file, status, progress, pageCount, duration, docxBlob, textPreview, error }
};

// === Element references ===
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const convertBtn = document.getElementById('convertBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn = document.getElementById('clearBtn');
const toastContainer = document.getElementById('toastContainer');
const optPageBreak = document.getElementById('optPageBreak');
const optHeading = document.getElementById('optHeading');
const optMode = document.getElementById('optMode');

// === Utility Functions ===
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// === Toast Notification ===
function toast(type, title, msg, duration = 4000) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { 
    success: 'fa-circle-check', 
    error: 'fa-circle-exclamation', 
    info: 'fa-circle-info' 
  };
  
  t.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
  `;
  
  toastContainer.appendChild(t);
  
  setTimeout(() => {
    t.classList.add('removing');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// === File Handling ===
function handleFiles(files) {
  const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  
  if (pdfFiles.length === 0) {
    toast('error', 'Format tidak didukung', 'Pastikan Anda hanya memilih file PDF.');
    return;
  }

  let addedCount = 0;
  pdfFiles.forEach(file => {
    if (file.size > 50 * 1024 * 1024) {
      toast('error', 'Ukuran file terlalu besar', `${file.name} melebihi batas 50 MB.`);
      return;
    }

    state.files.push({
      id: generateId(),
      file,
      status: 'queued',
      progress: 0,
      pageCount: 0,
      duration: null,
      docxBlob: null,
      textPreview: '',
      error: null
    });
    addedCount++;
  });

  if (addedCount > 0) {
    toast('success', `${addedCount} file ditambahkan`, 'Klik "Konversi Semua" untuk memulai.');
  }
  
  renderFileList();
  updateButtons();
}

function removeFile(id) {
  state.files = state.files.filter(f => f.id !== id);
  renderFileList();
  updateButtons();
}

function clearAll() {
  if (state.files.some(f => f.status === 'processing')) {
    toast('info', 'Sedang memproses', 'Tunggu hingga konversi selesai.');
    return;
  }
  state.files = [];
  renderFileList();
  updateButtons();
  toast('info', 'Dibersihkan', 'Daftar file telah dikosongkan.');
}

// === UI Rendering ===
function renderFileList() {
  if (state.files.length === 0) {
    fileList.innerHTML = '';
    return;
  }

  fileList.innerHTML = state.files.map(item => {
    const statusText = {
      queued: 'Antri',
      processing: 'Memproses',
      done: 'Selesai',
      error: 'Gagal'
    }[item.status];

    return `
      <div class="file-item ${item.status}" data-id="${item.id}">
        <div class="file-icon">PDF</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(item.file.name)}</div>
          <div class="file-meta">
            <span>${formatBytes(item.file.size)}</span>
            ${item.pageCount ? `<span>• ${item.pageCount} halaman</span>` : ''}
            ${item.duration ? `<span>• ${item.duration}</span>` : ''}
            ${item.error ? `<span style="color: var(--danger)">• ${escapeHtml(item.error)}</span>` : ''}
          </div>
          ${item.status === 'processing' ? `
            <div class="file-progress">
              <div class="file-progress-bar" style="width: ${item.progress}%"></div>
            </div>
          ` : ''}
        </div>
        <div class="file-status">
          <span class="status-pill ${item.status}">${statusText}</span>
        </div>
        <div class="file-actions">
          ${item.status === 'done' ? `
            <button class="icon-btn preview" data-action="preview" data-id="${item.id}" title="Pratinjau Teks">
              <i class="fa-solid fa-eye"></i>
            </button>
            <button class="icon-btn download" data-action="download" data-id="${item.id}" title="Unduh DOCX">
              <i class="fa-solid fa-download"></i>
            </button>
          ` : ''}
          ${item.status !== 'processing' ? `
            <button class="icon-btn" data-action="remove" data-id="${item.id}" title="Hapus">
              <i class="fa-solid fa-xmark"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function updateButtons() {
  const hasFiles = state.files.length > 0;
  const hasDone = state.files.some(f => f.status === 'done');
  const isProcessing = state.files.some(f => f.status === 'processing');
  const hasQueued = state.files.some(f => f.status === 'queued' || f.status === 'error');

  convertBtn.disabled = !hasFiles || isProcessing || !hasQueued;
  downloadAllBtn.disabled = !hasDone;
  clearBtn.disabled = !hasFiles || isProcessing;
}

// === Conversion Logic ===
async function convertAll() {
  const toConvert = state.files.filter(f => f.status === 'queued' || f.status === 'error');
  if (toConvert.length === 0) return;

  convertBtn.disabled = true;
  clearBtn.disabled = true;

  for (const item of toConvert) {
    await convertPdfToWord(item);
  }

  toast('success', 'Konversi Selesai', 'Semua file berhasil diproses.');
  updateButtons();
}

async function convertPdfToWord(item) {
  try {
    item.status = 'processing';
    item.progress = 0;
    item.error = null;
    renderFileList();

    const startTime = performance.now();
    const arrayBuffer = await item.file.arrayBuffer();
    
    // Load PDF document
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    item.pageCount = pdf.numPages;
    renderFileList();

    const mode = optMode.value;
    const pageBreak = optPageBreak.checked;
    const detectHeading = optHeading.checked;

    const paragraphs = [];
    let fullTextPreview = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let pageText = '';
      let currentY = null;
      let lineText = '';

      // Urutkan item teks berdasarkan posisi Y (atas ke bawah) lalu X (kiri ke kanan)
      const items = textContent.items.sort((a, b) => {
        const yDiff = Math.abs(a.transform[5] - b.transform[5]);
        if (yDiff < 5) {
          return a.transform[4] - b.transform[4];
        }
        return b.transform[5] - a.transform[5];
      });

      // Rekonstruksi teks berdasarkan posisi
      items.forEach(item => {
        const y = item.transform[5];
        if (currentY === null) currentY = y;
        
        // Jika beda Y signifikan, anggap baris baru
        if (Math.abs(y - currentY) > 5) {
          if (lineText.trim()) pageText += lineText.trim() + '\n';
          lineText = '';
          currentY = y;
        }
        lineText += item.str + (item.hasEOL ? '\n' : '');
      });
      
      if (lineText.trim()) pageText += lineText.trim();
      
      fullTextPreview.push(`--- Halaman ${i} ---\n${pageText || '[Tidak ada teks]'}`);

      if (pageText.trim()) {
        if (mode === 'line') {
          // Mode per baris
          pageText.split('\n').forEach(line => {
            if (line.trim()) {
              paragraphs.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: line.trim(), size: 22 })] // 11pt
              }));
            }
          });
        } else if (mode === 'text') {
          // Mode teks murni (gabung semua)
          paragraphs.push(new docx.Paragraph({
            children: [new docx.TextRun({ text: pageText.replace(/\n/g, ' ').trim(), size: 22 })]
          }));
          paragraphs.push(new docx.Paragraph({ children: [] })); // Spasi antar halaman
        } else {
          // Mode structure (paragraf) - default
          const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
          lines.forEach((line, idx) => {
            // Deteksi judul sederhana (teks pendek di awal halaman)
            if (detectHeading && idx === 0 && line.length < 100) {
              paragraphs.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: line, bold: true, size: 28 })], // 14pt bold
                heading: docx.HeadingLevel.HEADING_2
              }));
            } else {
              paragraphs.push(new docx.Paragraph({
                children: [new docx.TextRun({ text: line, size: 22 })]
              }));
            }
          });
        }

        // Tambahkan page break antar halaman jika diaktifkan
        if (pageBreak && i < pdf.numPages) {
          paragraphs.push(new docx.Paragraph({
            children: [new docx.PageBreak()]
          }));
        }
      }

      item.progress = Math.round((i / pdf.numPages) * 100);
      renderFileList();
    }

    // Buat dokumen DOCX
    const doc = new docx.Document({
      sections: [{
        properties: {},
        children: paragraphs.length > 0 ? paragraphs : [new docx.Paragraph({ children: [] })]
      }]
    });

    // Generate blob
    const blob = await docx.Packer.toBlob(doc);
    item.docxBlob = blob;
    item.textPreview = fullTextPreview.join('\n\n');
    item.status = 'done';
    item.duration = `${((performance.now() - startTime) / 1000).toFixed(1)}s`;

  } catch (err) {
    console.error(err);
    item.status = 'error';
    item.error = err.message || 'Gagal memproses';
  } finally {
    renderFileList();
  }
}

// === Download Logic ===
function downloadDocx(item) {
  if (!item.docxBlob) return;
  const fileName = item.file.name.replace(/\.pdf$/i, '') + '.docx';
  saveAs(item.docxBlob, fileName);
}

function downloadAll() {
  const doneFiles = state.files.filter(f => f.status === 'done');
  if (doneFiles.length === 0) return;

  doneFiles.forEach((item, index) => {
    // Beri sedikit jeda untuk menghindari pemblokiran browser
    setTimeout(() => downloadDocx(item), index * 300);
  });
}

// === Preview Modal ===
function showPreview(item) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Pratinjau: ${escapeHtml(item.file.name)}</div>
        <button class="modal-close" aria-label="Tutup">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="modal-body">${escapeHtml(item.textPreview || 'Tidak ada teks yang dapat diekstrak.')}</div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const closeBtn = overlay.querySelector('.modal-close');
  const closeModal = () => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

// === Event Listeners ===
dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    handleFiles(e.dataTransfer.files);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFiles(e.target.files);
    fileInput.value = ''; // Reset input agar bisa memilih file yang sama lagi
  }
});

// Event delegation untuk tombol di dalam file list
fileList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const item = state.files.find(f => f.id === id);

  if (!item) return;

  if (action === 'remove') {
    removeFile(id);
  } else if (action === 'download') {
    downloadDocx(item);
  } else if (action === 'preview') {
    showPreview(item);
  }
});

convertBtn.addEventListener('click', convertAll);
downloadAllBtn.addEventListener('click', downloadAll);
clearBtn.addEventListener('click', clearAll);

// Cek apakah library sudah dimuat
if (typeof pdfjsLib === 'undefined' || typeof docx === 'undefined' || typeof saveAs === 'undefined') {
  setTimeout(() => {
    toast('error', 'Library gagal dimuat', 'Mohon periksa koneksi internet lalu refresh halaman.');
  }, 500);
}