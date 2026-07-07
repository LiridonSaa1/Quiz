import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

const isNetworkError = (error: any) =>
  error?.message === 'Failed to fetch' || error?.message?.includes('NetworkError');

const normalizeNetworkError = (error: any) => {
  if (isNetworkError(error)) {
    throw new Error('Network error: Failed to fetch from Supabase. Please check if your VITE_SUPABASE_URL is correct and reachable.');
  }
  throw error;
};

const isRealtimeChannelLike = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { on?: unknown; subscribe?: unknown };
  return typeof candidate.on === 'function' && typeof candidate.subscribe === 'function';
};

const shouldWrapObject = (value: unknown, prop?: string | symbol) =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      prop !== 'supabaseUrl' &&
      prop !== 'supabaseKey' &&
      !isRealtimeChannelLike(value),
  );

const wrapWithNetworkErrorHandler = (obj: any): any => {
  return new Proxy(obj, {
    get: (target, prop, receiver) => {
      const value = Reflect.get(target, prop, receiver);
      
      if (typeof value === 'function') {
        return (...args: any[]) => {
          try {
            const result = value.apply(target, args);
            
            if (result instanceof Promise) {
              return result.catch((error: any) => {
                return normalizeNetworkError(error);
              });
            }
            
            if (shouldWrapObject(result)) {
              return wrapWithNetworkErrorHandler(result);
            }
            
            return result;
          } catch (error: any) {
            return normalizeNetworkError(error);
          }
        };
      }
      
      if (shouldWrapObject(value, prop)) {
        return wrapWithNetworkErrorHandler(value);
      }
      
      return value;
    }
  });
};

function validateSupabaseUrl(raw: string | undefined): string {
  const url = (raw ?? '').trim();
  if (!url) {
    throw new Error(
      'VITE_SUPABASE_URL is not set. Add it to your environment variables (must be a valid https:// URL).'
    );
  }
  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new Error(
      `VITE_SUPABASE_URL is invalid: "${url}". It must start with https:// (e.g. https://your-project.supabase.co).`
    );
  }
  return url;
}

function validateSupabaseKey(raw: string | undefined): string {
  const key = (raw ?? '').trim();
  if (!key) {
    throw new Error(
      'VITE_SUPABASE_ANON_KEY is not set. Add it to your environment variables.'
    );
  }
  return key;
}

const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = validateSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
    const supabaseAnonKey = validateSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY);
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
};

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
              return normalizeNetworkError(error);
            });
          }
          if (shouldWrapObject(result)) {
            return wrapWithNetworkErrorHandler(result);
          }
          return result;
        } catch (error: any) {
          return normalizeNetworkError(error);
        }
      };
    }
    
    if (shouldWrapObject(value, prop)) {
      return wrapWithNetworkErrorHandler(value);
    }
    
    return value;
  },
});
