// ==========================================================================
// BulkCerts Certificate Templates & Drawing Wrapper
// ==========================================================================

// Utility function to convert Hex to RGB (safe for older jsPDF versions)
function hexToRgb(hex) {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// --------------------------------------------------------------------------
// Unified Drawing Context Wrappers
// --------------------------------------------------------------------------

class CanvasDrawingContext {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.width = 297;
        this.height = 210;
        this.scaleX = canvas.width / 297;
        this.scaleY = canvas.height / 210;
    }

    rect(x, y, w, h, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        if (fill) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }
        if (stroke) {
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    line(x1, y1, x2, y2, strokeColor = '#000000', lineWidth = 1) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.stroke();
        this.ctx.restore();
    }

    circle(x, y, r, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(x, y, r, 0, 2 * Math.PI);
        if (fill) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }
        if (stroke) {
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    polygon(points, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        if (!points || points.length < 3) return;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();
        if (fill) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }
        if (stroke) {
            this.ctx.lineWidth = lineWidth;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.stroke();
        }
        this.ctx.restore();
    }

    text(textStr, x, y, font = 'helvetica', fontStyle = 'normal', fontSizePt = 12, colorHex = '#000000', align = 'left') {
        this.ctx.save();
        
        // Convert font size from points to logical coordinate mm units
        const sizeInMm = fontSizePt * 0.352777;
        
        let weightStr = '';
        let italicStr = '';
        if (fontStyle.toLowerCase().includes('bold')) weightStr = 'bold ';
        if (fontStyle.toLowerCase().includes('italic')) italicStr = 'italic ';
        
        let canvasFont = 'Helvetica';
        if (font.toLowerCase() === 'times') canvasFont = '"Times New Roman", Georgia, serif';
        if (font.toLowerCase() === 'courier') canvasFont = '"Courier New", Courier, monospace';
        
        this.ctx.font = `${italicStr}${weightStr}${sizeInMm}px ${canvasFont}`;
        this.ctx.fillStyle = colorHex;
        this.ctx.textAlign = align === 'left' ? 'left' : (align === 'right' ? 'right' : 'center');
        this.ctx.textBaseline = 'alphabetic';
        
        this.ctx.fillText(textStr, x, y);
        this.ctx.restore();
    }

    image(imgObj, x, y, w, h) {
        if (!imgObj) return;
        // imgObj can be a loaded HTMLImageElement
        this.ctx.drawImage(imgObj, x, y, w, h);
    }
}

class PDFDrawingContext {
    constructor(doc) {
        this.doc = doc;
        this.width = 297;
        this.height = 210;
    }

    rect(x, y, w, h, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        let style = '';
        if (fill && stroke) style = 'FD';
        else if (fill) style = 'F';
        else if (stroke) style = 'S';
        else return;

        if (fill) {
            const rgb = hexToRgb(fillColor);
            this.doc.setFillColor(rgb.r, rgb.g, rgb.b);
        }
        if (stroke) {
            const rgb = hexToRgb(strokeColor);
            this.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
            this.doc.setLineWidth(lineWidth);
        }
        this.doc.rect(x, y, w, h, style);
    }

    line(x1, y1, x2, y2, strokeColor = '#000000', lineWidth = 1) {
        const rgb = hexToRgb(strokeColor);
        this.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        this.doc.setLineWidth(lineWidth);
        this.doc.line(x1, y1, x2, y2);
    }

    circle(x, y, r, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        let style = '';
        if (fill && stroke) style = 'FD';
        else if (fill) style = 'F';
        else if (stroke) style = 'S';
        else return;

        if (fill) {
            const rgb = hexToRgb(fillColor);
            this.doc.setFillColor(rgb.r, rgb.g, rgb.b);
        }
        if (stroke) {
            const rgb = hexToRgb(strokeColor);
            this.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
            this.doc.setLineWidth(lineWidth);
        }
        this.doc.circle(x, y, r, style);
    }

    polygon(points, fill = true, stroke = false, lineWidth = 1, strokeColor = '#000000', fillColor = '#ffffff') {
        if (!points || points.length < 3) return;
        if (!fill && !stroke) return;

        if (fill) {
            const rgb = hexToRgb(fillColor);
            this.doc.setFillColor(rgb.r, rgb.g, rgb.b);

            // jsPDF has no polygon API — fan-triangulate from the first vertex
            for (let i = 1; i < points.length - 1; i++) {
                const p0 = points[0];
                const p1 = points[i];
                const p2 = points[i + 1];
                this.doc.triangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, 'F');
            }
        }

