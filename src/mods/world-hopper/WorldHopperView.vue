<template>
    <div class="wh-viewport">
        <!-- Ambient Glowing Background Elements -->
        <div class="wh-ambient-blob blob-1"></div>
        <div class="wh-ambient-blob blob-2"></div>
        <div class="wh-ambient-blob blob-3"></div>

        <div class="wh-container">
            <!-- Top Header Bar -->
            <header class="wh-header">
                <div class="wh-title-group">
                    <div class="wh-icon-badge">
                        <i class="ri-planet-line"></i>
                    </div>
                    <div>
                        <div class="wh-title-row">
                            <h2 class="wh-title">World Hopper & Route Planner</h2>
                            <span class="wh-version-badge">v1.2</span>
                        </div>
                        <p class="wh-subtitle">Manage, sequence and hop through your VRChat world playlist</p>
                    </div>
                </div>

                <div class="wh-header-actions">
                    <div class="wh-action-btns">
                        <button
                            v-if="visitedCount > 0"
                            class="wh-btn wh-btn--ghost"
                            title="Remove visited worlds from route"
                            @click="handleClearVisited">
                            <i class="ri-delete-bin-7-line"></i>
                            <span>Clear Visited ({{ visitedCount }})</span>
                        </button>

                        <button
                            v-if="playlist.length > 0"
                            class="wh-btn wh-btn--ghost-danger"
                            title="Clear all worlds from route"
                            @click="handleClearAll">
                            <i class="ri-delete-bin-line"></i>
                            <span>Clear All</span>
                        </button>

                        <button
                            v-if="playlist.length > 0"
                            class="wh-btn wh-btn--glass"
                            title="Export playlist to JSON file"
                            @click="exportPlaylistJson">
                            <i class="ri-download-2-line"></i>
                            <span>Export</span>
                        </button>

                        <button class="wh-btn wh-btn--accent" title="Load sample VRChat worlds" @click="loadSampleWorlds">
                            <i class="ri-sparkles-line"></i>
                            <span>Sample Route</span>
                        </button>
                    </div>
                </div>
            </header>

            <!-- KPI Glass Stats Grid -->
            <div class="wh-kpi-grid">
                <div class="wh-kpi-card wh-kpi-card--violet">
                    <div class="wh-kpi-header">
                        <span class="wh-kpi-title">Total in Queue</span>
                        <div class="wh-kpi-icon"><i class="ri-stack-line"></i></div>
                    </div>
                    <div class="wh-kpi-value">{{ totalCount }}</div>
                    <div class="wh-kpi-footer">
                        <span class="wh-badge wh-badge--violet">Route</span>
                        <span class="wh-kpi-subtext">{{ pendingCount }} pending hop(s)</span>
                    </div>
                </div>

                <div class="wh-kpi-card wh-kpi-card--cyan">
                    <div class="wh-kpi-header">
                        <span class="wh-kpi-title">Pending Hops</span>
                        <div class="wh-kpi-icon"><i class="ri-time-line"></i></div>
                    </div>
                    <div class="wh-kpi-value">{{ pendingCount }}</div>
                    <div class="wh-kpi-footer">
                        <span class="wh-badge wh-badge--cyan">Upcoming</span>
                        <span class="wh-kpi-subtext">Ready to join</span>
                    </div>
                </div>

                <div class="wh-kpi-card wh-kpi-card--emerald">
                    <div class="wh-kpi-header">
                        <span class="wh-kpi-title">Visited Worlds</span>
                        <div class="wh-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
                    </div>
                    <div class="wh-kpi-value">{{ visitedCount }}</div>
                    <div class="wh-kpi-footer">
                        <div class="wh-progress-bar-wrap">
                            <div class="wh-progress-bar" :style="{ width: completionPercent + '%' }"></div>
                        </div>
                        <span class="wh-kpi-subtext">{{ completionPercent }}% done</span>
                    </div>
                </div>

                <div class="wh-kpi-card wh-kpi-card--amber" :class="{ 'wh-kpi-card--active-target': nextDestination }">
                    <div class="wh-kpi-header">
                        <span class="wh-kpi-title">Next Destination</span>
                        <div class="wh-kpi-icon"><i class="ri-compass-3-line"></i></div>
                    </div>
                    <div class="wh-kpi-value wh-kpi-value--small truncate">
                        {{ nextDestination ? (nextDestination.name || nextDestination.location) : 'No destination' }}
                    </div>
                    <div class="wh-kpi-footer">
                        <button
                            v-if="nextDestination"
                            class="wh-kpi-join-btn"
                            @click="handleMockJoin(nextDestination)">
                            <i class="ri-flight-takeoff-line"></i> Join Next
                        </button>
                        <span v-else class="wh-kpi-subtext">Add worlds below</span>
                    </div>
                </div>
            </div>

            <!-- Add World Form Glass Panel -->
            <div class="wh-glass-panel wh-add-panel">
                <div class="wh-panel-header">
                    <div class="wh-panel-title-group">
                        <i class="ri-add-circle-line panel-icon"></i>
                        <div>
                            <h3 class="wh-panel-title">Add World to Route</h3>
                            <p class="wh-panel-hint">Supports World ID (wrld_...), location tags, or VRChat launch URLs</p>
                        </div>
                    </div>

                    <!-- Quick Preset Chips -->
                    <div class="wh-quick-presets">
                        <span class="preset-label">Quick Add:</span>
                        <button
                            v-for="preset in quickPresets"
                            :key="preset.location"
                            type="button"
                            class="wh-chip-btn"
                            @click="handleQuickAdd(preset)">
                            <i class="ri-add-line"></i> {{ preset.name }}
                        </button>
                    </div>
                </div>

                <form class="wh-add-form" @submit.prevent="handleAddWorld">
                    <div class="wh-form-grid">
                        <div class="wh-input-group wh-input-group--flex2">
                            <label class="wh-label">World ID / Location Tag / Launch URL *</label>
                            <div class="wh-input-wrapper">
                                <i class="ri-global-line input-icon"></i>
                                <input
                                    v-model="newInput.location"
                                    type="text"
                                    placeholder="e.g. wrld_6f7f4cb9-2a3d... or https://vrchat.com/home/launch?..."
                                    class="wh-input"
                                    required />
                                <span v-if="parsedPreview.isValid" class="wh-input-badge wh-input-badge--valid">
                                    <i class="ri-check-line"></i> Valid ID
                                </span>
                            </div>
                        </div>

                        <div class="wh-input-group">
                            <label class="wh-label">World Title (Optional)</label>
                            <div class="wh-input-wrapper">
                                <i class="ri-bookmark-line input-icon"></i>
                                <input
                                    v-model="newInput.name"
                                    type="text"
                                    placeholder="e.g. The Black Cat, Chill Room..."
                                    class="wh-input" />
                            </div>
                        </div>

                        <div class="wh-input-group">
                            <label class="wh-label">Note / Purpose (Optional)</label>
                            <div class="wh-input-wrapper">
                                <i class="ri-sticky-note-line input-icon"></i>
                                <input
                                    v-model="newInput.note"
                                    type="text"
                                    placeholder="e.g. Meet Alex, test avatar..."
                                    class="wh-input" />
                            </div>
                        </div>

                        <div class="wh-form-submit">
                            <button type="submit" class="wh-btn wh-btn--primary wh-btn--lg" :disabled="!newInput.location.trim()">
                                <i class="ri-add-line"></i>
                                <span>Add World</span>
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <!-- Filter & Search Controls Bar -->
            <div class="wh-controls-bar">
                <div class="wh-controls-left">
                    <div class="wh-seg">
                        <button
                            class="wh-seg-btn"
                            :class="{ 'wh-seg-btn--active': statusFilter === 'all' }"
                            @click="statusFilter = 'all'">
                            All ({{ totalCount }})
                        </button>
                        <button
                            class="wh-seg-btn"
                            :class="{ 'wh-seg-btn--active': statusFilter === 'pending' }"
                            @click="statusFilter = 'pending'">
                            Pending ({{ pendingCount }})
                        </button>
                        <button
                            class="wh-seg-btn"
                            :class="{ 'wh-seg-btn--active': statusFilter === 'visited' }"
                            @click="statusFilter = 'visited'">
                            Visited ({{ visitedCount }})
                        </button>
                    </div>

                    <div class="wh-view-toggle">
                        <button
                            class="wh-view-btn"
                            :class="{ 'wh-view-btn--active': viewMode === 'timeline' }"
                            title="Timeline Route View"
                            @click="viewMode = 'timeline'">
                            <i class="ri-route-line"></i> Timeline
                        </button>
                        <button
                            class="wh-view-btn"
                            :class="{ 'wh-view-btn--active': viewMode === 'grid' }"
                            title="Grid Cards View"
                            @click="viewMode = 'grid'">
                            <i class="ri-layout-grid-line"></i> Grid
                        </button>
                    </div>
                </div>

                <div class="wh-search-box">
                    <i class="ri-search-line search-icon"></i>
                    <input
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search route by name, ID or notes..."
                        class="wh-input wh-input--search" />
                    <button v-if="searchQuery" class="wh-clear-search" @click="searchQuery = ''">✕</button>
                </div>
            </div>

            <!-- Main Playlist Content Area -->
            <div class="wh-scroll-content">
                <div v-if="filteredList.length === 0" class="wh-empty-state wh-glass-panel">
                    <div class="wh-empty-icon"><i class="ri-map-pin-user-line"></i></div>
                    <h4 class="wh-empty-title">No worlds in this view</h4>
                    <p class="wh-empty-desc">
                        {{ searchQuery ? 'No worlds matched your search filter.' : 'Your route playlist is currently empty. Add a world ID above or click Sample Route.' }}
                    </p>
                    <button v-if="!searchQuery && playlist.length === 0" class="wh-btn wh-btn--primary" @click="loadSampleWorlds">
                        <i class="ri-sparkles-line"></i> Load Sample Route
                    </button>
                </div>

                <!-- Timeline Route View -->
                <div v-else-if="viewMode === 'timeline'" class="wh-timeline-container">
                    <div
                        v-for="(item, index) in filteredList"
                        :key="item.id"
                        class="wh-timeline-row"
                        :class="{
                            'wh-timeline-row--visited': item.status === 'visited',
                            'wh-timeline-row--next': item.id === (nextDestination && nextDestination.id)
                        }">
                        <!-- Timeline Node Connector -->
                        <div class="wh-timeline-node">
                            <div
                                class="wh-node-circle"
                                :class="{
                                    'wh-node-circle--visited': item.status === 'visited',
                                    'wh-node-circle--next': item.id === (nextDestination && nextDestination.id)
                                }">
                                <i v-if="item.status === 'visited'" class="ri-check-line"></i>
                                <span v-else>{{ index + 1 }}</span>
                            </div>
                            <div v-if="index < filteredList.length - 1" class="wh-node-line"></div>
                        </div>

                        <!-- Timeline Glass Card -->
                        <div class="wh-card wh-card--timeline">
                            <div class="wh-card-header">
                                <div class="wh-card-badge-group">
                                    <span class="wh-rank-badge" :class="{ 'wh-rank-badge--next': item.id === (nextDestination && nextDestination.id) }">
                                        Hop #{{ index + 1 }}
                                    </span>
                                    <span
                                        class="wh-status-badge"
                                        :class="item.status === 'visited' ? 'wh-status-badge--visited' : 'wh-status-badge--pending'">
                                        <span class="status-dot"></span>
                                        {{ item.status === 'visited' ? 'Visited' : 'Pending' }}
                                    </span>
                                    <span v-if="item.id === (nextDestination && nextDestination.id)" class="wh-next-badge">
                                        🚀 Next Target
                                    </span>
                                </div>

                                <div class="wh-card-quick-actions">
                                    <button
                                        class="wh-icon-btn"
                                        title="Move Up"
                                        :disabled="index === 0"
                                        @click="moveUp(index)">
                                        <i class="ri-arrow-up-s-line"></i>
                                    </button>
                                    <button
                                        class="wh-icon-btn"
                                        title="Move Down"
                                        :disabled="index === filteredList.length - 1"
                                        @click="moveDown(index)">
                                        <i class="ri-arrow-down-s-line"></i>
                                    </button>
                                    <button
                                        class="wh-icon-btn wh-icon-btn--danger"
                                        title="Delete from route"
                                        @click="handleDeleteItem(item.id)">
                                        <i class="ri-delete-bin-line"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="wh-card-body">
                                <div class="wh-card-main-info">
                                    <h4 class="wh-card-title" :title="item.name || item.location">
                                        {{ item.name || getFallbackName(item) }}
                                    </h4>
                                    <div class="wh-card-location">
                                        <code class="wh-tag" :title="item.location">{{ item.location }}</code>
                                        <button
                                            class="wh-copy-btn"
                                            title="Copy location ID"
                                            @click="copyToClipboard(item.location)">
                                            <i class="ri-file-copy-line"></i>
                                        </button>
                                    </div>
                                </div>

                                <p v-if="item.note" class="wh-card-note">
                                    <i class="ri-sticky-note-line"></i> {{ item.note }}
                                </p>
                            </div>

                            <div class="wh-card-actions">
                                <button
                                    class="wh-btn wh-btn--join"
                                    title="Join world (mock join)"
                                    @click="handleMockJoin(item)">
                                    <i class="ri-flight-takeoff-line"></i>
                                    <span>Join World</span>
                                </button>

                                <button
                                    class="wh-btn wh-btn--sm"
                                    :class="item.status === 'visited' ? 'wh-btn--visited-toggle' : 'wh-btn--pending-toggle'"
                                    :title="item.status === 'visited' ? 'Mark as Pending' : 'Mark as Visited'"
                                    @click="toggleStatus(item)">
                                    <i :class="item.status === 'visited' ? 'ri-refresh-line' : 'ri-check-line'"></i>
                                    <span>{{ item.status === 'visited' ? 'Mark Pending' : 'Mark Visited' }}</span>
                                </button>

                                <button
                                    class="wh-btn wh-btn--ghost-sm"
                                    title="Open VRCX World Dialog"
                                    @click="openWorldDialog(item.location || item.worldId)">
                                    <i class="ri-external-link-line"></i>
                                    <span>Dialog</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Grid Card View -->
                <div v-else class="wh-playlist-grid">
                    <div
                        v-for="(item, index) in filteredList"
                        :key="item.id"
                        class="wh-card"
                        :class="{
                            'wh-card--visited': item.status === 'visited',
                            'wh-card--next': item.id === (nextDestination && nextDestination.id)
                        }">
                        <div class="wh-card-header">
                            <div class="wh-card-badge-group">
                                <span class="wh-rank-badge" :class="{ 'wh-rank-badge--next': item.id === (nextDestination && nextDestination.id) }">
                                    #{{ index + 1 }}
                                </span>
                                <span
                                    class="wh-status-badge"
                                    :class="item.status === 'visited' ? 'wh-status-badge--visited' : 'wh-status-badge--pending'">
                                    <span class="status-dot"></span>
                                    {{ item.status === 'visited' ? 'Visited' : 'Pending' }}
                                </span>
                                <span v-if="item.id === (nextDestination && nextDestination.id)" class="wh-next-badge">
                                    🚀 Next Target
                                </span>
                            </div>

                            <div class="wh-card-quick-actions">
                                <button
                                    class="wh-icon-btn"
                                    title="Move Up"
                                    :disabled="index === 0"
                                    @click="moveUp(index)">
                                    <i class="ri-arrow-up-s-line"></i>
                                </button>
                                <button
                                    class="wh-icon-btn"
                                    title="Move Down"
                                    :disabled="index === filteredList.length - 1"
                                    @click="moveDown(index)">
                                    <i class="ri-arrow-down-s-line"></i>
                                </button>
                                <button
                                    class="wh-icon-btn wh-icon-btn--danger"
                                    title="Delete item"
                                    @click="handleDeleteItem(item.id)">
                                    <i class="ri-delete-bin-line"></i>
                                </button>
                            </div>
                        </div>

                        <div class="wh-card-body">
                            <h4 class="wh-card-title truncate" :title="item.name || item.location">
                                {{ item.name || getFallbackName(item) }}
                            </h4>
                            <div class="wh-card-location">
                                <code class="wh-tag" :title="item.location">{{ item.location }}</code>
                                <button
                                    class="wh-copy-btn"
                                    title="Copy location ID"
                                    @click="copyToClipboard(item.location)">
                                    <i class="ri-file-copy-line"></i>
                                </button>
                            </div>

                            <p v-if="item.note" class="wh-card-note">
                                <i class="ri-sticky-note-line"></i> {{ item.note }}
                            </p>
                        </div>

                        <div class="wh-card-actions wh-card-actions--column">
                            <button
                                class="wh-btn wh-btn--join wh-btn--full"
                                title="Join world (mock join)"
                                @click="handleMockJoin(item)">
                                <i class="ri-flight-takeoff-line"></i>
                                <span>Join World</span>
                            </button>

                            <div class="wh-card-sub-actions">
                                <button
                                    class="wh-btn wh-btn--sm wh-btn--flex"
                                    :class="item.status === 'visited' ? 'wh-btn--visited-toggle' : 'wh-btn--pending-toggle'"
                                    :title="item.status === 'visited' ? 'Mark as Pending' : 'Mark as Visited'"
                                    @click="toggleStatus(item)">
                                    <i :class="item.status === 'visited' ? 'ri-refresh-line' : 'ri-check-line'"></i>
                                    <span>{{ item.status === 'visited' ? 'Pending' : 'Visited' }}</span>
                                </button>

                                <button
                                    class="wh-btn wh-btn--sm wh-btn--ghost-sm"
                                    title="VRCX World Dialog"
                                    @click="openWorldDialog(item.location || item.worldId)">
                                    <i class="ri-external-link-line"></i>
                                    <span>Dialog</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Mock Join Modal Dialog Overlay -->
        <Teleport to="body">
            <div v-if="joiningModal.show" class="wh-modal-overlay" @click.self="closeJoinModal">
                <div class="wh-modal-card">
                    <div class="wh-modal-header">
                        <div class="wh-modal-icon-badge">
                            <i class="ri-rocket-2-line"></i>
                        </div>
                        <div>
                            <h3 class="wh-modal-title">Joining World Instance</h3>
                            <p class="wh-modal-subtitle">{{ joiningModal.item?.name || joiningModal.item?.location }}</p>
                        </div>
                    </div>

                    <div class="wh-modal-body">
                        <div class="wh-join-step-indicator">
                            <div class="wh-join-step" :class="{ 'wh-join-step--done': joiningModal.step >= 1, 'wh-join-step--active': joiningModal.step === 1 }">
                                <div class="step-icon"><i class="ri-search-2-line"></i></div>
                                <span>Resolving Instance</span>
                            </div>
                            <div class="step-divider"></div>
                            <div class="wh-join-step" :class="{ 'wh-join-step--done': joiningModal.step >= 2, 'wh-join-step--active': joiningModal.step === 2 }">
                                <div class="step-icon"><i class="ri-gamepad-line"></i></div>
                                <span>Launching Client</span>
                            </div>
                            <div class="step-divider"></div>
                            <div class="wh-join-step" :class="{ 'wh-join-step--done': joiningModal.step >= 3, 'wh-join-step--active': joiningModal.step === 3 }">
                                <div class="step-icon"><i class="ri-checkbox-circle-line"></i></div>
                                <span>Joined!</span>
                            </div>
                        </div>

                        <div class="wh-modal-location-box">
                            <span class="box-label">Target Location Tag:</span>
                            <code>{{ joiningModal.item?.location }}</code>
                        </div>

                        <div class="wh-join-status-message">
                            <i v-if="joiningModal.step < 3" class="ri-loader-4-line spin-icon"></i>
                            <i v-else class="ri-sparkles-fill success-icon"></i>
                            <span>{{ joiningModal.statusText }}</span>
                        </div>
                    </div>

                    <div class="wh-modal-footer">
                        <button
                            v-if="joiningModal.step === 3"
                            class="wh-btn wh-btn--primary wh-btn--lg"
                            @click="confirmJoinSuccess">
                            <i class="ri-check-double-line"></i> Mark Visited & Close
                        </button>
                        <button
                            v-else
                            class="wh-btn wh-btn--ghost"
                            @click="closeJoinModal">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Toast Notification -->
        <Transition name="toast-fade">
            <div v-if="toastMessage" class="wh-toast">
                <i class="ri-information-fill toast-icon"></i>
                <span>{{ toastMessage }}</span>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { clearPlaylist, deletePlaylistItem, getPlaylist, savePlaylistItem, updatePlaylistOrder } from './db';
