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
    commentStory: null,
    editingComment: null,
    editingStory: null,
    editingAward: null,
    winnerSlot: null,
    winnerCandidateIndex: 0,
    winnerTouchStartX: 0,
    searchQuery: '',
    modalScrollY: 0,
    unlockTimer: null,
    dragAwardId: null,
    awardPointerId: null,
    awardPointerAwardId: null,
    awardPointerStartY: 0,
    awardPointerMoved: false,
    deferredInstallPrompt: null,
    previewUrl: '',
    promptStory: null,
    imageStory: null,
};

const romanNumerals = [
    'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
    'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];
const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const fixedImageStyle = [
    'Create a cinematic surreal dream-journal illustration for Somniva based faithfully on the dream details below.',
    'Use a consistent dreamy nocturnal indigo, violet, midnight-blue, and soft moonlight palette.',
    'Make it atmospheric, symbolic, emotionally vivid, richly detailed, and slightly mysterious, like a beautiful remembered dream.',
    'Use a strong cinematic composition with natural depth, soft luminous contrast, and painterly realism.',
    'If any person appears, their face must be softly blurred, indistinct, anonymous, and completely unrecognizable; do not create readable facial identity.',
    'Do not include words, letters, captions, logos, watermarks, borders, UI, or readable signs.',
].join(' ');
const defaultDreamImage = 'somniva_default_dream.svg';
const iconMarkup = {
    generate: '<path d="m13 2 1.5 5.5L20 9l-5.5 1.5L13 16l-1.5-5.5L6 9l5.5-1.5L13 2Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />',
    points: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />',
    comment: '<path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M7 10h10M7 13h6" />',
    edit: '<path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.1 2.1 0 0 0-3-3L4 16.5Z" /><path d="m14.5 5.5 4 4" />',
    delete: '<path d="M5 7h14M10 11v5M14 11v5M9 7V4h6v3M7 7l.8 13h8.4L17 7" />',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindEvents();
    addParagraphRow();
    setDefaultDate();
    updatePlacementPreview();
    registerServiceWorker();
    setupInstallPrompt();
    setupSessionLifecycle();

    if (!state.token) {
        showLockScreen();
        return;
    }

    document.body.classList.add('session-loading');
    setAppLoading(true);
    setUnlockLoading(true);
    $('#unlock-status').textContent = 'Restoring your private session...';
    try {
        const collection = await apiRequest('collection');
        unlockApp();
        applyCollection(collection);
    } catch {
        lockApp('Your private session expired. Unlock Somniva again.');
    } finally {
        document.body.classList.remove('session-loading');
    }
}

function bindEvents() {
    $('#unlock-form')?.addEventListener('submit', handleUnlock);
    $('#toggle-password')?.addEventListener('click', togglePasswordVisibility);
    $('#add-dream-button')?.addEventListener('click', openStoryModal);
    $('#add-award-button')?.addEventListener('click', openAwardModal);
    $('#award-settings-button')?.addEventListener('click', openAwardSettingsModal);
    $('#story-modal-close')?.addEventListener('click', () => closeModal('story-modal'));
    $('#comment-modal-close')?.addEventListener('click', () => closeModal('comment-modal'));
    $('#prompt-modal-close')?.addEventListener('click', () => closeModal('prompt-modal'));
    $('#image-modal-close')?.addEventListener('click', () => closeModal('image-modal'));
    $('#award-modal-close')?.addEventListener('click', () => closeModal('award-modal'));
    $('#award-settings-close')?.addEventListener('click', () => closeModal('award-settings-modal'));
    $('#winner-modal-close')?.addEventListener('click', () => closeModal('winner-modal'));
    $('#vote-close')?.addEventListener('click', () => closeModal('vote-modal'));
    $('#winner-edit-button')?.addEventListener('click', openWinnerEditor);
    $('#winner-clear-button')?.addEventListener('click', clearWinnerSlot);
    $('#winner-prev')?.addEventListener('click', () => moveWinnerCandidate(-1));
    $('#winner-next')?.addEventListener('click', () => moveWinnerCandidate(1));
    $('#winner-save-button')?.addEventListener('click', saveWinnerSlot);
    $('#winner-carousel')?.addEventListener('touchstart', (event) => {
        state.winnerTouchStartX = event.changedTouches[0]?.clientX || 0;
    }, { passive: true });
    $('#winner-carousel')?.addEventListener('touchend', (event) => {
        const endX = event.changedTouches[0]?.clientX || 0;
        const delta = endX - state.winnerTouchStartX;
        if (Math.abs(delta) >= 40) moveWinnerCandidate(delta < 0 ? 1 : -1);
    }, { passive: true });
    $('#comment-form')?.addEventListener('submit', handleCommentSubmit);
    $('#story-search-form')?.addEventListener('submit', handleSearchSubmit);
    $('#story-search-input')?.addEventListener('input', handleSearchInput);
    $('#story-search-clear')?.addEventListener('click', clearStorySearch);
    $('#award-order-list')?.addEventListener('dragstart', handleAwardDragStart);
    $('#award-order-list')?.addEventListener('dragover', handleAwardDragOver);
    $('#award-order-list')?.addEventListener('drop', handleAwardDrop);
    $('#award-order-list')?.addEventListener('dragend', handleAwardDragEnd);
    $('#award-order-list')?.addEventListener('pointerdown', handleAwardPointerDown);
    $('#award-order-list')?.addEventListener('pointermove', handleAwardPointerMove, { passive: false });
    $('#award-order-list')?.addEventListener('pointerup', handleAwardPointerUp);
    $('#award-order-list')?.addEventListener('pointercancel', handleAwardPointerUp);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openModalElement = $('.modal-backdrop:not([hidden])');
            if (openModalElement) closeModal(openModalElement.id);
            else hideSearchResults();
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.search-form, .search-results')) hideSearchResults();

        const winnerSlot = event.target.closest('[data-winner-slot]');
        if (winnerSlot) {
            event.stopPropagation();
            openWinnerSlot(winnerSlot.dataset.awardId, Number(winnerSlot.dataset.rank));
            return;
        }

        const sectionButton = event.target.closest('[data-section]');
        if (sectionButton) {
            showSection(sectionButton.dataset.section);
            return;
        }

        const promptButton = event.target.closest('[data-generate-story]');
        if (promptButton) {
            event.stopPropagation();
            openPromptModal(promptButton.dataset.generateStory);
            return;
        }

        const commentButton = event.target.closest('[data-comment-story]');
        if (commentButton) {
            event.stopPropagation();
            openCommentModal(commentButton.dataset.commentStory);
            return;
        }

        const editCommentButton = event.target.closest('[data-edit-comment]');
        if (editCommentButton) {
            event.stopPropagation();
            openEditComment(editCommentButton.dataset.storyId, Number(editCommentButton.dataset.commentIndex));
            return;
        }

        const deleteCommentButton = event.target.closest('[data-delete-comment]');
        if (deleteCommentButton) {
            event.stopPropagation();
            deleteComment(deleteCommentButton.dataset.storyId, Number(deleteCommentButton.dataset.commentIndex));
            return;
        }

        const editAwardButton = event.target.closest('[data-edit-award]');
        if (editAwardButton) {
            event.stopPropagation();
            openEditAward(editAwardButton.dataset.editAward);
            return;
        }

        const deleteAwardButton = event.target.closest('[data-delete-award]');
        if (deleteAwardButton) {
            event.stopPropagation();
            deleteAward(deleteAwardButton.dataset.deleteAward);
            return;
        }

        const editButton = event.target.closest('[data-edit-story]');
        if (editButton) {
            event.stopPropagation();
            openEditStory(editButton.dataset.editStory);
            return;
        }

        const deleteButton = event.target.closest('[data-delete-story]');
        if (deleteButton) {
            event.stopPropagation();
            deleteStory(deleteButton.dataset.deleteStory);
            return;
        }

        const uploadButton = event.target.closest('[data-upload-story]');
        if (uploadButton) {
            event.stopPropagation();
            openImageUpload(uploadButton.dataset.uploadStory);
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
            return;
        }

        const searchResult = event.target.closest('[data-search-story]');
        if (searchResult) {
            event.stopPropagation();
            goToStory(searchResult.dataset.searchStory, Number(searchResult.dataset.searchParagraph));
            hideSearchResults();
            return;
        }

    });

    $$('.modal-backdrop').forEach((modal) => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal(modal.id);
        });
    });

    $('#prev-btn')?.addEventListener('click', () => changePage(-1));
    $('#next-btn')?.addEventListener('click', () => changePage(1));
    $('#add-paragraph')?.addEventListener('click', () => addParagraphRow());
    $('#paragraph-list')?.addEventListener('click', (event) => {
        if (!event.target.closest('[data-remove-paragraph]')) return;
        const rows = $$('.paragraph-row');
        if (rows.length <= 1) {
            rows[0].querySelector('textarea').value = '';
            syncParagraphRequirements();
            return;
        }
        event.target.closest('.paragraph-row').remove();
        syncParagraphRequirements();
    });
    $('#story-form')?.addEventListener('submit', handleStorySubmit);
    $('#story-page-choice')?.addEventListener('change', updatePlacementPreview);
    $('#generate-image-prompt')?.addEventListener('click', generateImagePrompt);
    $('#copy-image-prompt')?.addEventListener('click', copyImagePrompt);
    $('#story-image-file')?.addEventListener('change', handlePostImageSelection);
    $('#upload-story-image')?.addEventListener('click', handleStoryImageUpload);
    $('#award-form')?.addEventListener('submit', handleAwardSubmit);
    $('#vote-form')?.addEventListener('submit', handleVoteSubmit);
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
        if (response.status === 401 && action !== 'unlock') lockApp('Your private session expired. Unlock Somniva again.');
        throw new Error(data.error || 'Somniva could not complete that request.');
    }
    return data;
}

