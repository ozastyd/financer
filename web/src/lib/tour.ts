"use client";

// The quick app tour runs once on Beranda right after onboarding, and again
// whenever the user asks for it from Profil. A flag in this browser says
// "show it on the next visit to Beranda".
const KEY = "financer:tour";
export const TOUR_EVENT = "financer:tour";

export function queueTour() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* optional: no tour without storage */
  }
  window.dispatchEvent(new Event(TOUR_EVENT));
}

export function tourQueued(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function clearTour() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* optional */
  }
}