import { createPlaylistItem, filterPlaylist, parseWorldInput, reorderItems } from './engine';
import { getCtx } from './runtime';

const playlist = ref([]);
const searchQuery = ref('');
const statusFilter = ref('all');
const viewMode = ref('timeline');

const newInput = ref({
    location: '',
    name: '',
    note: ''
});

const quickPresets = [
    { location: 'wrld_6f7f4cb9-2a3d-4a11-b4c6-2c5e53303d8f', name: 'The Black Cat', note: 'Popular hangout spot' },
    { location: 'wrld_4432ea9b-729c-46e3-8eaf-846aa0a37fdd', name: 'Midnight Rooftop', note: 'Relaxing ambient world' },
    { location: 'wrld_d682443a-7a56-42d8-bf08-59c941320349', name: 'Great Pug', note: 'Classic pub world' },
    { location: 'wrld_5b89c79e-c340-4210-812b-eeddc7e096f9', name: 'Jar Square', note: 'Avatar showcase & hangout' }
];

// Toast notification state
const toastMessage = ref('');
let toastTimer = null;

function showToast(msg) {
    toastMessage.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toastMessage.value = '';
    }, 3000);
}

function copyToClipboard(text) {
    if (!text) return;
    if (navigator && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied location tag to clipboard!');
        }).catch(() => {
            showToast(`Location: ${text}`);
        });
    } else {
        showToast(`Location: ${text}`);
    }
}

