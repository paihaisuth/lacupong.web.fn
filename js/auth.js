// js/auth.js
import * as api from './api.js';
import * as ui from './uiManager.js';
import { initGameService } from './gameService.js';

const POLICY_LINK_URL = "#";

let state = {
    authToken: null,
    currentUser: null,
    registrationData: {}
};

export const isLoggedIn = () => !!state.authToken;

function updateUIforAuthState() {
    const userBtn = document.getElementById('user-btn');
    const userInfoDisplay = document.getElementById('user-info-display');
    const loginDot = document.getElementById('login-dot');

    // UI Elements for Top Bar
    const topNameDisplay = document.getElementById('user-info-display-top');
    const topAvatarDisplay = document.getElementById('top-avatar-display');

    if (state.authToken && state.currentUser) {
        // --- LOGGED IN STATE ---
        userBtn.classList.add('text-gold-600', 'bg-gold-50');
        userInfoDisplay.innerHTML = `<span class="text-sm text-gray-500">สวัสดี</span><br><span class="text-lg text-gold-600 font-bold">${state.currentUser.username}</span>`;
        if (loginDot) loginDot.style.display = 'block';

        // Update Top Bar Name
        if (topNameDisplay) topNameDisplay.innerText = state.currentUser.username;

        // Update Top Bar Avatar (Fetch from LocalStorage temp data or default)
        if (topAvatarDisplay && window.gameService) {
            const gameData = JSON.parse(localStorage.getItem('userGameData_temp')) || { avatar: { skin: '#e0ac69', shirt: '#3b82f6' } };
            topAvatarDisplay.innerHTML = window.gameService.generateAvatarSVG(gameData.avatar);
        }

    } else {
        // --- LOGGED OUT / GUEST STATE ---
        userBtn.classList.remove('text-gold-600', 'bg-gold-50');
        userInfoDisplay.textContent = '';
        if (loginDot) loginDot.style.display = 'none';

        // Reset Top Bar to Guest
        if (topNameDisplay) topNameDisplay.innerText = 'Guest';
        if (topAvatarDisplay) {
            // Default Guest Icon
            topAvatarDisplay.innerHTML = '<i data-lucide="user" class="text-gray-400 w-5 h-5"></i>';
        }
    }

    // Refresh Icons
    if (window.lucide) lucide.createIcons();
}

export function getCurrentUserId() {
    if (!state.currentUser) return null;
    return state.currentUser.id || state.currentUser._id || null;
}

