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

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object') {
        const details = error as Record<string, unknown>;
        const message = typeof details.message === 'string' ? details.message.trim() : '';
        const hint = typeof details.hint === 'string' ? details.hint.trim() : '';
        const detail = typeof details.details === 'string' ? details.details.trim() : '';
        const parts = [message, detail, hint].filter(Boolean);
        if (parts.length) return parts.join(' ');
        try {
            return JSON.stringify(error);
        } catch {
            return '';
        }
    }
    return '';
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

function requiredTextPreservingWhitespace(value: unknown, field: string, maxLength = 10000) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new Error(`${field} is required.`);
    }
    return value;
}

function storyPayload(value: Record<string, unknown>) {
    const title = requiredText(value.title, 'Title', 180);

    const dreamDate = requiredText(value.dream_date, 'Dream date', 20);
    const paragraphs = Array.isArray(value.paragraphs)
        ? value.paragraphs.map((paragraph) => requiredTextPreservingWhitespace(paragraph, 'Paragraph', 20000))
        : [];
    if (!paragraphs.length) throw new Error('At least one paragraph is required.');

    return {
        title,
        dream_date: dreamDate,
        paragraphs,
        image_prompt: typeof value.image_prompt === 'string' ? value.image_prompt.trim().slice(0, 12000) : '',
    };
}

function inputValue(body: Record<string, unknown>, formData: FormData | null, field: string) {
    return formData ? formData.get(field) : body[field];
}

function parseParagraphs(value: unknown) {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error('Dream content is invalid.');
    }
}

async function collectionPayload() {
    const [storiesResult, awardsResult, winnersResult, nomineesResult] = await Promise.all([
        admin.from('SM_stories').select('*').order('page_number', { ascending: true }).order('link', { ascending: true }),
        admin.from('SM_awards').select('*').order('display_order', { ascending: true }).order('name', { ascending: true }),
        admin.from('SM_award_winners').select('id, award_id, story_id, rank'),
        admin.from('SM_award_nominees').select('id, award_id, story_id, created_at').order('created_at', { ascending: true }),
    ]);

    const error = storiesResult.error || awardsResult.error || winnersResult.error || nomineesResult.error;
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
        nominees: nomineesResult.data ?? [],
    };
}

async function saveStory(body: Record<string, unknown>, formData: FormData | null = null) {
    const story = storyPayload({
        title: inputValue(body, formData, 'title'),
        dream_date: inputValue(body, formData, 'dream_date'),
        paragraphs: parseParagraphs(inputValue(body, formData, 'paragraphs')),
        image_prompt: inputValue(body, formData, 'image_prompt'),
    });

    // Accept the previous one-step upload shape while new clients use the follow-up upload action.
    const file = formData?.get('image');
    let imagePath: string | null = null;
    if (file instanceof File && file.size > 0) {
        if (file.size > 12 * 1024 * 1024) throw new Error('Cover photo must be 12 MB or smaller.');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');
        const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        imagePath = `img/story-${crypto.randomUUID()}.${extension}`;
        const upload = await admin.storage.from(imageBucket).upload(imagePath, file, {
            cacheControl: '3600',
            contentType: file.type,
            upsert: false,
        });
        if (upload.error) throw upload.error;
    }

    const insert = await admin.rpc('sm_create_story', {
        p_title: story.title,
        p_dream_date: story.dream_date,
        p_paragraphs: story.paragraphs,
        p_image_prompt: story.image_prompt,
        p_image_path: imagePath,
    });
    if (insert.error) {
        if (imagePath) await admin.storage.from(imageBucket).remove([imagePath]);
        throw insert.error;
    }
    return insert.data;
}

async function updateStory(body: Record<string, unknown>, formData: FormData | null = null) {
    const storyId = requiredText(inputValue(body, formData, 'story_id'), 'Story', 80);
    const story = storyPayload({
        title: inputValue(body, formData, 'title'),
        dream_date: inputValue(body, formData, 'dream_date'),
        paragraphs: parseParagraphs(inputValue(body, formData, 'paragraphs')),
    });
    const result = await admin.rpc('sm_update_story', {
        p_story_id: storyId,
        p_title: story.title,
        p_dream_date: story.dream_date,
        p_paragraphs: story.paragraphs,
    });
    if (result.error) throw result.error;
    return result.data;
}

