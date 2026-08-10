// === Konfigurasi PDF.js ===
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// === State Aplikasi ===
const state = {
  files: [] 
};

// === Element references ===
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const convertBtn = document.getElementById('convertBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const clearBtn = document.getElementById('clearBtn');
const toastContainer = document.getElementById('toastContainer');
const optConversionMode = document.getElementById('optConversionMode');
const optPageBreak = document.getElementById('optPageBreak');
const optHeading = document.getElementById('optHeading');

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

function updateConversionOptions() {
  const isFixedLayout = !optConversionMode || optConversionMode.value === 'fixed';
  [optPageBreak, optHeading].forEach(option => {
    option.disabled = isFixedLayout;
    const wrapper = option.closest('.option');
    if (wrapper) wrapper.classList.toggle('text-options-disabled', isFixedLayout);
  });
}

// === Conversion Logic (Presisi Struktur) ===
async function convertAll() {
  const toConvert = state.files.filter(f => f.status === 'queued' || f.status === 'error');
  if (toConvert.length === 0) return;

  convertBtn.disabled = true;
  clearBtn.disabled = true;

  for (const item of toConvert) {
    await convertPdfToWord(item);
  }

  const failedCount = state.files.filter(f => f.status === 'error').length;
  if (failedCount > 0) {
    toast('error', 'Konversi selesai sebagian', `${failedCount} file gagal diproses. Cek pesan error di daftar file.`);
  } else {
    toast('success', 'Konversi Selesai', 'Semua file berhasil diproses dengan presisi.');
  }
  updateButtons();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal merender halaman PDF.'));
    }, 'image/png', 0.95);
  });
}

async function convertPdfToFixedLayoutDocx(item, pdf, startTime) {
  const children = [];
  const preview = [];
  const maxDocxImageWidth = 680;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Browser tidak bisa membuat canvas untuk merender PDF.');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await canvasToBlob(canvas);
    const imageData = new Uint8Array(await blob.arrayBuffer());
    const imageWidth = Math.min(maxDocxImageWidth, Math.round(viewport.width / 2));
    const imageHeight = Math.round((imageWidth / viewport.width) * viewport.height);

    children.push(new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new docx.ImageRun({
          data: imageData,
          transformation: {
            width: imageWidth,
            height: imageHeight
          }
        })
      ]
    }));

    if (i < pdf.numPages) {
      children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
    }

    preview.push(`--- Halaman ${i} ---\nMode layout tetap: halaman disimpan sebagai gambar agar tampilan tidak berantakan.`);
    item.progress = Math.round((i / pdf.numPages) * 100);
    renderFileList();
  }

  const doc = new docx.Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720
          }
        }
      },
      children
    }]
  });

  item.docxBlob = await docx.Packer.toBlob(doc);
  item.textPreview = preview.join('\n\n');
  item.status = 'done';
  item.duration = `${((performance.now() - startTime) / 1000).toFixed(1)}s`;
}

