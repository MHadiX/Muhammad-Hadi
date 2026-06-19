// ==========================================================================
// BulkCerts UI Controller & Interaction Logic
// ==========================================================================

function showBootError(message) {
    const banner = document.getElementById('boot-error');
    if (banner) {
        banner.textContent = message;
        banner.classList.remove('hidden');
    } else {
        alert('BulkCerts failed to start: ' + message);
    }
}

function bootBulkCerts() {
    if (typeof XLSX === 'undefined') {
        showBootError('Missing spreadsheet library (XLSX). Reload the page.');
        return;
    }
    if (typeof window.jspdf === 'undefined') {
        showBootError('Missing PDF library (jsPDF). Reload the page.');
        return;
    }
    if (typeof JSZip === 'undefined') {
        showBootError('Missing ZIP library (JSZip). Reload the page.');
        return;
    }
    if (typeof window.BulkCertsTemplates === 'undefined') {
        showBootError('Templates failed to load. Open this app via http://localhost (not as a raw file).');
        return;
    }

    try {
        initBulkCertsApp();
        window.__bulkcertsReady = true;
    } catch (err) {
        console.error('BulkCerts startup failed:', err);
        showBootError(err.message || 'Unexpected startup error.');
    }
}

function initBulkCertsApp() {
    // ----------------------------------------------------------------------
    // Application State
    // ----------------------------------------------------------------------
    let state = {
        background: 'classic',
        backgroundImage: null,      // Image element for rendering custom backgrounds
        backgroundImageSrc: null,   // Base64 string of custom background
        elements: [],
        selectedElementId: null,

        excelData: [],              // Recipient rows
        excelHeaders: [],           // Available headers from Excel
        previewIndex: 0,            // Excel row index to preview on canvas

        // Dragging & Resizing tracking
        isDragging: false,
        isResizing: false,
        dragStart: { x: 0, y: 0 },
        elementStart: { x: 0, y: 0, width: 0, height: 0 },

        imageCache: {}              // Cache for custom image elements { id: HTMLImageElement }
    };

    // ----------------------------------------------------------------------
    // DOM Element Cache
    // ----------------------------------------------------------------------
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) {
        throw new Error('Preview canvas element not found.');
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not initialize the preview canvas.');
    }

    // Steps & Sidebar Inputs
    const excelFileInput = document.getElementById('excel-file-input');
    const excelDropzone = document.getElementById('excel-dropzone');
    const excelStatus = document.getElementById('excel-status');
    const excelFileName = document.getElementById('excel-file-name');
    const excelRowCount = document.getElementById('excel-row-count');
    const removeExcelBtn = document.getElementById('remove-excel-btn');
    const downloadTemplateBtn = document.getElementById('download-template-btn');
    
    const dynamicFieldsSection = document.getElementById('dynamic-fields-section');
    const excelFieldsList = document.getElementById('excel-fields-list');

    const templateSelect = document.getElementById('template-select');
    const customBgContainer = document.getElementById('custom-bg-container');
    const bgFileInput = document.getElementById('bg-file-input');
    const bgDropzone = document.getElementById('bg-dropzone');

    const addTextBtn = document.getElementById('add-text-btn');
    const addImageTrigger = document.getElementById('add-image-trigger');
    const imageFileInput = document.getElementById('image-file-input');

    // Inspector Panel
    const inspectorCard = document.getElementById('inspector-card');
    const textInspector = document.getElementById('text-inspector');
    const textValInput = document.getElementById('text-val-input');
    const fontFamilySelect = document.getElementById('font-family-select');
    const fontSizeInput = document.getElementById('font-size-input');
    const toggleBold = document.getElementById('toggle-bold');
    const toggleItalic = document.getElementById('toggle-italic');
    const alignmentGroup = document.getElementById('alignment-group');
    const textColorInput = document.getElementById('text-color-input');
    const textColorHex = document.getElementById('text-color-hex');

    const imageInspector = document.getElementById('image-inspector');
    const imageScaleSlider = document.getElementById('image-scale-slider');
    const imageScaleVal = document.getElementById('image-scale-val');
    const deleteElementBtn = document.getElementById('delete-element-btn');

    // Generation Panel
    const exportFormatSelect = document.getElementById('export-format-select');
    const watermarkCheckbox = document.getElementById('watermark-checkbox');
    const generateBtn = document.getElementById('generate-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressStatus = document.getElementById('progress-status');
    const progressPercentage = document.getElementById('progress-percentage');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressCounter = document.getElementById('progress-counter');

    // Workspace & Preview
    const resetLayoutBtn = document.getElementById('reset-layout-btn');
    const clearCustomBtn = document.getElementById('clear-custom-btn');
    const dataLoadedBadge = document.getElementById('data-loaded-badge');
    const previewTableContainer = document.getElementById('preview-table-container');

    const prevRowBtn = document.getElementById('prev-row-btn');
    const nextRowBtn = document.getElementById('next-row-btn');
    const currentPreviewRowNum = document.getElementById('current-preview-row-num');
    const totalPreviewRowsNum = document.getElementById('total-preview-rows-num');

    // ----------------------------------------------------------------------
    // Initialization & Load Template Defaults
    // ----------------------------------------------------------------------
    function loadTemplate(templateId, preserveCustom = false) {
        state.background = templateId;
        const templateDef = window.BulkCertsTemplates[templateId];
        
        if (templateDef) {
            // Decouple original elements reference
            const defaultElements = JSON.parse(JSON.stringify(templateDef.defaultElements));
            
            if (preserveCustom) {
                // Keep elements added by the user (IDs not starting with template ID)
                const customElements = state.elements.filter(elem => 
                    !elem.id.startsWith('classic_') && 
                    !elem.id.startsWith('modern_') && 
                    !elem.id.startsWith('formal_') && 
                    !elem.id.startsWith('custom_')
                );
                state.elements = [...defaultElements, ...customElements];
            } else {
                state.elements = defaultElements;
            }
        }
        
        state.selectedElementId = null;
        updateInspector();
        renderCanvas();
    }

    // ----------------------------------------------------------------------
    // Rendering Coordinate Mapping (Logical MM <-> Canvas Pixels)
    // ----------------------------------------------------------------------
    // Canvas size is 1188 x 840 (exact 297 x 210 ratio scaled by 4x for high-res preview)
    const MM_WIDTH = 297;
    const MM_HEIGHT = 210;

    // Convert mouse coordinates (Canvas pixels) to Millimeters
    function getMMCoords(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        // Mouse position inside canvas bounding box in screen pixels
        const screenX = clientX - rect.left;
        const screenY = clientY - rect.top;
        // Translate to Canvas internal pixels (1188x840)
        const canvasX = screenX * (canvas.width / rect.width);
        const canvasY = screenY * (canvas.height / rect.height);
        // Translate to Millimeters (297x210)
        return {
            x: canvasX / (canvas.width / MM_WIDTH),
            y: canvasY / (canvas.height / MM_HEIGHT)
        };
    }

    // ----------------------------------------------------------------------
    // Text Metrics Calculation in mm
    // ----------------------------------------------------------------------
    function measureTextMm(text, font, fontStyle, fontSizePt) {
        ctx.save();
        const sizeInMm = fontSizePt * 0.352777;
        
        let weightStr = '';
        let italicStr = '';
        if (fontStyle.toLowerCase().includes('bold')) weightStr = 'bold ';
        if (fontStyle.toLowerCase().includes('italic')) italicStr = 'italic ';
        
        let canvasFont = 'Helvetica';
        if (font.toLowerCase() === 'times') canvasFont = '"Times New Roman", Georgia, serif';
        if (font.toLowerCase() === 'courier') canvasFont = '"Courier New", Courier, monospace';
        
        ctx.font = `${italicStr}${weightStr}${sizeInMm * (canvas.width / MM_WIDTH)}px ${canvasFont}`;
        
        // Measure text inside canvas pixels, then convert back to MM
        const metrics = ctx.measureText(text);
        const widthMm = metrics.width / (canvas.width / MM_WIDTH);
        const heightMm = fontSizePt * 0.352777; // Capital height approximation
        
        ctx.restore();
        return { width: widthMm, height: heightMm };
    }

    // Calculate Bounding Box of Element in mm
    function getElementBounds(elem, activeRow = null) {
        if (elem.type === 'image') {
            return {
                x: elem.x,
                y: elem.y,
                width: elem.width,
                height: elem.height
            };
        } else if (elem.type === 'text') {
            // Get rendering text (substituting placeholders if data is present)
            const textToRender = activeRow ? substitutePlaceholders(elem.text, activeRow) : elem.text;
            const size = measureTextMm(textToRender, elem.font, elem.fontStyle, elem.fontSize);
            
            let xOffset = 0;
            if (elem.align === 'center') {
                xOffset = -size.width / 2;
            } else if (elem.align === 'right') {
                xOffset = -size.width;
            }
            
            return {
                x: elem.x + xOffset,
                y: elem.y - size.height, // coordinates standard baseline offset
                width: size.width,
                height: size.height * 1.2 // slight padding for margin
            };
        }
        return null;
    }

    // Hit-testing helper
    function getElementAtCoords(mmX, mmY) {
        const activeRow = state.excelData.length > 0 ? state.excelData[state.previewIndex] : null;
        
        // Loop backwards to hit frontmost overlay elements first
        for (let i = state.elements.length - 1; i >= 0; i--) {
            const bounds = getElementBounds(state.elements[i], activeRow);
            if (bounds) {
                if (mmX >= bounds.x && mmX <= bounds.x + bounds.width &&
                    mmY >= bounds.y && mmY <= bounds.y + bounds.height) {
                    return state.elements[i];
                }
            }
        }
        return null;
    }

    // ----------------------------------------------------------------------
    // Canvas Preview Engine
    // ----------------------------------------------------------------------
    function renderCanvas() {
        ctx.save();
        // Clear screen
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Scale canvas context so drawing works in millmeters coordinate space (297x210)
        ctx.scale(canvas.width / MM_WIDTH, canvas.height / MM_HEIGHT);
        
        const activeRow = state.excelData.length > 0 ? state.excelData[state.previewIndex] : null;
        
        // 1. Draw Template Background
        const activeTemplate = window.BulkCertsTemplates[state.background];
        if (activeTemplate) {
            // For custom backgrounds, pass the loaded Image element
            activeTemplate.drawBackground(new window.CanvasDrawingContext(canvas, ctx), state.backgroundImage);
        }
        
        // 2. Draw Element Overlays
        state.elements.forEach(elem => {
            if (elem.type === 'text') {
                const textToRender = activeRow ? substitutePlaceholders(elem.text, activeRow) : elem.text;
                
                // Draw text using CanvasDrawingContext
                const canvasCtx = new window.CanvasDrawingContext(canvas, ctx);
                canvasCtx.text(
                    textToRender,
                    elem.x,
                    elem.y,
                    elem.font,
                    elem.fontStyle,
                    elem.fontSize,
                    elem.color,
                    elem.align
                );
            } else if (elem.type === 'image') {
                if (!state.imageCache[elem.id]) {
                    // Lazy load image into cache
                    state.imageCache[elem.id] = new Image();
                    state.imageCache[elem.id].onload = () => renderCanvas(); // Redraw once image finishes loading
                    state.imageCache[elem.id].src = elem.src;
                } else if (state.imageCache[elem.id].complete) {
                    ctx.drawImage(state.imageCache[elem.id], elem.x, elem.y, elem.width, elem.height);
                }
            }
        });

        // 3. Draw Watermark if enabled
        const showWatermark = watermarkCheckbox.checked;
        if (showWatermark) {
            const canvasCtx = new window.CanvasDrawingContext(canvas, ctx);
            canvasCtx.text(
                'Generated by BulkCerts',
                290,
                205,
                'helvetica',
                'normal',
                7,
                '#94a3b8',
                'right'
            );
        }
        
        // 4. Draw Selected Element Helper Bounds
        if (state.selectedElementId !== null) {
            const selectedElem = state.elements.find(e => e.id === state.selectedElementId);
            if (selectedElem) {
                const bounds = getElementBounds(selectedElem, activeRow);
                if (bounds) {
                    // Draw dashed boundary outline
                    ctx.strokeStyle = '#3b82f6'; // Designer blue selection
                    ctx.lineWidth = 0.5;
                    ctx.setLineDash([1.5, 1.5]);
                    ctx.strokeRect(bounds.x - 1, bounds.y - 1, bounds.width + 2, bounds.height + 2);
                    ctx.setLineDash([]); // Reset
                    
                    // Draw resize handle if the element is an image
                    if (selectedElem.type === 'image') {
                        ctx.fillStyle = '#3b82f6';
                        ctx.beginPath();
                        ctx.arc(selectedElem.x + selectedElem.width, selectedElem.y + selectedElem.height, 1.5, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 0.3;
                        ctx.stroke();
                    }
                }
            }
        }
        
        ctx.restore();
    }

    // ----------------------------------------------------------------------
    // Mouse Event Handlers for Drag & Drop / Resizing
    // ----------------------------------------------------------------------
    canvas.addEventListener('mousedown', (e) => {
        const coords = getMMCoords(e.clientX, e.clientY);
        
        // Check if user clicked on resize handle of selected image element
        if (state.selectedElementId !== null) {
            const selectedElem = state.elements.find(e => e.id === state.selectedElementId);
            if (selectedElem && selectedElem.type === 'image') {
                const handleX = selectedElem.x + selectedElem.width;
                const handleY = selectedElem.y + selectedElem.height;
                const dist = Math.sqrt(Math.pow(coords.x - handleX, 2) + Math.pow(coords.y - handleY, 2));
                
                if (dist < 4.0) { // Click within 4mm radius of handle
                    state.isResizing = true;
                    state.dragStart = { x: coords.x, y: coords.y };
                    state.elementStart = {
                        x: selectedElem.x,
                        y: selectedElem.y,
                        width: selectedElem.width,
                        height: selectedElem.height
                    };
                    e.preventDefault();
                    return;
                }
            }
        }
        
        // Perform normal item click detection
        const hit = getElementAtCoords(coords.x, coords.y);
        if (hit) {
            state.selectedElementId = hit.id;
            state.isDragging = true;
            state.dragStart = { x: coords.x, y: coords.y };
            state.elementStart = {
                x: hit.x,
                y: hit.y
            };
            
            // Bring element to front
            state.elements = state.elements.filter(e => e.id !== hit.id);
            state.elements.push(hit);
            
            updateInspector();
            renderCanvas();
        } else {
            // Clicked empty space
            state.selectedElementId = null;
            updateInspector();
            renderCanvas();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const coords = getMMCoords(e.clientX, e.clientY);
        
        // Handles element resizing
        if (state.isResizing && state.selectedElementId) {
            const selectedElem = state.elements.find(e => e.id === state.selectedElementId);
            if (selectedElem) {
                const deltaX = coords.x - state.dragStart.x;
                const newWidth = Math.max(10, state.elementStart.width + deltaX); // Min 10mm width
                
                selectedElem.width = newWidth;
                selectedElem.height = newWidth / selectedElem.aspect;
                
                // Keep image within template boundary
                if (selectedElem.x + selectedElem.width > MM_WIDTH) {
                    selectedElem.width = MM_WIDTH - selectedElem.x;
                    selectedElem.height = selectedElem.width / selectedElem.aspect;
                }
                
                imageScaleSlider.value = Math.round(selectedElem.width);
                imageScaleVal.textContent = `${Math.round(selectedElem.width)} mm`;
                
                renderCanvas();
            }
            return;
        }
        
        // Handles element dragging
        if (state.isDragging && state.selectedElementId) {
            const selectedElem = state.elements.find(e => e.id === state.selectedElementId);
            if (selectedElem) {
                const deltaX = coords.x - state.dragStart.x;
                const deltaY = coords.y - state.dragStart.y;
                
                let targetX = state.elementStart.x + deltaX;
                let targetY = state.elementStart.y + deltaY;
                
                // Bounds clamping
                if (selectedElem.type === 'image') {
                    targetX = Math.max(0, Math.min(MM_WIDTH - selectedElem.width, targetX));
                    targetY = Math.max(0, Math.min(MM_HEIGHT - selectedElem.height, targetY));
                } else {
                    targetX = Math.max(0, Math.min(MM_WIDTH, targetX));
                    targetY = Math.max(0, Math.min(MM_HEIGHT, targetY));
                }
                
                selectedElem.x = targetX;
                selectedElem.y = targetY;
                renderCanvas();
            }
            return;
        }
        
        // Cursor Feedback Mode
        if (state.selectedElementId !== null) {
            const selectedElem = state.elements.find(e => e.id === state.selectedElementId);
            if (selectedElem && selectedElem.type === 'image') {
                const handleX = selectedElem.x + selectedElem.width;
                const handleY = selectedElem.y + selectedElem.height;
                const dist = Math.sqrt(Math.pow(coords.x - handleX, 2) + Math.pow(coords.y - handleY, 2));
                if (dist < 4.0) {
                    canvas.style.cursor = 'se-resize';
                    return;
                }
            }
        }
        
        const hoverElement = getElementAtCoords(coords.x, coords.y);
        canvas.style.cursor = hoverElement ? 'move' : 'default';
    });

    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        state.isResizing = false;
    });

    // Delete selected element using standard backspace/delete keys
    window.addEventListener('keydown', (e) => {
        // Skip deleting if user is typing inside an input element
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT') {
            return;
        }
        
        if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedElementId !== null) {
            deleteSelectedElement();
            e.preventDefault();
        }
    });

    // ----------------------------------------------------------------------
    // Inspector UI Binding
    // ----------------------------------------------------------------------
    function updateInspector() {
        if (state.selectedElementId === null) {
            inspectorCard.classList.add('hidden');
            textInspector.classList.add('hidden');
            imageInspector.classList.add('hidden');
            return;
        }
        
        const elem = state.elements.find(e => e.id === state.selectedElementId);
        if (!elem) return;
        
        inspectorCard.classList.remove('hidden');
        
        if (elem.type === 'text') {
            textInspector.classList.remove('hidden');
            imageInspector.classList.add('hidden');
            
            // Load values to inputs
            textValInput.value = elem.text;
            fontFamilySelect.value = elem.font;
            fontSizeInput.value = elem.fontSize;
            textColorInput.value = elem.color;
            textColorHex.value = elem.color;
            
            // Styling flags
            toggleBold.classList.toggle('active', elem.fontStyle.includes('bold'));
            toggleItalic.classList.toggle('active', elem.fontStyle.includes('italic'));
            
            // Alignment buttons active state
            Array.from(alignmentGroup.children).forEach(btn => {
                btn.classList.toggle('active', btn.dataset.align === elem.align);
            });
            
        } else if (elem.type === 'image') {
            textInspector.classList.add('hidden');
            imageInspector.classList.remove('hidden');
            
            imageScaleSlider.value = Math.round(elem.width);
            imageScaleVal.textContent = `${Math.round(elem.width)} mm`;
        }
    }

    // Handle inputs changes in Inspector
    textValInput.addEventListener('input', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                elem.text = textValInput.value;
                renderCanvas();
            }
        }
    });

    fontFamilySelect.addEventListener('change', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                elem.font = fontFamilySelect.value;
                renderCanvas();
            }
        }
    });

    fontSizeInput.addEventListener('input', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                elem.fontSize = parseInt(fontSizeInput.value) || 12;
                renderCanvas();
            }
        }
    });

    toggleBold.addEventListener('click', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                let isItalic = elem.fontStyle.includes('italic');
                let isBold = elem.fontStyle.includes('bold');
                
                isBold = !isBold;
                
                if (isBold && isItalic) elem.fontStyle = 'bolditalic';
                else if (isBold) elem.fontStyle = 'bold';
                else if (isItalic) elem.fontStyle = 'italic';
                else elem.fontStyle = 'normal';
                
                toggleBold.classList.toggle('active', isBold);
                renderCanvas();
            }
        }
    });

    toggleItalic.addEventListener('click', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                let isItalic = elem.fontStyle.includes('italic');
                let isBold = elem.fontStyle.includes('bold');
                
                isItalic = !isItalic;
                
                if (isBold && isItalic) elem.fontStyle = 'bolditalic';
                else if (isBold) elem.fontStyle = 'bold';
                else if (isItalic) elem.fontStyle = 'italic';
                else elem.fontStyle = 'normal';
                
                toggleItalic.classList.toggle('active', isItalic);
                renderCanvas();
            }
        }
    });

    Array.from(alignmentGroup.children).forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.selectedElementId) {
                const elem = state.elements.find(e => e.id === state.selectedElementId);
                if (elem && elem.type === 'text') {
                    elem.align = btn.dataset.align;
                    Array.from(alignmentGroup.children).forEach(b => {
                        b.classList.toggle('active', b === btn);
                    });
                    renderCanvas();
                }
            }
        });
    });

    // Dual-link hex and HTML color inputs
    textColorInput.addEventListener('input', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                elem.color = textColorInput.value;
                textColorHex.value = elem.color;
                renderCanvas();
            }
        }
    });

    textColorHex.addEventListener('input', () => {
        const hex = textColorHex.value;
        if (/^#[0-9A-F]{6}$/i.test(hex) && state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'text') {
                elem.color = hex;
                textColorInput.value = hex;
                renderCanvas();
            }
        }
    });

    // Image resizing slider binding
    imageScaleSlider.addEventListener('input', () => {
        if (state.selectedElementId) {
            const elem = state.elements.find(e => e.id === state.selectedElementId);
            if (elem && elem.type === 'image') {
                const width = parseFloat(imageScaleSlider.value);
                elem.width = width;
                elem.height = width / elem.aspect;
                imageScaleVal.textContent = `${Math.round(width)} mm`;
                renderCanvas();
            }
        }
    });

    function deleteSelectedElement() {
        if (state.selectedElementId !== null) {
            state.elements = state.elements.filter(e => e.id !== state.selectedElementId);
            state.selectedElementId = null;
            updateInspector();
            renderCanvas();
        }
    }

    deleteElementBtn.addEventListener('click', deleteSelectedElement);

    // ----------------------------------------------------------------------
    // Add Elements & Custom Images
    // ----------------------------------------------------------------------
    addTextBtn.addEventListener('click', () => {
        const newTextElem = {
            id: `text_custom_${Date.now()}`,
            type: 'text',
            text: 'Custom Text',
            x: 148.5,
            y: 105,
            fontSize: 14,
            font: 'helvetica',
            fontStyle: 'normal',
            color: '#1e293b',
            align: 'center'
        };
        state.elements.push(newTextElem);
        state.selectedElementId = newTextElem.id;
        updateInspector();
        renderCanvas();
    });

    addImageTrigger.addEventListener('click', () => {
        imageFileInput.click();
    });

    imageFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Src = event.target.result;
                
                // Create image element to calculate native aspect ratio
                const img = new Image();
                img.onload = () => {
                    const aspect = img.width / img.height;
                    const defaultWidth = 40; // 40 mm standard logo width
                    const defaultHeight = defaultWidth / aspect;
                    
                    const newImgElem = {
                        id: `image_custom_${Date.now()}_${Math.round(Math.random()*1000)}`,
                        type: 'image',
                        src: base64Src,
                        x: 148.5 - defaultWidth / 2,
                        y: 105 - defaultHeight / 2,
                        width: defaultWidth,
                        height: defaultHeight,
                        aspect: aspect
                    };
                    
                    state.imageCache[newImgElem.id] = img; // store in image cache
                    state.elements.push(newImgElem);
                    state.selectedElementId = newImgElem.id;
                    updateInspector();
                    renderCanvas();
                };
                img.src = base64Src;
            };
            reader.readAsDataURL(file);
        });
        
        // Reset file input value to allow upload same file twice
        imageFileInput.value = '';
    });

    // ----------------------------------------------------------------------
    // Certificate Style & Custom Background Image Upload
    // ----------------------------------------------------------------------
    templateSelect.addEventListener('change', (e) => {
        const templateId = e.target.value;
        if (templateId === 'custom') {
            customBgContainer.classList.remove('hidden');
        } else {
            customBgContainer.classList.add('hidden');
        }
        
        loadTemplate(templateId, true); // preserve custom overlays during transition
    });

    // Trigger upload click
    bgDropzone.addEventListener('click', () => {
        bgFileInput.click();
    });

    // Setup drag & drop states for background dropzone
    bgDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        bgDropzone.classList.add('dragover');
    });

    bgDropzone.addEventListener('dragleave', () => {
        bgDropzone.classList.remove('dragover');
    });

    bgDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        bgDropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleBackgroundUpload(files[0]);
        }
    });

    bgFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleBackgroundUpload(files[0]);
        }
    });

    function handleBackgroundUpload(file) {
        if (!file.type.match('image.*')) {
            alert('Please upload a valid PNG/JPG image file.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result;
            const img = new Image();
            img.onload = () => {
                state.backgroundImage = img;
                state.backgroundImageSrc = base64;
                renderCanvas();
            };
            img.src = base64;
        };
        reader.readAsDataURL(file);
    }

    // ----------------------------------------------------------------------
    // Excel Loader & Recipient Data Parsing (SheetJS)
    // ----------------------------------------------------------------------
    // Setup dropzone events
    excelDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        excelDropzone.classList.add('dragover');
    });

    excelDropzone.addEventListener('dragleave', () => {
        excelDropzone.classList.remove('dragover');
    });

    excelDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        excelDropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleExcelFile(files[0]);
        }
    });

    excelDropzone.addEventListener('click', () => {
        excelFileInput.click();
    });

    excelFileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleExcelFile(files[0]);
        }
    });

    function handleExcelFile(file) {
        if (!file.name.endsWith('.xlsx')) {
            alert('Invalid file format. Please upload an Excel (.xlsx) file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                
                // Parse rows containing exact values
                const rawRows = XLSX.utils.sheet_to_json(sheet);
                
                if (rawRows.length === 0) {
                    alert('The Excel sheet contains no recipient records.');
                    return;
                }
                
                if (rawRows.length > 500) {
                    alert('Limit exceeded. BulkCerts supports a maximum of 500 records. Truncating data to first 500 rows.');
                    rawRows.length = 500;
                }
                
                // Extract headers from sheet
                const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
                // Filter out empty columns
                state.excelHeaders = headers.filter(h => h && String(h).trim() !== '');
                
                // Store mapped rows
                state.excelData = rawRows;
                state.previewIndex = 0;
                
                // Render Status
                excelFileName.textContent = file.name;
                excelRowCount.textContent = state.excelData.length;
                excelDropzone.classList.add('hidden');
                excelStatus.classList.remove('hidden');
                
                // Load active column selectors tags
                dynamicFieldsSection.classList.remove('hidden');
                excelFieldsList.innerHTML = '';
                state.excelHeaders.forEach(header => {
                    const tag = document.createElement('button');
                    tag.className = 'field-tag';
                    tag.innerHTML = `<i class="fa-solid fa-plus"></i> {${header}}`;
                    tag.onclick = () => addExcelFieldTag(header);
                    excelFieldsList.appendChild(tag);
                });
                
                // Update Table Grid Preview
                dataLoadedBadge.classList.add('active');
                dataLoadedBadge.textContent = 'Active Data';
                renderPreviewTable();
                updatePreviewPager();
                
                // Enable generator
                generateBtn.disabled = false;
                generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Certificates`;
                
                // Redraw
                renderCanvas();
                
            } catch (err) {
                console.error("Excel read failure:", err);
                alert("Could not parse Excel file correctly. Ensure it is not corrupted and matches .xlsx format.");
            }
        };
        reader.readAsArrayBuffer(file);
    }

    removeExcelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        excelFileInput.value = '';
        state.excelData = [];
        state.excelHeaders = [];
        state.previewIndex = 0;
        
        excelDropzone.classList.remove('hidden');
        excelStatus.classList.add('hidden');
        dynamicFieldsSection.classList.add('hidden');
        excelFieldsList.innerHTML = '';
        
        dataLoadedBadge.classList.remove('active');
        dataLoadedBadge.textContent = 'No Data Loaded';
        
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<i class="fa-solid fa-gears"></i> Import Excel Data First`;
        
        renderPreviewTable();
        updatePreviewPager();
        renderCanvas();
    });

    // Adds Excel placeholders tags to elements
    function addExcelFieldTag(headerName) {
        const fieldTag = {
            id: `excel_field_${Date.now()}_${Math.round(Math.random()*1000)}`,
            type: 'text',
            text: `{${headerName}}`,
            x: 148.5,
            y: 105,
            fontSize: 14,
            font: 'helvetica',
            fontStyle: 'normal',
            color: '#1e293b',
            align: 'center'
        };
        state.elements.push(fieldTag);
        state.selectedElementId = fieldTag.id;
        updateInspector();
        renderCanvas();
    }

    // ----------------------------------------------------------------------
    // Data Table Preview and Pager
    // ----------------------------------------------------------------------
    function renderPreviewTable() {
        if (state.excelData.length === 0) {
            previewTableContainer.innerHTML = `
                <div class="table-empty-state">
                    <i class="fa-solid fa-table-list"></i>
                    <p>Upload an Excel spreadsheet in Step 1 to preview recipient data records here.</p>
                </div>`;
            return;
        }
        
        // Take up to 10 rows for preview grid layout
        const previewRows = state.excelData.slice(0, 10);
        
        let tableHtml = `<table class="data-table"><thead><tr><th>#</th>`;
        state.excelHeaders.forEach(header => {
            tableHtml += `<th>${header}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;
        
        previewRows.forEach((row, idx) => {
            const isSelected = idx === state.previewIndex;
            tableHtml += `<tr class="${isSelected ? 'selected-row' : ''}" data-index="${idx}"><td>${idx + 1}</td>`;
            state.excelHeaders.forEach(header => {
                const val = row[header] !== undefined ? row[header] : '';
                tableHtml += `<td>${val}</td>`;
            });
            tableHtml += `</tr>`;
        });
        
        if (state.excelData.length > 10) {
            tableHtml += `<tr><td colspan="${state.excelHeaders.length + 1}" style="text-align:center; color:var(--text-muted); font-style:italic;">Showing first 10 of ${state.excelData.length} records</td></tr>`;
        }
        tableHtml += `</tbody></table>`;
        
        previewTableContainer.innerHTML = tableHtml;
        
        // Bind row selector click
        const rows = previewTableContainer.querySelectorAll('tbody tr');
        rows.forEach(tr => {
            tr.addEventListener('click', () => {
                const idx = parseInt(tr.dataset.index);
                if (!isNaN(idx) && idx >= 0 && idx < state.excelData.length) {
                    state.previewIndex = idx;
                    renderPreviewTable();
                    updatePreviewPager();
                    renderCanvas();
                }
            });
        });
    }

    function updatePreviewPager() {
        if (state.excelData.length === 0) {
            prevRowBtn.disabled = true;
            nextRowBtn.disabled = true;
            currentPreviewRowNum.textContent = '0';
            totalPreviewRowsNum.textContent = '0';
            return;
        }
        
        currentPreviewRowNum.textContent = state.previewIndex + 1;
        totalPreviewRowsNum.textContent = state.excelData.length;
        
        prevRowBtn.disabled = state.previewIndex === 0;
        nextRowBtn.disabled = state.previewIndex === state.excelData.length - 1;
    }

    prevRowBtn.addEventListener('click', () => {
        if (state.previewIndex > 0) {
            state.previewIndex--;
            renderPreviewTable();
            updatePreviewPager();
            renderCanvas();
        }
    });

    nextRowBtn.addEventListener('click', () => {
        if (state.previewIndex < state.excelData.length - 1) {
            state.previewIndex++;
            renderPreviewTable();
            updatePreviewPager();
            renderCanvas();
        }
    });

    // ----------------------------------------------------------------------
    // Sample Excel Sheet Generator (SheetJS)
    // ----------------------------------------------------------------------
    downloadTemplateBtn.addEventListener('click', () => {
        try {
            const headers = ['name', 'course', 'date', 'grade', 'student_id'];
            const sampleData = [
                { name: 'John Doe', course: 'Full Stack Web Development', date: '2026-06-19', grade: 'A+', student_id: 'BC-2026-001' },
                { name: 'Jane Smith', course: 'Advanced UI/UX Design', date: '2026-06-20', grade: 'A', student_id: 'BC-2026-002' },
                { name: 'Alex Johnson', course: 'Data Science & Machine Learning', date: '2026-06-21', grade: 'A+', student_id: 'BC-2026-003' },
                { name: 'Emily Brown', course: 'Cyber Security Essentials', date: '2026-06-22', grade: 'B+', student_id: 'BC-2026-004' },
                { name: 'Michael Green', course: 'Cloud Solutions Architecture', date: '2026-06-23', grade: 'A', student_id: 'BC-2026-005' }
            ];
            
            // Build Worksheet
            const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Recipients");
            
            // Write Binary Array
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary' });
            
            // Convert binary string to ArrayBuffer
            const buf = new ArrayBuffer(wbout.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < wbout.length; i++) {
                view[i] = wbout.charCodeAt(i) & 0xFF;
            }
            
            // Trigger download
            const blob = new Blob([buf], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "BulkCerts_Recipient_Sample.xlsx";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (err) {
            console.error("Template build failure:", err);
            alert("Could not generate Excel template sheet.");
        }
    });

    // ----------------------------------------------------------------------
    // UI Helpers: Reset / Clear Buttons & Watermark Toggle
    // ----------------------------------------------------------------------
    resetLayoutBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to reset all positions and formatting back to the template defaults? This will erase custom styles.")) {
            loadTemplate(state.background, false);
        }
    });

    clearCustomBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear all custom images and text overlays added by you? Template variables will stay.")) {
            state.elements = state.elements.filter(elem => 
                elem.id.startsWith('classic_') || 
                elem.id.startsWith('modern_') || 
                elem.id.startsWith('formal_') || 
                elem.id.startsWith('custom_')
            );
            state.selectedElementId = null;
            updateInspector();
            renderCanvas();
        }
    });

    watermarkCheckbox.addEventListener('change', () => {
        renderCanvas();
    });

    // ----------------------------------------------------------------------
    // Bulk Generation Controller
    // ----------------------------------------------------------------------
    generateBtn.addEventListener('click', async () => {
        if (state.excelData.length === 0) return;
        
        // UI State loading setup
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Generating...`;
        progressContainer.classList.remove('hidden');
        progressBarFill.style.width = '0%';
        progressPercentage.textContent = '0%';
        progressStatus.textContent = 'Initializing generation...';
        progressCounter.textContent = `0 / ${state.excelData.length} processed`;
        
        const format = exportFormatSelect.value;
        const options = {
            format: format,
            watermark: watermarkCheckbox.checked
        };
        
        // Trigger asynchronous generation engine
        await window.generateBulkCertificates(
            state,
            options,
            // Progress Callback
            (progress) => {
                const percent = Math.round((progress.processed / progress.total) * 100);
                progressBarFill.style.width = `${percent}%`;
                progressPercentage.textContent = `${percent}%`;
                
                if (progress.phase === 'generating') {
                    progressStatus.textContent = 'Rendering PDF pages...';
                    progressCounter.textContent = `${progress.processed} / ${progress.total} processed`;
                } else if (progress.phase === 'packaging') {
                    progressStatus.textContent = 'Packaging export bundle...';
                }
            },
            // Complete Callback
            (blob, filename) => {
                // Download trigger
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                // UI Reset
                generateBtn.disabled = false;
                generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Certificates`;
                progressStatus.textContent = 'Done!';
                setTimeout(() => {
                    progressContainer.classList.add('hidden');
                }, 4000);
            },
            // Error Callback
            (errorMsg) => {
                alert(`Export Failed: ${errorMsg}`);
                generateBtn.disabled = false;
                generateBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Certificates`;
                progressContainer.classList.add('hidden');
            }
        );
    });

    // Wire everything first, then paint the default certificate preview
    loadTemplate('classic');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBulkCerts);
} else {
    bootBulkCerts();
}
