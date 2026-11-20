const SOMNIVA_CONFIG = {
    apiUrl: window.SOMNIVA_CONFIG?.apiUrl || 'https://nirtjqjcqaxlrskuvpjy.supabase.co/functions/v1/somniva-api',
};

const state = {
    token: sessionStorage.getItem('somniva_token'),
    unlocked: false,
    stories: [],
    awards: [],
    winners: [],
    voteTotals: [],
    currentPage: 1,
    itemsPerPage: 8,
    currentStory: null,
    deferredInstallPrompt: null,
    previewUrl: '',
};

const romanNumerals = [
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];
const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const fixedImageStyle = [
    'Create a cinematic surreal dream-journal illustration for Somniva.',
    'Use a consistent nocturnal indigo, violet, midnight-blue, and soft moonlight palette.',
    'Make it atmospheric, symbolic, emotionally vivid, richly detailed, and slightly mysterious.',
    'Use a strong cinematic composition with natural depth, soft luminous contrast, and painterly realism.',
    'Do not include words, letters, captions, logos, watermarks, borders, UI, or readable signs.',
].join(' ');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindEvents();
    addParagraphRow();
    setDefaultDate();
    registerServiceWorker();
    setupInstallPrompt();

    if (!state.token) {
        showLockScreen();
        return;
    }

    try {
        const archive = await apiRequest('archive');
        unlockApp();
        applyArchive(archive);
    } catch {
        lockApp('Your private session expired. Unlock the archive again.');
    }
}

function bindEvents() {
    $('#unlock-form')?.addEventListener('submit', handleUnlock);
    document.addEventListener('click', (event) => {
        const sectionButton = event.target.closest('[data-section]');
        if (sectionButton) {
            showSection(sectionButton.dataset.section);
            return;
        }

        const storyLink = event.target.closest('[data-story-link]');
        if (storyLink) {
            goToStory(storyLink.dataset.storyLink);
            return;
        }

        const voteButton = event.target.closest('[data-vote-story]');
        if (voteButton) {
            event.stopPropagation();
            openVoteModal(voteButton.dataset.voteStory);
        }
    });

    $('#prev-btn')?.addEventListener('click', () => changePage(-1));
    $('#next-btn')?.addEventListener('click', () => changePage(1));
    $('#admin-button')?.addEventListener('click', toggleAdminPanel);
    $('#admin-close')?.addEventListener('click', closeAdminPanel);
    $('#add-paragraph')?.addEventListener('click', () => addParagraphRow());
    $('#paragraph-list')?.addEventListener('click', (event) => {
        if (!event.target.closest('[data-remove-paragraph]')) return;
        const rows = $$('.paragraph-row');
        if (rows.length <= 1) {
            rows[0].querySelector('textarea').value = '';
            return;
        }
        event.target.closest('.paragraph-row').remove();
    });
    $('#story-form')?.addEventListener('submit', handleStorySubmit);
    $('#story-image')?.addEventListener('change', handleImageSelection);
    $('#generate-image-prompt')?.addEventListener('click', generateImagePrompt);
    $('#copy-image-prompt')?.addEventListener('click', copyImagePrompt);
    $('#award-form')?.addEventListener('submit', handleAwardSubmit);
    $('#winner-form')?.addEventListener('submit', handleWinnerSubmit);
    $('#vote-close')?.addEventListener('click', closeVoteModal);
    $('#vote-form')?.addEventListener('submit', handleVoteSubmit);
    $('#vote-modal')?.addEventListener('click', (event) => {
        if (event.target.id === 'vote-modal') closeVoteModal();
    });
    $('#install-button')?.addEventListener('click', installPwa);
}

async function apiRequest(action, payload = {}) {
    const isFormData = payload instanceof FormData;
    const headers = {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;

    let body;
    if (isFormData) {
        payload.set('action', action);
        body = payload;
    } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ action, ...payload });
    }

    const response = await fetch(SOMNIVA_CONFIG.apiUrl, { method: 'POST', headers, body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 401 && action !== 'unlock') lockApp('Your private session expired. Unlock the archive again.');
        throw new Error(data.error || 'Somniva could not complete that request.');
    }
    return data;
}

