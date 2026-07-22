<template>
    <div class="pa-container">
        <!-- Mod Header -->
        <div class="pa-header">
            <div class="pa-header-title">
                <div class="pa-icon-wrapper">
                    <i class="ri-history-line pa-header-icon"></i>
                </div>
                <div>
                    <h2 class="pa-title">Profile History Archiver</h2>
                    <p class="pa-subtitle">Chronological record of bio, status, and profile changes</p>
                </div>
            </div>

            <div class="pa-header-actions">
                <button
                    class="pa-btn pa-btn-secondary"
                    :disabled="isBackfilling"
                    title="Sync and import historical records from core VRCX feed tables"
                    @click="runBackfill">
                    <i :class="['ri-refresh-line', { 'pa-spin': isBackfilling }]"></i>
                    <span>{{ isBackfilling ? 'Syncing...' : 'Sync Feed History' }}</span>
                </button>
            </div>
        </div>

        <!-- Search & Friend Selector -->
        <div class="pa-search-section">
            <div class="pa-search-wrapper">
                <i class="ri-search-line pa-search-icon"></i>
                <input
                    v-model="searchQuery"
                    type="text"
                    class="pa-search-input"
                    placeholder="Enter User ID (usr_...) or search friend by display name..."
                    @focus="dropdownOpen = true"
                    @input="onSearchInput" />
                <button
                    v-if="searchQuery || selectedUserId"
                    class="pa-search-clear"
                    title="Clear search"
                    @click="clearSelection">
                    <i class="ri-close-line"></i>
                </button>
            </div>

            <!-- Search Dropdown Popup -->
            <div v-if="dropdownOpen && filteredFriends.length > 0" class="pa-dropdown">
                <div
                    v-for="friend in filteredFriends"
                    :key="friend.id"
                    class="pa-dropdown-item"
                    :class="{ 'pa-dropdown-item--selected': friend.id === selectedUserId }"
                    @click="selectFriend(friend)">
                    <img
                        v-if="friend.avatarUrl"
                        :src="friend.avatarUrl"
                        class="pa-dropdown-avatar"
                        alt="avatar" />
                    <div v-else class="pa-dropdown-avatar-placeholder">
                        <i class="ri-user-3-line"></i>
                    </div>

                    <div class="pa-dropdown-info">
                        <div class="pa-dropdown-name">
                            <span>{{ friend.displayName }}</span>
                            <span
                                class="pa-status-dot"
                                :class="'pa-status-' + friend.status"></span>
                        </div>
                        <div class="pa-dropdown-id">{{ friend.id }}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Friend Selection Chips -->
        <div v-if="friendsList.length > 0" class="pa-quick-chips">
            <span class="pa-quick-label">Quick select:</span>
            <button
                v-for="friend in friendsList.slice(0, 6)"
                :key="friend.id"
                class="pa-chip"
                :class="{ 'pa-chip--active': friend.id === selectedUserId }"
                @click="selectFriend(friend)">
                <span class="pa-status-dot" :class="'pa-status-' + friend.status"></span>
                <span>{{ friend.displayName }}</span>
            </button>
        </div>

        <!-- User Info Card (When a user is selected) -->
        <div v-if="selectedUserObj || selectedUserId" class="pa-user-card">
            <div class="pa-user-card-body">
                <img
                    v-if="selectedUserObj?.avatarUrl"
                    :src="selectedUserObj.avatarUrl"
                    class="pa-user-avatar"
                    alt="user avatar" />
                <div v-else class="pa-user-avatar-placeholder">
                    <i class="ri-user-3-line"></i>
                </div>

                <div class="pa-user-details">
                    <div class="pa-user-name-row">
                        <h3 class="pa-user-name">
                            {{ selectedUserObj?.displayName || currentDisplayName || selectedUserId }}
                        </h3>
                        <span
                            v-if="selectedUserObj?.status"
                            class="pa-badge pa-status-badge"
                            :class="'pa-status-bg-' + selectedUserObj.status">
                            {{ selectedUserObj.status }}
                        </span>
                    </div>
                    <div class="pa-user-id-row">
                        <span class="pa-user-id">{{ selectedUserId }}</span>
                        <button
                            class="pa-link-btn"
                            title="Open in VRCX User Profile"
                            @click="openUserProfile(selectedUserId)">
                            <i class="ri-external-link-line"></i>
                            <span>View Profile</span>
                        </button>
                    </div>
                </div>

                <div class="pa-user-stats">
                    <div class="pa-stat-box">
                        <span class="pa-stat-num">{{ timelineItems.length }}</span>
                        <span class="pa-stat-label">Snapshots</span>
                    </div>
                </div>
            </div>

            <!-- Timeline Filter Bar -->
            <div class="pa-filter-bar">
                <div class="pa-filter-tabs">
                    <button
                        class="pa-filter-btn"
                        :class="{ 'pa-filter-btn--active': filterType === 'all' }"
                        @click="filterType = 'all'">
                        All Updates ({{ timelineItems.length }})
                    </button>
                    <button
                        class="pa-filter-btn"
                        :class="{ 'pa-filter-btn--active': filterType === 'bio' }"
                        @click="filterType = 'bio'">
                        <i class="ri-file-text-line"></i>
                        Bio Updates ({{ bioCount }})
                    </button>
                    <button
                        class="pa-filter-btn"
                        :class="{ 'pa-filter-btn--active': filterType === 'status' }"
                        @click="filterType = 'status'">
                        <i class="ri-user-status-line"></i>
                        Status Updates ({{ statusCount }})
                    </button>
                </div>

                <button
                    class="pa-sort-btn"
                    title="Toggle Sort Order"
                    @click="sortOrder = sortOrder === 'desc' ? 'asc' : 'desc'">
                    <i :class="sortOrder === 'desc' ? 'ri-sort-desc' : 'ri-sort-asc'"></i>
                    <span>{{ sortOrder === 'desc' ? 'Newest First' : 'Oldest First' }}</span>
                </button>
            </div>
        </div>

        <!-- Main Timeline View -->
        <div class="pa-timeline-wrapper">
            <!-- Loading State -->
            <div v-if="loading" class="pa-state-card pa-state-loading">
                <div class="pa-spinner"></div>
                <p>Loading timeline history...</p>
            </div>

            <!-- Initial Prompt State (No User Selected) -->
            <div v-else-if="!selectedUserId" class="pa-state-card">
                <div class="pa-state-icon">
                    <i class="ri-history-line"></i>
                </div>
                <h3>Select a User to View History</h3>
                <p>Choose a friend from the quick selector above or search by User ID to view their bio and status change history timeline.</p>
            </div>

            <!-- Empty History State -->
            <div v-else-if="processedTimeline.length === 0" class="pa-state-card">
                <div class="pa-state-icon">
                    <i class="ri-inbox-line"></i>
                </div>
                <h3>No History Snapshots Found</h3>
                <p>No bio or status changes have been recorded yet for this user.</p>
                <button class="pa-btn pa-btn-primary" style="margin-top: 12px" @click="runBackfill">
                    <i class="ri-refresh-line"></i>
                    <span>Sync Feed History</span>
                </button>
            </div>

            <!-- Vertical Timeline Cards -->
            <div v-else class="pa-timeline">
                <div
                    v-for="(item, index) in processedTimeline"
                    :key="item.id || index"
                    class="pa-timeline-item">
                    <!-- Timeline Node Glow Marker -->
                    <div
                        class="pa-timeline-node"
                        :class="'pa-node-' + item.category">
                        <i :class="item.icon"></i>
                    </div>

                    <!-- Timeline Glassmorphic Card -->
                    <div class="pa-timeline-card">
                        <!-- Card Header -->
                        <div class="pa-card-header">
                            <div class="pa-card-type-row">
                                <span class="pa-card-type-badge" :class="'pa-type-' + item.category">
                                    <i :class="item.icon"></i>
                                    {{ item.badgeLabel }}
                                </span>
                                <span class="pa-card-name">{{ item.displayName }}</span>
                            </div>
                            <div class="pa-card-time" :title="item.fullTime">
                                <i class="ri-time-line"></i>
                                <span>{{ item.formattedTime }}</span>
                            </div>
                        </div>

                        <!-- Status Section -->
                        <div v-if="item.status" class="pa-card-section pa-status-section">
                            <div class="pa-section-label">
                                <i class="ri-user-status-line"></i>
                                <span>Status</span>
                            </div>
                            <div class="pa-status-box">
                                <div class="pa-status-text">{{ item.status }}</div>
                                <div v-if="item.previousStatus" class="pa-prev-text">
                                    <span class="pa-prev-label">Previous:</span> {{ item.previousStatus }}
                                </div>
                            </div>
                        </div>

                        <!-- Bio Section -->
                        <div v-if="item.bio" class="pa-card-section pa-bio-section">
                            <div class="pa-section-label">
                                <i class="ri-file-text-line"></i>
                                <span>Bio</span>
                            </div>
                            <div class="pa-bio-box">
                                <div class="pa-bio-content">{{ item.bio }}</div>
                                <div v-if="item.previousBio" class="pa-prev-bio">
                                    <span class="pa-prev-label">Previous Bio:</span>
                                    <div class="pa-prev-bio-content">{{ item.previousBio }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { getCtx } from './runtime';
import { getCombinedUserHistory, backfillFromFeed } from './db';

const searchQuery = ref('');
const selectedUserId = ref('');
const timelineItems = ref([]);
const loading = ref(false);
const filterType = ref('all');
const sortOrder = ref('desc');
const dropdownOpen = ref(false);
const isBackfilling = ref(false);

const friendsList = computed(() => {
    try {
        const ctx = getCtx();
        const map = ctx.stores.friends.friends;
        if (!map) return [];
        const result = [];
        for (const [id, friendObj] of map.entries()) {
            const ref = friendObj?.ref || friendObj;
            result.push({
                id,
                displayName: ref?.displayName || friendObj?.name || id,
                status: ref?.status || 'offline',
                statusDescription: ref?.statusDescription || '',
                bio: ref?.bio || '',
                avatarUrl: ref?.currentAvatarThumbnailImageUrl || ref?.userIcon || ''
            });
        }
        return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch {
        return [];
    }
});

const filteredFriends = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return friendsList.value.slice(0, 10);
    return friendsList.value
        .filter(
            (f) =>
                f.displayName.toLowerCase().includes(q) ||
                f.id.toLowerCase().includes(q)
        )
        .slice(0, 10);
});