async function handleLogin(e, credentials = null) {
    if (e) e.preventDefault();
    
    const loginBtn = document.getElementById('login-submit-btn');
    const originalBtnContent = loginBtn ? loginBtn.innerHTML : 'เข้าสู่ระบบ';
    let username, password;

    if (credentials) {
        username = credentials.username;
        password = credentials.password;
    } else {
        username = document.getElementById('login-username').value;
        password = document.getElementById('login-password').value;
    }

    if (!credentials && loginBtn) { 
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<div class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"></div>';
    }

    try {
        const response = await api.loginUser(username, password);
        if (response.success) {
            state.authToken = response.token;
            state.currentUser = response.user; // This now includes { id, username, role }
            
            localStorage.setItem('authToken', state.authToken);
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            
            // Refresh UI State
            updateUIforAuthState();
            
            // Sync Map to show 'Mine' signs immediately
            if(window.mapManager && window.mapManager.loadSigns) {
                window.mapManager.loadSigns();
            }
            if(window.mapManager && window.mapManager.refreshUserMarker) {
                window.mapManager.refreshUserMarker();
            }
            
            ui.hideAllModals(); 
            
            if (!credentials) {
                ui.showSuccessAlert('ยินดีต้อนรับ!', `สวัสดีคุณ ${state.currentUser.username}`);
            }
        }
    } catch (error) {
        console.error("Login failed:", error.message);
        if (!credentials) {
            ui.showErrorAlert(error.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        }
    } finally {
        if (!credentials && loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = originalBtnContent;
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const gender = document.querySelector('input[name="gender"]:checked')?.value;
    const ageRange = document.querySelector('input[name="age-range"]:checked')?.value;
    const referral = document.querySelector('input[name="referral"]:checked')?.value;

    state.registrationData = { ...state.registrationData, gender, ageRange, referral };

    try {
        const response = await api.registerUser(state.registrationData);
        if (response.success) {
            // Success & Auto Login
            await ui.showSuccessAlert('สมัครสมาชิกสำเร็จ!', 'กำลังเข้าสู่ระบบอัตโนมัติ...');

            await handleLogin(null, {
                username: state.registrationData.username,
                password: state.registrationData.password
            });
        }
    } catch (error) {
        ui.showErrorAlert(error.message);
    } finally {
        resetRegistrationForm();
    }
}

function handleLogout() {
    Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        customClass: {
            popup: 'rounded-3xl shadow-2xl font-sans',
            confirmButton: 'px-6 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors mx-2',
            cancelButton: 'px-6 py-2 bg-gray-100 text-gray-500 rounded-xl hover:bg-gray-200 transition-colors mx-2'
        },
        buttonsStyling: false
    }).then((result) => {
        if (result.isConfirmed) {
            state.authToken = null;
            state.currentUser = null;
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser');
            localStorage.removeItem('userGameData_temp');

            updateUIforAuthState(); // This will now reset the top bar too

            document.getElementById('user-menu').classList.remove('opacity-100', 'visible', 'translate-y-0');
            ui.showSuccessAlert('ออกจากระบบแล้ว', 'ไว้เจอกันใหม่นะ!');

            // Optional: Reload map to clear user specific markers or refresh view
            // window.location.reload(); 
        }
    });
}

export function checkInitialAuthState() {
    const storedToken = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');
    if (storedToken && storedUser) {
        state.authToken = storedToken;
        state.currentUser = JSON.parse(storedUser);
        updateUIforAuthState();
    }
}

function handleRegistrationStep() {
    const currentStep = parseInt(document.querySelector('.form-step.active-step').dataset.step);

    if (currentStep === 1) {
        const policyCheckbox = document.getElementById('policy-checkbox');
        if (!policyCheckbox.checked) {
            ui.showInfoAlert('แจ้งเตือน', 'กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนดำเนินการต่อ');
            return;
        }

        const username = document.getElementById('register-username').value;
        const emailInput = document.getElementById('register-email');
        const email = emailInput.value;
        const password = document.getElementById('register-password').value;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            ui.showInfoAlert('รูปแบบไม่ถูกต้อง', 'กรุณากรอกอีเมลให้ถูกต้อง (เช่น example@mail.com)');
            return;
        }

        if (!username || !password) {
            ui.showInfoAlert('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลบัญชีให้ครบถ้วน');
            return;
        }

        state.registrationData = { username, email, password };
        navigateToStep(2);
    } else if (currentStep === 2) {
        handleRegister(new Event('submit'));
    }
}

function navigateToStep(stepNumber) {
    // 1. ซ่อนทุก Step ก่อน
    document.querySelectorAll('.form-step').forEach(step => {
        step.classList.remove('active-step');
        step.classList.add('hidden'); // สำคัญ: ต้องเพิ่ม class hidden ของ Tailwind
    });

    // 2. แสดง Step ที่ต้องการ
    const targetStep = document.querySelector(`.form-step[data-step="${stepNumber}"]`);
    if (targetStep) {
        targetStep.classList.add('active-step');
        targetStep.classList.remove('hidden'); // สำคัญ: ต้องลบ class hidden ออก
    }

    // 3. อัปเดต Progress Bar ด้านบน
    document.querySelectorAll('.progress-step').forEach(step => step.classList.remove('active'));
    const targetProgress = document.querySelector(`.progress-step[data-step="${stepNumber}"]`);
    if (targetProgress) {
        targetProgress.classList.add('active');
        // เปลี่ยนสีตัวเลขและเส้น (Tailwind Logic)
        if (stepNumber === 1) {
            // Reset styles for step 1 active
        }
    }

    // 4. จัดการปุ่มกด (Back / Next)
    const backBtn = document.getElementById('register-back-btn');
    const nextBtn = document.getElementById('register-next-btn');

    if (stepNumber === 1) {
        backBtn.style.display = 'none';
        nextBtn.textContent = 'ถัดไป';
        // เปลี่ยนสี Progress Bar กลับ
        document.querySelector('.progress-step[data-step="2"] div').classList.replace('bg-gold-600', 'bg-gray-100');
        document.querySelector('.progress-step[data-step="2"] div').classList.replace('text-white', 'text-gray-400');
        document.querySelector('.progress-step[data-step="2"] div').classList.remove('shadow-lg');
    } else {
        backBtn.style.display = 'inline-block';
        nextBtn.textContent = 'สมัครสมาชิก';
        // เปลี่ยนสี Progress Bar ให้ Step 2 ดู Active
        document.querySelector('.progress-step[data-step="2"] div').classList.replace('bg-gray-100', 'bg-gold-600');
        document.querySelector('.progress-step[data-step="2"] div').classList.replace('text-gray-400', 'text-white');
        document.querySelector('.progress-step[data-step="2"] div').classList.add('shadow-lg', 'shadow-gold-400/30');
    }
}