async function handleUnlock(event) {
    event.preventDefault();
    const status = $('#unlock-status');
    const button = $('#unlock-form button');
    status.textContent = 'Unlocking...';
    button.disabled = true;

    try {
        const result = await apiRequest('unlock', { password: $('#unlock-password').value });
        state.token = result.token;
        sessionStorage.setItem('somniva_token', state.token);
        const archive = await apiRequest('archive');
        unlockApp();
        applyArchive(archive);
        $('#unlock-password').value = '';
    } catch (error) {
        status.textContent = error.message || 'The mystery remains hidden.';
    } finally {
        button.disabled = false;
    }
}

function unlockApp() {
    state.unlocked = true;
    document.body.classList.remove('locked');
    $('#lock-section').hidden = true;
    $('#private-app').hidden = false;
    $('#main-nav').hidden = false;
    $('#bottom-nav').hidden = false;
    $('#install-button').hidden = !state.deferredInstallPrompt;
    $('#unlock-status').textContent = '';
}

function showLockScreen() {
    state.unlocked = false;
    document.body.classList.add('locked');
    $('#lock-section').hidden = false;
    $('#private-app').hidden = true;
    $('#main-nav').hidden = true;
    $('#bottom-nav').hidden = true;
}

function lockApp(message = '') {
    state.token = null;
    state.unlocked = false;
    sessionStorage.removeItem('somniva_token');
    closeVoteModal();
    closeAdminPanel();
    showLockScreen();
    $('#unlock-status').textContent = message;
}

function applyArchive(archive) {
    state.stories = (archive.stories || []).map(normalizeStory);
    state.awards = archive.awards || [];
    state.winners = archive.winners || [];
    state.voteTotals = archive.voteTotals || [];
    hideDataStatus();
    renderAll();
}

function normalizeStory(story) {
    return {
        ...story,
        page_number: Number(story.page_number),
        paragraphs: Array.isArray(story.paragraphs) ? story.paragraphs : [],
        comments: Array.isArray(story.comments) ? story.comments : [],
    };
}

async function loadArchive() {
    showDataStatus('Opening the archive...');
    const archive = await apiRequest('archive');
    applyArchive(archive);
}

function renderAll() {
    renderHome();
    renderAwards();
    displayEvents();
    renderStories();
    populateAdminSelects();
}

function renderHome() {
    const recentContainer = $('#recent-dream-content');
    const winnerContainer = $('#home-winners');
    if (!recentContainer || !winnerContainer) return;

    const recent = [...state.stories].sort(compareRecent)[0];
    recentContainer.replaceChildren();
    if (!recent) {
        recentContainer.append(createEmptyState('No dreams have been published yet.'));
    } else {
        const title = document.createElement('h2');
        title.textContent = recent.title;
        const date = document.createElement('p');
        date.className = 'feature-date';
        date.textContent = `${formatDate(recent.dream_date)} · Page ${recent.page_number}`;
        const excerpt = document.createElement('p');
        excerpt.className = 'feature-excerpt';
        excerpt.textContent = plainText(recent.paragraphs[0] || 'A new dream is waiting to be read.');
        const button = document.createElement('button');
        button.className = 'text-button feature-link';
        button.type = 'button';
        button.dataset.storyLink = recent.link;
        button.textContent = 'Read the entry →';
        recentContainer.append(title, date, excerpt, button);
    }

    winnerContainer.replaceChildren();
    const firstPlaces = state.winners
        .filter((winner) => Number(winner.rank) === 1)
        .map((winner) => ({ winner, award: state.awards.find((item) => item.id === winner.award_id), story: getStory(winner.story_id) }))
        .filter((item) => item.award && item.story);

    if (!firstPlaces.length) {
        winnerContainer.append(createEmptyState('The dreamer has not selected first places yet.'));
        return;
    }

    firstPlaces.forEach(({ award, story }) => {
        const item = document.createElement('button');
        item.className = 'mini-winner';
        item.type = 'button';
        item.dataset.storyLink = story.link;
        const label = document.createElement('span');
        label.className = 'mini-winner-award';
        label.textContent = award.name;
        const title = document.createElement('strong');
        title.textContent = story.title;
        item.append(label, title);
        winnerContainer.append(item);
    });
}

