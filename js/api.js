// js/api.js
import { BASE_URL } from './config.js';

// --- Treasure APIs ---
export async function getTreasures() {
    //console.log(`(API - jQuery) Fetching treasures...`);
    try {
        const data = await $.ajax({
            url: `${BASE_URL}/api/treasures`,
            method: 'GET',
            dataType: 'json'
        });
        return data;
    } catch (error) {
        console.error("API Error [getTreasures]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to load treasures');
    }
}

export async function createTreasure(treasureData) {
    //console.log(`(API - jQuery) Creating new treasure...`);
    try {
        const token = localStorage.getItem('authToken');
        const ajaxOptions = {
            url: `${BASE_URL}/api/treasures`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(treasureData)
        };

        if (token) {
            ajaxOptions.headers = {
                'Authorization': `Bearer ${token}`
            };
        }

        const data = await $.ajax(ajaxOptions);
        return data;
    } catch (error) {
        console.error("API Error [createTreasure]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to create treasure');
    }
}

export async function claimTreasure(treasureId) {
    //console.log(`(API - jQuery) Claiming treasure ID: ${treasureId}`);
    try {
        const token = localStorage.getItem('authToken');
        const ajaxOptions = {
            url: `${BASE_URL}/api/treasures/${treasureId}`,
            method: 'PATCH',
            contentType: 'application/json',
            // Backend doesn't need a body for claim, but we keep it empty for consistency
            data: JSON.stringify({}) 
        };

        if (token) {
            ajaxOptions.headers = {
                'Authorization': `Bearer ${token}`
            };
        }
        
        const data = await $.ajax(ajaxOptions);
        return data;
    } catch (error) {
        console.error("API Error [claimTreasure]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to claim treasure');
    }
}

// --- Visitor/Stats APIs ---
export function logAppOpen() {
    //console.log(`(API - jQuery) Logging app open event...`);
    
    const token = localStorage.getItem('authToken');
    const ajaxOptions = {
        url: `${BASE_URL}/api/visitors/opened-app`,
        method: 'POST'
    };

    if (token) {
        ajaxOptions.headers = {
            'Authorization': `Bearer ${token}`
        };
    }

    $.ajax(ajaxOptions).fail(err => console.warn('Could not log app open:', err));
}
export function trackReferrer() {
    //console.log(`(API - jQuery) Tracking referrer: ${document.referrer}`);
    $.ajax({
        url: `${BASE_URL}/api/stats/track-referrer`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ referrer: document.referrer || 'direct' })
    }).fail(err => console.warn('Could not track referrer:', err));
}

export async function logVisitorTimeSpent(durationSeconds) {
    //console.log(`(API - jQuery) Logging ${durationSeconds}s for visitor...`);
    try {
        await $.ajax({
            url: `${BASE_URL}/api/visitors/log-time`,
            method: 'PATCH', // หรือ PATCH ตามที่ backend กำหนด
            contentType: 'application/json',
            data: JSON.stringify({ durationSeconds })
        });
    } catch (error) {
        console.error("API Error [logVisitorTimeSpent]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to log visitor time');
    }
}

// --- for logged-in users ---
export async function logUserTimeSpent(durationSeconds) {
    //console.log(`(API - jQuery) Logging ${durationSeconds}s for user...`);
    const token = localStorage.getItem('authToken');
    if (!token) {
        // ไม่ควรเกิดขึ้นถ้า isLoggedIn() ทำงานถูกต้อง แต่ป้องกันไว้
        console.warn("No auth token found for logUserTimeSpent.");
        return; 
    }

    try {
        await $.ajax({
            url: `${BASE_URL}/api/users/log-time`,
            method: 'PATCH',
            contentType: 'application/json',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            data: JSON.stringify({ durationSeconds })
            // ลบ async: false ออกไปได้เลย ไม่จำเป็นอีกต่อไป
        });
    } catch (error) {
        console.error("API Error [logUserTimeSpent]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to log user time');
    }
}

export async function loginUser(username, password) {
    ////console.log(`(API - jQuery) Attempting to log in user: ${username}`);
    try {
        // This now makes a real API call to your server
        const response = await $.ajax({
            url: `${BASE_URL}/api/auth/login`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ username, password })
        });
        return response; // Returns { success: true, token, user }
    } catch (error) {
        console.error("API Error [loginUser]:", error.statusText, error.responseText);
        // Throw the error so the calling function can catch it
        throw new Error(error.responseJSON?.message || 'Failed to login');
    }
}

export async function registerUser(userData) {
    //console.log(`(API - jQuery) Attempting to register user...`);
    try {
        const response = await $.ajax({
            url: `${BASE_URL}/api/auth/register`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(userData)
        });

        return { success: true, message: response.message };
    } catch (error) {
        console.error("API Error [registerUser]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to register');
    }
}

export async function requestPasswordReset(email) {
    try {
        const response = await $.ajax({
            url: `${BASE_URL}/api/auth/forgot-password`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ email })
        });
        return response;
    } catch (error) {
        console.error("API Error [requestPasswordReset]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to request password reset');
    }
}

// This function isn't strictly needed by main app JS, but good to have for completeness.
// The reset-password.html page uses direct fetch for simplicity.
export async function resetPassword(token, password) {
    try {
        const response = await $.ajax({
            url: `${BASE_URL}/api/auth/reset-password/${token}`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ password })
        });
        return response;
    } catch (error) {
        console.error("API Error [resetPassword]:", error.statusText, error.responseText);
        throw new Error(error.responseJSON?.message || 'Failed to reset password');
    }
}