// Mock Join Modal state & handlers
const joiningModal = ref({
    show: false,
    item: null,
    step: 1,
    statusText: ''
});
let joinTimer = null;

function handleMockJoin(item) {
    if (!item) return;

    // Try calling host UI dialog if present, otherwise launch interactive mock join modal
    try {
        const ctx = getCtx();
        if (ctx && ctx.ui && ctx.ui.showWorldDialog) {
            ctx.ui.showWorldDialog(item.location || item.worldId);
        }
    } catch {
        // use fallback mock join simulation
    }

    joiningModal.value = {
        show: true,
        item,
        step: 1,
        statusText: 'Connecting to VRChat API & validating instance...'
    };

    if (joinTimer) clearTimeout(joinTimer);

    joinTimer = setTimeout(() => {
        joiningModal.value.step = 2;
        joiningModal.value.statusText = 'Dispatched vrchat://launch request to game client...';

        joinTimer = setTimeout(() => {
            joiningModal.value.step = 3;
            joiningModal.value.statusText = 'Successfully connected to world instance!';
        }, 1100);
    }, 900);
}

function confirmJoinSuccess() {
    if (joiningModal.value.item) {
        if (joiningModal.value.item.status !== 'visited') {
            toggleStatus(joiningModal.value.item);
        }
        showToast(`Joined "${joiningModal.value.item.name || 'world'}" and marked as visited!`);
    }
    closeJoinModal();
}

