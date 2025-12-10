'use client';

import { useCallback, useState } from 'react';
import { apiClient } from '@/lib/api-client';

interface UseFetchOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  autoFetch?: boolean;
}

export function useFetch<T = any>(
  url: string,
  options: UseFetchOptions = {}
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.client.get(url);
      setData(response.data);
      options.onSuccess?.(response.data);
    } catch (err: any) {
      const message = err.response?.data?.error || err.message;
      setError(message);
      options.onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  return { data, loading, error, fetch };
}

interface UsePostOptions {
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
}

export function usePost<T = any, R = any>(
  url: string,
  options: UsePostOptions = {}
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = useCallback(
    async (payload: T) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.client.post(url, payload);
        options.onSuccess?.(response.data);
        return response.data as R;
      } catch (err: any) {
        const message = err.response?.data?.error || err.message;
        setError(message);
        options.onError?.(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [url, options]
  );

  return { loading, error, post };
}