async function handleUnlock(event) {
    event.preventDefault();
    const status = $('#unlock-status');
    status.textContent = 'Unlocking...';
    setUnlockLoading(true);
    document.body.classList.add('is-unlocking');

    try {
        const result = await apiRequest('unlock', { password: $('#unlock-password').value });
        state.token = result.token;
        sessionStorage.setItem('somniva_token', state.token);
        const collection = await apiRequest('collection');
        unlockApp();
        applyCollection(collection);
        $('#unlock-password').value = '';
    } catch (error) {
        status.textContent = error.message || 'Somniva remains hidden.';
        document.body.classList.remove('is-unlocking');
    } finally {
        setUnlockLoading(false);
    }
}

function setUnlockLoading(isLoading) {
    const button = $('#unlock-form button[type="submit"]');
    const loader = $('#unlock-loader');
    if (button) {
        button.disabled = isLoading;
        button.classList.toggle('is-loading', isLoading);
        if (isLoading) button.setAttribute('aria-busy', 'true');
        else button.removeAttribute('aria-busy');
    }
    if (loader) loader.hidden = !isLoading;
}

function togglePasswordVisibility() {
    const input = $('#unlock-password');
    const button = $('#toggle-password');
    if (!input || !button) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    button.title = showing ? 'Show password' : 'Hide password';
}

function unlockApp() {
    const firstUnlock = !state.unlocked;
    state.unlocked = true;
    window.clearTimeout(state.unlockTimer);
    document.body.classList.remove('locked', 'session-loading', 'is-unlocking');
    document.body.classList.add('is-unlocked');
    const lockSection = $('#lock-section');
    lockSection.hidden = false;
    lockSection.setAttribute('aria-hidden', 'true');
    $('#private-app').hidden = false;
    $('#main-nav').hidden = false;
    $('#bottom-nav').hidden = false;
    $('#add-dream-button').hidden = false;
    $('#install-button').hidden = !state.deferredInstallPrompt;
    if (firstUnlock) activateHomeSection();
    $('#unlock-status').textContent = '';
    setUnlockLoading(false);
    state.unlockTimer = window.setTimeout(() => {
        lockSection.hidden = true;
        lockSection.removeAttribute('aria-hidden');
        document.body.classList.remove('is-unlocked');
    }, 460);
}

function showLockScreen() {
    state.unlocked = false;
    window.clearTimeout(state.unlockTimer);
    state.unlockTimer = null;
    document.body.classList.add('locked');
    document.body.classList.remove('is-unlocked', 'is-unlocking', 'session-loading');
    $('#lock-section').hidden = false;
    $('#lock-section').removeAttribute('aria-hidden');
    $('#private-app').hidden = true;
    $('#main-nav').hidden = true;
    $('#bottom-nav').hidden = true;
    setAppLoading(false);
    setUnlockLoading(false);
}

function lockApp(message = '') {
    state.token = null;
    state.unlocked = false;
    sessionStorage.removeItem('somniva_token');
    closeAllModals();
    showLockScreen();
    $('#unlock-status').textContent = message;
}

function applyCollection(collection) {
    state.stories = (collection.stories || []).map(normalizeStory);
    state.awards = collection.awards || [];
    state.winners = collection.winners || [];
    state.voteTotals = collection.voteTotals || [];
    hideDataStatus();
    renderAll();
    setAppLoading(false);
}

function normalizeStory(story) {
    return {
        ...story,
        page_number: Number(story.page_number),
        paragraphs: Array.isArray(story.paragraphs) ? story.paragraphs : [],
        comments: Array.isArray(story.comments) ? story.comments : [],
    };
}

async function loadCollection(showStatus = true) {
    setAppLoading(true);
    if (showStatus) showDataStatus('Refreshing your dreambook...');
    try {
        const collection = await apiRequest('collection');
        applyCollection(collection);
        return collection;
    } catch (error) {
        setAppLoading(false);
        throw error;
    }
}

function renderAll() {
    renderHome();
    renderAwards();
    displayEvents();
    renderStories();
    populatePageChoices();
}

