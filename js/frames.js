// =====================================================
// XUẤT HÌNH THEO KHUNG (frontend/frames/odd|even/*.html)
// Menu chọn dạng xuất → ghép 1 ảnh nhân bản vào mọi ô → tải PNG về máy
// Cơ chế: fetch file khung HTML → đọc các .fs có vị trí % inline → vẽ canvas
// =====================================================

import { loadImage, getUserName } from './api.js';

const EXPORT_SIZE = 1080; // Ảnh xuất vuông 1080×1080

// Danh sách khung (group khớp thư mục odd/even)
const FRAMES = [
    { id: '1img', name: 'Khung 1 ảnh', group: 'odd', cols: 1, rows: 1, url: 'frames/odd/1img.html' },
    { id: '2img', name: 'Khung 2 ảnh', group: 'even', cols: 1, rows: 2, url: 'frames/even/2img.html' },
    { id: '3img', name: 'Khung 3 ảnh', group: 'odd', cols: 2, rows: 2, url: 'frames/odd/3img.html' },
    { id: '4img', name: 'Khung 4 ảnh', group: 'even', cols: 2, rows: 2, url: 'frames/even/4img.html' },
    { id: '6img', name: 'Khung 6 ảnh', group: 'even', cols: 3, rows: 2, url: 'frames/even/6img.html' },
    { id: '9img', name: 'Khung 9 ảnh', group: 'odd', cols: 3, rows: 3, url: 'frames/odd/9img.html' },
];

let _showToast = () => {};

export function initFrameExporter({ showToast } = {}) {
    if (typeof showToast === 'function') _showToast = showToast;
}

