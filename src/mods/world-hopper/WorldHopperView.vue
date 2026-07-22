<template>
    <div class="wh-container">
        <!-- Top Header Bar -->
        <header class="wh-header">
            <div class="wh-title-group">
                <div class="wh-icon-badge">
                    <i class="ri-route-line"></i>
                </div>
                <div>
                    <h2 class="wh-title">World Hopper & Route Planner</h2>
                    <p class="wh-subtitle">Manage your VRChat world hopping queue and visit playlist</p>
                </div>
            </div>

            <div class="wh-header-actions">
                <div class="wh-action-btns">
                    <button
                        v-if="visitedCount > 0"
                        class="wh-btn wh-btn--ghost"
                        title="Visited-Welten entfernen"
                        @click="handleClearVisited">
                        <i class="ri-delete-bin-7-line"></i>
                        <span>Erledigte löschen</span>
                    </button>

                    <button
                        v-if="playlist.length > 0"
                        class="wh-btn wh-btn--ghost-danger"
                        title="Alle Welten aus der Liste entfernen"
                        @click="handleClearAll">
                        <i class="ri-delete-bin-line"></i>
                        <span>Alle leeren</span>
                    </button>

                    <button
                        v-if="playlist.length > 0"
                        class="wh-btn"
                        title="Playlist als JSON exportieren"
                        @click="exportPlaylistJson">
                        <i class="ri-download-2-line"></i>
                        <span>Export</span>
                    </button>

                    <button class="wh-btn wh-btn--primary" title="Musterwelten laden" @click="loadSampleWorlds">
                        <i class="ri-magic-line"></i>
                        <span>Beispiel-Welten</span>
                    </button>
                </div>
            </div>
        </header>

        <!-- KPI Glass Stats Grid -->
        <div class="wh-kpi-grid">
            <div class="wh-kpi-card wh-kpi-card--violet">
                <div class="wh-kpi-header">
                    <span class="wh-kpi-title">Gesamt in Queue</span>
                    <div class="wh-kpi-icon"><i class="ri-stack-line"></i></div>
                </div>
                <div class="wh-kpi-value">{{ totalCount }}</div>
                <div class="wh-kpi-footer">
                    <span class="wh-badge wh-badge--violet">Playlist</span>
                    <span class="wh-kpi-subtext">{{ pendingCount }} verbleibend</span>
                </div>
            </div>

            <div class="wh-kpi-card wh-kpi-card--cyan">
                <div class="wh-kpi-header">
                    <span class="wh-kpi-title">Ausstehend</span>
                    <div class="wh-kpi-icon"><i class="ri-time-line"></i></div>
                </div>
                <div class="wh-kpi-value">{{ pendingCount }}</div>
                <div class="wh-kpi-footer">
                    <span class="wh-badge wh-badge--cyan">Offen</span>
                    <span class="wh-kpi-subtext">Bereit zum Besuchen</span>
                </div>
            </div>

            <div class="wh-kpi-card wh-kpi-card--emerald">
                <div class="wh-kpi-header">
                    <span class="wh-kpi-title">Besucht</span>
                    <div class="wh-kpi-icon"><i class="ri-checkbox-circle-line"></i></div>
                </div>
                <div class="wh-kpi-value">{{ visitedCount }}</div>
                <div class="wh-kpi-footer">
                    <span class="wh-badge wh-badge--emerald">Erledigt</span>
                    <span class="wh-kpi-subtext">{{ completionPercent }}% Fortschritt</span>
                </div>
            </div>

            <div class="wh-kpi-card wh-kpi-card--amber">
                <div class="wh-kpi-header">
                    <span class="wh-kpi-title">Nächstes Ziel</span>
                    <div class="wh-kpi-icon"><i class="ri-compass-3-line"></i></div>
                </div>
                <div class="wh-kpi-value wh-kpi-value--small truncate">
                    {{ nextDestination ? (nextDestination.name || nextDestination.location) : 'Kein Ziel' }}
                </div>
                <div class="wh-kpi-footer">
                    <button
                        v-if="nextDestination"
                        class="wh-kpi-link-btn"
                        @click="openWorldDialog(nextDestination.location || nextDestination.worldId)">
                        <i class="ri-external-link-line"></i> Jetzt beitreten
                    </button>
                    <span v-else class="wh-kpi-subtext">Füge Welten hinzu</span>
                </div>
            </div>
        </div>

        <!-- Add World Form Panel -->
        <div class="wh-glass-panel wh-add-panel">
            <div class="wh-panel-header">
                <h3 class="wh-panel-title">
                    <i class="ri-add-circle-line"></i> Welt zur Route hinzufügen
                </h3>
                <span class="wh-panel-hint">
                    Unterstützt World-ID, Location-Tag (wrld_xxx:12345) oder VRChat Launch-Links
                </span>
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
                                placeholder="e.g. wrld_12345678-abcd... oder https://vrchat.com/home/launch?..."
                                class="wh-input"
                                required />
                        </div>
                    </div>

                    <div class="wh-input-group">
                        <label class="wh-label">Name / Titel (Optional)</label>
                        <div class="wh-input-wrapper">
                            <i class="ri-bookmark-line input-icon"></i>
                            <input
                                v-model="newInput.name"
                                type="text"
                                placeholder="z. B. The Black Cat, Chill Room..."
                                class="wh-input" />
                        </div>
                    </div>

                    <div class="wh-input-group">
                        <label class="wh-label">Notiz / Zweck (Optional)</label>
                        <div class="wh-input-wrapper">
                            <i class="ri-sticky-note-line input-icon"></i>
                            <input
                                v-model="newInput.note"
                                type="text"
                                placeholder="z. B. Treffen mit Alex, Avatar testen..."
                                class="wh-input" />
                        </div>
                    </div>

                    <div class="wh-form-submit">
                        <button type="submit" class="wh-btn wh-btn--primary wh-btn--lg" :disabled="!newInput.location.trim()">
                            <i class="ri-add-line"></i>
                            <span>Hinzufügen</span>
                        </button>
                    </div>
                </div>
            </form>
        </div>

        <!-- Filter & Search Controls -->
        <div class="wh-controls-bar">
            <div class="wh-seg">
                <button
                    class="wh-seg-btn"
                    :class="{ 'wh-seg-btn--active': statusFilter === 'all' }"
                    @click="statusFilter = 'all'">
                    Alle ({{ totalCount }})
                </button>
                <button
                    class="wh-seg-btn"
                    :class="{ 'wh-seg-btn--active': statusFilter === 'pending' }"
                    @click="statusFilter = 'pending'">
                    Ausstehend ({{ pendingCount }})
                </button>
                <button
                    class="wh-seg-btn"
                    :class="{ 'wh-seg-btn--active': statusFilter === 'visited' }"
                    @click="statusFilter = 'visited'">
                    Besucht ({{ visitedCount }})
                </button>
            </div>

            <div class="wh-search-box">
                <i class="ri-search-line search-icon"></i>
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Route durchsuchen..."
                    class="wh-input wh-input--search" />
                <button v-if="searchQuery" class="wh-clear-search" @click="searchQuery = ''">✕</button>
            </div>
        </div>

        <!-- Main Playlist List Area -->
        <div class="wh-scroll-content">
            <div v-if="filteredList.length === 0" class="wh-empty-state wh-glass-panel">
                <div class="wh-empty-icon"><i class="ri-map-pin-user-line"></i></div>
                <h4 class="wh-empty-title">Keine Welten in dieser Ansicht</h4>
                <p class="wh-empty-desc">
                    {{ searchQuery ? 'Keine Treffer für deine Suchanfrage.' : 'Deine Route ist aktuell leer. Füge oben eine World ID hinzu oder lade Musterwelten.' }}
                </p>
                <button v-if="!searchQuery && playlist.length === 0" class="wh-btn wh-btn--primary" @click="loadSampleWorlds">
                    <i class="ri-sparkles-line"></i> Musterwelten laden
                </button>
            </div>

            <div v-else class="wh-playlist-grid">
                <div
                    v-for="(item, index) in filteredList"
                    :key="item.id"
                    class="wh-card"
                    :class="{
                        'wh-card--visited': item.status === 'visited',
                        'wh-card--next': item.id === (nextDestination && nextDestination.id)
                    }">
                    <!-- Card Top Info -->
                    <div class="wh-card-header">
                        <div class="wh-card-badge-group">
                            <span class="wh-rank-badge" :class="{ 'wh-rank-badge--next': item.id === (nextDestination && nextDestination.id) }">
                                #{{ index + 1 }}
                            </span>
                            <span
                                class="wh-status-badge"
                                :class="item.status === 'visited' ? 'wh-status-badge--visited' : 'wh-status-badge--pending'">
                                <i :class="item.status === 'visited' ? 'ri-checkbox-circle-fill' : 'ri-time-fill'"></i>
                                {{ item.status === 'visited' ? 'Besucht' : 'Ausstehend' }}
                            </span>
                            <span v-if="item.id === (nextDestination && nextDestination.id)" class="wh-next-badge">
                                🚀 Nächstes Ziel
                            </span>
                        </div>

                        <!-- Card Reorder & Delete -->
                        <div class="wh-card-quick-actions">
                            <button
                                class="wh-icon-btn"
                                title="Nach oben verschieben"
                                :disabled="index === 0"
                                @click="moveUp(index)">
                                <i class="ri-arrow-up-s-line"></i>
                            </button>
                            <button
                                class="wh-icon-btn"
                                title="Nach unten verschieben"
                                :disabled="index === filteredList.length - 1"
                                @click="moveDown(index)">
                                <i class="ri-arrow-down-s-line"></i>
                            </button>
                            <button
                                class="wh-icon-btn wh-icon-btn--danger"
                                title="Aus Route entfernen"
                                @click="handleDeleteItem(item.id)">
                                <i class="ri-delete-bin-line"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Card Body -->
                    <div class="wh-card-body">
                        <h4 class="wh-card-title truncate" :title="item.name || item.location">
                            {{ item.name || getFallbackName(item) }}
                        </h4>
                        <div class="wh-card-location">
                            <code class="wh-tag" :title="item.location">{{ item.location }}</code>
                        </div>

                        <p v-if="item.note" class="wh-card-note">
                            <i class="ri-sticky-note-line"></i> {{ item.note }}
                        </p>
                    </div>

                    <!-- Card Actions Bar -->
                    <div class="wh-card-actions">
                        <button
                            class="wh-btn wh-btn--primary wh-btn--sm wh-btn--full"
                            title="Öffnet VRCX World Dialog (Join / Portal)"
                            @click="openWorldDialog(item.location || item.worldId)">
                            <i class="ri-flight-takeoff-line"></i>
                            <span>Beitreten / Dialog</span>
                        </button>

                        <button
                            class="wh-btn wh-btn--sm"
                            :class="item.status === 'visited' ? 'wh-btn--visited-toggle' : 'wh-btn--pending-toggle'"
                            :title="item.status === 'visited' ? 'Als ausstehend markieren' : 'Als besucht markieren'"
                            @click="toggleStatus(item)">
                            <i :class="item.status === 'visited' ? 'ri-refresh-line' : 'ri-check-line'"></i>
                            <span>{{ item.status === 'visited' ? 'Als Ausstehend' : 'Als Besucht' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
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

const newInput = ref({
    location: '',
    name: '',
    note: ''
});

// Computed properties
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
    if (!item) return 'Unbenannte Welt';
    const parsed = parseWorldInput(item.location);
    if (parsed.instanceId) {
        return `Instance ${parsed.instanceId.split('~')[0]}`;
    }
    return item.worldId || item.location || 'Welt';
}

function openWorldDialog(location) {
    if (!location) return;
    try {
        const ctx = getCtx();
        if (ctx && ctx.ui && ctx.ui.showWorldDialog) {
            ctx.ui.showWorldDialog(location);
        } else {
            console.log('[world-hopper] showWorldDialog call fallback for:', location);
        }
    } catch (err) {
        console.error('[world-hopper] failed to open world dialog:', err);
    }
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
    try {
        const ctx = getCtx();
        await clearPlaylist(ctx, 'visited');
    } catch (err) {
        console.warn('[world-hopper] failed to clear visited:', err);
    }
}

async function handleClearAll() {
    if (!confirm('Möchtest du wirklich alle Welten aus der Route löschen?')) return;
    playlist.value = [];
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
        { location: 'wrld_d682443a-7a56-42d8-bf08-59c941320349', name: 'Great Pug', note: 'Classic pub world' }
    ];

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
            try {
                const ctx = getCtx();
                void savePlaylistItem(ctx, item);
            } catch {
                // ignore DB sync in sample batch
            }
        }
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
}