async function convertPdfToWord(item) {
  try {
    item.status = 'processing';
    item.progress = 0;
    item.error = null;
    renderFileList();

    const startTime = performance.now();
    const arrayBuffer = await item.file.arrayBuffer();
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    item.pageCount = pdf.numPages;
    renderFileList();

    const conversionMode = optConversionMode ? optConversionMode.value : 'fixed';
    if (conversionMode === 'fixed') {
      await convertPdfToFixedLayoutDocx(item, pdf, startTime);
      return;
    }

    const pageBreak = optPageBreak.checked;
    const detectHeading = optHeading.checked;

    const paragraphs = [];
    let fullTextPreview = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // 1. Ekstrak item dengan informasi posisi dan ukuran font
      const items = textContent.items.map(it => {
        const fontSize = it.height || Math.abs(it.transform[3]) || 10;
        return {
          text: it.str,
          x: it.transform[4],
          y: it.transform[5],
          fontSize: fontSize,
          width: it.width
        };
      }).filter(it => it.text.trim() !== '' || it.width > 0);

      if (items.length === 0) {
        fullTextPreview.push(`--- Halaman ${i} ---\n[Tidak ada teks]`);
        if (pageBreak && i < pdf.numPages) {
          paragraphs.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
        }
        continue;
      }

      // 2. Sortir teks berdasarkan posisi (Atas ke Bawah, Kiri ke Kanan)
      items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 2) return b.y - a.y; 
        return a.x - b.x; 
      });

      // 3. Cari ukuran font dasar (yang paling sering muncul = paragraf normal)
      const sizeMap = {};
      items.forEach(it => {
        const sz = Math.round(it.fontSize);
        sizeMap[sz] = (sizeMap[sz] || 0) + 1;
      });
      let baseFontSize = 12;
      let maxCount = 0;
      for (const sz in sizeMap) {
        if (sizeMap[sz] > maxCount) {
          maxCount = sizeMap[sz];
          baseFontSize = parseInt(sz);
        }
      }

      // 4. Kelompokkan item menjadi baris (Lines)
      let lines = [];
      let currentLine = [items[0]];
      for (let j = 1; j < items.length; j++) {
        const prev = items[j - 1];
        const curr = items[j];
        if (Math.abs(curr.y - prev.y) <= 3) {
          currentLine.push(curr);
        } else {
          lines.push(currentLine);
          currentLine = [curr];
        }
      }
      lines.push(currentLine);

      // 5. Kelompokkan baris menjadi blok (Paragraf/Heading)
      let blocks = [];
      let currentBlock = [lines[0]];
      
      for (let j = 1; j < lines.length; j++) {
        const prevLine = lines[j - 1];
        const currLine = lines[j];
        
        const prevMaxFont = Math.max(...prevLine.map(i => i.fontSize));
        const currMaxFont = Math.max(...currLine.map(i => i.fontSize));
        const prevX = prevLine[0].x;
        const currX = currLine[0].x;
        const yGap = prevLine[0].y - currLine[0].y;
        
        const currText = currLine.map(i => i.text).join('').trim();
        const prevText = prevLine.map(i => i.text).join('').trim();

        // Deteksi List (1. , 2. , -, •, x)
        const isList = /^\s*\d+\.\s/.test(currText) || /^\s*[-•*x]\s/.test(currText) || /^\s*[-•*x]\s*$/.test(currText);
        const prevIsList = /^\s*\d+\.\s/.test(prevText) || /^\s*[-•*x]\s/.test(prevText) || /^\s*[-•*x]\s*$/.test(prevText);

        // Jika ukuran font beda signifikan -> blok baru
        if (Math.abs(prevMaxFont - currMaxFont) > 1) {
          blocks.push(currentBlock); currentBlock = [currLine]; continue;
        }
        // Jika indentasi (X) berbeda jauh -> blok baru
        if (Math.abs(prevX - currX) > 15) {
          blocks.push(currentBlock); currentBlock = [currLine]; continue;
        }
        // Jika jarak baris (Y) agak jauh -> blok baru (paragraf baru)
        // Threshold diturunkan ke 1.2 untuk sensitivitas enter
        if (yGap > currMaxFont * 1.2) {
          blocks.push(currentBlock); currentBlock = [currLine]; continue;
        }
        // Jika ada list, buat blok baru
        if (isList && !prevIsList) {
          blocks.push(currentBlock); currentBlock = [currLine]; continue;
        }
        if (prevIsList && !isList) {
          blocks.push(currentBlock); currentBlock = [currLine]; continue;
        }
        
        currentBlock.push(currLine);
      }
      blocks.push(currentBlock);

      // 6. Konversi blok menjadi Paragraphs & TextRuns DOCX
      let pageText = `--- Halaman ${i} ---\n`;
      blocks.forEach(block => {
        const runs = [];
        let blockMaxFont = 0;
        let blockText = '';
        
        block.forEach((line, lineIdx) => {
          line.forEach((item, idx) => {
            if (idx > 0) {
              const prevItem = line[idx - 1];
              const gap = item.x - (prevItem.x + prevItem.width);
              if (gap > 2 && !prevItem.text.endsWith(' ')) {
                runs.push(new docx.TextRun({ text: ' ', size: Math.round(item.fontSize * 2) }));
                blockText += ' ';
              }
            }
            const runSize = Math.round(item.fontSize * 2); // DOCX pakai half-points
            runs.push(new docx.TextRun({ text: item.text, size: runSize }));
            blockText += item.text;
            if (item.fontSize > blockMaxFont) blockMaxFont = item.fontSize;
          });
          
          // Tambahkan spasi antar baris dalam paragraf yang sama
          if (lineIdx < block.length - 1) {
            const lastText = line[line.length - 1].text;
            if (!lastText.endsWith('-')) {
              runs.push(new docx.TextRun({ text: ' ', size: Math.round(blockMaxFont * 2) }));
              blockText += ' ';
            }
          }
        });
        
        blockText = blockText.trim();
        pageText += blockText + "\n\n";
        
        let paraProps = { children: runs };
        
        // Deteksi Heading
        const isAllCaps = blockText === blockText.toUpperCase() && /[A-Z]/.test(blockText) && blockText.length < 50;
        const isPageNum = /^\s*\d+\s*$/.test(blockText) && blockText.length <= 3;

        if (isPageNum) {
          paraProps.alignment = docx.AlignmentType.CENTER;
        } else if (detectHeading) {
          if (isAllCaps || blockMaxFont > baseFontSize * 1.5) {
            paraProps.heading = docx.HeadingLevel.HEADING_1;
          } else if (blockMaxFont > baseFontSize * 1.3) {
            paraProps.heading = docx.HeadingLevel.HEADING_2;
          } else if (blockMaxFont > baseFontSize * 1.15) {
            paraProps.heading = docx.HeadingLevel.HEADING_3;
          }
        }
        
        paragraphs.push(new docx.Paragraph(paraProps));
      });

      fullTextPreview.push(pageText);

      // Tambahkan page break antar halaman
      if (pageBreak && i < pdf.numPages) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
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

    const blob = await docx.Packer.toBlob(doc);
    item.docxBlob = blob;
    item.textPreview = fullTextPreview.join('\n');
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
    fileInput.value = ''; 
  }
});

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
if (optConversionMode) {
  optConversionMode.addEventListener('change', updateConversionOptions);
}
updateConversionOptions();

if (typeof pdfjsLib === 'undefined' || typeof docx === 'undefined' || typeof saveAs === 'undefined') {
  setTimeout(() => {
    toast('error', 'Library gagal dimuat', 'Mohon periksa koneksi internet lalu refresh halaman.');
  }, 500);
}