function closeJoinModal() {
    if (joinTimer) clearTimeout(joinTimer);
    joiningModal.value.show = false;
}

// Computed properties
const parsedPreview = computed(() => parseWorldInput(newInput.value.location));
const totalCount = computed(() => playlist.value.length);
const visitedCount = computed(() => playlist.value.filter((i) => i.status === 'visited').length);
const pendingCount = computed(() => playlist.value.filter((i) => i.status === 'pending').length);

const completionPercent = computed(() => {
    if (totalCount.value === 0) return 0;
    return Math.round((visitedCount.value / totalCount.value) * 100);
});

const nextDestination = computed(() => {
    return playlist.value.find((i) => i.status === 'pending') || null;
});

const filteredList = computed(() => {
    return filterPlaylist(playlist.value, {
        searchQuery: searchQuery.value,
        statusFilter: statusFilter.value
    });
});

// Helper functions
function getFallbackName(item) {
    if (!item) return 'Unnamed World';
    const parsed = parseWorldInput(item.location);
    if (parsed.instanceId) {
        return `Instance ${parsed.instanceId.split('~')[0]}`;
    }
    return item.worldId || item.location || 'World';
}

function openWorldDialog(location) {
    if (!location) return;
    try {
        const ctx = getCtx();
        if (ctx && ctx.ui && ctx.ui.showWorldDialog) {
            ctx.ui.showWorldDialog(location);
        } else {
            showToast(`VRCX Dialog target: ${location}`);
        }
    } catch (err) {
        console.error('[world-hopper] failed to open world dialog:', err);
        showToast(`Target Location: ${location}`);
    }
}

