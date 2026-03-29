import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

async function initFirebase() {
    try {
        const res = await fetch('/auth/firebase-config');
        if (res.ok) {
            const firebaseConfig = await res.json();
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const googleProvider = new GoogleAuthProvider();
            
            // Add required OAuth scopes for sign-in and account linking
            googleProvider.addScope('profile');
            googleProvider.addScope('email');
            
            googleProvider.setCustomParameters({
                prompt: 'select_account'
            });

            window.firebaseAuth = auth;
            window.googleProvider = googleProvider;
            window.signInWithPopup = signInWithPopup;
            window.GoogleAuthProvider = GoogleAuthProvider;  // Export for creating fresh instances
            
            // Restore auth state when page loads
            // This is critical for pages like settings.html where user is already logged in
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    console.log('✓ Firebase auth state restored for user:', user.uid);
                    window.firebaseUser = user;
                } else {
                    console.log('⚠ No Firebase user authenticated');
                    window.firebaseUser = null;
                }
            });
        } else {
            console.error("Failed to load Firebase config from backend.");
        }
    } catch (error) {
        console.error("Error fetching Firebase config:", error);
    }
}

initFirebase();
