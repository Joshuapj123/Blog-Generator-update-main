'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';

// ─── Cookie helpers ────────────────────────────────────────────────────────────
// We set a plain session cookie so the Edge middleware can read it without
// needing the Firebase Admin SDK. The cookie contains just the UID and is
// considered a "presence" signal — real auth state is always verified on the
// client via onAuthStateChanged.

function setSessionCookie(uid: string) {
  document.cookie = `__session=${uid}; path=/; SameSite=Lax`;
}

function clearSessionCookie() {
  document.cookie = `__session=; path=/; max-age=0`;
}

// ─── Context ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        setSessionCookie(firebaseUser.uid);
      } else {
        clearSessionCookie();
      }
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      setSessionCookie(result.user.uid);
      router.push('/engine');
    } catch (err) {
      console.error('Google sign-in failed', err);
      throw err;
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    clearSessionCookie();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