function renderAwards() {
    const container = $('#awards-container');
    if (!container) return;
    container.replaceChildren();
    if (!state.awards.length) {
        container.append(createEmptyState('No awards have been created yet.'));
        return;
    }

    state.awards.forEach((award) => {
        const group = document.createElement('section');
        group.className = 'category-group';
        const heading = document.createElement('h2');
        heading.className = 'category-name';
        heading.textContent = award.name;
        const description = document.createElement('p');
        description.className = 'subtitle under';
        description.textContent = award.description || 'A distinction chosen for a memorable dream.';
        const podium = document.createElement('div');
        podium.className = 'podium';

        [2, 1, 3].forEach((rank) => {
            const winner = state.winners.find((item) => item.award_id === award.id && Number(item.rank) === rank);
            const story = winner ? getStory(winner.story_id) : null;
            podium.append(createWinnerCard(story, rank, award.id));
        });

        group.append(heading, description, podium);
        container.append(group);
    });
}

function createWinnerCard(story, rank, awardId) {
    const card = document.createElement('button');
    card.className = `winner rank-${rank}${story ? '' : ' winner-empty'}`;
    card.type = 'button';
    if (story) card.dataset.storyLink = story.link;

    const frame = document.createElement('span');
    frame.className = 'winner-frame';
    const badge = document.createElement('span');
    badge.className = 'rank-badge';
    badge.textContent = ['I', 'II', 'III'][rank - 1];
    frame.append(badge);

    if (story) frame.append(createStoryImage(story, 'winner-image'));
    else {
        const empty = document.createElement('span');
        empty.className = 'winner-placeholder';
        empty.textContent = 'Open slot';
        frame.append(empty);
    }

    const info = document.createElement('span');
    info.className = 'winner-info';
    const title = document.createElement('strong');
    title.textContent = story?.title || 'Choose a dream';
    info.append(title);

    if (story) {
        const score = state.voteTotals.find((item) => item.story_id === story.id && item.award_id === awardId);
        if (score) {
            const scoreLine = document.createElement('small');
            scoreLine.textContent = `${score.total_points} points · ${score.vote_count} vote${Number(score.vote_count) === 1 ? '' : 's'}`;
            info.append(scoreLine);
        }
    }

    card.append(frame, info);
    return card;
}

function displayEvents() {
    const container = $('#events-container');
    if (!container) return;
    const sorted = sortByTitle(state.stories);
    const pageTotal = Math.max(1, Math.ceil(sorted.length / state.itemsPerPage));
    state.currentPage = Math.min(Math.max(state.currentPage, 1), pageTotal);
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const entries = sorted.slice(start, start + state.itemsPerPage);
    container.replaceChildren();

    if (!entries.length) container.append(createEmptyState('No published titles are available.'));
    else entries.forEach((story) => {
        const row = document.createElement('div');
        row.className = 'events';
        const title = document.createElement('button');
        title.className = 'events-link';
        title.type = 'button';
        title.dataset.storyLink = story.link;
        title.textContent = story.title;
        const page = document.createElement('span');
        page.textContent = story.page_number;
        row.append(title, page);
        container.append(row);
    });

    $('#page-count').textContent = `Page ${state.currentPage} of ${pageTotal}`;
    $('#page-indicator').textContent = romanNumerals[state.currentPage - 1] || state.currentPage;
    $('#prev-btn').disabled = state.currentPage <= 1;
    $('#next-btn').disabled = state.currentPage >= pageTotal;
}

function changePage(direction) {
    state.currentPage += direction;
    displayEvents();
}