const selectedUserObj = computed(() => {
    if (!selectedUserId.value) return null;
    return friendsList.value.find((f) => f.id === selectedUserId.value) || null;
});

const currentDisplayName = computed(() => {
    if (timelineItems.value.length > 0) {
        return timelineItems.value[0].display_name || timelineItems.value[0].displayName || '';
    }
    return '';
});

const bioCount = computed(() => {
    return timelineItems.value.filter((i) => (i.bio && i.bio.trim().length > 0) || i.type === 'bio').length;
});

const statusCount = computed(() => {
    return timelineItems.value.filter((i) => (i.status && i.status.trim().length > 0) || i.type === 'status').length;
});

const processedTimeline = computed(() => {
    let items = [...timelineItems.value];

    if (filterType.value === 'bio') {
        items = items.filter((i) => (i.bio && i.bio.trim().length > 0) || i.type === 'bio');
    } else if (filterType.value === 'status') {
        items = items.filter((i) => (i.status && i.status.trim().length > 0) || i.type === 'status');
    }

    if (sortOrder.value === 'asc') {
        items.sort((a, b) => new Date(a.created_at || a.createdAt).getTime() - new Date(b.created_at || b.createdAt).getTime());
    } else {
        items.sort((a, b) => new Date(b.created_at || b.createdAt).getTime() - new Date(a.created_at || a.createdAt).getTime());
    }

    return items.map((item) => {
        const dtStr = item.created_at || item.createdAt;
        const dt = new Date(dtStr);
        const formattedTime = !isNaN(dt.getTime())
            ? dt.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
              })
            : dtStr;

        let category = 'snapshot';
        let icon = 'ri-history-line';
        let badgeLabel = 'Snapshot';

        if (item.type === 'bio' || (item.bio && !item.status)) {
            category = 'bio';
            icon = 'ri-file-text-line';
            badgeLabel = 'Bio Update';
        } else if (item.type === 'status' || (item.status && !item.bio)) {
            category = 'status';
            icon = 'ri-user-status-line';
            badgeLabel = 'Status Update';
        } else if (item.bio && item.status) {
            category = 'profile';
            icon = 'ri-user-line';
            badgeLabel = 'Profile Update';
        }

        return {
            ...item,
            category,
            icon,
            badgeLabel,
            displayName: item.display_name || item.displayName || 'Unknown',
            formattedTime,
            fullTime: dtStr
        };
    });
});

