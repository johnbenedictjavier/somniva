const SOMNIVA_CONFIG = {
    apiUrl: window.SOMNIVA_CONFIG?.apiUrl || 'https://nirtjqjcqaxlrskuvpjy.supabase.co/functions/v1/somniva-api',
};

const state = {
    token: sessionStorage.getItem('somniva_token'),
    unlocked: false,
    stories: [],
    awards: [],
    nominees: [],
    winners: [],
    currentPage: 1,
    itemsPerPage: 8,
    storyPageIndex: 0,
    storyPageNumber: 1,
    storyPages: [],
    commentStory: null,
    editingComment: null,
    editingStory: null,
    editingAward: null,
    winnerSlot: null,
    nomineeAwardId: null,
    nomineeSelection: new Set(),
    nomineeTouchStartX: 0,
    nomineeTouchViewport: null,
    confirmationAction: null,
    confirmationCancel: null,
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
    'Use a consistent dreamy indigo, violet, and midnight-blue palette with soft cinematic light, letting the storyline determine the time of day.',
    'Make it atmospheric, symbolic, emotionally vivid, richly detailed, and slightly mysterious, like a beautiful remembered dream.',
    'Use a strong cinematic composition with natural depth, soft luminous contrast, and painterly realism.',
    'Compose the image in a 16:9 landscape aspect ratio.',
    'Default to a gentle morning atmosphere, unless the storyline clearly establishes another time of day; the storyline overrides the morning default.',
    'If any person appears, their face must be softly blurred, indistinct, anonymous, and completely unrecognizable; do not create readable facial identity.',
    'Do not include words, letters, captions, logos, watermarks, borders, UI, or readable signs.',
].join(' ');
const defaultDreamImage = 'somniva_default_dream.svg';
const iconMarkup = {
    generate: '<path d="m13 2 1.5 5.5L20 9l-5.5 1.5L13 16l-1.5-5.5L6 9l5.5-1.5L13 2Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14" />',
    comment: '<path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" /><path d="M7 10h10M7 13h6" />',
    edit: '<path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.1 2.1 0 0 0-3-3L4 16.5Z" /><path d="m14.5 5.5 4 4" />',
    delete: '<path d="M5 7h14M10 11v5M14 11v5M9 7V4h6v3M7 7l.8 13h8.4L17 7" />',
    nominees: '<path d="M4 6h16M4 12h16M4 18h10" /><path d="m17 16 2 2 3-4" />',
    top1: '<path d="M7 3h3l2 4 2-4h3l-3 6h-4L7 3Z" /><circle cx="12" cy="15" r="5.5" /><path d="M12 12.5v5M10.5 14l1.5-1.5 1.5 1.5" />',
    top2: '<path d="M6 3h3.5l2.5 4 2.5-4H18l-3 6H9L6 3Z" /><circle cx="12" cy="15" r="5.5" /><path d="M10.3 14c.2-1 1-1.5 1.9-1.5 1 0 1.7.5 1.7 1.2 0 .8-.7 1.2-1.5 1.8l-1.8 1.3h3.5" />',
    top3: '<path d="M8 3h3l1 4 1-4h3l-2 6h-4L8 3Z" /><circle cx="12" cy="15" r="5.5" /><path d="M10.5 13.1c.4-.4 1-.6 1.6-.6 1 0 1.7.5 1.7 1.2 0 .6-.5 1-1.2 1.2.8.1 1.4.6 1.4 1.3 0 .9-.8 1.5-1.9 1.5-.7 0-1.4-.3-1.8-.8" />',
    nominee: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindEvents();
    setDefaultDate();
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
    $('#unlock-status').textContent = '';
    try {
        unlockApp();
        const collection = await apiRequest('collection');
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
    $('#winner-clear-button')?.addEventListener('click', clearWinnerSlot);
    $('#winner-open-story')?.addEventListener('click', openWinnerStory);
    $('#nominee-modal-close')?.addEventListener('click', () => closeModal('nominee-modal'));
    $('#nominee-save-button')?.addEventListener('click', saveNominees);
    $('#confirmation-close')?.addEventListener('click', handleConfirmationCancel);
    $('#confirmation-cancel')?.addEventListener('click', handleConfirmationCancel);
    $('#confirmation-confirm')?.addEventListener('click', handleConfirmationConfirm);
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
    $('#stories-prev-page')?.addEventListener('click', () => changeStoryPage(-1));
    $('#stories-next-page')?.addEventListener('click', () => changeStoryPage(1));
    $('#story-page-numbers')?.addEventListener('click', handleStoryPageClick);
    $('#awards-container')?.addEventListener('touchstart', handleNomineeRailTouchStart, { passive: true });
    $('#awards-container')?.addEventListener('touchend', handleNomineeRailTouchEnd, { passive: true });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openModalElement = $('.modal-backdrop:not([hidden])');
            if (openModalElement?.id === 'confirmation-modal') handleConfirmationCancel();
            else if (openModalElement) closeModal(openModalElement.id);
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

        const nomineeOption = event.target.closest('[data-nominee-option]');
        if (nomineeOption) {
            event.stopPropagation();
            toggleNomineeSelection(nomineeOption);
            return;
        }

        const nomineeStory = event.target.closest('[data-nominee-story]');
        if (nomineeStory) {
            event.stopPropagation();
            openNomineeRankModal(nomineeStory.dataset.awardId, nomineeStory.dataset.nomineeStory);
            return;
        }

        const nomineeButton = event.target.closest('[data-manage-nominees]');
        if (nomineeButton) {
            event.stopPropagation();
            openNomineeModal(nomineeButton.dataset.manageNominees);
            return;
        }

        const winnerRank = event.target.closest('[data-winner-rank]');
        if (winnerRank) {
            event.stopPropagation();
            saveWinnerRank(Number(winnerRank.dataset.winnerRank));
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
            if (event.target !== modal) return;
            if (modal.id === 'confirmation-modal') handleConfirmationCancel();
            else closeModal(modal.id);
        });
    });

    $('#prev-btn')?.addEventListener('click', () => changePage(-1));
    $('#next-btn')?.addEventListener('click', () => changePage(1));
    $('#story-form')?.addEventListener('submit', handleStorySubmit);
    $('#generate-image-prompt')?.addEventListener('click', generateImagePrompt);
    $('#copy-image-prompt')?.addEventListener('click', copyImagePrompt);
    $('#story-image-file')?.addEventListener('change', handlePostImageSelection);
    $('#upload-story-image')?.addEventListener('click', handleStoryImageUpload);
    $('#award-form')?.addEventListener('submit', handleAwardSubmit);
    $('#install-button')?.addEventListener('click', installPwa);
    updateSearchClearState();
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
    const responseText = await response.text();
    let data = {};
    if (responseText) {
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { error: responseText.trim() };
        }
    }
    if (!response.ok) {
        if (response.status === 401 && action !== 'unlock') lockApp('Your private session expired. Unlock Somniva again.');
        throw new Error(data?.error || `Somniva could not complete that request (${response.status}).`);
    }
    return data;
}