        if (stroke) {
            const rgb = hexToRgb(strokeColor);
            this.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
            this.doc.setLineWidth(lineWidth);

            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                this.doc.line(p1.x, p1.y, p2.x, p2.y);
            }
        }
    }

    text(textStr, x, y, font = 'helvetica', fontStyle = 'normal', fontSizePt = 12, colorHex = '#000000', align = 'left') {
        let jsPdfFont = 'helvetica';
        if (font.toLowerCase() === 'times') jsPdfFont = 'times';
        if (font.toLowerCase() === 'courier') jsPdfFont = 'courier';
        
        let jsPdfStyle = 'normal';
        let isBold = fontStyle.toLowerCase().includes('bold');
        let isItalic = fontStyle.toLowerCase().includes('italic');
        if (isBold && isItalic) jsPdfStyle = 'bolditalic';
        else if (isBold) jsPdfStyle = 'bold';
        else if (isItalic) jsPdfStyle = 'italic';
        
        this.doc.setFont(jsPdfFont, jsPdfStyle);
        this.doc.setFontSize(fontSizePt);
        
        const rgb = hexToRgb(colorHex);
        this.doc.setTextColor(rgb.r, rgb.g, rgb.b);
        
        this.doc.text(textStr, x, y, { align: align });
    }

    image(imgSrc, x, y, w, h) {
        if (!imgSrc) return;

        try {
            // Accept either a base64 data URL or a loaded HTMLImageElement
            const src = typeof imgSrc === 'string' ? imgSrc : imgSrc.src;
            if (!src) return;

            const format = /^data:image\/jpe?g/i.test(src) ? 'JPEG' : 'PNG';
            this.doc.addImage(src, format, x, y, w, h, undefined, 'FAST');
        } catch (e) {
            console.error("PDF image adding failed", e);
        }
    }
}

// --------------------------------------------------------------------------
// Certificate Style Templates
// --------------------------------------------------------------------------

