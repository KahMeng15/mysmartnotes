import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

async function initFirebase() {
    try {
        const res = await fetch('/auth/firebase-config');
        if (res.ok) {
            const firebaseConfig = await res.json();
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const googleProvider = new GoogleAuthProvider();
            googleProvider.setCustomParameters({
                prompt: 'select_account'
            });

            window.firebaseAuth = auth;
            window.googleProvider = googleProvider;
            window.signInWithPopup = signInWithPopup;
        } else {
            console.error("Failed to load Firebase config from backend.");
        }
    } catch (error) {
        console.error("Error fetching Firebase config:", error);
    }
}

initFirebase();
