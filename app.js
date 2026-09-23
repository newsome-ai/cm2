let selectedFiles = [];
let processedFiles = [];

const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const slider = document.getElementById('compressionSlider');
const percentLabel = document.getElementById('percentLabel');
const compressBtn = document.getElementById('compressBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const fileList = document.getElementById('fileList');

// Update slider visual indicator
slider.addEventListener('input', (e) => {
  percentLabel.textContent = `${e.target.value}%`;
});

// Drag & Drop handlers
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-indigo-400', 'bg-slate-800');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-indigo-400', 'bg-slate-800');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-indigo-400', 'bg-slate-800');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

function handleFiles(files) {
  selectedFiles = Array.from(files).filter(file => 
    ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(file.type)
  );
  
  if (selectedFiles.length > 0) {
    compressBtn.disabled = false;
    renderInitialFileList();
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function renderInitialFileList() {
  fileList.innerHTML = '';
  selectedFiles.forEach((file, index) => {
    const card = document.createElement('div');
    card.className = "bg-slate-900/80 p-4 rounded-lg flex justify-between items-center border border-slate-700/50";
    card.id = `file-card-${index}`;
    card.innerHTML = `
      <div>
        <p class="font-medium text-slate-200">${file.name}</p>
        <p class="text-xs text-slate-400">Original Size: ${formatBytes(file.size)}</p>
      </div>
      <span class="text-xs text-amber-400 font-semibold" id="status-${index}">Ready</span>
    `;
    fileList.appendChild(card);
  });
}

compressBtn.addEventListener('click', async () => {
  compressBtn.disabled = true;
  processedFiles = [];
  const targetPercent = parseInt(slider.value);
  // Quality is inverse of compression target percentage
  const quality = (100 - targetPercent) / 100;

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    const statusElem = document.getElementById(`status-${i}`);
    statusElem.textContent = "Compressing...";
    statusElem.className = "text-xs text-indigo-400 font-semibold animate-pulse";

    let compressedBlob;
    if (file.type.startsWith('image/')) {
      compressedBlob = await compressImage(file, quality, targetPercent);
    } else if (file.type === 'application/pdf') {
      compressedBlob = await compressPDF(file, quality);
    }

    processedFiles.push({
      name: `compressed_${file.name}`,
      blob: compressedBlob
    });

    // Update Card UI with results
    const originalSize = file.size;
    const newSize = compressedBlob.size;
    const savedPercent = (((originalSize - newSize) / originalSize) * 100).toFixed(1);

    const card = document.getElementById(`file-card-${i}`);
    card.innerHTML = `
      <div>
        <p class="font-medium text-slate-200">${file.name}</p>
        <p class="text-xs text-slate-400">
          ${formatBytes(originalSize)} &rarr; <span class="text-emerald-400 font-bold">${formatBytes(newSize)}</span>
          <span class="ml-2 text-indigo-400">(${savedPercent}% smaller)</span>
        </p>
      </div>
      <a href="${URL.createObjectURL(compressedBlob)}" download="compressed_${file.name}" 
         class="bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 border border-indigo-500/30 font-medium px-3 py-1.5 rounded transition-all">
        Download
      </a>
    `;
  }

  if (processedFiles.length > 1) {
    downloadZipBtn.classList.remove('hidden');
  }
});

// Image compression engine using Canvas
function compressImage(file, quality, targetPercent) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Downscale dimensions slightly if target reduction is aggressive (> 50%)
        if (targetPercent > 50) {
          const scaleFactor = 1 - ((targetPercent - 50) / 100);
          width *= scaleFactor;
          height *= scaleFactor;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert canvas to blob with specified quality settings
        const outputType = file.type === 'image/png' && targetPercent > 30 ? 'image/jpeg' : file.type;
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, outputType, quality);
      };
    };
  });
}

// PDF compression engine using PDF-Lib
async function compressPDF(file, quality) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Load document and optimize object streams
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    
    // Save PDF with object stream compression and metadata cleanup
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (err) {
    console.error("PDF compression fallback:", err);
    return file; // Return original if parsing encounters protected structures
  }
}

// Download All as ZIP using JSZip
downloadZipBtn.addEventListener('click', () => {
  const zip = new JSZip();
  processedFiles.forEach(file => {
    zip.file(file.name, file.blob);
  });
  
  zip.generateAsync({ type: 'blob' }).then((content) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "compressed_files.zip";
    link.click();
  });
});
