// =====================================================
// LOCKET WEB — MAIN LOGIC
// Upload: FormData (Phương án A) | Feed: cursor pagination (next_page)
// Tên user: localStorage (không có login) | Xuất hình: frames.js
// =====================================================

import { getFeed, uploadPost, getUserName, setUserName, hasUserName } from './api.js';
import { initFrameExporter, openExportMenu } from './frames.js';

let isFetching = false;
let currentStream = null;
let isPreviewMode = false;
let capturedBlob = null;       // Blob ảnh chuẩn bị đăng (FormData)
let capturedDataUrl = null;    // dataURL chỉ để preview
let nextCursor = null;         // cursor của trang kế (null = hết)
let hasNext = true;

// =========================
// TOAST
// =========================
const toastPopover = document.getElementById('toast-popover');
const toastMessage = document.getElementById('toast-message');
const toastIcon = document.getElementById('toast-icon');

function showToast(message, isSuccess = true) {
    if (!toastMessage || !toastIcon || !toastPopover) return;
    toastMessage.textContent = message;
    toastIcon.className = isSuccess
        ? 'bi bi-check-circle-fill text-warning fs-5'
        : 'bi bi-x-circle-fill text-danger fs-5';
    toastPopover.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toastPopover.classList.remove('show'), 5000);
}

