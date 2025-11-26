// js/main.js

import { logAppOpen, trackReferrer } from './api.js';
import { checkInitialAuthState, setupAuthEventListeners, isLoggedIn } from './auth.js';
import { initMap, setupActionHandlers } from './mapManager.js';
import { hideModal, showModal, switchRole } from './uiManager.js';
import { initTimeTracker } from './timeTracker.js';
import { setupApiInterceptor } from './apiInterceptor.js';

function runInitialStats() {
    logAppOpen(); // fire and forget
    trackReferrer(); // fire and forget
}

function setupGlobalEventListeners() {
    // Add event listeners for all close buttons in modals
    document.querySelectorAll('.modal .close-btn, .modal .btn-secondary').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                // Special case for 'submit proof' modal back button
                if (modal.id === 'submit-proof-modal' && e.target.classList.contains('btn-secondary')) {
                    hideModal('submit-proof-modal');
                    showModal('view-treasure-modal');
                    return;
                }
                hideModal(modal.id);
            }
        });
    });

    // Also handle closing by clicking the modal backdrop
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            // [UPDATED LOGIC] Only hide the modal if it's the target (the backdrop)
            // AND it does NOT have the 'modal-static' class.
            if (e.target === modal && !modal.classList.contains('modal-static')) {
                hideModal(modal.id);
            }
        });
    });

    // Wire up remaining action buttons from modals
    document.getElementById('next-step').addEventListener('click', () => {
        hideModal('view-treasure-modal');
        showModal('submit-proof-modal');
    });
}

function setupImageUploader() {
    const uploadBox = document.getElementById('image-upload-box');
    const proofImageInput = document.getElementById('proof-image');
    const uploadPlaceholder = document.getElementById('upload-placeholder');
    const preview = document.getElementById('proof-preview');
    
    // Crop Elements
    const cropModal = document.getElementById('crop-modal');
    const imageToCrop = document.getElementById('image-to-crop');
    const confirmBtn = document.getElementById('confirm-crop-btn');
    const cancelBtn = document.getElementById('cancel-crop-btn');
    const rotateLeftBtn = document.getElementById('rotate-left-btn');
    const rotateRightBtn = document.getElementById('rotate-right-btn');
    const resetBtn = document.getElementById('reset-crop-btn');

    let cropper = null; // ตัวแปรเก็บ Instance ของ Cropper

    if (!uploadBox) return;

    // 1. คลิกกล่องเพื่อเลือกรูป
    uploadBox.addEventListener('click', () => {
        proofImageInput.click();
    });

    // 2. เมื่อเลือกไฟล์ -> เปิดหน้า Crop
    proofImageInput.addEventListener('change', function (event) {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();

            reader.onload = (e) => {
                // ตั้งค่ารูปที่จะ Crop
                imageToCrop.src = e.target.result;
                
                // แสดง Modal
                cropModal.classList.remove('hidden');
                cropModal.classList.add('flex');

                // เริ่มต้น Cropper.js
                if (cropper) cropper.destroy(); // ล้างของเก่าถ้ามี
                cropper = new Cropper(imageToCrop, {
                    viewMode: 1, // บังคับให้อยู่ในกรอบ
                    dragMode: 'move', // ให้ลากรูปได้
                    autoCropArea: 0.8, // ขนาด Crop เริ่มต้น
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false,
                });
            };
            reader.readAsDataURL(file);
        }
    });

    // 3. ปุ่มยืนยัน (Confirm Crop)
    confirmBtn.addEventListener('click', () => {
        if (!cropper) return;

        // ดึงรูปที่ Crop แล้วออกมาเป็น Canvas
        const canvas = cropper.getCroppedCanvas({
            width: 800, // จำกัดความกว้างไม่ให้ไฟล์ใหญ่เกินไป
            height: 800,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        // แปลง Canvas เป็น Blob (ไฟล์รูป)
        canvas.toBlob((blob) => {
            // สร้าง File Object ใหม่จาก Blob
            const newFile = new File([blob], "cropped-proof.jpg", { type: "image/jpeg", lastModified: Date.now() });

            // **เทคนิคสำคัญ:** ใช้ DataTransfer เพื่อยัดไฟล์ใหม่กลับเข้าไปใน <input>
            // ทำให้โค้ดส่วน submitProof เดิมทำงานได้เลยโดยไม่ต้องแก้ mapManager.js
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(newFile);
            proofImageInput.files = dataTransfer.files;

            // อัปเดต Preview หน้าแรก
            preview.src = URL.createObjectURL(blob);
            preview.style.display = 'block';
            uploadPlaceholder.style.display = 'none';

            // ปิด Modal
            closeCropModal();
        }, 'image/jpeg', 0.85); // Quality 85%
    });

    // 4. ปุ่ม Action ต่างๆ
    cancelBtn.addEventListener('click', () => {
        proofImageInput.value = ''; // เคลียร์ไฟล์ถ้ากดยกเลิก
        closeCropModal();
    });

    rotateLeftBtn.addEventListener('click', () => cropper.rotate(-90));
    rotateRightBtn.addEventListener('click', () => cropper.rotate(90));
    resetBtn.addEventListener('click', () => cropper.reset());

    // Helper: ปิด Modal
    function closeCropModal() {
        cropModal.classList.add('hidden');
        cropModal.classList.remove('flex');
        if (cropper) {
            cropper.destroy();
            cropper = null;
        }
    }
}

// === MAIN INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    // 1. Log initial app statistics (fire and forget)
    runInitialStats();

    // 1.5. Setup the API interceptor to catch token errors globally
    setupApiInterceptor();

    // 2. Check if user is already logged in
    checkInitialAuthState();

    // 3. Initialize the Leaflet map
    initMap();

    // 4. Set up event listeners for auth (login, register, logout)
    setupAuthEventListeners();

    // 5. Set up event listeners for map actions (role switch, refresh etc)
    setupActionHandlers();

    // 6. Setup generic UI event listeners
    setupGlobalEventListeners();

    // 7. **เรียกใช้ Time Tracker ตัวใหม่**
    initTimeTracker();

    // 8. Set default UI states
    switchRole('placer'); // Set initial role

    setupImageUploader();

    // 9. Check if we need to show the login modal automatically after a session expiry
    if (localStorage.getItem('showLoginModalOnLoad') === 'true') {
        localStorage.removeItem('showLoginModalOnLoad');
        showModal('login-modal');
    }

    const discountPercentInput = document.getElementById('discount');
    const discountBahtInput = document.getElementById('discount-baht');

    if (discountPercentInput && discountBahtInput) {
        // Event listener for Percentage discount
        discountPercentInput.addEventListener('input', () => {
            // If there's a value in the percentage input, clear the baht input.
            if (discountPercentInput.value) {
                discountBahtInput.value = '';
            }
        });

        // Event listener for Baht discount
        discountBahtInput.addEventListener('input', () => {
            // If there's a value in the baht input, clear the percentage input.
            if (discountBahtInput.value) {
                discountPercentInput.value = '';
            }
        });
    }

    //console.log("Application Initialized");
});