function renderStories() {
    const container = $('#stories-container');
    if (!container) return;
    container.replaceChildren();
    if (!state.stories.length) {
        container.append(createEmptyState('The story pages will appear here after the database is seeded.'));
        return;
    }

    const pages = new Map();
    [...state.stories]
        .sort((a, b) => a.page_number - b.page_number || a.link.localeCompare(b.link, undefined, { numeric: true }))
        .forEach((story) => {
            if (!pages.has(story.page_number)) pages.set(story.page_number, []);
            pages.get(story.page_number).push(story);
        });

    pages.forEach((stories, pageNumber) => {
        const page = document.createElement('div');
        page.className = 'pages';
        page.id = `page-${pageNumber}`;
        const pageNumberLabel = document.createElement('div');
        pageNumberLabel.className = 'pagenum';
        pageNumberLabel.textContent = pageNumber;
        const border = document.createElement('div');
        border.className = 'border';

        stories.forEach((story, index) => {
            if (index > 0) {
                const divider = document.createElement('hr');
                divider.className = 'story-divider';
                border.append(divider);
            }
            border.append(createStoryArticle(story));
        });

        page.append(pageNumberLabel, border);
        container.append(page);
    });
}

function createStoryArticle(story) {
    const article = document.createElement('article');
    article.className = 'story-entry';
    article.id = story.link;
    article.dataset.storyId = story.id;

    const topLine = document.createElement('div');
    topLine.className = 'story-topline';
    const storyLabel = document.createElement('span');
    storyLabel.textContent = `Page ${story.page_number}`;
    const vote = document.createElement('button');
    vote.className = 'vote-button';
    vote.type = 'button';
    vote.dataset.voteStory = story.id;
    vote.textContent = 'Give points';
    topLine.append(storyLabel, vote);

    const picture = document.createElement('div');
    picture.className = 'pic';
    picture.append(createStoryImage(story, 'story-image'));
    const title = document.createElement('h1');
    title.textContent = story.title;
    const date = document.createElement('h3');
    date.textContent = formatDate(story.dream_date);
    const paragraphs = document.createElement('div');
    paragraphs.className = 'story-paragraphs';
    story.paragraphs.forEach((content) => {
        const paragraph = document.createElement('summary');
        paragraph.innerHTML = sanitizeHtml(content);
        paragraphs.append(paragraph);
    });

    article.append(topLine, picture, title, date, paragraphs);
    story.comments.forEach((comment) => {
        const commentCard = document.createElement('div');
        commentCard.className = 'comment';
        const commentDate = document.createElement('h3');
        commentDate.textContent = comment.date || 'Comment';
        commentCard.append(commentDate);
        (comment.paragraphs || []).forEach((content) => {
            const paragraph = document.createElement('summary');
            paragraph.innerHTML = sanitizeHtml(content);
            commentCard.append(paragraph);
        });
        article.append(commentCard);
    });

    return article;
}

function createStoryImage(story, className) {
    const image = document.createElement('img');
    image.className = className;
    image.alt = story.title;
    image.src = story.image_url || 'somniva_logo.png';
    return image;
}