async function handleUnlock(event) {
    event.preventDefault();
    const status = $('#unlock-status');
    status.textContent = '';
    setUnlockLoading(true);
    document.body.classList.add('is-unlocking');
    showUnlockTransition(true);

    try {
        const result = await apiRequest('unlock', { password: $('#unlock-password').value });
        state.token = result.token;
        sessionStorage.setItem('somniva_token', state.token);
        setAppLoading(true);
        unlockApp();
        const collection = await apiRequest('collection');
        applyCollection(collection);
        $('#unlock-password').value = '';
    } catch (error) {
        status.textContent = error.message || 'Somniva remains hidden.';
        document.body.classList.remove('is-unlocking');
        showUnlockTransition(false);
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

function showUnlockTransition(isVisible) {
    const transition = $('#unlock-transition');
    if (!transition) return;
    window.clearTimeout(showUnlockTransition.timer);
    if (isVisible) {
        transition.hidden = false;
        transition.classList.remove('is-leaving');
        requestAnimationFrame(() => transition.classList.add('is-visible'));
        return;
    }
    transition.classList.remove('is-visible');
    transition.classList.add('is-leaving');
    showUnlockTransition.timer = window.setTimeout(() => {
        transition.hidden = true;
        transition.classList.remove('is-leaving');
    }, 620);
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
    $('#install-button').hidden = !state.deferredInstallPrompt;
    if (firstUnlock) activateHomeSection();
    $('#unlock-status').textContent = '';
    setUnlockLoading(false);
    showUnlockTransition(false);
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
    showUnlockTransition(false);
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
    state.nominees = collection.nominees || [];
    state.winners = collection.winners || [];
    hideDataStatus();
    renderAll();
    setAppLoading(false);
}

function normalizeStory(story) {
    const paragraphs = Array.isArray(story.paragraphs) ? story.paragraphs : [];
    return {
        ...story,
        page_number: Number(story.page_number),
        paragraphs,
        content: typeof story.content === 'string' ? story.content : paragraphs.join('\n\n'),
        comments: Array.isArray(story.comments) ? story.comments : [],
    };
}

async function loadCollection(showStatus = true) {
    setAppLoading(true);
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
        excerpt.textContent = storyExcerpt(recent) || 'A new dream is waiting to be read.';
        const button = document.createElement('button');
        button.className = 'text-button feature-link';
        button.type = 'button';
        button.dataset.storyLink = recent.link;
        button.textContent = 'Read full dream →';
        button.setAttribute('aria-label', `Read the full dream: ${recent.title}`);
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
        appendStoryStatusBadges(card, story, index < firstPlaces.length);
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
        group.dataset.awardId = award.id;
        const headingRow = document.createElement('div');
        headingRow.className = 'category-heading-row';
        const heading = document.createElement('h2');
        heading.className = 'category-name';
        heading.textContent = award.name;
        headingRow.append(heading);
        const description = document.createElement('p');
        description.className = 'subtitle under';
        description.textContent = award.description || 'A distinction chosen for a memorable dream.';
        const nomineeSection = document.createElement('div');
        nomineeSection.className = 'nominee-section';
        const nomineeLabel = document.createElement('div');
        nomineeLabel.className = 'nominee-section-heading';
        const nomineeTitle = document.createElement('span');
        nomineeTitle.textContent = 'NOMINEES';
        nomineeLabel.append(nomineeTitle);
        nomineeSection.append(nomineeLabel, createNomineeRail(award));
        const podium = document.createElement('div');
        podium.className = 'podium';

        [2, 1, 3].forEach((rank) => {
            const winner = state.winners.find((item) => item.award_id === award.id && Number(item.rank) === rank);
            const story = winner ? getStory(winner.story_id) : null;
            podium.append(createWinnerCard(story, rank, award.id));
        });

        group.append(headingRow, description, podium, nomineeSection);
        container.append(group);
    });
}