function resetRegistrationForm() {
    document.getElementById('register-form').reset();
    navigateToStep(1);
    state.registrationData = {};
}

export function setupAuthEventListeners() {
    const userBtn = document.getElementById('user-btn');
    const userMenu = document.getElementById('user-menu');

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        const sendBtn = document.getElementById('send-reset-link-btn');
        const originalText = sendBtn.textContent;

        sendBtn.disabled = true;
        sendBtn.textContent = 'กำลังส่ง...';

        try {
            const response = await api.requestPasswordReset(email);
            ui.showSuccessAlert('ส่งลิงก์แล้ว', response.message);
            ui.hideModal('forgot-password-modal');
            document.getElementById('forgot-email').value = '';
        } catch (error) {
            ui.showErrorAlert(error.message);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = originalText;
        }
    });

    document.getElementById('register-next-btn').addEventListener('click', handleRegistrationStep);
    document.getElementById('register-back-btn').addEventListener('click', () => navigateToStep(1));

    document.getElementById('open-policy-link').addEventListener('click', (e) => {
        e.preventDefault();
        if (POLICY_LINK_URL === "#") {
            ui.showModal('policy-modal');
        } else {
            window.open(POLICY_LINK_URL, '_blank');
        }
    });

    userBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent immediate close
        if (isLoggedIn()) {
            // Toggle Logic for Tailwind Classes
            if (userMenu.classList.contains('opacity-0')) {
                userMenu.classList.remove('opacity-0', 'invisible', 'translate-y-4');
                userMenu.classList.add('opacity-100', 'visible', 'translate-y-0');
            } else {
                userMenu.classList.add('opacity-0', 'invisible', 'translate-y-4');
                userMenu.classList.remove('opacity-100', 'visible', 'translate-y-0');
            }
        } else {
            ui.showModal('login-modal');
        }
    });

    document.addEventListener('click', (e) => {
        if (!userBtn.contains(e.target) && !userMenu.contains(e.target)) {
            userMenu.classList.add('opacity-0', 'invisible', 'translate-y-4');
            userMenu.classList.remove('opacity-100', 'visible', 'translate-y-0');
        }
    });

    // ... Modal switching logic remains the same ...
    document.getElementById('go-to-register').addEventListener('click', (e) => { e.preventDefault(); ui.hideModal('login-modal'); ui.showModal('register-modal'); });
    document.getElementById('go-to-forgot').addEventListener('click', (e) => { e.preventDefault(); ui.hideModal('login-modal'); ui.showModal('forgot-password-modal'); });
    document.getElementById('back-to-login').addEventListener('click', (e) => { e.preventDefault(); ui.hideModal('forgot-password-modal'); ui.showModal('login-modal'); });
    document.getElementById('go-to-login').addEventListener('click', (e) => { e.preventDefault(); resetRegistrationForm(); ui.hideModal('register-modal'); ui.showModal('login-modal'); });
}