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

    if (!uploadBox) return; // Exit if the element doesn't exist

    // Make the entire box clickable to open file dialog
    uploadBox.addEventListener('click', () => {
        proofImageInput.click();
    });

    // Handle file selection and show preview
    proofImageInput.addEventListener('change', function (event) {
        if (event.target.files && event.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                uploadPlaceholder.style.display = 'none';
            };
            reader.readAsDataURL(event.target.files[0]);
        }
    });
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