function getNomineesForAward(awardId) {
    return state.nominees.filter((nominee) => nominee.award_id === awardId);
}

function getNomineeStories(awardId) {
    return getNomineesForAward(awardId)
        .map((nominee) => getStory(nominee.story_id))
        .filter(Boolean);
}

function isStoryNominated(awardId, storyId) {
    return getNomineesForAward(awardId).some((nominee) => nominee.story_id === storyId);
}

function getStoryAwardStatuses(storyId) {
    return orderedAwards().flatMap((award) => {
        const winner = state.winners.find((item) => item.award_id === award.id && item.story_id === storyId);
        if (winner) return [{ award, kind: 'winner', rank: Number(winner.rank) }];
        if (isStoryNominated(award.id, storyId)) return [{ award, kind: 'nominee', rank: null }];
        return [];
    });
}

function getAwardStatusLabel(status) {
    return status.kind === 'winner' ? rankLabel(status.rank) : 'Nominee';
}

function showAwardStatusName(event) {
    event.preventDefault();
    event.stopPropagation();
    showToast(event.currentTarget.dataset.awardName);
}

function handleAwardStatusKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    showToast(event.currentTarget.dataset.awardName);
}

function createAwardStatusBadge(status, className) {
    const label = getAwardStatusLabel(status);
    const badge = document.createElement('span');
    const statusClass = status.kind === 'winner' ? `is-top-${status.rank}` : 'is-nominee';
    const accessibleLabel = `${status.award.name} · ${label}`;
    badge.className = `${className} ${statusClass}`;
    badge.dataset.awardName = status.award.name;
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', accessibleLabel);
    badge.addEventListener('click', showAwardStatusName);
    badge.addEventListener('keydown', handleAwardStatusKeydown);

    const icon = document.createElement('span');
    icon.className = 'award-status-icon';
    icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = iconMarkup[status.kind === 'winner' ? `top${status.rank}` : 'nominee'] || iconMarkup.nominee;
    icon.append(svg);
    badge.append(icon);
    return badge;
}

function appendStoryStatusBadges(container, story, isInteractive = true) {
    if (!container || !story) return;
    const statuses = getStoryAwardStatuses(story.id);
    if (!statuses.length) return;
    const stack = document.createElement('span');
    stack.className = 'story-status-badges';
    statuses.forEach((status) => stack.append(createAwardStatusBadge(status, 'story-status-badge')));
    if (!isInteractive) {
        stack.classList.add('is-decorative');
        stack.setAttribute('aria-hidden', 'true');
        stack.querySelectorAll('[role="button"]').forEach((badge) => badge.setAttribute('tabindex', '-1'));
    }
    container.append(stack);
}

