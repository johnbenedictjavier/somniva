import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const somnivaPassword = Deno.env.get('SOMNIVA_PASSWORD') ?? '';
const tokenSecret = Deno.env.get('SOMNIVA_TOKEN_SECRET') ?? '';
const imageBucket = 'SM_story_images';
const tokenTtlMs = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();

const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders,
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json',
        },
    });
}

function base64UrlEncode(value: string | Uint8Array) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey() {
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(tokenSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
}

async function createToken() {
    const payload = base64UrlEncode(JSON.stringify({
        subject: 'somniva-owner',
        expiresAt: Date.now() + tokenTtlMs,
    }));
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(payload)));
    return `${payload}.${base64UrlEncode(signature)}`;
}

async function isValidToken(request: Request) {
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const [payload, encodedSignature] = token.split('.');
    if (!payload || !encodedSignature) return false;

    try {
        const signature = base64UrlDecode(encodedSignature);
        const validSignature = await crypto.subtle.verify(
            'HMAC',
            await signingKey(),
            signature,
            encoder.encode(payload),
        );
        if (!validSignature) return false;
        const details = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
        return details.subject === 'somniva-owner' && Number(details.expiresAt) > Date.now();
    } catch {
        return false;
    }
}

function requiredText(value: unknown, field: string, maxLength = 10000) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new Error(`${field} is required.`);
    }
    return value.trim();
}

function storyPayload(value: Record<string, unknown>) {
    const title = requiredText(value.title, 'Title', 180);
    const link = requiredText(value.link, 'Link', 40).toLowerCase();
    if (!/^p\d+[a-z]*$/.test(link)) throw new Error('Story link is invalid.');

    const pageNumber = Number(value.page_number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Page number is invalid.');

    const dreamDate = requiredText(value.dream_date, 'Dream date', 20);
    const paragraphs = Array.isArray(value.paragraphs)
        ? value.paragraphs.map((paragraph) => requiredText(paragraph, 'Paragraph', 20000))
        : [];
    if (!paragraphs.length) throw new Error('At least one paragraph is required.');

    return {
        title,
        page_number: pageNumber,
        link,
        dream_date: dreamDate,
        paragraphs,
        comments: [],
        image_prompt: typeof value.image_prompt === 'string' ? value.image_prompt.trim().slice(0, 12000) : '',
        published: true,
    };
}

async function archivePayload() {
    const [storiesResult, awardsResult, winnersResult, totalsResult] = await Promise.all([
        admin.from('SM_stories').select('*').order('page_number', { ascending: true }).order('link', { ascending: true }),
        admin.from('SM_awards').select('*').order('display_order', { ascending: true }).order('name', { ascending: true }),
        admin.from('SM_award_winners').select('id, award_id, story_id, rank'),
        admin.from('SM_vote_totals').select('award_id, story_id, vote_count, total_points, average_points'),
    ]);

    const error = storiesResult.error || awardsResult.error || winnersResult.error || totalsResult.error;
    if (error) throw error;

    const stories = await Promise.all((storiesResult.data ?? []).map(async (story) => {
        if (!story.image_path) return { ...story, image_url: '' };
        const signed = await admin.storage.from(imageBucket).createSignedUrl(story.image_path, 60 * 60 * 24);
        return { ...story, image_url: signed.data?.signedUrl ?? '' };
    }));

    return {
        stories,
        awards: awardsResult.data ?? [],
        winners: winnersResult.data ?? [],
        voteTotals: totalsResult.data ?? [],
    };
}

async function saveStory(request: Request) {
    const form = await request.formData();
    const rawPayload = {
        title: form.get('title'),
        page_number: form.get('page_number'),
        link: form.get('link'),
        dream_date: form.get('dream_date'),
        paragraphs: JSON.parse(String(form.get('paragraphs') ?? '[]')),
        image_prompt: form.get('image_prompt'),
    };
    const story = storyPayload(rawPayload);
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) throw new Error('A cover photo is required.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Cover photo must be 12 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const imagePath = `img/${story.link}-${crypto.randomUUID()}.${extension}`;
    const upload = await admin.storage.from(imageBucket).upload(imagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
    });
    if (upload.error) throw upload.error;

    const insert = await admin.from('SM_stories').insert({ ...story, image_path: imagePath }).select('*').single();
    if (insert.error) {
        await admin.storage.from(imageBucket).remove([imagePath]);
        throw insert.error;
    }
    return insert.data;
}

async function handleAction(action: string, request: Request, body: Record<string, unknown>) {
    if (action === 'archive') return archivePayload();
    if (action === 'save-story') return saveStory(request);

    if (action === 'save-award') {
        const name = requiredText(body.name, 'Award name', 100);
        const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
        const displayOrder = Number(body.display_order);
        if (!Number.isInteger(displayOrder) || displayOrder < 0) throw new Error('Award order is invalid.');
        const result = await admin.from('SM_awards').insert({ name, description, display_order: displayOrder, active: true }).select('*').single();
        if (result.error) throw result.error;
        return result.data;
    }

    if (action === 'set-winner') {
        const awardId = requiredText(body.award_id, 'Award', 80);
        const storyId = requiredText(body.story_id, 'Story', 80);
        const rank = Number(body.rank);
        if (![1, 2, 3].includes(rank)) throw new Error('Winner rank is invalid.');
        const result = await admin.from('SM_award_winners')
            .upsert({ award_id: awardId, story_id: storyId, rank }, { onConflict: 'award_id,rank' })
            .select('*')
            .single();
        if (result.error) throw result.error;
        return result.data;
    }

    if (action === 'vote') {
        const awardId = requiredText(body.award_id, 'Award', 80);
        const storyId = requiredText(body.story_id, 'Story', 80);
        const points = Number(body.points);
        if (!Number.isInteger(points) || points < 1 || points > 10) throw new Error('Points must be from 1 to 10.');
        const result = await admin.from('SM_votes')
            .upsert({ award_id: awardId, story_id: storyId, points }, { onConflict: 'award_id,story_id' })
            .select('*')
            .single();
        if (result.error) throw result.error;
        return result.data;
    }

    throw new Error('Unknown action.');
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405);
    if (!supabaseUrl || !serviceRoleKey || !somnivaPassword || !tokenSecret) {
        return jsonResponse({ error: 'Somniva API secrets are not configured.' }, 500);
    }

    try {
        const contentType = request.headers.get('content-type') ?? '';
        const body = contentType.includes('multipart/form-data') ? null : await request.json();
        const action = contentType.includes('multipart/form-data')
            ? String((await request.clone().formData()).get('action') ?? '')
            : String(body?.action ?? '');

        if (action === 'unlock') {
            if (body?.password !== somnivaPassword) return jsonResponse({ error: 'The mystery remains hidden.' }, 401);
            return jsonResponse({ token: await createToken(), expiresIn: tokenTtlMs });
        }

        if (!await isValidToken(request)) return jsonResponse({ error: 'Unlock Somniva first.' }, 401);
        const result = await handleAction(action, request, body ?? {});
        return jsonResponse(result);
    } catch (error) {
        console.error(error);
        return jsonResponse({ error: error instanceof Error ? error.message : 'Somniva could not complete that request.' }, 400);
    }
});