onMounted(() => {
    void loadPlaylistFromDb();
});
</script>

<style scoped>
.wh-container {
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-sizing: border-box;
    overflow-y: auto;
    color: #f1f5f9;
    font-family: inherit;
}

/* Header Bar */
.wh-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
}

.wh-title-group {
    display: flex;
    align-items: center;
    gap: 14px;
}

.wh-icon-badge {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #ffffff;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
}

.wh-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.wh-subtitle {
    margin: 2px 0 0 0;
    font-size: 13px;
    color: #94a3b8;
}

.wh-header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.wh-action-btns {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

/* Buttons */
.wh-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(30, 41, 59, 0.7);
    color: #e2e8f0;
    backdrop-filter: blur(8px);
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.wh-btn:hover {
    background: rgba(51, 65, 85, 0.9);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-1px);
}

.wh-btn--primary {
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    border: none;
    color: #ffffff;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);
}

.wh-btn--primary:hover {
    background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
    box-shadow: 0 6px 16px rgba(79, 70, 229, 0.45);
}

.wh-btn--ghost {
    background: transparent;
    border-color: rgba(148, 163, 184, 0.2);
    color: #94a3b8;
}

.wh-btn--ghost:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
}

.wh-btn--ghost-danger {
    background: transparent;
    border-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
}