function createNomineeRail(award) {
    const viewport = document.createElement('div');
    viewport.className = 'nominee-marquee-viewport marquee-viewport';
    const stories = getNomineeStories(award.id);
    if (!stories.length) {
        viewport.append(createEmptyState('Add dreams to this award to start its nominee rail.'));
        return viewport;
    }

    const track = document.createElement('div');
    track.className = 'marquee-track nominee-marquee-track is-looping';
    [...stories, ...stories].forEach((story, index) => {
        const card = document.createElement('button');
        card.className = 'marquee-card nominee-card';
        card.type = 'button';
        card.dataset.nomineeStory = story.id;
        card.dataset.awardId = award.id;
        if (index >= stories.length) {
            card.setAttribute('aria-hidden', 'true');
            card.tabIndex = -1;
        }
        const image = createStoryImage(story, 'nominee-image image-thumbnail');
        const title = document.createElement('strong');
        title.className = 'nominee-card-title';
        title.textContent = story.title;
        card.append(image, title);
        track.append(card);
    });
    viewport.append(track);
    return viewport;
}

function handleNomineeRailTouchStart(event) {
    const viewport = event.target.closest('.nominee-marquee-viewport');
    if (!viewport) return;
    state.nomineeTouchStartX = event.changedTouches[0]?.clientX || 0;
    state.nomineeTouchViewport = viewport;
    viewport.querySelector('.nominee-marquee-track')?.classList.add('is-touching');
}