function selectFriend(friend) {
    selectedUserId.value = friend.id;
    searchQuery.value = friend.displayName;
    dropdownOpen.value = false;
    loadHistory();
}

function onSearchInput() {
    const val = searchQuery.value.trim();
    if (val.startsWith('usr_')) {
        selectedUserId.value = val;
        loadHistory();
    }
}

function clearSelection() {
    searchQuery.value = '';
    selectedUserId.value = '';
    timelineItems.value = [];
    dropdownOpen.value = false;
}

async function loadHistory() {
    if (!selectedUserId.value) {
        timelineItems.value = [];
        return;
    }

    loading.value = true;
    try {
        const ctx = getCtx();
        const items = await getCombinedUserHistory(ctx, selectedUserId.value);
        timelineItems.value = items;
    } catch (err) {
        try {
            getCtx().error('Failed to load user history:', err);
        } catch {}
    } finally {
        loading.value = false;
    }
}

async function runBackfill() {
    isBackfilling.value = true;
    try {
        const ctx = getCtx();
        await backfillFromFeed(ctx, selectedUserId.value || null);
        if (selectedUserId.value) {
            await loadHistory();
        }
    } catch (err) {
        try {
            getCtx().error('Backfill error:', err);
        } catch {}
    } finally {
        isBackfilling.value = false;
    }
}

