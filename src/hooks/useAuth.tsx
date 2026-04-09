import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
    id: string;
    email: string;
    role: string;
    clubId?: string;
    club?: {
        id: string;
        name: string;
    };
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    impersonate: (newToken: string, newUser: User) => void;
    revertImpersonation: () => void;
    isImpersonating: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const savedUser = localStorage.getItem('rotary_user');
        return savedUser ? JSON.parse(savedUser) : null;
    });
    const [token, setToken] = useState<string | null>(() => {
        return localStorage.getItem('rotary_token');
    });

    useEffect(() => {
        // Validate token is still valid by hitting a lightweight endpoint
        if (token) {
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            fetch(`${apiUrl}/admin/stats`, {
                headers: { Authorization: `Bearer ${token}` },
            }).then(r => {
                if (r.status === 401) {
                    // Token expired — clear stale session
                    setToken(null);
                    setUser(null);
                    localStorage.removeItem('rotary_token');
                    localStorage.removeItem('rotary_user');
                }
            }).catch(() => { /* network error, retain session */ });
        }
    }, []);

    // Listen for 401 events from any API call to auto-logout
    useEffect(() => {
        const handle401 = () => {
            setToken(null);
            setUser(null);
            localStorage.removeItem('rotary_token');
            localStorage.removeItem('rotary_user');
        };
        window.addEventListener('auth:401', handle401);
        return () => window.removeEventListener('auth:401', handle401);
    }, []);

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('rotary_token', newToken);
        localStorage.setItem('rotary_user', JSON.stringify(newUser));
        // If an explicit login happens, clear any lingering impersonation state
        localStorage.removeItem('rotary_super_token');
        localStorage.removeItem('rotary_super_user');
    };

    const impersonate = (newToken: string, newUser: User) => {
        // Save current actual admin token and user
        if (!localStorage.getItem('rotary_super_token')) {
            localStorage.setItem('rotary_super_token', token || '');
            localStorage.setItem('rotary_super_user', JSON.stringify(user || {}));
        }

        // Apply new fake token
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('rotary_token', newToken);
        localStorage.setItem('rotary_user', JSON.stringify(newUser));
        window.location.href = '/admin/dashboard'; // Force full reload
    };

    const revertImpersonation = () => {
        const superToken = localStorage.getItem('rotary_super_token');
        const superUser = localStorage.getItem('rotary_super_user');

        if (superToken && superUser) {
            setToken(superToken);
            setUser(JSON.parse(superUser));
            localStorage.setItem('rotary_token', superToken);
            localStorage.setItem('rotary_user', superUser);
        }

        localStorage.removeItem('rotary_super_token');
        localStorage.removeItem('rotary_super_user');
        window.location.href = '/admin/clubs'; // Force full reload back to clubs
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('rotary_token');
        localStorage.removeItem('rotary_user');
        localStorage.removeItem('rotary_super_token');
        localStorage.removeItem('rotary_super_user');
    };

    return (
        <AuthContext.Provider value={{
            user, token, login, logout, impersonate, revertImpersonation,
            isAuthenticated: !!token,
            isImpersonating: !!localStorage.getItem('rotary_super_token')
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