// —— Vẽ ảnh phủ kín 1 ô (giữ tỉ lệ, crop giữa — tương đương object-fit: cover)
function drawImageCover(ctx, img, dx, dy, dw, dh) {
    const scale = Math.max(dw / img.width, dh / img.height);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

// =====================================================
// LỚP TRANG TRÍ — đọc từ các phần tử .deco trong file khung
// 3 loại: rect (viền/khối) · text (chữ script, ngày) · holes (lỗ film)
// Vị trí/kích thước theo % của khung; giá trị px (size/hole/gap...)
// tính theo bản thiết kế 1000px rồi tự scale lên EXPORT_SIZE
// =====================================================

function parseDecoEl(el) {
    const pct = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
    const style = el.style;
    const d = el.dataset;

    const deco = {
        type: d.type || 'rect',
        x: pct(style.left), y: pct(style.top),
        w: pct(style.width), h: pct(style.height),
    };

    if (deco.type === 'text') {
        deco.text = (d.text || '').replaceAll('\\n', '\n');
        deco.font = d.font || "'Helvetica Neue', Arial, sans-serif";
        deco.size = num(d.size, 36);
        deco.color = d.color || '#ffffff';
        deco.align = d.align || 'center';   // left | center | right
        deco.spacing = num(d.spacing, 0);   // giãn chữ (px bản thiết kế)
        deco.italic = d.italic === 'true';
        deco.rotate = num(d.rotate, 0);     // độ, quay quanh tâm khối (chữ dọc)
    } else if (deco.type === 'holes') {
        deco.side = d.side || 'left';       // left/right = trải dọc, top/bottom = trải ngang
        deco.count = Math.max(1, Math.round(num(d.count, 7)));
        deco.hole = num(d.hole, 15);
        deco.gap = num(d.gap, 34);
        deco.color = d.color || '#f5f5f5';
    } else {
        deco.fill = d.fill || 'none';
        deco.stroke = d.stroke || 'none';
        deco.strokeWidth = num(d.strokeWidth, 1.5);
        deco.radius = num(d.radius, 0);
    }
    return deco;
}

// Đường bo góc (fallback cho trình duyệt thiếu ctx.roundRect)
function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function drawDecoRect(ctx, deco, x, y, w, h, s) {
    if (deco.fill !== 'none') {
        ctx.fillStyle = deco.fill;
        roundRectPath(ctx, x, y, w, h, deco.radius * s);
        ctx.fill();
    }
    if (deco.stroke !== 'none' && deco.strokeWidth > 0) {
        ctx.strokeStyle = deco.stroke;
        ctx.lineWidth = Math.max(1, deco.strokeWidth * s);
        roundRectPath(ctx, x, y, w, h, deco.radius * s);
        ctx.stroke();
    }
}

function drawDecoText(ctx, deco, x, y, w, h, s) {
    ctx.save();
    ctx.fillStyle = deco.color;
    ctx.font = `${deco.italic ? 'italic ' : ''}${deco.size * s}px ${deco.font}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${deco.spacing * s}px`;

    // Quay quanh tâm khối (dùng cho chữ dọc cạnh khung)
    if (deco.rotate) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((deco.rotate * Math.PI) / 180);
        ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = deco.align === 'left' ? 'left' : deco.align === 'right' ? 'right' : 'center';
    const tx = deco.align === 'left' ? x : deco.align === 'right' ? x + w : x + w / 2;

    const lines = deco.text.split('\n');
    const lineH = deco.size * s * 1.35;
    const blockH = lines.length * lineH;
    lines.forEach((line, i) => {
        ctx.fillText(line, tx, y + h / 2 - blockH / 2 + lineH / 2 + i * lineH);
    });
    ctx.restore();
}

function drawDecoHoles(ctx, deco, x, y, w, h, s) {
    ctx.fillStyle = deco.color;
    const vertical = deco.side === 'left' || deco.side === 'right';
    const hole = Math.min(deco.hole * s, vertical ? w : h);
    const gap = deco.gap * s;
    const span = vertical ? h : w;
    const total = deco.count * hole + (deco.count - 1) * gap;
    const start = (vertical ? y : x) + (span - total) / 2;

    for (let i = 0; i < deco.count; i++) {
        const pos = start + i * (hole + gap);
        if (vertical) roundRectPath(ctx, x + (w - hole) / 2, pos, hole, hole, hole * 0.3);
        else roundRectPath(ctx, pos, y + (h - hole) / 2, hole, hole, hole * 0.3);
        ctx.fill();
    }
}

// Vẽ toàn bộ lớp trang trí lên canvas đã có ảnh
function drawDecorations(ctx, decos, S) {
    const s = S / 1000; // tỷ lệ bản thiết kế → px thật
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
    const name = getUserName() || 'Locket Cam';

    for (const deco of decos) {
        if (deco.type === 'text') {
            deco.text = deco.text.replaceAll('{{date}}', dateStr).replaceAll('{{name}}', name);
        }
        const x = (deco.x / 100) * S;
        const y = (deco.y / 100) * S;
        const w = (deco.w / 100) * S;
        const h = (deco.h / 100) * S;
        if (deco.type === 'text') drawDecoText(ctx, deco, x, y, w, h, s);
        else if (deco.type === 'holes') drawDecoHoles(ctx, deco, x, y, w, h, s);
        else drawDecoRect(ctx, deco, x, y, w, h, s);
    }
}

// —— Fetch file khung HTML → slots (ô ảnh) + decos (trang trí) + màu nền
async function parseFrameLayout(frameUrl) {
    const res = await fetch(frameUrl);
    if (!res.ok) throw new Error(`Không tải được khung (${res.status})`);

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const frameEl = doc.querySelector('.frame');
    if (!frameEl) throw new Error('File khung thiếu phần tử .frame');

    const pct = (v, fallback) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    };

    const slots = Array.from(frameEl.querySelectorAll('.fs'))
        .map((el) => ({
            slot: parseInt(el.dataset.slot || '0', 10),
            x: pct(el.style.left, 0),
            y: pct(el.style.top, 0),
            w: pct(el.style.width, 100),
            h: pct(el.style.height, 100),
        }))
        .sort((a, b) => a.slot - b.slot);

    const decos = Array.from(frameEl.querySelectorAll('.deco')).map(parseDecoEl);
    const frameBg = frameEl.style.backgroundColor || '#000000';

    return { slots, decos, frameBg };
}

