/**
 * Supabase Auth Service - Direct REST API implementation
 * 
 * In development, uses Vite proxy to bypass firewall/CORS issues:
 *   /sb-auth/* → supabase.co/auth/*
 *   /sb-rest/* → supabase.co/rest/*
 * 
 * In production, calls Supabase URLs directly.
 */

// @ts-ignore
const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
// @ts-ignore
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// @ts-ignore
const isDev: boolean = import.meta.env.DEV;

// In development, use the Vite proxy paths
// In production, use direct Supabase URLs
const AUTH_BASE = isDev ? '/sb-auth' : `${SUPABASE_URL}/auth`;
const REST_BASE = isDev ? '/sb-rest' : `${SUPABASE_URL}/rest`;

console.log('🔗 Supabase Auth:', isDev ? 'Proxy mode (/sb-auth, /sb-rest)' : 'Direct mode');

export type UserRole = 'admin' | 'viewer' | 'researcher';

export interface UserProfile {
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
    institution: string | null;
    created_at: string;
}

interface AuthSession {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    user: {
        id: string;
        email: string;
        user_metadata: Record<string, any>;
    };
}

// --- Session Storage ---

const SESSION_KEY = 'sb-auth-session';

const saveSession = (session: AuthSession | null) => {
    if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
};

const loadSession = (): AuthSession | null => {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) return null;
        const session = JSON.parse(stored) as AuthSession;
        if (session.expires_at && Date.now() / 1000 > session.expires_at) {
            console.log('🔐 Session expired, will try to refresh');
            return session;
        }
        return session;
    } catch {
        return null;
    }
};

// --- Event System ---

type AuthListener = (event: string, session: AuthSession | null) => void;
const listeners: Set<AuthListener> = new Set();

const notifyListeners = (event: string, session: AuthSession | null) => {
    listeners.forEach(fn => {
        try { fn(event, session); } catch (e) { console.error('Auth listener error:', e); }
    });
};

// --- Core Auth Functions ---

/**
 * Sign in with email and password
 */
export const signIn = async (email: string, password: string): Promise<AuthSession> => {
    console.log('🔐 signIn: Attempting login for', email);

    const res = await fetch(`${AUTH_BASE}/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        console.error('🔐 signIn: Failed:', err);
        throw new Error(err.error_description || err.msg || err.message || 'Error de autenticación');
    }

    const data = await res.json();
    const session: AuthSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at || (Date.now() / 1000 + (data.expires_in || 3600)),
        user: data.user
    };

    saveSession(session);
    console.log('🔐 signIn: Success!', session.user.email);
    notifyListeners('SIGNED_IN', session);

    return session;
};

/**
 * Sign out
 */
export const signOut = async (): Promise<void> => {
    const session = loadSession();
    if (session) {
        try {
            await fetch(`${AUTH_BASE}/v1/logout`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                }
            });
        } catch (e) {
            console.warn('🔐 signOut: Server logout failed (token may already be invalid)');
        }
    }
    saveSession(null);
    notifyListeners('SIGNED_OUT', null);
    console.log('🔐 signOut: Done');
};

/**
 * Refresh the access token
 */
export const refreshToken = async (): Promise<AuthSession | null> => {
    const session = loadSession();
    if (!session?.refresh_token) return null;

    try {
        const res = await fetch(`${AUTH_BASE}/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refresh_token: session.refresh_token })
        });

        if (!res.ok) {
            console.warn('🔐 refreshToken: Failed, clearing session');
            saveSession(null);
            notifyListeners('SIGNED_OUT', null);
            return null;
        }

        const data = await res.json();
        const newSession: AuthSession = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at || (Date.now() / 1000 + (data.expires_in || 3600)),
            user: data.user
        };

        saveSession(newSession);
        notifyListeners('TOKEN_REFRESHED', newSession);
        return newSession;
    } catch (e) {
        console.error('🔐 refreshToken: Error:', e);
        return null;
    }
};

/**
 * Get current session
 */
export const getSession = async (): Promise<AuthSession | null> => {
    const session = loadSession();
    if (!session) return null;

    if (session.expires_at && Date.now() / 1000 > session.expires_at) {
        return refreshToken();
    }

    return session;
};

/**
 * Get current user's profile with role
 */
export const getUserProfile = async (): Promise<UserProfile | null> => {
    const session = loadSession();
    if (!session) return null;

    try {
        const res = await fetch(`${REST_BASE}/v1/profiles?id=eq.${session.user.id}&select=*`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`,
            }
        });

        if (!res.ok) {
            console.error('🔐 getUserProfile: HTTP error', res.status);
            return null;
        }

        const profiles = await res.json();
        if (!profiles || profiles.length === 0) {
            console.warn('🔐 getUserProfile: No profile found');
            return null;
        }

        return profiles[0] as UserProfile;
    } catch (e) {
        console.error('🔐 getUserProfile: Error:', e);
        return null;
    }
};

/**
 * Subscribe to auth state changes
 */
export const onAuthStateChange = (callback: AuthListener): (() => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
};

/**
 * Check if user has admin role
 */
export const isAdmin = async (): Promise<boolean> => {
    const profile = await getUserProfile();
    return profile?.role === 'admin';
};