function handleQuickAdd(preset) {
    newInput.value = {
        location: preset.location,
        name: preset.name,
        note: preset.note
    };
    handleAddWorld();
}

// Playlist Actions
async function loadPlaylistFromDb() {
    try {
        const ctx = getCtx();
        const items = await getPlaylist(ctx);
        if (Array.isArray(items) && items.length > 0) {
            playlist.value = items;
        }
    } catch (err) {
        console.warn('[world-hopper] DB query failed or table not ready, using in-memory playlist:', err);
    }
}

async function handleAddWorld() {
    if (!newInput.value.location.trim()) return;

    const newItem = createPlaylistItem({
        location: newInput.value.location,
        name: newInput.value.name,
        note: newInput.value.note,
        status: 'pending',
        orderIndex: playlist.value.length
    });

    // Try resolving world name via VRCX API if name was not provided
    if (!newItem.name) {
        try {
            const ctx = getCtx();
            if (ctx && ctx.api && ctx.api.getWorldName) {
                const resolvedName = await ctx.api.getWorldName(newItem.location);
                if (resolvedName) {
                    newItem.name = resolvedName;
                }
            }
        } catch {
            // ignore resolve error
        }
    }

    playlist.value.push(newItem);
    showToast('Added world to route!');

    // Reset input fields
    newInput.value = { location: '', name: '', note: '' };

    // Persist to DB
    try {
        const ctx = getCtx();
        await savePlaylistItem(ctx, newItem);
    } catch (err) {
        console.warn('[world-hopper] failed to persist item:', err);
    }
}

