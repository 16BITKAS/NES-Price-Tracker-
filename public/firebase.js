// ─── RetroQuest Firebase Integration ─────────────────────────────────────────
// Handles auth (email/password) and Firestore collection sync.
// Gracefully falls back to localStorage when user is not signed in.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, deleteDoc, serverTimestamp, query, orderBy }
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



// ─── Marketplace helpers ─────────────────────────────────────────────────────
function requireSignedIn() {
  if (!currentUser) throw new Error('Please sign in first.');
  return currentUser;
}

function marketGameKey(consoleKey, gameId) {
  return `${String(consoleKey || '').toLowerCase()}_${String(gameId).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function marketDocRef(consoleKey, gameId) {
  return doc(db, 'marketplace', marketGameKey(consoleKey, gameId));
}

function marketSubCollection(consoleKey, gameId, subName) {
  return collection(db, 'marketplace', marketGameKey(consoleKey, gameId), subName);
}

export async function addWant(consoleKey, gameId, gameTitle) {
  const user = requireSignedIn();
  await setDoc(doc(marketSubCollection(consoleKey, gameId, 'wants'), user.uid), {
    console: consoleKey,
    gameId: String(gameId),
    gameTitle: gameTitle || '',
    userId: user.uid,
    userEmail: user.email || '',
    createdAt: serverTimestamp()
  });
}

export async function removeWant(consoleKey, gameId) {
  const user = requireSignedIn();
  await deleteDoc(doc(marketSubCollection(consoleKey, gameId, 'wants'), user.uid));
}

export async function addHave(consoleKey, gameId, gameTitle) {
  const user = requireSignedIn();
  await setDoc(doc(marketSubCollection(consoleKey, gameId, 'haves'), user.uid), {
    console: consoleKey,
    gameId: String(gameId),
    gameTitle: gameTitle || '',
    userId: user.uid,
    userEmail: user.email || '',
    createdAt: serverTimestamp()
  });
}

export async function removeHave(consoleKey, gameId) {
  const user = requireSignedIn();
  await deleteDoc(doc(marketSubCollection(consoleKey, gameId, 'haves'), user.uid));
}

export async function createListing(consoleKey, gameId, gameTitle, listing) {
  const user = requireSignedIn();
  const price = Number(listing.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error('Enter a valid price.');

  const clean = {
    console: consoleKey,
    gameId: String(gameId),
    gameTitle: gameTitle || '',
    sellerUid: user.uid,
    sellerEmail: user.email || '',
    condition: String(listing.condition || 'Loose'),
    price,
    shipping: Number(listing.shipping) || 0,
    notes: String(listing.notes || '').slice(0, 500),
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = await addDoc(marketSubCollection(consoleKey, gameId, 'listings'), clean);
  return { id: ref.id, ...clean };
}

export async function deleteListing(consoleKey, gameId, listingId) {
  const user = requireSignedIn();
  const ref = doc(marketSubCollection(consoleKey, gameId, 'listings'), listingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  if (data.sellerUid !== user.uid) throw new Error('You can only delete your own listings.');
  await deleteDoc(ref);
}

export async function getMarketplaceData(consoleKey, gameId) {
  const [listingSnap, wantSnap, haveSnap] = await Promise.all([
    getDocs(query(marketSubCollection(consoleKey, gameId, 'listings'), orderBy('createdAt', 'desc'))),
    getDocs(marketSubCollection(consoleKey, gameId, 'wants')),
    getDocs(marketSubCollection(consoleKey, gameId, 'haves'))
  ]);

  const listings = [];
  listingSnap.forEach(s => {
    const d = s.data();
    if ((d.status || 'active') === 'active') listings.push({ id: s.id, ...d });
  });

  const wants = [];
  wantSnap.forEach(s => wants.push({ id: s.id, ...s.data() }));

  const haves = [];
  haveSnap.forEach(s => haves.push({ id: s.id, ...s.data() }));

  return {
    listings,
    wants,
    haves,
    currentUserId: currentUser ? currentUser.uid : null,
    currentUserEmail: currentUser ? currentUser.email : null,
    userWants: currentUser ? wants.some(w => w.id === currentUser.uid || w.userId === currentUser.uid) : false,
    userHas: currentUser ? haves.some(h => h.id === currentUser.uid || h.userId === currentUser.uid) : false
  };
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
window.RQ = { signUp, signIn, logOut, saveToCloud, loadFromCloud, addWant, removeWant, addHave, removeHave, createListing, deleteListing, getMarketplaceData };