function openVoteModal(storyId) {
    const story = getStory(storyId);
    if (!story || !state.awards.length) {
        showToast('Create an award before voting.');
        return;
    }
    state.currentStory = story;
    $('#vote-story-title').textContent = story.title;
    populateVoteAwards();
    $('#vote-points').value = '10';
    $('#vote-status').textContent = '';
    $('#vote-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('#vote-award').focus();
}

function closeVoteModal() {
    $('#vote-modal').hidden = true;
    document.body.classList.remove('modal-open');
    state.currentStory = null;
}

async function handleVoteSubmit(event) {
    event.preventDefault();
    if (!state.currentStory) return;
    const status = $('#vote-status');
    status.textContent = 'Saving your points...';
    try {
        await apiRequest('vote', {
            award_id: $('#vote-award').value,
            story_id: state.currentStory.id,
            points: Number($('#vote-points').value),
        });
        status.textContent = 'Points saved.';
        showToast('Your points are in the archive.');
        await loadArchive();
        window.setTimeout(closeVoteModal, 500);
    } catch (error) {
        status.textContent = error.message;
    }
}

function populateVoteAwards() {
    const select = $('#vote-award');
    select.replaceChildren();
    state.awards.filter((award) => award.active !== false).forEach((award) => {
        const option = document.createElement('option');
        option.value = award.id;
        option.textContent = award.name;
        select.append(option);
    });
}

function populateAdminSelects() {
    const awardSelect = $('#winner-award');
    const storySelect = $('#winner-story');
    if (!awardSelect || !storySelect) return;
    awardSelect.replaceChildren();
    state.awards.forEach((award) => {
        const option = document.createElement('option');
        option.value = award.id;
        option.textContent = award.name;
        awardSelect.append(option);
    });
    storySelect.replaceChildren();
    sortByTitle(state.stories).forEach((story) => {
        const option = document.createElement('option');
        option.value = story.id;
        option.textContent = `${story.title} · Page ${story.page_number}`;
        storySelect.append(option);
    });
}

async function handleStorySubmit(event) {
    event.preventDefault();
    const status = $('#story-form-status');
    status.textContent = 'Saving dream and private image...';
    const title = $('#story-title').value.trim();
    const pageNumber = Number($('#story-page').value);
    const linkInput = $('#story-link').value.trim().toLowerCase();
    const link = linkInput || generateLink(pageNumber);
    const paragraphs = $$('#paragraph-list textarea').map((field) => field.value.trim()).filter(Boolean);
    const imageFile = $('#story-image').files[0];
    const imagePrompt = $('#story-image-prompt').value.trim() || buildImagePrompt();

    if (!title || !pageNumber || !paragraphs.length || !imageFile) {
        status.textContent = 'Add a title, page number, paragraphs, and cover photo.';
        return;
    }
    if (!/^p\d+[a-z]*$/.test(link) || state.stories.some((story) => story.link === link)) {
        status.textContent = 'Use a unique link such as p29 or p29a.';
        return;
    }

    const form = new FormData();
    form.append('title', title);
    form.append('page_number', String(pageNumber));
    form.append('link', link);
    form.append('dream_date', $('#story-date').value);
    form.append('paragraphs', JSON.stringify(paragraphs));
    form.append('image_prompt', imagePrompt);
    form.append('image', imageFile, imageFile.name);

    try {
        await apiRequest('save-story', form);
        status.textContent = 'Dream saved privately.';
        resetStoryForm();
        await loadArchive();
    } catch (error) {
        status.textContent = error.message || 'Unable to save the dream.';
    }
}

async function handleAwardSubmit(event) {
    event.preventDefault();
    const status = $('#award-form-status');
    status.textContent = 'Saving award...';
    try {
        await apiRequest('save-award', {
            name: $('#award-name').value.trim(),
            description: $('#award-description').value.trim(),
            display_order: Number($('#award-order').value),
        });
        $('#award-form').reset();
        $('#award-order').value = String(state.awards.length + 1);
        status.textContent = 'Award added.';
        await loadArchive();
    } catch (error) {
        status.textContent = error.message;
    }
}

async function handleWinnerSubmit(event) {
    event.preventDefault();
    const status = $('#winner-form-status');
    status.textContent = 'Saving winner...';
    try {
        await apiRequest('set-winner', {
            award_id: $('#winner-award').value,
            story_id: $('#winner-story').value,
            rank: Number($('#winner-rank').value),
        });
        status.textContent = 'Hall of Fame updated.';
        await loadArchive();
    } catch (error) {
        status.textContent = error.message;
    }
}

function addParagraphRow(value = '') {
    const list = $('#paragraph-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'paragraph-row';
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.placeholder = 'Write one paragraph of the dream...';
    textarea.value = value;
    textarea.required = list.children.length === 0;
    const remove = document.createElement('button');
    remove.className = 'icon-button remove-paragraph';
    remove.type = 'button';
    remove.dataset.removeParagraph = 'true';
    remove.setAttribute('aria-label', 'Remove paragraph');
    remove.textContent = '×';
    row.append(textarea, remove);
    list.append(row);
}

function generateImagePrompt() {
    const prompt = buildImagePrompt();
    $('#story-image-prompt').value = prompt;
    $('#image-prompt-output').hidden = false;
    $('#image-prompt-status').textContent = 'Prompt ready to copy.';
}

function buildImagePrompt() {
    const title = $('#story-title').value.trim() || 'Untitled dream';
    const paragraphs = $$('#paragraph-list textarea')
        .map((field) => plainText(field.value.trim()))
        .filter(Boolean)
        .join(' ')
        .slice(0, 2600);
    return `${fixedImageStyle}\n\nDream title: ${title}\nDream scene and details: ${paragraphs || 'A mysterious dream scene with symbolic details.'}\n\nComposition: focus on the most memorable visual moment from the dream, balanced focal subject, immersive environment, portrait-friendly framing.`;
}

async function copyImagePrompt() {
    const prompt = $('#story-image-prompt').value.trim();
    if (!prompt) {
        generateImagePrompt();
        return copyImagePrompt();
    }
    try {
        await navigator.clipboard.writeText(prompt);
    } catch {
        const textarea = $('#story-image-prompt');
        textarea.select();
        document.execCommand('copy');
    }
    $('#image-prompt-status').textContent = 'Copied. Paste it into any image generator.';
}

function handleImageSelection() {
    const file = $('#story-image').files[0];
    const preview = $('#story-image-preview');
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    if (!file) {
        state.previewUrl = '';
        preview.hidden = true;
        preview.removeAttribute('src');
        return;
    }
    state.previewUrl = URL.createObjectURL(file);
    preview.src = state.previewUrl;
    preview.hidden = false;
}

function resetStoryForm() {
    $('#story-form').reset();
    $('#paragraph-list').replaceChildren();
    addParagraphRow();
    $('#image-prompt-output').hidden = true;
    $('#story-image-prompt').value = '';
    $('#story-image-preview').hidden = true;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
    setDefaultDate();
}

function generateLink(pageNumber) {
    const base = `p${pageNumber}`;
    if (!state.stories.some((story) => story.link === base)) return base;
    let suffix = 0;
    let link = base;
    do {
        suffix += 1;
        link = `${base}${String.fromCharCode(96 + suffix)}`;
    } while (state.stories.some((story) => story.link === link));
    return link;
}

function showSection(sectionId) {
    $$('.app-section').forEach((section) => section.classList.toggle('active', section.id === sectionId));
    $$('.nav-item').forEach((item) => {
        const isActive = item.dataset.section === sectionId;
        item.classList.toggle('active', isActive);
        if (isActive) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    if (sectionId === 'stories-section') $('#stories-viewport')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToStory(link) {
    showSection('stories-section');
    window.setTimeout(() => document.getElementById(link)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 20);
}

function toggleAdminPanel() {
    showSection('home-section');
    const panel = $('#admin-panel');
    panel.hidden = !panel.hidden;
    $('#admin-button').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeAdminPanel() {
    $('#admin-panel').hidden = true;
    $('#admin-button').setAttribute('aria-expanded', 'false');
}

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        state.deferredInstallPrompt = event;
        if (state.unlocked) $('#install-button').hidden = false;
    });
    window.addEventListener('appinstalled', () => {
        state.deferredInstallPrompt = null;
        $('#install-button').hidden = true;
        showToast('Somniva was installed.');
    });
}

async function installPwa() {
    if (!state.deferredInstallPrompt) {
        showToast('Use your browser menu and choose Add to Home Screen.');
        return;
    }
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $('#install-button').hidden = true;
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('sw.js').catch(() => undefined);
    }
}

function compareRecent(a, b) {
    return String(b.dream_date).localeCompare(String(a.dream_date))
        || String(b.created_at || '').localeCompare(String(a.created_at || ''));
}

function sortByTitle(stories) {
    return [...stories].sort((a, b) => titleCollator.compare(a.title, b.title));
}

function getStory(id) {
    return state.stories.find((story) => story.id === id);
}

function formatDate(value) {
    if (!value) return 'Date unknown';
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function plainText(value) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = sanitizeHtml(value);
    return wrapper.textContent.trim();
}

function sanitizeHtml(value) {
    if (window.DOMPurify) {
        return window.DOMPurify.sanitize(String(value || ''), {
            ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 'br', 'a'],
            ALLOWED_ATTR: ['href', 'target', 'rel'],
        });
    }
    return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createEmptyState(message) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = message;
    return empty;
}

function showDataStatus(message, isError = false) {
    const status = $('#data-status');
    if (!status) return;
    status.hidden = false;
    status.classList.toggle('error', isError);
    status.textContent = message;
}

function hideDataStatus() {
    const status = $('#data-status');
    if (status) status.hidden = true;
}

function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function setDefaultDate() {
    const date = $('#story-date');
    if (date && !date.value) date.value = new Date().toISOString().slice(0, 10);
}
