import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const wrapWithNetworkErrorHandler = (obj: any): any => {
  return new Proxy(obj, {
    get: (target, prop, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      
      if (typeof value === 'function') {
        return (...args: any[]) => {
          try {
            const result = value.apply(target, args);
            
            // If it's a promise, catch network errors
            if (result instanceof Promise) {
              return result.catch((error: any) => {
                if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
                  throw new Error('Network error: Failed to fetch from Supabase. Please check if your VITE_SUPABASE_URL is correct and reachable.');
                }
                throw error;
              });
            }
            
            // If it's an object (like .from().select()), wrap it too
            if (result && typeof result === 'object' && !Array.isArray(result)) {
              return wrapWithNetworkErrorHandler(result);
            }
            
            return result;
          } catch (error: any) {
            if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
              throw new Error('Network error: Failed to fetch from Supabase. Please check if your VITE_SUPABASE_URL is correct and reachable.');
            }
            throw error;
          }
        };
      }
      
      // Recursively wrap objects (like .auth)
      if (value && typeof value === 'object' && !Array.isArray(value) && prop !== 'supabaseUrl' && prop !== 'supabaseKey') {
        return wrapWithNetworkErrorHandler(value);
      }
      
      return value;
    }
  });
};

const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      const msg = 'Supabase URL and Anon Key are missing. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the Settings > Secrets menu in AI Studio.';
      console.error(msg);
      throw new Error(msg);
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
};

// Export a proxy that lazily initializes the Supabase client on first access
export const supabase = new Proxy({} as SupabaseClient, {
  get: (target, prop, receiver) => {
    const instance = getSupabase();
    const value = Reflect.get(instance, prop, receiver);
    
    if (typeof value === 'function') {
      const bound = value.bind(instance);
      return (...args: any[]) => {
        try {
          const result = bound(...args);
          if (result instanceof Promise) {
            return result.catch((error: any) => {
              if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
                throw new Error('Network error: Failed to fetch from Supabase. Please check if your VITE_SUPABASE_URL is correct and reachable.');
              }
              throw error;
            });
          }
          if (result && typeof result === 'object' && !Array.isArray(result)) {
            return wrapWithNetworkErrorHandler(result);
          }
          return result;
        } catch (error: any) {
          if (error.message === 'Failed to fetch' || error.message?.includes('NetworkError')) {
            throw new Error('Network error: Failed to fetch from Supabase. Please check if your VITE_SUPABASE_URL is correct and reachable.');
          }
          throw error;
        }
      };
    }
    
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return wrapWithNetworkErrorHandler(value);
    }
    
    return value;
  },
});