const BulkCertsTemplates = {
    classic: {
        id: 'classic',
        name: 'Classic Certificate',
        defaultElements: [
            { id: 'classic_title', type: 'text', text: 'CERTIFICATE of APPRECIATION', x: 148.5, y: 48, fontSize: 26, font: 'times', fontStyle: 'bold', color: '#1e293b', align: 'center' },
            { id: 'classic_present', type: 'text', text: 'THIS IS PROUDLY PRESENTED TO', x: 148.5, y: 72, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' },
            { id: 'classic_name', type: 'text', text: '{name}', x: 148.5, y: 102, fontSize: 34, font: 'times', fontStyle: 'bolditalic', color: '#b45309', align: 'center' },
            { id: 'classic_desc', type: 'text', text: 'for outstanding performance and dedication in successfully completing', x: 148.5, y: 122, fontSize: 11, font: 'helvetica', fontStyle: 'normal', color: '#4b5563', align: 'center' },
            { id: 'classic_course', type: 'text', text: '{course}', x: 148.5, y: 138, fontSize: 16, font: 'helvetica', fontStyle: 'bold', color: '#1e293b', align: 'center' },
            
            { id: 'classic_line_left', type: 'text', text: '___________________________', x: 80, y: 168, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#94a3b8', align: 'center' },
            { id: 'classic_date_lbl', type: 'text', text: 'Date: {date}', x: 80, y: 175, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' },
            
            { id: 'classic_line_right', type: 'text', text: '___________________________', x: 217, y: 168, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#94a3b8', align: 'center' },
            { id: 'classic_sign_lbl', type: 'text', text: 'Authorized Signature', x: 217, y: 175, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' }
        ],
        drawBackground(drawCtx) {
            // Warm cream base background
            drawCtx.rect(0, 0, 297, 210, true, false, 0, '', '#fdfcf7');
            
            // Outer thick gold border
            drawCtx.rect(8, 8, 281, 194, false, true, 1.2, '#c5a880');
            // Inner thin gold border
            drawCtx.rect(11, 11, 275, 188, false, true, 0.4, '#c5a880');
            
            // Corner Ornaments
            const corners = [
                { x: 11, y: 11 }, { x: 286, y: 11 },
                { x: 11, y: 199 }, { x: 286, y: 199 }
            ];
            
            // Draw mini decorative corner squares
            corners.forEach(c => {
                drawCtx.rect(c.x - 2, c.y - 2, 4, 4, true, false, 0, '', '#c5a880');
            });
            
            // Draw a subtle gold seal background shape at bottom center (x=148.5, y=170)
            // Just a decorative badge polygon
            const sealPoints = [];
            const segments = 16;
            const rOuter = 12;
            const rInner = 10;
            const cx = 148.5;
            const cy = 170;
            for (let i = 0; i < segments * 2; i++) {
                const angle = (i * Math.PI) / segments;
                const r = i % 2 === 0 ? rOuter : rInner;
                sealPoints.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
            }
            drawCtx.polygon(sealPoints, true, true, 0.3, '#c5a880', '#fae8c8');
            drawCtx.circle(cx, cy, 7, true, true, 0.3, '#c5a880', '#fdfcf7');
        }
    },
    
    modern: {
        id: 'modern',
        name: 'Modern Achievement',
        defaultElements: [
            { id: 'modern_title', type: 'text', text: 'CERTIFICATE OF ACHIEVEMENT', x: 148.5, y: 50, fontSize: 26, font: 'helvetica', fontStyle: 'bold', color: '#0f172a', align: 'center' },
            { id: 'modern_present', type: 'text', text: 'this is proudly presented to', x: 148.5, y: 74, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#0d9488', align: 'center' },
            { id: 'modern_name', type: 'text', text: '{name}', x: 148.5, y: 102, fontSize: 36, font: 'helvetica', fontStyle: 'bold', color: '#0f172a', align: 'center' },
            { id: 'modern_desc', type: 'text', text: 'who has successfully demonstrated proficiency and met all requirements for', x: 148.5, y: 122, fontSize: 11, font: 'helvetica', fontStyle: 'normal', color: '#475569', align: 'center' },
            { id: 'modern_course', type: 'text', text: '{course}', x: 148.5, y: 138, fontSize: 18, font: 'helvetica', fontStyle: 'bold', color: '#0d9488', align: 'center' },
            
            { id: 'modern_line_left', type: 'text', text: '___________________________', x: 80, y: 168, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#cbd5e1', align: 'center' },
            { id: 'modern_date_lbl', type: 'text', text: 'Date: {date}', x: 80, y: 175, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' },
            
            { id: 'modern_line_right', type: 'text', text: '___________________________', x: 217, y: 168, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#cbd5e1', align: 'center' },
            { id: 'modern_sign_lbl', type: 'text', text: 'Director Signature', x: 217, y: 175, fontSize: 10, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' }
        ],
        drawBackground(drawCtx) {
            // Light grey slate background
            drawCtx.rect(0, 0, 297, 210, true, false, 0, '', '#f8fafc');
            
            // Top-Left Polygon Accent
            drawCtx.polygon([
                { x: 0, y: 0 },
                { x: 75, y: 0 },
                { x: 0, y: 75 }
            ], true, false, 0, '', '#0f172a');
            
            drawCtx.polygon([
                { x: 0, y: 0 },
                { x: 45, y: 0 },
                { x: 0, y: 45 }
            ], true, false, 0, '', '#0d9488');
            
            // Bottom-Right Polygon Accent
            drawCtx.polygon([
                { x: 297, y: 210 },
                { x: 222, y: 210 },
                { x: 297, y: 135 }
            ], true, false, 0, '', '#0d9488');
            
            drawCtx.polygon([
                { x: 297, y: 210 },
                { x: 252, y: 210 },
                { x: 297, y: 165 }
            ], true, false, 0, '', '#0f172a');
            
            // Thin modern border line on the left and right margins (re-inforces structure)
            drawCtx.line(10, 80, 10, 130, '#0d9488', 1);
            drawCtx.line(287, 80, 287, 130, '#0f172a', 1);
        }
    },
    
    formal: {
        id: 'formal',
        name: 'Formal Diploma',
        defaultElements: [
            { id: 'formal_title', type: 'text', text: 'CERTIFICATE OF COMPLETION', x: 148.5, y: 48, fontSize: 24, font: 'times', fontStyle: 'bold', color: '#064e3b', align: 'center' },
            { id: 'formal_present', type: 'text', text: 'This is to certify that', x: 148.5, y: 70, fontSize: 11, font: 'times', fontStyle: 'italic', color: '#374151', align: 'center' },
            { id: 'formal_name', type: 'text', text: '{name}', x: 148.5, y: 100, fontSize: 34, font: 'times', fontStyle: 'bold', color: '#064e3b', align: 'center' },
            { id: 'formal_desc', type: 'text', text: 'has satisfactorily fulfilled the curriculum and passed the examination for', x: 148.5, y: 120, fontSize: 11, font: 'times', fontStyle: 'normal', color: '#374151', align: 'center' },
            { id: 'formal_course', type: 'text', text: '{course}', x: 148.5, y: 136, fontSize: 18, font: 'times', fontStyle: 'bold', color: '#b45309', align: 'center' },
            
            { id: 'formal_line_left', type: 'text', text: '___________________________', x: 80, y: 168, fontSize: 10, font: 'times', fontStyle: 'normal', color: '#9ca3af', align: 'center' },
            { id: 'formal_date_lbl', type: 'text', text: 'Date of Issue: {date}', x: 80, y: 175, fontSize: 10, font: 'times', fontStyle: 'normal', color: '#374151', align: 'center' },
            
            { id: 'formal_line_right', type: 'text', text: '___________________________', x: 217, y: 168, fontSize: 10, font: 'times', fontStyle: 'normal', color: '#9ca3af', align: 'center' },
            { id: 'formal_sign_lbl', type: 'text', text: 'President of Board', x: 217, y: 175, fontSize: 10, font: 'times', fontStyle: 'normal', color: '#374151', align: 'center' }
        ],
        drawBackground(drawCtx) {
            // White clean background
            drawCtx.rect(0, 0, 297, 210, true, false, 0, '', '#ffffff');
            
            // Outer thick emerald green border
            drawCtx.rect(6, 6, 285, 198, false, true, 2.0, '#064e3b');
            // Inner thin gold border
            drawCtx.rect(9, 9, 279, 192, false, true, 0.6, '#d97706');
            
            // Small gold corners at corners of inner border
            const goldCorners = [
                { x: 9, y: 9 }, { x: 288, y: 9 },
                { x: 9, y: 201 }, { x: 288, y: 201 }
            ];
            
            goldCorners.forEach(c => {
                drawCtx.rect(c.x - 2, c.y - 2, 4, 4, true, false, 0, '', '#d97706');
            });
        }
    },

    custom: {
        id: 'custom',
        name: 'Custom Background',
        defaultElements: [
            { id: 'custom_title', type: 'text', text: 'CERTIFICATE OF COMPLETION', x: 148.5, y: 60, fontSize: 28, font: 'helvetica', fontStyle: 'bold', color: '#1e293b', align: 'center' },
            { id: 'custom_name', type: 'text', text: '{name}', x: 148.5, y: 105, fontSize: 36, font: 'helvetica', fontStyle: 'bold', color: '#0f172a', align: 'center' },
            { id: 'custom_course', type: 'text', text: '{course}', x: 148.5, y: 140, fontSize: 18, font: 'helvetica', fontStyle: 'bold', color: '#0d9488', align: 'center' },
            { id: 'custom_date', type: 'text', text: '{date}', x: 148.5, y: 175, fontSize: 12, font: 'helvetica', fontStyle: 'normal', color: '#64748b', align: 'center' }
        ],
        drawBackground(drawCtx, bgImageElementOrSrc) {
            // Draw custom uploaded image (covers entire canvas)
            if (bgImageElementOrSrc) {
                // In canvas, it is an Image object. In PDF, it is a base64 string
                drawCtx.image(bgImageElementOrSrc, 0, 0, 297, 210);
            } else {
                // If no background uploaded, render a placeholder layout so the workspace isn't blank
                drawCtx.rect(0, 0, 297, 210, true, false, 0, '', '#f1f5f9');
                drawCtx.rect(10, 10, 277, 190, false, true, 1.0, '#cbd5e1');
                
                drawCtx.text("Upload a custom certificate background image in the sidebar", 148.5, 105, 'helvetica', 'normal', 12, '#64748b', 'center');
            }
        }
    }
};

// Global exports for browser scripts
window.BulkCertsTemplates = BulkCertsTemplates;
window.CanvasDrawingContext = CanvasDrawingContext;
window.PDFDrawingContext = PDFDrawingContext;