async function toggleStatus(item) {
    const newStatus = item.status === 'visited' ? 'pending' : 'visited';
    item.status = newStatus;

    try {
        const ctx = getCtx();
        await savePlaylistItem(ctx, item);
    } catch (err) {
        console.warn('[world-hopper] failed to update status:', err);
    }
}

async function handleDeleteItem(itemId) {
    playlist.value = playlist.value.filter((i) => i.id !== itemId);
    showToast('Removed world from route');
    try {
        const ctx = getCtx();
        await deletePlaylistItem(ctx, itemId);
    } catch (err) {
        console.warn('[world-hopper] failed to delete item:', err);
    }
}

async function moveUp(index) {
    if (index <= 0) return;
    playlist.value = reorderItems(playlist.value, index, index - 1);
    await syncOrderToDb();
}

async function moveDown(index) {
    if (index >= playlist.value.length - 1) return;
    playlist.value = reorderItems(playlist.value, index, index + 1);
    await syncOrderToDb();
}

async function syncOrderToDb() {
    try {
        const ctx = getCtx();
        await updatePlaylistOrder(ctx, playlist.value);
    } catch (err) {
        console.warn('[world-hopper] failed to sync order:', err);
    }
}

async function handleClearVisited() {
    playlist.value = playlist.value.filter((i) => i.status !== 'visited');
    showToast('Cleared visited worlds');
    try {
        const ctx = getCtx();
        await clearPlaylist(ctx, 'visited');
    } catch (err) {
        console.warn('[world-hopper] failed to clear visited:', err);
    }
}

async function handleClearAll() {
    if (!confirm('Are you sure you want to clear all worlds from your route?')) return;
    playlist.value = [];
    showToast('Cleared route playlist');
    try {
        const ctx = getCtx();
        await clearPlaylist(ctx, 'all');
    } catch (err) {
        console.warn('[world-hopper] failed to clear all:', err);
    }
}

