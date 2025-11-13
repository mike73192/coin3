import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.5';

type Resource = 'state' | 'archives' | 'settings';

type ColumnMap = Record<Resource, { payload: string; updatedAt: string }>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SHARED_TOKEN = Deno.env.get('COIN3_FUNCTION_TOKEN');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be provided via secrets.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const columns: ColumnMap = {
  state: { payload: 'state_payload', updatedAt: 'state_updated_at' },
  archives: { payload: 'archives_payload', updatedAt: 'archives_updated_at' },
  settings: { payload: 'settings_payload', updatedAt: 'settings_updated_at' }
};

Deno.serve(async (req) => {
  const authCheck = authorize(req.headers.get('Authorization'));
  if (!authCheck.ok) {
    return jsonResponse({ error: 'Unauthorized' }, authCheck.status);
  }

  const { pathname } = new URL(req.url);
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'coin3') {
    segments.shift();
  }

  if (segments.length !== 3 || segments[0] !== 'rooms') {
    return jsonResponse({ error: 'Invalid path. Expected /rooms/:roomCode/:resource' }, 400);
  }

  const roomCode = decodeURIComponent(segments[1]);
  const resource = segments[2] as Resource;
  if (!(resource in columns)) {
    return jsonResponse({ error: 'Unknown resource' }, 404);
  }

  if (req.method === 'GET') {
    return handleGet(roomCode, resource);
  }

  if (req.method === 'PUT') {
    return handlePut(req, roomCode, resource);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, {
    'Allow': 'GET, PUT'
  });
});

function authorize(header: string | null): { ok: boolean; status: number } {
  if (!SHARED_TOKEN) {
    return { ok: true, status: 200 };
  }
  if (!header?.startsWith('Bearer ')) {
    return { ok: false, status: 401 };
  }
  const token = header.slice('Bearer '.length);
  return token === SHARED_TOKEN ? { ok: true, status: 200 } : { ok: false, status: 401 };
}

async function handleGet(roomCode: string, resource: Resource): Promise<Response> {
  const column = columns[resource];
  const { data, error } = await supabase
    .from('coin3_rooms')
    .select(`${column.payload}, ${column.updatedAt}`)
    .eq('room_code', roomCode)
    .maybeSingle();

  if (error) {
    console.error('[coin3] Failed to fetch room snapshot', error);
    return jsonResponse({ error: 'Database error' }, 500);
  }

  const payload = data?.[column.payload as keyof typeof data];
  if (!payload) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  return jsonResponse(payload, 200);
}

async function handlePut(req: Request, roomCode: string, resource: Resource): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ error: 'Body must be an object' }, 400);
  }

  const timestamp = extractUpdatedAt(body);
  const column = columns[resource];

  const payload = {
    room_code: roomCode,
    [column.payload]: body,
    [column.updatedAt]: timestamp
  };

  const { error } = await supabase
    .from('coin3_rooms')
    .upsert(payload, { onConflict: 'room_code' });

  if (error) {
    console.error('[coin3] Failed to upsert room snapshot', error);
    return jsonResponse({ error: 'Database error' }, 500);
  }

  return jsonResponse({ ok: true, updatedAt: timestamp }, 200);
}

function extractUpdatedAt(body: unknown): string {
  if (body && typeof body === 'object' && 'updatedAt' in body) {
    const raw = (body as { updatedAt?: unknown }).updatedAt;
    if (typeof raw === 'string' && !Number.isNaN(Date.parse(raw))) {
      return new Date(raw).toISOString();
    }
  }
  return new Date().toISOString();
}

function jsonResponse(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}