function handleNomineeRailTouchEnd(event) {
    const viewport = state.nomineeTouchViewport;
    if (!viewport) return;
    const endX = event.changedTouches[0]?.clientX || 0;
    const delta = endX - state.nomineeTouchStartX;
    if (Math.abs(delta) >= 24) {
        viewport.scrollBy({ left: delta < 0 ? viewport.clientWidth * 0.72 : -viewport.clientWidth * 0.72, behavior: 'smooth' });
    }
    viewport.querySelector('.nominee-marquee-track')?.classList.remove('is-touching');
    state.nomineeTouchViewport = null;
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
        const nominees = document.createElement('button');
        nominees.className = 'award-order-action award-nominees-action';
        nominees.type = 'button';
        nominees.dataset.manageNominees = award.id;
        nominees.setAttribute('aria-label', `Manage nominees for ${award.name}`);
        nominees.title = 'Manage nominees';
        nominees.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconMarkup.nominees}</svg><span class="visually-hidden">Nominees</span>`;
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
        actions.append(nominees, edit, remove);
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

    if (story) {
        frame.append(createStoryImage(story, 'winner-image'));
    } else {
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

    card.append(frame, info);
    return card;
}

function openWinnerSlot(awardId, rank) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award || ![1, 2, 3].includes(rank)) return;
    const winner = getWinnerForSlot(awardId, rank);
    if (!winner) {
        openNomineeModal(awardId);
        return;
    }
    state.winnerSlot = { awardId, rank, storyId: winner.story_id, isNominee: false };
    $('#winner-heading').textContent = 'Podium dream';
    $('#winner-slot-label').textContent = `${award.name} · ${rankLabel(rank)} · ${award.description || 'Choose a dream for this place.'}`;
    $('#winner-form-status').textContent = '';
    renderWinnerPreview();
    openModal('winner-modal');
    $('#winner-modal-close').focus();
}

function renderWinnerPreview() {
    if (!state.winnerSlot) return;
    const story = getStory(state.winnerSlot.storyId);
    const image = $('#winner-modal-image');
    setDreamImage(image, story?.image_url, story?.title || 'Dream artwork placeholder');
    $('#winner-modal-title').textContent = story?.title || 'No dream selected';
    $('#winner-modal-link').textContent = story ? `${story.link} · ${formatDate(story.dream_date)}` : 'This place is ready for a dream.';
    $('#winner-modal-detail').innerHTML = story ? sanitizeHtml(getStoryContent(story)) : '';
    $('#winner-rank-actions').hidden = !state.winnerSlot.isNominee;
    $('#winner-clear-button').hidden = Boolean(state.winnerSlot.isNominee);
    $('#winner-clear-button').disabled = !story || state.winnerSlot.isNominee;
    $('#winner-open-story').hidden = !story;
}

function getWinnerForSlot(awardId, rank) {
    return state.winners.find((winner) => winner.award_id === awardId && Number(winner.rank) === rank);
}

function openNomineeModal(awardId, selectedStoryIds = null) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award) return;
    state.nomineeAwardId = award.id;
    state.nomineeSelection = new Set(selectedStoryIds || getNomineesForAward(award.id).map((nominee) => nominee.story_id));
    $('#nominee-heading').textContent = `Nominees for ${award.name}`;
    $('#nominee-intro').textContent = award.description || 'Select every dream that belongs in this award.';
    $('#nominee-form-status').textContent = '';
    renderNomineeGrid();
    openModal('nominee-modal');
}

function renderNomineeGrid() {
    const grid = $('#nominee-grid');
    if (!grid) return;
    grid.replaceChildren();
    const stories = sortByTitle(state.stories);
    if (!stories.length) {
        grid.append(createEmptyState('Create a dream before choosing nominees.'));
        return;
    }
    stories.forEach((story) => {
        const selected = state.nomineeSelection.has(story.id);
        const option = document.createElement('button');
        option.className = `nominee-option${selected ? ' is-selected' : ''}`;
        option.type = 'button';
        option.dataset.nomineeOption = story.id;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(selected));
        const image = createStoryImage(story, 'nominee-option-image image-thumbnail');
        const title = document.createElement('span');
        title.className = 'nominee-option-title';
        title.textContent = story.title;
        option.append(image, title);
        grid.append(option);
    });
}

function toggleNomineeSelection(option) {
    if (!state.nomineeAwardId) return;
    const storyId = option.dataset.nomineeOption;
    if (state.nomineeSelection.has(storyId)) state.nomineeSelection.delete(storyId);
    else state.nomineeSelection.add(storyId);
    option.classList.toggle('is-selected', state.nomineeSelection.has(storyId));
    option.setAttribute('aria-selected', String(state.nomineeSelection.has(storyId)));
}

function getNomineeRemovalImpact(awardId, selectedStoryIds) {
    const selected = new Set(selectedStoryIds);
    return getNomineesForAward(awardId)
        .filter((nominee) => !selected.has(nominee.story_id))
        .map((nominee) => ({
            story: getStory(nominee.story_id),
            hasWinner: state.winners.some((winner) => winner.award_id === awardId && winner.story_id === nominee.story_id),
        }))
        .filter((item) => item.hasWinner);
}

async function persistNominees(awardId, storyIds) {
    const button = $('#nominee-save-button');
    setButtonLoading(button, true);
    try {
        await apiRequest('replace-nominees', {
            award_id: awardId,
            story_ids: storyIds,
        });
        closeModal('nominee-modal');
        showToast('Nominees saved.');
        await loadCollection(false);
    } finally {
        setButtonLoading(button, false);
    }
}

async function saveNominees() {
    if (!state.nomineeAwardId) return;
    const status = $('#nominee-form-status');
    const awardId = state.nomineeAwardId;
    const storyIds = [...state.nomineeSelection];
    const impact = getNomineeRemovalImpact(awardId, storyIds);
    if (impact.length) {
        const names = impact
            .map((item) => item.story?.title || 'Untitled dream')
            .slice(0, 3)
            .join(', ');
        const extra = impact.length > 3 ? ` and ${impact.length - 3} more` : '';
        openConfirmation({
            title: 'Clear nominee data?',
            message: `${names}${extra} will lose its podium place when removed from this award.`,
            confirmLabel: 'Remove and clear',
            danger: true,
            onConfirm: () => persistNominees(awardId, storyIds),
            onCancel: () => openNomineeModal(awardId, storyIds),
        });
        return;
    }

    status.textContent = '';
    try {
        await persistNominees(awardId, storyIds);
    } catch (error) {
        status.textContent = error.message || 'Unable to save nominees.';
    }
}

function openNomineeRankModal(awardId, storyId) {
    const award = state.awards.find((item) => item.id === awardId);
    const story = getStory(storyId);
    if (!award || !story || !isStoryNominated(awardId, storyId)) return;
    state.winnerSlot = { awardId, storyId, isNominee: true };
    $('#winner-heading').textContent = 'Place nominee';
    $('#winner-slot-label').textContent = `${award.name} · Choose a podium rank`;
    $('#winner-form-status').textContent = '';
    renderWinnerPreview();
    openModal('winner-modal');
    $('#winner-rank-actions button')?.focus();
}

function openWinnerStory() {
    const story = state.winnerSlot ? getStory(state.winnerSlot.storyId) : null;
    if (!story) return;
    closeModal('winner-modal');
    goToStory(story.link);
}

async function saveWinnerRank(rank) {
    if (!state.winnerSlot?.isNominee || ![1, 2, 3].includes(rank)) return;
    const status = $('#winner-form-status');
    status.textContent = '';
    const buttons = $$('#winner-rank-actions button');
    buttons.forEach((button) => setButtonLoading(button, true));
    try {
        await apiRequest('set-winner', {
            award_id: state.winnerSlot.awardId,
            story_id: state.winnerSlot.storyId,
            rank,
        });
        closeModal('winner-modal');
        showToast('Hall of Fame updated.');
        await loadCollection(false);
    } catch (error) {
        status.textContent = error.message || 'Unable to update the podium.';
    } finally {
        buttons.forEach((button) => setButtonLoading(button, false));
    }
}

async function clearWinnerSlot() {
    if (!state.winnerSlot?.rank || !getWinnerForSlot(state.winnerSlot.awardId, state.winnerSlot.rank)) return;
    const { awardId, rank } = state.winnerSlot;
    openConfirmation({
        title: 'Clear podium place?',
        message: 'This Hall of Fame place will be empty until another nominee is selected.',
        confirmLabel: 'Clear slot',
        danger: true,
        onConfirm: async () => {
            await apiRequest('remove-winner', { award_id: awardId, rank });
            showToast('Hall of Fame place cleared.');
            await loadCollection(false);
        },
    });
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
    state.storyPages = buildStoryPages();
    if (!state.storyPages.length) {
        state.storyPageIndex = 0;
        state.storyPageNumber = null;
    } else {
        const requestedIndex = state.storyPages.findIndex(([pageNumber]) => Number(pageNumber) === Number(state.storyPageNumber));
        state.storyPageIndex = requestedIndex >= 0
            ? requestedIndex
            : Math.min(Math.max(state.storyPageIndex, 0), state.storyPages.length - 1);
        state.storyPageNumber = state.storyPages[state.storyPageIndex][0];
    }
    renderStoryPageControls();
    if (!state.stories.length) {
        container.append(createEmptyState('Dream pages will appear here.'));
        return;
    }

    const [pageNumber, stories] = state.storyPages[state.storyPageIndex] || [];
    if (!stories) {
        container.append(createEmptyState('Dream pages will appear here.'));
        return;
    }

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
}

function buildStoryPages() {
    const pages = new Map();
    [...state.stories]
        .sort((a, b) => a.page_number - b.page_number || a.link.localeCompare(b.link, undefined, { numeric: true }))
        .forEach((story) => {
            if (!pages.has(story.page_number)) pages.set(story.page_number, []);
            pages.get(story.page_number).push(story);
        });
    return [...pages.entries()].sort(([a], [b]) => a - b);
}

function renderStoryPageControls() {
    const controls = $('#story-page-controls');
    const numbers = $('#story-page-numbers');
    if (!controls || !numbers) return;
    controls.hidden = !state.storyPages.length;
    numbers.replaceChildren();
    const total = state.storyPages.length;
    if (!total) return;

    const windowStart = Math.floor(state.storyPageIndex / 10) * 10;
    state.storyPages.slice(windowStart, windowStart + 10).forEach(([pageNumber], offset) => {
        const button = document.createElement('button');
        button.className = 'story-page-number';
        button.type = 'button';
        button.dataset.storyPage = String(windowStart + offset);
        button.textContent = String(pageNumber);
        button.setAttribute('aria-label', `Open story page ${pageNumber}`);
        if (windowStart + offset === state.storyPageIndex) {
            button.classList.add('is-current');
            button.setAttribute('aria-current', 'page');
        }
        numbers.append(button);
    });
    $('#stories-prev-page').disabled = windowStart === 0;
    $('#stories-next-page').disabled = windowStart + 10 >= total;
}

function handleStoryPageClick(event) {
    const button = event.target.closest('[data-story-page]');
    if (!button) return;
    const index = Number(button.dataset.storyPage);
    if (!Number.isInteger(index)) return;
    state.storyPageIndex = index;
    state.storyPageNumber = state.storyPages[index]?.[0] ?? state.storyPageNumber;
    renderStories();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function changeStoryPage(direction) {
    const windowStart = Math.floor(state.storyPageIndex / 10) * 10;
    const nextIndex = windowStart + direction * 10;
    if (nextIndex < 0 || nextIndex >= state.storyPages.length) return;
    state.storyPageIndex = nextIndex;
    state.storyPageNumber = state.storyPages[nextIndex][0];
    renderStories();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectStoryPage(pageNumber) {
    const index = state.storyPages.findIndex(([number]) => Number(number) === Number(pageNumber));
    if (index < 0) return;
    state.storyPageIndex = index;
    state.storyPageNumber = state.storyPages[index][0];
    renderStories();
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
        createStoryToolButton('comment', 'Add comment', 'commentStory', story.id, 'comment-tool'),
        createStoryToolButton('edit', 'Edit story', 'editStory', story.id, 'edit-tool'),
        createStoryToolButton('delete', 'Delete story', 'deleteStory', story.id, 'delete-tool'),
    );
    topLine.append(storyLabel, actions);

    const picture = document.createElement('div');
    picture.className = `pic${story.image_path ? '' : ' has-no-image'}`;
    picture.append(createStoryImage(story, 'story-image'));
    appendStoryStatusBadges(picture, story);
    const title = document.createElement('h1');
    title.textContent = story.title;
    const date = document.createElement('h3');
    date.textContent = formatDate(story.dream_date);
    const content = document.createElement('div');
    content.className = 'story-content';
    content.id = `${story.link}-content`;
    content.innerHTML = sanitizeHtml(getStoryContent(story));

    article.append(topLine, picture, title, date);
    article.append(content);
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
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.setAttribute('fetchpriority', 'low');
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

async function handleStorySubmit(event) {
    event.preventDefault();
    const status = $('#story-form-status');
    const title = $('#story-title').value.trim();
    const dreamDate = $('#story-date').value;
    const content = $('#story-content').value;

    if (!title || !dreamDate || !content.trim()) {
        status.textContent = 'Add a title, date, and dream content.';
        return;
    }

    const editing = state.editingStory;
    status.textContent = '';
    const submitButton = $('#story-form button[type="submit"]');
    setButtonLoading(submitButton, true);
    const payload = {
        ...(editing ? { story_id: editing.id } : {}),
        title,
        dream_date: dreamDate,
        paragraphs: [content],
    };

    let saved;
    try {
        saved = await apiRequest(editing ? 'update-story' : 'save-story', payload);
    } catch (error) {
        status.textContent = error.message || (editing ? 'Unable to update the dream.' : 'Unable to create the dream.');
        setButtonLoading(submitButton, false);
        return;
    }

    resetStoryModal();
    closeModal('story-modal');
    showToast(editing ? 'Dream updated.' : `Dream created as ${saved?.link || 'a new page'}.`);
    try {
        await loadCollection(false);
        const savedStory = state.stories.find((story) => story.id === saved?.id)
            || state.stories.find((story) => story.link === saved?.link);
        if (savedStory) {
            if (Number.isFinite(Number(saved?.page_number))) selectStoryPage(saved.page_number);
            goToStory(savedStory.link);
        }
    } catch (error) {
        showToast(error.message || 'Dream saved. Refresh the dreambook to see it.');
    } finally {
        setButtonLoading(submitButton, false);
    }
}

async function handleAwardSubmit(event) {
    event.preventDefault();
    const status = $('#award-form-status');
    const submitButton = $('#award-form button[type="submit"]');
    const editing = state.editingAward;
    status.textContent = '';
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
    const comment = $('#comment-text').value;
    if (!date || !comment.trim()) {
        status.textContent = 'Add a date and comment first.';
        return;
    }
    status.textContent = '';
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

function deleteStory(storyId) {
    const story = getStory(storyId);
    if (!story) return;
    openConfirmation({
        title: 'Delete this dream?',
        message: `"${story.title}" will be permanently removed from the mystery.`,
        confirmLabel: 'Delete dream',
        danger: true,
        onConfirm: async () => {
            await apiRequest('delete-story', { story_id: story.id });
            showToast('Dream deleted.');
            await loadCollection(false);
        },
    });
}

function deleteAward(awardId) {
    const award = state.awards.find((item) => item.id === awardId);
    if (!award) return;
    openConfirmation({
        title: 'Delete this award?',
        message: `"${award.name}" and its nominees and winners will be permanently removed.`,
        confirmLabel: 'Delete award',
        danger: true,
        onConfirm: async () => {
            await apiRequest('delete-award', { award_id: award.id });
            showToast('Award, nominees, and winners deleted.');
            await loadCollection(false);
        },
    });
}

function deleteComment(storyId, commentIndex) {
    const story = getStory(storyId);
    const comment = story?.comments?.[commentIndex];
    if (!story || !comment) return;
    openConfirmation({
        title: 'Delete this comment?',
        message: 'This note will be permanently removed from the dream.',
        confirmLabel: 'Delete comment',
        danger: true,
        onConfirm: async () => {
            await apiRequest('delete-story-comment', { story_id: story.id, comment_index: commentIndex });
            showToast('Comment deleted.');
            await loadCollection(false);
        },
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
    const content = plainText(getStoryContent(story))
        .slice(0, 3000);
    return `${fixedImageStyle}\n\nDream title: ${title}\nDream scene and details: ${content || 'A mysterious dream scene with symbolic details.'}\n\nComposition: focus on the most memorable visual moment from the dream, balanced focal subject, immersive environment, and a 16:9 landscape frame. Lighting and time: default to a soft morning atmosphere unless the storyline clearly establishes another time of day, which must override the default.`;
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
    status.textContent = '';
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
    $('#story-content').value = getStoryContent(story);
    $('#story-modal-kicker').textContent = 'Owner workspace';
    $('#story-modal-heading').textContent = 'Edit dream';
    $('#story-modal-intro').textContent = 'Refine the title, date, or content while the dreambook renumbers itself by date.';
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
    $('#story-form-status').textContent = '';
    setDefaultDate();
}

function openConfirmation({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel = null }) {
    state.confirmationAction = onConfirm;
    state.confirmationCancel = onCancel;
    $('#confirmation-heading').textContent = title;
    $('#confirmation-message').textContent = message;
    $('#confirmation-confirm').textContent = confirmLabel;
    $('#confirmation-confirm').classList.toggle('danger-button', danger);
    $('#confirmation-status').textContent = '';
    openModal('confirmation-modal');
    $('#confirmation-cancel').focus();
}

function handleConfirmationCancel() {
    const action = state.confirmationCancel;
    closeModal('confirmation-modal');
    if (typeof action === 'function') action();
}

async function handleConfirmationConfirm() {
    const action = state.confirmationAction;
    if (typeof action !== 'function') {
        closeModal('confirmation-modal');
        return;
    }
    const button = $('#confirmation-confirm');
    const status = $('#confirmation-status');
    setButtonLoading(button, true);
    status.textContent = '';
    try {
        await action();
        closeModal('confirmation-modal');
    } catch (error) {
        status.textContent = error.message || 'Unable to complete that action.';
    } finally {
        setButtonLoading(button, false);
    }
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
    if (id === 'comment-modal') {
        state.commentStory = null;
        state.editingComment = null;
    }
    if (id === 'award-modal') state.editingAward = null;
    if (id === 'prompt-modal') state.promptStory = null;
    if (id === 'winner-modal') state.winnerSlot = null;
    if (id === 'nominee-modal') {
        state.nomineeAwardId = null;
        state.nomineeSelection = new Set();
    }
    if (id === 'confirmation-modal') {
        state.confirmationAction = null;
        state.confirmationCancel = null;
    }
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
    state.commentStory = null;
    state.editingComment = null;
    state.editingAward = null;
    state.promptStory = null;
    state.imageStory = null;
    state.editingStory = null;
    state.winnerSlot = null;
    state.nomineeAwardId = null;
    state.nomineeSelection = new Set();
    state.confirmationAction = null;
    state.confirmationCancel = null;
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
    const story = state.stories.find((item) => item.link === link || item.id === link);
    if (story) {
        selectStoryPage(story.page_number);
        link = story.link;
    }
    showSection('stories-section');
    window.setTimeout(() => {
        const storyElement = document.getElementById(link);
        if (!storyElement) return;
        const target = Number.isInteger(paragraphIndex) && paragraphIndex >= 0
            ? document.getElementById(`${link}-content`) || storyElement
            : storyElement;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target !== storyElement) {
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
    updateSearchClearState();
    renderSearchResults();
}

function handleSearchSubmit(event) {
    event.preventDefault();
    state.searchQuery = $('#story-search-input').value.trim();
    updateSearchClearState();
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
    updateSearchClearState();
    hideSearchResults();
}

function updateSearchClearState() {
    const input = $('#story-search-input');
    const form = $('#story-search-form');
    const clear = $('#story-search-clear');
    if (!input || !form || !clear) return;
    const hasQuery = Boolean(input.value);
    form.classList.toggle('has-query', hasQuery);
    clear.disabled = !hasQuery;
    clear.tabIndex = hasQuery ? 0 : -1;
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
        const text = plainText(getStoryContent(story));
        const matchIndex = text.toLocaleLowerCase().indexOf(needle);
        if (matchIndex >= 0) results.push({ story, paragraphIndex: 0, snippet: sentenceAroundMatch(text, matchIndex) });
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

function getStoryContent(story) {
    if (!story) return '';
    if (typeof story.content === 'string') return story.content;
    return Array.isArray(story.paragraphs) ? story.paragraphs.join('\n\n') : '';
}

function storyExcerpt(story, maxLength = 220) {
    const text = plainText(getStoryContent(story)).replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    const clipped = text.slice(0, maxLength - 1).replace(/\s+\S*$/, '').trim();
    return `${clipped || text.slice(0, maxLength - 1).trim()}...`;
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