function openUserProfile(userId) {
    if (!userId) return;
    try {
        getCtx().ui.showUserDialog(userId);
    } catch (err) {
        console.error('Failed to open user dialog:', err);
    }
}

onMounted(() => {
    if (selectedUserId.value) {
        loadHistory();
    }
});
</script>

<style scoped>
.pa-container {
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.6) 0%, rgba(30, 41, 59, 0.4) 100%);
    color: #f8fafc;
    font-family: inherit;
    box-sizing: border-box;
}

/* Header */
.pa-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}
.pa-header-title {
    display: flex;
    align-items: center;
    gap: 14px;
}
.pa-icon-wrapper {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}
.pa-header-icon {
    font-size: 24px;
    color: #ffffff;
}
.pa-title {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
}
.pa-subtitle {
    margin: 2px 0 0 0;
    font-size: 13px;
    color: #94a3b8;
}

/* Buttons */
.pa-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
}
.pa-btn-secondary {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.12);
}
.pa-btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
}
.pa-btn-primary {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #ffffff;
}
.pa-btn-primary:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
}
.pa-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Search Section */
.pa-search-section {
    position: relative;
    margin-bottom: 12px;
}
.pa-search-wrapper {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 0 14px;
    transition: border-color 0.2s ease;
}
.pa-search-wrapper:focus-within {
    border-color: #8b5cf6;
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
}
.pa-search-icon {
    font-size: 18px;
    color: #64748b;
    margin-right: 10px;
}
.pa-search-input {
    flex: 1;
    height: 42px;
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 14px;
}
.pa-search-clear {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 18px;
    cursor: pointer;
    padding: 4px;
}
.pa-search-clear:hover {
    color: #ffffff;
}

/* Dropdown */
.pa-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 6px;
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    max-height: 280px;
    overflow-y: auto;
    z-index: 100;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}
.pa-dropdown-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.15s ease;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.pa-dropdown-item:last-child {
    border-bottom: none;
}
.pa-dropdown-item:hover,
.pa-dropdown-item--selected {
    background: rgba(139, 92, 246, 0.2);
}
.pa-dropdown-avatar,
.pa-dropdown-avatar-placeholder {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    object-fit: cover;
}
.pa-dropdown-avatar-placeholder {
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
}
.pa-dropdown-info {
    flex: 1;
}
.pa-dropdown-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 13px;
    color: #f1f5f9;
}
.pa-dropdown-id {
    font-size: 11px;
    color: #64748b;
}

/* Quick Chips */
.pa-quick-chips {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
}
.pa-quick-label {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
}
.pa-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.pa-chip:hover {
    background: rgba(255, 255, 255, 0.12);
}
.pa-chip--active {
    background: rgba(139, 92, 246, 0.3);
    border-color: #8b5cf6;
    color: #ffffff;
    font-weight: 600;
}