.wh-btn--ghost-danger:hover {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
}

.wh-btn--sm {
    padding: 6px 10px;
    font-size: 12px;
    border-radius: 8px;
}

.wh-btn--lg {
    padding: 10px 18px;
    font-size: 14px;
    border-radius: 12px;
}

.wh-btn--full {
    width: 100%;
}

.wh-btn--pending-toggle {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
}

.wh-btn--pending-toggle:hover {
    background: rgba(16, 185, 129, 0.25);
}

.wh-btn--visited-toggle {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.3);
}

.wh-btn--visited-toggle:hover {
    background: rgba(245, 158, 11, 0.25);
}

.wh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
}

/* KPI Cards Grid */
.wh-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
}

.wh-kpi-card {
    position: relative;
    border-radius: 16px;
    padding: 16px;
    background: rgba(15, 23, 42, 0.65);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
}

.wh-kpi-card--violet {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.65) 100%);
    border-color: rgba(99, 102, 241, 0.25);
}

.wh-kpi-card--cyan {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(15, 23, 42, 0.65) 100%);
    border-color: rgba(6, 182, 212, 0.25);
}

.wh-kpi-card--emerald {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.65) 100%);
    border-color: rgba(16, 185, 129, 0.25);
}

.wh-kpi-card--amber {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(15, 23, 42, 0.65) 100%);
    border-color: rgba(245, 158, 11, 0.25);
}

