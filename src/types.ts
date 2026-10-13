export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  ALLOWED_DOMAIN: string;
  ADMIN_EMAILS: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Local development only. Never configure in production. */
  DEV_LOGIN?: string;
}

export interface User {
  email: string;
  name: string;
  picture?: string;
  isAdmin: boolean;
}

export interface DocumentRow {
  id: string;
  title: string;
  doc_number: string | null;
  type: string;
  summary: string | null;
  issued_date: string | null;
  featured: number;
  file_name: string;
  file_size: number;
  mime: string;
  downloads: number;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: User | null } };
