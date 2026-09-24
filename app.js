const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const fileList = document.getElementById('fileList');

let filesData = [];

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

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleFiles(files) {
  const validFiles = Array.from(files).filter(file => 
    ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'].includes(file.type)
  );
  
  validFiles.forEach(file => {
    const fileId = 'file_' + Math.random().toString(36).substr(2, 9);
    const fileObj = {
      id: fileId,
      originalFile: file,
      compressedBlob: null,
      targetPercent: 50 // default compression
    };
    filesData.push(fileObj);
    createFileCard(fileObj);
    processFile(fileId); // Auto-compress on load
  });

  if (filesData.length > 0) {
    downloadZipBtn.classList.remove('hidden');
  }
}

function createFileCard(fileObj) {
  const card = document.createElement('div');
  card.id = `card-${fileObj.id}`;
  card.className = "bg-slate-900/80 p-5 rounded-xl border border-slate-700/50 flex flex-col space-y-4";
  
  card.innerHTML = `
    <div class="flex justify-between items-start">
      <div>
        <p class="font-medium text-slate-200 truncate w-64 md:w-96" title="${fileObj.originalFile.name}">${fileObj.originalFile.name}</p>
        <p class="text-xs text-slate-400 mt-1">
          Original: ${formatBytes(fileObj.originalFile.size)} 
          &rarr; <span id="size-${fileObj.id}" class="text-emerald-400 font-bold ml-1">Processing...</span>
        </p>
      </div>
      <a id="download-${fileObj.id}" class="hidden bg-slate-800 hover:bg-slate-700 text-xs text-indigo-300 border border-indigo-500/30 font-medium px-4 py-2 rounded transition-all cursor-pointer">
        Download
      </a>
    </div>
    
    <div class="bg-slate-900 p-3 rounded-lg border border-slate-700/50">
      <div class="flex justify-between items-center mb-2">
        <label class="text-xs font-semibold text-slate-300">
          Target Compression: <span id="label-${fileObj.id}" class="text-indigo-400 font-bold">${fileObj.targetPercent}%</span>
        </label>
        <span id="status-${fileObj.id}" class="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Compressing...</span>
      </div>
      <input type="range" id="slider-${fileObj.id}" min="10" max="90" value="${fileObj.targetPercent}" step="5"
        class="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500">
    </div>
  `;
  
  fileList.prepend(card);

  const slider = document.getElementById(`slider-${fileObj.id}`);
  const label = document.getElementById(`label-${fileObj.id}`);
  const status = document.getElementById(`status-${fileObj.id}`);

  // Update text while dragging
  slider.addEventListener('input', (e) => {
    label.textContent = `${e.target.value}%`;
  });

  // Trigger compression only when dragging stops (change event)
  slider.addEventListener('change', (e) => {
    status.textContent = "Re-compressing...";
    status.className = "text-[10px] text-amber-400 font-semibold uppercase tracking-wider animate-pulse";
    fileObj.targetPercent = parseInt(e.target.value);
    processFile(fileObj.id);
  });
}

async function processFile(fileId) {
  const fileObj = filesData.find(f => f.id === fileId);
  if (!fileObj) return;

  const { originalFile, targetPercent } = fileObj;
  let compressedBlob;

  if (originalFile.type.startsWith('image/')) {
    compressedBlob = await compressImage(originalFile, targetPercent);
  } else if (originalFile.type === 'application/pdf') {
    compressedBlob = await compressPDF(originalFile, targetPercent);
  }

  fileObj.compressedBlob = compressedBlob;

  // Update UI with new sizes
  const sizeElem = document.getElementById(`size-${fileObj.id}`);
  const statusElem = document.getElementById(`status-${fileObj.id}`);
  const downloadBtn = document.getElementById(`download-${fileObj.id}`);

  const originalSize = originalFile.size;
  const newSize = compressedBlob.size;
  const savedPercent = (((originalSize - newSize) / originalSize) * 100).toFixed(1);

  sizeElem.innerHTML = `${formatBytes(newSize)} <span class="text-indigo-400 ml-1 font-normal">(${savedPercent}% smaller)</span>`;
  statusElem.textContent = "Done";
  statusElem.className = "text-[10px] text-emerald-400 font-semibold uppercase tracking-wider";

  downloadBtn.href = URL.createObjectURL(compressedBlob);
  downloadBtn.download = `compressed_${originalFile.name}`;
  downloadBtn.classList.remove('hidden');
}

function compressImage(file, targetPercent) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        // Quality logic for JPEGs
        const quality = (100 - targetPercent) / 100;
        
        let width = img.width;
        let height = img.height;

        // PNG Fix: Canvas 'image/png' export ignores quality parameter.
        // To compress PNGs while preserving transparency (no black background), 
        // we scale down the dimensions based on the slider.
        let scaleFactor = 1;
        if (file.type === 'image/png') {
          // Max 60% resolution scale down for aggressive PNG compression
          scaleFactor = 1 - ((targetPercent / 100) * 0.6); 
        } else {
          // For JPEGs, scale dimensions only if compression is > 50%
          if (targetPercent > 50) {
            scaleFactor = 1 - ((targetPercent - 50) / 100);
          }
        }

        width *= scaleFactor;
        height *= scaleFactor;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Ensure JPEG doesn't inherit a transparent background turning black by accident
        if (file.type === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        // Draw image keeping original format (preserves PNG transparency)
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          resolve(blob || file);
        }, file.type, quality);
      };
    };
  });
}

async function compressPDF(file, targetPercent) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    
    // PDF-Lib does not natively support rasterized image downscaling.
    // It optimizes structure. We toggle useObjectStreams to heavily compress PDF architecture.
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (err) {
    return file; 
  }
}

downloadZipBtn.addEventListener('click', () => {
  const zip = new JSZip();
  let hasFiles = false;

  filesData.forEach(fileObj => {
    if (fileObj.compressedBlob) {
      zip.file(`compressed_${fileObj.originalFile.name}`, fileObj.compressedBlob);
      hasFiles = true;
    }
  });
  
  if (!hasFiles) return;

  downloadZipBtn.textContent = "Zipping...";
  
  zip.generateAsync({ type: 'blob' }).then((content) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "compressed_files.zip";
    link.click();
    downloadZipBtn.textContent = "Download All as ZIP";
  });
});
