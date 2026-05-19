// ─── RetroQuest Firebase Integration ─────────────────────────────────────────
// Handles auth (email/password) and Firestore collection sync.
// Gracefully falls back to localStorage when user is not signed in.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCKfQhHSYDGfUoUJuZsSKja1BKveT7GXFU",
  authDomain:        "retroquest-64.firebaseapp.com",
  projectId:         "retroquest-64",
  storageBucket:     "retroquest-64.firebasestorage.app",
  messagingSenderId: "1037779833079",
  appId:             "1:1037779833079:web:1b0b6018db0881ee6cc3f2",
  measurementId:     "G-LK78RZ0CXQ"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ─── Current user ─────────────────────────────────────────────────────────────
let currentUser = null;

// ─── Save collection to Firestore ─────────────────────────────────────────────
export async function saveToCloud(consoleKey, stateObj) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'collections', consoleKey), stateObj);
  } catch (e) {
    console.warn('[RetroQuest] Cloud save failed:', e);
  }
}

// ─── Load collection from Firestore ───────────────────────────────────────────
export async function loadFromCloud(consoleKey) {
  if (!currentUser) return null;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'collections', consoleKey));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[RetroQuest] Cloud load failed:', e);
    return null;
  }
}

// ─── Auth state observer ──────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  currentUser = user;
  updateAuthUI(user);
  if (user && typeof window.onUserSignedIn === 'function') {
    window.onUserSignedIn(user);
  }
});

// ─── Sign up ──────────────────────────────────────────────────────────────────
export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ─── Sign in ──────────────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// ─── Sign out ─────────────────────────────────────────────────────────────────
export async function logOut() {
  await signOut(auth);
}

// ─── Auth UI update ───────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const bar    = document.getElementById('authBar');
  const label  = document.getElementById('authUserLabel');
  const btnIn  = document.getElementById('authSignInBtn');
  const btnOut = document.getElementById('authSignOutBtn');
  if (!bar) return;

  if (user) {
    label.textContent = user.email;
    btnIn.style.display  = 'none';
    btnOut.style.display = 'inline-block';
  } else {
    label.textContent = 'Not signed in';
    btnIn.style.display  = 'inline-block';
    btnOut.style.display = 'none';
  }
}

// Expose to global scope for onclick handlers
window.RQ = { signUp, signIn, logOut, saveToCloud, loadFromCloud };