function renderHome() {
    const recentContainer = $('#recent-dream-content');
    renderHomeMarquee();
    if (!recentContainer) return;

    recentContainer.classList.remove('loading-copy');
    const recent = [...state.stories].sort(compareRecent)[0];
    recentContainer.replaceChildren();
    if (!recent) {
        recentContainer.append(createEmptyState('No dreams have been created yet.'));
    } else {
        const title = document.createElement('h2');
        title.textContent = recent.title;
        const date = document.createElement('p');
        date.className = 'feature-date';
        date.textContent = `${formatDate(recent.dream_date)} · ${recent.link}`;
        const excerpt = document.createElement('p');
        excerpt.className = 'feature-excerpt';
        excerpt.textContent = plainText(recent.paragraphs[0] || 'A new dream is waiting to be read.');
        const button = document.createElement('button');
        button.className = 'text-button feature-link';
        button.type = 'button';
        button.dataset.storyLink = recent.link;
        button.textContent = 'Read this dream →';
        recentContainer.append(title, date, excerpt, button);
    }

}

function renderHomeMarquee() {
    const container = $('#home-winners');
    if (!container) return;
    container.classList.remove('loading-copy');
    container.replaceChildren();

    const firstPlaces = getFirstPlaceItems();
    if (!firstPlaces.length) {
        container.append(createEmptyState('The dreamer has not selected first places yet.'));
        return;
    }

    const track = document.createElement('div');
    track.className = 'marquee-track is-looping';
    const items = [...firstPlaces, ...firstPlaces];
    items.forEach(({ award, story }, index) => {
        const card = document.createElement('button');
        card.className = 'marquee-card';
        card.type = 'button';
        card.dataset.storyLink = story.link;
        if (index >= firstPlaces.length) {
            card.setAttribute('aria-hidden', 'true');
            card.tabIndex = -1;
        }
        const image = createStoryImage(story, 'marquee-image');
        const label = document.createElement('span');
        label.className = 'marquee-label';
        label.textContent = award.name;
        const title = document.createElement('strong');
        title.textContent = story.title;
        card.append(image, label, title);
        track.append(card);
    });
    container.append(track);
}

function getFirstPlaceItems() {
    const firstPlaces = orderedAwards()
        .map((award) => {
            const winner = state.winners.find((item) => item.award_id === award.id && Number(item.rank) === 1);
            return winner ? { winner, award, story: getStory(winner.story_id) } : null;
        })
        .filter((item) => item?.story);
    if (firstPlaces.length) return firstPlaces;

    return orderedAwards()
        .flatMap((award) => state.winners
            .filter((winner) => winner.award_id === award.id)
            .sort((a, b) => Number(a.rank) - Number(b.rank))
            .map((winner) => ({ winner, award, story: getStory(winner.story_id) })))
        .filter((item) => item.story)
        .slice(0, 12);
}