.wh-kpi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.wh-kpi-title {
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
}

.wh-kpi-icon {
    font-size: 18px;
    color: #cbd5e1;
}

.wh-kpi-value {
    font-size: 26px;
    font-weight: 700;
    color: #f8fafc;
}

.wh-kpi-value--small {
    font-size: 16px;
    font-weight: 600;
}

.wh-kpi-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: auto;
}

.wh-kpi-subtext {
    font-size: 12px;
    color: #64748b;
}

.wh-kpi-link-btn {
    background: none;
    border: none;
    padding: 0;
    color: #fbbf24;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.wh-kpi-link-btn:hover {
    text-decoration: underline;
}

.wh-badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
}

.wh-badge--violet {
    background: rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
}

.wh-badge--cyan {
    background: rgba(6, 182, 212, 0.2);
    color: #67e8f9;
}

.wh-badge--emerald {
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
}

/* Glass Panels */
.wh-glass-panel {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.wh-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 8px;
}

.wh-panel-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #e2e8f0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.wh-panel-hint {
    font-size: 12px;
    color: #64748b;
}

/* Form Styles */
.wh-add-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.wh-form-grid {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-end;
}

.wh-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 180px;
}

.wh-input-group--flex2 {
    flex: 2;
    min-width: 260px;
}