// Escape text để không bị chèn HTML vào feed
function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Định dạng giờ đăng: "HH:mm, d/m"
function formatTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${d.getDate()}/${d.getMonth() + 1}`;
}

// =========================
// TÊN USER (localStorage)
// =========================
const nameModal = document.getElementById('name-modal-overlay');
const nameInput = document.getElementById('name-modal-input');
const nameSaveBtn = document.getElementById('name-modal-save');
const nameDisplay = document.getElementById('user-name-display');

function updateNameDisplay() {
    const name = getUserName();
    if (nameDisplay) nameDisplay.textContent = name || 'Chưa có tên';
}

function openNameModal() {
    if (!nameModal) return;
    if (nameInput) nameInput.value = getUserName();
    nameModal.classList.remove('d-none');
    nameInput?.focus();
}

function closeNameModal() {
    nameModal?.classList.add('d-none');
}

function saveName() {
    const value = nameInput ? nameInput.value : '';
    if (!setUserName(value)) {
        showToast('Tên không được bỏ trống!', false);
        nameInput?.focus();
        return;
    }
    updateNameDisplay();
    closeNameModal();
    showToast(`Xin chào, ${getUserName()}! 👋`, true);
}

nameSaveBtn?.addEventListener('click', saveName);
nameInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveName();
});
nameModal?.addEventListener('click', (e) => {
    // Bấm ra ngoài panel: nếu đã có tên thì đóng, chưa có thì giữ lại bắt nhập
    if (e.target === nameModal) {
        if (hasUserName()) closeNameModal();
        else showToast('Hãy nhập tên để tiếp tục nhé!', false);
    }
});
document.getElementById('user-profile-btn')?.addEventListener('click', openNameModal);

// =========================
// BOTTOM NAVBAR (FAB)
// =========================
const fabBtn = document.getElementById('fab-nav-trigger');
const bottomNav = document.getElementById('bottom-nav');
const navCameraBtn = document.getElementById('nav-camera-btn');
const mainScrollContainer = document.getElementById('main-feed');

if (fabBtn && bottomNav) {
    fabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bottomNav.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!bottomNav.contains(e.target) && !fabBtn.contains(e.target)) {
            bottomNav.classList.remove('active');
        }
    });
}

if (navCameraBtn) {
    navCameraBtn.addEventListener('click', () => {
        bottomNav?.classList.remove('active');
        mainScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// =========================
// WEBCAM
// =========================
async function startCamera(videoElement) {
    if (!videoElement) return;
    try {
        if (!currentStream || !currentStream.active) {
            currentStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', aspectRatio: 1 },
                audio: false,
            });
        }
        videoElement.srcObject = currentStream;
        await videoElement.play();
    } catch (err) {
        console.warn('Chưa cấp quyền webcam hoặc mở qua file://:', err);
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        currentStream = null;
    }
}

// =========================
// PREVIEW MODE
// =========================
function getUI(isDesktop) {
    return {
        camFrame: document.getElementById(isDesktop ? 'desktop-cam-frame' : 'mobile-cam-frame'),
        previewFrame: document.getElementById(isDesktop ? 'desktop-preview-frame' : 'mobile-preview-frame'),
        canvas: document.getElementById(isDesktop ? 'desktop-canvas' : 'mobile-canvas'),
        shutterBtn: document.getElementById(isDesktop ? 'desktop-shutter-btn' : 'mobile-shutter-btn'),
        cancelBtn: document.getElementById(isDesktop ? 'desktop-cancel-btn' : 'mobile-cancel-btn'),
        exportBtn: document.getElementById(isDesktop ? 'desktop-export-btn' : 'mobile-export-btn'),
        captionInput: document.getElementById(isDesktop ? 'desktop-caption-input' : 'mobile-caption-input'),
        video: document.getElementById(isDesktop ? 'webcam-desktop' : 'webcam-mobile'),
    };
}

function enterPreviewMode({ blob, dataUrl }) {
    isPreviewMode = true;
    capturedBlob = blob;
    capturedDataUrl = dataUrl;

    const ui = getUI(window.innerWidth >= 992);

    const img = new Image();
    img.onload = () => {
        if (!ui.canvas) return;
        ui.canvas.width = img.width;
        ui.canvas.height = img.height;
        ui.canvas.getContext('2d').drawImage(img, 0, 0);
    };
    img.src = dataUrl;

    ui.camFrame?.classList.add('d-none');
    ui.previewFrame?.classList.remove('d-none');

    if (ui.shutterBtn) {
        ui.shutterBtn.classList.add('mode-send');
        ui.shutterBtn.innerHTML = '<i class="bi bi-send-fill"></i>';
    }
    if (ui.exportBtn) {
        ui.exportBtn.classList.remove('d-none'); // hiện nút xuất hình trong preview
        ui.exportBtn.innerHTML = '<i class="bi bi-grid-1x2-fill"></i>';
    }
    if (ui.cancelBtn) {
        ui.cancelBtn.innerHTML = '<i class="bi bi-x-lg text-danger fs-5"></i>';
    }
}

function exitPreviewMode() {
    isPreviewMode = false;
    capturedBlob = null;
    capturedDataUrl = null;

    const ui = getUI(window.innerWidth >= 992);

    if (ui.captionInput) ui.captionInput.value = '';

    ui.camFrame?.classList.remove('d-none');
    ui.previewFrame?.classList.add('d-none');

    if (ui.shutterBtn) {
        ui.shutterBtn.classList.remove('mode-send');
        ui.shutterBtn.innerHTML = '';
    }
    if (ui.exportBtn) {
        ui.exportBtn.classList.add('d-none');
        ui.exportBtn.innerHTML = '';
    }
    if (ui.cancelBtn) {
        ui.cancelBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
    }

    startCamera(ui.video);
}

// =========================
// CHỤP & UPLOAD
// =========================
document.querySelectorAll('.shutter-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (isPreviewMode) {
            handleSendPost();
            return;
        }

        const ui = getUI(window.innerWidth >= 992);
        if (!ui.video || !ui.video.srcObject) {
            showToast('Camera chưa sẵn sàng (hoặc đang mở file HTML thô)!', false);
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = ui.video.videoWidth || 400;
        tempCanvas.height = ui.video.videoHeight || 400;
        const ctx = tempCanvas.getContext('2d');

        // Lật ngang cho giống gương tự nhiên
        ctx.translate(tempCanvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(ui.video, 0, 0, tempCanvas.width, tempCanvas.height);

        // Blob để upload (FormData), dataURL chỉ để preview
        tempCanvas.toBlob(
            (blob) => {
                if (!blob) {
                    showToast('Không tạo được ảnh từ camera!', false);
                    return;
                }
                enterPreviewMode({ blob, dataUrl: tempCanvas.toDataURL('image/jpeg', 0.9) });
            },
            'image/jpeg',
            0.9
        );
    });
});

document.querySelectorAll('.upload-btn-trigger').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById('file-input')?.click());
});

const fileInput = document.getElementById('file-input');
fileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Dùng thẳng File (là Blob) — không cần FileReader base64 nữa
    enterPreviewMode({ blob: file, dataUrl: URL.createObjectURL(file) });
    e.target.value = '';
});

document.querySelectorAll('.action-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (isPreviewMode) exitPreviewMode();
    });
});

// Nút xuất hình trong preview: mở menu khung với ảnh đang giữ
document.querySelectorAll('.export-btn-trigger').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (capturedDataUrl) openExportMenu({ imageUrl: capturedDataUrl });
    });
});

async function handleSendPost() {
    if (!capturedBlob) return;

    const ui = getUI(window.innerWidth >= 992);
    const caption = ui.captionInput ? ui.captionInput.value : '';

    // Bắt nhập tên trước nếu chưa có
    if (!hasUserName()) {
        openNameModal();
        return;
    }

    // Giữ blob + caption rồi thoát preview NGAY để UX mượt
    const blob = capturedBlob;
    exitPreviewMode();

    if (window.innerWidth < 992) {
        mainScrollContainer?.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    }

    try {
        const image = await uploadPost({ blob, caption });
        prependFeedCard(image);
        showToast('Đã đăng khoảnh khắc mới! 🌟', true);
    } catch (err) {
        console.error('Upload error:', err);
        showToast(err.message || 'Gửi ảnh thất bại!', false);
    }
}

// =========================
// RENDER FEED
// =========================
function buildFeedCard(post) {
    const section = document.createElement('section');
    section.className = 'card-item';
    section.dataset.postId = post.id || '';

    const caption = post.description
        ? `<div class="feed-overlay-caption">${escapeHtml(post.description)}</div>`
        : '';

    // Không còn avatar — chỉ tên • thời gian
    section.innerHTML = `
        <div class="feed-post">
            <div class="feed-img-wrapper">
                <img src="${escapeHtml(post.url)}" class="feed-img" alt="Feed image" loading="lazy">
                ${caption}
            </div>
            <div class="feed-user-info">
                <div class="user-meta">
                    <span class="user-name">${escapeHtml(post.name)}</span>
                    <span class="post-time">• ${escapeHtml(formatTime(post.created_at))}</span>
                </div>
            </div>
            <div class="feed-actions-bar">
                <button class="btn-export-post glass-panel" type="button" title="Xuất hình theo khung">
                    <i class="bi bi-grid-1x2-fill"></i> Xuất hình
                </button>
            </div>
        </div>
    `;

    // Nút xuất hình trên feed: dùng ảnh gốc của bài post
    section.querySelector('.btn-export-post')?.addEventListener('click', () => {
        openExportMenu({ imageUrl: post.url });
    });

    return section;
}

function prependFeedCard(post) {
    const feedContainer = document.getElementById('feed-list');
    if (!feedContainer || !post) return;
    feedContainer.prepend(buildFeedCard(post));
}

function appendFeedPosts(posts) {
    const feedContainer = document.getElementById('feed-list');
    if (!feedContainer || !Array.isArray(posts)) return;
    const fragment = document.createDocumentFragment();
    posts.forEach((post) => fragment.appendChild(buildFeedCard(post)));
    feedContainer.append(fragment);
}

// =========================
// INFINITE SCROLL (cursor)
// =========================
async function fetchNextFeedPage() {
    if (!hasNext || isFetching) return;
    isFetching = true;

    try {
        const page = await getFeed({ cursor: nextCursor, size: 10 });
        nextCursor = page.next_page;
        hasNext = page.next_page !== null;
        appendFeedPosts(page.items);
    } catch (err) {
        console.error('Lỗi Infinite Scroll:', err);
        showToast('Không tải được thêm bài viết!', false);
    } finally {
        isFetching = false;
    }
}

// =========================
// OBSERVERS
// =========================
const endCard = document.getElementById('end-card');

if (endCard && mainScrollContainer) {
    const scrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && hasNext) fetchNextFeedPage();
            });
        },
        { root: mainScrollContainer, rootMargin: '200px', threshold: 0 }
    );
    scrollObserver.observe(endCard);
}

const cameraCard = document.getElementById('camera-card');
const mobileVideo = document.getElementById('webcam-mobile');

if (cameraCard && mainScrollContainer) {
    const camObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && !isPreviewMode) startCamera(mobileVideo);
                else stopCamera();
            });
        },
        { root: mainScrollContainer, threshold: 0.5 }
    );
    camObserver.observe(cameraCard);
}

const desktopVideo = document.getElementById('webcam-desktop');
const desktopCamBtn = document.getElementById('desktop-cam-toggle');
let isDesktopCamOn = true;

if (window.innerWidth >= 992) startCamera(desktopVideo);

desktopCamBtn?.addEventListener('click', () => {
    const icon = desktopCamBtn.querySelector('i');
    if (isDesktopCamOn) {
        stopCamera();
        if (desktopVideo) desktopVideo.srcObject = null;
        if (icon) icon.className = 'bi bi-camera-video-off-fill text-danger';
        isDesktopCamOn = false;
    } else {
        startCamera(desktopVideo);
        if (icon) icon.className = 'bi bi-camera-video-fill text-warning';
        isDesktopCamOn = true;
    }
});

// =========================
// KHỞI TẠO
// =========================
initFrameExporter({ showToast });

// Chưa có tên → mở modal bắt nhập ngay
if (!hasUserName()) openNameModal();
else updateNameDisplay();

// Tải trang đầu của feed
fetchNextFeedPage();