function renderAwards() {
    renderAwardOrder();
    const container = $('#awards-container');
    if (!container) return;
    container.replaceChildren();
    if (!state.awards.length) {
        container.append(createEmptyState('No awards have been created yet.'));
        return;
    }

    orderedAwards().forEach((award) => {
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

function renderAwardOrder() {
    const list = $('#award-order-list');
    if (!list) return;
    list.replaceChildren();
    list.hidden = !state.awards.length;
    const empty = $('#award-settings-empty');
    if (empty) empty.hidden = Boolean(state.awards.length);
    orderedAwards().forEach((award) => {
        const item = document.createElement('div');
        item.className = 'award-order-item';
        item.draggable = true;
        item.dataset.awardId = award.id;
        item.setAttribute('role', 'listitem');
        const handle = document.createElement('span');
        handle.className = 'award-drag-handle';
        handle.setAttribute('aria-hidden', 'true');
        handle.textContent = '⋮⋮';
        const name = document.createElement('span');
        name.className = 'award-order-name';
        name.textContent = award.name;
        const actions = document.createElement('span');
        actions.className = 'award-order-actions';
        const edit = document.createElement('button');
        edit.className = 'award-order-action';
        edit.type = 'button';
        edit.dataset.editAward = award.id;
        edit.setAttribute('aria-label', `Edit ${award.name}`);
        edit.title = 'Edit award';
        edit.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconMarkup.edit}</svg><span class="visually-hidden">Edit</span>`;
        const remove = document.createElement('button');
        remove.className = 'award-order-action award-delete-action';
        remove.type = 'button';
        remove.dataset.deleteAward = award.id;
        remove.setAttribute('aria-label', `Delete ${award.name}`);
        remove.title = 'Delete award';
        remove.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconMarkup.delete}</svg><span class="visually-hidden">Delete</span>`;
        actions.append(edit, remove);
        item.append(handle, name, actions);
        list.append(item);
    });
}

function handleAwardDragStart(event) {
    const item = event.target.closest('.award-order-item');
    if (!item) return;
    state.dragAwardId = item.dataset.awardId;
    item.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', state.dragAwardId);
}

function handleAwardDragOver(event) {
    const list = $('#award-order-list');
    const item = event.target.closest('.award-order-item');
    if (!list || !item || !state.dragAwardId || item.dataset.awardId === state.dragAwardId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    moveAwardItem(event.clientY, item);
}

function moveAwardItem(clientY, item) {
    const list = $('#award-order-list');
    const dragged = [...list.children].find((candidate) => candidate.dataset.awardId === state.dragAwardId);
    if (!dragged || dragged === item) return;
    const midpoint = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
    list.insertBefore(dragged, clientY < midpoint ? item : item.nextSibling);
}

function handleAwardDrop(event) {
    if (!state.dragAwardId) return;
    event.preventDefault();
    const list = $('#award-order-list');
    const awardIds = [...list.querySelectorAll('.award-order-item')].map((item) => item.dataset.awardId);
    const currentIds = orderedAwards().map((award) => award.id);
    if (awardIds.join('|') !== currentIds.join('|')) persistAwardOrder(awardIds);
}

function handleAwardDragEnd() {
    $$('.award-order-item').forEach((item) => item.classList.remove('is-dragging', 'is-over'));
    state.dragAwardId = null;
}

function handleAwardPointerDown(event) {
    if (event.pointerType === 'mouse') return;
    const item = event.target.closest('.award-order-item');
    if (!item) return;
    state.awardPointerId = event.pointerId;
    state.awardPointerAwardId = item.dataset.awardId;
    state.awardPointerStartY = event.clientY;
    state.awardPointerMoved = false;
    item.setPointerCapture?.(event.pointerId);
}

function handleAwardPointerMove(event) {
    if (state.awardPointerId !== event.pointerId) return;
    const item = event.target.closest('.award-order-item');
    if (!item) return;
    if (!state.awardPointerMoved && Math.abs(event.clientY - state.awardPointerStartY) < 6) return;
    state.awardPointerMoved = true;
    state.dragAwardId = state.awardPointerAwardId;
    const list = $('#award-order-list');
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.award-order-item');
    if (!list?.contains(target)) return;
    event.preventDefault();
    item.classList.add('is-dragging');
    moveAwardItem(event.clientY, target);
}

function handleAwardPointerUp(event) {
    if (state.awardPointerId !== event.pointerId) return;
    const list = $('#award-order-list');
    if (state.awardPointerMoved && list && state.dragAwardId) {
        const awardIds = [...list.querySelectorAll('.award-order-item')].map((item) => item.dataset.awardId);
        const currentIds = orderedAwards().map((award) => award.id);
        if (awardIds.join('|') !== currentIds.join('|')) persistAwardOrder(awardIds);
    }
    handleAwardDragEnd();
    state.awardPointerId = null;
    state.awardPointerAwardId = null;
    state.awardPointerMoved = false;
}

async function persistAwardOrder(awardIds) {
    const list = $('#award-order-list');
    list?.classList.add('is-saving');
    try {
        await apiRequest('reorder-awards', { award_ids: awardIds });
        const order = new Map(awardIds.map((id, index) => [id, index + 1]));
        state.awards.forEach((award) => { award.display_order = order.get(award.id); });
        renderAwards();
        showToast('Award order saved.');
    } catch (error) {
        showToast(error.message || 'Unable to save award order.');
        await loadCollection(false);
    } finally {
        list?.classList.remove('is-saving');
    }
}

function createWinnerCard(story, rank, awardId) {
    const card = document.createElement('button');
    card.className = `winner rank-${rank}`;
    card.type = 'button';
    card.dataset.winnerSlot = 'true';
    card.dataset.awardId = awardId;
    card.dataset.rank = String(rank);
    card.setAttribute('aria-label', `${rankLabel(rank)}: ${story?.title || 'Choose a dream'}`);

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
        const image = document.createElement('img');
        image.className = 'winner-placeholder-image image-fallback';
        setDreamImage(image, '', 'Dream artwork placeholder');
        const label = document.createElement('span');
        label.textContent = 'Choose a dream';
        empty.append(image, label);
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

function openWinnerSlot(awardId, rank) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award || ![1, 2, 3].includes(rank)) return;
    state.winnerSlot = { awardId, rank };
    state.winnerCandidateIndex = 0;
    $('#winner-slot-label').textContent = `${award.name} · ${rankLabel(rank)} · ${award.description || 'Choose a dream for this place.'}`;
    $('#winner-editor').hidden = true;
    $('#winner-form-status').textContent = '';
    renderWinnerPreview();
    openModal('winner-modal');
    $('#winner-edit-button').focus();
}

function renderWinnerPreview() {
    if (!state.winnerSlot) return;
    const { awardId, rank } = state.winnerSlot;
    const winner = getWinnerForSlot(awardId, rank);
    const story = winner ? getStory(winner.story_id) : null;
    const image = $('#winner-modal-image');
    setDreamImage(image, story?.image_url, story?.title || 'Dream artwork placeholder');
    $('#winner-modal-title').textContent = story?.title || 'No dream selected';
    $('#winner-modal-link').textContent = story ? `${story.link} · ${formatDate(story.dream_date)}` : 'This place is ready for a dream.';
    $('#winner-clear-button').disabled = !story;
}

function openWinnerEditor() {
    if (!state.winnerSlot) return;
    const current = getWinnerForSlot(state.winnerSlot.awardId, state.winnerSlot.rank);
    const candidates = getWinnerCandidates();
    const currentIndex = current ? candidates.findIndex((story) => story.id === current.story_id) : -1;
    const availableIndex = candidates.findIndex((story) => winnerCandidateIsAvailable(story));
    state.winnerCandidateIndex = currentIndex >= 0 ? currentIndex : Math.max(availableIndex, 0);
    $('#winner-editor').hidden = false;
    $('#winner-form-status').textContent = '';
    renderWinnerCandidate();
}

function getWinnerCandidates() {
    return sortByTitle(state.stories);
}

function getWinnerForSlot(awardId, rank) {
    return state.winners.find((winner) => winner.award_id === awardId && Number(winner.rank) === rank);
}

function getWinnerAssignment(awardId, storyId) {
    return state.winners.find((winner) => winner.award_id === awardId && winner.story_id === storyId);
}

function winnerCandidateIsAvailable(story) {
    if (!state.winnerSlot) return false;
    const assignment = getWinnerAssignment(state.winnerSlot.awardId, story.id);
    return !assignment || Number(assignment.rank) === state.winnerSlot.rank;
}

function renderWinnerCandidate() {
    const candidates = getWinnerCandidates();
    const image = $('#winner-carousel-image');
    const title = $('#winner-carousel-title');
    const link = $('#winner-carousel-link');
    const status = $('#winner-carousel-status');
    const saveButton = $('#winner-save-button');
    if (!candidates.length) {
        setDreamImage(image, '', 'Dream artwork placeholder');
        title.textContent = 'No dreams available';
        link.textContent = '';
        status.textContent = 'Create a dream before assigning this place.';
        saveButton.disabled = true;
        return;
    }

    state.winnerCandidateIndex = (state.winnerCandidateIndex + candidates.length) % candidates.length;
    const story = candidates[state.winnerCandidateIndex];
    const assignment = getWinnerAssignment(state.winnerSlot.awardId, story.id);
    const available = winnerCandidateIsAvailable(story);
    setDreamImage(image, story.image_url, story.title);
    title.textContent = story.title;
    link.textContent = `${story.link} · ${formatDate(story.dream_date)}`;
    status.textContent = available
        ? 'Available for this place.'
        : `Already selected for ${rankLabel(assignment.rank)} in this award.`;
    status.classList.toggle('is-unavailable', !available);
    saveButton.disabled = !available;
}

function moveWinnerCandidate(direction) {
    const candidates = getWinnerCandidates();
    if (!candidates.length) return;
    state.winnerCandidateIndex += direction;
    renderWinnerCandidate();
}

async function saveWinnerSlot() {
    if (!state.winnerSlot) return;
    const candidates = getWinnerCandidates();
    const story = candidates[state.winnerCandidateIndex];
    if (!story || !winnerCandidateIsAvailable(story)) return;
    const button = $('#winner-save-button');
    const status = $('#winner-form-status');
    status.textContent = 'Saving podium place...';
    setButtonLoading(button, true);
    try {
        await apiRequest('set-winner', {
            award_id: state.winnerSlot.awardId,
            story_id: story.id,
            rank: state.winnerSlot.rank,
        });
        closeModal('winner-modal');
        showToast('Hall of Fame updated.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message || 'Unable to update the podium.';
    } finally {
        setButtonLoading(button, false);
    }
}

async function clearWinnerSlot() {
    if (!state.winnerSlot || !getWinnerForSlot(state.winnerSlot.awardId, state.winnerSlot.rank)) return;
    if (!window.confirm('Clear this Hall of Fame place?')) return;
    const button = $('#winner-clear-button');
    setButtonLoading(button, true);
    try {
        await apiRequest('remove-winner', {
            award_id: state.winnerSlot.awardId,
            rank: state.winnerSlot.rank,
        });
        closeModal('winner-modal');
        showToast('Hall of Fame place cleared.');
        await loadCollection(false);
    } catch (error) {
        $('#winner-form-status').textContent = error.message || 'Unable to clear the podium place.';
    } finally {
        setButtonLoading(button, false);
    }
}

function rankLabel(rank) {
    return `Top ${rank}`;
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

    if (!entries.length) container.append(createEmptyState('No dream titles are available.'));
    else entries.forEach((story) => {
        const row = document.createElement('div');
        row.className = 'events';
        const title = document.createElement('button');
        title.className = 'events-link';
        title.type = 'button';
        title.dataset.storyLink = story.link;
        title.textContent = story.title;
        const page = document.createElement('span');
        page.className = 'event-link';
        page.textContent = story.link;
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
        container.append(createEmptyState('Dream pages will appear here.'));
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
        page.className = 'pages depth-card';
        page.id = `page-${pageNumber}`;
        const pageNumberLabel = document.createElement('div');
        pageNumberLabel.className = 'pagenum';
        pageNumberLabel.textContent = `Page ${pageNumber}`;
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
    storyLabel.textContent = story.link;
    const actions = document.createElement('div');
    actions.className = 'story-actions';
    actions.append(
        createStoryToolButton('generate', 'Generate image prompt', 'generateStory', story.id, 'prompt-tool'),
        createStoryToolButton('upload', story.image_path ? 'Replace photo' : 'Upload photo', 'uploadStory', story.id, 'upload-tool'),
        createStoryToolButton('points', 'Give points', 'voteStory', story.id, 'vote-tool'),
        createStoryToolButton('comment', 'Add comment', 'commentStory', story.id, 'comment-tool'),
        createStoryToolButton('edit', 'Edit story', 'editStory', story.id, 'edit-tool'),
        createStoryToolButton('delete', 'Delete story', 'deleteStory', story.id, 'delete-tool'),
    );
    topLine.append(storyLabel, actions);

    const picture = document.createElement('div');
    picture.className = `pic${story.image_path ? '' : ' has-no-image'}`;
    picture.append(createStoryImage(story, 'story-image'));
    const title = document.createElement('h1');
    title.textContent = story.title;
    const date = document.createElement('h3');
    date.textContent = formatDate(story.dream_date);
    const paragraphs = document.createElement('div');
    paragraphs.className = 'story-paragraphs';
    story.paragraphs.forEach((content, index) => {
        const paragraph = document.createElement('p');
        paragraph.id = `${story.link}-paragraph-${index}`;
        paragraph.dataset.storyParagraph = String(index);
        paragraph.innerHTML = sanitizeHtml(content);
        paragraphs.append(paragraph);
    });

    article.append(topLine, picture, title, date, paragraphs);
    story.comments.forEach((comment, index) => {
        const commentCard = document.createElement('div');
        commentCard.className = 'comment';
        const commentHeader = document.createElement('div');
        commentHeader.className = 'comment-header';
        const commentDate = document.createElement('h3');
        commentDate.textContent = formatCommentDate(comment.date);
        const commentActions = document.createElement('div');
        commentActions.className = 'comment-actions';
        commentActions.append(
            createCommentAction('edit', 'Edit comment', story.id, index),
            createCommentAction('delete', 'Delete comment', story.id, index),
        );
        commentHeader.append(commentDate, commentActions);
        commentCard.append(commentHeader);
        (comment.paragraphs || []).forEach((content) => {
            const paragraph = document.createElement('p');
            paragraph.innerHTML = sanitizeHtml(content);
            commentCard.append(paragraph);
        });
        article.append(commentCard);
    });

    return article;
}

function createCommentAction(icon, label, storyId, commentIndex) {
    const button = document.createElement('button');
    button.className = `comment-action ${icon === 'delete' ? 'comment-delete' : ''}`.trim();
    button.type = 'button';
    button.dataset[icon === 'delete' ? 'deleteComment' : 'editComment'] = 'true';
    button.dataset.storyId = storyId;
    button.dataset.commentIndex = String(commentIndex);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="comment-action-icon" viewBox="0 0 24 24" aria-hidden="true">${iconMarkup[icon]}</svg><span class="visually-hidden">${label}</span>`;
    return button;
}

function createStoryToolButton(icon, label, dataKey, storyId, extraClass = '') {
    const button = document.createElement('button');
    button.className = `story-tool-button ${extraClass}`.trim();
    button.type = 'button';
    button.dataset[dataKey] = storyId;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg class="story-tool-icon" viewBox="0 0 24 24" aria-hidden="true">${iconMarkup[icon]}</svg><span class="visually-hidden">${label}</span>`;
    return button;
}

function createStoryImage(story, className) {
    const image = document.createElement('img');
    image.className = className;
    image.loading = 'lazy';
    setDreamImage(image, story.image_url, story.title);
    return image;
}

function setDreamImage(image, source, alt) {
    if (!image) return;
    const hasUploadedImage = Boolean(source);
    image.dataset.fallbackApplied = 'false';
    image.alt = alt;
    image.classList.toggle('image-fallback', !hasUploadedImage);
    image.onerror = () => {
        if (image.dataset.fallbackApplied === 'true') return;
        image.dataset.fallbackApplied = 'true';
        image.classList.add('image-fallback');
        image.src = defaultDreamImage;
    };
    image.src = source || defaultDreamImage;
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
    openModal('vote-modal');
    $('#vote-award').focus();
}

async function handleVoteSubmit(event) {
    event.preventDefault();
    if (!state.currentStory) return;
    const status = $('#vote-status');
    const submitButton = $('#vote-form button[type="submit"]');
    status.textContent = 'Saving your points...';
    setButtonLoading(submitButton, true);
    try {
        await apiRequest('vote', {
            award_id: $('#vote-award').value,
            story_id: state.currentStory.id,
            points: Number($('#vote-points').value),
        });
        closeModal('vote-modal');
        showToast('Your points are saved.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message;
    } finally {
        setButtonLoading(submitButton, false);
    }
}

function populateVoteAwards() {
    const select = $('#vote-award');
    select.replaceChildren();
    orderedAwards().filter((award) => award.active !== false).forEach((award) => {
        const option = document.createElement('option');
        option.value = award.id;
        option.textContent = award.name;
        select.append(option);
    });
}

function populatePageChoices() {
    const select = $('#story-page-choice');
    if (!select) return;
    const current = select.value;
    select.replaceChildren();
    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = `New page automatically · ${generateLinkForPage(getNextPageNumber())}`;
    select.append(automatic);

    [...new Set(state.stories.map((story) => story.page_number))]
        .sort((a, b) => a - b)
        .forEach((pageNumber) => {
            const option = document.createElement('option');
            option.value = String(pageNumber);
            option.textContent = `Page ${pageNumber} · next ${generateLinkForPage(pageNumber)}`;
            select.append(option);
        });

    if ([...select.options].some((option) => option.value === current)) select.value = current;
    updatePlacementPreview();
}

function updatePlacementPreview() {
    const preview = $('#story-placement-preview');
    const select = $('#story-page-choice');
    if (!preview || !select) return;
    const pageNumber = select.value ? Number(select.value) : getNextPageNumber();
    const link = generateLinkForPage(pageNumber);
    preview.textContent = select.value
        ? `This dream will join page ${pageNumber} as ${link}.`
        : `This dream will open the next page as ${link}.`;
}

function getNextPageNumber() {
    return Math.max(0, ...state.stories.map((story) => Number(story.page_number) || 0)) + 1;
}

function generateLinkForPage(pageNumber) {
    const base = `p${pageNumber}`;
    const existing = new Set(state.stories.map((story) => story.link.toLowerCase()));
    if (!existing.has(base)) return base;
    let suffixIndex = 1;
    while (existing.has(`${base}${alphaSuffix(suffixIndex)}`)) suffixIndex += 1;
    return `${base}${alphaSuffix(suffixIndex)}`;
}

function alphaSuffix(index) {
    let value = index;
    let suffix = '';
    while (value > 0) {
        value -= 1;
        suffix = String.fromCharCode(97 + (value % 26)) + suffix;
        value = Math.floor(value / 26);
    }
    return suffix;
}

async function handleStorySubmit(event) {
    event.preventDefault();
    const status = $('#story-form-status');
    const title = $('#story-title').value.trim();
    const dreamDate = $('#story-date').value;
    const selectedPage = $('#story-page-choice').value;
    const paragraphs = $$('#paragraph-list textarea').map((field) => field.value.trim()).filter(Boolean);

    if (!title || !dreamDate || !paragraphs.length) {
        status.textContent = 'Add a title, date, and at least one paragraph.';
        return;
    }

    const editing = state.editingStory;
    status.textContent = editing ? 'Saving changes...' : 'Creating the dream...';
    const submitButton = $('#story-form button[type="submit"]');
    setButtonLoading(submitButton, true);
    const form = new FormData();
    form.append('title', title);
    if (editing) form.append('story_id', editing.id);
    else form.append('page_number', selectedPage);
    form.append('dream_date', dreamDate);
    form.append('paragraphs', JSON.stringify(paragraphs));

    try {
        const saved = await apiRequest(editing ? 'update-story' : 'save-story', form);
        resetStoryModal();
        closeModal('story-modal');
        showToast(editing ? 'Dream updated.' : `Dream created as ${saved.link}.`);
        status.textContent = '';
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message || (editing ? 'Unable to update the dream.' : 'Unable to create the dream.');
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function handleAwardSubmit(event) {
    event.preventDefault();
    const status = $('#award-form-status');
    const submitButton = $('#award-form button[type="submit"]');
    const editing = state.editingAward;
    status.textContent = editing ? 'Saving award changes...' : 'Saving award...';
    setButtonLoading(submitButton, true);
    try {
        await apiRequest(editing ? 'update-award' : 'save-award', {
            ...(editing ? { award_id: editing.id } : {}),
            name: $('#award-name').value.trim(),
            description: $('#award-description').value.trim(),
        });
        $('#award-form').reset();
        closeModal('award-modal');
        showToast(editing ? 'Award updated.' : 'Award added.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message;
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function handleCommentSubmit(event) {
    event.preventDefault();
    if (!state.commentStory) return;
    const status = $('#comment-form-status');
    const submitButton = $('#comment-form button[type="submit"]');
    const date = $('#comment-date').value;
    const comment = $('#comment-text').value.trim();
    if (!date || !comment) {
        status.textContent = 'Add a date and comment first.';
        return;
    }
    status.textContent = 'Saving comment...';
    setButtonLoading(submitButton, true);
    const editing = state.editingComment;
    try {
        await apiRequest(editing ? 'update-story-comment' : 'save-story-comment', {
            story_id: state.commentStory.id,
            ...(editing ? { comment_index: editing.index } : {}),
            comment_date: date,
            comment,
        });
        closeModal('comment-modal');
        showToast(editing ? 'Comment updated.' : 'Comment added.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message || 'Unable to save the comment.';
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function deleteStory(storyId) {
    const story = getStory(storyId);
    if (!story || !window.confirm(`Delete "${story.title}" permanently?`)) return;
    try {
        await apiRequest('delete-story', { story_id: story.id });
        showToast('Dream deleted.');
        await loadCollection(false);
    } catch (error) {
        showToast(error.message || 'Unable to delete the dream.');
    }
}

async function deleteAward(awardId) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award || !window.confirm(`Permanently delete "${award.name}"? Its winners and votes will also be deleted.`)) return;
    const status = $('#award-settings-status');
    if (status) status.textContent = `Deleting ${award.name}...`;
    try {
        await apiRequest('delete-award', { award_id: award.id });
        showToast('Award, winners, and votes deleted.');
        await loadCollection(false);
        if (status) status.textContent = '';
    } catch (error) {
        if (status) status.textContent = error.message || 'Unable to delete the award.';
        else showToast(error.message || 'Unable to delete the award.');
    }
}

async function deleteComment(storyId, commentIndex) {
    const story = getStory(storyId);
    const comment = story?.comments?.[commentIndex];
    if (!story || !comment || !window.confirm('Delete this comment permanently?')) return;
    try {
        await apiRequest('delete-story-comment', { story_id: story.id, comment_index: commentIndex });
        showToast('Comment deleted.');
        await loadCollection(false);
    } catch (error) {
        showToast(error.message || 'Unable to delete the comment.');
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
    syncParagraphRequirements();
}

function syncParagraphRequirements() {
    $$('#paragraph-list textarea').forEach((textarea, index) => {
        textarea.required = index === 0;
    });
}

function openPromptModal(storyId) {
    const story = getStory(storyId);
    if (!story) return;
    state.promptStory = story;
    $('#prompt-story-title').textContent = `${story.title} · ${story.link}`;
    $('#story-image-prompt').value = story.image_prompt || buildImagePrompt(story);
    $('#image-prompt-status').textContent = '';
    openModal('prompt-modal');
    $('#copy-image-prompt').focus();
}

function generateImagePrompt() {
    if (!state.promptStory) return;
    $('#story-image-prompt').value = buildImagePrompt(state.promptStory);
    $('#image-prompt-status').textContent = 'Prompt ready to copy.';
}

function buildImagePrompt(story) {
    const title = story?.title || 'Untitled dream';
    const paragraphs = (story?.paragraphs || [])
        .map((paragraph) => plainText(paragraph))
        .filter(Boolean)
        .join(' ')
        .slice(0, 3000);
    return `${fixedImageStyle}\n\nDream title: ${title}\nDream scene and details: ${paragraphs || 'A mysterious dream scene with symbolic details.'}\n\nComposition: focus on the most memorable visual moment from the dream, balanced focal subject, immersive environment, portrait-friendly framing.`;
}

async function copyImagePrompt() {
    const prompt = $('#story-image-prompt').value.trim();
    if (!prompt) {
        generateImagePrompt();
        return copyImagePrompt();
    }
    const copyButton = $('#copy-image-prompt');
    setButtonLoading(copyButton, true);
    try {
        try {
            await navigator.clipboard.writeText(prompt);
        } catch {
            const textarea = $('#story-image-prompt');
            textarea.select();
            document.execCommand('copy');
        }
        if (state.promptStory) {
            try {
                await apiRequest('save-story-prompt', {
                    story_id: state.promptStory.id,
                    image_prompt: prompt,
                });
                state.promptStory.image_prompt = prompt;
            } catch (error) {
                $('#image-prompt-status').textContent = `Copied, but could not save: ${error.message}`;
                return;
            }
        }
        $('#image-prompt-status').textContent = 'Copied and saved. Paste it into your image generator.';
    } finally {
        setButtonLoading(copyButton, false);
    }
}

function handlePostImageSelection() {
    const file = $('#story-image-file').files[0];
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

async function handleStoryImageUpload() {
    const file = $('#story-image-file').files[0];
    const status = $('#story-image-status');
    const uploadButton = $('#upload-story-image');
    if (!state.imageStory || !file) {
        status.textContent = 'Choose an image first.';
        return;
    }
    status.textContent = 'Uploading cover...';
    setButtonLoading(uploadButton, true);
    const form = new FormData();
    form.append('story_id', state.imageStory.id);
    form.append('image', file, file.name);
    try {
        await apiRequest('upload-story-image', form);
        closeModal('image-modal');
        showToast('Cover added to the dream.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message || 'Unable to upload the cover.';
    } finally {
        setButtonLoading(uploadButton, false);
    }
}

function openImageUpload(storyId) {
    const story = getStory(storyId);
    if (!story) return;
    state.imageStory = story;
    $('#image-story-title').textContent = `${story.title} · ${story.link}`;
    $('#story-image-status').textContent = '';
    $('#story-image-file').value = '';
    $('#story-image-preview').hidden = true;
    openModal('image-modal');
}

function openStoryModal() {
    state.editingStory = null;
    resetStoryModal();
    $('#story-modal-kicker').textContent = 'Owner workspace';
    $('#story-modal-heading').textContent = 'Add a dream';
    $('#story-modal-intro').textContent = 'Write the moment first. Give it an image when the right one exists.';
    $('#story-submit-label').textContent = 'Create dream';
    openModal('story-modal');
}

function openEditStory(storyId) {
    const story = getStory(storyId);
    if (!story) return;
    resetStoryModal();
    state.editingStory = story;
    $('#story-title').value = story.title;
    $('#story-date').value = story.dream_date;
    $('#paragraph-list').replaceChildren();
    story.paragraphs.forEach((paragraph) => addParagraphRow(paragraph));
    if (!story.paragraphs.length) addParagraphRow();
    $('#story-page-field').hidden = true;
    $('#story-placement-preview').hidden = true;
    $('#story-modal-kicker').textContent = 'Owner workspace';
    $('#story-modal-heading').textContent = 'Edit dream';
    $('#story-modal-intro').textContent = 'Refine the title, date, or paragraphs without changing its place in the dreambook.';
    $('#story-submit-label').textContent = 'Save changes';
    openModal('story-modal');
    $('#story-title').focus();
}

function openCommentModal(storyId) {
    const story = getStory(storyId);
    if (!story) return;
    state.commentStory = story;
    state.editingComment = null;
    $('#comment-story-title').textContent = `${story.title} · ${story.link}`;
    $('#comment-heading').textContent = 'Add a comment';
    $('#comment-submit-label').textContent = 'Save comment';
    $('#comment-date').value = new Date().toISOString().slice(0, 10);
    $('#comment-text').value = '';
    $('#comment-form-status').textContent = '';
    openModal('comment-modal');
    $('#comment-text').focus();
}

function openEditComment(storyId, commentIndex) {
    const story = getStory(storyId);
    const comment = story?.comments?.[commentIndex];
    if (!story || !comment) return;
    state.commentStory = story;
    state.editingComment = { index: commentIndex };
    $('#comment-story-title').textContent = `${story.title} · ${story.link}`;
    $('#comment-heading').textContent = 'Edit comment';
    $('#comment-submit-label').textContent = 'Save changes';
    $('#comment-date').value = commentDateInputValue(comment.date);
    $('#comment-text').value = (comment.paragraphs || []).join('\n\n');
    $('#comment-form-status').textContent = '';
    openModal('comment-modal');
    $('#comment-text').focus();
}

function commentDateInputValue(value) {
    const text = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function openAwardSettingsModal() {
    $('#award-settings-status').textContent = '';
    renderAwardOrder();
    openModal('award-settings-modal');
}

function openAwardModal() {
    state.editingAward = null;
    $('#award-form').reset();
    $('#award-form-status').textContent = '';
    $('#award-modal-kicker').textContent = 'Hall of Fame';
    $('#award-heading').textContent = 'Add an award';
    $('#award-modal-intro').textContent = 'Create a new distinction for the dreams that stay with you.';
    $('#award-submit-label').textContent = 'Add award';
    openModal('award-modal');
    $('#award-name').focus();
}

function openEditAward(awardId) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award) return;
    state.editingAward = award;
    $('#award-name').value = award.name;
    $('#award-description').value = award.description || '';
    $('#award-form-status').textContent = '';
    $('#award-modal-kicker').textContent = 'Award settings';
    $('#award-heading').textContent = 'Edit award';
    $('#award-modal-intro').textContent = 'Update the award name or description.';
    $('#award-submit-label').textContent = 'Save changes';
    openModal('award-modal');
    $('#award-name').focus();
}

function resetStoryModal() {
    state.editingStory = null;
    $('#story-form').reset();
    $('#paragraph-list').replaceChildren();
    addParagraphRow();
    $('#story-form-status').textContent = '';
    $('#story-page-field').hidden = false;
    $('#story-placement-preview').hidden = false;
    setDefaultDate();
    populatePageChoices();
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const alreadyOpen = $$('.modal-backdrop:not([hidden])').length > 0;
    $$('.modal-backdrop:not([hidden])').forEach((openModalElement) => {
        if (openModalElement.id !== id) closeModal(openModalElement.id);
    });
    if (!alreadyOpen) {
        state.modalScrollY = window.scrollY;
        document.body.style.top = `-${state.modalScrollY}px`;
    }
    modal.hidden = false;
    document.body.classList.add('modal-open');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.hidden = true;
    if (!$$('.modal-backdrop:not([hidden])').length) {
        document.body.classList.remove('modal-open');
        document.body.style.top = '';
        window.scrollTo(0, state.modalScrollY);
    }
    if (id === 'vote-modal') state.currentStory = null;
    if (id === 'comment-modal') {
        state.commentStory = null;
        state.editingComment = null;
    }
    if (id === 'award-modal') state.editingAward = null;
    if (id === 'prompt-modal') state.promptStory = null;
    if (id === 'winner-modal') state.winnerSlot = null;
    if (id === 'image-modal') {
        state.imageStory = null;
        if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = '';
    }
}

function closeAllModals() {
    $$('.modal-backdrop').forEach((modal) => { modal.hidden = true; });
    document.body.classList.remove('modal-open');
    document.body.style.top = '';
    window.scrollTo(0, state.modalScrollY);
    state.currentStory = null;
    state.commentStory = null;
    state.editingComment = null;
    state.editingAward = null;
    state.promptStory = null;
    state.imageStory = null;
    state.editingStory = null;
    state.winnerSlot = null;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
}

function showSection(sectionId) {
    $$('.app-section').forEach((section) => section.classList.toggle('active', section.id === sectionId));
    $$('.nav-item').forEach((item) => {
        const isActive = item.dataset.section === sectionId;
        item.classList.toggle('active', isActive);
        if (isActive) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function activateHomeSection() {
    $$('.app-section').forEach((section) => section.classList.toggle('active', section.id === 'home-section'));
    $$('.nav-item').forEach((item) => {
        const isHome = item.dataset.section === 'home-section';
        item.classList.toggle('active', isHome);
        if (isHome) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
}

function goToStory(link, paragraphIndex = null) {
    showSection('stories-section');
    window.setTimeout(() => {
        const story = document.getElementById(link);
        if (!story) return;
        const target = Number.isInteger(paragraphIndex) && paragraphIndex >= 0
            ? document.getElementById(`${link}-paragraph-${paragraphIndex}`) || story
            : story;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target !== story) {
            target.classList.add('search-hit');
            const mark = highlightSearchMatch(target, state.searchQuery);
            window.setTimeout(() => {
                target.classList.remove('search-hit');
                if (mark?.parentNode) mark.parentNode.replaceChild(document.createTextNode(mark.textContent), mark);
            }, 2200);
        }
    }, 40);
}

function highlightSearchMatch(element, query) {
    const needle = String(query || '').toLocaleLowerCase();
    if (!needle) return null;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        const index = node.textContent.toLocaleLowerCase().indexOf(needle);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        const mark = document.createElement('mark');
        mark.className = 'search-mark';
        range.surroundContents(mark);
        return mark;
    }
    return null;
}

function handleSearchInput(event) {
    state.searchQuery = event.target.value.trim();
    renderSearchResults();
}

function handleSearchSubmit(event) {
    event.preventDefault();
    state.searchQuery = $('#story-search-input').value.trim();
    const results = findSearchResults(state.searchQuery);
    if (results.length) {
        goToStory(results[0].story.link, results[0].paragraphIndex);
        hideSearchResults();
    } else {
        renderSearchResults();
    }
}

function clearStorySearch() {
    $('#story-search-input').value = '';
    state.searchQuery = '';
    hideSearchResults();
}

function renderSearchResults() {
    const container = $('#story-search-results');
    if (!container) return;
    const results = findSearchResults(state.searchQuery);
    container.replaceChildren();
    if (!state.searchQuery) {
        container.hidden = true;
        return;
    }
    if (!results.length) {
        const empty = document.createElement('p');
        empty.className = 'search-empty';
        empty.textContent = 'No matching dream sentence.';
        container.append(empty);
    } else {
        results.forEach((result) => {
            const button = document.createElement('button');
            button.className = 'search-result';
            button.type = 'button';
            button.dataset.searchStory = result.story.link;
            button.dataset.searchParagraph = String(result.paragraphIndex);
            const title = document.createElement('strong');
            title.textContent = `${result.story.title} · ${result.story.link}`;
            const snippet = document.createElement('span');
            snippet.textContent = result.snippet;
            button.append(title, snippet);
            container.append(button);
        });
    }
    container.hidden = false;
}

function hideSearchResults() {
    const container = $('#story-search-results');
    if (container) container.hidden = true;
}

function findSearchResults(query) {
    const needle = String(query || '').toLocaleLowerCase().trim();
    if (!needle) return [];
    const results = [];
    sortByTitle(state.stories).forEach((story) => {
        const titleText = `${story.title} ${story.link}`;
        if (titleText.toLocaleLowerCase().includes(needle)) {
            results.push({ story, paragraphIndex: -1, snippet: `${story.title} · ${story.link}` });
        }
        story.paragraphs.forEach((paragraph, index) => {
            const text = plainText(paragraph);
            const matchIndex = text.toLocaleLowerCase().indexOf(needle);
            if (matchIndex >= 0) results.push({ story, paragraphIndex: index, snippet: sentenceAroundMatch(text, matchIndex) });
        });
        story.comments.forEach((comment) => {
            (comment.paragraphs || []).forEach((paragraph) => {
                const text = plainText(paragraph);
                const matchIndex = text.toLocaleLowerCase().indexOf(needle);
                if (matchIndex >= 0) results.push({ story, paragraphIndex: -1, snippet: `Comment: ${sentenceAroundMatch(text, matchIndex)}` });
            });
        });
    });
    return results.slice(0, 12);
}

function sentenceAroundMatch(text, matchIndex) {
    const start = Math.max(text.lastIndexOf('.', matchIndex), text.lastIndexOf('!', matchIndex), text.lastIndexOf('?', matchIndex), text.lastIndexOf('\n', matchIndex)) + 1;
    const endCandidates = [text.indexOf('.', matchIndex), text.indexOf('!', matchIndex), text.indexOf('?', matchIndex)].filter((index) => index >= 0);
    const end = endCandidates.length ? Math.min(...endCandidates) + 1 : text.length;
    const sentence = text.slice(start, end).trim();
    return sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence;
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

function setupSessionLifecycle() {
    window.addEventListener('pageshow', (event) => {
        if (!event.persisted || !state.token || !state.unlocked) return;
        loadCollection(false).catch(() => lockApp('Your private session expired. Unlock Somniva again.'));
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

function orderedAwards() {
    return [...state.awards].sort((a, b) => Number(a.display_order) - Number(b.display_order) || titleCollator.compare(a.name, b.name));
}

function getStory(id) {
    return state.stories.find((story) => story.id === id);
}

function formatDate(value) {
    if (!value) return 'Date unknown';
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function formatCommentDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? formatDate(value) : (value || 'Comment');
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

function setAppLoading(isLoading) {
    const app = $('#private-app');
    const loader = $('#app-loading');
    if (app) app.classList.toggle('is-data-loading', isLoading);
    if (loader) loader.hidden = !isLoading;
}

function setButtonLoading(button, isLoading) {
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle('is-loading', isLoading);
    if (isLoading) button.setAttribute('aria-busy', 'true');
    else button.removeAttribute('aria-busy');
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