async function uploadStoryImage(formData: FormData | null = null) {
    const storyId = requiredText(formData?.get('story_id'), 'Story', 80);
    const file = formData?.get('image');
    if (!(file instanceof File) || file.size === 0) throw new Error('A cover photo is required.');
    if (file.size > 12 * 1024 * 1024) throw new Error('Cover photo must be 12 MB or smaller.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');

    const existing = await admin.from('SM_stories').select('id, link, image_path').eq('id', storyId).single();
    if (existing.error) throw existing.error;

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const imagePath = `img/${existing.data.link}-${crypto.randomUUID()}.${extension}`;
    const upload = await admin.storage.from(imageBucket).upload(imagePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
    });
    if (upload.error) throw upload.error;

    const update = await admin.from('SM_stories')
        .update({ image_path: imagePath })
        .eq('id', storyId)
        .select('*')
        .single();
    if (update.error) {
        await admin.storage.from(imageBucket).remove([imagePath]);
        throw update.error;
    }
    if (existing.data.image_path) {
        await admin.storage.from(imageBucket).remove([existing.data.image_path]);
    }
    return update.data;
}

async function saveStoryPrompt(body: Record<string, unknown>) {
    const storyId = requiredText(body.story_id, 'Story', 80);
    const prompt = requiredText(body.image_prompt, 'Image prompt', 12000);
    const result = await admin.from('SM_stories')
        .update({ image_prompt: prompt })
        .eq('id', storyId)
        .select('*')
        .single();
    if (result.error) throw result.error;
    return result.data;
}

async function saveStoryComment(body: Record<string, unknown>) {
    const storyId = requiredText(body.story_id, 'Story', 80);
    const commentDate = requiredText(body.comment_date, 'Comment date', 80);
    const comment = requiredTextPreservingWhitespace(body.comment, 'Comment', 20000);
    const comments = await readStoryComments(storyId);
    comments.push({ date: commentDate, paragraphs: [comment] });
    return updateStoryComments(storyId, comments);
}

async function updateStoryComment(body: Record<string, unknown>) {
    const storyId = requiredText(body.story_id, 'Story', 80);
    const commentIndex = Number(body.comment_index);
    const commentDate = requiredText(body.comment_date, 'Comment date', 80);
    const comment = requiredTextPreservingWhitespace(body.comment, 'Comment', 20000);
    if (!Number.isInteger(commentIndex) || commentIndex < 0) throw new Error('Comment index is invalid.');

    const comments = await readStoryComments(storyId);
    if (!comments[commentIndex]) throw new Error('Comment was not found.');
    comments[commentIndex] = { ...comments[commentIndex], date: commentDate, paragraphs: [comment] };
    return updateStoryComments(storyId, comments);
}

async function deleteStoryComment(body: Record<string, unknown>) {
    const storyId = requiredText(body.story_id, 'Story', 80);
    const commentIndex = Number(body.comment_index);
    if (!Number.isInteger(commentIndex) || commentIndex < 0) throw new Error('Comment index is invalid.');

    const comments = await readStoryComments(storyId);
    if (!comments[commentIndex]) throw new Error('Comment was not found.');
    comments.splice(commentIndex, 1);
    await updateStoryComments(storyId, comments);
    return { deleted: true, story_id: storyId, comment_index: commentIndex };
}

async function readStoryComments(storyId: string) {
    const existing = await admin.from('SM_stories').select('comments').eq('id', storyId).single();
    if (existing.error) throw existing.error;
    return Array.isArray(existing.data.comments) ? existing.data.comments : [];
}

