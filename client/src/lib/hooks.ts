import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import { useToast } from '../components/Toast';

export function useApi<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: !!path,
    refetchInterval: opts.refetchInterval,
  });
}

type Method = 'post' | 'patch' | 'put' | 'del';

/**
 * Mutation that invalidates every cached query whose path starts with one of
 * `invalidate` prefixes, and toasts on success / error.
 */
export function useAction<TBody = unknown, TRes = unknown>(
  method: Method,
  path: string | ((body: TBody) => string),
  opts: { invalidate?: string[]; success?: string | ((r: TRes) => string); onSuccess?: (r: TRes) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TRes, Error, TBody>({
    mutationFn: (body: TBody) => {
      const p = typeof path === 'function' ? path(body) : path;
      if (method === 'del') return api.del<TRes>(p);
      return api[method]<TRes>(p, body);
    },
    onSuccess: (r) => {
      const prefixes = opts.invalidate ?? [];
      qc.invalidateQueries({
        predicate: (q) => {
          const key = (q.queryKey as QueryKey)[0];
          return typeof key === 'string' && (prefixes.length === 0 || prefixes.some((p) => key.startsWith(p)));
        },
      });
      if (opts.success) toast(typeof opts.success === 'function' ? opts.success(r) : opts.success);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast(e.message, 'error'),
  });
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useForm<T extends Record<string, any>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(k: K, v: T[K]) => setValues((s) => ({ ...s, [k]: v }));
  const bind = (k: keyof T) => ({
    value: values[k] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(k, (e.target.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value) as T[typeof k]),
  });
  return { values, set, bind, setValues, reset: () => setValues(initial) };
}
