import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    signIn, signOut, getSession, getUserProfile, onAuthStateChange,
    UserProfile
} from '../services/supabase';

interface AuthSession {
    access_token: string;
    user: { id: string; email: string; };
}

interface AuthContextType {
    session: AuthSession | null;
    profile: UserProfile | null;
    isAdmin: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    profile: null,
    isAdmin: false,
    isLoading: true,
    login: async () => { },
    logout: async () => { }
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<AuthSession | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        console.log('🔐 AuthProvider: Initializing...');

        // Check for existing session
        getSession().then(async (sess) => {
            console.log('🔐 AuthProvider: Initial session:', sess ? 'Active' : 'None');
            setSession(sess as AuthSession | null);

            if (sess) {
                try {
                    const p = await getUserProfile();
                    console.log('🔐 AuthProvider: Profile loaded:', p?.role);
                    setProfile(p);
                } catch (err) {
                    console.error('🔐 AuthProvider: Error loading profile:', err);
                }
            }
            setIsLoading(false);
        }).catch(err => {
            console.error('🔐 AuthProvider: Fatal error:', err);
            setIsLoading(false);
        });

        // Listen for auth changes
        const unsubscribe = onAuthStateChange(async (event, sess) => {
            console.log('🔐 AuthProvider: Auth event:', event);
            setSession(sess as AuthSession | null);

            if (sess) {
                try {
                    const p = await getUserProfile();
                    console.log('🔐 AuthProvider: Profile after', event, ':', p?.role);
                    setProfile(p);
                } catch (err) {
                    console.error('🔐 AuthProvider: Error fetching profile:', err);
                }
            } else {
                setProfile(null);
            }
        });

        return () => unsubscribe();
    }, []);

    const login = async (email: string, password: string) => {
        console.log('🔐 Login: Attempting for:', email);
        try {
            const data = await signIn(email, password);
            console.log('🔐 Login: Success!', data.user?.email);
            // Session will be updated by the event listener
        } catch (err: any) {
            console.error('🔐 Login: Failed:', err.message);
            throw err;
        }
    };

    const logout = async () => {
        console.log('🔐 Logout: Signing out...');
        await signOut();
        setProfile(null);
        setSession(null);
    };

    return (
        <AuthContext.Provider value={{
            session,
            profile,
            isAdmin: profile?.role === 'admin',
            isLoading,
            login,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
};