async function updateStoryComments(storyId: string, comments: unknown[]) {
    const result = await admin.from('SM_stories')
        .update({ comments, updated_at: new Date().toISOString() })
        .eq('id', storyId)
        .select('*')
        .single();
    if (result.error) throw result.error;
    return result.data;
}

async function deleteStory(body: Record<string, unknown>) {
    const storyId = requiredText(body.story_id, 'Story', 80);
    const result = await admin.rpc('sm_delete_story', { p_story_id: storyId });
    if (result.error) throw result.error;
    if (result.data?.image_path) {
        const cleanup = await admin.storage.from(imageBucket).remove([result.data.image_path]);
        if (cleanup.error) console.error('Unable to remove deleted story image', cleanup.error);
    }
    return { deleted: true, story_id: storyId };
}

async function setWinner(body: Record<string, unknown>) {
    const awardId = requiredText(body.award_id, 'Award', 80);
    const storyId = requiredText(body.story_id, 'Story', 80);
    const rank = Number(body.rank);
    if (!Number.isInteger(rank) || ![1, 2, 3].includes(rank)) throw new Error('Winner rank is invalid.');

    const result = await admin.rpc('sm_set_award_winner', {
        p_award_id: awardId,
        p_story_id: storyId,
        p_rank: rank,
    });
    if (result.error) throw result.error;
    return result.data;
}

async function removeWinner(body: Record<string, unknown>) {
    const awardId = requiredText(body.award_id, 'Award', 80);
    const rank = Number(body.rank);
    if (!Number.isInteger(rank) || ![1, 2, 3].includes(rank)) throw new Error('Winner rank is invalid.');
    const result = await admin.rpc('sm_remove_award_winner', {
        p_award_id: awardId,
        p_rank: rank,
    });
    if (result.error) throw result.error;
    return { deleted: true, award_id: awardId, rank };
}

async function nomineeStoryIds(body: Record<string, unknown>, awardId: string) {
    const raw = body.story_ids ?? body.nominee_story_ids ?? body.nominees ?? body.nominee_ids;
    if (!Array.isArray(raw)) throw new Error('Nominee story IDs are required.');

    let storyIds = raw.map((item, index) => {
        const value = item && typeof item === 'object'
            ? (item as Record<string, unknown>).story_id ?? (item as Record<string, unknown>).id
            : item;
        return requiredText(value, `Nominee ${index + 1}`, 80);
    });

    // Also accept persisted nominee row IDs for callers using nominee_ids.
    if (body.nominee_ids !== undefined
        && body.story_ids === undefined
        && body.nominee_story_ids === undefined
        && body.nominees === undefined
        && storyIds.length) {
        const existing = await admin.from('SM_award_nominees')
            .select('id, story_id')
            .eq('award_id', awardId)
            .in('id', storyIds);
        if (existing.error) throw existing.error;
        const storyByNomineeId = new Map((existing.data ?? []).map((nominee) => [nominee.id, nominee.story_id]));
        storyIds = storyIds.map((id) => storyByNomineeId.get(id) ?? id);
    }

    return storyIds;
}

async function replaceAwardNominees(body: Record<string, unknown>) {
    const awardId = requiredText(body.award_id, 'Award', 80);
    const storyIds = await nomineeStoryIds(body, awardId);
    const result = await admin.rpc('sm_replace_award_nominees', {
        p_award_id: awardId,
        p_story_ids: storyIds,
    });
    if (result.error) throw result.error;
    return { award_id: awardId, nominees: result.data ?? [] };
}

async function reorderAwards(body: Record<string, unknown>) {
    if (!Array.isArray(body.award_ids) || !body.award_ids.length) throw new Error('Award order is required.');
    const awardIds = body.award_ids.map((awardId) => requiredText(awardId, 'Award', 80));
    if (new Set(awardIds).size !== awardIds.length) throw new Error('Award order contains duplicates.');

    const existing = await admin.from('SM_awards').select('id');
    if (existing.error) throw existing.error;
    const existingIds = new Set((existing.data ?? []).map((award) => award.id));
    if (awardIds.some((awardId) => !existingIds.has(awardId)) || awardIds.length !== existingIds.size) {
        throw new Error('Award order does not match the collection.');
    }

    const updates = await Promise.all(awardIds.map((awardId, index) => admin.from('SM_awards')
        .update({ display_order: index + 1, updated_at: new Date().toISOString() })
        .eq('id', awardId)));
    const error = updates.find((result) => result.error)?.error;
    if (error) throw error;
    return { ordered: true, award_ids: awardIds };
}