/* Status dots */
.pa-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
}
.pa-status-active { background-color: #22c55e; }
.pa-status-joinme { background-color: #06b6d4; }
.pa-status-askme { background-color: #f59e0b; }
.pa-status-busy { background-color: #ef4444; }
.pa-status-offline { background-color: #64748b; }

/* User Card */
.pa-user-card {
    background: rgba(255, 255, 255, 0.04);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 16px;
    margin-bottom: 20px;
}
.pa-user-card-body {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 14px;
}
.pa-user-avatar,
.pa-user-avatar-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(139, 92, 246, 0.4);
}
.pa-user-avatar-placeholder {
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: #94a3b8;
}
.pa-user-details {
    flex: 1;
}
.pa-user-name-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-user-name {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
}
.pa-badge {
    padding: 3px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
}
.pa-user-id-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
}
.pa-user-id {
    font-size: 12px;
    color: #94a3b8;
    font-family: monospace;
}
.pa-link-btn {
    background: transparent;
    border: none;
    color: #8b5cf6;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
}
.pa-link-btn:hover {
    text-decoration: underline;
}
.pa-stat-box {
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 16px;
    border-radius: 10px;
    text-align: center;
}
.pa-stat-num {
    display: block;
    font-size: 18px;
    font-weight: 700;
    color: #8b5cf6;
}
.pa-stat-label {
    font-size: 11px;
    color: #94a3b8;
}

/* Filter Bar */
.pa-filter-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 12px;
    flex-wrap: wrap;
    gap: 10px;
}
.pa-filter-tabs {
    display: flex;
    gap: 6px;
}
.pa-filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
}
.pa-filter-btn:hover {
    color: #ffffff;
}
.pa-filter-btn--active {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
    color: #ffffff;
    font-weight: 600;
}
.pa-sort-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 12px;
    cursor: pointer;
}
.pa-sort-btn:hover {
    color: #ffffff;
}

/* Timeline Wrapper */
.pa-timeline-wrapper {
    flex: 1;
    position: relative;
    padding-top: 8px;
}

/* State Cards */
.pa-state-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px dashed rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 40px 20px;
    text-align: center;
    color: #94a3b8;
}
.pa-state-icon {
    font-size: 44px;
    color: #64748b;
    margin-bottom: 12px;
}
.pa-state-card h3 {
    margin: 0 0 8px 0;
    color: #f1f5f9;
}

.pa-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #8b5cf6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px auto;
}

/* Vertical Timeline */
.pa-timeline {
    position: relative;
    padding-left: 28px;
}
.pa-timeline::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 10px;
    bottom: 10px;
    width: 2px;
    background: linear-gradient(180deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
    border-radius: 2px;
}

.pa-timeline-item {
    position: relative;
    margin-bottom: 20px;
}
.pa-timeline-node {
    position: absolute;
    left: -28px;
    top: 14px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    z-index: 2;
}
.pa-node-bio {
    background: linear-gradient(135deg, #10b981, #06b6d4);
}
.pa-node-status {
    background: linear-gradient(135deg, #8b5cf6, #ec4899);
}
.pa-node-profile {
    background: linear-gradient(135deg, #f59e0b, #ef4444);
}
.pa-node-snapshot {
    background: linear-gradient(135deg, #6366f1, #3b82f6);
}

/* Timeline Card */
.pa-timeline-card {
    background: rgba(30, 41, 59, 0.5);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    transition: transform 0.2s ease, border-color 0.2s ease;
}
.pa-timeline-card:hover {
    transform: translateX(3px);
    border-color: rgba(255, 255, 255, 0.18);
}

.pa-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}
.pa-card-type-row {
    display: flex;
    align-items: center;
    gap: 10px;
}
.pa-card-type-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #ffffff;
}
.pa-type-bio {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}
.pa-type-status {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
}
.pa-type-profile {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
}
.pa-type-snapshot {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
}
.pa-card-name {
    font-weight: 600;
    font-size: 13px;
    color: #e2e8f0;
}
.pa-card-time {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #94a3b8;
}

.pa-card-section {
    margin-top: 10px;
}
.pa-section-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.pa-status-box {
    background: rgba(15, 23, 42, 0.6);
    border-radius: 8px;
    padding: 10px 12px;
    border-left: 3px solid #8b5cf6;
}
.pa-status-text {
    font-size: 13px;
    color: #f8fafc;
    font-weight: 500;
}
.pa-prev-text {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
}
.pa-prev-label {
    font-weight: 600;
}

.pa-bio-box {
    background: rgba(15, 23, 42, 0.6);
    border-radius: 8px;
    padding: 12px;
    border-left: 3px solid #10b981;
}
.pa-bio-content {
    font-size: 13px;
    color: #f1f5f9;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    font-family: inherit;
}
.pa-prev-bio {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
    font-size: 11px;
    color: #64748b;
}
.pa-prev-bio-content {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    color: #94a3b8;
    margin-top: 2px;
}

.pa-spin {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
</style>