function loadSampleWorlds() {
    const samples = [
        { location: 'wrld_6f7f4cb9-2a3d-4a11-b4c6-2c5e53303d8f', name: 'The Black Cat', note: 'Popular hangout spot' },
        { location: 'wrld_4432ea9b-729c-46e3-8eaf-846aa0a37fdd', name: 'Midnight Rooftop', note: 'Relaxing ambient world' },
        { location: 'wrld_d682443a-7a56-42d8-bf08-59c941320349', name: 'Great Pug', note: 'Classic pub world' },
        { location: 'wrld_5b89c79e-c340-4210-812b-eeddc7e096f9', name: 'Jar Square', note: 'Avatar showcase & hangout' }
    ];

    let addedCount = 0;
    for (const s of samples) {
        if (!playlist.value.some((p) => p.location === s.location)) {
            const item = createPlaylistItem({
                location: s.location,
                name: s.name,
                note: s.note,
                status: 'pending',
                orderIndex: playlist.value.length
            });
            playlist.value.push(item);
            addedCount++;
            try {
                const ctx = getCtx();
                void savePlaylistItem(ctx, item);
            } catch {
                // ignore DB sync in sample batch
            }
        }
    }
    if (addedCount > 0) {
        showToast(`Loaded ${addedCount} sample worlds!`);
    } else {
        showToast('Sample worlds already in playlist');
    }
}