async function updateAward(body: Record<string, unknown>) {
    const awardId = requiredText(body.award_id, 'Award', 80);
    const name = requiredText(body.name, 'Award name', 100);
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
    const result = await admin.from('SM_awards')
        .update({ name, description, updated_at: new Date().toISOString() })
        .eq('id', awardId)
        .select('*')
        .single();
    if (result.error) throw result.error;
    return result.data;
}

async function deleteAward(body: Record<string, unknown>) {
    const awardId = requiredText(body.award_id, 'Award', 80);
    const existing = await admin.from('SM_awards').select('id, name').eq('id', awardId).single();
    if (existing.error) throw existing.error;

    // SM_award_winners and nominees reference awards with ON DELETE CASCADE.
    const result = await admin.from('SM_awards').delete().eq('id', awardId);
    if (result.error) throw result.error;
    return { deleted: true, award_id: awardId, name: existing.data.name };
}

async function handleAction(action: string, body: Record<string, unknown>, formData: FormData | null = null) {
    // Keep the previous action name valid while installed PWAs receive the new shell.
    if (action === 'collection' || action === 'archive') return collectionPayload();
    if (action === 'save-story' || action === 'create-story') return saveStory(body, formData);
    if (action === 'update-story') return updateStory(body, formData);
    if (action === 'upload-story-image') return uploadStoryImage(formData);
    if (action === 'save-story-prompt') return saveStoryPrompt(body);
    if (action === 'save-story-comment') return saveStoryComment(body);
    if (action === 'update-story-comment') return updateStoryComment(body);
    if (action === 'delete-story-comment') return deleteStoryComment(body);
    if (action === 'delete-story') return deleteStory(body);
    if (action === 'set-winner') return setWinner(body);
    if (action === 'remove-winner') return removeWinner(body);
    if (action === 'replace-nominees' || action === 'replace-award-nominees' || action === 'save-award-nominees') {
        return replaceAwardNominees(body);
    }
    if (action === 'reorder-awards') return reorderAwards(body);
    if (action === 'update-award') return updateAward(body);
    if (action === 'delete-award') return deleteAward(body);

    if (action === 'save-award') {
        const name = requiredText(body.name, 'Award name', 100);
        const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
        const latest = await admin.from('SM_awards')
            .select('display_order')
            .order('display_order', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (latest.error) throw latest.error;
        const displayOrder = (Number(latest.data?.display_order) || 0) + 1;
        const result = await admin.from('SM_awards').insert({ name, description, display_order: displayOrder, active: true }).select('*').single();
        if (result.error) throw result.error;
        return result.data;
    }

    if (action === 'vote') throw new Error('Scoring is disabled.');

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
        const isMultipart = contentType.includes('multipart/form-data');
        const formData = isMultipart ? await request.formData() : null;
        const body = isMultipart ? null : await request.json();
        const action = isMultipart
            ? String(formData?.get('action') ?? '')
            : String(body?.action ?? '');

        if (action === 'unlock') {
            if (body?.password !== somnivaPassword) return jsonResponse({ error: 'The mystery remains hidden.' }, 401);
            return jsonResponse({ token: await createToken(), expiresIn: tokenTtlMs });
        }

        if (!await isValidToken(request)) return jsonResponse({ error: 'Unlock Somniva first.' }, 401);
        const result = await handleAction(action, body ?? {}, formData);
        return jsonResponse(result);
    } catch (error) {
        console.error(error);
        return jsonResponse({ error: errorMessage(error) || 'Somniva could not complete that request.' }, 400);
    }
});
