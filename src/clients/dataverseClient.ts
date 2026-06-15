import axios, { AxiosInstance, AxiosError } from 'axios';
import { getAccessToken, getDataverseScope } from '../auth/msalClient.js';

let instance: AxiosInstance | null = null;

function getDataverseBaseUrl(): string {
  const url = process.env.DATAVERSE_URL;
  if (!url) throw new Error('DATAVERSE_URL environment variable is not set');
  return `${url.replace(/\/$/, '')}/api/data/v9.2`;
}

/**
 * Returns a singleton Axios instance pre-configured for Dataverse Web API calls.
 * An interceptor automatically attaches a fresh bearer token to every request.
 */
export function getDataverseClient(): AxiosInstance {
  if (instance) return instance;

  instance = axios.create({
    baseURL: getDataverseBaseUrl(),
    headers: {
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  // Attach bearer token before each request
  instance.interceptors.request.use(async (config) => {
    const token = await getAccessToken(getDataverseScope());
    config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  });

  return instance;
}

/**
 * Extracts a human-readable error message from an Axios error, including any
 * Dataverse OData error details.
 */
export function extractDataverseError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<{ error?: { message?: string; code?: string } }>;
    const odataMessage = axiosErr.response?.data?.error?.message;
    const odataCode = axiosErr.response?.data?.error?.code;
    if (odataMessage) {
      return odataCode ? `[${odataCode}] ${odataMessage}` : odataMessage;
    }
    return `HTTP ${axiosErr.response?.status}: ${axiosErr.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
