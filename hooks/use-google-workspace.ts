'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

const STORAGE_KEY = 'daybridge.google-session';

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            login_hint?: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          revoke: (token: string, callback?: () => void) => void;
        };
      };
    };
  }
}

export type GoogleAccount = {
  email: string;
  name: string;
  picture?: string;
};

export type GoogleWorkspaceTask = {
  id: string;
  listId: string;
  title: string;
  notes?: string;
  due?: string;
  completed: boolean;
};

export type GoogleWorkspaceEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
};

type GoogleStatus = 'unconfigured' | 'loading' | 'ready' | 'connecting' | 'connected' | 'error';

function dayBounds(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function useGoogleWorkspace() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const loginHint = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_HINT;
  const tokenClient = useRef<TokenClient | null>(null);
  const accessToken = useRef<string | null>(null);
  const [status, setStatus] = useState<GoogleStatus>(clientId ? 'loading' : 'unconfigured');
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [tasks, setTasks] = useState<GoogleWorkspaceTask[]>([]);
  const [events, setEvents] = useState<GoogleWorkspaceEvent[]>([]);
  const [taskListId, setTaskListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleFetch = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    if (!accessToken.current) throw new Error('Google session expired. Please reconnect.');
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken.current}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        accessToken.current = null;
        setStatus('ready');
      }
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || `Google API request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }, []);

  const fetchCalendarEvents = useCallback(async (date: Date) => {
    const { start, end } = dayBounds(date);
    const calendar = await googleFetch<{ items?: Array<{ id: string; summary?: string; location?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }> }>(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`,
    );
    return (calendar.items || []).map((event) => {
      const allDay = Boolean(event.start.date);
      const eventStart = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
      const eventEnd = new Date(event.end.dateTime || `${event.end.date}T00:00:00`);
      return { id: event.id, title: event.summary || 'Busy', start: eventStart, end: eventEnd, allDay, location: event.location };
    });
  }, [googleFetch]);

  const loadWorkspace = useCallback(async (token: string) => {
    accessToken.current = token;
    const [profile, taskLists, calendar] = await Promise.all([
      googleFetch<{ email: string; name: string; picture?: string }>('https://www.googleapis.com/oauth2/v3/userinfo'),
      googleFetch<{ items?: Array<{ id: string; title: string }> }>('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20'),
      fetchCalendarEvents(new Date()),
    ]);

    if (loginHint && profile.email.toLowerCase() !== loginHint.toLowerCase()) {
      localStorage.removeItem(STORAGE_KEY);
      accessToken.current = null;
      if (window.google) window.google.accounts.oauth2.revoke(token);
      throw new Error(`Please continue with ${loginHint}.`);
    }

    const firstList = taskLists.items?.[0];
    let liveTasks: GoogleWorkspaceTask[] = [];
    if (firstList) {
      setTaskListId(firstList.id);
      const result = await googleFetch<{ items?: Array<{ id: string; title?: string; notes?: string; due?: string; status?: string }> }>(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(firstList.id)}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
      );
      liveTasks = (result.items || []).filter((task) => task.title).map((task) => ({
        id: task.id,
        listId: firstList.id,
        title: task.title || 'Untitled task',
        notes: task.notes,
        due: task.due,
        completed: task.status === 'completed',
      }));
    }

    setAccount(profile);
    setTasks(liveTasks);
    setEvents(calendar);
    setStatus('connected');
    setError(null);
  }, [fetchCalendarEvents, googleFetch, loginHint]);

  useEffect(() => {
    if (!clientId) return;

    const initialize = () => {
      if (!window.google) return;
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        login_hint: loginHint,
        callback: async (response) => {
          if (response.error || !response.access_token) {
            setStatus('error');
            setError(response.error_description || response.error || 'Google sign-in was not completed.');
            return;
          }
          const expiresAt = Date.now() + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000;
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: response.access_token, expiresAt }));
          try {
            await loadWorkspace(response.access_token);
          } catch (reason) {
            setStatus('error');
            setError(reason instanceof Error ? reason.message : 'Could not load your Google data.');
          }
        },
        error_callback: (reason) => {
          setStatus('error');
          setError(reason.message || 'The Google sign-in window was closed.');
        },
      });
      setStatus('ready');

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { accessToken: string; expiresAt: number };
          if (parsed.expiresAt > Date.now()) void loadWorkspace(parsed.accessToken);
          else localStorage.removeItem(STORAGE_KEY);
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    };

    if (window.google?.accounts?.oauth2) initialize();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-daybridge-google]');
      if (existing) existing.addEventListener('load', initialize, { once: true });
      else {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.daybridgeGoogle = 'true';
        script.onload = initialize;
        script.onerror = () => { setStatus('error'); setError('Could not load Google sign-in. Check your connection.'); };
        document.head.appendChild(script);
      }
    }
  }, [clientId, loadWorkspace, loginHint]);

  const connect = useCallback(() => {
    if (!clientId) { setStatus('unconfigured'); setError('Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to Vercel first.'); return; }
    if (!tokenClient.current) { setError('Google sign-in is still loading.'); return; }
    setStatus('connecting');
    setError(null);
    tokenClient.current.requestAccessToken({ prompt: loginHint ? '' : 'select_account' });
  }, [clientId, loginHint]);

  const disconnect = useCallback(() => {
    const token = accessToken.current;
    if (token && window.google) window.google.accounts.oauth2.revoke(token);
    localStorage.removeItem(STORAGE_KEY);
    accessToken.current = null;
    setAccount(null); setTasks([]); setEvents([]); setTaskListId(null); setError(null); setStatus(clientId ? 'ready' : 'unconfigured');
  }, [clientId]);

  const refresh = useCallback(async () => {
    if (!accessToken.current) return;
    setStatus('loading');
    try { await loadWorkspace(accessToken.current); }
    catch (reason) { setStatus('error'); setError(reason instanceof Error ? reason.message : 'Sync failed.'); }
  }, [loadWorkspace]);

  const loadCalendarDate = useCallback(async (date: Date) => {
    if (!accessToken.current) return;
    try {
      setEvents(await fetchCalendarEvents(date));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this calendar date.');
    }
  }, [fetchCalendarEvents]);

  const createTask = useCallback(async (title: string) => {
    if (!taskListId) throw new Error('No Google Tasks list is available.');
    const created = await googleFetch<{ id: string; title: string; status?: string }>(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
      { method: 'POST', body: JSON.stringify({ title, notes: 'Created in Daybridge' }) },
    );
    const mapped = { id: created.id, listId: taskListId, title: created.title, completed: created.status === 'completed' };
    setTasks((current) => [...current, mapped]);
    return mapped;
  }, [googleFetch, taskListId]);

  const setTaskCompleted = useCallback(async (task: GoogleWorkspaceTask, completed: boolean) => {
    await googleFetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(task.listId)}/tasks/${encodeURIComponent(task.id)}`,
      { method: 'PATCH', body: JSON.stringify({ status: completed ? 'completed' : 'needsAction' }) },
    );
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed } : item));
  }, [googleFetch]);

  const createCalendarBlock = useCallback(async (title: string, start: Date, durationMinutes: number) => {
    const end = new Date(start.getTime() + durationMinutes * 60_000);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const event = await googleFetch<{ id: string; summary?: string; start: { dateTime: string }; end: { dateTime: string } }>(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      { method: 'POST', body: JSON.stringify({ summary: title, description: 'Focus block created by Daybridge', start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone }, extendedProperties: { private: { source: 'daybridge' } } }) },
    );
    setEvents((current) => [...current, { id: event.id, title: event.summary || title, start: new Date(event.start.dateTime), end: new Date(event.end.dateTime), allDay: false }]);
    return event;
  }, [googleFetch]);

  return { clientId, status, account, tasks, events, error, connect, disconnect, refresh, loadCalendarDate, createTask, setTaskCompleted, createCalendarBlock };
}
