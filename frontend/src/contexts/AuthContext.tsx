import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  authError: string | null;
  retryAuth: () => void;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Auth configuration
const AUTH_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 2000,
  sessionCheckTimeoutMs: 5000,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Retry auth function exposed to consumers
  const retryAuth = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setAuthError(null);
    setLoading(true);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let sessionCheckTimeout: ReturnType<typeof setTimeout> | null = null;
    
    /**
     * Get session with timeout and retry logic
     * Handles mobile network issues where session fetch may hang
     * Uses Promise.race pattern to avoid async callback anti-pattern
     */
    const getSessionWithRetry = async (attempt: number = 1): Promise<Session | null> => {
      // Set up timeout promise
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn(`[AuthContext] Session check timeout (attempt ${attempt}/${AUTH_CONFIG.maxRetries})`);
          resolve(null);
        }, AUTH_CONFIG.sessionCheckTimeoutMs);
      });

      // Session fetch promise with retry logic
      const sessionPromise = (async (): Promise<Session | null> => {
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error(`[AuthContext] Error getting session (attempt ${attempt}):`, error);
            
            // Retry if we haven't exceeded max retries
            if (attempt < AUTH_CONFIG.maxRetries) {
              console.log(`[AuthContext] Retrying in ${AUTH_CONFIG.retryDelayMs}ms...`);
              await new Promise(r => setTimeout(r, AUTH_CONFIG.retryDelayMs));
              return await getSessionWithRetry(attempt + 1);
            } else {
              return null;
            }
          } else {
            return session;
          }
        } catch (err) {
          console.error(`[AuthContext] Exception getting session (attempt ${attempt}):`, err);
          
          if (attempt < AUTH_CONFIG.maxRetries) {
            await new Promise(r => setTimeout(r, AUTH_CONFIG.retryDelayMs));
            return await getSessionWithRetry(attempt + 1);
          } else {
            return null;
          }
        }
      })();

      // Race between timeout and session fetch
      return Promise.race([timeoutPromise, sessionPromise]);
    };

    const initializeAuth = async () => {
      try {
        setAuthError(null);
        
        // Check if we have OAuth callback parameters in the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const accessToken = hashParams.get('access_token');
        
        console.log('[AuthContext] Initializing auth...', {
          hasCode: !!code,
          hasAccessToken: !!accessToken,
          url: window.location.href,
          retryCount
        });
        
        // If we have a code parameter, explicitly exchange it for a session
        // This is more reliable than relying on Supabase's auto-detection on mobile
        if (code) {
          console.log('[AuthContext] OAuth code detected, exchanging for session...');
          
          // Exchange code with retry logic
          let exchangeAttempt = 1;
          let exchangeSuccess = false;
          
          while (exchangeAttempt <= AUTH_CONFIG.maxRetries && !exchangeSuccess) {
            try {
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              
              if (error) {
                console.error(`[AuthContext] Error exchanging code (attempt ${exchangeAttempt}):`, error);
                if (exchangeAttempt < AUTH_CONFIG.maxRetries) {
                  await new Promise(r => setTimeout(r, AUTH_CONFIG.retryDelayMs));
                  exchangeAttempt++;
                } else {
                  // Clear the URL params to prevent re-processing
                  window.history.replaceState({}, '', window.location.pathname);
                  if (isMounted) {
                    setAuthError('Failed to complete sign-in. Please try again.');
                  }
                  break;
                }
              } else if (data.session) {
                console.log('[AuthContext] Successfully exchanged code for session');
                exchangeSuccess = true;
                if (isMounted) {
                  setSession(data.session);
                  setUser(data.session.user);
                  setLoading(false);
                  // Clear the URL params
                  window.history.replaceState({}, '', window.location.pathname);
                }
                return; // Exit early, we have a session
              }
            } catch (err) {
              console.error(`[AuthContext] Exception exchanging code (attempt ${exchangeAttempt}):`, err);
              if (exchangeAttempt < AUTH_CONFIG.maxRetries) {
                await new Promise(r => setTimeout(r, AUTH_CONFIG.retryDelayMs));
                exchangeAttempt++;
              } else {
                window.history.replaceState({}, '', window.location.pathname);
                if (isMounted) {
                  setAuthError('Network error during sign-in. Please try again.');
                }
                break;
              }
            }
          }
        }
        
        // If we have an access_token in hash (implicit flow), let Supabase handle it
        if (accessToken) {
          console.log('[AuthContext] Access token detected in hash, letting Supabase handle it...');
          // Supabase should automatically detect and process this
          // Give it a moment to process
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Get the current session with retry logic
        const session = await getSessionWithRetry();
        
        console.log('[AuthContext] Got session:', !!session);
        
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
          
          // Only set error if we expected a session (had OAuth params) but didn't get one
          if (!session && (code || accessToken)) {
            setAuthError('Authentication failed. Please try signing in again.');
          }
        }
      } catch (error) {
        console.error('[AuthContext] Error initializing auth:', error);
        if (isMounted) {
          setLoading(false);
          setAuthError('An unexpected error occurred. Please refresh the page.');
        }
      }
    };
    
    // Initialize auth
    initializeAuth();
    
    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('[AuthContext] Auth state changed:', _event);
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        setAuthError(null); // Clear any errors on successful auth
        // Clear timeout if auth succeeds
        if (sessionCheckTimeout) {
          clearTimeout(sessionCheckTimeout);
          sessionCheckTimeout = null;
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (sessionCheckTimeout) {
        clearTimeout(sessionCheckTimeout);
      }
    };
  }, [retryCount]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error: error as Error | null };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error: error as Error | null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error as Error | null };
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      authError,
      retryAuth,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
