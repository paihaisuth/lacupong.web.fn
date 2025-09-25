/**
 * Checks if a guest can perform an action ('place' or 'open').
 * @param {'place' | 'open'} actionType
 * @returns {boolean}
 */
export function canGuestPerformAction(actionType) {
    const key = `guestLast${actionType.charAt(0).toUpperCase() + actionType.slice(1)}Time`;
    const lastActionTime = localStorage.getItem(key);
    if (!lastActionTime) return true;

    const twentyFourHours = 24 * 60 * 60 * 1000;
    const timeDifference = new Date().getTime() - parseInt(lastActionTime, 10);
    return timeDifference > twentyFourHours;
}

/**
 * Records the timestamp for a guest's action.
 * @param {'place' | 'open'} actionType
 */
export function recordGuestAction(actionType) {
    const key = `guestLast${actionType.charAt(0).toUpperCase() + actionType.slice(1)}Time`;
    localStorage.setItem(key, new Date().getTime().toString());
    //console.log(`Recorded guest action '${actionType}' at ${new Date()}`);
}