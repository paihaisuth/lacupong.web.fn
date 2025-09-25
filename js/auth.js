import * as api from './api.js';
import * as ui from './uiManager.js';

const POLICY_LINK_URL = "#";

let state = {
    authToken: null,
    currentUser: null,
    registrationData: {} // To store data between registration steps
};

export const isLoggedIn = () => !!state.authToken;

function updateUIforAuthState() {
    const userBtn = document.getElementById('user-btn');
    const userInfoDisplay = document.getElementById('user-info-display');

    if (state.authToken && state.currentUser) {
        // Logged In State
        userBtn.classList.add('logged-in');
        userBtn.innerHTML = '<i data-lucide="user-check-2"></i>';
        userInfoDisplay.textContent = `สวัสดี, ${state.currentUser.username}`;
    } else {
        // Logged Out State
        userBtn.classList.remove('logged-in');
        userBtn.innerHTML = '<i data-lucide="user-circle-2"></i>';
        userInfoDisplay.textContent = '';
    }
    // This is crucial: tell Lucide to find and replace the new <i> tags
    lucide.createIcons();
}

async function handleLogin(e, credentials = null) {
    if (e) e.preventDefault(); // Prevent form submission if called by event
    
    const loginBtn = document.getElementById('login-submit-btn');
    const originalBtnContent = loginBtn.innerHTML;
    let username, password;

    if (credentials) {
        username = credentials.username;
        password = credentials.password;
    } else {
        username = document.getElementById('login-username').value;
        password = document.getElementById('login-password').value;
    }

    // --- Start Loading State ---
    if (!credentials) { // Only show loading on manual login
        loginBtn.disabled = true;
        loginBtn.classList.add('loading');
        loginBtn.innerHTML = '<span class="icon-spin"><i data-lucide="loader"></i></span>';
        lucide.createIcons();
    }

    try {
        const response = await api.loginUser(username, password);
        if (response.success) {
            state.authToken = response.token;
            state.currentUser = response.user;
            localStorage.setItem('authToken', state.authToken);
            localStorage.setItem('currentUser', JSON.stringify(state.currentUser));
            updateUIforAuthState();
            ui.hideAllModals(); // Close all modals (login or register)
            ui.showModal('policy-modal'); // Show welcome/policy modal
        }
    } catch (error) {
        console.error("Login failed:", error.message);
        if (!credentials) alert(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
        // If auto-login fails, the user can try manually.
    } finally {
        if (!credentials) {
            loginBtn.disabled = false;
            loginBtn.classList.remove('loading');
            loginBtn.innerHTML = originalBtnContent;
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    // This is the final step, collect data from Step 2
    const gender = document.querySelector('input[name="gender"]:checked')?.value;
    const ageRange = document.querySelector('input[name="age-range"]:checked')?.value;
    const referral = document.querySelector('input[name="referral"]:checked')?.value;

    state.registrationData = { ...state.registrationData, gender, ageRange, referral };
    
    try {
        const response = await api.registerUser(state.registrationData);

        if(response.success) {
            alert('สมัครสมาชิกสำเร็จ! กำลังเข้าสู่ระบบอัตโนมัติ...');
            // --- AUTO LOGIN ---
            await handleLogin(null, { 
                username: state.registrationData.username, 
                password: state.registrationData.password // We stored this in state from step 1
            });
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาดในการสมัครสมาชิก: ' + error.message);
    } finally {
        resetRegistrationForm();
    }
}

function handleLogout() {
    state.authToken = null;
    state.currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    
    updateUIforAuthState();
    document.getElementById('user-menu').classList.remove('show');
    alert('ออกจากระบบสำเร็จ');
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

// Multi-step Registration Logic
function handleRegistrationStep() {
    const currentStep = parseInt(document.querySelector('.form-step.active-step').dataset.step);

    if (currentStep === 1) {
        // --- CHECK POLICY ---
        const policyCheckbox = document.getElementById('policy-checkbox');
        if (!policyCheckbox.checked) {
            alert('กรุณายอมรับนโยบายความเป็นส่วนตัวก่อนดำเนินการต่อ');
            return;
        }

        const username = document.getElementById('register-username').value;
        const emailInput = document.getElementById('register-email'); // Get the element
        const email = emailInput.value;
        const password = document.getElementById('register-password').value;

        // --- [FRONTEND UPDATE] EMAIL VALIDATION ---
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // A simple email regex
        if (!emailRegex.test(email)) {
            alert('กรุณากรอกรูปแบบอีเมลให้ถูกต้อง (เช่น example@mail.com)');
            emailInput.focus(); // Focus on the email field
            return; // Stop execution
        }

        if(!username || !password) {
            alert('กรุณากรอกข้อมูลบัญชีให้ครบถ้วน');
            return;
        }
        
        state.registrationData = { username, email, password };
        navigateToStep(2);
    } else if (currentStep === 2) {
        handleRegister(new Event('submit'));
    }
}

function navigateToStep(stepNumber) {
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active-step'));
    document.querySelector(`.form-step[data-step="${stepNumber}"]`).classList.add('active-step');

    document.querySelectorAll('.progress-step').forEach(step => step.classList.remove('active'));
    document.querySelector(`.progress-step[data-step="${stepNumber}"]`).classList.add('active');

    const backBtn = document.getElementById('register-back-btn');
    const nextBtn = document.getElementById('register-next-btn');

    backBtn.style.display = (stepNumber === 1) ? 'none' : 'inline-block';
    nextBtn.textContent = (stepNumber === 2) ? 'สมัครสมาชิก' : 'ถัดไป';
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
        sendBtn.disabled = true;
        sendBtn.textContent = 'กำลังส่ง...';
        
        try {
            const response = await api.requestPasswordReset(email);
            alert(response.message); // Show success message from server
            ui.hideModal('forgot-password-modal');
            document.getElementById('forgot-email').value = ''; // Clear input
        } catch (error) {
            alert('เกิดข้อผิดพลาด: ' + error.message);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'ส่งลิงก์รีเซ็ต';
        }
    });

    // Multi-step form navigation
    document.getElementById('register-next-btn').addEventListener('click', handleRegistrationStep);
    document.getElementById('register-back-btn').addEventListener('click', () => navigateToStep(1));

    // --- ADD: Policy Link Listener ---
    document.getElementById('open-policy-link').addEventListener('click', (e) => {
        e.preventDefault();
        if (POLICY_LINK_URL === "#") {
            // If no real link yet, show the "coming soon" modal
            ui.showModal('policy-modal');
        } else {
            window.open(POLICY_LINK_URL, '_blank');
        }
    });

    userBtn.addEventListener('click', () => {
        if (isLoggedIn()) {
            userMenu.classList.toggle('show');
        } else {
            ui.showModal('login-modal');
        }
    });

    document.addEventListener('click', (e) => {
        if (!userBtn.contains(e.target) && !userMenu.contains(e.target)) {
            userMenu.classList.remove('show');
        }
    });
    
    document.getElementById('go-to-register').addEventListener('click', (e) => {
        e.preventDefault();
        ui.hideModal('login-modal');
        ui.showModal('register-modal');
    });

    document.getElementById('go-to-forgot').addEventListener('click', (e) => {
        e.preventDefault();
        ui.hideModal('login-modal');
        ui.showModal('forgot-password-modal');
    });

    document.getElementById('back-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        ui.hideModal('forgot-password-modal');
        ui.showModal('login-modal');
    });

    document.getElementById('go-to-login').addEventListener('click', (e) => {
        e.preventDefault();
        resetRegistrationForm();
        ui.hideModal('register-modal');
        ui.showModal('login-modal');
    });

    
}