// —— Tải blob về máy
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// —— Ghép ảnh vào khung và xuất PNG
export async function exportWithFrame(frame, imageUrl) {
    _showToast('Đang tạo ảnh xuất... ⏳', true);

    const [layout, img] = await Promise.all([
        parseFrameLayout(frame.url),
        loadImage(imageUrl),
    ]);

    if (!layout.slots.length) throw new Error('Khung không có ô ảnh nào');

    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext('2d');

    // Nền theo màu khai báo trong file khung
    ctx.fillStyle = layout.frameBg;
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    // Cùng 1 ảnh nhân bản vào mọi ô
    for (const s of layout.slots) {
        drawImageCover(
            ctx,
            img,
            (s.x / 100) * EXPORT_SIZE,
            (s.y / 100) * EXPORT_SIZE,
            (s.w / 100) * EXPORT_SIZE,
            (s.h / 100) * EXPORT_SIZE
        );
    }

    // Lớp trang trí (viền film, lỗ film, chữ script, ngày...) vẽ đè lên cùng
    drawDecorations(ctx, layout.decos, EXPORT_SIZE);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Không tạo được file PNG');

    downloadBlob(blob, `locket_${frame.id}_${Date.now()}.png`);
    _showToast(`Đã xuất ${frame.name.toLowerCase()} về máy! 🖼️`, true);
}

// —— Menu chọn dạng xuất (overlay glassmorphism)
let _menuEl = null;

function ensureMenu() {
    if (_menuEl) return _menuEl;

    _menuEl = document.createElement('div');
    _menuEl.className = 'modal-overlay d-none';
    _menuEl.id = 'frame-menu-overlay';
    _menuEl.innerHTML = `
        <div class="modal-panel glass-panel frame-menu-panel">
            <div class="modal-header">
                <h5><i class="bi bi-images text-warning"></i> Xuất hình — chọn khung</h5>
                <button class="modal-close-btn" type="button" aria-label="Đóng">
                    <i class="bi bi-x-lg"></i>
                </button>
            </div>
            <p class="frame-menu-hint">Ảnh sẽ được nhân bản vào tất cả các ô của khung</p>
            <div class="frame-menu-grid"></div>
        </div>
    `;
    document.body.appendChild(_menuEl);

    // Đóng menu
    _menuEl.addEventListener('click', (e) => {
        if (e.target === _menuEl || e.target.closest('.modal-close-btn')) {
            closeExportMenu();
        }
    });

    // Render các option khung
    const grid = _menuEl.querySelector('.frame-menu-grid');
    for (const frame of FRAMES) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'frame-option';
        option.dataset.frameId = frame.id;

        const thumb = document.createElement('span');
        thumb.className = 'frame-thumb';
        thumb.style.gridTemplateColumns = `repeat(${frame.cols}, 1fr)`;
        thumb.style.gridTemplateRows = `repeat(${frame.rows}, 1fr)`;
        for (let i = 0; i < frame.cols * frame.rows; i++) {
            const cell = document.createElement('i');
            cell.className = 'frame-thumb-cell';
            thumb.appendChild(cell);
        }

        const name = document.createElement('span');
        name.className = 'frame-option-name';
        name.textContent = frame.name;

        const group = document.createElement('span');
        group.className = 'frame-option-group';
        group.textContent = frame.group === 'odd' ? 'Lẻ' : 'Chẵn';

        option.append(thumb, name, group);

        option.addEventListener('click', async () => {
            const imageUrl = _menuEl.dataset.imageUrl;
            closeExportMenu();
            if (!imageUrl) return;
            try {
                await exportWithFrame(frame, imageUrl);
            } catch (err) {
                console.error('Export frame error:', err);
                _showToast('Xuất ảnh thất bại: ' + err.message, false);
            }
        });

        grid.appendChild(option);
    }

    return _menuEl;
}

export function openExportMenu({ imageUrl } = {}) {
    const menu = ensureMenu();
    if (!imageUrl) {
        _showToast('Chưa có ảnh để xuất!', false);
        return;
    }
    menu.dataset.imageUrl = imageUrl;
    menu.classList.remove('d-none');
}

export function closeExportMenu() {
    _menuEl?.classList.add('d-none');
}