.wh-label {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
}

.wh-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 12px;
    color: #64748b;
    font-size: 16px;
    pointer-events: none;
}

.wh-input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #f8fafc;
    font-size: 13px;
    outline: none;
    transition: all 0.2s ease;
    box-sizing: border-box;
}

.wh-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.25);
    background: rgba(30, 41, 59, 0.95);
}

.wh-input--search {
    padding-left: 36px;
}

.wh-form-submit {
    display: flex;
    align-items: flex-end;
}

/* Controls & Filter Bar */
.wh-controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.wh-seg {
    display: flex;
    background: rgba(30, 41, 59, 0.7);
    padding: 3px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
}

.wh-seg-btn {
    background: transparent;
    border: none;
    padding: 6px 14px;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s ease;
}

.wh-seg-btn--active {
    background: #6366f1;
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}

.wh-search-box {
    position: relative;
    min-width: 220px;
    display: flex;
    align-items: center;
}

.wh-clear-search {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 12px;
}

/* Playlist Cards Grid */
.wh-playlist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
}

.wh-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.wh-card:hover {
    transform: translateY(-2px);
    border-color: rgba(99, 102, 241, 0.3);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}

.wh-card--next {
    border-color: rgba(245, 158, 11, 0.5);
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.65) 100%);
    box-shadow: 0 4px 24px rgba(245, 158, 11, 0.15);
}

.wh-card--visited {
    opacity: 0.75;
    background: rgba(15, 23, 42, 0.4);
}

.wh-card--visited:hover {
    opacity: 0.95;
}

.wh-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.wh-card-badge-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.wh-rank-badge {
    background: rgba(51, 65, 85, 0.8);
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 6px;
}

.wh-rank-badge--next {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: #ffffff;
}

.wh-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 6px;
}

.wh-status-badge--pending {
    background: rgba(6, 182, 212, 0.15);
    color: #22d3ee;
}

.wh-status-badge--visited {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
}

.wh-next-badge {
    font-size: 11px;
    font-weight: 600;
    color: #fbbf24;
}

.wh-card-quick-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.wh-icon-btn {
    background: transparent;
    border: none;
    color: #64748b;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
}

.wh-icon-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
}

.wh-icon-btn--danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
}

.wh-icon-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.wh-card-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.wh-card-title {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
}

.wh-card-location {
    display: flex;
    align-items: center;
}

.wh-tag {
    font-family: monospace;
    font-size: 11px;
    background: rgba(30, 41, 59, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 3px 8px;
    border-radius: 6px;
    color: #a5b4fc;
    word-break: break-all;
}

.wh-card-note {
    margin: 4px 0 0 0;
    font-size: 12px;
    color: #94a3b8;
    background: rgba(30, 41, 59, 0.5);
    padding: 6px 10px;
    border-radius: 8px;
    border-left: 3px solid #6366f1;
}

.wh-card-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
}

/* Empty State */
.wh-empty-state {
    text-align: center;
    padding: 40px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.wh-empty-icon {
    font-size: 44px;
    color: #475569;
}

.wh-empty-title {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: #cbd5e1;
}

.wh-empty-desc {
    margin: 0;
    font-size: 13px;
    color: #64748b;
    max-width: 400px;
}

.truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