function exportPlaylistJson() {
    const jsonStr = JSON.stringify(playlist.value, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `world-hopper-route-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported route to JSON!');
}

onMounted(() => {
    void loadPlaylistFromDb();
});
</script>

<style scoped>
.wh-viewport {
    position: relative;
    width: 100%;
    height: 100%;
    background: #090d16;
    overflow: hidden;
}

/* Ambient Animated Blobs */
.wh-ambient-blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.18;
    pointer-events: none;
    animation: ambient-float 18s ease-in-out infinite alternate;
}

.blob-1 {
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, #6366f1, #4f46e5);
    top: -100px;
    left: -100px;
}

.blob-2 {
    width: 450px;
    height: 450px;
    background: radial-gradient(circle, #06b6d4, #0891b2);
    bottom: -150px;
    right: -100px;
    animation-delay: -6s;
}

.blob-3 {
    width: 350px;
    height: 350px;
    background: radial-gradient(circle, #a855f7, #7c3aed);
    top: 40%;
    left: 45%;
    animation-delay: -12s;
}

@keyframes ambient-float {
    0% {
        transform: translate(0, 0) scale(1);
    }
    50% {
        transform: translate(30px, 40px) scale(1.1);
    }
    100% {
        transform: translate(-20px, -20px) scale(0.95);
    }
}

.wh-container {
    position: relative;
    z-index: 10;
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    height: 100vh;
    overflow-y: auto;
    color: #f8fafc;
    font-family: 'Inter', sans-serif;
}

.wh-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.wh-title-group {
    display: flex;
    align-items: center;
    gap: 16px;
}

.wh-icon-badge {
    background: linear-gradient(135deg, #6366f1, #3b82f6);
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
}

.wh-title-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.wh-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
}

.wh-version-badge {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}

.wh-subtitle {
    margin: 4px 0 0 0;
    color: #94a3b8;
    font-size: 14px;
}

.wh-action-btns {
    display: flex;
    gap: 12px;
}

.wh-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.wh-btn--ghost {
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
}
.wh-btn--ghost:hover {
    background: rgba(255, 255, 255, 0.1);
}

.wh-btn--ghost-danger {
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
}
.wh-btn--ghost-danger:hover {
    background: rgba(239, 68, 68, 0.2);
}

.wh-btn--glass {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.wh-btn--glass:hover {
    background: rgba(255, 255, 255, 0.2);
}

.wh-btn--accent {
    background: #6366f1;
    color: #fff;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}
.wh-btn--accent:hover {
    background: #4f46e5;
}

.wh-kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
}

.wh-kpi-card {
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 20px;
    position: relative;
    overflow: hidden;
}

.wh-kpi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #94a3b8;
    font-size: 14px;
    font-weight: 600;
}

.wh-kpi-icon {
    font-size: 20px;
    opacity: 0.8;
}

.wh-kpi-value {
    font-size: 32px;
    font-weight: 800;
    margin: 12px 0;
    color: #fff;
}

.wh-kpi-footer {
    display: flex;
    align-items: center;
    gap: 8px;
}

.wh-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 700;
}

.wh-badge--violet { background: rgba(139, 92, 246, 0.2); color: #c4b5fd; }
.wh-badge--cyan { background: rgba(6, 182, 212, 0.2); color: #67e8f9; }
.wh-badge--emerald { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
.wh-badge--rose { background: rgba(244, 63, 94, 0.2); color: #fda4af; }

.wh-kpi-card--violet { border-bottom: 3px solid #8b5cf6; }
.wh-kpi-card--cyan { border-bottom: 3px solid #06b6d4; }
.wh-kpi-card--emerald { border-bottom: 3px solid #10b981; }
.wh-kpi-card--rose { border-bottom: 3px solid #f43f5e; }

.wh-kpi-subtext {
    font-size: 12px;
    color: #94a3b8;
}

.wh-progress-bar-wrap {
    flex: 1;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
}

.wh-progress-bar {
    height: 100%;
    background: #10b981;
    transition: width 0.3s ease;
}

.wh-target-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    margin: 8px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.wh-empty-target {
    font-size: 18px;
    font-weight: 600;
    color: #64748b;
    margin: 8px 0;
}

.wh-target-actions {
    margin-top: 12px;
}
.wh-btn--full {
    width: 100%;
    justify-content: center;
}

.wh-main-content {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 24px;
    flex: 1;
    min-height: 0;
}

.wh-panel {
    background: rgba(15, 23, 42, 0.4);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
}

.wh-panel-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    font-size: 18px;
    font-weight: 700;
}

.wh-form-grid {
    display: flex;
    gap: 16px;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-top: 16px;
}
.wh-form-submit {
    flex-shrink: 0;
    margin-bottom: 16px;
}
.wh-input-group {
    margin-bottom: 16px;
}
.wh-input-group--flex2 {
    flex: 2;
}
.wh-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 8px;
}
.wh-input-wrapper {
    position: relative;
}
.input-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #64748b;
}
.wh-input {
    width: 100%;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 10px 10px 36px;
    color: #fff;
    font-family: inherit;
    transition: all 0.2s;
    box-sizing: border-box;
}
.wh-input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(0, 0, 0, 0.4);
}

.wh-status-badge {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
}
.wh-status-badge.valid { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
.wh-status-badge.invalid { background: rgba(244, 63, 94, 0.2); color: #fda4af; }

.wh-quick-presets {
    margin-top: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}
.preset-label {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    margin-right: 4px;
}
.wh-chip-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 12px;
    color: #cbd5e1;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.wh-chip-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

.wh-panel-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}
.wh-segments {
    display: flex;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 4px;
}
.wh-seg-btn {
    background: transparent;
    border: none;
    padding: 6px 12px;
    color: #94a3b8;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
}
.wh-seg-btn.active {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}
.wh-view-toggles {
    display: flex;
    gap: 8px;
}
.wh-icon-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 4px;
    font-size: 18px;
}
.wh-icon-btn.active {
    color: #6366f1;
}

.wh-search-bar {
    margin-bottom: 20px;
}

.wh-list-container {
    flex: 1;
    overflow-y: auto;
    padding-right: 8px;
}
.wh-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #64748b;
    text-align: center;
}
.wh-empty-state i {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

/* Timeline Mode */
.wh-timeline {
    position: relative;
    padding-left: 32px;
}
.wh-timeline::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.05);
}
.wh-timeline-item {
    position: relative;
    margin-bottom: 24px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px;
}
.wh-timeline-item.is-visited {
    opacity: 0.6;
}
.wh-timeline-node {
    position: absolute;
    left: -32px;
    top: 24px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #1e293b;
    border: 2px solid #334155;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 800;
    z-index: 2;
}
.wh-timeline-item.is-visited .wh-timeline-node {
    background: #10b981;
    border-color: #10b981;
    color: #fff;
}
.wh-item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}
.wh-item-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 4px;
}
.wh-item-id {
    font-size: 12px;
    color: #64748b;
    font-family: monospace;
}
.wh-item-actions {
    display: flex;
    gap: 4px;
}
.wh-item-actions button {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
}
.wh-item-actions button:hover {
    color: #fff;
}
.wh-item-actions .delete:hover {
    color: #ef4444;
}
.wh-item-body {
    background: rgba(0, 0, 0, 0.2);
    padding: 12px;
    border-radius: 8px;
    font-size: 14px;
    color: #cbd5e1;
}

/* Grid Mode */
.wh-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
}
.wh-grid-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
}
.wh-grid-card.is-visited {
    opacity: 0.6;
}

/* Modal / Overlay */
.wh-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}
.wh-modal {
    background: #0f172a;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 32px;
    width: 400px;
    text-align: center;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
}
.wh-modal-icon {
    font-size: 48px;
    color: #6366f1;
    margin-bottom: 16px;
}
.wh-modal-icon.spin {
    animation: spin 2s linear infinite;
}
@keyframes spin { 100% { transform: rotate(360deg); } }
.wh-modal h3 {
    font-size: 24px;
    margin: 0 0 8px 0;
}
.wh-modal p {
    color: #94a3b8;
    margin-bottom: 24px;
}

.wh-toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.wh-toast {
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
    animation: slide-up 0.3s ease-out;
}
@keyframes slide-up {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
}
</style>
