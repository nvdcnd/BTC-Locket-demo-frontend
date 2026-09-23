// Khai báo biến để xác định thiết bị
const isDesktop = window.innerWidth >= 992;
// Khai báo khung chụp
const videoElement = document.getElementById(isDesktop ? 'desktopVideo' : 'mobileVideo');
// Khai báo các nút
const submitButton = document.getElementById(isDesktop ? 'desktopSubmitButton' : 'mobileSubmitButton');
const captureButton = document.getElementById(isDesktop ? 'desktopCaptureButton' : 'mobileCaptureButton');
const cancelButton = document.getElementById(isDesktop ? 'desktopCancelButton' : 'mobileCancelButton');
// Khai báo các chế độ
const previewMode = document.getElementById(isDesktop ? 'desktopPreviewMode' : 'mobilePreviewMode');
const imageCaptureMode = document.getElementById(isDesktop ? 'desktopImageCaptureMode' : 'mobileImageCaptureMode');
const isPreviewMode = false;
// Khai báo các input
const descriptionInput = document.getElementById(isDesktop ? 'desktopDescriptionInput' : 'mobileDescriptionInput');
const nameInput = document.getElementById(isDesktop ? 'desktopNameInput' : 'mobileNameInput');

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.play();
    } catch (error) {
        console.error('Error accessing the camera:', error);
    }
}

function stopCamera() {
    const stream = videoElement.srcObject;
    const tracks = stream.getTracks();
    tracks.forEach(track => track.stop());
    videoElement.srcObject = null;
}

function captureImage() {
    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    const img = document.createElement('img');
    img.src = imageDataUrl;
    previewMode.appendChild(img);
    isPreviewMode = true;
}

function showPreview() {
    previewMode.style.display = 'block';
    imageCaptureMode.style.display = 'none';
}

function exitPreview() {
    previewMode.style.display = 'none';
    imageCaptureMode.style.display = 'block';
    isPreviewMode = false;
}

function validateInputs() {
    if (!descriptionInput.value.trim() || !nameInput.value.trim()) {
        alert('Please fill in both the description and name fields.');
        return false;
    }
    return true;
}

async function sendImageToServer(img, api) {
    // Gửi ảnh lên server
    try {
        const response = await fetch(api, {
            method: 'POST',
            body: JSON.stringify({ image: img.src, description: descriptionInput.value, name: nameInput.value }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to upload image');
        }
    } catch (error) {
        console.error('Error uploading image:', error);
    }
}