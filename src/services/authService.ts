import { auth } from "../firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from "firebase/auth";

export async function signUp(email: string, password: string, displayName?: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  if (userCredential.user) {
    if (displayName?.trim()) {
      await updateProfile(userCredential.user, { displayName: displayName.trim() });
    }
    await sendEmailVerification(userCredential.user);
  }
  return userCredential;
}

export async function signIn(email: string, password: string) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function signOut() {
  return await firebaseSignOut(auth);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return await signInWithPopup(auth, provider);
}

export async function updateUserProfile(displayName: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  await updateProfile(user, { displayName: displayName.trim() });
}

export async function sendVerificationEmail(user: User) {
  return await sendEmailVerification(user);
}

export async function resetPassword(email: string) {
  return await sendPasswordResetEmail(auth, email);
}
